package http

import (
        "encoding/json"
        "io"
        "net/http"
        "strconv"

        "github.com/go-chi/chi/v5"
        "github.com/udevrard7/sect/apps/api/internal/middleware"
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
        json.NewEncoder(w).Encode(map[string]any{"documents": docs})
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
        json.NewEncoder(w).Encode(map[string]any{"document": doc})
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
        defer file.Close()

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
        json.NewEncoder(w).Encode(result)
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
        json.NewEncoder(w).Encode(map[string]string{"message": "Document déplacé vers la corbeille"})
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
        json.NewEncoder(w).Encode(map[string]string{"url": url})
}
