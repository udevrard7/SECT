// Package worker — adapter Mistral Voxtral TTS (API Voxtral 3) pour la
// synthèse vocale des podcasts.
//
// VOXTRAL-TTS-1 / VOXTRAL-TTS-2 / SECT-TTS-3.
//
// MIGRATION VOXTRAL 3 (mesurée en réel, 2026-10) : l'API historique
// « voxtral-mini-tts-latest + voix nommées (lea…) » est MORTE — les voix
// nommées renvoient 404 « Voice 'lea' not found » et l'URL de ref_audio
// par défaut (Space Neuphonic) sert désormais du JSON. L'intégration est
// reconstruite sur l'API Voxtral 3 :
//
//	POST {baseUrl}/audio/speech
//	Body : {"model":"voxtral-mini-tts-3-0",
//	        "input":"texte",
//	        "voice_id":"voice_592",          // presets VOXTRAL 3
//	        "response_format":"mp3"}
//	      ou {"ref_audio":"<base64 MP3/WAV>"} // clonage zéro-shot (inchangé)
//	Response : JSON {"audio_data":"<base64>"}.
//
// Presets français Voxtral 3 (docs « Voices », testés 200) :
//   - voice_592  Marie   — voix de référence
//   - voice_3137 Manon   — duo podcast par défaut (animation)
//   - voice_589  Lea
//   - voice_3141 Camille
//
// Les alias Voxtral 2 (fr_marie_neutral…) restent acceptés.
//
// MULTI-VOIX : si le provider a deux ref_audio configurés (extraConfig
// refAudioPresenter + refAudioExpert), chaque réplique est synthétisée
// avec la voix clonée correspondante (Présentateur ↔ Expert) et les
// segments MP3 sont concaténés (tts.ConcatMP3). Sans ref_audio : duo de
// PRESETS français (Manon animation + Marie expert).
//
// ⚠️ RÔLE (SECT-TTS-3) : Voxtral est PAYANT au caractère (~13 $/M chars,
// quotas par minute) — c'est une OPTION PREMIUM explicite (extraConfig
// useForPodcasts=true ou ref_audio configurés), JAMAIS le défaut. Le
// défaut des podcasts est la chaîne 0 coût (internal/tts/podcast.go).
package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/tts"
)

// Presets français Voxtral 3 (liste blanche serveur — cf docs « Voices »).
const (
	voxtralModeleDefaut     = "voxtral-mini-tts-3-0"
	voxtralVoixDefaut       = "voice_592"  // Marie — expert
	voxtralVoixAnimateur    = "voice_3137" // Manon — animation
	voxtralLimiteCaracteres = 8000
)

// voxtralOptIn — le provider TTS Voxtral est-il EXPLICITEMENT activé pour
// les podcasts ? Deux signaux d'intention (l'un suffit) :
//   - extraConfig {"useForPodcasts":true} — activation franche ;
//   - refAudioPresenter/refAudioExpert configurés — l'exploitant a posé
//     ses propres voix clonées (démarche premium délibérée).
//
// Sans aucun des deux : la chaîne 0 coût reste seule (défaut 0 €).
func voxtralOptIn(extraConfig string) bool {
	if extraConfig == "" {
		return false
	}
	var cfg struct {
		UseForPodcasts    bool   `json:"useForPodcasts"`
		RefAudioPresenter string `json:"refAudioPresenter"`
		RefAudioExpert    string `json:"refAudioExpert"`
	}
	if err := json.Unmarshal([]byte(extraConfig), &cfg); err != nil {
		return false
	}
	return cfg.UseForPodcasts || (cfg.RefAudioPresenter != "" && cfg.RefAudioExpert != "")
}

// callVoxtralTTS synthétise un script de podcast via Voxtral 3.
// Retourne un *tts.Result (Provider "voxtral" — audio MP3 ou WAV selon
// la réponse, magic bytes reniflés).
func callVoxtralTTS(ctx context.Context, provider *ai.ActiveProvider, script string, logger *slog.Logger) (*tts.Result, error) {
	if len(script) == 0 {
		return nil, fmt.Errorf("script vide")
	}
	input := script
	if len(input) > voxtralLimiteCaracteres {
		input = input[:voxtralLimiteCaracteres]
		logger.Warn("Script podcast tronqué (limite Voxtral)", "longueurOriginale", len(script))
	}

	refPresenterURL, refExpertURL := parseVoxtralExtraConfig(provider.ExtraConfig)
	if logger != nil {
		logger.Info("Voxtral (podcast premium)",
			"model", modeled(provider),
			"refPresenter", refPresenterURL != "",
			"refExpert", refExpertURL != "",
		)
	}

	// Multi-voix : clonage (2 ref_audio)…
	if refPresenterURL != "" && refExpertURL != "" {
		return callVoxtralMultiVoice(ctx, provider, input, refPresenterURL, refExpertURL, logger)
	}

	// …ou preset duo français ; à défaut (une seule ref_audio) : voix
	// unique clonée, sinon preset Marie.
	return callVoxtralDuoPresets(ctx, provider, input, refPresenterURL, refExpertURL, logger)
}

