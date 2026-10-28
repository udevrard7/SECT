// Package tts — synthèse vocale de la lecture bibliothèque (SECT-TTS-1).
//
// OBJECTIF 0 COÛT : la chaîne n'utilise QUE des fournisseurs dont la clé
// est DÉJÀ en base (AIProviderConfig) et dont l'offre inclut un TTS
// gratuit :
//
//  1. GEMINI TTS (primaire) — « studio-grade voice fidelity, expressive
//     acting, long-form stability », 30 voix studio pré-construites,
//     français natif. La clé est celle du provider chat GOOGLE déjà
//     configuré (gemini-provider-001) : AI Studio niveau gratuit. Le
//     modèle exact est DÉCOUVERT au premier appel via l'endpoint
//     /models (flash préféré, version la plus haute) puis mémoïsé pour
//     la durée de vie de l'instance — robuste aux renommages de modèles
//     preview.
//
//  2. CLOUDFLARE MELOTTS (secours) — @cf/myshell-ai/melotts, français
//     supporté (lang=fr), quota gratuit généreux (neurons/jour). La clé
//     est celle du provider chat CLOUDFLARE déjà configuré. Voix unique
//     (moins « humaine » que Gemini) mais indépendante de Google : si
//     Gemini est saturé (429) ou indisponible, la lecture continue.
//
// Le provider VOXTRAL (Mistral, payant au caractère — déjà utilisé pour
// les podcasts) est VOLONTAIREMENT exclu de cette chaîne : garantir le
// 0 coût veut dire qu'aucune lecture vocale ne peut déclencher une
// facturation. Les podcasts restent inchangés (worker audio dédié).
//
// ANTI-ABUS (protéger les quotas gratuits) :
//   - sémaphore global (3 synthèses concurrentes max) ;
//   - rate-limit par utilisateur (15 requêtes/minute) ;
//   - cooldown par provider en échec (10 min, 3 min sur 429) — un
//     provider qui vient d'échouer n'est pas retenté à chaque page.
//
// Le texte ne sort JAMAIS du serveur vers le client : l'API ne renvoie
// que des octets audio (jamais le texte extrait du PDF — posture
// SECT-BIBLIO-14/15 : zéro égress textuel, même authentifié).
package tts

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ──────────────────────────────────────────────────────────────────────────
// Voix studio (Gemini TTS) — 30 pré-construites disponibles ; les 10
// ci-dessous sont proposées à la lecture (couverture féminine/masculine,
// registres variés). Liste BLANCHE : toute autre valeur → Kore (défaut).
// ──────────────────────────────────────────────────────────────────────────

var voixStudio = map[string]string{
	"kore":       "Kore",
	"puck":       "Puck",
	"zephyr":     "Zephyr",
	"charon":     "Charon",
	"leda":       "Leda",
	"fenrir":     "Fenrir",
	"aoede":      "Aoede",
	"orus":       "Orus",
	"callirrhoe": "Callirrhoe",
	"sadaltager": "Sadaltager",
}

