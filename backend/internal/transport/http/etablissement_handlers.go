package http

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// etablissement_handlers.go — handlers HTTP pour le domaine Etablissements.

// listEtablissements — GET /api/etablissements
func (s *Server) listEtablissements(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	params := domain.EtablissementListParams{
		Search: r.URL.Query().Get("search"),
		Type:   r.URL.Query().Get("type"),
		Actif:  parseBoolQueryParam(r.URL.Query().Get("actif")),
	}

	etabs, err := s.etabUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"etablissements": etabs})
}

// getEtablissement — GET /api/etablissements/{id}
func (s *Server) getEtablissement(w http.ResponseWriter, r *http.Request) {
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

	etab, err := s.etabUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"etablissement": etab})
}

// createEtablissement — POST /api/etablissements (ADMIN only)
func (s *Server) createEtablissement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.CreateEtablissementInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	etab, err := s.etabUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"etablissement": etab})
}

// updateEtablissement — PATCH /api/etablissements/{id}
func (s *Server) updateEtablissement(w http.ResponseWriter, r *http.Request) {
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

	var input domain.UpdateEtablissementInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	etab, err := s.etabUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"etablissement": etab})
}

// deleteEtablissement — DELETE /api/etablissements/{id} (ADMIN only)
func (s *Server) deleteEtablissement(w http.ResponseWriter, r *http.Request) {
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

	if err := s.etabUC.Delete(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "établissement supprimé"})
}

// uploadLogo — POST /api/etablissements/upload-logo (multipart/form-data)
func (s *Server) uploadLogo(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Limite 2MB
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)

	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier trop volumineux ou formulaire invalide (max 2MB)")
		return
	}

	etabID := r.FormValue("etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier 'file' requis")
		return
	}
	defer file.Close()

	// Valider le type MIME
	contentType := header.Header.Get("Content-Type")
	allowedTypes := map[string]string{
		"image/png":     "image/png",
		"image/jpeg":    "image/jpeg",
		"image/jpg":     "image/jpeg",
		"image/webp":    "image/webp",
		"image/svg+xml": "image/svg+xml",
	}
	mime, ok := allowedTypes[contentType]
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "type de fichier non autorisé (png, jpeg, webp, svg)")
		return
	}

	// Lire et convertir en data URL base64
	data, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "lecture du fichier échouée")
		return
	}

	dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)

	etab, err := s.etabUC.UpdateLogo(r.Context(), claims, etabID, dataURL)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"logo":          dataURL,
		"etablissement": etab,
	})
}

// getWatermark — GET /api/etablissements/{id}/watermark
func (s *Server) getWatermark(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	cfg, err := s.etabUC.GetWatermark(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"config": cfg})
}

// updateWatermark — PATCH /api/etablissements/{id}/watermark
func (s *Server) updateWatermark(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	var cfg domain.WatermarkConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	result, err := s.etabUC.UpdateWatermark(r.Context(), claims, id, cfg)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": "Configuration mise à jour",
		"config":  result,
	})
}
