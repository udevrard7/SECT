// Package repository — implémentation UserRepository avec pgx + RLS.
package repository

import (
        "context"
        "fmt"
        "strings"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgconn"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// UserRepository implémente domain.UserRepository avec pgx.
type UserRepository struct {
        pool *pgxpool.Pool
}

// NewUserRepository crée un nouveau UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
        return &UserRepository{pool: pool}
}

// FindByID récupère un utilisateur par son ID (RLS actif — claims requises).
func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var user *domain.User
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        SELECT u."id", u."email", u."name", u."role", u."etablissementId", u."filiereId",
                               u."image", u."actif", u."mustChangePwd", u."matricule", u."niveau",
                               u."derniereConnexion", u."createdAt", u."updatedAt"
                        FROM "User" u
                        WHERE u."id" = $1
                `, id)

                u, err := scanUser(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "User", ID: id}
                        }
                        return fmt.Errorf("query user: %w", err)
                }
                user = u
                return nil
        })

        if err != nil {
                return nil, err
        }
        return user, nil
}

// FindByEmail récupère un utilisateur par son email (bypass RLS pour l'auth).
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        row := tx.QueryRow(ctx, `
                SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
                       "image", "actif", "mustChangePwd", "matricule", "niveau",
                       "derniereConnexion", "createdAt", "updatedAt"
                FROM "User"
                WHERE "email" = $1 AND "actif" = true
        `, email)

        user, err := scanUser(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "User", ID: email}
                }
                return nil, fmt.Errorf("query user by email: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return user, nil
}

// List liste les utilisateurs selon les params (RLS filtre par établissement).
func (r *UserRepository) List(ctx context.Context, params domain.UserListParams) (*domain.UserListResult, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        if params.Page < 1 {
                params.Page = 1
        }
        if params.Limit < 1 || params.Limit > 100 {
                params.Limit = 20
        }

        result := &domain.UserListResult{Page: params.Page, Limit: params.Limit}

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.Search != "" {
                        // BUGFIX (SESSIONS-SEARCH-1) : Simple Protocol ne supporte pas
                        // les placeholders réutilisés. 2 placeholders distincts + 2 args.
                        where = append(where, fmt.Sprintf(`(u."name" ILIKE $%d OR u."email" ILIKE $%d)`, argIdx, argIdx+1))
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        argIdx += 2
                }
                if params.Role != "" {
                        where = append(where, fmt.Sprintf(`u."role" = $%d`, argIdx))
                        args = append(args, params.Role)
                        argIdx++
                }
                if params.Actif != nil {
                        where = append(where, fmt.Sprintf(`u."actif" = $%d`, argIdx))
                        args = append(args, *params.Actif)
                        argIdx++
                }
                if params.EtablissementID != "" {
                        where = append(where, fmt.Sprintf(`u."etablissementId" = $%d`, argIdx))
                        args = append(args, params.EtablissementID)
                        argIdx++
                }
                if params.FiliereID != "" {
                        where = append(where, fmt.Sprintf(`u."filiereId" = $%d`, argIdx))
                        args = append(args, params.FiliereID)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                // Count total
                countSQL := fmt.Sprintf(`SELECT count(*) FROM "User" u %s`, whereClause)
                err := tx.QueryRow(ctx, countSQL, args...).Scan(&result.Total)
                if err != nil {
                        return fmt.Errorf("count users: %w", err)
                }

                // Fetch page
                // BUGFIX (ADMIN-AUDIT-3) : LEFT JOIN Etablissement pour peupler la
                // relation `etablissement` (EtablissementRef{ID, Nom}) attendue par le
                // frontend (ex: page /utilisateurs affiche user.etablissement.nom).
                // BUGFIX (FILIERE-FIX-1) : LEFT JOIN Filiere pour peupler la relation
                // `filiere` (FiliereRef{ID, Nom, Code}) attendue par le frontend
                // (page /etudiants affiche etudiant.filiere.nom). Avant, l'API ne
                // renvoyait que `filiereId` → la filière n'était jamais affichée.
                offset := (params.Page - 1) * params.Limit
                listSQL := fmt.Sprintf(`
                        SELECT u."id", u."email", u."name", u."role", u."etablissementId", u."filiereId",
                               u."image", u."actif", u."mustChangePwd", u."matricule", u."niveau",
                               u."derniereConnexion", u."createdAt", u."updatedAt",
                               e."id", e."nom",
                               f."id", f."nom", f."code"
                        FROM "User" u
                        LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        %s
                        ORDER BY u."name"
                        LIMIT $%d OFFSET $%d
                `, whereClause, argIdx, argIdx+1)
                args = append(args, params.Limit, offset)

                rows, err := tx.Query(ctx, listSQL, args...)
                if err != nil {
                        return fmt.Errorf("query users: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        user := &domain.User{}
                        var etabID, etabNom *string
                        var filID, filNom, filCode *string
                        err := rows.Scan(
                                &user.ID, &user.Email, &user.Name, &user.Role,
                                &user.EtablissementID, &user.FiliereID, &user.Image,
                                &user.Actif, &user.MustChangePwd, &user.Matricule, &user.Niveau,
                                &user.DerniereConnexion, &user.CreatedAt, &user.UpdatedAt,
                                &etabID, &etabNom,
                                &filID, &filNom, &filCode,
                        )
                        if err != nil {
                                return fmt.Errorf("scan user: %w", err)
                        }
                        if etabID != nil && etabNom != nil {
                                user.Etablissement = &domain.EtablissementRef{
                                        ID:  *etabID,
                                        Nom: *etabNom,
                                }
                        }
                        if filID != nil && filNom != nil {
                                user.Filiere = &domain.FiliereRef{
                                        ID:   *filID,
                                        Nom:  *filNom,
                                        Code: derefStr(filCode),
                                }
                        }
                        result.Users = append(result.Users, user)
                }
                return nil
        })

        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée un nouvel utilisateur (bypass RLS — appelé par ADMIN/RESPONSABLE).
func (r *UserRepository) Create(ctx context.Context, input domain.CreateUserInput, passwordHash string) (*domain.User, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        userID := uuid.NewString()

        actif := true
        if input.Actif != nil {
                actif = *input.Actif
        }

        var niveau any
        if input.Niveau != nil {
                niveau = *input.Niveau
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                                    "image", "actif", "mustChangePwd", "matricule", "niveau",
                                    "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, false, $9, $10, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING "id", "email", "name", "role", "etablissementId", "filiereId",
                          "image", "actif", "mustChangePwd", "matricule", "niveau",
                          "derniereConnexion", "createdAt", "updatedAt"
        `, userID, input.Email, input.Name, passwordHash, input.Role,
                nullableStrPtr(input.EtablissementID), nullableStrPtr(input.FiliereID),
                actif, nullableStrPtr(input.Matricule), niveau)

        user, err := scanUser(row)
        if err != nil {
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "email ou matricule déjà utilisé"}
                }
                return nil, fmt.Errorf("create user: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return user, nil
}