// VoixStudio expose la liste triée (validation/documentation — le choix
// reste libre côté client, le serveur blanchit toute valeur inconnue).
func VoixStudio() []string {
	out := make([]string, 0, len(voixStudio))
	for k := range voixStudio {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// normaliserVoix retourne le nom de voix Gemini canonique (Kore par défaut).
func normaliserVoix(voice string) string {
	if v, ok := voixStudio[strings.ToLower(strings.TrimSpace(voice))]; ok {
		return v
	}
	return "Kore"
}

// instructionVitesse traduit la vitesse demandée en consigne de jeu
// expressif (le modèle TTS Gemini se dirige en langage NATUREL — c'est
// le « expressive acting » de la perle : on ne déforme pas l'audio, on
// dirige l'interprète).
func instructionVitesse(vitesse float64) string {
	switch {
	case vitesse <= 0.87:
		return "Lis ce passage posément, à un rythme lent et calme, avec une diction très claire.\n\n"
	case vitesse >= 1.1:
		return "Lis ce passage avec un rythme naturel et légèrement soutenu.\n\n"
	default:
		return ""
	}
}

// bornesVitesse — la vitesse est bornée côté serveur (garde anti-abus :
// des valeurs extrêmes ne servent qu'à stresser le quota gratuit).
func bornesVitesse(v float64) float64 {
	if v < 0.75 {
		return 0.75
	}
	if v > 1.25 {
		return 1.25
	}
	return v
}

// ──────────────────────────────────────────────────────────────────────────
// Résultat
// ──────────────────────────────────────────────────────────────────────────

// Result — octets audio prêts à être servis au navigateur.
type Result struct {
	Audio       []byte
	ContentType string // "audio/wav" (Gemini PCM encapsulé) | "audio/mpeg" (MeloTTS)
	Provider    string // "gemini" | "melotts"
	Model       string // modèle effectivement utilisé (observabilité)
}

// ──────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────

// Service — chaîne de synthèse 0 coût avec cooldowns et anti-abus.
type Service struct {
	dbPool *pgxpool.Pool
	logger *slog.Logger
	client *http.Client

	mu        sync.Mutex
	cooldowns map[string]time.Time // clé provider ("gemini"|"melotts") → jusqu'à

	geminiMu        sync.Mutex
	geminiModelMemo string // modèle découvert (durée de vie de l'instance)

	synthMu chan struct{} // sémaphore : 3 synthèses concurrentes max

	rlMu   sync.Mutex
	rlReqs map[string][]time.Time // userID → horodatages (fenêtre 60 s)
}

// NewService construit le service TTS.
func NewService(dbPool *pgxpool.Pool, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		dbPool:    dbPool,
		logger:    logger,
		client:    &http.Client{Timeout: 2 * time.Minute},
		cooldowns: make(map[string]time.Time),
		synthMu:   make(chan struct{}, 3),
		rlReqs:    make(map[string][]time.Time),
	}
}

// SyntheseLecture — chaîne Gemini → MeloTTS. userID sert au rate-limit
// (pas de journalisation persistante : la lecture orale est un acte de
// lecture comme un autre, audité en amont par le usecase comme /flux).
func (s *Service) SyntheseLecture(ctx context.Context, text, voice, vitesse, userID string) (*Result, error) {
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("texte vide")
	}

	// Rate-limit par utilisateur (15/min) — protège les quotas gratuits
	// d'un client qui bouclerait sur les pages.
	if !s.autorise(userID) {
		return nil, fmt.Errorf("trop de requêtes de synthèse — patientez quelques secondes")
	}

	// Sémaphore global : 3 synthèses simultanées max (CPU/RAM bornés sur
	// l'instance, et cadence douce sur les APIs gratuites).
	select {
	case s.synthMu <- struct{}{}:
		defer func() { <-s.synthMu }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	v := bornesVitesse(parseVitesse(vitesse))

	// 1. Gemini (la perle) — si clé présente et pas en cooldown.
	if gem, ok := s.lireProviderRow(ctx, "GOOGLE"); ok {
		if !s.enCooldown("gemini") {
			res, err := s.syntheseGemini(ctx, gem, text, voice, v)
			if err == nil {
				return res, nil
			}
			s.marquerEchec("gemini", err)
			s.logger.Warn("TTS Gemini échec — bascule MeloTTS",
				"error", err.Error(), "textLen", len(text))
		} else {
			s.logger.Info("TTS Gemini en cooldown — essai MeloTTS direct")
		}
	}

	// 2. Cloudflare MeloTTS (secours indépendant de Google).
	if melo, ok := s.lireProviderRow(ctx, "CLOUDFLARE"); ok && !s.enCooldown("melotts") {
		res, err := s.syntheseMeloTTS(ctx, melo, text, v)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("melotts", err)
		s.logger.Warn("TTS MeloTTS échec",
			"error", err.Error(), "textLen", len(text))
	}

	return nil, fmt.Errorf("synthèse vocale indisponible (tous les fournisseurs gratuits ont échoué) — réessayez dans quelques minutes")
}

// ──────────────────────────────────────────────────────────────────────────
// Lecture des clés existantes (AIProviderConfig) — AUCUNE nouvelle ligne,
// AUCUNE migration : la clé Gemini est celle du provider chat GOOGLE déjà
// configuré par l'exploitant (rotation respectée : lecture à chaque
// requête). isActive=false → provider volontairement désactivé par
// l'exploitant → sauté (il peut couper Gemini ou Cloudflare ainsi).
// ──────────────────────────────────────────────────────────────────────────

type providerRow struct {
	apiKey  string
	baseURL string
}

func (s *Service) lireProviderRow(ctx context.Context, provider string) (providerRow, bool) {
	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return providerRow{}, false
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Claims système worker (RLS sur AIProviderConfig — même discipline
	// que internal/ai/failover.go).
	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
		return providerRow{}, false
	}

	var row providerRow
	err = tx.QueryRow(ctx, `
                SELECT COALESCE("apiKey", ''), COALESCE("baseUrl", '')
                FROM "AIProviderConfig"
                WHERE "provider" = $1 AND "isActive" = true
                ORDER BY "priority" ASC
                LIMIT 1
        `, provider).Scan(&row.apiKey, &row.baseURL)
	if err != nil || row.apiKey == "" {
		return providerRow{}, false
	}
	_ = tx.Commit(ctx)
	return row, true
}

// ──────────────────────────────────────────────────────────────────────────
// Cooldowns (miroir simplifié de SECT-LATENCY-3/4 du service chat)
// ──────────────────────────────────────────────────────────────────────────

func (s *Service) enCooldown(provider string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cooldowns[provider]
	return ok && time.Now().Before(until)
}

func (s *Service) marquerEchec(provider string, err error) {
	d := 10 * time.Minute
	// 429 (quota/rate gratuit momentané) → cooldown court : la perle
	// reprend la main vite.
	if he, ok := err.(*httpError); ok && he.status == 429 {
		d = 3 * time.Minute
	}
	s.mu.Lock()
	s.cooldowns[provider] = time.Now().Add(d)
	s.mu.Unlock()
}

type httpError struct {
	status int
	body   string
}

func (e *httpError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.status, e.body)
}

