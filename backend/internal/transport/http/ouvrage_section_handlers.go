// ouvrage_section_handlers.go — handlers HTTP du TOC curaté (ADR-0007 §P3,
// migration 000126). Routes montées dans router.go : /api/ouvrages/{id}/sections.
//
// G1 : écritures ADMIN (RequireRole router + usecase + policies 000126,
// défense en profondeur ×3). Lecture : tous rôles authentifiés — le
// scoping (etab + corbeille + droits expirés) est délégué à Ouvrage_select
// via la policy OuvrageSection_select (EXISTS parent, pattern 000124).
package http

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// listOuvrageSections — GET /api/ouvrages/{id}/sections (tous rôles, RLS).
func (s *Server) listOuvrageSections(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	sections, err := s.alignementUC.ListSections(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"sections": sections})
}

// createOuvrageSection — POST /api/ouvrages/{id}/sections (ADMIN, G1).
// Body JSON : {titre, pageDebut?, pageFin?, ordre?}.
func (s *Server) createOuvrageSection(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateOuvrageSectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	input.OuvrageID = chi.URLParam(r, "id")
	created, err := s.alignementUC.CreateSection(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"section": created})
}

// patchSectionFromRaw — décodage tri-state du PATCH (pattern
// patchOuvrageFromRaw) : pageDebut/pageFin absent = inchangé, null = NULL
// (page inconnue), valeur = nouvelle valeur. Titre/ordre : pointeurs.
func patchSectionFromRaw(body io.Reader) (domain.UpdateOuvrageSectionInput, error) {
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(body).Decode(&raw); err != nil {
		return domain.UpdateOuvrageSectionInput{}, err
	}
	var out domain.UpdateOuvrageSectionInput

	if rawTitle, ok := raw["titre"]; ok {
		var v *string
		if err := json.Unmarshal(rawTitle, &v); err != nil {
			return out, err
		}
		out.Titre = v
	}
	if rawDebut, ok := raw["pageDebut"]; ok {
		var v *int
		if err := json.Unmarshal(rawDebut, &v); err != nil {
			return out, err
		}
		if v == nil {
			out.UnsetPageDebut = true
		} else {
			out.PageDebut = v
		}
	}
	if rawFin, ok := raw["pageFin"]; ok {
		var v *int
		if err := json.Unmarshal(rawFin, &v); err != nil {
			return out, err
		}
		if v == nil {
			out.UnsetPageFin = true
		} else {
			out.PageFin = v
		}
	}
	if rawOrdre, ok := raw["ordre"]; ok {
		var v *int
		if err := json.Unmarshal(rawOrdre, &v); err != nil {
			return out, err
		}
		out.Ordre = v
	}
	return out, nil
}

// updateOuvrageSection — PATCH /api/ouvrages/{id}/sections/{sectionId} (ADMIN).
func (s *Server) updateOuvrageSection(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	input, err := patchSectionFromRaw(r.Body)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	updated, err := s.alignementUC.UpdateSection(r.Context(), claims, chi.URLParam(r, "sectionId"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"section": updated})
}

// deleteOuvrageSection — DELETE /api/ouvrages/{id}/sections/{sectionId} (ADMIN).
// Les alignements survécuent (FK ON DELETE SET NULL — déclaration
// « ouvrage entier »).
func (s *Server) deleteOuvrageSection(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.alignementUC.DeleteSection(r.Context(), claims, chi.URLParam(r, "sectionId")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