// Update met à jour un utilisateur (partial update). passwordHash non-nil si password changé.
func (r *UserRepository) Update(ctx context.Context, id string, input domain.UpdateUserInput, passwordHash *string) (*domain.User, error) {
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

        if input.Name != nil {
                addSet("name", *input.Name)
        }
        if input.Email != nil {
                addSet("email", *input.Email)
        }
        if input.Role != nil {
                addSet("role", *input.Role)
        }
        if input.EtablissementID != nil {
                addSet("etablissementId", nullableStrPtr(input.EtablissementID))
        }
        if input.FiliereID != nil {
                addSet("filiereId", nullableStrPtr(input.FiliereID))
        }
        if input.Actif != nil {
                addSet("actif", *input.Actif)
        }
        if input.Matricule != nil {
                addSet("matricule", nullableStrPtr(input.Matricule))
        }
        if input.Niveau != nil {
                addSet("niveau", nullableStrPtr(input.Niveau))
        }
        if passwordHash != nil {
                addSet("password", *passwordHash)
                addSet("mustChangePwd", false)
        }

        if len(setClauses) == 0 {
                // Rien à updater — retourner l'utilisateur courant
                row := tx.QueryRow(ctx, `
                        SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
                               "image", "actif", "mustChangePwd", "matricule", "niveau",
                               "derniereConnexion", "createdAt", "updatedAt"
                        FROM "User" WHERE "id" = $1
                `, id)
                user, err := scanUser(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil, &domain.NotFoundError{Entity: "User", ID: id}
                        }
                        return nil, err
                }
                if err := tx.Commit(ctx); err != nil {
                        return nil, fmt.Errorf("commit: %w", err)
                }
                return user, nil
        }

        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)

        args = append(args, id)
        updateSQL := fmt.Sprintf(`
                UPDATE "User" SET %s WHERE "id" = $%d
                RETURNING "id", "email", "name", "role", "etablissementId", "filiereId",
                          "image", "actif", "mustChangePwd", "matricule", "niveau",
                          "derniereConnexion", "createdAt", "updatedAt"
        `, strings.Join(setClauses, ", "), argIdx)

        row := tx.QueryRow(ctx, updateSQL, args...)
        user, err := scanUser(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "User", ID: id}
                }
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "email ou matricule déjà utilisé"}
                }
                return nil, fmt.Errorf("update user: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return user, nil
}