// ──────────────────────────────────────────────────────────────────────────
// Anti-abus : rate-limit utilisateur (fenêtre glissante 60 s)
// ──────────────────────────────────────────────────────────────────────────

const rlMaxParMinute = 15

func (s *Service) autorise(userID string) bool {
	if userID == "" {
		return true // appel interne (aucun identifiant) — le sémaphore borne déjà
	}
	now := time.Now()
	s.rlMu.Lock()
	defer s.rlMu.Unlock()
	reqs := s.rlReqs[userID]
	// Purge de la fenêtre.
	garde := make([]time.Time, 0, rlMaxParMinute)
	for _, t := range reqs {
		if now.Sub(t) < time.Minute {
			garde = append(garde, t)
		}
	}
	if len(garde) >= rlMaxParMinute {
		s.rlReqs[userID] = garde
		return false
	}
	garde = append(garde, now)
	s.rlReqs[userID] = garde
	return true
}

// ──────────────────────────────────────────────────────────────────────────
// Gemini TTS (native REST generateContent — réponse AUDIO inline)
// ──────────────────────────────────────────────────────────────────────────

// racineGemini déduit l'API native depuis la baseUrl OpenAI-compat du
// provider chat ("https://…/v1beta/openai" → "https://…/v1beta").
var reSuffixeOpenAI = regexp.MustCompile(`/openai/?$`)

func racineGemini(baseURL string) string {
	root := strings.TrimRight(baseURL, "/")
	root = reSuffixeOpenAI.ReplaceAllString(root, "")
	if !strings.Contains(root, "http") {
		root = "https://generativelanguage.googleapis.com/v1beta"
	}
	return root
}

// modelesTTSStatiques — file de secours si la découverte échoue (réseau
// aside) : la première qui RÉPOND est mémoïsée. L'ordre suit la
// chronologie des modèles (le plus récent d'abord) ; un 404 immédiat
// passe à la suivante sans coût.
var modelesTTSStatiques = []string{
	"gemini-3.8-flash-tts",
	"gemini-3-flash-preview-tts",
	"gemini-2.5-flash-preview-tts",
	"gemini-2.5-flash-tts",
	"gemini-2.5-pro-preview-tts",
}

var reVersion = regexp.MustCompile(`gemini-(\d+(?:\.\d+)?)`)

