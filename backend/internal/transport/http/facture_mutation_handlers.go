package http

// facture_mutation_handlers.go — Mutations pour /api/factures.
//
// FACTURATION-FIX-F1+F2+F3+F4 : avant, seules les GET étaient déclarées →
// création, consultation détail, marquer payée, annulation de factures
// retournaient 404/405. Le module /facturation était entièrement en lecture
// seule (et la lecture elle-même était cassée — F5 corrigé dans stub_handlers_real2.go).
//
// Implémentation : handlers stub (pool pgx direct + RLS), cohérents avec
// facturesListReal. Les RLS policies Facture_modify_admin filtrent les writes
// (is_admin()). Le schéma DB est complet (numero, montantHt, tva, montantTtc,
// dateEmission, dateEcheance, lignes JSON, etc.).

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

// validStatutsFacture — les statuts de facture gérés par le frontend.
var validStatutsFacture = map[string]bool{
        "EN_ATTENTE": true,
        "PAYEE":      true,
        "EN_RETARD":  true,
        "ANNULEE":    true,
}

// factureResponse est la structure de réponse commune (GET liste, GET/{id}, POST, PATCH).
type factureResponse struct {
        ID                string             `json:"id"`
        Numero            string             `json:"numero"`
        AbonnementID      string             `json:"abonnementId"`
        EtablissementID   string             `json:"etablissementId"`
        MontantHt         float64            `json:"montantHt"`
        Tva               float64            `json:"tva"`
        MontantTtc        float64            `json:"montantTtc"`
        Statut            string             `json:"statut"`
        DateEmission      string             `json:"dateEmission"`
        DateEcheance      string             `json:"dateEcheance"`
        DatePaiement      *string            `json:"datePaiement,omitempty"`
        ModePaiement      *string            `json:"modePaiement,omitempty"`
        ReferencePaiement *string            `json:"referencePaiement,omitempty"`
        Lignes            []factureLigneJSON `json:"lignes"`
        Notes             *string            `json:"notes,omitempty"`
}

type factureLigneJSON struct {
        Description string  `json:"description"`
        Montant     float64 `json:"montant"`
}

// scanFactureRow scanne une ligne SQL vers factureResponse.
// Les colonnes doivent correspondre au SELECT de facturesListReal (sans les JOINs).
func scanFactureRow(row interface{ Scan(...any) error }) (*factureResponse, error) {
        f := &factureResponse{Lignes: []factureLigneJSON{}}
        var dateEmission, dateEcheance time.Time
        var datePaiement *time.Time
        var lignesJSON string
        if err := row.Scan(
                &f.ID, &f.Numero, &f.AbonnementID, &f.EtablissementID,
                &f.MontantHt, &f.Tva, &f.MontantTtc, &f.Statut,
                &dateEmission, &dateEcheance, &datePaiement,
                &f.ModePaiement, &f.ReferencePaiement, &lignesJSON, &f.Notes,
        ); err != nil {
                return nil, err
        }
        f.DateEmission = dateEmission.UTC().Format(time.RFC3339)
        f.DateEcheance = dateEcheance.UTC().Format(time.RFC3339)
        if datePaiement != nil {
                ts := datePaiement.UTC().Format(time.RFC3339)
                f.DatePaiement = &ts
        }
        if lignesJSON != "" {
                var lignes []factureLigneJSON
                if json.Unmarshal([]byte(lignesJSON), &lignes) == nil {
                        f.Lignes = lignes
                }
        }
        return f, nil
}

// factureColumns est la liste des colonnes pour SELECT sans JOINs.
const factureColumns = `"id", "numero", "abonnementId", "etablissementId",
        "montantHt", "tva", "montantTtc", "statut",
        "dateEmission", "dateEcheance", "datePaiement",
        "modePaiement", "referencePaiement", "lignes", "notes"`

