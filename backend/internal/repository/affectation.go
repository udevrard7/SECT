// Package repository — implémentation AffectationRepository.
package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// AffectationRepository implémente domain.AffectationRepository.
type AffectationRepository struct {
	pool *pgxpool.Pool
}

// NewAffectationRepository crée un nouveau AffectationRepository.
func NewAffectationRepository(pool *pgxpool.Pool) *AffectationRepository {
	return &AffectationRepository{pool: pool}
}

const columnsAffectation = `a."id", a."enseignantId", a."uniteEnseignementId", a."typeSeance"::text,
	a."groupe", a."volumeHeures", a."anneeUniversitaire", a."statut"::text, a."commentaire",
	a."createdAt", a."updatedAt"`

// AffectationListParams contient les paramètres de filtrage.
type AffectationListParams struct {
	EnseignantID        string
	UniteEnseignementID string
	EtablissementID     string
	FiliereID           string
	Niveau              string
	Statut              string
	AnneeUniversitaire  string
}

// List liste les affectations (RLS actif).
func (r *AffectationRepository) List(ctx context.Context, params AffectationListParams) ([]*domain.Affectation, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.Affectation
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		if params.EnseignantID != "" {
			where = append(where, fmt.Sprintf(`a."enseignantId" = $%d`, argIdx))
			args = append(args, params.EnseignantID)
			argIdx++
		}
		if params.UniteEnseignementID != "" {
			where = append(where, fmt.Sprintf(`a."uniteEnseignementId" = $%d`, argIdx))
			args = append(args, params.UniteEnseignementID)
			argIdx++
		}
		if params.Statut != "" {
			where = append(where, fmt.Sprintf(`a."statut"::text = $%d`, argIdx))
			args = append(args, params.Statut)
			argIdx++
		}
		if params.AnneeUniversitaire != "" {
			where = append(where, fmt.Sprintf(`a."anneeUniversitaire" = $%d`, argIdx))
			args = append(args, params.AnneeUniversitaire)
			argIdx++
		}
		// Filtres via JOIN sur UE/Filiere
		if params.EtablissementID != "" {
			where = append(where, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM "UniteEnseignement" ue2
				JOIN "Filiere" f2 ON f2."id" = ue2."filiereId"
				WHERE ue2."id" = a."uniteEnseignementId" AND f2."etablissementId" = $%d)`, argIdx))
			args = append(args, params.EtablissementID)
			argIdx++
		}
		if params.FiliereID != "" {
			where = append(where, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM "UniteEnseignement" ue3 WHERE ue3."id" = a."uniteEnseignementId" AND ue3."filiereId" = $%d)`, argIdx))
			args = append(args, params.FiliereID)
			argIdx++
		}
		if params.Niveau != "" {
			where = append(where, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM "UniteEnseignement" ue4 WHERE ue4."id" = a."uniteEnseignementId" AND ue4."niveau" = $%d)`, argIdx))
			args = append(args, params.Niveau)
			argIdx++
		}

		whereClause := ""
		if len(where) > 0 {
			whereClause = "WHERE " + strings.Join(where, " AND ")
		}

		query := fmt.Sprintf(`
			SELECT %s, u."id", u."name", u."email", ue."id", ue."code", ue."nom", ue."niveau"
			FROM "Affectation" a
			LEFT JOIN "User" u ON u."id" = a."enseignantId"
			LEFT JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
			%s
			ORDER BY a."createdAt" DESC
		`, columnsAffectation, whereClause)
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query affectations: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			a := &domain.Affectation{}
			var ensID, ensName, ensEmail *string
			var ueID, ueCode, ueNom, ueNiveau *string
			err := rows.Scan(
				&a.ID, &a.EnseignantID, &a.UniteEnseignementID, &a.TypeSeance,
				&a.Groupe, &a.VolumeHeures, &a.AnneeUniversitaire, &a.Statut, &a.Commentaire,
				&a.CreatedAt, &a.UpdatedAt,
				&ensID, &ensName, &ensEmail,
				&ueID, &ueCode, &ueNom, &ueNiveau,
			)
			if err != nil {
				return fmt.Errorf("scan affectation: %w", err)
			}
			if ensID != nil && ensName != nil {
				a.Enseignant = &domain.UserRef{ID: *ensID, Name: *ensName, Email: derefStr(ensEmail)}
			}
			if ueID != nil && ueNom != nil {
				a.UniteEnseignement = &domain.UERef{
					ID:     *ueID,
					Code:   derefStr(ueCode),
					Nom:    *ueNom,
					Niveau: derefStr(ueNiveau),
				}
			}
			result = append(result, a)
		}
		if result == nil {
			result = []*domain.Affectation{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une affectation (bypass RLS).
func (r *AffectationRepository) Create(ctx context.Context, input domain.CreateAffectationInput) (*domain.Affectation, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	a := &domain.Affectation{}
	err = tx.QueryRow(ctx, `
		INSERT INTO "Affectation" ("id", "enseignantId", "uniteEnseignementId", "typeSeance",
			"groupe", "volumeHeures", "anneeUniversitaire", "statut", "commentaire", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING `+columnsAffectation,
		id, input.EnseignantID, input.UniteEnseignementID, input.TypeSeance,
		nullableStrPtr(input.Groupe), input.VolumeHeures, input.AnneeUniversitaire,
		input.Statut, nullableStrPtr(input.Commentaire),
	).Scan(
		&a.ID, &a.EnseignantID, &a.UniteEnseignementID, &a.TypeSeance,
		&a.Groupe, &a.VolumeHeures, &a.AnneeUniversitaire, &a.Statut, &a.Commentaire,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert affectation: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return a, nil
}

// Update met à jour une affectation (bypass RLS).
func (r *AffectationRepository) Update(ctx context.Context, id string, input domain.UpdateAffectationInput) (*domain.Affectation, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
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
		args = append(args, nullableStrPtr(input.Groupe))
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
		args = append(args, nullableStrPtr(input.Commentaire))
		argIdx++
	}
	if len(setClauses) == 0 {
		return nil, fmt.Errorf("no fields to update")
	}
	setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
	args = append(args, id)

	a := &domain.Affectation{}
	err = tx.QueryRow(ctx, fmt.Sprintf(`
		UPDATE "Affectation" SET %s WHERE "id" = $%d
		RETURNING `+columnsAffectation,
		strings.Join(setClauses, ", "), argIdx), args...,
	).Scan(
		&a.ID, &a.EnseignantID, &a.UniteEnseignementID, &a.TypeSeance,
		&a.Groupe, &a.VolumeHeures, &a.AnneeUniversitaire, &a.Statut, &a.Commentaire,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "Affectation", ID: id}
		}
		return nil, fmt.Errorf("update affectation: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return a, nil
}

// Delete supprime une affectation (bypass RLS).
func (r *AffectationRepository) Delete(ctx context.Context, id string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	cmd, err := tx.Exec(ctx, `DELETE FROM "Affectation" WHERE "id" = $1`, id)
	if err != nil {
		return fmt.Errorf("delete affectation: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "Affectation", ID: id}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// nullableStrPtr est défini dans user.go (même package).
