package http

import (
	"encoding/json"
	"fmt"
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
	_ = json.NewEncoder(w).Encode(map[string]any{"filieres": filieres})
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
	_ = json.NewEncoder(w).Encode(f) // bare object (pas de wrapper)
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
	_ = json.NewEncoder(w).Encode(map[string]any{"filiere": f})
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
	_ = json.NewEncoder(w).Encode(f) // bare
}

// deleteFiliere — DELETE /api/filieres/{id} (soft delete).
//
// BUGFIX (FILIERES-CRITICAL-FIX-1) : inclut `dependencies` dans la response
// (best-effort) pour que le toast frontend puisse afficher « N étudiants,
// M épreuves, K UEs affectés ». Avant, `data.dependencies` était toujours
// undefined → le toast tombait sur le fallback générique.
//
// Note : on ne retourne pas 409 Conflict si !CanDelete car le soft-delete
// (actif=false) ne provoque pas d'erreur FK — et le frontend bloque déjà la
// confirmation côté UI via l'endpoint GET /{id}/dependencies.
func (s *Server) deleteFiliere(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")

	// DELETE ?hard=true → suppression définitive (hard delete).
	// DELETE (sans query param) → suppression logique (soft delete = actif=false).
	if r.URL.Query().Get("hard") == "true" {
		nom, err := s.filiereUC.HardDelete(r.Context(), claims, id)
		if err != nil {
			middleware.MapDomainError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message":    fmt.Sprintf("Filière « %s » supprimée définitivement", nom),
			"hardDelete": true,
		})
		return
	}

	// Soft delete (comportement par défaut, rétro-compatible)
	existing, updated, err := s.filiereUC.SoftDelete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	_ = existing
	// Best-effort : on récupère les dépendances pour le toast frontend.
	// (les counts sont les mêmes avant/après soft-delete car actif=false
	// ne change pas les FK).
	deps, _ := s.filiereUC.GetDependencies(r.Context(), claims, id)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":      "Filière désactivée (suppression logique)",
		"filiere":      updated,
		"dependencies": deps,
	})
}

// getFiliereDependencies — GET /api/filieres/{id}/dependencies.
//
// BUGFIX (FILIERES-CRITICAL-FIX-1) : nouvel endpoint pour permettre au
// frontend (handleOpenDelete) de preview les dépendances actives avant de
// confirmer le soft-delete, et de bloquer la confirmation si !CanDelete.
func (s *Server) getFiliereDependencies(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	deps, err := s.filiereUC.GetDependencies(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(deps)
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
	_ = json.NewEncoder(w).Encode(map[string]any{
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
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	// Header
	_, _ = w.Write([]byte("Nom,Code,Établissement,Responsable,Étudiants,Statut,Date création\n"))
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
		_, _ = w.Write([]byte(csvEscape(f.Nom) + "," + csvEscape(code) + ",," + "," + csvEscape(nbEtu) + "," + statut + "," + date + "\n"))
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
	_ = json.NewEncoder(w).Encode(map[string]any{"unitesEnseignement": ues})
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
	_ = json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
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
	_ = json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
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
	_ = json.NewEncoder(w).Encode(map[string]any{"uniteEnseignement": ue})
}

// deleteUE — DELETE /api/unites-enseignement/{id}
// Par défaut : soft delete (actif=false, réversible via toggle "Afficher UE désactivées").
// Avec ?hard=true : hard delete (DELETE réel, irréversible). Les entités liées
// en CASCADE (Affectation, Devoir, ValidationUE) seront supprimées automatiquement.
// Le frontend doit avertir l'utilisateur (via getUEDependencies) avant d'appeler hard.
func (s *Server) deleteUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	hard := r.URL.Query().Has("hard") && r.URL.Query().Get("hard") != "false" && r.URL.Query().Get("hard") != "0"
	if hard {
		if err := s.ueUC.HardDelete(r.Context(), claims, id); err != nil {
			middleware.MapDomainError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": "Unité d'enseignement supprimée définitivement",
		})
		return
	}
	ue, err := s.ueUC.SoftDelete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"uniteEnseignement": ue,
		"message":           "Unité d'enseignement désactivée avec succès",
	})
}

// getUEDependencies — GET /api/unites-enseignement/{id}/dependencies
// PROG-ACAD-CRITICAL-FIX-1 (BUG #1) : retourne les comptes d'entités liées
// à une UE (épreuves, affectations, documents) pour avertir l'utilisateur
// avant suppression. CanDelete=false si des dépendances actives existent.
func (s *Server) getUEDependencies(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	deps, err := s.ueUC.GetDependencies(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(deps)
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
		Niveau:          r.URL.Query().Get("niveau"), // PROG-ACAD-CRITICAL-FIX-1 (BUG #7)
	}
	assignments, err := s.efUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"assignments": assignments})
}

