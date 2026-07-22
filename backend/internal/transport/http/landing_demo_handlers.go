// Package http — landing_demo_handlers.go
//
// Endpoint PUBLIC de démonstration pour le landing page (section "Démo interactive").
//
// POST /api/landing-demo
//   Body:  { "topic": "La photosynthèse" }
//   Resp:  { "qcm": { "question", "options": [4], "correctIndex": 0-3,
//                     "difficulty": "Facile"|"Moyen"|"Difficile", "explanation" },
//            "model": "mistral-small-latest" }
//
// Cet endpoint n'exige PAS d'authentification (visiteur non connecté du landing
// page). Il utilise le provider IA actif configuré en base (AIProviderConfig,
// isActive=true) — exactement le même chemin que le reste de l'app :
//
//   s.aiService.ChatCompletion(ctx, messages)
//     → ChatWithFailover lit les providers actifs par priorité
//     → pose les claims system-worker pour RLS (lecture AIProviderConfig)
//     → appelle l'endpoint OpenAI-compatible du provider (Mistral, Groq, …)
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
        landingDemoMaxRequests = 40              // requêtes par fenêtre par IP
        landingDemoWindow      = 10 * time.Minute // taille de la fenêtre
        landingDemoTopicMax    = 200             // longueur max du topic
        landingDemoTopicMin    = 3               // longueur min du topic
        landingDemoTimeout     = 30 * time.Second // timeout de l'appel IA
)

type landingDemoEntry struct {
        count    int
        windowSt time.Time
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
        // on coupe à 30s pour ne pas faire attendre un visiteur non authentifié.
        ctx, cancel := context.WithTimeout(r.Context(), landingDemoTimeout)
        defer cancel()

        result, err := s.aiService.ChatCompletion(ctx, messages)
        if err != nil {
                // Erreur attendue courante : aucun provider IA actif en base.
                // On renvoie 503 (Service Unavailable) avec un message actionnable.
                writeJSONError(w, http.StatusServiceUnavailable,
                        fmt.Sprintf("Service IA indisponible: %v", err))
                return
        }

        // Extraction tolérante du JSON (l'IA peut wrapper dans des ```json ou
        // ajouter du texte malgré la consigne). On prend du premier '{' au
        // dernier '}'.
        raw := result.Content
        jsonStr := raw
        if idx := strings.Index(raw, "{"); idx >= 0 {
                if endIdx := strings.LastIndex(raw, "}"); endIdx > idx {
                        jsonStr = raw[idx : endIdx+1]
                }
        }

        var qcm struct {
                Question     string   `json:"question"`
                Options      []string `json:"options"`
                CorrectIndex int      `json:"correctIndex"`
                Difficulty   string   `json:"difficulty"`
                Explanation  string   `json:"explanation"`
        }
        if err := json.Unmarshal([]byte(jsonStr), &qcm); err != nil {
                writeJSONError(w, http.StatusUnprocessableEntity,
                        "Réponse IA illisible — réessayez avec un autre sujet.")
                return
        }

        // Validation stricte de la structure (defense-in-depth : ne jamais renvoyer
        // au frontend un QCM malformé qui casserait l'UI).
        if len(qcm.Options) != 4 {
                writeJSONError(w, http.StatusUnprocessableEntity,
                        "Le QCM généré n'a pas 4 options — réessayez.")
                return
        }
        if qcm.CorrectIndex < 0 || qcm.CorrectIndex > 3 {
                qcm.CorrectIndex = 0 // fallback sûr plutôt que 502
        }
        if qcm.Question == "" {
                writeJSONError(w, http.StatusUnprocessableEntity,
                        "Question vide — réessayez.")
                return
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
        json.NewEncoder(w).Encode(map[string]any{
                "qcm":   qcm,
                "model": result.Model,
        })
}
