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

// FindByID récupère une filière par ID avec relations (RLS actif).
//
// BUGFIX (FILIERES-CRITICAL-FIX-1) : JOIN Etablissement + LEFT JOIN User
// (responsable) + subquery _count.etudiants + 2e requête pour peupler le
// tableau Etudiants (pour le detail dialog frontend). Avant ce fix, le repo
// faisait un simple SELECT sans JOIN → etablissement/responsable/_count
// toujours null/undefined → page /filieres affichait « — » et 0 étudiant.
func (r *FiliereRepository) FindByID(ctx context.Context, id string) (*domain.Filiere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var filiere *domain.Filiere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `
                        SELECT f."id", f."nom", f."code", f."etablissementId", f."responsableId",
                               f."description", f."nbEtudiants", f."actif", f."createdAt", f."updatedAt",
                               e."id" AS etab_id, e."nom" AS etab_nom,
                               u."id" AS resp_id, u."name" AS resp_name, u."email" AS resp_email,
                               (SELECT count(*) FROM "User" stu WHERE stu."filiereId" = f."id" AND stu."role" = 'ETUDIANT' AND stu."actif" = true) AS count_etu
                        FROM "Filiere" f
                        LEFT JOIN "Etablissement" e ON e."id" = f."etablissementId"
                        LEFT JOIN "User" u ON u."id" = f."responsableId"
                        WHERE f."id" = $1`
                row := tx.QueryRow(ctx, query, id)
                f := &domain.Filiere{}
                var (
                        etabID, etabNom           *string
                        respID, respName, respEmail *string
                        countEtu                  int
                )
                if err := row.Scan(
                        &f.ID, &f.Nom, &f.Code, &f.EtablissementID, &f.ResponsableID,
                        &f.Description, &f.NbEtudiants, &f.Actif, &f.CreatedAt, &f.UpdatedAt,
                        &etabID, &etabNom,
                        &respID, &respName, &respEmail,
                        &countEtu,
                ); err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Filiere", ID: id}
                        }
                        return fmt.Errorf("query filiere: %w", err)
                }
                if etabID != nil && etabNom != nil {
                        f.Etablissement = &domain.EtablissementRef{ID: *etabID, Nom: *etabNom}
                }
                if respID != nil && respName != nil {
                        f.Responsable = &domain.UserRef{ID: *respID, Name: *respName}
                        if respEmail != nil {
                                f.Responsable.Email = *respEmail
                        }
                }
                f.Count = &domain.FiliereCount{Etudiants: countEtu}
                // 2e requête : étudiants inscrits (pour le detail dialog frontend).
                rows, err := tx.Query(ctx, `SELECT "id", "name", "email", "actif", "createdAt" FROM "User" WHERE "filiereId" = $1 AND "role" = 'ETUDIANT' ORDER BY "name" ASC LIMIT 100`, id)
                if err != nil {
                        return fmt.Errorf("query etudiants: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        var etu domain.FiliereEtudiant
                        if err := rows.Scan(&etu.ID, &etu.Name, &etu.Email, &etu.Actif, &etu.CreatedAt); err != nil {
                                return fmt.Errorf("scan etudiant: %w", err)
                        }
                        f.Etudiants = append(f.Etudiants, etu)
                }
                if f.Etudiants == nil {
                        f.Etudiants = []domain.FiliereEtudiant{}
                }
                filiere = f
                return nil
        })
        if err != nil {
                return nil, err
        }
        return filiere, nil
}

