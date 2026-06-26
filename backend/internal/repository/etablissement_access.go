// Package repository — implémentation EtablissementAccessRepository.
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

// EtablissementAccessRepository implémente domain.EtablissementAccessRepository.
type EtablissementAccessRepository struct {
	pool *pgxpool.Pool
}

// NewEtablissementAccessRepository crée un nouveau repository.
func NewEtablissementAccessRepository(pool *pgxpool.Pool) *EtablissementAccessRepository {
	return &EtablissementAccessRepository{pool: pool}
}

const columnsAccess = `"id", "adminId", "etablissementId", "motif", "statut",
        "dateDebut", "dateFin", "approuvePar", "commentaire", "createdAt", "updatedAt"`

func scanAccess(s scanner) (*domain.EtablissementAccess, error) {
	a := &domain.EtablissementAccess{}
	err := s.Scan(
		&a.ID, &a.AdminID, &a.EtablissementID, &a.Motif, &a.Statut,
		&a.DateDebut, &a.DateFin, &a.ApprouvePar, &a.Commentaire,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// FindByID récupère une demande d'accès par ID (RLS actif).
func (r *EtablissementAccessRepository) FindByID(ctx context.Context, id string) (*domain.EtablissementAccess, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var access *domain.EtablissementAccess
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "EtablissementAccess" WHERE "id" = $1`, columnsAccess), id)
		a, err := scanAccess(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "EtablissementAccess", ID: id}
			}
			return fmt.Errorf("query access: %w", err)
		}
		access = a
		return nil
	})
	if err != nil {
		return nil, err
	}
	return access, nil
}

// List liste les demandes d'accès (RLS actif).
func (r *EtablissementAccessRepository) List(ctx context.Context, params domain.AccessListParams) ([]*domain.EtablissementAccess, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.EtablissementAccess
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		if params.AdminID != "" {
			where = append(where, fmt.Sprintf(`"adminId" = $%d`, argIdx))
			args = append(args, params.AdminID)
			argIdx++
		}
		if params.Statut != "" {
			where = append(where, fmt.Sprintf(`"statut" = $%d`, argIdx))
			args = append(args, params.Statut)
			argIdx++
		}
		if params.EtablissementID != "" {
			where = append(where, fmt.Sprintf(`"etablissementId" = $%d`, argIdx))
			args = append(args, params.EtablissementID)
			argIdx++
		}

		whereClause := ""
		if len(where) > 0 {
			whereClause = "WHERE " + strings.Join(where, " AND ")
		}

		query := fmt.Sprintf(`SELECT %s FROM "EtablissementAccess" %s ORDER BY "createdAt" DESC`, columnsAccess, whereClause)
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query access list: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			a, err := scanAccess(rows)
			if err != nil {
				return fmt.Errorf("scan access: %w", err)
			}
			result = append(result, a)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une demande d'accès (bypass RLS — peut être créé par ADMIN ou RESPONSABLE).
func (r *EtablissementAccessRepository) Create(ctx context.Context, input domain.CreateAccessInput) (*domain.EtablissementAccess, error) {
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
                INSERT INTO "EtablissementAccess" ("id", "adminId", "etablissementId", "motif", "statut",
                        "dateDebut", "dateFin", "approuvePar", "commentaire", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, 'EN_ATTENTE', $5, $6, NULL, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING `+columnsAccess,
		id, input.AdminID, input.EtablissementID, input.Motif,
		nullableTimePtr(input.DateDebut), nullableTimePtr(input.DateFin),
		nullableStrPtr(input.Commentaire))

	access, err := scanAccess(row)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, &domain.ConflictError{Message: "demande d'accès déjà existante pour cet admin et cet établissement"}
		}
		return nil, fmt.Errorf("create access: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return access, nil
}

// Update met à jour une demande d'accès (approuver/refuser/révoquer).
func (r *EtablissementAccessRepository) Update(ctx context.Context, id string, input domain.UpdateAccessInput) (*domain.EtablissementAccess, error) {
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

	addSet("statut", string(input.Statut))
	if input.ApprouvePar != nil {
		addSet("approuvePar", *input.ApprouvePar)
	}
	if input.Commentaire != nil {
		addSet("commentaire", *input.Commentaire)
	}
	if input.DateDebut != nil {
		addSet("dateDebut", nullableTimePtr(input.DateDebut))
	}
	if input.DateFin != nil {
		addSet("dateFin", nullableTimePtr(input.DateFin))
	}
	setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)

	args = append(args, id)
	updateSQL := fmt.Sprintf(`UPDATE "EtablissementAccess" SET %s WHERE "id" = $%d RETURNING %s`,
		strings.Join(setClauses, ", "), argIdx, columnsAccess)

	row := tx.QueryRow(ctx, updateSQL, args...)
	access, err := scanAccess(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "EtablissementAccess", ID: id}
		}
		return nil, fmt.Errorf("update access: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return access, nil
}

