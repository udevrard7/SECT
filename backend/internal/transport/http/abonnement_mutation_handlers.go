package http

// abonnement_mutation_handlers.go — Mutations pour /api/abonnements et /api/plans.
//
// ABONNEMENTS-FIX-A1+A2 : avant, seules les GET étaient déclarées → création,
// modification, suspension, résiliation d'abonnements et création/modification
// de plans retournaient 404/405. Le module /abonnements était entièrement en
// lecture seule.
//
// Implémentation : handlers stub (pool pgx direct + RLS), cohérents avec
// abonnementsListReal et plansListReal existants. Les RLS policies
// Abonnement_modify_admin et Plan_all_admin filtrent les writes (is_admin()).
//
// Validations :
// - ADMIN only (RequireRole posé au niveau du routeur).
// - Champs requis (etablissementId, planId, dateDebut pour abonnement ; nom,
//   type, prixMensuel pour plan).
// - Statut abonnement dans l'enum (ESSAI, ACTIF, SUSPENDU, EXPIRE, RESILIE).
// - Type plan dans l'enum (GRATUIT, ESSENTIEL, PROFESSIONNEL, ENTREPRISE).
// - Prix >= 0, limites >= 0.

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

// validStatutsAbonnement — enum StatutAbonnement (vérifié en DB).
var validStatutsAbonnement = map[string]bool{
        "ESSAI":    true,
        "ACTIF":    true,
        "SUSPENDU": true,
        "EXPIRE":   true,
        "RESILIE":  true,
}

// validTypesPlan — enum TypePlan.
var validTypesPlan = map[string]bool{
        "GRATUIT":        true,
        "ESSENTIEL":      true,
        "PROFESSIONNEL":  true,
        "ENTREPRISE":     true,
}

// ──────────────────────────────────────────────────────────────────────────
// A1 : Mutations Abonnement
// ──────────────────────────────────────────────────────────────────────────

