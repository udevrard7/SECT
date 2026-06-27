// Package repository — implémentation FiliereRepository.
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

// FiliereRepository implémente domain.FiliereRepository.
type FiliereRepository struct {
        pool *pgxpool.Pool
}

// NewFiliereRepository crée un nouveau FiliereRepository.
func NewFiliereRepository(pool *pgxpool.Pool) *FiliereRepository {
        return &FiliereRepository{pool: pool}
}

const columnsFiliere = `"id", "nom", "code", "etablissementId", "responsableId",
        "description", "nbEtudiants", "actif", "createdAt", "updatedAt"`

func scanFiliere(s scanner) (*domain.Filiere, error) {
        f := &domain.Filiere{}
        err := s.Scan(
                &f.ID, &f.Nom, &f.Code, &f.EtablissementID, &f.ResponsableID,
                &f.Description, &f.NbEtudiants, &f.Actif, &f.CreatedAt, &f.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return f, nil
}

// FindByID récupère une filière par ID (RLS actif).
func (r *FiliereRepository) FindByID(ctx context.Context, id string) (*domain.Filiere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var filiere *domain.Filiere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Filiere" WHERE "id" = $1`, columnsFiliere), id)
                f, err := scanFiliere(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Filiere", ID: id}
                        }
                        return fmt.Errorf("query filiere: %w", err)
                }
                filiere = f
                return nil
        })
        if err != nil {
                return nil, err
        }
        return filiere, nil
}

// List liste les filières (RLS filtre par établissement).
func (r *FiliereRepository) List(ctx context.Context, params domain.FiliereListParams) ([]*domain.Filiere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Filiere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.Search != "" {
                        // BUGFIX (SESSIONS-SEARCH-1) : Simple Protocol ne supporte pas
                        // les placeholders réutilisés. 2 placeholders distincts + 2 args.
                        where = append(where, fmt.Sprintf(`("nom" ILIKE $%d OR "code" ILIKE $%d)`, argIdx, argIdx+1))
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        argIdx += 2
                }
                if params.ResponsableID != "" {
                        where = append(where, fmt.Sprintf(`"responsableId" = $%d`, argIdx))
                        args = append(args, params.ResponsableID)
                        argIdx++
                }
                if params.Actif != nil {
                        where = append(where, fmt.Sprintf(`"actif" = $%d`, argIdx))
                        args = append(args, *params.Actif)
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

                query := fmt.Sprintf(`SELECT %s FROM "Filiere" %s ORDER BY "createdAt" DESC`, columnsFiliere, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query filieres: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        f, err := scanFiliere(rows)
                        if err != nil {
                                return fmt.Errorf("scan filiere: %w", err)
                        }
                        result = append(result, f)
                }
                if result == nil {
                        result = []*domain.Filiere{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée une filière (bypass RLS — appelé par ADMIN/RESPONSABLE).
func (r *FiliereRepository) Create(ctx context.Context, input domain.CreateFiliereInput) (*domain.Filiere, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        id := uuid.NewString()
        actif := true
        if input.Actif != nil {
                actif = *input.Actif
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "Filiere" ("id", "nom", "code", "etablissementId", "responsableId",
                        "description", "nbEtudiants", "actif", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING `+columnsFiliere,
                id, input.Nom, nullableStrPtr(input.Code), input.EtablissementID,
                nullableStrPtr(input.ResponsableID), nullableStrPtr(input.Description),
                nullableIntPtr(input.NbEtudiants), actif)

        f, err := scanFiliere(row)
        if err != nil {
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "une filière avec ce nom existe déjà dans cet établissement"}
                }
                return nil, fmt.Errorf("create filiere: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return f, nil
}

// Update met à jour une filière (partial update).
func (r *FiliereRepository) Update(ctx context.Context, id string, input domain.UpdateFiliereInput) (*domain.Filiere, error) {
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

        if input.Nom != nil {
                addSet("nom", *input.Nom)
        }
        if input.Code != nil {
                addSet("code", nullableStrPtr(input.Code))
        }
        if input.ResponsableID != nil {
                addSet("responsableId", nullableStrPtr(input.ResponsableID))
        }
        if input.Description != nil {
                addSet("description", nullableStrPtr(input.Description))
        }
        if input.NbEtudiants != nil {
                addSet("nbEtudiants", nullableIntPtr(input.NbEtudiants))
        }
        if input.Actif != nil {
                addSet("actif", *input.Actif)
        }

        if len(setClauses) == 0 {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Filiere" WHERE "id" = $1`, columnsFiliere), id)
                f, err := scanFiliere(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil, &domain.NotFoundError{Entity: "Filiere", ID: id}
                        }
                        return nil, err
                }
                if err := tx.Commit(ctx); err != nil {
                        return nil, err
                }
                return f, nil
        }

        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
        args = append(args, id)

        updateSQL := fmt.Sprintf(`UPDATE "Filiere" SET %s WHERE "id" = $%d RETURNING %s`,
                strings.Join(setClauses, ", "), argIdx, columnsFiliere)

        row := tx.QueryRow(ctx, updateSQL, args...)
        f, err := scanFiliere(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "Filiere", ID: id}
                }
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "une filière avec ce nom existe déjà dans cet établissement"}
                }
                return nil, fmt.Errorf("update filiere: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return f, nil
}

