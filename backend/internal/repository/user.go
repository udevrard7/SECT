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
//
// DEAD CODE — not called anywhere, but fixing for consistency.
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx via
// r.pool.BeginTx SANS SetClaimsTx → claims NULL → policy User_select voyait
// NULL → 0 row (is_admin()=NULL aussi) → l'utilisateur était introuvable
// même avec un email valide. Fix : db.WithTx avec db.SystemClaims() — cette
// méthode est destinée à l'auth flow (pre-JWT, pas encore de user claims dans
// le context). SystemClaims() pose is_system()=true et is_admin()=true ce qui
// débloque User_select. Aucun caller actuel → risque minimal.
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
        var user *domain.User
        err := db.WithTx(ctx, r.pool, db.SystemClaims(), func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
                               "image", "actif", "mustChangePwd", "matricule", "niveau",
                               "derniereConnexion", "createdAt", "updatedAt"
                        FROM "User"
                        WHERE "email" = $1 AND "actif" = true
                `, email)

                u, err := scanUser(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "User", ID: email}
                        }
                        return fmt.Errorf("query user by email: %w", err)
                }
                user = u
                return nil
        })
        if err != nil {
                return nil, err
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
                // ETUDIANTS-FIX-E5 : filtre niveau (avant ignoré côté backend, le frontend
                // compensait en client-side → pagination + stats incorrectes).
                if params.Niveau != "" {
                        where = append(where, fmt.Sprintf(`u."niveau" = $%d`, argIdx))
                        args = append(args, params.Niveau)
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

// Create crée un nouvel utilisateur.
//
// BUGFIX (ETUDIANTS-CREATE-RLS) : avant cette correction, la transaction
// était ouverte via pool.BeginTx directement SANS poser les claims RLS
// (app.claims.*). La policy User_insert évalue is_responsable() qui lit
// app.claims.role → sans claims, la policy rejetait l'INSERT avec une
// erreur PostgreSQL générique → MapDomainError tombait dans le cas
// 'default' → HTTP 500 'erreur interne'.
//
// Fix : utilisation de db.WithTx qui pose automatiquement les claims RLS
// via SetClaimsTx (pattern identique à FiliereRepository.Create et
// UserRepository.List).
func (r *UserRepository) Create(ctx context.Context, input domain.CreateUserInput, passwordHash string) (*domain.User, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
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

        // ETUDIANTS-FIX-E3 : mustChangePwd paramétrable (avant hardcodé false).
        // Permet au usecase Create de forcer mustChangePwd=true quand un mot de
        // passe temporaire est généré automatiquement (mode "direct").
        mustChangePwd := false
        if input.MustChangePwd != nil {
                mustChangePwd = *input.MustChangePwd
        }

        var user *domain.User
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                                            "image", "actif", "mustChangePwd", "matricule", "niveau",
                                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING "id", "email", "name", "role", "etablissementId", "filiereId",
                                  "image", "actif", "mustChangePwd", "matricule", "niveau",
                                  "derniereConnexion", "createdAt", "updatedAt"
                `, userID, input.Email, input.Name, passwordHash, input.Role,
                        nullableStrPtr(input.EtablissementID), nullableStrPtr(input.FiliereID),
                        actif, mustChangePwd, nullableStrPtr(input.Matricule), niveau)

                created, err := scanUser(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "email ou matricule déjà utilisé"}
                        }
                        return fmt.Errorf("create user: %w", err)
                }
                user = created
                return nil
        })
        if err != nil {
                return nil, err
        }
        return user, nil
}

// Update met à jour un utilisateur (partial update). passwordHash non-nil si password changé.
//
// BUGFIX (ETUDIANTS-CREATE-RLS) : même fix que Create — utilisation de db.WithTx
// pour poser les claims RLS (User_update exige is_responsable()/is_admin()).
func (r *UserRepository) Update(ctx context.Context, id string, input domain.UpdateUserInput, passwordHash *string) (*domain.User, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var user *domain.User
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
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
                        currentUser, err := scanUser(row)
                        if err != nil {
                                if err == pgx.ErrNoRows {
                                        return &domain.NotFoundError{Entity: "User", ID: id}
                                }
                                return err
                        }
                        user = currentUser
                        return nil
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
                updatedUser, err := scanUser(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "User", ID: id}
                        }
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "email ou matricule déjà utilisé"}
                        }
                        return fmt.Errorf("update user: %w", err)
                }
                user = updatedUser
                return nil
        })
        if err != nil {
                return nil, err
        }
        return user, nil
}