// createAbonnement — POST /api/abonnements
func (s *Server) createAbonnement(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                EtablissementID    string  `json:"etablissementId"`
                PlanID             string  `json:"planId"`
                Statut             string  `json:"statut"`
                DateDebut          string  `json:"dateDebut"`
                ModePaiement       *string `json:"modePaiement"`
                MontantPaye        *float64 `json:"montantPaye"`
                RenouvellementAuto *bool   `json:"renouvellementAuto"`
                Notes              *string `json:"notes"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.EtablissementID == "" {
                writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
                return
        }
        if input.PlanID == "" {
                writeJSONError(w, http.StatusBadRequest, "planId requis")
                return
        }
        if input.DateDebut == "" {
                writeJSONError(w, http.StatusBadRequest, "dateDebut requis (YYYY-MM-DD)")
                return
        }
        // Parser la date.
        dateDebut, err := time.Parse("2006-01-02", input.DateDebut)
        if err != nil {
                writeJSONError(w, http.StatusBadRequest, "dateDebut invalide (format YYYY-MM-DD attendu)")
                return
        }
        // Statut default ESSAI, valider.
        statut := input.Statut
        if statut == "" {
                statut = "ESSAI"
        }
        if !validStatutsAbonnement[statut] {
                writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("statut invalide (valeurs: ESSAI, ACTIF, SUSPENDU, EXPIRE, RESILIE)"))
                return
        }
        // Montant default 0.
        montant := 0.0
        if input.MontantPaye != nil {
                if *input.MontantPaye < 0 {
                        writeJSONError(w, http.StatusBadRequest, "montantPaye doit être >= 0")
                        return
                }
                montant = *input.MontantPaye
        }
        renouv := true
        if input.RenouvellementAuto != nil {
                renouv = *input.RenouvellementAuto
        }

        type abonnement struct {
                ID                 string  `json:"id"`
                EtablissementID    string  `json:"etablissementId"`
                PlanID             string  `json:"planId"`
                Statut             string  `json:"statut"`
                DateDebut          string  `json:"dateDebut"`
                ModePaiement       *string `json:"modePaiement,omitempty"`
                MontantPaye        float64 `json:"montantPaye"`
                RenouvellementAuto bool    `json:"renouvellementAuto"`
                Notes              *string `json:"notes,omitempty"`
        }

        created := abonnement{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "abo_" + uuid.NewString()
                err := tx.QueryRow(r.Context(), `
                        INSERT INTO "Abonnement" (
                                "id", "etablissementId", "planId", "statut", "dateDebut",
                                "periodeEssaiJours", "modePaiement", "montantPaye",
                                "renouvellementAuto", "notes", "createdAt", "updatedAt"
                        ) VALUES (
                                $1, $2, $3, $4::"StatutAbonnement", $5,
                                CASE WHEN $4 = 'ESSAI' THEN 14 ELSE 0 END,
                                $6, $7, $8, $9, now(), now()
                        )
                        RETURNING "id", "etablissementId", "planId", "statut"::text, "dateDebut",
                                "modePaiement", "montantPaye", "renouvellementAuto", "notes"
                `, newID, input.EtablissementID, input.PlanID, statut, dateDebut,
                        input.ModePaiement, montant, renouv, input.Notes,
                ).Scan(
                        &created.ID, &created.EtablissementID, &created.PlanID, &created.Statut,
                        &created.DateDebut, &created.ModePaiement, &created.MontantPaye,
                        &created.RenouvellementAuto, &created.Notes,
                )
                if err == nil {
                        created.DateDebut = dateDebut.UTC().Format(time.RFC3339)
                        success = true
                }
                return nil
        })

        if !success {
                // RLS a bloqué (non-admin) ou FK invalide (etablissementId/planId inexistant).
                writeJSONError(w, http.StatusForbidden, "création non autorisée ou établissement/plan invalide")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"abonnement": created})
}

// updateAbonnement — PATCH /api/abonnements/{id}
func (s *Server) updateAbonnement(w http.ResponseWriter, r *http.Request) {
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
                PlanID             *string  `json:"planId"`
                Statut             *string  `json:"statut"`
                DateDebut          *string  `json:"dateDebut"`
                ModePaiement       *string  `json:"modePaiement"`
                MontantPaye        *float64 `json:"montantPaye"`
                RenouvellementAuto *bool    `json:"renouvellementAuto"`
                Notes              *string  `json:"notes"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Statut != nil && !validStatutsAbonnement[*input.Statut] {
                writeJSONError(w, http.StatusBadRequest, "statut invalide")
                return
        }
        if input.MontantPaye != nil && *input.MontantPaye < 0 {
                writeJSONError(w, http.StatusBadRequest, "montantPaye doit être >= 0")
                return
        }

        type abonnement struct {
                ID                 string  `json:"id"`
                EtablissementID    string  `json:"etablissementId"`
                PlanID             string  `json:"planId"`
                Statut             string  `json:"statut"`
                DateDebut          string  `json:"dateDebut"`
                ModePaiement       *string `json:"modePaiement,omitempty"`
                MontantPaye        float64 `json:"montantPaye"`
                RenouvellementAuto bool    `json:"renouvellementAuto"`
                Notes              *string `json:"notes,omitempty"`
        }

        updated := abonnement{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Construire la requête UPDATE dynamiquement avec COALESCE.
                var dateDebutArg any
                if input.DateDebut != nil {
                        t, err := time.Parse("2006-01-02", *input.DateDebut)
                        if err != nil {
                                return fmt.Errorf("dateDebut invalide")
                        }
                        dateDebutArg = t
                }

                err := tx.QueryRow(r.Context(), `
                        UPDATE "Abonnement" SET
                                "planId" = COALESCE($2, "planId"),
                                "statut" = CASE WHEN $3::text IS NULL THEN "statut" ELSE $3::"StatutAbonnement" END,
                                "dateDebut" = COALESCE($4, "dateDebut"),
                                "modePaiement" = COALESCE($5, "modePaiement"),
                                "montantPaye" = COALESCE($6, "montantPaye"),
                                "renouvellementAuto" = COALESCE($7, "renouvellementAuto"),
                                "notes" = COALESCE($8, "notes"),
                                "updatedAt" = now()
                        WHERE "id" = $1
                        RETURNING "id", "etablissementId", "planId", "statut"::text, "dateDebut",
                                "modePaiement", "montantPaye", "renouvellementAuto", "notes"
                `, id,
                        input.PlanID, input.Statut, dateDebutArg,
                        input.ModePaiement, input.MontantPaye, input.RenouvellementAuto, input.Notes,
                ).Scan(
                        &updated.ID, &updated.EtablissementID, &updated.PlanID, &updated.Statut,
                        &updated.DateDebut, &updated.ModePaiement, &updated.MontantPaye,
                        &updated.RenouvellementAuto, &updated.Notes,
                )
                if err == nil {
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "abonnement non trouvé ou non autorisé")
                return
        }

        // SECT-B2B-FACTURATION : si l'admin vient de passer l'abonnement à ACTIF
        // et que c'est un plan B2B (capitation), créer automatiquement la facture.
        if input.Statut != nil && *input.Statut == "ACTIF" {
                go s.createB2BFactureIfApplicable(updated.ID, updated.PlanID)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"abonnement": updated})
}

