// Package http — handlers pour /api/affectations.
package http

import (
        "encoding/json"
        "fmt"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// Affectations — GET/POST /api/affectations, PATCH/DELETE /api/affectations/{id}
// ──────────────────────────────────────────────────────────────────────────
//
// BUGFIX (PROG-ACAD-2) : la table Affectation (15 rows en DB) n'avait AUCUN
// endpoint backend → /affectations page retournait 404. Ces handlers exposent
// le CRUD avec LEFT JOIN User + UniteEnseignement pour peupler les relations.

// listAffectations — GET /api/affectations
func (s *Server) listAffectations(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        enseignantID := r.URL.Query().Get("enseignantId")
        ueID := r.URL.Query().Get("uniteEnseignementId")
        etabID := r.URL.Query().Get("etablissementId")
        filiereID := r.URL.Query().Get("filiereId")
        niveau := r.URL.Query().Get("niveau")
        statut := r.URL.Query().Get("statut")
        annee := r.URL.Query().Get("anneeUniversitaire")

        type affRow struct {
                ID                  string  `json:"id"`
                EnseignantID        string  `json:"enseignantId"`
                UniteEnseignementID string  `json:"uniteEnseignementId"`
                TypeSeance          string  `json:"typeSeance"`
                Groupe              *string `json:"groupe,omitempty"`
                VolumeHeures        float64 `json:"volumeHeures"`
                AnneeUniversitaire  string  `json:"anneeUniversitaire"`
                Statut              string  `json:"statut"`
                Commentaire         *string `json:"commentaire,omitempty"`
                CreatedAt           string  `json:"createdAt"`
                UpdatedAt           string  `json:"updatedAt"`
                Enseignant          *struct {
                        ID    string `json:"id"`
                        Name  string `json:"name"`
                        Email string `json:"email"`
                } `json:"enseignant,omitempty"`
                UniteEnseignement *struct {
                        ID            string  `json:"id"`
                        Code          string  `json:"code"`
                        Nom           string  `json:"nom"`
                        Niveau        string  `json:"niveau"`
                        Niveaux       *string `json:"niveaux,omitempty"`
                        Filiere       *struct {
                                ID   string  `json:"id"`
                                Nom  string  `json:"nom"`
                                Code *string `json:"code,omitempty"`
                        } `json:"filiere,omitempty"`
                        FilieresSuppl []struct {
                                ID        string `json:"id"`
                                FiliereID string `json:"filiereId"`
                                Filiere   struct {
                                        ID   string  `json:"id"`
                                        Nom  string  `json:"nom"`
                                        Code *string `json:"code,omitempty"`
                                } `json:"filiere"`
                        } `json:"filieresSuppl,omitempty"`
                } `json:"uniteEnseignement,omitempty"`
        }

        result := []affRow{}

        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1
                if enseignantID != "" {
                        where = append(where, fmt.Sprintf(`a."enseignantId" = $%d`, argIdx))
                        args = append(args, enseignantID)
                        argIdx++
                }
                if ueID != "" {
                        where = append(where, fmt.Sprintf(`a."uniteEnseignementId" = $%d`, argIdx))
                        args = append(args, ueID)
                        argIdx++
                }
                if statut != "" {
                        where = append(where, fmt.Sprintf(`a."statut"::text = $%d`, argIdx))
                        args = append(args, statut)
                        argIdx++
                }
                if annee != "" {
                        where = append(where, fmt.Sprintf(`a."anneeUniversitaire" = $%d`, argIdx))
                        args = append(args, annee)
                        argIdx++
                }
                if etabID != "" {
                        where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "UniteEnseignement" ue2 JOIN "Filiere" f2 ON f2."id" = ue2."filiereId" WHERE ue2."id" = a."uniteEnseignementId" AND f2."etablissementId" = $%d)`, argIdx))
                        args = append(args, etabID)
                        argIdx++
                }
                if filiereID != "" {
                        // AFFECTATIONS-FIX-A9 : inclure UE multi-filières (N:N via
                        // UniteEnseignementFiliere). Avant, seul ue."filiereId" était
                        // checké → une UE partagée INFO+SEG n'était pas retournée
                        // si on filtrait sur SEG (la filière supplémentaire).
                        where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "UniteEnseignement" ue3 WHERE ue3."id" = a."uniteEnseignementId" AND (ue3."filiereId" = $%d OR EXISTS (SELECT 1 FROM "UniteEnseignementFiliere" uef3 WHERE uef3."uniteEnseignementId" = ue3."id" AND uef3."filiereId" = $%d)))`, argIdx, argIdx))
                        args = append(args, filiereID)
                        argIdx++
                }
                if niveau != "" {
                        // AFFECTATIONS-FIX-A8 : inclure UE multi-niveaux (niveaux JSON).
                        // Avant, seul ue."niveau" était checké → une UE avec
                        // niveaux='["L1","L2"]' et niveau="L2" n'était pas retournée
                        // si on filtrait sur L1. Désormais on check niveau exact OU
                        // présence dans le JSON array niveaux.
                        where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "UniteEnseignement" ue4 WHERE ue4."id" = a."uniteEnseignementId" AND (ue4."niveau" = $%d OR ue4."niveaux"::jsonb ? $%d::text))`, argIdx, argIdx))
                        args = append(args, niveau)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`
                        SELECT a."id", a."enseignantId", a."uniteEnseignementId", a."typeSeance"::text,
                               a."groupe", a."volumeHeures", a."anneeUniversitaire", a."statut"::text, a."commentaire",
                               a."createdAt", a."updatedAt",
                               u."id", u."name", u."email",
                               ue."id", ue."code", ue."nom", ue."niveau", ue."niveaux",
                               f."id", f."nom", f."code"
                        FROM "Affectation" a
                        LEFT JOIN "User" u ON u."id" = a."enseignantId"
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                        LEFT JOIN "Filiere" f ON f."id" = ue."filiereId"
                        %s
                        ORDER BY a."createdAt" DESC
                `, whereClause)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        row := affRow{}
                        var ensID, ensName, ensEmail *string
                        var ueID2, ueCode, ueNom, ueNiveau, ueNiveaux *string
                        var filID, filNom, filCode *string
                        var createdAt, updatedAt time.Time
                        if err := rows.Scan(
                                &row.ID, &row.EnseignantID, &row.UniteEnseignementID, &row.TypeSeance,
                                &row.Groupe, &row.VolumeHeures, &row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
                                &createdAt, &updatedAt,
                                &ensID, &ensName, &ensEmail,
                                &ueID2, &ueCode, &ueNom, &ueNiveau, &ueNiveaux,
                                &filID, &filNom, &filCode,
                        ); err != nil {
                                return err
                        }
                        row.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        row.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
                        if ensID != nil && ensName != nil {
                                row.Enseignant = &struct {
                                        ID    string `json:"id"`
                                        Name  string `json:"name"`
                                        Email string `json:"email"`
                                }{ID: *ensID, Name: *ensName, Email: derefStr(ensEmail)}
                        }
                        if ueID2 != nil && ueNom != nil {
                                ue := &struct {
                                        ID            string  `json:"id"`
                                        Code          string  `json:"code"`
                                        Nom           string  `json:"nom"`
                                        Niveau        string  `json:"niveau"`
                                        Niveaux       *string `json:"niveaux,omitempty"`
                                        Filiere       *struct {
                                                ID   string  `json:"id"`
                                                Nom  string  `json:"nom"`
                                                Code *string `json:"code,omitempty"`
                                        } `json:"filiere,omitempty"`
                                        FilieresSuppl []struct {
                                                ID        string `json:"id"`
                                                FiliereID string `json:"filiereId"`
                                                Filiere   struct {
                                                        ID   string  `json:"id"`
                                                        Nom  string  `json:"nom"`
                                                        Code *string `json:"code,omitempty"`
                                                } `json:"filiere"`
                                        } `json:"filieresSuppl,omitempty"`
                                }{
                                        ID:      *ueID2,
                                        Code:    derefStr(ueCode),
                                        Nom:     *ueNom,
                                        Niveau:  derefStr(ueNiveau),
                                        Niveaux: ueNiveaux,
                                }
                                if filID != nil && filNom != nil {
                                        ue.Filiere = &struct {
                                                ID   string  `json:"id"`
                                                Nom  string  `json:"nom"`
                                                Code *string `json:"code,omitempty"`
                                        }{ID: *filID, Nom: *filNom, Code: filCode}
                                }
                                row.UniteEnseignement = ue
                        }
                        result = append(result, row)
                }
                if err := rows.Err(); err != nil {
                        return err
                }

                // PROG-ACAD-CRITICAL-FIX-1 (BUG #5) : recuperer les filieres
                // supplementaires (N:N via UniteEnseignementFiliere) pour chaque
                // UE de la liste. Batch query pour eviter N+1.
                if len(result) > 0 {
                        ueIDs := make([]string, 0, len(result))
                        seen := make(map[string]bool)
                        for _, r := range result {
                                if r.UniteEnseignement != nil && !seen[r.UniteEnseignement.ID] {
                                        ueIDs = append(ueIDs, r.UniteEnseignement.ID)
                                        seen[r.UniteEnseignement.ID] = true
                                }
                        }
                        if len(ueIDs) > 0 {
                                placeholders := make([]string, len(ueIDs))
                                args2 := make([]any, len(ueIDs))
                                for i, id := range ueIDs {
                                        placeholders[i] = fmt.Sprintf("$%d", i+1)
                                        args2[i] = id
                                }
                                query2 := fmt.Sprintf(`
                                        SELECT uef."uniteEnseignementId", uef."id", uef."filiereId",
                                               f."id", f."nom", f."code"
                                        FROM "UniteEnseignementFiliere" uef
                                        JOIN "Filiere" f ON f."id" = uef."filiereId"
                                        WHERE uef."uniteEnseignementId" IN (%s)
                                        ORDER BY f."nom" ASC
                                `, strings.Join(placeholders, ", "))
                                rows2, err := tx.Query(r.Context(), query2, args2...)
                                if err != nil {
                                        return fmt.Errorf("query filieres suppl: %w", err)
                                }
                                defer rows2.Close()
                                type supplItem = struct {
                                        ID        string `json:"id"`
                                        FiliereID string `json:"filiereId"`
                                        Filiere   struct {
                                                ID   string  `json:"id"`
                                                Nom  string  `json:"nom"`
                                                Code *string `json:"code,omitempty"`
                                        } `json:"filiere"`
                                }
                                supplMap := make(map[string][]supplItem)
                                for rows2.Next() {
                                        // AFFECTATIONS-FIX-A1 : la query SELECT 6 colonnes
                                        // (uef.uniteEnseignementId, uef.id, uef.filiereId, f.id, f.nom, f.code)
                                        // — il faut 6 destinations, pas 5. Avant ce fix, le Scan
                                        // n'avait que 5 vars → erreur "number of field descriptions
                                        // must equal number of destinations, got 6 and 5" → tout
                                        // listAffectations échouait en 500.
                                        var ueID, uefID, uefFilID, filID2, filNom2 string
                                        var filCode2 *string
                                        if err := rows2.Scan(&ueID, &uefID, &uefFilID, &filID2, &filNom2, &filCode2); err != nil {
                                                return fmt.Errorf("scan filiere suppl: %w", err)
                                        }
                                        item := supplItem{ID: uefID, FiliereID: filID2}
                                        item.Filiere.ID = filID2
                                        item.Filiere.Nom = filNom2
                                        item.Filiere.Code = filCode2
                                        supplMap[ueID] = append(supplMap[ueID], item)
                                }
                                for i := range result {
                                        if result[i].UniteEnseignement != nil {
                                                if suppl, ok := supplMap[result[i].UniteEnseignement.ID]; ok {
                                                        result[i].UniteEnseignement.FilieresSuppl = suppl
                                                }
                                        }
                                }
                        }
                }
                return nil
        })

        // PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
        // Avant, `_ = appdb.WithTx(...)` jetait l'erreur → si la query fail
        // (RLS policy block, syntax error, etc.), `result` restait `[]affRow{}`
        // → response `{"affectations": []}` → l'utilisateur voyait une liste
        // vide au lieu d'une erreur.
        if err != nil {
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "foreign key constraint"):
                        writeJSONError(w, http.StatusBadRequest, "Référence FK invalide (enseignant ou UE introuvable)")
                case strings.Contains(errMsg, "unique constraint"), strings.Contains(errMsg, "duplicate key"):
                        writeJSONError(w, http.StatusConflict, "Conflit de données")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "Erreur lors de la lecture des affectations: "+errMsg)
                }
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "affectations": result,
        })
}

// createAffectation — POST /api/affectations
func (s *Server) createAffectation(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                EnseignantID        string  `json:"enseignantId"`
                UniteEnseignementID string  `json:"uniteEnseignementId"`
                TypeSeance          string  `json:"typeSeance"`
                Groupe              *string `json:"groupe"`
                VolumeHeures        float64 `json:"volumeHeures"`
                AnneeUniversitaire  string  `json:"anneeUniversitaire"`
                Statut              string  `json:"statut"`
                Commentaire         *string `json:"commentaire"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid request body")
                return
        }
        if input.EnseignantID == "" || input.UniteEnseignementID == "" {
                writeJSONError(w, http.StatusBadRequest, "enseignantId et uniteEnseignementId requis")
                return
        }
        // AFFECTATIONS-FIX-A2 : validation enum typeSeance/statut alignée sur la DB.
        // Avant, le handler validait [PROVISOIRE, CONFIRME, ANNULE] mais l'enum DB
        // StatutAffectation = [PROVISOIRE, VALIDEE, PUBLIEE] → POST {statut:VALIDEE}
        // était rejeté par le handler (400) alors que c'est une valeur DB valide, et
        // POST {statut:CONFIRME} passait le handler mais échouait côté DB (invalid
        // enum value). Désormais on valide les vraies valeurs DB.
        validTypes := map[string]bool{"CM": true, "TD": true, "TP": true}
        validStatuts := map[string]bool{"PROVISOIRE": true, "VALIDEE": true, "PUBLIEE": true}
        if input.TypeSeance == "" {
                input.TypeSeance = "CM"
        } else if !validTypes[input.TypeSeance] {
                writeJSONError(w, http.StatusBadRequest, "typeSeance invalide (valeurs acceptées: CM, TD, TP)")
                return
        }
        if input.Statut == "" {
                input.Statut = "PROVISOIRE"
        } else if !validStatuts[input.Statut] {
                writeJSONError(w, http.StatusBadRequest, "statut invalide (valeurs acceptées: PROVISOIRE, VALIDEE, PUBLIEE)")
                return
        }
        // PROG-ACAD-CRITICAL-FIX-1 (BUG #12) : au lieu de hardcoder "2024-2025",
        // utiliser l'année courante (format YYYY-YYYY+1).
        if input.AnneeUniversitaire == "" {
                now := time.Now()
                year := now.Year()
                if now.Month() >= 9 { // rentrée = septembre
                        input.AnneeUniversitaire = fmt.Sprintf("%d-%d", year, year+1)
                } else {
                        input.AnneeUniversitaire = fmt.Sprintf("%d-%d", year-1, year)
                }
        }

        id := uuid.NewString()
        var row struct {
                ID                  string
                EnseignantID        string
                UniteEnseignementID string
                TypeSeance          string
                Groupe              *string
                VolumeHeures        float64
                AnneeUniversitaire  string
                Statut              string
                Commentaire         *string
        }

        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), `
                        INSERT INTO "Affectation" ("id", "enseignantId", "uniteEnseignementId", "typeSeance",
                                "groupe", "volumeHeures", "anneeUniversitaire", "statut", "commentaire", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING "id", "enseignantId", "uniteEnseignementId", "typeSeance"::text,
                                "groupe", "volumeHeures", "anneeUniversitaire", "statut"::text, "commentaire"
                `, id, input.EnseignantID, input.UniteEnseignementID, input.TypeSeance,
                        input.Groupe, input.VolumeHeures, input.AnneeUniversitaire,
                        input.Statut, input.Commentaire,
                ).Scan(
                        &row.ID, &row.EnseignantID, &row.UniteEnseignementID,
                        &row.TypeSeance, &row.Groupe, &row.VolumeHeures,
                        &row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
                )
        })

        // PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
        // Avant, `_ = appdb.WithTx(...)` jetait l'erreur → si l'INSERT fail
        // (unique violation sur (enseignantId, uniteEnseignementId, typeSeance,
        // groupe, anneeUniversitaire), FK violation, enum invalide pour
        // typeSeance/statut, RLS policy block), la response était 201 Created
        // avec `{affectation: {id: "", ...}}` (tous les champs vides) → le
        // frontend voyait un 201, affichait un toast succès, mais aucune
        // affectation n'était créée. Silent data loss.
        if err != nil {
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "Affectation_enseignantId_fkey"),
                        strings.Contains(errMsg, "foreign key constraint") && strings.Contains(errMsg, "enseignantId"):
                        writeJSONError(w, http.StatusBadRequest, "Enseignant introuvable")
                case strings.Contains(errMsg, "Affectation_uniteEnseignementId_fkey"),
                        strings.Contains(errMsg, "foreign key constraint") && strings.Contains(errMsg, "uniteEnseignementId"):
                        writeJSONError(w, http.StatusBadRequest, "Unité d'enseignement introuvable")
                case strings.Contains(errMsg, "foreign key constraint"):
                        writeJSONError(w, http.StatusBadRequest, "Référence FK invalide")
                case strings.Contains(errMsg, "unique constraint"), strings.Contains(errMsg, "duplicate key"):
                        writeJSONError(w, http.StatusConflict, "Cette affectation existe déjà (doublon enseignant/UE/type/groupe/année)")
                case strings.Contains(errMsg, "invalid_enum_value"), strings.Contains(errMsg, "invalid input value for enum"):
                        writeJSONError(w, http.StatusBadRequest, "Valeur d'enum invalide (typeSeance ou statut)")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "Erreur lors de la création: "+errMsg)
                }
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "affectation": map[string]any{
                        "id":                  row.ID,
                        "enseignantId":        row.EnseignantID,
                        "uniteEnseignementId": row.UniteEnseignementID,
                        "typeSeance":          row.TypeSeance,
                        "groupe":              row.Groupe,
                        "volumeHeures":        row.VolumeHeures,
                        "anneeUniversitaire":  row.AnneeUniversitaire,
                        "statut":              row.Statut,
                        "commentaire":         row.Commentaire,
                },
        })
}