// Delete supprime un utilisateur (hard delete avec cascade manuel).
//
// BUGFIX (ETUDIANTS-CREATE-RLS) : même fix que Create — utilisation de db.WithTx
// pour poser les claims RLS (User_delete exige is_responsable()/is_admin()).
// Les DELETE en cascade sur les tables enfants nécessitent aussi les claims
// car leurs policies USING sont évaluées pour chaque ligne.
func (r *UserRepository) Delete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var exists bool
                err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "User" WHERE "id" = $1)`, id).Scan(&exists)
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
                        ct, err := tx.Exec(ctx, step.sql, id)
                        if err != nil {
                                return fmt.Errorf("%s: %w", step.desc, err)
                        }
                        // RESPONSABLE-DELETE-BUG : si l'étape finale "delete user" affecte
                        // 0 lignes, c'est qu'une policy RLS a silencieusement bloqué la
                        // suppression (ex: policy TO neondb_owner mais rôle courant = sect_app).
                        // Sans ce check, le handler retourne 200 "utilisateur supprimé" mais
                        // l'utilisateur reste en DB → faux succès + confusion utilisateur.
                        if step.desc == "delete user" && ct.RowsAffected() == 0 {
                                return fmt.Errorf("suppression refusée par RLS (0 ligne affectée) — vérifiez les policies User_delete pour le rôle courant")
                        }
                }
                return nil
        })
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

// CountDependencies compte les sessions, réponses, soumissions (dép étudiant)
// + épreuves, devoirs, affectations, enseignantFilieres (dép enseignant) d'un
// user avant suppression (ETUDIANTS-FIX-E4 + ENSEIGNANTS-FIX-EN3).
// Best-effort : utilise des claims system-worker pour compter même si le user
// n'est pas dans le même établissement que le caller (le checkOwnership a déjà
// validé l'accès côté usecase). Les tables enseignant peuvent ne pas exister
// ou avoir un schéma différent — best-effort (0 si erreur).
//
// BUGFIX (AUDIT-RLS-REPOS-001) : l'ancien commentaire prétendait "désactive RLS"
// mais le code ouvrait une tx SANS SetClaimsTx → claims NULL → policies
// RLS (SessionPassation_select, Epreuve_select, etc.) bloquaient tous les
// counts à 0 → le usecase pensait "aucune dépendance" → suppression du user
// avec sessions/épreuves actives (PERTE DE DONNÉES).
// Fix : poser des claims system-worker via db.SetClaimsTx (is_system()=true
// débloque les policies *_all_system qui couvrent SessionPassation, Epreuve,
// Question, Document).
func (r *UserRepository) CountDependencies(ctx context.Context, userID string) (sessions, reponses, soumissions, epreuves, devoirs, affectations, enseignantFilieres int, err error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, 0, 0, 0, 0, 0, 0, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AUDIT-RLS-REPOS-001 : poser les claims system-worker pour bypass RLS.
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return 0, 0, 0, 0, 0, 0, 0, fmt.Errorf("set system claims: %w", err)
        }

        // Sessions (SessionPassation où etudiantId = userID) — dép étudiant
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "SessionPassation" WHERE "etudiantId" = $1`, userID).Scan(&sessions); err != nil {
                return 0, 0, 0, 0, 0, 0, 0, fmt.Errorf("count sessions: %w", err)
        }
        // ETUDIANTS-FIX-E10 : Réponses — la table Reponse n'a pas de colonne
        // etudiantId directement, elle référence sessionId (qui elle a etudiantId).
        // Jointure via SessionPassation.
        if err := tx.QueryRow(ctx, `
                SELECT count(*) FROM "Reponse" r
                JOIN "SessionPassation" s ON s."id" = r."sessionId"
                WHERE s."etudiantId" = $1
        `, userID).Scan(&reponses); err != nil {
                reponses = 0
        }
        // Soumissions (Soumission où etudiantId = userID) — dép étudiant
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "Soumission" WHERE "etudiantId" = $1`, userID).Scan(&soumissions); err != nil {
                soumissions = 0
        }
        // ENSEIGNANTS-FIX-EN3 : Déps enseignant
        // Épreuves (Epreuve où enseignantId = userID, non supprimées)
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "Epreuve" WHERE "enseignantId" = $1 AND "deletedAt" IS NULL`, userID).Scan(&epreuves); err != nil {
                epreuves = 0
        }
        // Devoirs (Devoir où enseignantId = userID)
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "Devoir" WHERE "enseignantId" = $1`, userID).Scan(&devoirs); err != nil {
                devoirs = 0
        }
        // Affectations (Affectation où enseignantId = userID — enseignant↔UE)
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "Affectation" WHERE "enseignantId" = $1`, userID).Scan(&affectations); err != nil {
                affectations = 0
        }
        // EnseignantFilieres (EnseignantFiliere où enseignantId = userID — enseignant↔filière+niveau)
        if err := tx.QueryRow(ctx, `SELECT count(*) FROM "EnseignantFiliere" WHERE "enseignantId" = $1`, userID).Scan(&enseignantFilieres); err != nil {
                enseignantFilieres = 0
        }

        if err := tx.Commit(ctx); err != nil {
                return 0, 0, 0, 0, 0, 0, 0, fmt.Errorf("commit: %w", err)
        }
        return sessions, reponses, soumissions, epreuves, devoirs, affectations, enseignantFilieres, nil
}