// SoftDelete désactive une filière (actif=false).
func (r *FiliereRepository) SoftDelete(ctx context.Context, id string) (*domain.Filiere, error) {
        return r.Update(ctx, id, domain.UpdateFiliereInput{Actif: boolPtr(false)})
}

// BulkUpdate met à jour le statut actif de plusieurs filières.
// etablissementID non-vide → filtre supplémentaire (pour RESPONSABLE).
func (r *FiliereRepository) BulkUpdate(ctx context.Context, ids []string, actif bool, etablissementID string) (int, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return 0, fmt.Errorf("disable rls: %w", err)
        }

        // Construire la requête avec IN clause
        args := []any{actif}
        argIdx := 2
        placeholders := make([]string, len(ids))
        for i, id := range ids {
                placeholders[i] = fmt.Sprintf("$%d", argIdx)
                args = append(args, id)
                argIdx++
        }

        whereExtra := ""
        if etablissementID != "" {
                whereExtra = fmt.Sprintf(` AND "etablissementId" = $%d`, argIdx)
                args = append(args, etablissementID)
        }

        query := fmt.Sprintf(`UPDATE "Filiere" SET "actif" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" IN (%s)%s`,
                strings.Join(placeholders, ","), whereExtra)

        tag, err := tx.Exec(ctx, query, args...)
        if err != nil {
                return 0, fmt.Errorf("bulk update filieres: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return 0, fmt.Errorf("commit: %w", err)
        }
        return int(tag.RowsAffected()), nil
}

// CountDependencies compte les dépendances d'une filière (pour info avant soft-delete).
func (r *FiliereRepository) CountDependencies(ctx context.Context, id string) (epreuves, etudiants, ues int, err error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return 0, 0, 0, fmt.Errorf("no RLS claims in context")
        }

        err = db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Epreuves
                if err := tx.QueryRow(ctx, `SELECT count(*) FROM "Epreuve" WHERE "filiereId" = $1`, id).Scan(&epreuves); err != nil {
                        return fmt.Errorf("count epreuves: %w", err)
                }
                // Etudiants
                if err := tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "filiereId" = $1`, id).Scan(&etudiants); err != nil {
                        return fmt.Errorf("count etudiants: %w", err)
                }
                // UEs
                if err := tx.QueryRow(ctx, `SELECT count(*) FROM "UniteEnseignement" WHERE "filiereId" = $1 AND "actif" = true`, id).Scan(&ues); err != nil {
                        return fmt.Errorf("count ues: %w", err)
                }
                return nil
        })
        return
}

// --- Helpers ---

func nullableIntPtr(i *int) any {
        if i == nil {
                return nil
        }
        return *i
}

func boolPtr(b bool) *bool {
        return &b
}