// createFacture — POST /api/factures
func (s *Server) createFacture(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                AbonnementID    string             `json:"abonnementId"`
                EtablissementID string             `json:"etablissementId"`
                MontantHt       float64            `json:"montantHt"`
                Tva             *float64           `json:"tva"`
                MontantTtc      float64            `json:"montantTtc"`
                DateEcheance    string             `json:"dateEcheance"`
                Lignes          []factureLigneJSON `json:"lignes"`
                Notes           *string            `json:"notes"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.AbonnementID == "" {
                writeJSONError(w, http.StatusBadRequest, "abonnementId requis")
                return
        }
        if input.EtablissementID == "" {
                writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
                return
        }
        if input.MontantHt < 0 {
                writeJSONError(w, http.StatusBadRequest, "montantHt doit être >= 0")
                return
        }
        if input.MontantTtc < input.MontantHt {
                writeJSONError(w, http.StatusBadRequest, "montantTtc doit être >= montantHt")
                return
        }
        if len(input.Lignes) == 0 {
                writeJSONError(w, http.StatusBadRequest, "au moins une ligne de facturation requise")
                return
        }
        dateEcheance, err := time.Parse("2006-01-02", input.DateEcheance)
        if err != nil {
                writeJSONError(w, http.StatusBadRequest, "dateEcheance invalide (format YYYY-MM-DD)")
                return
        }

        // Sérialiser les lignes en JSON.
        lignesJSON, err := json.Marshal(input.Lignes)
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur sérialisation lignes")
                return
        }

        // TVA default 20% si non fournie.
        tva := 20.0
        if input.Tva != nil {
                tva = *input.Tva
        }

        created := &factureResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "fact_" + uuid.NewString()
                // Générer un numéro de facture : FAC-YYYY-NNNNN (incrémental par année).
                var numero string
                year := time.Now().Year()
                if err := tx.QueryRow(r.Context(), `
                        SELECT COALESCE(MAX(CAST(SUBSTRING("numero" FROM '\d+$') AS int)), 0) + 1
                        FROM "Facture" WHERE "numero" LIKE $1
                `, fmt.Sprintf("FAC-%d-%%", year)).Scan(&numero); err != nil {
                        numero = "1"
                }
                numeroStr := fmt.Sprintf("FAC-%d-%05d", year, 0)
                if n, ok := stringToIntSafe(numero); ok {
                        numeroStr = fmt.Sprintf("FAC-%d-%05d", year, n)
                }

                row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        INSERT INTO "Facture" ("id", "numero", "abonnementId", "etablissementId",
                                "montantHt", "tva", "montantTtc", "statut",
                                "dateEmission", "dateEcheance", "datePaiement",
                                "modePaiement", "referencePaiement", "lignes", "notes",
                                "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 'EN_ATTENTE',
                                now(), $8, NULL, NULL, NULL, $9, $10, now(), now())
                        RETURNING %s
                `, factureColumns),
                        newID, numeroStr, input.AbonnementID, input.EtablissementID,
                        input.MontantHt, tva, input.MontantTtc,
                        dateEcheance, string(lignesJSON), input.Notes,
                )
                f, err := scanFactureRow(row)
                if err == nil {
                        created = f
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusForbidden, "création non autorisée ou abonnement/établissement invalide")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"facture": created})
}