// List liste les filières avec relations (RLS filtre par établissement).
//
// BUGFIX (FILIERES-CRITICAL-FIX-1) : JOIN Etablissement + LEFT JOIN User
// (responsable) + subquery _count.etudiants. Avant ce fix, le repo faisait
// un simple SELECT sans JOIN → etablissement/responsable/_count toujours
// null/undefined → page /filieres affichait « — » et 0 étudiant partout.
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
                        // Colonnes qualifiées avec f. (BUGFIX FILIERES-CRITICAL-FIX-1 :
                        // JOIN User rend "nom"/"code" ambigus sinon).
                        where = append(where, fmt.Sprintf(`(f."nom" ILIKE $%d OR f."code" ILIKE $%d)`, argIdx, argIdx+1))
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        argIdx += 2
                }
                if params.ResponsableID != "" {
                        where = append(where, fmt.Sprintf(`f."responsableId" = $%d`, argIdx))
                        args = append(args, params.ResponsableID)
                        argIdx++
                }
                if params.Actif != nil {
                        where = append(where, fmt.Sprintf(`f."actif" = $%d`, argIdx))
                        args = append(args, *params.Actif)
                        argIdx++
                }
                if params.EtablissementID != "" {
                        where = append(where, fmt.Sprintf(`f."etablissementId" = $%d`, argIdx))
                        args = append(args, params.EtablissementID)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`
                        SELECT f."id", f."nom", f."code", f."etablissementId", f."responsableId",
                               f."description", f."nbEtudiants", f."actif", f."createdAt", f."updatedAt",
                               e."id" AS etab_id, e."nom" AS etab_nom,
                               u."id" AS resp_id, u."name" AS resp_name, u."email" AS resp_email,
                               (SELECT count(*) FROM "User" stu WHERE stu."filiereId" = f."id" AND stu."role" = 'ETUDIANT' AND stu."actif" = true) AS count_etu
                        FROM "Filiere" f
                        LEFT JOIN "Etablissement" e ON e."id" = f."etablissementId"
                        LEFT JOIN "User" u ON u."id" = f."responsableId"
                        %s
                        ORDER BY f."createdAt" DESC`, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query filieres: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        f := &domain.Filiere{}
                        var (
                                etabID, etabNom           *string
                                respID, respName, respEmail *string
                                countEtu                  int
                        )
                        if err := rows.Scan(
                                &f.ID, &f.Nom, &f.Code, &f.EtablissementID, &f.ResponsableID,
                                &f.Description, &f.NbEtudiants, &f.Actif, &f.CreatedAt, &f.UpdatedAt,
                                &etabID, &etabNom,
                                &respID, &respName, &respEmail,
                                &countEtu,
                        ); err != nil {
                                return fmt.Errorf("scan filiere: %w", err)
                        }
                        if etabID != nil && etabNom != nil {
                                f.Etablissement = &domain.EtablissementRef{ID: *etabID, Nom: *etabNom}
                        }
                        if respID != nil && respName != nil {
                                f.Responsable = &domain.UserRef{ID: *respID, Name: *respName}
                                if respEmail != nil {
                                        f.Responsable.Email = *respEmail
                                }
                        }
                        f.Count = &domain.FiliereCount{Etudiants: countEtu}
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
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        id := uuid.NewString()
        actif := true
        if input.Actif != nil {
                actif = *input.Actif
        }

        var f *domain.Filiere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        INSERT INTO "Filiere" ("id", "nom", "code", "etablissementId", "responsableId",
                                "description", "nbEtudiants", "actif", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING `+columnsFiliere,
                        id, input.Nom, nullableStrPtr(input.Code), input.EtablissementID,
                        nullableStrPtr(input.ResponsableID), nullableStrPtr(input.Description),
                        nullableIntPtr(input.NbEtudiants), actif)

                created, err := scanFiliere(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "une filière avec ce nom existe déjà dans cet établissement"}
                        }
                        return fmt.Errorf("create filiere: %w", err)
                }
                f = created
                return nil
        })
        if err != nil {
                return nil, err
        }
        return f, nil
}

// Update met à jour une filière (partial update).
func (r *FiliereRepository) Update(ctx context.Context, id string, input domain.UpdateFiliereInput) (*domain.Filiere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var f *domain.Filiere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
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
                        updated, err := scanFiliere(row)
                        if err != nil {
                                if err == pgx.ErrNoRows {
                                        return &domain.NotFoundError{Entity: "Filiere", ID: id}
                                }
                                return err
                        }
                        f = updated
                        return nil
                }

                setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
                args = append(args, id)

                updateSQL := fmt.Sprintf(`UPDATE "Filiere" SET %s WHERE "id" = $%d RETURNING %s`,
                        strings.Join(setClauses, ", "), argIdx, columnsFiliere)

                row := tx.QueryRow(ctx, updateSQL, args...)
                updated, err := scanFiliere(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Filiere", ID: id}
                        }
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "une filière avec ce nom existe déjà dans cet établissement"}
                        }
                        return fmt.Errorf("update filiere: %w", err)
                }
                f = updated
                return nil
        })
        if err != nil {
                return nil, err
        }
        return f, nil
}

// SoftDelete désactive une filière (actif=false).
func (r *FiliereRepository) SoftDelete(ctx context.Context, id string) (*domain.Filiere, error) {
        return r.Update(ctx, id, domain.UpdateFiliereInput{Actif: boolPtr(false)})
}

// HardDelete supprime définitivement une filière de la DB (hard delete).
// À n'appeler QUE si GetDependencies a confirmé canDelete=true (pas d'étudiants
// actifs, pas d'UEs actives). Les épreuves associées ne sont pas supprimées ici
// car elles sont soft-deleted (deletedAt) et laissent des orphelins — acceptable
// pour un hard-delete de filière (les épreuves ne sont plus accessibles).
//
// Retourne nil si la filière n'existe pas ( RowsAffected == 0 → NotFoundError).
func (r *FiliereRepository) HardDelete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // D'abord soft-delete les épreuves associées (pour ne pas casser les FK
                // si Epreuve.filiereId a ON DELETE RESTRICT). Les épreuves sont déjà
                // soft-deleted en pratique (canDelete ne les compte pas), mais on
                // sécurise au cas où.
                _, _ = tx.Exec(ctx, `UPDATE "Epreuve" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "filiereId" = $1 AND "deletedAt" IS NULL`, id)

                // Hard-delete la filière
                tag, err := tx.Exec(ctx, `DELETE FROM "Filiere" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("hard delete filiere: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "Filiere", ID: id}
                }
                return nil
        })
}