// callVoxtralDuoPresets — dialogue Présentateur/Expert avec deux PRESETS
// français (Manon + Marie) ; voix unique si le script n'a pas de
// marqueurs, ou si l'exploitant a posé UNE ref_audio (clonage unique).
func callVoxtralDuoPresets(ctx context.Context, provider *ai.ActiveProvider, script, refPresenterURL, refExpertURL string, logger *slog.Logger) (*tts.Result, error) {
	segments := parseScriptBySpeaker(script)
	if logger != nil {
		logger.Info("Voxtral : script analysé",
			"repliques", len(segments),
			"animateur", countSegments(segments, "presentateur"),
			"expert", countSegments(segments, "expert"),
		)
	}

	// Une seule ref_audio configurée → voix unique clonée (rétro-compat).
	if refAudioURL := firstNonEmpty(refPresenterURL, refExpertURL); refAudioURL != "" {
		refB64, err := fetchAudioAsBase64(ctx, refAudioURL, logger)
		if err != nil {
			return nil, fmt.Errorf("fetch ref_audio: %w", err)
		}
		return callVoxtralAPI(ctx, provider, script, refB64, "", logger)
	}

	// Aucune ref_audio → duo de presets. Script sans marqueurs → voix
	// unique Marie (la mitraillette de requêtes ne sert à rien).
	if len(segments) == 0 {
		return callVoxtralAPI(ctx, provider, script, "", voxtralVoixDefaut, logger)
	}

	var mp3s [][]byte
	for i, seg := range segments {
		if strings.TrimSpace(seg.Text) == "" {
			continue
		}
		voix := voxtralVoixDefaut
		if seg.Speaker == "presentateur" {
			voix = voxtralVoixAnimateur
		}
		res, err := callVoxtralAPI(ctx, provider, seg.Text, "", voix, logger)
		if err != nil {
			return nil, fmt.Errorf("réplique %d/%d (voix %s): %w", i+1, len(segments), voix, err)
		}
		if res.ContentType != "audio/mpeg" {
			return nil, fmt.Errorf("réplique %d: format inattendu %s (Voxtral)", i+1, res.ContentType)
		}
		mp3s = append(mp3s, res.Audio)
	}
	if len(mp3s) == 0 {
		return nil, fmt.Errorf("aucune réplique synthétisée (Voxtral)")
	}

	return &tts.Result{
		Audio:       tts.ConcatMP3(mp3s),
		ContentType: "audio/mpeg",
		Provider:    "voxtral",
		Model:       modeled(provider) + " (duo " + voxtralVoixAnimateur + "+" + voxtralVoixDefaut + ")",
	}, nil
}

// callVoxtralMultiVoice génère un podcast multi-voix en parsant le script
// par speaker (Présentateur / Expert) avec un ref_audio cloné par speaker.
func callVoxtralMultiVoice(ctx context.Context, provider *ai.ActiveProvider, script, refPresenterURL, refExpertURL string, logger *slog.Logger) (*tts.Result, error) {
	if logger != nil {
		logger.Info("Voxtral : téléchargement des ref_audios (clonage multi-voix)")
	}

	refPresenterB64, err := fetchAudioAsBase64(ctx, refPresenterURL, logger)
	if err != nil {
		return nil, fmt.Errorf("fetch presenter ref_audio: %w", err)
	}
	refExpertB64, err := fetchAudioAsBase64(ctx, refExpertURL, logger)
	if err != nil {
		return nil, fmt.Errorf("fetch expert ref_audio: %w", err)
	}

	segments := parseScriptBySpeaker(script)
	if len(segments) == 0 {
		// Pas de speaker détecté → voix unique clonée.
		if logger != nil {
			logger.Warn("Voxtral : aucun marqueur de locuteur — voix unique clonée")
		}
		return callVoxtralAPI(ctx, provider, script, refPresenterB64, "", logger)
	}

	var mp3s [][]byte
	for i, seg := range segments {
		if strings.TrimSpace(seg.Text) == "" {
			continue
		}
		refB64 := refPresenterB64
		voix := "clone:presentateur"
		if seg.Speaker == "expert" {
			refB64 = refExpertB64
			voix = "clone:expert"
		}
		if logger != nil {
			logger.Info("Voxtral : réplique",
				"index", i+1, "total", len(segments), "voix", voix, "longueur", len(seg.Text))
		}
		res, err := callVoxtralAPI(ctx, provider, seg.Text, refB64, "", logger)
		if err != nil {
			return nil, fmt.Errorf("réplique %d/%d (%s): %w", i+1, len(segments), voix, err)
		}
		if res.ContentType != "audio/mpeg" {
			return nil, fmt.Errorf("réplique %d: format inattendu %s (Voxtral)", i+1, res.ContentType)
		}
		mp3s = append(mp3s, res.Audio)
	}
	if len(mp3s) == 0 {
		return nil, fmt.Errorf("aucune réplique synthétisée (Voxtral)")
	}

	return &tts.Result{
		Audio:       tts.ConcatMP3(mp3s),
		ContentType: "audio/mpeg",
		Provider:    "voxtral",
		Model:       modeled(provider) + " (clones présentateur+expert)",
	}, nil
}