// getFactureByID — GET /api/factures/{id}
// SECT-FACTURATION-AUDIT-E2E [B1] : retourne une structure nested (abonnement{plan} + etablissement)
// identique à facturesListReal, afin que le dialogue de détail frontend puisse lire
// .etablissement.nom / .abonnement.plan.nom sans crasher (Cannot read properties of undefined).
func (s *Server) getFactureByID(w http.ResponseWriter, r *http.Request) {
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

        // Structs nested locales (mirror de facturesListReal pour cohérence de payload).
        type ligneFacture struct {
                Description string  `json:"description"`
                Montant     float64 `json:"montant"`
        }
        type planRef struct {
                ID          string   `json:"id"`
                Nom         string   `json:"nom"`
                Type        string   `json:"type"`
                PrixMensuel float64  `json:"prixMensuel"`
                PrixAnnuel  *float64 `json:"prixAnnuel,omitempty"`
        }
        type abonnementRef struct {
                ID     string  `json:"id"`
                Statut string  `json:"statut"`
                Plan   planRef `json:"plan"`
        }
        type etablissementRef struct {
                ID        string  `json:"id"`
                Nom       string  `json:"nom"`
                Ville     *string `json:"ville,omitempty"`
                Email     *string `json:"email,omitempty"`
                Type      *string `json:"type,omitempty"`
                Pays      *string `json:"pays,omitempty"`
                Telephone *string `json:"telephone,omitempty"`
                Adresse   *string `json:"adresse,omitempty"`
        }
        type factureDetail struct {
                ID                string           `json:"id"`
                Numero            string           `json:"numero"`
                AbonnementID      string           `json:"abonnementId"`
                EtablissementID   string           `json:"etablissementId"`
                MontantHt         float64          `json:"montantHt"`
                Tva               float64          `json:"tva"`
                MontantTtc        float64          `json:"montantTtc"`
                Statut            string           `json:"statut"`
                DateEmission      string           `json:"dateEmission"`
                DateEcheance      string           `json:"dateEcheance"`
                DatePaiement      *string          `json:"datePaiement,omitempty"`
                ModePaiement      *string          `json:"modePaiement,omitempty"`
                ReferencePaiement *string          `json:"referencePaiement,omitempty"`
                Lignes            []ligneFacture   `json:"lignes"`
                Notes             *string          `json:"notes,omitempty"`
                Abonnement        *abonnementRef   `json:"abonnement,omitempty"`
                Etablissement     *etablissementRef `json:"etablissement,omitempty"`
        }

        found := &factureDetail{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), `
                        SELECT f."id", f."numero", f."abonnementId", f."etablissementId",
                               f."montantHt", f."tva", f."montantTtc", f."statut",
                               f."dateEmission", f."dateEcheance", f."datePaiement",
                               f."modePaiement", f."referencePaiement", f."lignes", f."notes",
                               a."id", a."statut"::text,
                               p."id", p."nom", p."type"::text, p."prixMensuel", p."prixAnnuel",
                               e."id", e."nom", e."ville", e."email", e."type", e."pays", e."telephone", e."adresse"
                        FROM "Facture" f
                        LEFT JOIN "Abonnement" a ON a."id" = f."abonnementId"
                        LEFT JOIN "Plan" p ON p."id" = a."planId"
                        LEFT JOIN "Etablissement" e ON e."id" = f."etablissementId"
                        WHERE f."id" = $1
                `, id)

                var dateEmission, dateEcheance time.Time
                var datePaiement *time.Time
                var lignesJSON string
                var aboID, aboStatut, planID, planNom, planType *string
                var planPrix, planAnnuel *float64
                var etabID2, etabNom, etabVille, etabEmail, etabType, etabPays, etabTel, etabAdr *string
                if err := row.Scan(
                        &found.ID, &found.Numero, &found.AbonnementID, &found.EtablissementID,
                        &found.MontantHt, &found.Tva, &found.MontantTtc, &found.Statut,
                        &dateEmission, &dateEcheance, &datePaiement,
                        &found.ModePaiement, &found.ReferencePaiement, &lignesJSON, &found.Notes,
                        &aboID, &aboStatut,
                        &planID, &planNom, &planType, &planPrix, &planAnnuel,
                        &etabID2, &etabNom, &etabVille, &etabEmail, &etabType, &etabPays, &etabTel, &etabAdr,
                ); err != nil {
                        return nil // not found ou erreur RLS → 404 côté HTTP
                }

                found.DateEmission = dateEmission.UTC().Format(time.RFC3339)
                found.DateEcheance = dateEcheance.UTC().Format(time.RFC3339)
                if datePaiement != nil {
                        ts := datePaiement.UTC().Format(time.RFC3339)
                        found.DatePaiement = &ts
                }
                found.Lignes = []ligneFacture{}
                if lignesJSON != "" {
                        var lignes []ligneFacture
                        if json.Unmarshal([]byte(lignesJSON), &lignes) == nil {
                                found.Lignes = lignes
                        }
                }
                if aboID != nil {
                        plan := planRef{}
                        if planID != nil {
                                plan.ID = *planID
                        }
                        if planNom != nil {
                                plan.Nom = *planNom
                        }
                        if planType != nil {
                                plan.Type = *planType
                        }
                        if planPrix != nil {
                                plan.PrixMensuel = *planPrix
                        }
                        plan.PrixAnnuel = planAnnuel
                        aboStatutStr := ""
                        if aboStatut != nil {
                                aboStatutStr = *aboStatut
                        }
                        found.Abonnement = &abonnementRef{
                                ID:     *aboID,
                                Statut: aboStatutStr,
                                Plan:   plan,
                        }
                }
                if etabID2 != nil && etabNom != nil {
                        found.Etablissement = &etablissementRef{
                                ID:        *etabID2,
                                Nom:       *etabNom,
                                Ville:     etabVille,
                                Email:     etabEmail,
                                Type:      etabType,
                                Pays:      etabPays,
                                Telephone: etabTel,
                                Adresse:   etabAdr,
                        }
                }
                success = true
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "facture non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"facture": found})
}

