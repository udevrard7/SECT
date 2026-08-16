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
        _ = json.NewEncoder(w).Encode(map[string]any{"etablissements": etabs})
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
        _ = json.NewEncoder(w).Encode(map[string]any{"etablissement": etab})
}

// createEtablissement — POST /api/etablissements (ADMIN only)
//
// ABONNEMENTS-FIX-A3 : si le body contient responsableEmail + planId, le usecase
// crée en plus (transaction atomique) un responsable + un abonnement. La réponse
// est alors enrichie avec responsable.temporaryPassword (mode direct) ou
// invitation.token/expiresAt (mode invitation) + abonnement.planNom.
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

        result, err := s.etabUC.Create(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        resp := map[string]any{"etablissement": result.Etablissement}
        // ABONNEMENTS-FIX-A3 : champs wizard (uniquement si wizard a été déclenché).
        if result.TemporaryPassword != "" {
                resp["responsable"] = map[string]any{
                        "temporaryPassword": result.TemporaryPassword,
                }
        }
        if result.InvitationToken != "" {
                resp["invitation"] = map[string]any{
                        "token":     result.InvitationToken,
                        "expiresAt": result.InvitationExpiresAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
                }
        }
        if result.AbonnementID != "" {
                resp["abonnement"] = map[string]any{
                        "id":     result.AbonnementID,
                        "planNom": result.PlanNom,
                }
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        _ = json.NewEncoder(w).Encode(resp)
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
        _ = json.NewEncoder(w).Encode(map[string]any{"etablissement": etab})
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
        _ = json.NewEncoder(w).Encode(map[string]string{"message": "établissement supprimé"})
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
        defer func() { _ = file.Close() }()

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
        _ = json.NewEncoder(w).Encode(map[string]any{
                "logo":          dataURL,
                "etablissement": etab,
        })
}

// deleteLogo — DELETE /api/etablissements/{id}/logo
// PARAMETRES-FIX-P3 : endpoint dédié pour supprimer le logo.
// Le champ Logo a été retiré de UpdateEtablissementInput (fix E5 sécurité),
// donc un PATCH {logo: null} était silencieusement ignoré. Cet endpoint dédié
// utilise ClearLogo (SET logo = NULL).
//
// PARAMETRES-FIX-P3b : corrige le bug où deleteLogo appelait UpdateLogo(ctx,
// claims, id, "") qui était rejeté par la validation "données logo requises"
// → suppression toujours en échec. Utilise désormais ClearLogo.
func (s *Server) deleteLogo(w http.ResponseWriter, r *http.Request) {
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

        // ClearLogo met le logo à NULL (repo fait SET "logo" = NULL).
        etab, err := s.etabUC.ClearLogo(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "message":       "logo supprimé",
                "etablissement": etab,
        })
}

// getCurrentAnnee — GET /api/etablissements/{id}/annee-courante
// Migration 000017 : retourne l'année académique courante de l'établissement
// (ou null si non définie). Utilisé par /programme-academique et /affectations
// pour initialiser le filtre/sélecteur d'année par défaut.
func (s *Server) getCurrentAnnee(w http.ResponseWriter, r *http.Request) {
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
        annee, err := s.etabUC.GetCurrentAnnee(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "anneeCourante": annee, // nil si non définie
        })
}

// setCurrentAnnee — POST /api/etablissements/{id}/annee-courante
// Body: { "anneeId": "..." }. Définit l'année académique courante.
// Le usecase valide les permissions (ADMIN/RESPONSABLE propriétaire) et le
// repo valide en SQL que l'année appartient à l'établissement.
func (s *Server) setCurrentAnnee(w http.ResponseWriter, r *http.Request) {
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
        var body struct {
                AnneeID string `json:"anneeId"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if body.AnneeID == "" {
                writeJSONError(w, http.StatusBadRequest, "anneeId requis")
                return
        }
        etab, err := s.etabUC.SetCurrentAnnee(r.Context(), claims, id, body.AnneeID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "message":       "année courante mise à jour",
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
        _ = json.NewEncoder(w).Encode(map[string]any{"config": cfg})
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
        _ = json.NewEncoder(w).Encode(map[string]any{
                "message": "Configuration mise à jour",
                "config":  result,
        })
}

// P3b-CERTIFICATS : handlers pour /api/certificats/watermark-config
// Le frontend watermark-config-panel.tsx appelle ces routes sans etablissementId.
// On utilise claims.EtablissementID (l'établissement de l'utilisateur courant).

// getWatermarkConfig — GET /api/certificats/watermark-config
func (s *Server) getWatermarkConfig(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        if claims.EtablissementID == "" {
                // ADMIN sans établissement → retourner default
                w.Header().Set("Content-Type", "application/json")
                _ = json.NewEncoder(w).Encode(map[string]any{
                        "config": domain.WatermarkConfig{
                                CertWatermarkText:    "ORIGINAL",
                                CertWatermarkEnabled: true,
                                CertWatermarkOpacity: 0.04,
                                CertWatermarkColor:   "#1B3A5C",
                                CertWatermarkPattern: "diamond",
                        },
                })
                return
        }
        cfg, err := s.etabUC.GetWatermark(r.Context(), claims, claims.EtablissementID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{"config": cfg})
}

// updateWatermarkConfig — PATCH /api/certificats/watermark-config
func (s *Server) updateWatermarkConfig(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        if claims.EtablissementID == "" {
                writeJSONError(w, http.StatusBadRequest, "établissement requis (ADMIN n'a pas d'établissement)")
                return
        }
        var cfg domain.WatermarkConfig
        if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        result, err := s.etabUC.UpdateWatermark(r.Context(), claims, claims.EtablissementID, cfg)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "message": "Configuration mise à jour",
                "config":  result,
        })
}