// CheckAccess vérifie si un admin a un accès APPROUVE valide.
// Bypass RLS (vérification système).
func (r *EtablissementAccessRepository) CheckAccess(ctx context.Context, adminID, etablissementID string) (*domain.EtablissementAccess, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	row := tx.QueryRow(ctx, `
                SELECT `+columnsAccess+` FROM "EtablissementAccess"
                WHERE "adminId" = $1 AND "etablissementId" = $2 AND "statut" = 'APPROUVE'
                  AND ("dateDebut" IS NULL OR "dateDebut" <= CURRENT_TIMESTAMP)
                  AND ("dateFin" IS NULL OR "dateFin" >= CURRENT_TIMESTAMP)
                ORDER BY "createdAt" DESC LIMIT 1
        `, adminID, etablissementID)

	access, err := scanAccess(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // pas d'accès — retourne nil sans erreur
		}
		return nil, fmt.Errorf("check access: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return access, nil
}

// ListAuthorizedEtablissements retourne les établissements autorisés pour un admin.
func (r *EtablissementAccessRepository) ListAuthorizedEtablissements(ctx context.Context, adminID string) ([]*domain.Etablissement, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	// Join EtablissementAccess (APPROUVE, dates valides) + Etablissement
	// Colonnes préfixées avec e. pour éviter l'ambiguïté
	const colsE = `e."id", e."nom", e."type", e."ville", e."pays", e."adresse", e."telephone", e."email",
                e."siteWeb", e."logo", e."actif", e."exempleMatricule", e."formatMatricule", e."regexMatricule",
                e."certWatermarkText", e."certWatermarkEnabled", e."certWatermarkOpacity", e."certWatermarkColor",
                e."certWatermarkPattern", e."createdAt", e."updatedAt"`

	rows, err := tx.Query(ctx, fmt.Sprintf(`
                SELECT %s
                FROM "EtablissementAccess" a
                JOIN "Etablissement" e ON e."id" = a."etablissementId"
                WHERE a."adminId" = $1 AND a."statut" = 'APPROUVE'
                  AND (a."dateDebut" IS NULL OR a."dateDebut" <= CURRENT_TIMESTAMP)
                  AND (a."dateFin" IS NULL OR a."dateFin" >= CURRENT_TIMESTAMP)
                ORDER BY e."nom"
        `, colsE), adminID)
	if err != nil {
		return nil, fmt.Errorf("query authorized etablissements: %w", err)
	}
	defer rows.Close()

	var result []*domain.Etablissement
	for rows.Next() {
		e, err := scanEtablissement(rows)
		if err != nil {
			return nil, fmt.Errorf("scan etablissement: %w", err)
		}
		result = append(result, e)
	}
	// Retourner un slice vide plutôt que nil pour la sérialisation JSON
	if result == nil {
		result = []*domain.Etablissement{}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// nullableTimePtr convertit un *time.Time en any pour pgx.
func nullableTimePtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return *t
}