// decouvrirModeleTTS liste les modèles du compte et choisit le meilleur
// TTS flash (version la plus haute — la perle « studio-grade »), mémoïsé.
func (s *Service) decouvrirModeleTTS(ctx context.Context, gem providerRow) string {
	s.geminiMu.Lock()
	if s.geminiModelMemo != "" {
		m := s.geminiModelMemo
		s.geminiMu.Unlock()
		return m
	}
	s.geminiMu.Unlock()

	root := racineGemini(gem.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", root+"/models?pageSize=200", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("x-goog-api-key", gem.apiKey)
	resp, err := s.client.Do(req)
	if err != nil {
		return ""
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != 200 {
		return ""
	}
	var list struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&list); err != nil {
		return ""
	}

	meilleur := ""
	var meilleurScore float64 = -1
	for _, m := range list.Models {
		nom := strings.TrimPrefix(m.Name, "models/")
		if !strings.Contains(nom, "tts") {
			continue
		}
		score := 0.0
		if strings.Contains(nom, "flash") {
			score += 100 // flash : rapide, généreux en quota gratuit
		}
		if mm := reVersion.FindStringSubmatch(nom); mm != nil {
			if v, err := strconv.ParseFloat(mm[1], 64); err == nil {
				score += v
			}
		}
		if score > meilleurScore {
			meilleurScore = score
			meilleur = nom
		}
	}

	if meilleur != "" {
		s.geminiMu.Lock()
		s.geminiModelMemo = meilleur
		s.geminiMu.Unlock()
		s.logger.Info("TTS Gemini : modèle découvert", "model", meilleur)
	}
	return meilleur
}

func (s *Service) syntheseGemini(ctx context.Context, gem providerRow, text, voice string, vitesse float64) (*Result, error) {
	modele := s.decouvrirModeleTTS(ctx, gem)

	// Corps : consigne d'interprétation (rythme) + texte à lire.
	payload := map[string]any{
		"contents": []any{
			map[string]any{
				"parts": []any{
					map[string]any{"text": instructionVitesse(vitesse) + text},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig": map[string]any{
				"voiceConfig": map[string]any{
					"prebuiltVoiceConfig": map[string]any{
						"voiceName": normaliserVoix(voice),
					},
				},
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	root := racineGemini(gem.baseURL)

	// Essayer le modèle découvert, puis la file statique (404 = modèle
	// renommé : on re-découvrira au prochain appel — la mémo n'est posée
	// que sur SUCCÈS de génération, pas de liste).
	candidats := make([]string, 0, len(modelesTTSStatiques)+1)
	if modele != "" {
		candidats = append(candidats, modele)
	}
	candidats = append(candidats, modelesTTSStatiques...)

	var dernierErr error
	for _, m := range candidats {
		url := root + "/models/" + m + ":generateContent"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", gem.apiKey)

		resp, err := s.client.Do(req)
		if err != nil {
			return nil, err
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
		_ = resp.Body.Close()
		if resp.StatusCode == 404 {
			dernierErr = &httpError{status: 404, body: "modèle " + m + " introuvable"}
			continue // modèle absent → suivant
		}
		if resp.StatusCode != 200 {
			return nil, &httpError{status: resp.StatusCode, body: strings.TrimSpace(string(raw[:min(len(raw), 300)]))}
		}

		var out struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						InlineData struct {
							MimeType string `json:"mimeType"`
							Data     string `json:"data"`
						} `json:"inlineData"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return nil, fmt.Errorf("décodage réponse Gemini: %w", err)
		}

		var mime, b64 string
	trouve:
		for _, c := range out.Candidates {
			for _, p := range c.Content.Parts {
				if p.InlineData.Data != "" {
					mime, b64 = p.InlineData.MimeType, p.InlineData.Data
					break trouve
				}
			}
		}
		if b64 == "" {
			return nil, fmt.Errorf("aucun audio renvoyé par Gemini (mime=%q, candidats=%d)", mime, len(out.Candidates))
		}

		pcm, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("décodage base64 Gemini: %w", err)
		}

		// Succès : mémoïser le modèle gagnant.
		s.geminiMu.Lock()
		s.geminiModelMemo = m
		s.geminiMu.Unlock()

		// Gemini renvoie du PCM brut (audio/L16; rate=24000) — le
		// navigateur ne joue pas du PCM nu : encapsulation WAV.
		rate := parseRateMime(mime)
		wav := encapsulerWAV(pcm, rate)

		return &Result{Audio: wav, ContentType: "audio/wav", Provider: "gemini", Model: m}, nil
	}
	return nil, fmt.Errorf("aucun modèle TTS Gemini disponible : %v", dernierErr)
}

// parseRateMime extrait la fréquence d'échantillonnage de
// "audio/L16;codec=pcm;rate=24000" (défaut 24 kHz).
func parseRateMime(mime string) int {
	for _, part := range strings.Split(mime, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "rate=") {
			if n, err := strconv.Atoi(strings.TrimPrefix(part, "rate=")); err == nil && n > 0 {
				return n
			}
		}
	}
	return 24000
}

// encapsulerWAV — en-tête RIFF/WAVE PCM 16 bits mono.
func encapsulerWAV(pcm []byte, rate int) []byte {
	taille := uint32(len(pcm))
	out := make([]byte, 44+len(pcm))
	copy(out, "RIFF")
	binary.LittleEndian.PutUint32(out[4:], 36+taille)
	copy(out[8:], "WAVE")
	copy(out[12:], "fmt ")
	binary.LittleEndian.PutUint32(out[16:], 16) // taille bloc fmt
	binary.LittleEndian.PutUint16(out[20:], 1)  // PCM
	binary.LittleEndian.PutUint16(out[22:], 1)  // mono
	binary.LittleEndian.PutUint32(out[24:], uint32(rate))
	binary.LittleEndian.PutUint32(out[28:], uint32(rate)*2) // débit octets
	binary.LittleEndian.PutUint16(out[32:], 2)              // alignement bloc
	binary.LittleEndian.PutUint16(out[34:], 16)             // bits/échantillon
	copy(out[36:], "data")
	binary.LittleEndian.PutUint32(out[40:], taille)
	copy(out[44:], pcm)
	return out
}

// ──────────────────────────────────────────────────────────────────────────
// Cloudflare MeloTTS (secours — natif /ai/run/@cf/myshell-ai/melotts)
// ──────────────────────────────────────────────────────────────────────────

var reCompteCF = regexp.MustCompile(`/accounts/([0-9a-fA-F]{16,64})/`)

func (s *Service) syntheseMeloTTS(ctx context.Context, cf providerRow, text string, vitesse float64) (*Result, error) {
	mm := reCompteCF.FindStringSubmatch(cf.baseURL)
	if mm == nil {
		return nil, fmt.Errorf("baseUrl Cloudflare sans identifiant de compte (%q)", cf.baseURL)
	}
	url := "https://api.cloudflare.com/client/v4/accounts/" + mm[1] + "/ai/run/@cf/myshell-ai/melotts"

	payload, err := json.Marshal(map[string]any{
		"prompt": text,
		"lang":   "fr",
		"speed":  vitesse,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cf.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if resp.StatusCode != 200 {
		return nil, &httpError{status: resp.StatusCode, body: strings.TrimSpace(string(raw[:min(len(raw), 300)]))}
	}

	var out struct {
		Success bool `json:"success"`
		Result  struct {
			Audio string `json:"audio"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("décodage MeloTTS: %w", err)
	}
	if !out.Success || out.Result.Audio == "" {
		return nil, fmt.Errorf("melotts sans audio (success=%v)", out.Success)
	}
	mp3, err := base64.StdEncoding.DecodeString(out.Result.Audio)
	if err != nil {
		return nil, fmt.Errorf("décodage base64 MeloTTS: %w", err)
	}
	// Mesuré en réel : MeloTTS renvoie un conteneur RIFF/WAVE (PCM), pas
	// du MP3 nu — sniffer les magic bytes pour étiqueter juste (le
	// navigateur joue les deux, mais un Content-Type exact évite tout
	// sniffing hasardeux et l'extension .wav du inline disposition).
	ct := "audio/mpeg"
	if len(mp3) > 12 && string(mp3[0:4]) == "RIFF" && string(mp3[8:12]) == "WAVE" {
		ct = "audio/wav"
	}
	return &Result{Audio: mp3, ContentType: ct, Provider: "melotts", Model: "@cf/myshell-ai/melotts"}, nil
}

// ──────────────────────────────────────────────────────────────────────────
// utilitaires
// ──────────────────────────────────────────────────────────────────────────

func parseVitesse(v string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil {
		return 1
	}
	return bornesVitesse(f)
}
