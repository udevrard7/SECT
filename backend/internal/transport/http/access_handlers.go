package http

import (
        "encoding/json"
        "log/slog"
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

        // DEBUG-ACCESS : log les claims pour diagnostiquer pourquoi le responsable
        // ne voit pas les demandes (accessRecords: null).
        slog.Info("listAccess claims debug",
                "userID", claims.UserID,
                "role", claims.Role,
                "etablissementID", claims.EtablissementID,
                "etablissementID_len", len(claims.EtablissementID),
        )

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

// deleteAccess — DELETE /api/etablissement-access/{id}
// ACCES-ETABLISSEMENTS-FIX-AE1 : annule (supprime) une demande d'accès.
// Le usecase vérifie l'ownership (adminId == claims.UserID pour ADMIN) et
// le statut (EN_ATTENTE uniquement).
func (s *Server) deleteAccess(w http.ResponseWriter, r *http.Request) {
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

        if err := s.accessUC.Delete(r.Context(), claims, id); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "demande d'accès annulée"})
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