// Delete supprime un utilisateur (hard delete avec cascade manuel).
func (r *UserRepository) Delete(ctx context.Context, id string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        var exists bool
        err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "User" WHERE "id" = $1)`, id).Scan(&exists)
        if err != nil {
                return fmt.Errorf("check user exists: %w", err)
        }
        if !exists {
                return &domain.NotFoundError{Entity: "User", ID: id}
        }

        // Cascade manuel (FK RESTRICT)
        steps := []struct {
                desc string
                sql  string
        }{
                {"delete etudiant resultats", `DELETE FROM "Resultat" WHERE "sessionId" IN (SELECT "id" FROM "SessionPassation" WHERE "etudiantId" = $1)`},
                {"delete etudiant sessions", `DELETE FROM "SessionPassation" WHERE "etudiantId" = $1`},
                {"delete teacher resultats", `DELETE FROM "Resultat" WHERE "sessionId" IN (SELECT sp."id" FROM "SessionPassation" sp JOIN "Epreuve" e ON e."id" = sp."epreuveId" WHERE e."enseignantId" = $1)`},
                {"delete teacher sessions", `DELETE FROM "SessionPassation" WHERE "epreuveId" IN (SELECT "id" FROM "Epreuve" WHERE "enseignantId" = $1)`},
                {"delete epreuves", `DELETE FROM "Epreuve" WHERE "enseignantId" = $1`},
                {"delete soumissions", `DELETE FROM "Soumission" WHERE "etudiantId" = $1`},
                {"delete devoirs", `DELETE FROM "Devoir" WHERE "enseignantId" = $1`},
                {"delete invitations", `DELETE FROM "Invitation" WHERE "createdById" = $1`},
                {"null alertes", `UPDATE "Alerte" SET "userId" = NULL WHERE "userId" = $1`},
                {"null filiere responsable", `UPDATE "Filiere" SET "responsableId" = NULL WHERE "responsableId" = $1`},
                {"delete user", `DELETE FROM "User" WHERE "id" = $1`},
        }

        for _, step := range steps {
                if _, err := tx.Exec(ctx, step.sql, id); err != nil {
                        return fmt.Errorf("%s: %w", step.desc, err)
                }
        }

        return tx.Commit(ctx)
}

// CountByEtablissement compte les utilisateurs d'un établissement.
func (r *UserRepository) CountByEtablissement(ctx context.Context, etablissementID string) (int, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return 0, fmt.Errorf("no RLS claims in context")
        }

        var count int
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "etablissementId" = $1`, etablissementID).Scan(&count)
        })
        return count, err
}

// --- Helpers ---

func scanUser(s scanner) (*domain.User, error) {
        u := &domain.User{}
        err := s.Scan(
                &u.ID, &u.Email, &u.Name, &u.Role,
                &u.EtablissementID, &u.FiliereID, &u.Image,
                &u.Actif, &u.MustChangePwd, &u.Matricule, &u.Niveau,
                &u.DerniereConnexion, &u.CreatedAt, &u.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return u, nil
}

func nullableStrPtr(s *string) any {
        if s == nil {
                return nil
        }
        return *s
}

func isUniqueViolation(err error) bool {
        if err == nil {
                return false
        }
        if pgErr, ok := err.(*pgconn.PgError); ok {
                // 23505 = unique_violation
                return pgErr.Code == "23505"
        }
        return strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "duplicate key")
}
