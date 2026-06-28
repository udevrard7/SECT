package http

import (
        "context"
        "encoding/json"
        "net/http"
        "strconv"

        "github.com/go-chi/chi/v5"
        "github.com/udevrard7/sect/backend/internal/cache"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// session_handlers.go — handlers HTTP pour Sessions + Resultats.

// ============================================================
// SESSIONS
// ============================================================

// listSessions — GET /api/sessions
func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.SessionListParams{
                EtudiantID: r.URL.Query().Get("etudiantId"),
                EpreuveID:  r.URL.Query().Get("epreuveId"),
        }

        sessions, err := s.sessionUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(sessions) // bare array
}

// getSession — GET /api/sessions/{id}
func (s *Server) getSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        sess, err := s.sessionUC.GetByID(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"session": sess})
}

// startSession — POST /api/sessions
func (s *Server) startSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input domain.StartSessionInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        sess, resumed, err := s.sessionUC.StartSession(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // B9-MES-EPREUVES : enrichir la réponse avec epreuve.questions pour que
        // le frontend passation-page puisse rafraîchir les questions avec le
        // mapping de propositions persisté (si melangePropositions: true).
        questions, _ := s.epreuveUC.ListQuestions(r.Context(), claims, sess.EpreuveID)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "session": sess,
                "resumed": resumed,
                "epreuve": map[string]any{
                        "questions": questions,
                },
        })
}

// saveReponse — PUT /api/sessions (auto-save)
//
// CACHE-RAM-1 : écrit en RAM (< 1ms) au lieu de Neon (~50-100ms).
// Le worker goroutine synchronisera vers Neon toutes les 30s, et le
// handler submitSession force un flush immédiat avant la soumission.
func (s *Server) saveReponse(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input domain.SaveReponseInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        // CACHE-RAM-1 : écrire en RAM (single-question merge).
        // L'input ne contient pas EpreuveID (single-question save), on passe "".
        // Le premier SaveAnswers crée l'entrée ; les suivants mergent les réponses.
        if s.sessionCache != nil && input.SessionID != "" {
                reponses := map[string]string{input.QuestionID: input.Contenu}
                s.sessionCache.SaveAnswers(input.SessionID, "", claims.UserID, reponses)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"saved": true})
}

// submitSession — POST /api/sessions/{id}/submit
func (s *Server) submitSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        var input domain.SubmitSessionInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                // Body optionnel — si pas de body, input reste zero-value
                input = domain.SubmitSessionInput{}
        }

        // CACHE-RAM-1 : flush immédiat du cache vers Neon avant le submit.
        // FlushAndGetDirty marque la session {id} comme dirty et retourne TOUTES
        // les sessions dirty (même celles d'autres étudiants). On flush chacune
        // via FlushSessionToNeon qui construit les claims RLS depuis l'EtudiantID
        // stocké en cache (le worker goroutine fait de même en arrière-plan).
        if s.sessionCache != nil {
                dirtySessions := s.sessionCache.FlushAndGetDirty(id)
                for _, ds := range dirtySessions {
                        _ = s.FlushSessionToNeon(r.Context(), ds)
                }
                // Nettoyer le cache pour cette session (les autres restent pour le worker)
                s.sessionCache.RemoveSession(id)
        }

        result, err := s.sessionUC.Submit(r.Context(), claims, id, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result)
}

// ============================================================
// RESULTATS
// ============================================================

// listResultats — GET /api/resultats
func (s *Server) listResultats(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.ResultatListParams{
                EtudiantID: r.URL.Query().Get("etudiantId"),
                EpreuveID:  r.URL.Query().Get("epreuveId"),
                Page:       parseIntQueryParam(r.URL.Query().Get("page"), 1),
                Limit:      parseIntQueryParam(r.URL.Query().Get("limit"), 50),
        }

        result, err := s.resultatUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result)
}

// resultatsOverview — GET /api/resultats/overview
func (s *Server) resultatsOverview(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        enseignantID := r.URL.Query().Get("enseignantId")
        overview, err := s.resultatUC.GetOverview(r.Context(), claims, enseignantID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(overview)
}

// resultatsEtudiantOverview — GET /api/resultats/etudiant-overview
func (s *Server) resultatsEtudiantOverview(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        overview, err := s.resultatUC.GetEtudiantOverview(r.Context(), claims)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(overview)
}

// parseIntQueryParamExtended parse avec fallback (utilise parseIntQueryParam existant).
func parseIntQueryParamExtended(s string, defaultVal int) int {
        return parseIntQueryParam(s, defaultVal)
}

// strconv unused suppress
var _ = strconv.Itoa

// ============================================================
// CACHE-RAM-1 — public methods for worker goroutine
// ============================================================

// GetDirtySessions retourne les sessions modifiées (et les marque clean).
// Wrapper public utilisé par le worker goroutine de cmd/api/main.go.
func (s *Server) GetDirtySessions() []*cache.CachedSession {
        if s.sessionCache == nil {
                return nil
        }
        return s.sessionCache.GetDirtySessions()
}

// FlushSessionToNeon écrit une session cache vers Neon via le usecase SaveReponse.
// Construit les claims RLS à partir de l'EtudiantID stocké en cache — le worker
// goroutine n'a pas de claims HTTP, donc on utilise l'ID de l'étudiant propriétaire
// de la session. SaveReponse appelle WithTx qui pose app.claims.user_id ; le RLS
// filtrera alors correctement (pas besoin de désactiver RLS).
//
// Remarque : SaveReponseInput est single-question (QuestionID + Contenu), donc on
// appelle SaveReponse une fois par entrée du map Reponses.
func (s *Server) FlushSessionToNeon(ctx context.Context, sess *cache.CachedSession) error {
        if sess == nil {
                return nil
        }
        claims := db.SessionClaims{
                UserID: sess.EtudiantID,
                Role:   string(domain.RoleEtudiant),
        }
        for questionID, contenu := range sess.Reponses {
                if contenu == "" {
                        continue
                }
                input := domain.SaveReponseInput{
                        SessionID:  sess.SessionID,
                        QuestionID: questionID,
                        Contenu:    contenu,
                }
                if err := s.sessionUC.SaveReponse(ctx, claims, input); err != nil {
                        return err
                }
        }
        return nil
}
