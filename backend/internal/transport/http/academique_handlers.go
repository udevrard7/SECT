package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// academique_handlers.go — handlers HTTP pour Filieres + UE + EnseignantFiliere + Annees.

// ============================================================
// FILIERES
// ============================================================

// listFilieres — GET /api/filieres
func (s *Server) listFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params := domain.FiliereListParams{
		Search:          r.URL.Query().Get("search"),
		ResponsableID:   r.URL.Query().Get("responsableId"),
		Actif:           parseBoolQueryParam(r.URL.Query().Get("actif")),
		EtablissementID: r.URL.Query().Get("etablissementId"),
	}
	filieres, err := s.filiereUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"filieres": filieres})
}

// getFiliere — GET /api/filieres/{id}
func (s *Server) getFiliere(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	f, err := s.filiereUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(f) // bare object (pas de wrapper)
}

// createFiliere — POST /api/filieres
func (s *Server) createFiliere(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateFiliereInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	f, err := s.filiereUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"filiere": f})
}

// updateFiliere — PATCH /api/filieres/{id}
func (s *Server) updateFiliere(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	var input domain.UpdateFiliereInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	f, err := s.filiereUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(f) // bare
}

// deleteFiliere — DELETE /api/filieres/{id} (soft delete)
func (s *Server) deleteFiliere(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	existing, updated, err := s.filiereUC.SoftDelete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	// Count dependencies (best-effort, ignore error)
	_ = existing
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": "Filière désactivée (suppression logique)",
		"filiere": updated,
	})
}

// bulkFilieres — PATCH /api/filieres/bulk
func (s *Server) bulkFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.BulkFiliereInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	count, filieres, err := s.filiereUC.BulkUpdate(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"updated":  count,
		"filieres": filieres,
	})
}

// exportFilieres — GET /api/filieres/export (CSV)
func (s *Server) exportFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params := domain.FiliereListParams{
		Search:          r.URL.Query().Get("search"),
		ResponsableID:   r.URL.Query().Get("responsableId"),
		Actif:           parseBoolQueryParam(r.URL.Query().Get("actif")),
		EtablissementID: r.URL.Query().Get("etablissementId"),
	}
	filieres, err := s.filiereUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// CSV avec BOM UTF-8
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	filename := "filieres_export_" + time.Now().Format("2006-01-02") + ".csv"
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	// Header
	w.Write([]byte("Nom,Code,Établissement,Responsable,Étudiants,Statut,Date création\n"))
	for _, f := range filieres {
		statut := "Inactif"
		if f.Actif {
			statut = "Actif"
		}
		nbEtu := ""
		if f.NbEtudiants != nil {
			nbEtu = strconv.Itoa(*f.NbEtudiants)
		}
		code := ""
		if f.Code != nil {
			code = *f.Code
		}
		date := f.CreatedAt.Format("2006-01-02")
		w.Write([]byte(csvEscape(f.Nom) + "," + csvEscape(code) + ",," + "," + csvEscape(nbEtu) + "," + statut + "," + date + "\n"))
	}
}

// csvEscape échappe une valeur pour CSV (RFC 4180).
func csvEscape(s string) string {
	needsQuote := false
	for _, c := range s {
		if c == ',' || c == '"' || c == '\n' || c == '\r' {
			needsQuote = true
			break
		}
	}
	if !needsQuote {
		return s
	}
	// Doubler les guillemets et entourer
	escaped := ""
	for _, c := range s {
		if c == '"' {
			escaped += `""`
		} else {
			escaped += string(c)
		}
	}
	return `"` + escaped + `"`
}

// ============================================================
// UNITES ENSEIGNEMENT
// ============================================================

// listUEs — GET /api/unites-enseignement
func (s *Server) listUEs(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params := domain.UEListParams{
		FiliereID:       r.URL.Query().Get("filiereId"),
		Niveau:          r.URL.Query().Get("niveau"),
		Actif:           parseBoolQueryParam(r.URL.Query().Get("actif")),
		EtablissementID: r.URL.Query().Get("etablissementId"),
		EnseignantID:    r.URL.Query().Get("enseignantId"),
		Search:          r.URL.Query().Get("search"),
	}
	if sm := r.URL.Query().Get("semestre"); sm != "" {
		if v, err := strconv.Atoi(sm); err == nil {
			params.Semestre = &v
		}
	}
	ues, err := s.ueUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"unitesEnseignement": ues})
}

// getUE — GET /api/unites-enseignement/{id}
func (s *Server) getUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	ue, err := s.ueUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
}

// createUE — POST /api/unites-enseignement
func (s *Server) createUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateUEInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	ue, err := s.ueUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
}

// updateUE — PATCH /api/unites-enseignement/{id}
func (s *Server) updateUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	var input domain.UpdateUEInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	ue, err := s.ueUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
}

// deleteUE — DELETE /api/unites-enseignement/{id} (soft delete)
func (s *Server) deleteUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	ue, err := s.ueUC.SoftDelete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"uniteEnseignement": ue,
		"message":           "Unité d'enseignement désactivée avec succès",
	})
}

// ============================================================
// ENSEIGNANT FILIERES
// ============================================================

// listEnseignantFilieres — GET /api/enseignant-filieres
func (s *Server) listEnseignantFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params := domain.EnseignantFiliereListParams{
		EnseignantID:    r.URL.Query().Get("enseignantId"),
		FiliereID:       r.URL.Query().Get("filiereId"),
		EtablissementID: r.URL.Query().Get("etablissementId"),
	}
	assignments, err := s.efUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"assignments": assignments})
}

// createEnseignantFilieres — POST /api/enseignant-filieres
func (s *Server) createEnseignantFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateAssignmentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	ef, err := s.efUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"assignments": []any{ef}})
}

// deleteEnseignantFilieres — DELETE /api/enseignant-filieres (body JSON)
func (s *Server) deleteEnseignantFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.DeleteAssignmentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if err := s.efUC.Delete(r.Context(), claims, input); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Affectation supprimée avec succès"})
}

// ============================================================
// ANNEES ACADEMIQUES
// ============================================================

// listAnnees — GET /api/annees-academiques
func (s *Server) listAnnees(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := r.URL.Query().Get("etablissementId")
	var actif *bool
	if r.URL.Query().Get("actif") == "true" {
		b := true
		actif = &b
	}
	annees, err := s.anneeUC.List(r.Context(), claims, etabID, actif)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(annees) // bare array
}

// createAnnee — POST /api/annees-academiques
func (s *Server) createAnnee(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateAnneeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	a, err := s.anneeUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a) // bare object
}
