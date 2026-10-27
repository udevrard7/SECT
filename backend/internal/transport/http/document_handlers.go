package http

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/worker"
)

// document_handlers.go — handlers HTTP pour Documents.

// listDocuments — GET /api/documents
func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	docs, err := s.documentUC.List(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"documents": docs})
}

// getDocument — GET /api/documents/{id}
func (s *Server) getDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.documentUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"document": doc})
}

// getDocumentChapters — GET /api/documents/{id}/chapters
// SECT-BIBLIO-P2.5 (ADR-0007 §P2.5) : chapitres du support (découpage IA)
// pour le sélecteur « support, chap. X » du rattachement de questions.
func (s *Server) getDocumentChapters(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	chapters, err := s.documentUC.ListChapters(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"chapters": chapters})
}

// uploadDocument — POST /api/documents (multipart/form-data)
func (s *Server) uploadDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Limite 50 MB
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)

	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier trop volumineux ou formulaire invalide (max 50MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier 'file' requis")
		return
	}
	defer func() { _ = file.Close() }()

	// Lire le contenu du fichier
	content, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "lecture du fichier échouée")
		return
	}

	// uniteEnseignementId optionnel
	var ueID *string
	if v := r.FormValue("uniteEnseignementId"); v != "" {
		ueID = &v
	}

	result, err := s.documentUC.Upload(r.Context(), claims, header.Filename, content, ueID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

// deleteDocument — DELETE /api/documents/{id} (soft delete + R2 cleanup)
func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.documentUC.SoftDelete(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Document déplacé vers la corbeille"})
}

// batchDeleteDocuments — DELETE /api/documents (batch soft delete)
// BUGFIX (CORBEILLE-1) : endpoint manquant — le frontend appelait
// DELETE /api/documents avec { ids: [...] } qui n'existait pas → 404.
func (s *Server) batchDeleteDocuments(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if len(body.IDs) == 0 {
		writeJSONError(w, http.StatusBadRequest, "ids requis")
		return
	}

	deleted := 0
	for _, id := range body.IDs {
		if err := s.documentUC.SoftDelete(r.Context(), claims, id); err != nil {
			// Continue sur les autres documents en cas d'erreur individuelle
			continue
		}
		deleted++
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": fmt.Sprintf("%d document(s) déplacé(s) vers la corbeille", deleted),
		"deleted": deleted,
	})
}

// downloadDocument — GET /api/documents/{id}/download (presigned URL)
func (s *Server) downloadDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	expiresIn := 3600
	if v := r.URL.Query().Get("expiresIn"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 86400 {
			expiresIn = n
		}
	}

	url, err := s.documentUC.GetDownloadURL(r.Context(), claims, id, expiresIn)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": url})
}

// analyzeDocument — POST /api/documents/{id}/analyze (P1-D3, SECT-DOC-IA-1)
// Déclenche (ou re-déclenche) l'analyse IA d'un document.
//
// SECT-DOC-IA-1 : le handler vérifie l'ownership, garantit un contenuTexte
// (re-télécharge le fichier depuis R2 et re-extrait le texte si besoin —
// les documents déposés avant la v2 d'extraction restaient inanalysables
// à jamais), pose statutAnalyse=EN_COURS, et envoie un job FORCÉ au worker
// (purge des anciens chapitres + régénération complète). Retourne 202.
func (s *Server) analyzeDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}

	docID := chi.URLParam(r, "id")
	if docID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	// Vérifier ownership + récupérer le document (avec re-extraction si le
	// texte manque : PDF d'avant la v2, extraction échouée au dépôt…).
	doc, err := s.documentUC.EnsureContenuTexte(r.Context(), claims, docID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Vérifier qu'il y a du contenu à analyser APRÈS la tentative de
	// re-extraction (message actionnable si toujours rien).
	if doc.ContenuTexte == nil || *doc.ContenuTexte == "" {
		detail := "ce document n'a pas de contenu texte à analyser"
		if doc.ErreurAnalyse != nil && *doc.ErreurAnalyse != "" {
			detail = *doc.ErreurAnalyse
		}
		writeJSONError(w, http.StatusBadRequest, detail)
		return
	}

	// Mettre à jour le statut à EN_COURS (sans toucher à l'analyse courante
	// — sémantique COALESCE : l'ancienne carte pédagogique reste visible
	// jusqu'au résultat de la nouvelle).
	enCours := domain.StatutAnalyseEnCours
	_ = s.documentUC.UpdateAnalysis(r.Context(), claims, docID, domain.UpdateAnalysisInput{
		StatutAnalyse:      &enCours,
		ClearErreurAnalyse: true,
	})

	// Enqueue le job d'analyse — FORCÉ : une re-analyse remplace la carte
	// pédagogique existante (purge des chapitres côté worker).
	job := worker.DocumentAnalysisJob{DocumentID: docID, Force: true}
	select {
	case worker.DocumentAnalysisQueue <- job:
		// OK
	default:
		writeJSONError(w, http.StatusServiceUnavailable, "file d'analyse pleine, réessayez")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":     "EN_COURS",
		"documentId": docID,
		"message":    "Analyse IA lancée. Chapitres, thèmes, concepts clés et résumé pédagogique seront mis à jour dans un instant.",
	})
}
