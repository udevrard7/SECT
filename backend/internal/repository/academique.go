// Package repository — implémentation UERepository, EnseignantFiliereRepository, AnneeAcademiqueRepository.
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// UNITE ENSEIGNEMENT
// ============================================================

// UERepository implémente domain.UERepository.
type UERepository struct {
	pool *pgxpool.Pool
}

// NewUERepository crée un nouveau UERepository.
func NewUERepository(pool *pgxpool.Pool) *UERepository {
	return &UERepository{pool: pool}
}

const columnsUE = `"id", "code", "nom", "description", "filiereId", "niveau", "niveaux",
	"semestre", "creditsECTS", "volumeHeuresCM", "volumeHeuresTD", "volumeHeuresTP",
	"obligatoire", "actif", "createdAt", "updatedAt"`

func scanUE(s scanner) (*domain.UniteEnseignement, error) {
	u := &domain.UniteEnseignement{}
	err := s.Scan(
		&u.ID, &u.Code, &u.Nom, &u.Description, &u.FiliereID, &u.Niveau, &u.Niveaux,
		&u.Semestre, &u.CreditsECTS, &u.VolumeHeuresCM, &u.VolumeHeuresTD, &u.VolumeHeuresTP,
		&u.Obligatoire, &u.Actif, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// FindByID récupère une UE par ID (RLS actif).
func (r *UERepository) FindByID(ctx context.Context, id string) (*domain.UniteEnseignement, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var ue *domain.UniteEnseignement
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "UniteEnseignement" WHERE "id" = $1`, columnsUE), id)
		u, err := scanUE(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
			}
			return fmt.Errorf("query ue: %w", err)
		}
		ue = u
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ue, nil
}

// List liste les UEs (RLS actif).
func (r *UERepository) List(ctx context.Context, params domain.UEListParams) ([]*domain.UniteEnseignement, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.UniteEnseignement
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		// filiereId : UE owned by this filière OR shared with it
		if params.FiliereID != "" {
			where = append(where, fmt.Sprintf(`("filiereId" = $%d OR EXISTS (
				SELECT 1 FROM "UniteEnseignementFiliere" uef WHERE uef."uniteEnseignementId" = "UniteEnseignement"."id" AND uef."filiereId" = $%d))`, argIdx, argIdx))
			args = append(args, params.FiliereID)
			argIdx++
		}
		if params.Niveau != "" {
			where = append(where, fmt.Sprintf(`("niveau" = $%d OR "niveaux" LIKE $%d)`, argIdx, argIdx+1))
			args = append(args, params.Niveau, "%\""+params.Niveau+"\"%")
			argIdx += 2
		}
		if params.Semestre != nil {
			where = append(where, fmt.Sprintf(`"semestre" = $%d`, argIdx))
			args = append(args, *params.Semestre)
			argIdx++
		}
		if params.Actif != nil {
			where = append(where, fmt.Sprintf(`"actif" = $%d`, argIdx))
			args = append(args, *params.Actif)
			argIdx++
		}
		if params.Search != "" {
			where = append(where, fmt.Sprintf(`("nom" ILIKE $%d OR "code" ILIKE $%d)`, argIdx, argIdx))
			args = append(args, "%"+params.Search+"%")
			argIdx++
		}

		whereClause := ""
		if len(where) > 0 {
			whereClause = "WHERE " + strings.Join(where, " AND ")
		}

		query := fmt.Sprintf(`SELECT %s FROM "UniteEnseignement" %s ORDER BY "createdAt" DESC`, columnsUE, whereClause)
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query ues: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			u, err := scanUE(rows)
			if err != nil {
				return fmt.Errorf("scan ue: %w", err)
			}
			result = append(result, u)
		}
		if result == nil {
			result = []*domain.UniteEnseignement{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une UE (bypass RLS).
func (r *UERepository) Create(ctx context.Context, input domain.CreateUEInput) (*domain.UniteEnseignement, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	cm, td, tp := 0, 0, 0
	if input.VolumeHeuresCM != nil {
		cm = *input.VolumeHeuresCM
	}
	if input.VolumeHeuresTD != nil {
		td = *input.VolumeHeuresTD
	}
	if input.VolumeHeuresTP != nil {
		tp = *input.VolumeHeuresTP
	}
	obligatoire := true
	if input.Obligatoire != nil {
		obligatoire = *input.Obligatoire
	}
	actif := true
	if input.Actif != nil {
		actif = *input.Actif
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO "UniteEnseignement" ("id", "code", "nom", "description", "filiereId", "niveau", "niveaux",
			"semestre", "creditsECTS", "volumeHeuresCM", "volumeHeuresTD", "volumeHeuresTP",
			"obligatoire", "actif", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING `+columnsUE,
		id, input.Code, input.Nom, nullableStrPtr(input.Description), input.FiliereID, input.Niveau,
		nullableStrPtr(input.Niveaux), nullableIntPtr(input.Semestre), nullableIntPtr(input.CreditsECTS),
		cm, td, tp, obligatoire, actif)

	ue, err := scanUE(row)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, &domain.ConflictError{Message: "une UE avec ce code existe déjà dans cette filière"}
		}
		return nil, fmt.Errorf("create ue: %w", err)
	}

	// Créer les liaisons supplémentaires (UniteEnseignementFiliere)
	if len(input.FiliereIDsSuppl) > 0 {
		for _, filiereID := range input.FiliereIDsSuppl {
			if filiereID == input.FiliereID {
				continue // exclure la filière owner
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO "UniteEnseignementFiliere" ("id", "uniteEnseignementId", "filiereId", "createdAt")
				VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
				ON CONFLICT DO NOTHING
			`, uuid.NewString(), id, filiereID)
			if err != nil {
				return nil, fmt.Errorf("create ue filiere suppl: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return ue, nil
}

// Update met à jour une UE (partial update).
func (r *UERepository) Update(ctx context.Context, id string, input domain.UpdateUEInput) (*domain.UniteEnseignement, error) {
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

	addSet := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Code != nil {
		addSet("code", *input.Code)
	}
	if input.Nom != nil {
		addSet("nom", *input.Nom)
	}
	if input.Description != nil {
		addSet("description", nullableStrPtr(input.Description))
	}
	if input.FiliereID != nil {
		addSet("filiereId", *input.FiliereID)
	}
	if input.Niveau != nil {
		addSet("niveau", *input.Niveau)
	}
	if input.Niveaux != nil {
		addSet("niveaux", nullableStrPtr(input.Niveaux))
	}
	if input.Semestre != nil {
		addSet("semestre", nullableIntPtr(input.Semestre))
	}
	if input.CreditsECTS != nil {
		addSet("creditsECTS", nullableIntPtr(input.CreditsECTS))
	}
	if input.VolumeHeuresCM != nil {
		addSet("volumeHeuresCM", *input.VolumeHeuresCM)
	}
	if input.VolumeHeuresTD != nil {
		addSet("volumeHeuresTD", *input.VolumeHeuresTD)
	}
	if input.VolumeHeuresTP != nil {
		addSet("volumeHeuresTP", *input.VolumeHeuresTP)
	}
	if input.Obligatoire != nil {
		addSet("obligatoire", *input.Obligatoire)
	}
	if input.Actif != nil {
		addSet("actif", *input.Actif)
	}

	if len(setClauses) > 0 {
		setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
		args = append(args, id)
		updateSQL := fmt.Sprintf(`UPDATE "UniteEnseignement" SET %s WHERE "id" = $%d RETURNING %s`,
			strings.Join(setClauses, ", "), argIdx, columnsUE)
		row := tx.QueryRow(ctx, updateSQL, args...)
		ue, err := scanUE(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return nil, &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
			}
			if isUniqueViolation(err) {
				return nil, &domain.ConflictError{Message: "une UE avec ce code existe déjà dans cette filière"}
			}
			return nil, fmt.Errorf("update ue: %w", err)
		}
		// Gérer filiereIdsSuppl (full replace)
		if input.FiliereIDsSuppl != nil {
			// Delete all existing
			if _, err := tx.Exec(ctx, `DELETE FROM "UniteEnseignementFiliere" WHERE "uniteEnseignementId" = $1`, id); err != nil {
				return nil, fmt.Errorf("delete ue filieres suppl: %w", err)
			}
			// Insert new
			ownerFiliereID := ue.FiliereID
			for _, fid := range input.FiliereIDsSuppl {
				if fid == ownerFiliereID {
					continue
				}
				_, err := tx.Exec(ctx, `INSERT INTO "UniteEnseignementFiliere" ("id", "uniteEnseignementId", "filiereId", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`, uuid.NewString(), id, fid)
				if err != nil {
					return nil, fmt.Errorf("insert ue filiere suppl: %w", err)
				}
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit: %w", err)
		}
		return ue, nil
	}

	// No fields to update — return existing
	row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "UniteEnseignement" WHERE "id" = $1`, columnsUE), id)
	ue, err := scanUE(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
		}
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return ue, nil
}

// SoftDelete désactive une UE (actif=false).
func (r *UERepository) SoftDelete(ctx context.Context, id string) (*domain.UniteEnseignement, error) {
	return r.Update(ctx, id, domain.UpdateUEInput{Actif: boolPtr(false)})
}

// ============================================================
// ENSEIGNANT FILIERE
// ============================================================

// EnseignantFiliereRepository implémente domain.EnseignantFiliereRepository.
type EnseignantFiliereRepository struct {
	pool *pgxpool.Pool
}

// NewEnseignantFiliereRepository crée un nouveau repository.
func NewEnseignantFiliereRepository(pool *pgxpool.Pool) *EnseignantFiliereRepository {
	return &EnseignantFiliereRepository{pool: pool}
}

const columnsEF = `"id", "enseignantId", "filiereId", "niveau", "createdAt", "updatedAt"`

func scanEnseignantFiliere(s scanner) (*domain.EnseignantFiliere, error) {
	e := &domain.EnseignantFiliere{}
	err := s.Scan(&e.ID, &e.EnseignantID, &e.FiliereID, &e.Niveau, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return e, nil
}

// List liste les assignations (RLS actif).
func (r *EnseignantFiliereRepository) List(ctx context.Context, params domain.EnseignantFiliereListParams) ([]*domain.EnseignantFiliere, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.EnseignantFiliere
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		if params.EnseignantID != "" {
			where = append(where, fmt.Sprintf(`"enseignantId" = $%d`, argIdx))
			args = append(args, params.EnseignantID)
			argIdx++
		}
		if params.FiliereID != "" {
			where = append(where, fmt.Sprintf(`"filiereId" = $%d`, argIdx))
			args = append(args, params.FiliereID)
			argIdx++
		}

		whereClause := ""
		if len(where) > 0 {
			whereClause = "WHERE " + strings.Join(where, " AND ")
		}

		query := fmt.Sprintf(`SELECT %s FROM "EnseignantFiliere" %s ORDER BY "createdAt" DESC`, columnsEF, whereClause)
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query enseignant-filieres: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			e, err := scanEnseignantFiliere(rows)
			if err != nil {
				return fmt.Errorf("scan ef: %w", err)
			}
			result = append(result, e)
		}
		if result == nil {
			result = []*domain.EnseignantFiliere{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une assignation (bypass RLS).
func (r *EnseignantFiliereRepository) Create(ctx context.Context, input domain.CreateAssignmentInput) (*domain.EnseignantFiliere, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "EnseignantFiliere" ("id", "enseignantId", "filiereId", "niveau", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING `+columnsEF,
		id, input.EnseignantID, input.FiliereID, input.Niveau)

	ef, err := scanEnseignantFiliere(row)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, &domain.ConflictError{Message: "cette assignation existe déjà"}
		}
		return nil, fmt.Errorf("create ef: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return ef, nil
}

// DeleteByID supprime une assignation par ID.
func (r *EnseignantFiliereRepository) DeleteByID(ctx context.Context, id string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM "EnseignantFiliere" WHERE "id" = $1`, id)
	if err != nil {
		return fmt.Errorf("delete ef: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "EnseignantFiliere", ID: id}
	}

	return tx.Commit(ctx)
}

// DeleteByComposite supprime par (enseignantId, filiereId, niveau).
func (r *EnseignantFiliereRepository) DeleteByComposite(ctx context.Context, enseignantID, filiereID, niveau string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM "EnseignantFiliere" WHERE "enseignantId" = $1 AND "filiereId" = $2 AND "niveau" = $3`,
		enseignantID, filiereID, niveau)
	if err != nil {
		return fmt.Errorf("delete ef composite: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "EnseignantFiliere", ID: enseignantID + "/" + filiereID + "/" + niveau}
	}

	return tx.Commit(ctx)
}

// ============================================================
// ANNEE ACADEMIQUE
// ============================================================

// AnneeAcademiqueRepository implémente domain.AnneeAcademiqueRepository.
type AnneeAcademiqueRepository struct {
	pool *pgxpool.Pool
}

// NewAnneeAcademiqueRepository crée un nouveau repository.
func NewAnneeAcademiqueRepository(pool *pgxpool.Pool) *AnneeAcademiqueRepository {
	return &AnneeAcademiqueRepository{pool: pool}
}

const columnsAnnee = `"id", "libelle", "dateDebut", "dateFin", "etablissementId", "actif", "createdAt", "updatedAt"`

func scanAnnee(s scanner) (*domain.AnneeAcademique, error) {
	a := &domain.AnneeAcademique{}
	err := s.Scan(&a.ID, &a.Libelle, &a.DateDebut, &a.DateFin, &a.EtablissementID, &a.Actif, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// List liste les années académiques d'un établissement (RLS actif).
func (r *AnneeAcademiqueRepository) List(ctx context.Context, etablissementID string, actif *bool) ([]*domain.AnneeAcademique, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.AnneeAcademique
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		where = append(where, fmt.Sprintf(`"etablissementId" = $%d`, argIdx))
		args = append(args, etablissementID)
		argIdx++

		if actif != nil && *actif {
			where = append(where, fmt.Sprintf(`"actif" = $%d`, argIdx))
			args = append(args, true)
			argIdx++
		}

		query := fmt.Sprintf(`SELECT %s FROM "AnneeAcademique" WHERE %s ORDER BY "dateDebut" DESC`,
			columnsAnnee, strings.Join(where, " AND "))
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query annees: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			a, err := scanAnnee(rows)
			if err != nil {
				return fmt.Errorf("scan annee: %w", err)
			}
			result = append(result, a)
		}
		if result == nil {
			result = []*domain.AnneeAcademique{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une année académique (bypass RLS).
func (r *AnneeAcademiqueRepository) Create(ctx context.Context, input domain.CreateAnneeInput) (*domain.AnneeAcademique, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	// Parser les dates ISO
	dateDebut, err := time.Parse(time.RFC3339, input.DateDebut)
	if err != nil {
		return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
	}
	dateFin, err := time.Parse(time.RFC3339, input.DateFin)
	if err != nil {
		return nil, &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
	}

	id := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "AnneeAcademique" ("id", "libelle", "dateDebut", "dateFin", "etablissementId", "actif", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING `+columnsAnnee,
		id, input.Libelle, dateDebut, dateFin, input.EtablissementID)

	a, err := scanAnnee(row)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, &domain.ConflictError{Message: "cette année académique existe déjà pour cet établissement"}
		}
		return nil, fmt.Errorf("create annee: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return a, nil
}
