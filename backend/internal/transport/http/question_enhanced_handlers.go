// Package http — handlers enrichis pour /api/questions (P2-QUESTIONS-IA).
package http

import (
        "encoding/json"
        "strings"
        "fmt"
        "io"
        "net/http"

        "github.com/go-chi/chi/v5"
        "github.com/udevrard7/sect/backend/internal/ai"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// P2-Q2 : POST /api/questions/{id}/regenerate — régénérer une question IA
// ──────────────────────────────────────────────────────────────────────────
//
// Body: { documentId, type, difficulte }
// Response: { question: Question }
//
// Récupère le document, construit un prompt IA pour régénérer UNE question
// du type demandé, retourne la nouvelle question (sans persister — le
// frontend peut ensuite la sauvegarder via PATCH /api/questions/{id}).

func (s *Server) regenerateQuestion(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        if claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
                writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
                return
        }

        // SECT-QUOTA-GUARDS : vérifier le quota de génération IA avant régénération.
        if s.quotaChecker != nil && claims.EtablissementID != "" {
                if err := s.quotaChecker.CheckIAGenerationQuota(r.Context(), claims.EtablissementID); err != nil {
                        middleware.MapDomainError(w, err)
                        return
                }
        }

        questionID := chi.URLParam(r, "id")
        if questionID == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var input struct {
                DocumentID string `json:"documentId"`
                Type       string `json:"type"`
                Difficulte string `json:"difficulte"`
        }
        if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.DocumentID == "" {
                writeJSONError(w, http.StatusBadRequest, "documentId requis")
                return
        }

        // Récupérer le contenu du document
        doc, err := s.documentUC.GetByID(r.Context(), claims, input.DocumentID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // Récupérer la question existante pour le contexte (fallback pour type/difficulte).
        // BUGFIX (QUESTIONS-IA-REGENERATE) : l'ancien code rendait GetByID fatal → 404
        // si la question n'existait pas en DB. Or en mode preview (questions générées
        // par l'IA mais non encore persistées), q.id = "q1", "q2" etc. → GetByID
        // échouait toujours → la régénération single question était 100% cassée.
        // Fix : GetByID est maintenant non-fatal. Si la question n'existe pas (preview),
        // on continue avec uniquement les type/difficulte fournis dans le body.
        var existingQ *domain.Question
        if eq, err := s.questionUC.GetByID(r.Context(), claims, questionID); err == nil {
                existingQ = eq
        }
        // Si GetByID échoue ET que le body ne fournit pas type/difficulte, on ne peut
        // pas régénérer → erreur explicite.
        if (existingQ == nil || existingQ.ID == "") && input.Type == "" {
                writeJSONError(w, http.StatusBadRequest, "type requis (question non persistée en DB)")
                return
        }

        // Construire le prompt pour régénérer
        docContent := ""
        if doc.ContenuTexte != nil {
                docContent = *doc.ContenuTexte
        }
        if len(docContent) > 12000 {
                docContent = docContent[:12000]
        }

        qType := input.Type
        if qType == "" && existingQ != nil {
                qType = string(existingQ.Type)
        }
        qDiff := input.Difficulte
        if qDiff == "" && existingQ != nil {
                qDiff = string(existingQ.Difficulte)
        }

        systemPrompt := `Tu es un générateur de questions d'examen expert. Génère UNE seule question au format JSON strict.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown autour.
Format attendu :
{
  "type": "QCU|QCM|QRC|CODE",
  "enonce": "Énoncé de la question",
  "propositions": ["A", "B", "C", "D"],
  "reponseCorrecte": "B",
  "explication": "Pourquoi la réponse est correcte",
  "difficulte": "FACILE|MOYEN|DIFFICILE|EXPERT"
}`

        userPrompt := fmt.Sprintf(`[CONTEXTE DU DOCUMENT]
%s

[GÉNÉRER]
Une question de type %s, difficulté %s, basée sur le document ci-dessus.
Pour QCU : propositions = tableau de 4 options, reponseCorrecte = lettre de la bonne réponse.
Pour QCM : propositions = tableau d'options, reponseCorrecte = tableau des lettres correctes.
Pour QRC : propositions = null, reponseCorrecte = réponse modèle attendue.
Pour CODE : propositions = null, reponseCorrecte = code solution.

Réponds UNIQUEMENT avec le JSON demandé.`, docContent, qType, qDiff)

        messages := []ai.ChatMessage{
                {Role: "system", Content: systemPrompt},
                {Role: "user", Content: userPrompt},
        }

        result, err := s.aiService.ChatCompletion(r.Context(), messages)
        if err != nil {
                writeJSONError(w, http.StatusServiceUnavailable, fmt.Sprintf("erreur IA: %v", err))
                return
        }

        // Parser la réponse (tolerant : extraire le JSON)
        rawResult := result.Content
        jsonStr := rawResult
        if idx := strings.Index(rawResult, "{"); idx >= 0 {
                endIdx := strings.LastIndex(rawResult, "}")
                if endIdx > idx {
                        jsonStr = rawResult[idx : endIdx+1]
                }
        }

        var generated struct {
                Type            string `json:"type"`
                Enonce          string `json:"enonce"`
                Propositions    any    `json:"propositions"`
                ReponseCorrecte any    `json:"reponseCorrecte"`
                Explication     string `json:"explication"`
                Difficulte      string `json:"difficulte"`
        }
        if err := json.Unmarshal([]byte(jsonStr), &generated); err != nil {
                writeJSONError(w, http.StatusUnprocessableEntity, "réponse IA illisible")
                return
        }

        // Sérialiser propositions et reponseCorrecte en JSON string pour le frontend
        propJSON, _ := json.Marshal(generated.Propositions)
        correctJSON, _ := json.Marshal(generated.ReponseCorrecte)

        resp := map[string]any{
                "id":               questionID,
                "type":             generated.Type,
                "enonce":           generated.Enonce,
                "propositions":     generated.Propositions,
                "reponseCorrecte":  generated.ReponseCorrecte,
                "explication":      generated.Explication,
                "difficulte":       generated.Difficulte,
                "documentId":       input.DocumentID,
                "_propJSON":        string(propJSON),
                "_correctJSON":     string(correctJSON),
                "model":            result.Model,
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "question": resp,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// P2-Q3 : GET /api/questions/test-zai — tester la connexion IA
// ──────────────────────────────────────────────────────────────────────────
//
// Response: { status: "ok"|"error", error?, baseUrl? }
//
// Tente un appel simple à l'AIService pour vérifier que le provider IA
// actif est configuré et répond.

func (s *Server) testZaiConnection(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Tenter un appel simple à l'IA
        messages := []ai.ChatMessage{
                {Role: "system", Content: "Tu es un assistant. Réponds 'OK' uniquement."},
                {Role: "user", Content: "Test de connexion. Réponds OK."},
        }

        result, err := s.aiService.ChatCompletion(r.Context(), messages)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]any{
                        "status": "error",
                        "error":  err.Error(),
                })
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "status":  "ok",
                "model":   result.Model,
                "response": result.Content,
        })
}
