// alignement_handlers.go — handlers HTTP du paquet enseignant (ADR-0007
// §P3). Routes montées dans router.go :
//
//	GET    /api/documents/{id}/alignements                 ENS/RESP/ADMIN
//	GET    /api/documents/{id}/alignements/suggestions     ENS/ADMIN (owner)
//	POST   /api/documents/{id}/alignements                 ENS/ADMIN (owner)
//	DELETE /api/documents/{id}/alignements/{alignementId}  ENS/ADMIN (owner)
//	GET    /api/documents/{id}/bibliographie               tous rôles etab
//	GET    /api/etablissements/{id}/conformite-referentiels  RESP/ADMIN
//
// Le scoping réel (etab, corbeille, droits expirés, propriété du support)
// est fait par les policies RLS 000126 + les gates usecase ; les
// RequireRole du router sont la première ligne (defense in depth).
package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// listAlignements — GET /api/documents/{id}/alignements
func (s *Server) listAlignements(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	alignements, err := s.alignementUC.ListAlignements(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"alignements": alignements})
}

// suggestAlignements — GET /api/documents/{id}/alignements/suggestions
// Flux P3 §1 : l'IA PROPOSE (retrieval déterministe sur les thèmes),
// l'enseignant DÉCIDE (POST). Déclaré AVANT /{alignementId} (leçon router :
// littéraux avant paramétrés).
func (s *Server) suggestAlignements(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	suggestions, err := s.alignementUC.Suggestions(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"suggestions": suggestions,
		"message":     "Propositions calculées par recoupement de thèmes — vous décidez (transposition didactique)",
	})
}

// createAlignement — POST /api/documents/{id}/alignements
// Body JSON : {ouvrageId, ouvrageSectionId?, note?}.
func (s *Server) createAlignement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateAlignementInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	created, err := s.alignementUC.CreateAlignement(r.Context(), claims, chi.URLParam(r, "id"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"alignement": created,
		"message":    "Alignement déclaré — la bibliographie du support est à jour",
	})
}

// deleteAlignement — DELETE /api/documents/{id}/alignements/{alignementId}
func (s *Server) deleteAlignement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.alignementUC.DeleteAlignement(r.Context(), claims, chi.URLParam(r, "id"), chi.URLParam(r, "alignementId")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// getBibliographie — GET /api/documents/{id}/bibliographie
// Générée depuis les alignements (flux P3 §3) — exportable côté client
// (CSV, pattern resultats-utils).
func (s *Server) getBibliographie(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	biblio, err := s.alignementUC.Bibliographie(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(biblio)
}

// getConformiteReferentiels — GET /api/etablissements/{id}/conformite-referentiels
// Audit de direction (flux P3 §4) : fonction SECURITY DEFINER cloisonnée
// (pattern 000124) + gate usecase.
func (s *Server) getConformiteReferentiels(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	supports, err := s.alignementUC.ConformiteEtablissement(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"etablissementId": chi.URLParam(r, "id"),
		"supports":        supports,
	})
}