// updateAffectation — PATCH /api/affectations/{id}
func (s *Server) updateAffectation(w http.ResponseWriter, r *http.Request) {
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
                TypeSeance  *string  `json:"typeSeance"`
                Groupe      *string  `json:"groupe"`
                VolumeHeures *float64 `json:"volumeHeures"`
                Statut      *string  `json:"statut"`
                Commentaire *string  `json:"commentaire"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid request body")
                return
        }

        // AFFECTATIONS-FIX-A5 : validation enum typeSeance/statut sur PATCH.
        // Avant, le handler acceptait n'importe quelle valeur → l'UPDATE
        // échouait côté DB (invalid_enum_value) avec un message générique.
        // Désormais on valide côté handler avec un message guidé, cohérent
        // avec createAffectation.
        validTypes := map[string]bool{"CM": true, "TD": true, "TP": true}
        validStatuts := map[string]bool{"PROVISOIRE": true, "VALIDEE": true, "PUBLIEE": true}
        if input.TypeSeance != nil && !validTypes[*input.TypeSeance] {
                writeJSONError(w, http.StatusBadRequest, "typeSeance invalide (valeurs acceptées: CM, TD, TP)")
                return
        }
        if input.Statut != nil && !validStatuts[*input.Statut] {
                writeJSONError(w, http.StatusBadRequest, "statut invalide (valeurs acceptées: PROVISOIRE, VALIDEE, PUBLIEE)")
                return
        }

        var setClauses []string
        var args []any
        argIdx := 1
        if input.TypeSeance != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"typeSeance" = $%d`, argIdx))
                args = append(args, *input.TypeSeance)
                argIdx++
        }
        if input.Groupe != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"groupe" = $%d`, argIdx))
                args = append(args, *input.Groupe)
                argIdx++
        }
        if input.VolumeHeures != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"volumeHeures" = $%d`, argIdx))
                args = append(args, *input.VolumeHeures)
                argIdx++
        }
        if input.Statut != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"statut" = $%d`, argIdx))
                args = append(args, *input.Statut)
                argIdx++
        }
        if input.Commentaire != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"commentaire" = $%d`, argIdx))
                args = append(args, *input.Commentaire)
                argIdx++
        }
        if len(setClauses) == 0 {
                writeJSONError(w, http.StatusBadRequest, "no fields to update")
                return
        }
        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
        args = append(args, id)

        // AFFECTATIONS-FIX-A6 : RETURNING étendu à tous les champs modifiables.
        // Avant, seul {id, statut} était retourné → le frontend devait refetch
        // la liste complète après chaque update pour mettre à jour sa UI.
        // Désormais on retourne tous les champs pour MAJ locale sans refetch.
        var row struct {
                ID                  string
                EnseignantID        string
                UniteEnseignementID string
                TypeSeance          string
                Groupe              *string
                VolumeHeures        float64
                AnneeUniversitaire  string
                Statut              string
                Commentaire         *string
        }
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), fmt.Sprintf(`
                        UPDATE "Affectation" SET %s WHERE "id" = $%d
                        RETURNING "id", "enseignantId", "uniteEnseignementId",
                                  "typeSeance"::text, "groupe", "volumeHeures",
                                  "anneeUniversitaire", "statut"::text, "commentaire"
                `, strings.Join(setClauses, ", "), argIdx), args...,
                ).Scan(
                        &row.ID, &row.EnseignantID, &row.UniteEnseignementID,
                        &row.TypeSeance, &row.Groupe, &row.VolumeHeures,
                        &row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
                )
        })

        // PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
        // Si l'UPDATE fail (not found → Scan retourne pgx.ErrNoRows, FK violation,
        // unique constraint, enum invalide), on retourne le code HTTP approprié
        // au lieu d'une response 200 avec `{affectation: {id: "", statut: ""}}`.
        if err != nil {
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "no rows in result set"):
                        writeJSONError(w, http.StatusNotFound, "Affectation introuvable")
                case strings.Contains(errMsg, "Affectation_enseignantId_fkey"),
                        strings.Contains(errMsg, "foreign key constraint") && strings.Contains(errMsg, "enseignantId"):
                        writeJSONError(w, http.StatusBadRequest, "Enseignant introuvable")
                case strings.Contains(errMsg, "Affectation_uniteEnseignementId_fkey"),
                        strings.Contains(errMsg, "foreign key constraint") && strings.Contains(errMsg, "uniteEnseignementId"):
                        writeJSONError(w, http.StatusBadRequest, "Unité d'enseignement introuvable")
                case strings.Contains(errMsg, "foreign key constraint"):
                        writeJSONError(w, http.StatusBadRequest, "Référence FK invalide")
                case strings.Contains(errMsg, "unique constraint"), strings.Contains(errMsg, "duplicate key"):
                        writeJSONError(w, http.StatusConflict, "Cette affectation existe déjà (doublon)")
                case strings.Contains(errMsg, "invalid_enum_value"), strings.Contains(errMsg, "invalid input value for enum"):
                        writeJSONError(w, http.StatusBadRequest, "Valeur d'enum invalide (typeSeance ou statut)")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "Erreur lors de la mise à jour: "+errMsg)
                }
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "affectation": map[string]any{
                        "id":                  row.ID,
                        "enseignantId":        row.EnseignantID,
                        "uniteEnseignementId": row.UniteEnseignementID,
                        "typeSeance":          row.TypeSeance,
                        "groupe":              row.Groupe,
                        "volumeHeures":        row.VolumeHeures,
                        "anneeUniversitaire":  row.AnneeUniversitaire,
                        "statut":              row.Statut,
                        "commentaire":         row.Commentaire,
                },
        })
}

