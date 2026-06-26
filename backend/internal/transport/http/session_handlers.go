package http

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"session": sess,
		"resumed": resumed,
	})
}

// saveReponse — PUT /api/sessions (auto-save)
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

	if err := s.sessionUC.SaveReponse(r.Context(), claims, input); err != nil {
		middleware.MapDomainError(w, err)
		return
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
