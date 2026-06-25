package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/apps/api/internal/domain"
	"github.com/udevrard7/sect/apps/api/internal/middleware"
	"github.com/udevrard7/sect/apps/api/internal/usecase"
)

// userHandlers.go — handlers HTTP pour le domaine Users.

// parseBoolQueryParam parse un paramètre booléen (true/false).
func parseBoolQueryParam(s string) *bool {
	if s == "" {
		return nil
	}
	b := s == "true" || s == "1"
	return &b
}

// parseIntQueryParam parse un paramètre entier avec valeur par défaut.
func parseIntQueryParam(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return defaultVal
	}
	return v
}

// listUsers — GET /api/users
// Auth : ADMIN, RESPONSABLE, ENSEIGNANT
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Vérifier le rôle (ADMIN, RESPONSABLE, ENSEIGNANT)
	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" && role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	params := usecase.ListParams{
		Search:         r.URL.Query().Get("search"),
		Role:           r.URL.Query().Get("role"),
		Actif:          parseBoolQueryParam(r.URL.Query().Get("actif")),
		EtablissementID: r.URL.Query().Get("etablissementId"),
		FiliereID:      r.URL.Query().Get("filiereId"),
		Page:           parseIntQueryParam(r.URL.Query().Get("page"), 1),
		Limit:          parseIntQueryParam(r.URL.Query().Get("limit"), 20),
	}

	result, err := s.userUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// getUser — GET /api/users/{id}
// Auth : ADMIN, RESPONSABLE
func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	user, err := s.userUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"user": user})
}

// createUser — POST /api/users
// Auth : ADMIN (crée RESPONSABLE), RESPONSABLE (crée ENSEIGNANT/ETUDIANT)
func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// ADMIN ou RESPONSABLE seulement
	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé à créer des utilisateurs")
		return
	}

	var input domain.CreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	user, err := s.userUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"user": user})
}

// updateUser — PATCH /api/users/{id}
// Auth : ADMIN, RESPONSABLE
func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input domain.UpdateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	user, err := s.userUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"user": user})
}

// deleteUser — DELETE /api/users/{id}
// Auth : ADMIN, RESPONSABLE
func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	if err := s.userUC.Delete(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "utilisateur supprimé",
	})
}

// Valide qu'une string n'est pas vide
func requireNonEmpty(s string) bool {
	return strings.TrimSpace(s) != ""
}