// updateFacture — PATCH /api/factures/{id}
// Gère principalement le "marquer comme payée" (statut → PAYEE + datePaiement + modePaiement).
func (s *Server) updateFacture(w http.ResponseWriter, r *http.Request) {
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
                Statut            *string `json:"statut"`
                ModePaiement      *string `json:"modePaiement"`
                ReferencePaiement *string `json:"referencePaiement"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Statut != nil && !validStatutsFacture[*input.Statut] {
                writeJSONError(w, http.StatusBadRequest, "statut invalide (EN_ATTENTE, PAYEE, EN_RETARD, ANNULEE)")
                return
        }

        updated := &factureResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Si statut → PAYEE, set datePaiement = now() automatiquement.
                var datePaiementExpr string
                if input.Statut != nil && *input.Statut == "PAYEE" {
                        datePaiementExpr = "CASE WHEN \"datePaiement\" IS NULL THEN now() ELSE \"datePaiement\" END"
                } else {
                        datePaiementExpr = `"datePaiement"`
                }

                query := fmt.Sprintf(`
                        UPDATE "Facture" SET
                                "statut" = COALESCE($2, "statut"),
                                "datePaiement" = %s,
                                "modePaiement" = COALESCE($3, "modePaiement"),
                                "referencePaiement" = COALESCE($4, "referencePaiement"),
                                "updatedAt" = now()
                        WHERE "id" = $1
                        RETURNING %s
                `, datePaiementExpr, factureColumns)

                row := tx.QueryRow(r.Context(), query, id, input.Statut, input.ModePaiement, input.ReferencePaiement)
                f, err := scanFactureRow(row)
                if err == nil {
                        updated = f
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "facture non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"facture": updated})
}

// cancelFacture — DELETE /api/factures/{id} (annuler, soft-delete)
func (s *Server) cancelFacture(w http.ResponseWriter, r *http.Request) {
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

        cancelled := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Soft-delete : statut → ANNULEE (conserve l'historique pour l'audit comptable).
                tag, err := tx.Exec(r.Context(), `
                        UPDATE "Facture" SET "statut" = 'ANNULEE', "updatedAt" = now()
                        WHERE "id" = $1
                `, id)
                if err == nil && tag.RowsAffected() > 0 {
                        cancelled = true
                }
                return nil
        })

        if !cancelled {
                writeJSONError(w, http.StatusNotFound, "facture non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "facture annulée"})
}

// stringToIntSafe convertit une string en int de manière sûre.
func stringToIntSafe(s string) (int, bool) {
        n := 0
        for _, c := range s {
                if c < '0' || c > '9' {
                        return 0, false
                }
                n = n*10 + int(c-'0')
        }
        return n, true
}