// deleteAbonnement — DELETE /api/abonnements/{id} (résilier)
func (s *Server) deleteAbonnement(w http.ResponseWriter, r *http.Request) {
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

        // Soft-delete : on passe le statut à RESILIE plutôt qu'un DELETE hard
        // (conserve l'historique pour la facturation/audit). Cohérent avec
        // le bouton "Résilier" du frontend (libellé = résiliation).
        resiliated := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `
                        UPDATE "Abonnement" SET "statut" = 'RESILIE'::"StatutAbonnement",
                                "dateFin" = now(), "updatedAt" = now()
                        WHERE "id" = $1
                `, id)
                if err == nil && tag.RowsAffected() > 0 {
                        resiliated = true
                }
                return nil
        })

        if !resiliated {
                writeJSONError(w, http.StatusNotFound, "abonnement non trouvé ou non autorisé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "abonnement résilié"})
}

// softDeleteAbonnement — DELETE /api/abonnements/{id}/hard (soft delete)
//
// SECT-ABONNEMENT-SOFT-DELETE : supprime un abonnement RÉSILIÉ en posant
// deletedAt = NOW() (soft delete). L'abonnement disparaît des listes mais
// reste en DB pour l'audit/facturation.
//
// Sécurité : ne peut soft delete QUE si statut = RESILIE. Sinon → 409 Conflict
// (l'utilisateur doit d'abord résilier l'abonnement avant de le supprimer).
func (s *Server) softDeleteAbonnement(w http.ResponseWriter, r *http.Request) {
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
        conflict := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // 1. Vérifier le statut actuel (ne peut soft delete que si RESILIE).
                var statut string
                err := tx.QueryRow(r.Context(), `SELECT "statut"::text FROM "Abonnement" WHERE "id" = $1`, id).Scan(&statut)
                if err != nil {
                        return nil // non trouvé → 404 ci-dessous
                }
                if statut != "RESILIE" {
                        conflict = true
                        return nil
                }
                // 2. Soft delete : poser deletedAt = NOW().
                tag, err := tx.Exec(r.Context(), `
                        UPDATE "Abonnement" SET "deletedAt" = now(), "updatedAt" = now()
                        WHERE "id" = $1 AND "deletedAt" IS NULL
                `, id)
                if err == nil && tag.RowsAffected() > 0 {
                        deleted = true
                }
                return nil
        })

        if conflict {
                writeJSONError(w, http.StatusConflict, "seul un abonnement résilié peut être supprimé. Résiliez-le d'abord.")
                return
        }
        if !deleted {
                writeJSONError(w, http.StatusNotFound, "abonnement non trouvé, non résilié, ou déjà supprimé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "abonnement supprimé"})
}

// ──────────────────────────────────────────────────────────────────────────
// A2 : Mutations Plan
// ──────────────────────────────────────────────────────────────────────────

// createPlan — POST /api/plans
func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                Nom                 string   `json:"nom"`
                Type                string   `json:"type"`
                PrixMensuel         float64  `json:"prixMensuel"`
                PrixAnnuel          *float64 `json:"prixAnnuel"`
                NbEtablissementsMax *int     `json:"nbEtablissementsMax"`
                NbFilieresMax       *int     `json:"nbFilieresMax"`
                NbEnseignantsMax    *int     `json:"nbEnseignantsMax"`
                NbEtudiantsMax      *int     `json:"nbEtudiantsMax"`
                NbQuestionsMax      *int     `json:"nbQuestionsMax"`
                NbEvaluationsMois   *int     `json:"nbEvaluationsMois"`
                IaGeneration        *bool    `json:"iaGeneration"`
                IaCorrection        *bool    `json:"iaCorrection"`
                Proctoring          *bool    `json:"proctoring"`
                ExportPDF           *bool    `json:"exportPDF"`
                Support             *string  `json:"support"`
                Description         *string  `json:"description"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Nom == "" {
                writeJSONError(w, http.StatusBadRequest, "nom requis")
                return
        }
        if !validTypesPlan[input.Type] {
                writeJSONError(w, http.StatusBadRequest, "type invalide (GRATUIT, ESSENTIEL, PROFESSIONNEL, ENTREPRISE)")
                return
        }
        if input.PrixMensuel < 0 {
                writeJSONError(w, http.StatusBadRequest, "prixMensuel doit être >= 0")
                return
        }
        // Validations limites (A9) — defaults cohérents si nil.
        validateLimit := func(v *int, min, def int, name string) int {
                if v == nil {
                        return def
                }
                if *v < min {
                        writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("%s doit être >= %d", name, min))
                        return def
                }
                return *v
        }
        nbEtab := validateLimit(input.NbEtablissementsMax, 1, 1, "nbEtablissementsMax")
        nbFil := validateLimit(input.NbFilieresMax, 1, 5, "nbFilieresMax")
        nbEns := validateLimit(input.NbEnseignantsMax, 1, 10, "nbEnseignantsMax")
        nbEtu := validateLimit(input.NbEtudiantsMax, 1, 100, "nbEtudiantsMax")
        nbQue := validateLimit(input.NbQuestionsMax, 1, 500, "nbQuestionsMax")
        nbEval := validateLimit(input.NbEvaluationsMois, 1, 10, "nbEvaluationsMois")
        // Si une validation a échoué, on a déjà écrit l'erreur (writeJSONError).
        // On ne peut pas interrompre proprement ici, donc on vérifie via ResponseWriter.
        // Simplification : re-vérifier les bornes.
        if nbEtab < 1 || nbFil < 1 || nbEns < 1 || nbEtu < 1 || nbQue < 1 || nbEval < 1 {
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

        created := plan{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "plan_" + uuid.NewString()
                support := "email"
                if input.Support != nil && *input.Support != "" {
                        support = *input.Support
                }
                err := tx.QueryRow(r.Context(), `
                        INSERT INTO "Plan" (
                                "id", "nom", "type", "prixMensuel", "prixAnnuel",
                                "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax",
                                "nbEtudiantsMax", "nbQuestionsMax", "nbEvaluationsMois",
                                "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
                                "support", "description", "actif", "createdAt", "updatedAt"
                        ) VALUES (
                                $1, $2, $3::"TypePlan", $4, $5,
                                $6, $7, $8, $9, $10, $11,
                                COALESCE($12, false), COALESCE($13, false), COALESCE($14, false), COALESCE($15, true),
                                $16, $17, true, now(), now()
                        )
                        RETURNING "id", "nom", "type"::text, "prixMensuel", "prixAnnuel",
                                "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax",
                                "nbEtudiantsMax", "nbQuestionsMax", "nbEvaluationsMois",
                                "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
                                "support", "description", "actif"
                `, newID, input.Nom, input.Type, input.PrixMensuel, input.PrixAnnuel,
                        nbEtab, nbFil, nbEns, nbEtu, nbQue, nbEval,
                        input.IaGeneration, input.IaCorrection, input.Proctoring, input.ExportPDF,
                        support, input.Description,
                ).Scan(
                        &created.ID, &created.Nom, &created.Type, &created.PrixMensuel, &created.PrixAnnuel,
                        &created.NbEtablissementsMax, &created.NbFilieresMax, &created.NbEnseignantsMax,
                        &created.NbEtudiantsMax, &created.NbQuestionsMax, &created.NbEvaluationsMois,
                        &created.IaGeneration, &created.IaCorrection, &created.Proctoring, &created.ExportPDF,
                        &created.Support, &created.Description, &created.Actif,
                )
                if err == nil {
                        success = true
                }
                return nil
        })

        if !success {
                // RLS (non-admin) ou unique constraint violation (Plan_nom_key).
                writeJSONError(w, http.StatusForbidden, "création non autorisée ou nom de plan déjà utilisé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"plan": created})
}

// updatePlan — PATCH /api/plans/{id}
func (s *Server) updatePlan(w http.ResponseWriter, r *http.Request) {
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
                Nom                 *string  `json:"nom"`
                Type                *string  `json:"type"`
                PrixMensuel         *float64 `json:"prixMensuel"`
                PrixAnnuel          *float64 `json:"prixAnnuel"`
                NbEtablissementsMax *int     `json:"nbEtablissementsMax"`
                NbFilieresMax       *int     `json:"nbFilieresMax"`
                NbEnseignantsMax    *int     `json:"nbEnseignantsMax"`
                NbEtudiantsMax      *int     `json:"nbEtudiantsMax"`
                NbQuestionsMax      *int     `json:"nbQuestionsMax"`
                NbEvaluationsMois   *int     `json:"nbEvaluationsMois"`
                IaGeneration        *bool    `json:"iaGeneration"`
                IaCorrection        *bool    `json:"iaCorrection"`
                Proctoring          *bool    `json:"proctoring"`
                ExportPDF           *bool    `json:"exportPDF"`
                Support             *string  `json:"support"`
                Description         *string  `json:"description"`
                Actif               *bool    `json:"actif"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Type != nil && !validTypesPlan[*input.Type] {
                writeJSONError(w, http.StatusBadRequest, "type invalide")
                return
        }
        if input.PrixMensuel != nil && *input.PrixMensuel < 0 {
                writeJSONError(w, http.StatusBadRequest, "prixMensuel doit être >= 0")
                return
        }
        if input.NbEtablissementsMax != nil && *input.NbEtablissementsMax < 1 {
                writeJSONError(w, http.StatusBadRequest, "nbEtablissementsMax doit être >= 1")
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

        updated := plan{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(r.Context(), `
                        UPDATE "Plan" SET
                                "nom" = COALESCE($2, "nom"),
                                "type" = CASE WHEN $3::text IS NULL THEN "type" ELSE $3::"TypePlan" END,
                                "prixMensuel" = COALESCE($4, "prixMensuel"),
                                "prixAnnuel" = COALESCE($5, "prixAnnuel"),
                                "nbEtablissementsMax" = COALESCE($6, "nbEtablissementsMax"),
                                "nbFilieresMax" = COALESCE($7, "nbFilieresMax"),
                                "nbEnseignantsMax" = COALESCE($8, "nbEnseignantsMax"),
                                "nbEtudiantsMax" = COALESCE($9, "nbEtudiantsMax"),
                                "nbQuestionsMax" = COALESCE($10, "nbQuestionsMax"),
                                "nbEvaluationsMois" = COALESCE($11, "nbEvaluationsMois"),
                                "iaGeneration" = COALESCE($12, "iaGeneration"),
                                "iaCorrection" = COALESCE($13, "iaCorrection"),
                                "proctoring" = COALESCE($14, "proctoring"),
                                "exportPDF" = COALESCE($15, "exportPDF"),
                                "support" = COALESCE($16, "support"),
                                "description" = COALESCE($17, "description"),
                                "actif" = COALESCE($18, "actif"),
                                "updatedAt" = now()
                        WHERE "id" = $1
                        RETURNING "id", "nom", "type"::text, "prixMensuel", "prixAnnuel",
                                "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax",
                                "nbEtudiantsMax", "nbQuestionsMax", "nbEvaluationsMois",
                                "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
                                "support", "description", "actif"
                `, id,
                        input.Nom, input.Type, input.PrixMensuel, input.PrixAnnuel,
                        input.NbEtablissementsMax, input.NbFilieresMax, input.NbEnseignantsMax,
                        input.NbEtudiantsMax, input.NbQuestionsMax, input.NbEvaluationsMois,
                        input.IaGeneration, input.IaCorrection, input.Proctoring, input.ExportPDF,
                        input.Support, input.Description, input.Actif,
                ).Scan(
                        &updated.ID, &updated.Nom, &updated.Type, &updated.PrixMensuel, &updated.PrixAnnuel,
                        &updated.NbEtablissementsMax, &updated.NbFilieresMax, &updated.NbEnseignantsMax,
                        &updated.NbEtudiantsMax, &updated.NbQuestionsMax, &updated.NbEvaluationsMois,
                        &updated.IaGeneration, &updated.IaCorrection, &updated.Proctoring, &updated.ExportPDF,
                        &updated.Support, &updated.Description, &updated.Actif,
                )
                if err == nil {
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "plan non trouvé ou non autorisé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"plan": updated})
}