// BulkUpdate met à jour le statut actif de plusieurs filières.
// etablissementID non-vide → filtre supplémentaire (pour RESPONSABLE).
func (r *FiliereRepository) BulkUpdate(ctx context.Context, ids []string, actif bool, etablissementID string) (int, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

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

// GetFiliereDependencies récupère les dépendances actives d'une filière
// (pour l'endpoint GET /api/filieres/{id}/dependencies).
//
// BUGFIX (FILIERES-CRITICAL-FIX-1) : exposait jusqu'ici CountDependencies
// (interne, jamais appelé) — le frontend n'avait aucun moyen de preview les
// dépendances avant soft-delete. Maintenant le usecase/handler l'exposent via
// l'endpoint dédié, avec un flag CanDelete pour bloquer la confirmation côté UI.
func (r *FiliereRepository) GetFiliereDependencies(ctx context.Context, id string) (*domain.FiliereDependencies, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        deps := &domain.FiliereDependencies{}
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `SELECT
                        (SELECT count(*) FROM "User" WHERE "filiereId" = $1 AND "role" = 'ETUDIANT' AND "actif" = true),
                        (SELECT count(*) FROM "UniteEnseignement" WHERE "filiereId" = $1 AND "actif" = true),
                        (SELECT count(*) FROM "Epreuve" WHERE "filiereId" = $1 AND "deletedAt" IS NULL)`
                if err := tx.QueryRow(ctx, query, id).Scan(&deps.EtudiantsCount, &deps.UEsCount, &deps.EpreuvesCount); err != nil {
                        return fmt.Errorf("query filiere dependencies: %w", err)
                }
                deps.CanDelete = deps.EtudiantsCount == 0 && deps.UEsCount == 0
                return nil
        })
        if err != nil {
                return nil, err
        }
        return deps, nil
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
