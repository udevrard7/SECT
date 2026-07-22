// Package http — handlers pour /api/affectations.
package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/emailtpl"
	"github.com/udevrard7/sect/backend/internal/mailer"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/notification"
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
		// SECT-AFFECTATION-PUBLISH-ENRICH-1 : horodatage de publication.
		PublishedAt   *string `json:"publishedAt,omitempty"`
		PublishedByID *string `json:"publishedById,omitempty"`
		PublishedBy   *struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"publishedBy,omitempty"`
		Enseignant *struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"enseignant,omitempty"`
		UniteEnseignement *struct {
			ID      string  `json:"id"`
			Code    string  `json:"code"`
			Nom     string  `json:"nom"`
			Niveau  string  `json:"niveau"`
			Niveaux *string `json:"niveaux,omitempty"`
			Filiere *struct {
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
                               f."id", f."nom", f."code",
                               a."publishedAt", a."publishedById", pub."name"
                        FROM "Affectation" a
                        LEFT JOIN "User" u ON u."id" = a."enseignantId"
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                        LEFT JOIN "Filiere" f ON f."id" = ue."filiereId"
                        LEFT JOIN "User" pub ON pub."id" = a."publishedById"
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
			var publishedAt *time.Time
			var publishedByID, publishedByName *string
			var createdAt, updatedAt time.Time
			if err := rows.Scan(
				&row.ID, &row.EnseignantID, &row.UniteEnseignementID, &row.TypeSeance,
				&row.Groupe, &row.VolumeHeures, &row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
				&createdAt, &updatedAt,
				&ensID, &ensName, &ensEmail,
				&ueID2, &ueCode, &ueNom, &ueNiveau, &ueNiveaux,
				&filID, &filNom, &filCode,
				&publishedAt, &publishedByID, &publishedByName,
			); err != nil {
				return err
			}
			row.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			row.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
			// SECT-AFFECTATION-PUBLISH-ENRICH-1 : exposer publishedAt + publishedBy.
			if publishedAt != nil {
				utc := publishedAt.UTC().Format(time.RFC3339)
				row.PublishedAt = &utc
			}
			if publishedByID != nil {
				row.PublishedByID = publishedByID
				if publishedByName != nil {
					row.PublishedBy = &struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					}{ID: *publishedByID, Name: *publishedByName}
				}
			}
			if ensID != nil && ensName != nil {
				row.Enseignant = &struct {
					ID    string `json:"id"`
					Name  string `json:"name"`
					Email string `json:"email"`
				}{ID: *ensID, Name: *ensName, Email: derefStr(ensEmail)}
			}
			if ueID2 != nil && ueNom != nil {
				ue := &struct {
					ID      string  `json:"id"`
					Code    string  `json:"code"`
					Nom     string  `json:"nom"`
					Niveau  string  `json:"niveau"`
					Niveaux *string `json:"niveaux,omitempty"`
					Filiere *struct {
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
		// SECT-AFFECTATION-PUBLISH-ENRICH-1 : horodatage de publication.
		PublishedAt *time.Time
	}

	// SECT-AFFECTATION-PUBLISH-ENRICH-1 : si la création publie directement
	// (statut=PUBLIEE), on set publishedAt + publishedById dès l'INSERT.
	// Cas rare (un responsable crée+publie en une fois) mais à gérer pour
	// la cohérence (sinon une affectation PUBLIEE sans publishedAt).
	insertCols := `"id", "enseignantId", "uniteEnseignementId", "typeSeance",
                                "groupe", "volumeHeures", "anneeUniversitaire", "statut", "commentaire", "createdAt", "updatedAt"`
	insertVals := `$1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP`
	insertArgs := []any{
		id, input.EnseignantID, input.UniteEnseignementID, input.TypeSeance,
		input.Groupe, input.VolumeHeures, input.AnneeUniversitaire,
		input.Statut, input.Commentaire,
	}
	if input.Statut == "PUBLIEE" {
		insertCols = `"id", "enseignantId", "uniteEnseignementId", "typeSeance",
                                "groupe", "volumeHeures", "anneeUniversitaire", "statut", "commentaire", "createdAt", "updatedAt",
                                "publishedAt", "publishedById"`
		insertVals = `$1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                                CURRENT_TIMESTAMP, $10`
		insertArgs = append(insertArgs, claims.UserID)
	}

	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), fmt.Sprintf(`
                        INSERT INTO "Affectation" (%s)
                        VALUES (%s)
                        RETURNING "id", "enseignantId", "uniteEnseignementId", "typeSeance"::text,
                                "groupe", "volumeHeures", "anneeUniversitaire", "statut"::text, "commentaire",
                                "publishedAt"
                `, insertCols, insertVals), insertArgs...,
		).Scan(
			&row.ID, &row.EnseignantID, &row.UniteEnseignementID,
			&row.TypeSeance, &row.Groupe, &row.VolumeHeures,
			&row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
			&row.PublishedAt,
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

// errAffectationLocked — sentinel retournée par updateAffectation quand le
// PATCH tente de modifier une affectation déjà PUBLIEE sans changer son
// statut. Côté handler, on mappe → 409 Conflict.
//
// SECT-AFFECTATION-PUBLISH-ENRICH-1 (lock backend) : une fois publiée, une
// affectation est figée (volume, type, groupe, commentaire) tant que le
// statut reste PUBLIEE. Pour la modifier, il faut d'abord la repasser en
// PROVISOIRE ou VALIDEE. Cela évite qu'un responsable ne modifie
// silencieusement une affectation déjà annoncée aux étudiants.
var errAffectationLocked = fmt.Errorf("affectation published lock")

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
		TypeSeance   *string  `json:"typeSeance"`
		Groupe       *string  `json:"groupe"`
		VolumeHeures *float64 `json:"volumeHeures"`
		Statut       *string  `json:"statut"`
		Commentaire  *string  `json:"commentaire"`
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

	// ── SECT-AFFECTATION-PUBLISH-ENRICH-1 : lock + horodatage + audit + email ──
	// On_fetch d'abord la ligne courante (statut + contexte enseignant/UE)
	// pour : (1) appliquer le lock PUBLIEE, (2) détecter la transition vers
	// PUBLIEE (set publishedAt/publishedById), (3) détecter la transition
	// inverse (clear publishedAt/publishedById), (4) alimenter l'audit +
	// l'email enseignant après publish (sans refetch).
	//
	// On capture ces infos dans des vars outer-scope pour les utiliser
	// après le commit du tx (audit + email non-bloquants hors tx).
	var (
		currentStatut      string
		newStatut          string
		enseignantID       string
		ueID               string
		enseignantName     string
		enseignantEmail    string
		ueCode             string
		ueNom              string
		filiereNom         string
		etablissementNom   string
		transitionToPub    bool // current != PUBLIEE && newStatut == PUBLIEE
		publishedAtRFC3339 *string
	)

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
	// NB : `id` est append à `args` APRÈS l'éventuel publishedById (plus bas),
	// pour que le placeholder $argIdx final pointe bien sur `id` (WHERE id = $argIdx).
	// Si on l'append ici, le placeholder $argIdx utilisé pour publishedById
	// entrerait en conflit avec celui de id.

	// AFFECTATIONS-FIX-A6 : RETURNING étendu à tous les champs modifiables.
	// Avant, seul {id, statut} était retourné → le frontend devait refetch
	// la liste complète après chaque update pour mettre à jour sa UI.
	// Désormais on retourne tous les champs pour MAJ locale sans refetch.
	//
	// SECT-AFFECTATION-PUBLISH-ENRICH-1 : on RETURNING aussi publishedAt
	// (nullable) pour que le frontend puisse afficher « Publiée le … »
	// sans refetch.
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
		PublishedAt         *time.Time
	}
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. SELECT current row : statut + contexte pour lock + audit + email.
		if errQ := tx.QueryRow(r.Context(), `
                        SELECT a."statut"::text,
                               a."enseignantId", a."uniteEnseignementId",
                               a."typeSeance"::text, a."groupe", a."volumeHeures",
                               a."anneeUniversitaire",
                               u."name", u."email",
                               ue."code", ue."nom",
                               f."nom", et."nom"
                        FROM "Affectation" a
                        LEFT JOIN "User" u ON u."id" = a."enseignantId"
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                        LEFT JOIN "Filiere" f ON f."id" = ue."filiereId"
                        LEFT JOIN "Etablissement" et ON et."id" = f."etablissementId"
                        WHERE a."id" = $1
                `, id).Scan(
			&currentStatut,
			&enseignantID, &ueID,
			&row.TypeSeance, &row.Groupe, &row.VolumeHeures,
			&row.AnneeUniversitaire,
			&enseignantName, &enseignantEmail,
			&ueCode, &ueNom,
			&filiereNom, &etablissementNom,
		); errQ != nil {
			if strings.Contains(errQ.Error(), "no rows in result set") {
				return pgx.ErrNoRows
			}
			return errQ
		}

		// 2. Lock : si current == PUBLIEE et qu'on ne repasse PAS en
		// PROVISOIRE/VALIDEE → refus (409). Permet de protéger une
		// affectation déjà annoncée aux étudiants contre toute modif
		// silencieuse (changement d'enseignant, volume, commentaire, etc.).
		if currentStatut == "PUBLIEE" {
			if input.Statut == nil || *input.Statut == "PUBLIEE" {
				return errAffectationLocked
			}
			// 3b. Transition away from PUBLIEE → on clear publishedAt +
			// publishedById (cohérence : une affectation non-PUBLIEE ne
			// doit pas avoir de publishedAt « fantôme »).
			setClauses = append(setClauses, `"publishedAt" = NULL`, `"publishedById" = NULL`)
		} else if input.Statut != nil && *input.Statut == "PUBLIEE" {
			// 3a. Transition vers PUBLIEE → on set publishedAt + publishedById.
			// publishedById = claims.UserID (le responsable qui publie).
			// NB : on réserve $argIdx pour publishedById AVANT d'append `id`
			// (qui prendra $argIdx+1).
			setClauses = append(setClauses,
				fmt.Sprintf(`"publishedAt" = CURRENT_TIMESTAMP, "publishedById" = $%d`, argIdx))
			args = append(args, claims.UserID)
			argIdx++
			transitionToPub = true
		}

		// Append final : `id` est le dernier placeholder, utilisé par
		// WHERE id = $argIdx. On l'append APRÈS publishedById pour
		// préserver la correspondance $n ↔ args[n-1].
		args = append(args, id)

		// 4. UPDATE avec SET étendu (peut contenir publishedAt/publishedById).
		if errU := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        UPDATE "Affectation" SET %s WHERE "id" = $%d
                        RETURNING "id", "enseignantId", "uniteEnseignementId",
                                  "typeSeance"::text, "groupe", "volumeHeures",
                                  "anneeUniversitaire", "statut"::text, "commentaire",
                                  "publishedAt"
                `, strings.Join(setClauses, ", "), argIdx), args...,
		).Scan(
			&row.ID, &row.EnseignantID, &row.UniteEnseignementID,
			&row.TypeSeance, &row.Groupe, &row.VolumeHeures,
			&row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
			&row.PublishedAt,
		); errU != nil {
			return errU
		}

		newStatut = row.Statut
		if row.PublishedAt != nil {
			utc := row.PublishedAt.UTC().Format(time.RFC3339)
			publishedAtRFC3339 = &utc
		}
		return nil
	})

	// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
	// Si l'UPDATE fail (not found → Scan retourne pgx.ErrNoRows, FK violation,
	// unique constraint, enum invalide), on retourne le code HTTP approprié
	// au lieu d'une response 200 avec `{affectation: {id: "", statut: ""}}`.
	if err != nil {
		if err == errAffectationLocked {
			writeJSONError(w, http.StatusConflict,
				"Cette affectation est publiée — repassez-la en PROVISOIRE ou VALIDEE pour la modifier")
			return
		}
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

	// ── SECT-AFFECTATION-PUBLISH-ENRICH-1 : post-publish side-effects ──
	// Uniquement sur transition PROVISOIRE/VALIDEE → PUBLIEE (pas sur un
	// re-publish d'une ligne déjà PUBLIEE — bloqué par le lock ci-dessus).
	// (1) AuditLog AFFECTATION_PUBLISHED (non bloquant).
	// (2) Email enseignant (non bloquant).
	if transitionToPub && newStatut == "PUBLIEE" {
		s.auditAndNotifyAffectationPublish(r.Context(), claims, id, enseignantID, ueID,
			row.TypeSeance, row.AnneeUniversitaire, row.Groupe, row.VolumeHeures,
			enseignantName, enseignantEmail, ueCode, ueNom, filiereNom, etablissementNom,
			claims.UserID)
	}

	resp := map[string]any{
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
	}
	if publishedAtRFC3339 != nil {
		resp["affectation"].(map[string]any)["publishedAt"] = *publishedAtRFC3339
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// auditAndNotifyAffectationPublish — SECT-AFFECTATION-PUBLISH-ENRICH-1
//
// Side-effects post-publish (non bloquants) :
//  1. AuditLog AFFECTATION_PUBLISHED (entite=Affectation) avec details JSON
//     {affectationId, enseignantId, ue:{id,code,nom}, typeSeance, annee,
//     publishedBy:{id,name}}.
//  2. Email enseignant « Votre affectation est publiée » via mailer.
//
// Non bloquant : si l'audit ou l'email échoue, on log (slog.Error/Warn) MAIS
// on ne fait pas échouer la mutation. La mutation est la source de vérité ;
// l'audit + email sont observabilité/notification.
//
// On n'utilise PAS le tx de l'UPDATE (déjà commit) : authRepo.CreateAuditLog
// ouvre sa propre tx, et mailer.Send est un appel HTTP/SMTP indépendant.
func (s *Server) auditAndNotifyAffectationPublish(
	ctx context.Context,
	claims appdb.SessionClaims,
	affectationID, enseignantID, ueID, typeSeance, annee string,
	groupe *string, volumeHeures float64,
	enseignantName, enseignantEmail, ueCode, ueNom, filiereNom, etablissementNom string,
	publishedByID string,
) {
	// ── (1) AuditLog AFFECTATION_PUBLISHED ──
	if s.authRepo != nil {
		details := map[string]any{
			"affectationId": affectationID,
			"enseignantId":  enseignantID,
			"enseignant":    enseignantName,
			"ue": map[string]any{
				"id":   ueID,
				"code": ueCode,
				"nom":  ueNom,
			},
			"typeSeance": typeSeance,
			"annee":      annee,
			"publishedBy": map[string]any{
				"id":   publishedByID,
				"name": claims.Name,
			},
		}
		if groupe != nil {
			details["groupe"] = *groupe
		}
		if volumeHeures > 0 {
			details["volumeHeures"] = volumeHeures
		}
		detailsJSON, err := json.Marshal(details)
		if err != nil {
			slog.Error("updateAffectation: marshal audit details failed",
				"affectationId", affectationID, "error", err)
		} else {
			uid := claims.UserID
			entry := &domain.AuditLogEntry{
				UserID:    &uid,
				Action:    domain.AuditActionAffectationPublished,
				Entite:    "Affectation",
				EntiteID:  &affectationID,
				Details:   string(detailsJSON),
				AdresseIP: "affectation-api",
				Reason:    "Publication d'affectation (visible aux étudiants)",
			}
			if claims.EtablissementID != "" {
				etab := claims.EtablissementID
				entry.EtablissementID = &etab
			}
			if errA := s.authRepo.CreateAuditLog(ctx, entry); errA != nil {
				slog.Error("updateAffectation: audit publish échec",
					"affectationId", affectationID, "error", errA)
			} else {
				slog.Info("Affectation published (audited)",
					"affectationId", affectationID,
					"enseignantId", enseignantID, "ueId", ueID,
					"publishedBy", publishedByID)
			}
		}
	} else {
		slog.Warn("updateAffectation: authRepo nil, audit publish skip",
			"affectationId", affectationID)
	}

	// ── (2) Email enseignant ──
	if s.mailer == nil {
		slog.Warn("updateAffectation: mailer nil, email publish skip",
			"affectationId", affectationID, "enseignantId", enseignantID)
		return
	}
	if enseignantEmail == "" {
		slog.Warn("updateAffectation: enseignant email vide, email skip",
			"affectationId", affectationID, "enseignantId", enseignantID)
		return
	}
	groupeStr := ""
	if groupe != nil {
		groupeStr = *groupe
	}
	tplData := emailtpl.AffectationPublishedData{
		EmailData:          emailtpl.DefaultData(enseignantName, s.appBaseURL),
		EnseignantNom:      enseignantName,
		UECode:             ueCode,
		UENom:              ueNom,
		TypeSeance:         typeSeance,
		Groupe:             groupeStr,
		VolumeHeures:       volumeHeures,
		AnneeUniversitaire: annee,
		PubliePar:          claims.Name,
		EtablissementNom:   etablissementNom,
		FiliereNom:         filiereNom,
	}
	if errM := s.mailer.Send(mailer.Email{
		To:      enseignantEmail,
		Subject: "Votre affectation est publiée",
		Body:    emailtpl.AffectationPublishedText(tplData),
		HTML:    emailtpl.AffectationPublishedHTML(tplData),
	}); errM != nil {
		slog.Error("updateAffectation: email enseignant publish échec",
			"affectationId", affectationID,
			"enseignantEmail", enseignantEmail, "error", errM)
	} else {
		slog.Info("Affectation publish email sent",
			"affectationId", affectationID,
			"enseignantEmail", enseignantEmail, "ueId", ueID)
	}

	// ── (3) Notification in-app + SSE + push (SECT-NOTIF-AFFECTATION-1) ──
	// Le dispatcher gère l'in-app (NotificationAdmin INSERT), le SSE (temps réel
	// vers le bell), et le push (si VAPID configuré). L'email est déjà envoyé
	// ci-dessus — on ne le passe pas au dispatcher pour éviter le doublon.
	if s.notifDispatcher != nil {
		s.notifDispatcher.Dispatch(ctx, notification.Event{
			UserID:      enseignantID,
			Type:        "AFFECTATION_PUBLISHED",
			Titre:       "Nouvelle affectation publiée",
			Message:     fmt.Sprintf("%s — %s (%s) pour %s", ueCode, ueNom, typeSeance, annee),
			Categorie:   "pedagogique",
			Priorite:    "info",
			ActionURL:   "/mes-enseignants",
			ActionLabel: "Voir mes affectations",
			Icone:       "Send",
		})
	}
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
	// AFFECTATIONS-FIX-A12 : récupérer les dépendances (épreuves + sessions
	// sur le même couple enseignant×UE) avant suppression pour les retourner
	// au frontend (toast informatif). Best-effort comme filieres.
	var deps map[string]any
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Récupérer enseignantId + uniteEnseignementId avant delete
		var enseignantID, ueID string
		err := tx.QueryRow(r.Context(), `
                        SELECT "enseignantId", "uniteEnseignementId"
                        FROM "Affectation" WHERE "id" = $1
                `, id).Scan(&enseignantID, &ueID)
		if err != nil {
			// not found → on skip les dependencies mais on tente quand
			// même le delete (qui retournera deleted=false → 404 via A7)
			if !strings.Contains(err.Error(), "no rows in result set") {
				return err
			}
		} else {
			// 2. Compter les épreuves de cet enseignant sur cette UE
			var nbEpreuves int
			_ = tx.QueryRow(r.Context(), `
                                SELECT count(*) FROM "Epreuve"
                                WHERE "enseignantId" = $1 AND "uniteEnseignementId" = $2
                                  AND "deletedAt" IS NULL
                        `, enseignantID, ueID).Scan(&nbEpreuves)
			// 3. Compter les sessions sur ces épreuves
			var nbSessions int
			_ = tx.QueryRow(r.Context(), `
                                SELECT count(*) FROM "SessionPassation" s
                                JOIN "Epreuve" e ON e."id" = s."epreuveId"
                                WHERE e."enseignantId" = $1 AND e."uniteEnseignementId" = $2
                        `, enseignantID, ueID).Scan(&nbSessions)
			deps = map[string]any{
				"epreuves": nbEpreuves,
				"sessions": nbSessions,
			}
		}
		// 4. Delete
		cmd, err := tx.Exec(r.Context(), `DELETE FROM "Affectation" WHERE "id" = $1`, id)
		if err != nil {
			return err
		}
		deleted = cmd.RowsAffected() > 0
		return nil
	})

	// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).
	if err != nil {
		errMsg := err.Error()
		switch {
		case strings.Contains(errMsg, "foreign key constraint"):
			writeJSONError(w, http.StatusConflict, "Affectation référencée par d'autres entités (suppression impossible)")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Erreur lors de la suppression: "+errMsg)
		}
		return
	}

	// AFFECTATIONS-FIX-A7 : si aucune ligne supprimée, retourner 404.
	if !deleted {
		writeJSONError(w, http.StatusNotFound, "Affectation introuvable (déjà supprimée ou inaccessible)")
		return
	}

	resp := map[string]any{
		"deleted": deleted,
		"id":      id,
	}
	// AFFECTATIONS-FIX-A12 : inclure les dependencies si elles ont été calculées
	if deps != nil {
		resp["dependencies"] = deps
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// getAffectationDependencies — GET /api/affectations/{id}/dependencies
//
// AFFECTATIONS-FIX-A12 : retourne les comptes d'entités liées au couple
// (enseignant, UE) de l'affectation — épreuves + sessions. Permet au
// frontend d'afficher une preview avant confirmation de suppression
// (pattern identique à /api/filieres/{id}/dependencies et
// /api/unites-enseignement/{id}/dependencies).
func (s *Server) getAffectationDependencies(w http.ResponseWriter, r *http.Request) {
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

	var enseignantID, ueID string
	var nbEpreuves, nbSessions int
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
                        SELECT "enseignantId", "uniteEnseignementId"
                        FROM "Affectation" WHERE "id" = $1
                `, id).Scan(&enseignantID, &ueID)
		if err != nil {
			return err
		}
		_ = tx.QueryRow(r.Context(), `
                        SELECT count(*) FROM "Epreuve"
                        WHERE "enseignantId" = $1 AND "uniteEnseignementId" = $2
                          AND "deletedAt" IS NULL
                `, enseignantID, ueID).Scan(&nbEpreuves)
		_ = tx.QueryRow(r.Context(), `
                        SELECT count(*) FROM "SessionPassation" s
                        JOIN "Epreuve" e ON e."id" = s."epreuveId"
                        WHERE e."enseignantId" = $1 AND e."uniteEnseignementId" = $2
                `, enseignantID, ueID).Scan(&nbSessions)
		return nil
	})
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "no rows in result set") {
			writeJSONError(w, http.StatusNotFound, "Affectation introuvable")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "erreur dependencies: "+errMsg)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"epreuves":            nbEpreuves,
		"sessions":            nbSessions,
		"canDelete":           nbEpreuves == 0, // pas de blocage, juste informatif
		"enseignantId":        enseignantID,
		"uniteEnseignementId": ueID,
	})
}

// derefStr retourne la valeur pointée ou "" si nil (helper local au package).
func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
