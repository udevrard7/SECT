package http

import (
        "encoding/json"
        "io"
        "net/http"
        "strconv"

        "github.com/go-chi/chi/v5"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
        "github.com/udevrard7/sect/backend/internal/usecase"
)

// epreuve_handlers.go — handlers HTTP pour Epreuves + Questions.

// ============================================================
// EPREUVES
// ============================================================

// listEpreuves — GET /api/epreuves
func (s *Server) listEpreuves(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Multi-statut: ?statut=TERMINEE,CLOTUREE
        statuts := usecase.ParseMultiStatut(r.URL.Query().Get("statut"))

        params := domain.EpreuveListParams{
                EnseignantID:        r.URL.Query().Get("enseignantId"),
                EtudiantID:          r.URL.Query().Get("etudiantId"),
                FiliereID:           r.URL.Query().Get("filiereId"),
                ResponsableID:       r.URL.Query().Get("responsableId"),
                Statuts:             statuts,
                Select:              r.URL.Query().Get("select"),
                Search:              r.URL.Query().Get("search"),
                Niveau:              r.URL.Query().Get("niveau"),
                SessionExamen:       r.URL.Query().Get("sessionExamen"),
                AnneeAcademiqueID:   r.URL.Query().Get("anneeAcademiqueId"),
                UniteEnseignementID: r.URL.Query().Get("uniteEnseignementId"),
        }

        epreuves, err := s.epreuveUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // EVALUATIONS-FIX-EV3 (HIGH) : dériver les filieres uniques des épreuves
        // retournées pour alimenter le filtre filière côté frontend. Avant, le
        // handler retournait seulement {epreuves: [...]} → le frontend attendait
        // data.filieres → [] → le filtre filière n'était jamais affiché.
        type filiereOpt struct {
                ID   string `json:"id"`
                Nom  string `json:"nom"`
                Code string `json:"code,omitempty"`
        }
        filiereMap := map[string]filiereOpt{}
        for _, e := range epreuves {
                if e.Filiere != nil && e.Filiere.ID != "" {
                        if _, exists := filiereMap[e.Filiere.ID]; !exists {
                                filiereMap[e.Filiere.ID] = filiereOpt{
                                        ID:   e.Filiere.ID,
                                        Nom:  e.Filiere.Nom,
                                        Code: e.Filiere.Code,
                                }
                        }
                }
        }
        filieres := make([]filiereOpt, 0, len(filiereMap))
        for _, f := range filiereMap {
                filieres = append(filieres, f)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "epreuves": epreuves,
                "filieres": filieres,
        })
}

// getEpreuve — GET /api/epreuves/{id}
func (s *Server) getEpreuve(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        e, err := s.epreuveUC.GetByID(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"epreuve": e})
}

// createEpreuve — POST /api/epreuves
func (s *Server) createEpreuve(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        var input domain.CreateEpreuveInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        e, err := s.epreuveUC.Create(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "epreuve": e,
                "message": "Épreuve créée avec succès",
        })
}

// getEpreuveStatus — GET /api/epreuves/{id}/status
// IA-WORKER-1 : retourne le statut d'une épreuve en cours de génération IA.
// Le frontend poll cet endpoint toutes les 3s via TanStack Query.
func (s *Server) getEpreuveStatus(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        e, err := s.epreuveUC.GetByID(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // Retourner le statut + contenu si disponible
        result := map[string]any{
                "status":    string(e.Statut),
                "updatedAt": e.UpdatedAt,
        }
        if e.Contenu != nil && e.Statut == "TERMINEE" {
                result["contenu"] = json.RawMessage(e.Contenu)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result)
}

// updateEpreuve — PATCH /api/epreuves/{id}
func (s *Server) updateEpreuve(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        var input domain.UpdateEpreuveInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        e, err := s.epreuveUC.Update(r.Context(), claims, id, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // Message selon l'action
        message := "Épreuve mise à jour"
        if input.Action != nil {
                switch *input.Action {
                case "publier":
                        message = "Épreuve publiée"
                case "lancer":
                        message = "Épreuve lancée"
                case "terminer":
                        message = "Épreuve terminée"
                case "cloturer":
                        message = "Épreuve clôturée"
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "epreuve": e,
                "message": message,
        })
}

// deleteEpreuve — DELETE /api/epreuves/{id} (soft delete)
func (s *Server) deleteEpreuve(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        if err := s.epreuveUC.SoftDelete(r.Context(), claims, id); err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "Épreuve déplacée vers la corbeille"})
}

