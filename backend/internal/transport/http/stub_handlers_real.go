// Package http — implémentation des stubs prioritaires (STUBS-FIX-1).
//
// Ces handlers remplacent les stubs qui retournaient [] ou {} par des
// requêtes DB réelles. Pattern : queries directes via appdb.WithTx
// (même approche que statsEnseignant/statsResponsable).
package http

import (
        "encoding/json"
        "fmt"
        "net/http"
        "time"

        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// 1. GET /api/logs — AuditLog (601 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) logsListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type logEntry struct {
                ID        string  `json:"id"`
                UserID    *string `json:"userId,omitempty"`
                UserEmail *string `json:"userEmail,omitempty"`
                Action    string  `json:"action"`
                Entite    string  `json:"entite"`
                EntiteID  *string `json:"entiteId,omitempty"`
                Details   *string `json:"details,omitempty"`
                AdresseIP *string `json:"adresseIp,omitempty"`
                CreatedAt string  `json:"createdAt"`
        }

        result := []logEntry{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                search := r.URL.Query().Get("search")
                limit := 100
                if l := r.URL.Query().Get("limit"); l != "" {
                        if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
                                limit = n
                        }
                }

                var args []any
                argIdx := 1
                whereClause := ""
                if search != "" {
                        whereClause = fmt.Sprintf(`WHERE "action" ILIKE $%d OR "entite" ILIKE $%d OR "userEmail" ILIKE $%d`, argIdx, argIdx, argIdx)
                        args = append(args, "%"+search+"%")
                        argIdx++
                }

                query := fmt.Sprintf(`
                        SELECT "id", "userId", "userEmail", "action", "entite", "entiteId",
                               "details", "adresseIp", "createdAt"
                        FROM "AuditLog"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)
                args = append(args, limit)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        l := logEntry{}
                        var createdAt time.Time
                        if err := rows.Scan(&l.ID, &l.UserID, &l.UserEmail, &l.Action, &l.Entite,
                                &l.EntiteID, &l.Details, &l.AdresseIP, &createdAt); err != nil {
                                return err
                        }
                        l.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        result = append(result, l)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "logs":  result,
                "total": len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/ai-providers — AIProviderConfig (5 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) aiProvidersListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type provider struct {
                ID          string  `json:"id"`
                Name        string  `json:"name"`
                Provider    string  `json:"provider"`
                BaseURL     *string `json:"baseUrl,omitempty"`
                HasAPIKey   bool    `json:"hasApiKey"`
                Model       *string `json:"model,omitempty"`
                Temperature float64 `json:"temperature"`
                MaxTokens   int     `json:"maxTokens"`
                IsActive    bool    `json:"isActive"`
                Priority    int     `json:"priority"`
                ExtraConfig *string `json:"extraConfig,omitempty"`
                LastTestAt  *string `json:"lastTestAt,omitempty"`
                LastTestOk  *bool   `json:"lastTestOk,omitempty"`
                CreatedAt   string  `json:"createdAt"`
                UpdatedAt   string  `json:"updatedAt"`
        }

        result := []provider{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "name", "provider", "baseUrl", "apiKey", "model",
                               "temperature", "maxTokens", "isActive", "priority",
                               "extraConfig", "lastTestAt", "lastTestOk", "createdAt", "updatedAt"
                        FROM "AIProviderConfig"
                        ORDER BY "priority" ASC
                `)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        p := provider{}
                        var apiKey *string
                        var lastTestAt *time.Time
                        var createdAt, updatedAt time.Time
                        if err := rows.Scan(&p.ID, &p.Name, &p.Provider, &p.BaseURL, &apiKey, &p.Model,
                                &p.Temperature, &p.MaxTokens, &p.IsActive, &p.Priority,
                                &p.ExtraConfig, &lastTestAt, &p.LastTestOk, &createdAt, &updatedAt); err != nil {
                                return err
                        }
                        // Sécurité : ne jamais retourner l'apiKey brut dans la liste.
                        // On expose uniquement le flag hasApiKey pour l'UI.
                        p.HasAPIKey = apiKey != nil && *apiKey != ""
                        if lastTestAt != nil {
                                ts := lastTestAt.UTC().Format(time.RFC3339)
                                p.LastTestAt = &ts
                        }
                        p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        p.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
                        result = append(result, p)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "providers": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 3. GET /api/alertes — Alerte (2 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) alertesListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type alerte struct {
                ID          string  `json:"id"`
                Titre       string  `json:"titre"`
                Description string  `json:"description"`
                Severity    string  `json:"severity"`
                Type        string  `json:"type"`
                Lue         bool    `json:"lue"`
                Resolu      bool    `json:"resolu"`
                FiliereID   *string `json:"filiereId,omitempty"`
                EpreuveID   *string `json:"epreuveId,omitempty"`
                UserID      *string `json:"userId,omitempty"`
                CreatedAt   string  `json:"createdAt"`
        }

        result := []alerte{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                lueParam := r.URL.Query().Get("lue")
                limit := 50
                if l := r.URL.Query().Get("limit"); l != "" {
                        if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
                                limit = n
                        }
                }

                var args []any
                argIdx := 1
                whereClause := ""
                if lueParam == "false" {
                        whereClause = fmt.Sprintf(`WHERE "lue" = false`)
                } else if lueParam == "true" {
                        whereClause = fmt.Sprintf(`WHERE "lue" = true`)
                }

                query := fmt.Sprintf(`
                        SELECT "id", "titre", "description", "severity"::text, "type"::text,
                               "lue", "resolu", "filiereId", "epreuveId", "userId", "createdAt"
                        FROM "Alerte"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)
                args = append(args, limit)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        a := alerte{}
                        var createdAt time.Time
                        if err := rows.Scan(&a.ID, &a.Titre, &a.Description, &a.Severity, &a.Type,
                                &a.Lue, &a.Resolu, &a.FiliereID, &a.EpreuveID, &a.UserID, &createdAt); err != nil {
                                return err
                        }
                        a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        result = append(result, a)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "alertes": result,
                "total":   len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/validations-ue — ValidationUE (20 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) validationsUEListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // P2b-CERTIFICATS : DTO enrichi avec uniteEnseignement nested + certificats array.
        // Le frontend mes-certificats-page.tsx (tab "Progression UE") lit
        // v.uniteEnseignement.{code, nom, creditsECTS} et v.certificats[0].id.
        type ueRef struct {
                ID           string  `json:"id"`
                Code         string  `json:"code"`
                Nom          string  `json:"nom"`
                CreditsECTS  *int    `json:"creditsECTS,omitempty"`
        }
        type certRef struct {
                ID      string `json:"id"`
                Type    string `json:"type,omitempty"`
                Statut  string `json:"statut,omitempty"`
        }
        type validation struct {
                ID                   string    `json:"id"`
                EtudiantID           string    `json:"etudiantId"`
                UniteEnseignementID  string    `json:"uniteEnseignementId"`
                AnneeAcademiqueID    *string   `json:"anneeAcademiqueId,omitempty"`
                Statut               string    `json:"statut"`
                MoyenneUE            float64   `json:"moyenneUE"`
                NoteNormale          *float64  `json:"noteNormale,omitempty"`
                NoteRattrapage       *float64  `json:"noteRattrapage,omitempty"`
                NoteFinale           float64   `json:"noteFinale"`
                NbEpreuvesTotal      int       `json:"nbEpreuvesTotal"`
                NbEpreuvesCompletees int       `json:"nbEpreuvesCompletees"`
                DateValidation       *string   `json:"dateValidation,omitempty"`
                // P2b : relations nested attendues par le frontend
                UniteEnseignement    *ueRef    `json:"uniteEnseignement,omitempty"`
                Certificats          []certRef `json:"certificats,omitempty"`
        }

        result := []validation{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                etudiantID := r.URL.Query().Get("etudiantId")
                // For ENSEIGNANT/ETUDIANT, scope to their own validations
                if claims.Role == "ETUDIANT" {
                        etudiantID = claims.UserID
                }

                var args []any
                argIdx := 1
                whereClause := ""
                if etudiantID != "" {
                        whereClause = fmt.Sprintf(`WHERE v."etudiantId" = $%d`, argIdx)
                        args = append(args, etudiantID)
                        argIdx++
                }

                // P2b : LEFT JOIN UniteEnseignement pour le nested + LEFT JOIN Certificat
                query := fmt.Sprintf(`
                        SELECT v."id", v."etudiantId", v."uniteEnseignementId", v."anneeAcademiqueId",
                               v."statut"::text, v."moyenneUE", v."noteNormale", v."noteRattrapage",
                               v."noteFinale", v."nbEpreuvesTotal", v."nbEpreuvesCompletees", v."dateValidation",
                               ue."id", ue."code", ue."nom", ue."creditsECTS",
                               c."id", c."type"::text, c."statut"::text
                        FROM "ValidationUE" v
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = v."uniteEnseignementId"
                        LEFT JOIN "Certificat" c ON c."validationUEId" = v."id"
                        %s
                        ORDER BY v."createdAt" DESC
                `, whereClause)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        v := validation{}
                        var dateVal *time.Time
                        var ueID, ueCode, ueNom *string
                        var ueCredits *int
                        var certID, certType, certStatut *string
                        if err := rows.Scan(&v.ID, &v.EtudiantID, &v.UniteEnseignementID, &v.AnneeAcademiqueID,
                                &v.Statut, &v.MoyenneUE, &v.NoteNormale, &v.NoteRattrapage,
                                &v.NoteFinale, &v.NbEpreuvesTotal, &v.NbEpreuvesCompletees, &dateVal,
                                &ueID, &ueCode, &ueNom, &ueCredits,
                                &certID, &certType, &certStatut); err != nil {
                                return err
                        }
                        if dateVal != nil {
                                ts := dateVal.UTC().Format(time.RFC3339)
                                v.DateValidation = &ts
                        }
                        // P2b : hydrater uniteEnseignement si le JOIN a matché
                        if ueID != nil && ueCode != nil {
                                v.UniteEnseignement = &ueRef{
                                        ID:          *ueID,
                                        Code:        *ueCode,
                                        Nom:         derefStr(ueNom),
                                        CreditsECTS: ueCredits,
                                }
                        }
                        // P2b : hydrater certificats array si le JOIN a matché
                        if certID != nil {
                                v.Certificats = []certRef{{
                                        ID:     *certID,
                                        Type:   derefStr(certType),
                                        Statut: derefStr(certStatut),
                                }}
                        } else {
                                v.Certificats = []certRef{}
                        }
                        result = append(result, v)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "validations": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 5a. GET /api/abonnements — Abonnement (1 row en DB) + JOIN Etablissement + Plan
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) abonnementsListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type abonnement struct {
                ID                 string  `json:"id"`
                EtablissementID    string  `json:"etablissementId"`
                PlanID             string  `json:"planId"`
                Statut             string  `json:"statut"`
                DateDebut          string  `json:"dateDebut"`
                DateFin            *string `json:"dateFin,omitempty"`
                PeriodeEssaiJours  int     `json:"periodeEssaiJours"`
                ModePaiement       *string `json:"modePaiement,omitempty"`
                MontantPaye        float64 `json:"montantPaye"`
                RenouvellementAuto bool    `json:"renouvellementAuto"`
                Notes              *string `json:"notes,omitempty"`
                // Relations
                Etablissement *struct {
                        ID  string `json:"id"`
                        Nom string `json:"nom"`
                } `json:"etablissement,omitempty"`
                Plan *struct {
                        ID          string  `json:"id"`
                        Nom         string  `json:"nom"`
                        PrixMensuel float64 `json:"prixMensuel"`
                } `json:"plan,omitempty"`
        }

        result := []abonnement{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT a."id", a."etablissementId", a."planId", a."statut"::text,
                               a."dateDebut", a."dateFin", a."periodeEssaiJours", a."modePaiement",
                               a."montantPaye", a."renouvellementAuto", a."notes",
                               e."id", e."nom", p."id", p."nom", p."prixMensuel"
                        FROM "Abonnement" a
                        LEFT JOIN "Etablissement" e ON e."id" = a."etablissementId"
                        LEFT JOIN "Plan" p ON p."id" = a."planId"
                        ORDER BY a."createdAt" DESC
                `)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        a := abonnement{}
                        var dateDebut time.Time
                        var dateFin *time.Time
                        var etabID, etabNom *string
                        var planID, planNom *string
                        var planPrix *float64
                        if err := rows.Scan(&a.ID, &a.EtablissementID, &a.PlanID, &a.Statut,
                                &dateDebut, &dateFin, &a.PeriodeEssaiJours, &a.ModePaiement,
                                &a.MontantPaye, &a.RenouvellementAuto, &a.Notes,
                                &etabID, &etabNom, &planID, &planNom, &planPrix); err != nil {
                                return err
                        }
                        a.DateDebut = dateDebut.UTC().Format(time.RFC3339)
                        if dateFin != nil {
                                ts := dateFin.UTC().Format(time.RFC3339)
                                a.DateFin = &ts
                        }
                        if etabID != nil && etabNom != nil {
                                a.Etablissement = &struct {
                                        ID  string `json:"id"`
                                        Nom string `json:"nom"`
                                }{ID: *etabID, Nom: *etabNom}
                        }
                        if planID != nil && planNom != nil && planPrix != nil {
                                a.Plan = &struct {
                                        ID          string  `json:"id"`
                                        Nom         string  `json:"nom"`
                                        PrixMensuel float64 `json:"prixMensuel"`
                                }{ID: *planID, Nom: *planNom, PrixMensuel: *planPrix}
                        }
                        result = append(result, a)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "abonnements": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 5b. GET /api/plans — Plan (4 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) plansListReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type plan struct {
                ID                  string   `json:"id"`
                Nom                 string   `json:"nom"`
                Type                string   `json:"type"`
                PrixMensuel         float64  `json:"prixMensuel"`
                PrixAnnuel          *float64 `json:"prixAnnuel,omitempty"`
                NbEtablissementsMax int      `json:"nbEtablissementsMax"`
                NbFilieresMax       int      `json:"nbFilieresMax"`
                NbEnseignantsMax    int      `json:"nbEnseignantsMax"`
                NbEtudiantsMax      int      `json:"nbEtudiantsMax"`
                NbQuestionsMax      int      `json:"nbQuestionsMax"`
                NbEvaluationsMois   int      `json:"nbEvaluationsMois"`
                IaGeneration        bool     `json:"iaGeneration"`
                IaCorrection        bool     `json:"iaCorrection"`
                Proctoring          bool     `json:"proctoring"`
                ExportPDF           bool     `json:"exportPDF"`
                Support             string   `json:"support"`
                Description         *string  `json:"description,omitempty"`
                Actif               bool     `json:"actif"`
        }

        result := []plan{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "nom", "type"::text, "prixMensuel", "prixAnnuel",
                               "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax",
                               "nbEtudiantsMax", "nbQuestionsMax", "nbEvaluationsMois",
                               "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
                               "support", "description", "actif"
                        FROM "Plan"
                        ORDER BY "prixMensuel" ASC
                `)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        p := plan{}
                        if err := rows.Scan(&p.ID, &p.Nom, &p.Type, &p.PrixMensuel, &p.PrixAnnuel,
                                &p.NbEtablissementsMax, &p.NbFilieresMax, &p.NbEnseignantsMax,
                                &p.NbEtudiantsMax, &p.NbQuestionsMax, &p.NbEvaluationsMois,
                                &p.IaGeneration, &p.IaCorrection, &p.Proctoring, &p.ExportPDF,
                                &p.Support, &p.Description, &p.Actif); err != nil {
                                return err
                        }
                        result = append(result, p)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "plans": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET /api/notifications/admin — NotificationAdmin (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsAdminReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type notif struct {
                ID               string  `json:"id"`
                Type             string  `json:"type"`
                Titre            string  `json:"titre"`
                Message          string  `json:"message"`
                DestinataireID   *string `json:"destinataireId,omitempty"`
                DestinataireRole *string `json:"destinataireRole,omitempty"`
                Lu               bool    `json:"lu"`
                ActionURL        *string `json:"actionUrl,omitempty"`
                ActionLabel      *string `json:"actionLabel,omitempty"`
                Priorite         string  `json:"priorite"`
                Categorie        string  `json:"categorie"`
                Icone            *string `json:"icone,omitempty"`
                ExpireLe         *string `json:"expireLe,omitempty"`
                CreatedAt        string  `json:"createdAt"`
        }

        result := []notif{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                luParam := r.URL.Query().Get("lu")
                limit := 50
                if l := r.URL.Query().Get("limit"); l != "" {
                        if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
                                limit = n
                        }
                }

                var args []any
                argIdx := 1
                whereClause := ""
                if luParam == "false" {
                        whereClause = `WHERE "lu" = false`
                } else if luParam == "true" {
                        whereClause = `WHERE "lu" = true`
                }

                query := fmt.Sprintf(`
                        SELECT "id", "type", "titre", "message", "destinataireId", "destinataireRole",
                               "lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
                               "expireLe", "createdAt"
                        FROM "NotificationAdmin"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)
                args = append(args, limit)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        n := notif{}
                        var createdAt time.Time
                        var expireLe *time.Time
                        if err := rows.Scan(&n.ID, &n.Type, &n.Titre, &n.Message, &n.DestinataireID,
                                &n.DestinataireRole, &n.Lu, &n.ActionURL, &n.ActionLabel,
                                &n.Priorite, &n.Categorie, &n.Icone, &expireLe, &createdAt); err != nil {
                                return err
                        }
                        n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        if expireLe != nil {
                                ts := expireLe.UTC().Format(time.RFC3339)
                                n.ExpireLe = &ts
                        }
                        result = append(result, n)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "notifications": result,
                "total":         len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/platform-settings — PlatformSettings (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) platformSettingsReal(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var settingsJSON *string
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), `SELECT "settings" FROM "PlatformSettings" ORDER BY "updatedAt" DESC LIMIT 1`).Scan(&settingsJSON)
        })

        settings := map[string]any{}
        if settingsJSON != nil {
                _ = json.Unmarshal([]byte(*settingsJSON), &settings)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "settings": settings,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: parseIntSafe
// ──────────────────────────────────────────────────────────────────────────

func parseIntSafe(s string) (int, error) {
        var n int
        _, err := fmt.Sscanf(s, "%d", &n)
        return n, err
}