// callVoxtralAPI fait l'appel HTTP à l'API Voxtral 3 pour un texte, avec
// au choix un ref_audio cloné (base64) OU une voice_id preset.
// Retourne les octets audio + leur content-type réel (magic bytes).
func callVoxtralAPI(ctx context.Context, provider *ai.ActiveProvider, text, refAudioB64, voiceID string, logger *slog.Logger) (*tts.Result, error) {
	model := modeled(provider)

	body := map[string]interface{}{
		"model":           model,
		"input":           text,
		"response_format": "mp3", // stockage R2 compact (WAV ≈ 5× plus gros)
	}
	if refAudioB64 != "" {
		body["ref_audio"] = refAudioB64
	} else if voiceID != "" {
		body["voice_id"] = voiceID
	} else {
		body["voice_id"] = voxtralVoixDefaut
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal voxtral request: %w", err)
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/audio/speech"
	if logger != nil {
		logger.Info("Appel Mistral Voxtral TTS",
			"url", url, "model", model,
			"mode", map[bool]string{true: "ref_audio", false: "voice_id"}[refAudioB64 != ""],
			"voiceId", voiceID,
			"longueur", len(text))
	}

	httpCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	req, err := newHTTPRequest(httpCtx, "POST", url, bodyJSON, provider.APIKey)
	if err != nil {
		return nil, fmt.Errorf("create voxtral request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("voxtral request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != 200 {
		var errResp struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		if errResp.Message != "" {
			return nil, fmt.Errorf("voxtral HTTP %d: %s (%s)", resp.StatusCode, errResp.Message, errResp.Code)
		}
		return nil, fmt.Errorf("voxtral returned HTTP %d", resp.StatusCode)
	}

	// Voxtral retourne du JSON : {"audio_data":"<base64>"}.
	var ttsResp struct {
		AudioData string `json:"audio_data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ttsResp); err != nil {
		return nil, fmt.Errorf("decode voxtral response: %w", err)
	}
	if ttsResp.AudioData == "" {
		return nil, fmt.Errorf("voxtral returned empty audio_data")
	}

	audioBytes, err := base64.StdEncoding.DecodeString(ttsResp.AudioData)
	if err != nil {
		return nil, fmt.Errorf("decode voxtral base64 audio: %w", err)
	}
	if len(audioBytes) == 0 {
		return nil, fmt.Errorf("voxtral returned empty audio after decode")
	}

	ct := "audio/mpeg"
	if len(audioBytes) > 12 && string(audioBytes[0:4]) == "RIFF" && string(audioBytes[8:12]) == "WAVE" {
		ct = "audio/wav"
	}
	return &tts.Result{Audio: audioBytes, ContentType: ct, Provider: "voxtral", Model: model}, nil
}

// modeled résout le modèle Voxtral (défaut : Voxtral 3 explicite —
// l'alias -latest ne pointera vers Voxtral 3 qu'après un mois de GA).
func modeled(provider *ai.ActiveProvider) string {
	if provider != nil && strings.TrimSpace(provider.Model) != "" {
		return provider.Model
	}
	return voxtralModeleDefaut
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// parseVoxtralExtraConfig extrait les URLs des ref_audio depuis le JSON
// extraConfig. Format : {"refAudioPresenter":"https://…","refAudioExpert":"https://…"}.
func parseVoxtralExtraConfig(extraConfig string) (string, string) {
	if extraConfig == "" {
		return "", ""
	}
	var cfg struct {
		RefAudioPresenter string `json:"refAudioPresenter"`
		RefAudioExpert    string `json:"refAudioExpert"`
	}
	if err := json.Unmarshal([]byte(extraConfig), &cfg); err != nil {
		return "", ""
	}
	return cfg.RefAudioPresenter, cfg.RefAudioExpert
}

// scriptSegment représente un segment de script attribué à un speaker.
type scriptSegment struct {
	Speaker string // "presentateur" ou "expert"
	Text    string
}

// parseScriptBySpeaker découpe un script podcast en segments par speaker
// (format imposé par buildPodcastPrompt) :
//
//	Présentateur : Bonjour et bienvenue…
//	<ligne vide>
//	Expert : Bonjour ! Ravis d'être ici…
//
// Les lignes continues (sans marker) sont rattachées au speaker courant.
func parseScriptBySpeaker(script string) []scriptSegment {
	lines := strings.Split(script, "\n")
	var segments []scriptSegment
	var currentSpeaker string
	var currentText strings.Builder

	flushCurrent := func() {
		if currentSpeaker != "" && currentText.Len() > 0 {
			segments = append(segments, scriptSegment{
				Speaker: currentSpeaker,
				Text:    strings.TrimSpace(currentText.String()),
			})
		}
		currentSpeaker = ""
		currentText.Reset()
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			flushCurrent()
			continue
		}

		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "présentateur") || strings.HasPrefix(lower, "presentateur") {
			flushCurrent()
			currentSpeaker = "presentateur"
			if idx := strings.Index(trimmed, ":"); idx >= 0 {
				currentText.WriteString(strings.TrimSpace(trimmed[idx+1:]))
			}
		} else if strings.HasPrefix(lower, "expert") {
			flushCurrent()
			currentSpeaker = "expert"
			if idx := strings.Index(trimmed, ":"); idx >= 0 {
				currentText.WriteString(strings.TrimSpace(trimmed[idx+1:]))
			}
		} else if currentSpeaker != "" {
			if currentText.Len() > 0 {
				currentText.WriteString(" ")
			}
			currentText.WriteString(trimmed)
		}
	}
	flushCurrent()

	return segments
}

// countSegments compte les segments pour un speaker donné.
func countSegments(segments []scriptSegment, speaker string) int {
	count := 0
	for _, s := range segments {
		if s.Speaker == speaker {
			count++
		}
	}
	return count
}

// fetchAudioAsBase64 télécharge un fichier audio depuis une URL et le
// retourne en base64 (format attendu par l'API Voxtral).
func fetchAudioAsBase64(ctx context.Context, audioURL string, logger *slog.Logger) (string, error) {
	if logger != nil {
		logger.Info("Fetching ref_audio", "url", audioURL)
	}

	dlCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	req, err := newHTTPRequest(dlCtx, "GET", audioURL, nil, "")
	if err != nil {
		return "", fmt.Errorf("create ref_audio request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch ref_audio: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("ref_audio HTTP %d", resp.StatusCode)
	}

	// FIX (audit 2025): limiter la lecture à 50 MiB pour empêcher OOM si
	// l'URL est compromise.
	audioBytes, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20))
	if err != nil {
		return "", fmt.Errorf("read ref_audio: %w", err)
	}
	if len(audioBytes) == 0 {
		return "", fmt.Errorf("ref_audio empty")
	}

	// SECT-TTS-3 : l'ancienne URL par défaut (Space Neuphonic) sert
	// désormais du JSON — refuser un « audio » qui n'est ni RIFF ni ID3
	// ni MPEG brut (échec précoce et clair plutôt qu'un 400 opaque de
	// l'API Mistral).
	if !ressembleAudio(audioBytes) {
		return "", fmt.Errorf("ref_audio invalide (ni WAV ni MP3) — vérifiez l'URL configurée")
	}

	b64 := base64.StdEncoding.EncodeToString(audioBytes)
	if logger != nil {
		logger.Info("Ref_audio fetched", "bytes", len(audioBytes), "b64len", len(b64))
	}
	return b64, nil
}

// ressembleAudio — reniflage magic bytes : RIFF/WAVE, ID3v2, frame MPEG.
func ressembleAudio(b []byte) bool {
	if len(b) < 4 {
		return false
	}
	if string(b[0:4]) == "RIFF" {
		return true
	}
	if string(b[0:3]) == "ID3" {
		return true
	}
	return b[0] == 0xFF && b[1]&0xE0 == 0xE0
}