// listEpreuveQuestions — GET /api/epreuves/{id}/questions
func (s *Server) listEpreuveQuestions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        questions, err := s.epreuveUC.ListQuestions(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(questions) // bare array
}

// ============================================================
// QUESTIONS
// ============================================================

// listQuestions — GET /api/questions
func (s *Server) listQuestions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.QuestionListParams{
                UserID:     r.URL.Query().Get("userId"),
                DocumentID: r.URL.Query().Get("documentId"),
                Type:       r.URL.Query().Get("type"),
                Difficulte: r.URL.Query().Get("difficulte"),
                Validee:    parseBoolQueryParam(r.URL.Query().Get("validee")),
                Search:     r.URL.Query().Get("search"),
                Page:       parseIntQueryParam(r.URL.Query().Get("page"), 1),
                Limit:      parseIntQueryParam(r.URL.Query().Get("limit"), 50),
        }

        result, err := s.questionUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result)
}

// getQuestion — GET /api/questions/{id}
func (s *Server) getQuestion(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        q, err := s.questionUC.GetByID(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"question": q})
}

// createQuestion — POST /api/questions
func (s *Server) createQuestion(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        var input domain.CreateQuestionInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        q, err := s.questionUC.Create(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "question": q,
                "message":  "Question créée avec succès",
        })
}

// updateQuestion — PATCH /api/questions/{id}
func (s *Server) updateQuestion(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")

        // P1-Q4 : lire le body brut pour détecter "action" (le frontend
        // questions-ia-page.tsx envoie {action:'valider'} au lieu de
        // {validee:true}).
        bodyBytes, err := io.ReadAll(r.Body)
        if err != nil {
                writeJSONError(w, http.StatusBadRequest, "corps de requête illisible")
                return
        }

        // D'abord décoder en UpdateQuestionInput (chemin normal)
        var input domain.UpdateQuestionInput
        if err := json.Unmarshal(bodyBytes, &input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        // Si pas de Validee, vérifier si le body contient "action":"valider"
        if input.Validee == nil {
                var actionBody struct {
                        Action string `json:"action"`
                }
                if err := json.Unmarshal(bodyBytes, &actionBody); err == nil {
                        if actionBody.Action == "valider" {
                                valTrue := true
                                input.Validee = &valTrue
                        } else if actionBody.Action == "devalider" {
                                valFalse := false
                                input.Validee = &valFalse
                        }
                }
        }

        q, err := s.questionUC.Update(r.Context(), claims, id, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        message := "Question mise à jour"
        if input.Validee != nil {
                if *input.Validee {
                        message = "Question validée"
                } else {
                        message = "Question dévalidée"
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "question": q,
                "message":  message,
        })
}

// deleteQuestion — DELETE /api/questions/{id} (soft delete)
func (s *Server) deleteQuestion(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        id := chi.URLParam(r, "id")
        if err := s.questionUC.SoftDelete(r.Context(), claims, id); err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "Question déplacée vers la corbeille"})
}

// batchDeleteQuestions — DELETE /api/questions (batch soft delete)
// CORBEILLE-FIX C2 : utilise BatchSoftDelete au lieu de BatchHardDelete.
// Avant : hard delete → data loss silencieuse, toast mensonger "corbeille 30j".
// Maintenant : soft delete → questions restaurables depuis la corbeille.
func (s *Server) batchDeleteQuestions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        var body struct {
                IDs []string `json:"ids"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        count, err := s.questionUC.BatchSoftDelete(r.Context(), claims, body.IDs)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "message":      strconv.Itoa(count) + " question(s) déplacée(s) vers la corbeille",
                "deletedCount": count,
        })
}
