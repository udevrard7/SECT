package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// access_handlers.go — handlers HTTP pour EtablissementAccess.

// listAccess — GET /api/etablissement-access
func (s *Server) listAccess(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	params := domain.AccessListParams{
		AdminID:         r.URL.Query().Get("adminId"),
		Statut:          r.URL.Query().Get("statut"),
		EtablissementID: r.URL.Query().Get("etablissementId"),
	}

	records, err := s.accessUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"accessRecords": records})
}

// createAccess — POST /api/etablissement-access
func (s *Server) createAccess(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.CreateAccessInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	access, err := s.accessUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"accessRecord": access})
}

// updateAccess — PATCH /api/etablissement-access/{id}
func (s *Server) updateAccess(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input domain.UpdateAccessInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	access, err := s.accessUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"accessRecord": access})
}

// checkAccess — GET /api/etablissement-access/check?etablissementId=...
func (s *Server) checkAccess(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabID := r.URL.Query().Get("etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
		return
	}

	access, err := s.accessUC.CheckAccess(r.Context(), claims, etabID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"hasAccess":    access != nil,
		"accessRecord": access,
	})
}

// authorizedEtablissements — GET /api/etablissement-access/authorized-etablissements
func (s *Server) authorizedEtablissements(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabs, err := s.accessUC.ListAuthorizedEtablissements(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"etablissements": etabs})
}
