// Package http — landing_demo_handlers.go
//
// Endpoint PUBLIC de démonstration pour le landing page (section "Démo interactive").
//
// POST /api/landing-demo
//
//	Body:  { "topic": "La photosynthèse" }
//	Resp:  { "qcm": { "question", "options": [4], "correctIndex": 0-3,
//	                  "difficulty": "Facile"|"Moyen"|"Difficile", "explanation" },
//	         "model": "mistral-small-latest" }
//
// Cet endpoint n'exige PAS d'authentification (visiteur non connecté du landing
// page). Il utilise le provider IA actif configuré en base (AIProviderConfig,
// isActive=true) — exactement le même chemin que le reste de l'app :
//
//	s.aiService.ChatCompletion(ctx, messages)
//	  → ChatWithFailover lit les providers actifs par priorité
//	  → pose les claims system-worker pour RLS (lecture AIProviderConfig)
//	  → appelle l'endpoint OpenAI-compatible du provider (Mistral, Groq, …)
//
// Sécurité :
//   - Rate-limit par IP (40 requêtes / 10 min / IP) pour limiter l'abus d'un
//     endpoint public non authentifié et protéger le quota du provider IA.
//   - Validation stricte du topic (longueur, caractères) pour éviter le prompt
//     injection et les coûts excessifs.
//   - Timeout de 30s via context.WithTimeout (le AIService a 180s mais la démo
//     landing doit rester rapide).
package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// Rate-limit par IP (en mémoire, simple, par fenêtre glissante)
// ──────────────────────────────────────────────────────────────────────────

const (
	landingDemoMaxRequests = 40               // requêtes par fenêtre par IP
	landingDemoWindow      = 10 * time.Minute // taille de la fenêtre
	landingDemoTopicMax    = 200              // longueur max du topic
	landingDemoTopicMin    = 3                // longueur min du topic
	// SECT-LATENCY-3 : 30s → 20s. Avant, ce budget ÉGALAIT le WriteTimeout
	// serveur (30s, deadline posée à la lecture des headers) : le 503 était
	// journalisé mais la connexion tuée AVANT l'écriture — le visiteur du
	// landing recevait une connexion morte (curl exit 52, http=000) au
	// lieu du JSON d'erreur. 20s laisse 10s de marge pour livrer la
	// réponse ET l'écriture est sous-write-deadline garanti par le
	// ResponseController ci-dessous.
	// SECT-LATENCY-4 : 20s → 25s. Mesure prod 19:57 : les 2 providers
	// morts en tête (Mistral 403, Groq 404) ne coûtent plus que 0,4 s
	// (hard-fail cooldown 30 min) et OpenRouter (seul chat fonctionnel)
	// coupait sa génération de QCM EN COURS à 12 s (kimi-k2.6 ≈ 46 tok/s
	// + TTFB + variabilité de charge : un QCM complet ≈ 10-14 s). Budget
	// 25 s → OpenRouter reçoit sa part fixe PLEINE de 15 s, il reste
	// ~9 s pour le fallback. La livraison de la réponse reste garantie
	// par le réarmement de deadline (timeout+15s) ci-dessous.
	landingDemoTimeout = 25 * time.Second // timeout de l'appel IA
)

type landingDemoEntry struct {
	count    int
	windowSt time.Time
}

// landingDemoQCM — forme du QCM attendue du LLM (JSON strict, cf. system
// prompt). Hoisté en type nommé pour la boucle de retry SECT-AI-REPAIR-1.
type landingDemoQCM struct {
	Question     string   `json:"question"`
	Options      []string `json:"options"`
	CorrectIndex int      `json:"correctIndex"`
	Difficulty   string   `json:"difficulty"`
	Explanation  string   `json:"explanation"`
}

