// Package http — implémentation des stubs restants (STUBS-FIX-2).
package http

import (
        "encoding/json"
        "fmt"
        "net/http"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// 1. GET /api/security-settings — SecuritySettings (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) securitySettingsGetReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type secSettings struct {
                ID                    string  `json:"id"`
                EtablissementID       string  `json:"etablissementId"`
                ProctoringActif      bool    `json:"proctoringActif"`
                DetectionCopie       bool    `json:"detectionCopie"`
                DetectionOnglet      bool    `json:"detectionOnglet"`
                DetectionFullscreen  bool    `json:"detectionFullscreen"`
                BlocageCopie         bool    `json:"blocageCopie"`
                BlocageClicDroit     bool    `json:"blocageClicDroit"`
                BlocageImpression    bool    `json:"blocageImpression"`
                VerificationIdentite bool    `json:"verificationIdentite"`
                TempsInactiviteMax   int     `json:"tempsInactiviteMax"`
                NbOngletsMax         int     `json:"nbOngletsMax"`
                NbAlertesMax         int     `json:"nbAlertesMax"`
                AutoSubmitOnViolation bool   `json:"autoSubmitOnViolation"`
                CaptureEcran         bool    `json:"captureEcran"`
                RapportFraude        bool    `json:"rapportFraude"`
                SeuilSimilarite      float64 `json:"seuilSimilarite"`
                PenaliteFullscreenExit int   `json:"penaliteFullscreenExit"`
                FullscreenObligatoire bool   `json:"fullscreenObligatoire"`
                IntervalleCaptureEcran int   `json:"intervalleCaptureEcran"`
        }

        result := &secSettings{}
        found := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Scope par etablissementId si fourni, sinon prendre le 1er
                etabID := r.URL.Query().Get("etablissementId")
                var row pgx.Row
                if etabID != "" {
                        row = tx.QueryRow(r.Context(), `
                                SELECT "id", "etablissementId", "proctoringActif", "detectionCopie",
                                       "detectionOnglet", "detectionFullscreen", "blocageCopie",
                                       "blocageClicDroit", "blocageImpression", "verificationIdentite",
                                       "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
                                       "autoSubmitOnViolation", "captureEcran", "rapportFraude",
                                       "seuilSimilarite", "penaliteFullscreenExit", "fullscreenObligatoire",
                                       "intervalleCaptureEcran"
                                FROM "SecuritySettings" WHERE "etablissementId" = $1
                        `, etabID)
                } else {
                        row = tx.QueryRow(r.Context(), `
                                SELECT "id", "etablissementId", "proctoringActif", "detectionCopie",
                                       "detectionOnglet", "detectionFullscreen", "blocageCopie",
                                       "blocageClicDroit", "blocageImpression", "verificationIdentite",
                                       "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
                                       "autoSubmitOnViolation", "captureEcran", "rapportFraude",
                                       "seuilSimilarite", "penaliteFullscreenExit", "fullscreenObligatoire",
                                       "intervalleCaptureEcran"
                                FROM "SecuritySettings" ORDER BY "updatedAt" DESC LIMIT 1
                        `)
                }
                err := row.Scan(
                        &result.ID, &result.EtablissementID, &result.ProctoringActif, &result.DetectionCopie,
                        &result.DetectionOnglet, &result.DetectionFullscreen, &result.BlocageCopie,
                        &result.BlocageClicDroit, &result.BlocageImpression, &result.VerificationIdentite,
                        &result.TempsInactiviteMax, &result.NbOngletsMax, &result.NbAlertesMax,
                        &result.AutoSubmitOnViolation, &result.CaptureEcran, &result.RapportFraude,
                        &result.SeuilSimilarite, &result.PenaliteFullscreenExit, &result.FullscreenObligatoire,
                        &result.IntervalleCaptureEcran,
                )
                if err == nil {
                        found = true
                }
                return nil
        })

        if !found {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]any{"settings": map[string]any{}})
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"settings": result})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/surveillance/stats — stub supprimé (SURVEILLANCE-FIX-2 S11).
// Remplacé par surveillanceStatsV2 dans surveillance_handlers_v2.go.
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// 3. GET /api/etudiants — User (ETUDIANT) avec filiere + niveau
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) etudiantsListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type etudiant struct {
                ID          string  `json:"id"`
                Name        string  `json:"name"`
                Email       string  `json:"email"`
                Matricule   *string `json:"matricule,omitempty"`
                Actif       bool    `json:"actif"`
                FiliereID   *string `json:"filiereId,omitempty"`
                Niveau      *string `json:"niveau,omitempty"`
                Filiere     *struct {
                        ID  string `json:"id"`
                        Nom string `json:"nom"`
                } `json:"filiere,omitempty"`
        }

        result := []etudiant{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                search := r.URL.Query().Get("search")
                filiereID := r.URL.Query().Get("filiereId")
                limit := 100
                if l := r.URL.Query().Get("limit"); l != "" {
                        if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
                                limit = n
                        }
                }

                var args []any
                argIdx := 1
                var where []string
                where = append(where, `u."role" = 'ETUDIANT'`)
                if search != "" {
                        where = append(where, fmt.Sprintf(`(u."name" ILIKE $%d OR u."email" ILIKE $%d OR u."matricule" ILIKE $%d)`, argIdx, argIdx, argIdx))
                        args = append(args, "%"+search+"%")
                        argIdx++
                }
                if filiereID != "" {
                        where = append(where, fmt.Sprintf(`u."filiereId" = $%d`, argIdx))
                        args = append(args, filiereID)
                        argIdx++
                }

                query := fmt.Sprintf(`
                        SELECT u."id", u."name", u."email", u."matricule", u."actif",
                               u."filiereId", u."niveau", f."id", f."nom"
                        FROM "User" u
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        WHERE %s
                        ORDER BY u."name"
                        LIMIT $%d
                `, joinStringsArr(where, " AND "), argIdx)
                args = append(args, limit)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        e := etudiant{}
                        var filID, filNom *string
                        if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.Matricule, &e.Actif,
                                &e.FiliereID, &e.Niveau, &filID, &filNom); err != nil {
                                return err
                        }
                        if filID != nil && filNom != nil {
                                e.Filiere = &struct {
                                        ID  string `json:"id"`
                                        Nom string `json:"nom"`
                                }{ID: *filID, Nom: *filNom}
                        }
                        result = append(result, e)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "etudiants": result,
                "total":     len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/factures — Facture (0 row, mais endpoint réel pour futures données)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) facturesListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type facture struct {
                ID              string   `json:"id"`
                EtablissementID string   `json:"etablissementId"`
                AbonnementID    *string  `json:"abonnementId,omitempty"`
                Montant         float64  `json:"montant"`
                Statut          string   `json:"statut"`
                DateFacture     string   `json:"dateFacture"`
                DatePaiement    *string  `json:"datePaiement,omitempty"`
        }

        result := []facture{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "etablissementId", "abonnementId", "montant",
                               "statut"::text, "dateFacture", "datePaiement"
                        FROM "Facture"
                        ORDER BY "dateFacture" DESC
                        LIMIT 100
                `)
                if err != nil {
                        return nil // table peut ne pas exister ou colonnes différentes
                }
                defer rows.Close()
                for rows.Next() {
                        f := facture{}
                        var dateFacture time.Time
                        var datePaiement *time.Time
                        if err := rows.Scan(&f.ID, &f.EtablissementID, &f.AbonnementID, &f.Montant,
                                &f.Statut, &dateFacture, &datePaiement); err == nil {
                                f.DateFacture = dateFacture.UTC().Format(time.RFC3339)
                                if datePaiement != nil {
                                        ts := datePaiement.UTC().Format(time.RFC3339)
                                        f.DatePaiement = &ts
                                }
                                result = append(result, f)
                        }
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "factures": result,
                "total":    len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 5. GET /api/monitoring — MonitoringEvent (0 row)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) monitoringEventsReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type event struct {
                ID        string  `json:"id"`
                Type      string  `json:"type"`
                Severity  string  `json:"severity"`
                Message   string  `json:"message"`
                Resolved  bool    `json:"resolved"`
                CreatedAt string  `json:"createdAt"`
        }

        result := []event{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "type"::text, "severity"::text, "message", "resolved", "createdAt"
                        FROM "MonitoringEvent"
                        ORDER BY "createdAt" DESC
                        LIMIT 100
                `)
                if err != nil {
                        return nil
                }
                defer rows.Close()
                for rows.Next() {
                        e := event{}
                        var createdAt time.Time
                        if err := rows.Scan(&e.ID, &e.Type, &e.Severity, &e.Message, &e.Resolved, &createdAt); err == nil {
                                e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                                result = append(result, e)
                        }
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "events": result,
                "total":  len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET /api/ip-whitelist — IpWhitelist (0 row)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) ipWhitelistListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // PARAMETRES-FIX-P7 : filtre par etablissementId (paramètre bindé, anti-injection).
        // Avant : le handler ignorait le query param ?etablissementId=X → un ADMIN voyait
        // toutes les IPs de tous les établissements mélangées.
        etabID := r.URL.Query().Get("etablissementId")

        type ipEntry struct {
                ID             string  `json:"id"`
                AdresseIP      string  `json:"adresseIp"`
                Description    *string `json:"description,omitempty"`
                EtablissementID *string `json:"etablissementId,omitempty"`
                Actif          bool    `json:"actif"`
                CreatedAt      string  `json:"createdAt"`
        }

        result := []ipEntry{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var rows pgx.Rows
                var err error
                if etabID != "" {
                        // PARAMETRES-FIX-P1 (bindé) : filtre par établissement.
                        rows, err = tx.Query(r.Context(), `
                                SELECT "id", "adresseIp", "description", "etablissementId", "actif", "createdAt"
                                FROM "IpWhitelist"
                                WHERE "etablissementId" = $1
                                ORDER BY "createdAt" DESC
                        `, etabID)
                } else {
                        rows, err = tx.Query(r.Context(), `
                                SELECT "id", "adresseIp", "description", "etablissementId", "actif", "createdAt"
                                FROM "IpWhitelist"
                                ORDER BY "createdAt" DESC
                        `)
                }
                if err != nil {
                        return nil
                }
                defer rows.Close()
                for rows.Next() {
                        ip := ipEntry{}
                        var createdAt time.Time
                        if err := rows.Scan(&ip.ID, &ip.AdresseIP, &ip.Description, &ip.EtablissementID, &ip.Actif, &createdAt); err == nil {
                                ip.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                                result = append(result, ip)
                        }
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        // PARAMETRES-FIX-P9 : clé "entries" (et non "ips") pour matcher le type frontend
        // IpWhitelistEntry[] attendu par responsable-parametres-page.tsx.
        json.NewEncoder(w).Encode(map[string]any{
                "entries": result,
                "total":   len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// PARAMETRES-FIX-P2 : mutations IpWhitelist (POST/PATCH/DELETE).
// Avant : seules les GET étaient déclarées → ajout/toggle/suppression IP
// retournaient 404. RLS policy IpWhitelist_modify filtre par etablissementId
// + (is_admin() OR is_responsable()).
// ──────────────────────────────────────────────────────────────────────────

// createIpWhitelist — POST /api/ip-whitelist
func (s *Server) createIpWhitelist(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                AdresseIP      string  `json:"adresseIp"`
                Description    *string `json:"description"`
                EtablissementID string `json:"etablissementId"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.AdresseIP == "" {
                writeJSONError(w, http.StatusBadRequest, "adresseIp requis")
                return
        }
        if len(input.AdresseIP) > 100 {
                writeJSONError(w, http.StatusBadRequest, "adresseIp trop long (max 100)")
                return
        }
        if input.EtablissementID == "" {
                writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
                return
        }

        type ipEntry struct {
                ID              string  `json:"id"`
                AdresseIP       string  `json:"adresseIp"`
                Description     *string `json:"description,omitempty"`
                EtablissementID string  `json:"etablissementId"`
                Actif           bool    `json:"actif"`
                CreatedAt       string  `json:"createdAt"`
        }

        created := ipEntry{}
        found := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "ipwl_" + uuid.NewString()
                var createdAt time.Time
                err := tx.QueryRow(r.Context(), `
                        INSERT INTO "IpWhitelist" ("id", "adresseIp", "description", "etablissementId", "creePar", "actif", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, true, now())
                        RETURNING "id", "adresseIp", "description", "etablissementId", "actif", "createdAt"
                `, newID, input.AdresseIP, input.Description, input.EtablissementID, claims.UserID).Scan(
                        &created.ID, &created.AdresseIP, &created.Description, &created.EtablissementID, &created.Actif, &createdAt,
                )
                if err == nil {
                        created.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        found = true
                }
                return nil
        })

        if !found {
                // RLS a bloqué l'INSERT (établissement non autorisé) ou autre erreur.
                writeJSONError(w, http.StatusForbidden, "création non autorisée pour cet établissement")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"entry": created})
}

// updateIpWhitelist — PATCH /api/ip-whitelist/{id}
func (s *Server) updateIpWhitelist(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var input struct {
                Actif *bool `json:"actif"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Actif == nil {
                writeJSONError(w, http.StatusBadRequest, "actif requis (booléen)")
                return
        }

        type ipEntry struct {
                ID              string  `json:"id"`
                AdresseIP       string  `json:"adresseIp"`
                Description     *string `json:"description,omitempty"`
                EtablissementID string  `json:"etablissementId"`
                Actif           bool    `json:"actif"`
                CreatedAt       string  `json:"createdAt"`
        }

        updated := ipEntry{}
        found := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var createdAt time.Time
                err := tx.QueryRow(r.Context(), `
                        UPDATE "IpWhitelist" SET "actif" = $1 WHERE "id" = $2
                        RETURNING "id", "adresseIp", "description", "etablissementId", "actif", "createdAt"
                `, *input.Actif, id).Scan(
                        &updated.ID, &updated.AdresseIP, &updated.Description, &updated.EtablissementID, &updated.Actif, &createdAt,
                )
                if err == nil {
                        updated.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        found = true
                }
                return nil
        })

        if !found {
                // RLS a bloqué (entry d'un autre établissement) ou ID inexistant.
                writeJSONError(w, http.StatusNotFound, "entrée non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"entry": updated})
}

// deleteIpWhitelist — DELETE /api/ip-whitelist/{id}
func (s *Server) deleteIpWhitelist(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        deleted := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `DELETE FROM "IpWhitelist" WHERE "id" = $1`, id)
                if err == nil && tag.RowsAffected() > 0 {
                        deleted = true
                }
                return nil
        })

        if !deleted {
                // RLS a bloqué (entry d'un autre établissement) ou ID inexistant.
                writeJSONError(w, http.StatusNotFound, "entrée non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "entrée supprimée"})
}

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/corbeille — soft-deleted items (Epreuve + Document + Question + Devoir)
//
// CORBEILLE-FIX-2 (P2) :
//   - C6 : DTO Question avec document nested ({id, nomFichier}) au lieu de flat.
//   - C7 : DTOs Epreuve/Devoir avec uniteEnseignement nested ({id, code, nom}).
//   - C8 : dates (dateUpload, dateDebut, dateFin, dateLimite) formatées en RFC3339.
//   - C11 : LIMIT 200 par type pour éviter payload lourd.
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) corbeilleListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // C6 : document nested pour Question (au lieu de documentId/documentNom plats).
        type docRef struct {
                ID         string `json:"id"`
                NomFichier string `json:"nomFichier,omitempty"`
        }
        // C7 : uniteEnseignement nested pour Epreuve et Devoir.
        type ueRef struct {
                ID   string `json:"id"`
                Code string `json:"code,omitempty"`
                Nom  string `json:"nom,omitempty"`
        }
        type deletedDocument struct {
                ID            string  `json:"id"`
                NomFichier    string  `json:"nomFichier"`
                TailleFichier *int64  `json:"tailleFichier"`
                TypeMime      *string `json:"typeMime"`
                DateUpload    string  `json:"dateUpload"`
                DeletedAt     string  `json:"deletedAt"`
        }
        type deletedQuestion struct {
                ID         string  `json:"id"`
                Type       string  `json:"type"`
                Enonce     string  `json:"enonce"`
                Difficulte string  `json:"difficulte"`
                Validee    bool    `json:"validee"`
                DeletedAt  string  `json:"deletedAt"`
                Document   *docRef `json:"document"`
        }
        type deletedEpreuve struct {
                ID                string  `json:"id"`
                Titre             string  `json:"titre"`
                Duree             int     `json:"duree"`
                Statut            string  `json:"statut"`
                DateDebut         string  `json:"dateDebut"`
                DateFin           string  `json:"dateFin"`
                DeletedAt         string  `json:"deletedAt"`
                UniteEnseignement *ueRef  `json:"uniteEnseignement"`
        }
        type deletedDevoir struct {
                ID                string  `json:"id"`
                Titre             string  `json:"titre"`
                DateLimite        *string `json:"dateLimite"`
                Statut            string  `json:"statut"`
                NoteMax           float64 `json:"noteMax"`
                DeletedAt         string  `json:"deletedAt"`
                UniteEnseignement *ueRef  `json:"uniteEnseignement"`
        }

        var documents []deletedDocument
        var questions []deletedQuestion
        var epreuves []deletedEpreuve
        var devoirs []deletedDevoir

        txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Epreuves supprimées + LEFT JOIN UniteEnseignement (C7).
                rows, err := tx.Query(r.Context(), `
                        SELECT e."id", e."titre", e."duree", e."statut"::text, e."dateDebut", e."dateFin", e."deletedAt",
                               ue."id", ue."code", ue."nom"
                        FROM "Epreuve" e
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = e."uniteEnseignementId"
                        WHERE e."deletedAt" IS NOT NULL
                        ORDER BY e."deletedAt" DESC
                        LIMIT 200
                `)
                if err != nil {
                        return fmt.Errorf("query epreuves corbeille: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        var e deletedEpreuve
                        var deletedAt, dateDebut, dateFin time.Time
                        var ueID, ueCode, ueNom *string
                        if err := rows.Scan(&e.ID, &e.Titre, &e.Duree, &e.Statut, &dateDebut, &dateFin, &deletedAt, &ueID, &ueCode, &ueNom); err != nil {
                                return fmt.Errorf("scan epreuve corbeille: %w", err)
                        }
                        e.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
                        e.DateDebut = dateDebut.UTC().Format(time.RFC3339) // C8
                        e.DateFin = dateFin.UTC().Format(time.RFC3339)     // C8
                        if ueID != nil {
                                e.UniteEnseignement = &ueRef{ID: *ueID, Code: derefStr(ueCode), Nom: derefStr(ueNom)}
                        }
                        epreuves = append(epreuves, e)
                }

                // Documents supprimés.
                rows2, err := tx.Query(r.Context(), `
                        SELECT "id", "nomFichier", "tailleFichier", "typeMime", "dateUpload", "deletedAt"
                        FROM "Document" WHERE "deletedAt" IS NOT NULL
                        ORDER BY "deletedAt" DESC
                        LIMIT 200
                `)
                if err != nil {
                        return fmt.Errorf("query documents corbeille: %w", err)
                }
                defer rows2.Close()
                for rows2.Next() {
                        var d deletedDocument
                        var deletedAt, dateUpload time.Time
                        if err := rows2.Scan(&d.ID, &d.NomFichier, &d.TailleFichier, &d.TypeMime, &dateUpload, &deletedAt); err != nil {
                                return fmt.Errorf("scan document corbeille: %w", err)
                        }
                        d.DateUpload = dateUpload.UTC().Format(time.RFC3339) // C8
                        d.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
                        documents = append(documents, d)
                }

                // Questions supprimées + LEFT JOIN Document (C6 : nested).
                rows3, err := tx.Query(r.Context(), `
                        SELECT q."id", q."type", q."enonce", q."difficulte"::text, q."validee", q."deletedAt",
                               doc."id", doc."nomFichier"
                        FROM "Question" q
                        LEFT JOIN "Document" doc ON doc."id" = q."documentId"
                        WHERE q."deletedAt" IS NOT NULL
                        ORDER BY q."deletedAt" DESC
                        LIMIT 200
                `)
                if err != nil {
                        return fmt.Errorf("query questions corbeille: %w", err)
                }
                defer rows3.Close()
                for rows3.Next() {
                        var q deletedQuestion
                        var deletedAt time.Time
                        var docID, docNom *string
                        if err := rows3.Scan(&q.ID, &q.Type, &q.Enonce, &q.Difficulte, &q.Validee, &deletedAt, &docID, &docNom); err != nil {
                                return fmt.Errorf("scan question corbeille: %w", err)
                        }
                        q.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
                        if docID != nil {
                                q.Document = &docRef{ID: *docID, NomFichier: derefStr(docNom)} // C6
                        }
                        questions = append(questions, q)
                }

                // Devoirs supprimés + LEFT JOIN UniteEnseignement (C7).
                rows4, err := tx.Query(r.Context(), `
                        SELECT d."id", d."titre", d."dateLimite", d."statut"::text, d."noteMax", d."deletedAt",
                               ue."id", ue."code", ue."nom"
                        FROM "Devoir" d
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
                        WHERE d."deletedAt" IS NOT NULL
                        ORDER BY d."deletedAt" DESC
                        LIMIT 200
                `)
                if err != nil {
                        return fmt.Errorf("query devoirs corbeille: %w", err)
                }
                defer rows4.Close()
                for rows4.Next() {
                        var dv deletedDevoir
                        var deletedAt time.Time
                        var dateLimite *time.Time
                        var ueID, ueCode, ueNom *string
                        if err := rows4.Scan(&dv.ID, &dv.Titre, &dateLimite, &dv.Statut, &dv.NoteMax, &deletedAt, &ueID, &ueCode, &ueNom); err != nil {
                                return fmt.Errorf("scan devoir corbeille: %w", err)
                        }
                        dv.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
                        if dateLimite != nil {
                                ts := dateLimite.UTC().Format(time.RFC3339) // C8
                                dv.DateLimite = &ts
                        }
                        if ueID != nil {
                                dv.UniteEnseignement = &ueRef{ID: *ueID, Code: derefStr(ueCode), Nom: derefStr(ueNom)}
                        }
                        devoirs = append(devoirs, dv)
                }
                return nil
        })
        if txErr != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        // Si nil, retourner un tableau vide (pas null) pour le frontend.
        if documents == nil {
                documents = []deletedDocument{}
        }
        if questions == nil {
                questions = []deletedQuestion{}
        }
        if epreuves == nil {
                epreuves = []deletedEpreuve{}
        }
        if devoirs == nil {
                devoirs = []deletedDevoir{}
        }
        totalCount := len(documents) + len(questions) + len(epreuves) + len(devoirs)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "documents":  documents,
                "questions":  questions,
                "epreuves":   epreuves,
                "devoirs":    devoirs,
                "totalCount": totalCount,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 7b. POST /api/corbeille/restore — Restaurer des éléments supprimés
//
// CORBEILLE-FIX-2 (P1) :
//   - C4 : HTTP 207 Multi-Status si partiel, 409 si total échec, 200 si tout OK.
//   - C16 : best-effort conservé (si un item échoue, les autres sont tentés).
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) corbeilleRestore(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var body struct {
                Items []struct {
                        ID   string `json:"id"`
                        Type string `json:"type"` // document | question | epreuve | devoir
                } `json:"items"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if len(body.Items) == 0 {
                writeJSONError(w, http.StatusBadRequest, "items requis")
                return
        }

        restored := 0
        var errors []string
        txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                for _, item := range body.Items {
                        var tableName string
                        switch item.Type {
                        case "epreuve":
                                tableName = "Epreuve"
                        case "document":
                                tableName = "Document"
                        case "question":
                                tableName = "Question"
                        case "devoir":
                                tableName = "Devoir"
                        default:
                                errors = append(errors, "type inconnu: "+item.Type)
                                continue
                        }
                        // SAFETY: tableName issu d'un switch contrôlé, pas d'une input utilisateur.
                        query := fmt.Sprintf(`UPDATE "%s" SET "deletedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NOT NULL`, tableName)
                        tag, err := tx.Exec(r.Context(), query, item.ID)
                        if err != nil {
                                errors = append(errors, fmt.Sprintf("restore %s %s: %v", item.Type, item.ID, err))
                                continue
                        }
                        if tag.RowsAffected() > 0 {
                                restored++
                        }
                }
                return nil
        })
        if txErr != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        // C4 : code HTTP selon le résultat.
        // - 200 si tout OK (restored == len(items))
        // - 207 Multi-Status si partiel (0 < restored < len(items))
        // - 409 Conflict si total échec (restored == 0)
        statusCode := http.StatusOK
        if restored == 0 {
                statusCode = http.StatusConflict
        } else if restored < len(body.Items) {
                statusCode = http.StatusMultiStatus
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(statusCode)
        json.NewEncoder(w).Encode(map[string]any{
                "message":  fmt.Sprintf("%d élément(s) restauré(s)", restored),
                "restored": restored,
                "errors":   errors,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 7c. DELETE /api/corbeille/purge — Suppression définitive
//
// CORBEILLE-FIX-2 (P1) :
//   - C3 : vérifie FK RESTRICT avant DELETE (SessionPassation pour Epreuve,
//     EpreuveQuestion pour Question). Refuse avec erreur claire si dépendances.
//   - C4 : HTTP 207 Multi-Status si partiel, 409 si total échec, 200 si tout OK.
//   - C5 : supprime aussi l'objet R2 pour les Documents (le fichier était
//     conservé au soft-delete, supprimé ici à la purge définitive).
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) corbeillePurge(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var body struct {
                Items []struct {
                        ID   string `json:"id"`
                        Type string `json:"type"` // document | question | epreuve | devoir
                } `json:"items"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if len(body.Items) == 0 {
                writeJSONError(w, http.StatusBadRequest, "items requis")
                return
        }

        purged := 0
        var errors []string
        // C5 : collecter les chemins R2 des documents à purger pour suppression post-commit.
        var r2KeysToDelete []string
        var r2DocIDs []string

        txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                for _, item := range body.Items {
                        var tableName string
                        switch item.Type {
                        case "epreuve":
                                tableName = "Epreuve"
                        case "document":
                                tableName = "Document"
                        case "question":
                                tableName = "Question"
                        case "devoir":
                                tableName = "Devoir"
                        default:
                                errors = append(errors, "type inconnu: "+item.Type)
                                continue
                        }

                        // C3 : vérifier FK RESTRICT avant DELETE pour Epreuve et Question.
                        if item.Type == "epreuve" {
                                var sessionCount int
                                err := tx.QueryRow(r.Context(), `SELECT count(*) FROM "SessionPassation" WHERE "epreuveId" = $1`, item.ID).Scan(&sessionCount)
                                if err != nil {
                                        errors = append(errors, fmt.Sprintf("purge epreuve %s: vérif sessions: %v", item.ID, err))
                                        continue
                                }
                                if sessionCount > 0 {
                                        errors = append(errors, fmt.Sprintf("purge epreuve %s impossible: %d session(s) de passation liée(s) — supprimez d'abord les sessions", item.ID, sessionCount))
                                        continue
                                }
                        }
                        if item.Type == "question" {
                                var eqCount int
                                err := tx.QueryRow(r.Context(), `SELECT count(*) FROM "EpreuveQuestion" WHERE "questionId" = $1`, item.ID).Scan(&eqCount)
                                if err != nil {
                                        errors = append(errors, fmt.Sprintf("purge question %s: vérif epreuveQuestion: %v", item.ID, err))
                                        continue
                                }
                                if eqCount > 0 {
                                        errors = append(errors, fmt.Sprintf("purge question %s impossible: utilisée dans %d épreuve(s) — retirez-la des épreuves d'abord", item.ID, eqCount))
                                        continue
                                }
                        }

                        // C5 : pour Document, récupérer le chemin R2 avant DELETE.
                        if item.Type == "document" {
                                var cheminStockage string
                                err := tx.QueryRow(r.Context(), `SELECT "cheminStockage" FROM "Document" WHERE "id" = $1 AND "deletedAt" IS NOT NULL`, item.ID).Scan(&cheminStockage)
                                if err == nil && cheminStockage != "" {
                                        r2KeysToDelete = append(r2KeysToDelete, cheminStockage)
                                        r2DocIDs = append(r2DocIDs, item.ID)
                                }
                        }

                        // Hard delete. SAFETY: tableName issu d'un switch contrôlé.
                        query := fmt.Sprintf(`DELETE FROM "%s" WHERE "id" = $1 AND "deletedAt" IS NOT NULL`, tableName)
                        tag, err := tx.Exec(r.Context(), query, item.ID)
                        if err != nil {
                                errors = append(errors, fmt.Sprintf("purge %s %s: %v", item.Type, item.ID, err))
                                continue
                        }
                        if tag.RowsAffected() > 0 {
                                purged++
                        }
                }
                return nil
        })
        if txErr != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        // C5 : suppression best-effort des objets R2 (post-commit, hors transaction).
        // On utilise le storage du DocumentUseCase si disponible.
        if len(r2KeysToDelete) > 0 && s.documentUC != nil {
                ctx := r.Context()
                for i, key := range r2KeysToDelete {
                        _ = s.documentUC.PurgeR2Object(ctx, key) // best-effort, ignoré si échec
                        _ = r2DocIDs[i]                          // docID conservé pour logging futur
                }
        }

        // C4 : code HTTP selon le résultat.
        statusCode := http.StatusOK
        if purged == 0 {
                statusCode = http.StatusConflict
        } else if purged < len(body.Items) {
                statusCode = http.StatusMultiStatus
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(statusCode)
        json.NewEncoder(w).Encode(map[string]any{
                "message": fmt.Sprintf("%d élément(s) supprimé(s) définitivement", purged),
                "purged":  purged,
                "errors":  errors,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 8. GET /api/devoirs — Liste enrichie (DTO complet matchant le type TS Devoir)
//
// FIX (P1-DEVOIRS-1) :
//   • Suppression du filtre d."etudiantId" (colonne inexistante → erreur SQL).
//   • Pour l'étudiant : le scoping se fait via RLS (policy Devoir_select
//     corrigée par migration 000009 : filiere+niveau de l'étudiant).
//     Le paramètre ?etudiantId sert uniquement à joindre SA soumission.
//   • DTO enrichi : User (enseignant), UniteEnseignement, GrilleEvaluation,
//     soumissionCount, et soumission (l'étudiant courant) — matche le type
//     Devoir du frontend (devoirs-types.ts) qui accède à ces champs SANS
//     optional chaining → crash si absents.
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) devoirsListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // DTO User (enseignant) — matche { id, name, email } côté frontend
        type userDTO struct {
                ID    string `json:"id"`
                Name  string `json:"name"`
                Email string `json:"email"`
        }

        // DTO UniteEnseignement — matche { id, code, nom, niveau } côté frontend
        type ueDTO struct {
                ID     string `json:"id"`
                Code   string `json:"code"`
                Nom    string `json:"nom"`
                Niveau string `json:"niveau,omitempty"`
        }

        // DTO GrilleEvaluation — matche { id, criteres } | null côté frontend
        type grilleDTO struct {
                ID        string `json:"id"`
                Criteres  string `json:"criteres"`
        }

        // DTO Soumission résumée (pour l'étudiant : sa propre soumission jointe)
        type soumissionDTO struct {
                ID                   string  `json:"id"`
                ContenuTexte         *string `json:"contenuTexte"`
                CommentaireEtudiant  *string `json:"commentaireEtudiant"`
                Statut               string  `json:"statut"`
                RenduAt              *string `json:"renduAt"`
                Note                 *float64 `json:"note"`
                CommentaireEnseignant *string `json:"commentaireEnseignant"`
                NoteIA               *float64 `json:"noteIA"`
                JustificationIA      *string `json:"justificationIA"`
                CreatedAt            string  `json:"createdAt"`
        }

        // DTO Devoir complet — matche le type TS Devoir (devoirs-types.ts)
        // Tous les champs accédés sans optional chaining par le frontend doivent
        // être non-null dans la réponse JSON.
        type devoir struct {
                ID                 string      `json:"id"`
                Titre              string      `json:"titre"`
                Description        *string     `json:"description"`
                Consignes          *string     `json:"consignes"`
                UniteEnseignementID string     `json:"uniteEnseignementId"`
                EnseignantID       string      `json:"enseignantId"`
                TypeSeance         string      `json:"typeSeance"`
                DatePublication    *string     `json:"datePublication"`
                DateLimite         string      `json:"dateLimite"`
                NoteMax            float64     `json:"noteMax"`
                RenduFichiers      *string     `json:"renduFichiers"`
                SoumissionGroupe   bool        `json:"soumissionGroupe"`
                NbMaxFichiers      int         `json:"nbMaxFichiers"`
                TailleMaxFichier   int         `json:"tailleMaxFichier"`
                Statut             string      `json:"statut"`
                AnneeUniversitaire string      `json:"anneeUniversitaire"`
                CreatedAt          string      `json:"createdAt"`
                UpdatedAt          string      `json:"updatedAt"`
                User               userDTO     `json:"User"`
                UniteEnseignement  ueDTO       `json:"UniteEnseignement"`
                GrilleEvaluation   *grilleDTO  `json:"GrilleEvaluation"`
                SoumissionCount    int         `json:"soumissionCount"`
                Soumission         *soumissionDTO `json:"soumission"`
        }

        result := []devoir{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                enseignantID := r.URL.Query().Get("enseignantId")
                etudiantID := r.URL.Query().Get("etudiantId")

                var args []any
                argIdx := 1
                var where []string
                where = append(where, `d."deletedAt" IS NULL`)
                if enseignantID != "" {
                        where = append(where, fmt.Sprintf(`d."enseignantId" = $%d`, argIdx))
                        args = append(args, enseignantID)
                        argIdx++
                }
                // ⚠️ Pas de filtre d."etudiantId" : la colonne n'existe pas sur Devoir.
                // Le scoping étudiant se fait via RLS (policy Devoir_select corrigée
                // par migration 000009). Le paramètre etudiantId sert uniquement à
                // joindre la soumission de l'étudiant courant.

                // Construction dynamique du LEFT JOIN sur Soumission (étudiant seulement)
                soumissionJoin := ""
                if etudiantID != "" {
                        soumissionJoin = fmt.Sprintf(`LEFT JOIN "Soumission" s ON s."devoirId" = d."id" AND s."etudiantId" = $%d`, argIdx)
                        args = append(args, etudiantID)
                        argIdx++
                }

                selectCols := ""
                if etudiantID != "" {
                        selectCols = `,
                                s."id", s."contenuTexte", s."commentaireEtudiant", s."statut"::text,
                                s."renduAt", s."note", s."commentaireEnseignant",
                                s."noteIA", s."justificationIA", s."createdAt"`
                }

                query := fmt.Sprintf(`
                        SELECT
                                d."id", d."titre", d."description", d."consignes",
                                d."uniteEnseignementId", d."enseignantId", d."typeSeance"::text,
                                d."datePublication", d."dateLimite", d."noteMax",
                                d."renduFichiers", d."soumissionGroupe", d."nbMaxFichiers",
                                d."tailleMaxFichier", d."statut"::text, d."anneeUniversitaire",
                                d."createdAt", d."updatedAt",
                                u."id", u."name", u."email",
                                ue."id", ue."code", ue."nom", COALESCE(ue."niveau"::text, ''),
                                g."id", g."criteres",
                                COALESCE((SELECT count(*) FROM "Soumission" sub WHERE sub."devoirId" = d."id" AND sub."statut"::text = 'SOUMIS'), 0)%s
                        FROM "Devoir" d
                        LEFT JOIN "User" u ON u."id" = d."enseignantId"
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
                        LEFT JOIN "GrilleEvaluation" g ON g."devoirId" = d."id"
                        %s
                        WHERE %s
                        ORDER BY d."createdAt" DESC
                        LIMIT 100
                `, selectCols, soumissionJoin, joinStringsArr(where, " AND "))

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return nil
                }
                defer rows.Close()
                for rows.Next() {
                        d := devoir{}
                        var (
                                descr, consignes, renduFichiers, datePub                  *string
                                dateLimite                                               *time.Time
                                createdAt, updatedAt                                     time.Time
                                ueNiveau                                                 string
                                grilleID, grilleCriteres                                 *string
                                sID, sContenu, sComment, sStatut, sCommentEns, sJustifIA *string
                                sNote, sNoteIA                                           *float64
                                sRenduAt, sCreatedAt                                     *time.Time
                        )

                        if etudiantID != "" {
                                if err := rows.Scan(
                                        &d.ID, &d.Titre, &descr, &consignes,
                                        &d.UniteEnseignementID, &d.EnseignantID, &d.TypeSeance,
                                        &datePub, &dateLimite, &d.NoteMax,
                                        &renduFichiers, &d.SoumissionGroupe, &d.NbMaxFichiers,
                                        &d.TailleMaxFichier, &d.Statut, &d.AnneeUniversitaire,
                                        &createdAt, &updatedAt,
                                        &d.User.ID, &d.User.Name, &d.User.Email,
                                        &d.UniteEnseignement.ID, &d.UniteEnseignement.Code, &d.UniteEnseignement.Nom, &ueNiveau,
                                        &grilleID, &grilleCriteres,
                                        &d.SoumissionCount,
                                        &sID, &sContenu, &sComment, &sStatut, &sRenduAt, &sNote, &sCommentEns, &sNoteIA, &sJustifIA, &sCreatedAt,
                                ); err != nil {
                                        return nil
                                }
                        } else {
                                if err := rows.Scan(
                                        &d.ID, &d.Titre, &descr, &consignes,
                                        &d.UniteEnseignementID, &d.EnseignantID, &d.TypeSeance,
                                        &datePub, &dateLimite, &d.NoteMax,
                                        &renduFichiers, &d.SoumissionGroupe, &d.NbMaxFichiers,
                                        &d.TailleMaxFichier, &d.Statut, &d.AnneeUniversitaire,
                                        &createdAt, &updatedAt,
                                        &d.User.ID, &d.User.Name, &d.User.Email,
                                        &d.UniteEnseignement.ID, &d.UniteEnseignement.Code, &d.UniteEnseignement.Nom, &ueNiveau,
                                        &grilleID, &grilleCriteres,
                                        &d.SoumissionCount,
                                ); err != nil {
                                        return nil
                                }
                        }

                        d.Description = descr
                        d.Consignes = consignes
                        d.RenduFichiers = renduFichiers
                        if datePub != nil {
                                d.DatePublication = datePub
                        }
                        if dateLimite != nil {
                                d.DateLimite = dateLimite.UTC().Format(time.RFC3339)
                        }
                        d.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        d.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
                        if ueNiveau != "" {
                                d.UniteEnseignement.Niveau = ueNiveau
                        }
                        if grilleID != nil && grilleCriteres != nil {
                                d.GrilleEvaluation = &grilleDTO{ID: *grilleID, Criteres: *grilleCriteres}
                        }

                        // Soumission de l'étudiant (si applicable)
                        if etudiantID != "" && sID != nil {
                                s := soumissionDTO{ID: *sID}
                                s.ContenuTexte = sContenu
                                s.CommentaireEtudiant = sComment
                                if sStatut != nil {
                                        s.Statut = *sStatut
                                }
                                if sRenduAt != nil {
                                        ts := sRenduAt.UTC().Format(time.RFC3339)
                                        s.RenduAt = &ts
                                }
                                s.Note = sNote
                                s.CommentaireEnseignant = sCommentEns
                                s.NoteIA = sNoteIA
                                s.JustificationIA = sJustifIA
                                if sCreatedAt != nil {
                                        s.CreatedAt = sCreatedAt.UTC().Format(time.RFC3339)
                                }
                                d.Soumission = &s
                        }

                        result = append(result, d)
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "devoirs": result,
                "total":   len(result),
        })
}


// ──────────────────────────────────────────────────────────────────────────
// 9. GET /api/devoirs/stats — Devoir stats
// ──────────────────────────────────────────────────────────────────────────

// BUGFIX (DEVOIRS-ANALYSE-1) : l'ancien endpoint retournait {total, enCours,
// corriges} (flat) mais le frontend AnalysisView attend {kpis:{...}, byType:[],
// soumissionsByStatut:[], timeline:[], moyenneNotes} → stats.kpis.total →
// TypeError → crash de l'onglet Analyses.
// Maintenant : retourne le contrat structuré attendu par DevoirStats (TS).
func (s *Server) devoirsStatsReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type kpisT struct {
                Total                int `json:"total"`
                Brouillons           int `json:"brouillons"`
                Publies              int `json:"publies"`
                Fermes               int `json:"fermes"`
                Archives             int `json:"archives"`
                TotalSoumissions     int `json:"totalSoumissions"`
                SoumissionsEnAttente int `json:"soumissionsEnAttente"`
                SoumissionsCorrigees int `json:"soumissionsCorrigees"`
                EnRetard             int `json:"enRetard"`
        }
        type byTypeT struct {
                Type  string `json:"type"`
                Count int    `json:"count"`
                Label string `json:"label"`
        }
        type soumByStatutT struct {
                Statut string `json:"statut"`
                Count  int    `json:"count"`
                Label  string `json:"label"`
        }
        type timelineT struct {
                Date         string `json:"date"`
                Soumissions  int    `json:"soumissions"`
        }

        stats := struct {
                Kpis                kpisT          `json:"kpis"`
                ByType              []byTypeT      `json:"byType"`
                SoumissionsByStatut []soumByStatutT `json:"soumissionsByStatut"`
                Timeline            []timelineT    `json:"timeline"`
                MoyenneNotes        *float64       `json:"moyenneNotes"`
        }{
                ByType:              []byTypeT{},
                SoumissionsByStatut: []soumByStatutT{},
                Timeline:            []timelineT{},
                MoyenneNotes:        nil,
        }

        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // KPIs : compteurs par statut
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL`).Scan(&stats.Kpis.Total)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'BROUILLON'`).Scan(&stats.Kpis.Brouillons)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'PUBLIE'`).Scan(&stats.Kpis.Publies)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'FERME'`).Scan(&stats.Kpis.Fermes)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'ARCHIVE'`).Scan(&stats.Kpis.Archives)

                // Soumissions
                // BUGFIX (DEVOIRS-STATS-FIX-1) : exclure les soumissions des devoirs soft-supprimés
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL`).Scan(&stats.Kpis.TotalSoumissions)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL AND s."statut"::text = 'SOUMIS'`).Scan(&stats.Kpis.SoumissionsEnAttente)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL AND s."statut"::text IN ('CORRIGE','RETOURNE')`).Scan(&stats.Kpis.SoumissionsCorrigees)
                _ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL AND s."renduAt" IS NULL AND d."dateLimite" < CURRENT_TIMESTAMP`).Scan(&stats.Kpis.EnRetard)

                // byType : répartition par type de séance
                rows, err := tx.Query(r.Context(), `SELECT "typeSeance"::text, count(*) FROM "Devoir" WHERE "deletedAt" IS NULL GROUP BY "typeSeance" ORDER BY count(*) DESC`)
                if err == nil {
                        defer rows.Close()
                        typeLabels := map[string]string{"CM": "Cours magistral", "TD": "Travail dirigé", "TP": "Travaux pratiques"}
                        for rows.Next() {
                                var t string
                                var c int
                                if err := rows.Scan(&t, &c); err == nil {
                                        stats.ByType = append(stats.ByType, byTypeT{Type: t, Count: c, Label: typeLabels[t]})
                                }
                        }
                }

                // soumissionsByStatut
                rows2, err := tx.Query(r.Context(), `SELECT s."statut"::text, count(*) FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL GROUP BY s."statut" ORDER BY count(*) DESC`)
                if err == nil {
                        defer rows2.Close()
                statutLabels := map[string]string{"BROUILLON": "Brouillon", "SOUMIS": "Soumis", "CORRIGE": "Corrigé", "RETOURNE": "Rendu"}
                        for rows2.Next() {
                                var st string
                                var c int
                                if err := rows2.Scan(&st, &c); err == nil {
                                        stats.SoumissionsByStatut = append(stats.SoumissionsByStatut, soumByStatutT{Statut: st, Count: c, Label: statutLabels[st]})
                                }
                        }
                }

                // timeline : 7 derniers jours
                rows3, err := tx.Query(r.Context(), `
                        SELECT to_char(d::date, 'YYYY-MM-DD') as date,
                        (SELECT count(*) FROM "Soumission" s JOIN "Devoir" dv ON dv."id" = s."devoirId" WHERE dv."deletedAt" IS NULL AND date_trunc('day', s."createdAt") = d) as soumissions
                        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d
                        ORDER BY d ASC
                `)
                if err == nil {
                        defer rows3.Close()
                        for rows3.Next() {
                                var dt string
                                var sc int
                                if err := rows3.Scan(&dt, &sc); err == nil {
                                        stats.Timeline = append(stats.Timeline, timelineT{Date: dt, Soumissions: sc})
                                }
                        }
                }

                // moyenneNotes
                var moy *float64
                var moyVal float64
                err = tx.QueryRow(r.Context(), `SELECT AVG(s."note") FROM "Soumission" s JOIN "Devoir" d ON d."id" = s."devoirId" WHERE d."deletedAt" IS NULL AND s."note" IS NOT NULL`).Scan(&moyVal)
                if err == nil {
                        moy = &moyVal
                        stats.MoyenneNotes = moy
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: joinStringsArr (évite conflit avec joinStrings de affectation_handlers.go)
// ──────────────────────────────────────────────────────────────────────────

func joinStringsArr(strs []string, sep string) string {
        result := ""
        for i, s := range strs {
                if i > 0 {
                        result += sep
                }
                result += s
        }
        return result
}
