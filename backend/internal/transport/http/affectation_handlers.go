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
			ID     string `json:"id"`
			Code   string `json:"code"`
			Nom    string `json:"nom"`
			Niveau string `json:"niveau"`
		} `json:"uniteEnseignement,omitempty"`
	}

	result := []affRow{}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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
			where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "UniteEnseignement" ue3 WHERE ue3."id" = a."uniteEnseignementId" AND ue3."filiereId" = $%d)`, argIdx))
			args = append(args, filiereID)
			argIdx++
		}
		if niveau != "" {
			where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "UniteEnseignement" ue4 WHERE ue4."id" = a."uniteEnseignementId" AND ue4."niveau" = $%d)`, argIdx))
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
			       ue."id", ue."code", ue."nom", ue."niveau"
			FROM "Affectation" a
			LEFT JOIN "User" u ON u."id" = a."enseignantId"
			LEFT JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
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
			var ueID2, ueCode, ueNom, ueNiveau *string
			var createdAt, updatedAt time.Time
			if err := rows.Scan(
				&row.ID, &row.EnseignantID, &row.UniteEnseignementID, &row.TypeSeance,
				&row.Groupe, &row.VolumeHeures, &row.AnneeUniversitaire, &row.Statut, &row.Commentaire,
				&createdAt, &updatedAt,
				&ensID, &ensName, &ensEmail,
				&ueID2, &ueCode, &ueNom, &ueNiveau,
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
				row.UniteEnseignement = &struct {
					ID     string `json:"id"`
					Code   string `json:"code"`
					Nom    string `json:"nom"`
					Niveau string `json:"niveau"`
				}{ID: *ueID2, Code: derefStr(ueCode), Nom: *ueNom, Niveau: derefStr(ueNiveau)}
			}
			result = append(result, row)
		}
		return rows.Err()
	})

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
	if input.TypeSeance == "" {
		input.TypeSeance = "CM"
	}
	if input.Statut == "" {
		input.Statut = "PROVISOIRE"
	}
	if input.AnneeUniversitaire == "" {
		input.AnneeUniversitaire = "2024-2025"
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

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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

	var row struct {
		ID                  string
		Statut              string
	}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), fmt.Sprintf(`
			UPDATE "Affectation" SET %s WHERE "id" = $%d
			RETURNING "id", "statut"::text
		`, strings.Join(setClauses, ", "), argIdx), args...,
		).Scan(&row.ID, &row.Statut)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"affectation": map[string]any{
			"id":     row.ID,
			"statut": row.Statut,
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
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		cmd, err := tx.Exec(r.Context(), `DELETE FROM "Affectation" WHERE "id" = $1`, id)
		if err != nil {
			return err
		}
		deleted = cmd.RowsAffected() > 0
		return nil
	})

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
