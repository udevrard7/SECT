// Package transport — handlers HTTP bibliothèque P4 : dimension
// sociale (ADR-0008). Annotations, propositions (file G1), veilles.
//
// Pattern commun : ClaimsFromContext → usecase → MapDomainError → JSON
// (pattern ouvrage_handlers.go). Les littéraux de route
// (/propositions, /veilles, /annotations) sont déclarés AVANT les
// routes paramétrées /{id} (leçon router P3).
package http

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ════════════════════════════════════════════════════════════════════════
// Annotations — GET/POST /api/ouvrages/{id}/annotations,
// PATCH/DELETE /api/ouvrages/{id}/annotations/{annotationId}
// ════════════════════════════════════════════════════════════════════════

func (s *Server) listOuvrageAnnotations(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	page := 0
	if raw := r.URL.Query().Get("page"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			page = n
		}
	}
	annotations, err := s.ouvrageSocialUC.ListAnnotations(r.Context(), claims, chi.URLParam(r, "id"), page)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"annotations": annotations})
}

func (s *Server) createOuvrageAnnotation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input struct {
		Page       int                         `json:"page"`
		Contenu    string                      `json:"contenu"`
		Visibilite domain.VisibiliteAnnotation `json:"visibilite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	created, err := s.ouvrageSocialUC.CreateAnnotation(r.Context(), claims, domain.CreateAnnotationInput{
		OuvrageID:  chi.URLParam(r, "id"),
		Page:       input.Page,
		Contenu:    input.Contenu,
		Visibilite: input.Visibilite,
	})
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"annotation": created})
}

func (s *Server) updateOuvrageAnnotation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	// Décodage optionnel : champ absent = inchangé (null = inchangé aussi —
	// on ne « vide » jamais une annotation par PATCH, la suppression existe).
	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	var input domain.UpdateAnnotationInput
	if raw, ok := body["contenu"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err == nil && v != "" {
			input.Contenu = &v
		}
	}
	if raw, ok := body["visibilite"]; ok {
		var v domain.VisibiliteAnnotation
		if err := json.Unmarshal(raw, &v); err == nil && v != "" {
			input.Visibilite = &v
		}
	}
	updated, err := s.ouvrageSocialUC.UpdateAnnotation(r.Context(), claims, chi.URLParam(r, "annotationId"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"annotation": updated})
}

func (s *Server) deleteOuvrageAnnotation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.ouvrageSocialUC.DeleteAnnotation(r.Context(), claims, chi.URLParam(r, "annotationId")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ════════════════════════════════════════════════════════════════════════
// Propositions — GET/POST /api/ouvrages/propositions,
// POST /{id}/trancher, DELETE /{id}
// ════════════════════════════════════════════════════════════════════════

func (s *Server) listOuvragePropositions(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params := domain.PropositionListParams{
		Statut: domain.StatutProposition(r.URL.Query().Get("statut")),
		Page:   1,
		Limit:  20,
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 {
		params.Page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		params.Limit = v
	}
	result, err := s.ouvrageSocialUC.ListPropositions(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (s *Server) createOuvrageProposition(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreatePropositionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	created, err := s.ouvrageSocialUC.CreateProposition(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"proposition": created})
}

func (s *Server) trancheOuvrageProposition(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.TranchePropositionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	p, err := s.ouvrageSocialUC.TrancheProposition(r.Context(), claims, chi.URLParam(r, "id"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"proposition": p})
}

func (s *Server) deleteOuvrageProposition(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.ouvrageSocialUC.DeleteProposition(r.Context(), claims, chi.URLParam(r, "id")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ════════════════════════════════════════════════════════════════════════
// Veilles — GET/POST /api/ouvrages/veilles, DELETE /{id}
// ════════════════════════════════════════════════════════════════════════

func (s *Server) listOuvrageVeilles(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	veilles, err := s.ouvrageSocialUC.ListVeilles(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"veilles": veilles})
}

func (s *Server) createOuvrageVeille(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateVeilleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	created, err := s.ouvrageSocialUC.CreateVeille(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"veille": created})
}

func (s *Server) deleteOuvrageVeille(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.ouvrageSocialUC.DeleteVeille(r.Context(), claims, chi.URLParam(r, "id")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