// createEnseignantFilieres — POST /api/enseignant-filieres
//
// BUGFIX (PROG-ACAD-CRITICAL-FIX-1) : le frontend enseignants-page.tsx envoie
// du bulk `{assignments: [...]}` (CreateAssignmentsInput) mais l'ancien handler
// décodait un seul `CreateAssignmentInput` → Go's json.Decoder ignore les champs
// inconnus, donc le décodage réussissait mais tous les champs étaient vides →
// `efUC.Create` retournait `ValidationError{enseignantId: "requis"}` → 400
// silencieux côté UI. On accepte désormais les deux formats (bulk ET single
// rétro-compatible) en une seule passe de décodage.
func (s *Server) createEnseignantFilieres(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// PROG-ACAD-CRITICAL-FIX-1 : décodage bulk {assignments:[...]} ET single
	// (rétro-compat) en une seule passe. Si `assignments` est non vide, on est
	// en bulk ; sinon on retombe sur les champs single (EnseignantID/FiliereID/Niveau).
	var body struct {
		Assignments  []domain.CreateAssignmentInput `json:"assignments"`
		EnseignantID string                         `json:"enseignantId"`
		FiliereID    string                         `json:"filiereId"`
		Niveau       string                         `json:"niveau"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide (attendu: {assignments: [...]} ou {enseignantId, filiereId, niveau})")
		return
	}

	// Branche bulk (format par défaut du frontend enseignants-page.tsx).
	if len(body.Assignments) > 0 {
		created := make([]any, 0, len(body.Assignments))
		errs := make([]any, 0)
		for _, input := range body.Assignments {
			ef, err := s.efUC.Create(r.Context(), claims, input)
			if err != nil {
				errs = append(errs, map[string]any{
					"input": input,
					"error": err.Error(),
				})
				continue
			}
			created = append(created, ef)
		}

		status := http.StatusCreated
		switch {
		case len(created) == 0 && len(errs) > 0:
			status = http.StatusBadRequest // 400 si tout a échoué (validation pattern)
		case len(errs) > 0:
			status = http.StatusMultiStatus // 207 partial
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"assignments": created,
			"errors":      errs,
		})
		return
	}

	// Branche single (rétro-compat — non utilisée par le frontend actuel mais
	// on préserve l'API pour d'éventuels clients directs).
	input := domain.CreateAssignmentInput{
		EnseignantID: body.EnseignantID,
		FiliereID:    body.FiliereID,
		Niveau:       body.Niveau,
	}
	if input.EnseignantID == "" && input.FiliereID == "" && input.Niveau == "" {
		writeJSONError(w, http.StatusBadRequest, "assignments requis (format attendu: {assignments: [...]})")
		return
	}
	ef, err := s.efUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"assignments": []any{ef}})
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
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Affectation supprimée avec succès"})
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
	_ = json.NewEncoder(w).Encode(annees) // bare array
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
	_ = json.NewEncoder(w).Encode(a) // bare object
}

// getAnnee — GET /api/annees-academiques/{id}
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9) : CRUD AnneeAcademique complet.
func (s *Server) getAnnee(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	a, err := s.anneeUC.FindByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(a)
}

// updateAnnee — PATCH /api/annees-academiques/{id}
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (s *Server) updateAnnee(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	var input domain.UpdateAnneeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	a, err := s.anneeUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(a)
}

// deleteAnnee — DELETE /api/annees-academiques/{id}
// Par défaut : soft delete (actif=false, réversible). Avec ?hard=true :
// hard delete (DELETE réel, irréversible). Les FKs SET NULL sur Epreuve,
// Etablissement.anneeAcademiqueCouranteId perdront leur référence ; les FKs
// CASCADE sur Inscription/ValidationUE/PromotionBatch détruiront ces lignes.
//
// SECT-ANNEE-HARDDELETE-SAFE-1 : le usecase HardDelete vérifie désormais les
// dépendances avant suppression. Si l'année possède au moins une dépendance
// (inscription/validation/batch/épreuve/établissement), il renvoie un
// ConflictError (HTTP 409) listant les counts dans le message — pour empêcher
// la perte de données catastrophique.
func (s *Server) deleteAnnee(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	hard := r.URL.Query().Has("hard") && r.URL.Query().Get("hard") != "false" && r.URL.Query().Get("hard") != "0"
	if hard {
		if err := s.anneeUC.HardDelete(r.Context(), claims, id); err != nil {
			middleware.MapDomainError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": "Année académique supprimée définitivement",
		})
		return
	}
	a, err := s.anneeUC.SoftDelete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"anneeAcademique": a,
		"message":         "Année académique désactivée avec succès",
	})
}

// getAnneeDependencies — GET /api/annees-academiques/{id}/dependencies
//
// SECT-ANNEE-HARDDELETE-SAFE-1 : nouvel endpoint pour permettre au frontend de
// prévisualiser les dépendances avant de confirmer un hard-delete. Retourne
// 5 counts (inscriptions, validationsUE, promotionBatches, epreuves,
// etablissements) + un flag canHardDelete (true si tous les counts valent 0).
//
// Le frontend ouvre le dialogue de confirmation hard-delete uniquement si
// canHardDelete=true, sinon affiche un avertissement listant les counts et
// demande à l'utilisateur de cocher une case « Je comprends que ces données
// seront définitivement supprimées ».
func (s *Server) getAnneeDependencies(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	deps, err := s.anneeUC.GetDependencies(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(deps)
}