// deleteAffectation — DELETE /api/affectations/{id}
func (s *Server) deleteAffectation(w http.ResponseWriter, r *http.Request) {
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
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                cmd, err := tx.Exec(r.Context(), `DELETE FROM "Affectation" WHERE "id" = $1`, id)
                if err != nil {
                        return err
                }
                deleted = cmd.RowsAffected() > 0
                return nil
        })

        // PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
        // `deleted` reflète RowsAffected (true si ligne supprimée, false si not
        // found ou erreur) — mais les erreurs SQL étaient quand même silencieuses.
        // On retourne désormais le code HTTP approprié en cas d'erreur.
        if err != nil {
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "foreign key constraint"):
                        // Une affectation est référencée par une table enfant (Epreuve, etc.).
                        writeJSONError(w, http.StatusConflict, "Affectation référencée par d'autres entités (suppression impossible)")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "Erreur lors de la suppression: "+errMsg)
                }
                return
        }

        // AFFECTATIONS-FIX-A7 : si aucune ligne supprimée, retourner 404 au lieu
        // de 200 {deleted:false}. Avant, le frontend voyait un 200 et affichait
        // un toast succès même si l'affectation n'existait pas (déjà supprimée).
        if !deleted {
                writeJSONError(w, http.StatusNotFound, "Affectation introuvable (déjà supprimée ou inaccessible)")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "deleted": deleted,
                "id":      id,
        })
}

// derefStr retourne la valeur pointée ou "" si nil (helper local au package).
func derefStr(p *string) string {
        if p == nil {
                return ""
        }
        return *p
}