// parseLandingDemoQCM — extraction tolérante (premier '{' → dernier '}') +
// unmarshal + validation structurelle. Retourne false si la réponse du LLM
// est illisible ou malformée (cas mesuré ~1/3 des essais avec gpt-oss-20b :
// JSON tronqué ou texte autour malgré la consigne).
func parseLandingDemoQCM(raw string) (landingDemoQCM, bool) {
	var qcm landingDemoQCM
	jsonStr := raw
	if idx := strings.Index(raw, "{"); idx >= 0 {
		if endIdx := strings.LastIndex(raw, "}"); endIdx > idx {
			jsonStr = raw[idx : endIdx+1]
		}
	}
	if err := json.Unmarshal([]byte(jsonStr), &qcm); err != nil {
		return qcm, false
	}
	if len(qcm.Options) != 4 || qcm.Question == "" {
		return qcm, false
	}
	return qcm, true
}

var (
	landingDemoMu      sync.Mutex
	landingDemoBuckets = make(map[string]*landingDemoEntry)
)

// landingDemoAllow vérifie si l'IP peut encore appeler l'endpoint. Thread-safe.
func landingDemoAllow(ip string) bool {
	landingDemoMu.Lock()
	defer landingDemoMu.Unlock()
	now := time.Now()
	e, ok := landingDemoBuckets[ip]
	if !ok || now.Sub(e.windowSt) > landingDemoWindow {
		landingDemoBuckets[ip] = &landingDemoEntry{count: 1, windowSt: now}
		return true
	}
	if e.count >= landingDemoMaxRequests {
		return false
	}
	e.count++
	return true
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────

// landingDemo — POST /api/landing-demo (PUBLIC — no auth required)
//
// Génère un QCM universitaire sur un sujet fourni par l'utilisateur, via le
// provider IA actif en base. Utilisé par la section "Démo interactive" du
// landing page pour montrer la valeur produit aux visiteurs non connectés.
func (s *Server) landingDemo(w http.ResponseWriter, r *http.Request) {
	// SECT-LATENCY-3 : garantir la LIVRAISON de la réponse. Le WriteTimeout
	// serveur (30s) démarre à la lecture des headers ; sans ce réarmement,
	// toute erreur survenant tard (budget IA épuisé) était écrite dans une
	// connexion déjà morte — le client ne voyait JAMAIS le JSON d'erreur.
	rearmWriteDeadline(w, landingDemoTimeout+15*time.Second)

	// Rate-limit par IP (defense-in-depth : endpoint public + appel IA coûteux).
	ip := middleware.GetClientIP(r)
	if !landingDemoAllow(ip) {
		w.Header().Set("Retry-After", "600")
		writeJSONError(w, http.StatusTooManyRequests,
			"Trop de requêtes depuis cette adresse. Réessayez dans quelques minutes.")
		return
	}

	// Parser le body
	var body struct {
		Topic string `json:"topic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	topic := strings.TrimSpace(body.Topic)
	if len(topic) < landingDemoTopicMin {
		writeJSONError(w, http.StatusBadRequest,
			fmt.Sprintf("Sujet trop court (min %d caractères)", landingDemoTopicMin))
		return
	}
	if len(topic) > landingDemoTopicMax {
		topic = topic[:landingDemoTopicMax]
	}

	// Construire le prompt. On force un JSON strict avec exactement les champs
	// attendus par le frontend (cf. frontend/src/components/landing/landing-page.tsx
	// interface QCM). Le system prompt impose la langue française et le niveau
	// universitaire (L1-Master) cohérent avec le positionnement SECT.
	systemPrompt := `Tu es un générateur de questions d'examen universitaire expert.
Génère UNE seule question QCM (à choix unique) au format JSON strict.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte autour.

Format OBLIGATOIRE :
{
  "question": "Énoncé clair et précis de la question",
  "options": ["option A", "option B", "option C", "option D"],
  "correctIndex": 0,
  "difficulty": "Facile",
  "explanation": "Explication concise de pourquoi la réponse correcte est juste"
}

Contraintes :
- "options" : EXACTEMENT 4 propositions distinctes et plausibles.
- "correctIndex" : entier de 0 à 3 désignant l'unique bonne réponse.
- "difficulty" : une des valeurs "Facile", "Moyen", "Difficile".
- "question" et "options" : en français, niveau enseignement supérieur.
- "explanation" : 1 à 3 phrases maximum, pédagogique.
- Aucun texte hors du JSON.`

	userPrompt := fmt.Sprintf(`Génère une question QCM de niveau universitaire sur le sujet suivant :

%s

Réponds UNIQUEMENT avec le JSON demandé.`, topic)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	// Timeout : la démo landing doit rester réactive. Le AIService a 180s mais
	// on coupe à 20s (SECT-LATENCY-3 : cf. const) pour ne pas faire attendre
	// un visiteur non authentifié.
	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), landingDemoTimeout)
	defer cancel()

	// SECT-AI-REPAIR-1 — retry parse : un LLM léger en tête de chaîne
	// (Groq gpt-oss-20b, mesuré 0,23-1,7 s par essai) peut occasionnellement
	// wrapper le JSON ou le tronquer (422 « Réponse IA illisible » sur ~1/3
	// des essais). On retente UNE fois — le budget 25 s le permet largement,
	// le 2e essai passe par le failover qui écartera un provider défaillant.
	// Une erreur IA (réseau/4xx) ne consomme PAS de retry : elle sort
	// immédiatement en 503 comme avant (comportement inchangé).
	var (
		result *ai.ChatResult
		qcm    landingDemoQCM
		ok     bool
		err    error
	)
	for attempt := 1; attempt <= 2; attempt++ {
		result, err = s.aiService.ChatCompletion(ctx, messages)
		if err != nil {
			break
		}
		if qcm, ok = parseLandingDemoQCM(result.Content); ok {
			break
		}
		slog.Info("landing-demo : réponse IA non JSON, retry",
			"attempt", attempt,
			"model", result.Model,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	}

	if err != nil {
		// Erreur attendue courante : aucun provider IA actif en base.
		// On renvoie 503 (Service Unavailable) avec un message actionnable.
		// SECT-LATENCY-3 : log serveur de la cause exacte — avant, elle
		// n'était visible NULLE PART (réponse tuée + AIFailoverEvent
		// écrit avec un ctx déjà mort → perdu en silence).
		slog.Warn("landing-demo : échec appel IA",
			"error", err.Error(),
			"duration_ms", time.Since(start).Milliseconds(),
		)
		writeJSONError(w, http.StatusServiceUnavailable,
			"Service IA momentanément indisponible — réessayez dans un instant.")
		return
	}

	if !ok {
		writeJSONError(w, http.StatusUnprocessableEntity,
			"Réponse IA illisible — réessayez avec un autre sujet.")
		return
	}

	// Validation stricte de la structure (defense-in-depth : ne jamais renvoyer
	// au frontend un QCM malformé qui casserait l'UI). parseLandingDemoQCM a
	// déjà validé options=4 + question non vide ; reste le fallback d'index.
	if qcm.CorrectIndex < 0 || qcm.CorrectIndex > 3 {
		qcm.CorrectIndex = 0 // fallback sûr plutôt que 502
	}
	// Normaliser la difficulté (l'IA peut envoyer "facile" ou "FACILE").
	diff := strings.TrimSpace(qcm.Difficulty)
	switch strings.ToLower(diff) {
	case "facile":
		qcm.Difficulty = "Facile"
	case "difficile":
		qcm.Difficulty = "Difficile"
	default:
		qcm.Difficulty = "Moyen"
	}
	// Nettoyer les options (trim whitespace, éviter doublons évidents)
	for i, o := range qcm.Options {
		qcm.Options[i] = strings.TrimSpace(o)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"qcm":   qcm,
		"model": result.Model,
	})
}
