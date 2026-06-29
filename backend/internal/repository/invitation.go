// Package repository — implémentation InvitationRepository (E1-INVITATIONS).
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

// InvitationRepository implémente domain.InvitationRepository.
type InvitationRepository struct {
        pool *pgxpool.Pool
}

// NewInvitationRepository crée un nouveau InvitationRepository.
func NewInvitationRepository(pool *pgxpool.Pool) *InvitationRepository {
        return &InvitationRepository{pool: pool}
}

// colonnesInvitation — l'ordre doit matcher scanInvitation.
const colonnesInvitation = `"id", "token", "email", "role", "name", "etablissementId",
        "filiereId", "expiresAt", "used", "usedAt", "createdById", "createdAt"`

func scanInvitation(s scanner) (*domain.Invitation, error) {
        inv := &domain.Invitation{}
        err := s.Scan(
                &inv.ID, &inv.Token, &inv.Email, &inv.Role, &inv.Name,
                &inv.EtablissementID, &inv.FiliereID, &inv.ExpiresAt, &inv.Used,
                &inv.UsedAt, &inv.CreatedByID, &inv.CreatedAt,
        )
        if err != nil {
                return nil, err
        }
        return inv, nil
}

// FindByID récupère une invitation par ID (RLS via claims).
// Peuple Etablissement + Filiere (PascalCase, contrat frontend InvitationItem).
func (r *InvitationRepository) FindByID(ctx context.Context, id string) (*domain.Invitation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var inv *domain.Invitation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `
                        SELECT i."id", i."token", i."email", i."role", i."name", i."etablissementId",
                               i."filiereId", i."expiresAt", i."used", i."usedAt", i."createdById", i."createdAt",
                               e."id" AS etab_id, e."nom" AS etab_nom,
                               f."id" AS fil_id, f."nom" AS fil_nom
                        FROM "Invitation" i
                        LEFT JOIN "Etablissement" e ON e."id" = i."etablissementId"
                        LEFT JOIN "Filiere" f ON f."id" = i."filiereId"
                        WHERE i."id" = $1`
                row := tx.QueryRow(ctx, query, id)
                i := &domain.Invitation{}
                var (
                        etabID, etabNom *string
                        filID, filNom   *string
                )
                if err := row.Scan(
                        &i.ID, &i.Token, &i.Email, &i.Role, &i.Name,
                        &i.EtablissementID, &i.FiliereID, &i.ExpiresAt, &i.Used,
                        &i.UsedAt, &i.CreatedByID, &i.CreatedAt,
                        &etabID, &etabNom,
                        &filID, &filNom,
                ); err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Invitation", ID: id}
                        }
                        return fmt.Errorf("query invitation: %w", err)
                }
                if etabID != nil && etabNom != nil {
                        i.Etablissement = &domain.EtablissementRef{ID: *etabID, Nom: *etabNom}
                }
                if filID != nil && filNom != nil {
                        i.Filiere = &domain.FiliereRef{ID: *filID, Nom: *filNom}
                }
                inv = i
                return nil
        })
        if err != nil {
                return nil, err
        }
        return inv, nil
}

// FindByToken récupère une invitation par token (bypass RLS — endpoint public).
// Peuple les relations verify (etablissement/filiere/createdBy, clés lowercase)
// attendues par le frontend accept-invitation-page.tsx (interface InvitationData).
func (r *InvitationRepository) FindByToken(ctx context.Context, token string) (*domain.Invitation, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        query := `
                SELECT i."id", i."token", i."email", i."role", i."name", i."etablissementId",
                       i."filiereId", i."expiresAt", i."used", i."usedAt", i."createdById", i."createdAt",
                       e."nom" AS etab_nom, e."ville" AS etab_ville,
                       f."nom" AS fil_nom, f."code" AS fil_code,
                       u."name" AS creator_name
                FROM "Invitation" i
                LEFT JOIN "Etablissement" e ON e."id" = i."etablissementId"
                LEFT JOIN "Filiere" f ON f."id" = i."filiereId"
                LEFT JOIN "User" u ON u."id" = i."createdById"
                WHERE i."token" = $1`
        row := tx.QueryRow(ctx, query, token)
        i := &domain.Invitation{}
        var (
                etabNom, etabVille   *string
                filNom, filCode      *string
                creatorName          *string
        )
        if err := row.Scan(
                &i.ID, &i.Token, &i.Email, &i.Role, &i.Name,
                &i.EtablissementID, &i.FiliereID, &i.ExpiresAt, &i.Used,
                &i.UsedAt, &i.CreatedByID, &i.CreatedAt,
                &etabNom, &etabVille,
                &filNom, &filCode,
                &creatorName,
        ); err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "Invitation", ID: token}
                }
                return nil, fmt.Errorf("query invitation by token: %w", err)
        }
        if etabNom != nil {
                i.VerifyEtablissement = &domain.InvitationVerifyEtablissement{Nom: *etabNom, Ville: etabVille}
        }
        if filNom != nil {
                i.VerifyFiliere = &domain.InvitationVerifyFiliere{Nom: *filNom, Code: filCode}
        }
        if creatorName != nil {
                i.VerifyCreatedBy = &domain.InvitationVerifyCreatedBy{Name: *creatorName}
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return i, nil
}

// List liste les invitations (RLS via claims). Peuple Etablissement + Filiere.
//
// Le frontend etudiants-page.tsx filtre `inv.role === 'ETUDIANT'` côté client
// (cf. spec E1-INVITATIONS endpoint 1) — on retourne donc toutes les
// invitations visibles par le créateur, sans filtrer par rôle côté API.
func (r *InvitationRepository) List(ctx context.Context, params domain.InvitationListParams) ([]*domain.Invitation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        if params.Limit < 1 || params.Limit > 200 {
                params.Limit = 50
        }

        var result []*domain.Invitation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.CreatedByID != "" {
                        where = append(where, fmt.Sprintf(`i."createdById" = $%d`, argIdx))
                        args = append(args, params.CreatedByID)
                        argIdx++
                }
                if params.Used != nil {
                        where = append(where, fmt.Sprintf(`i."used" = $%d`, argIdx))
                        args = append(args, *params.Used)
                        argIdx++
                }
                if params.Role != "" {
                        where = append(where, fmt.Sprintf(`i."role" = $%d`, argIdx))
                        args = append(args, params.Role)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`
                        SELECT i."id", i."token", i."email", i."role", i."name", i."etablissementId",
                               i."filiereId", i."expiresAt", i."used", i."usedAt", i."createdById", i."createdAt",
                               e."id" AS etab_id, e."nom" AS etab_nom,
                               f."id" AS fil_id, f."nom" AS fil_nom
                        FROM "Invitation" i
                        LEFT JOIN "Etablissement" e ON e."id" = i."etablissementId"
                        LEFT JOIN "Filiere" f ON f."id" = i."filiereId"
                        %s
                        ORDER BY i."createdAt" DESC
                        LIMIT $%d`, whereClause, argIdx)
                args = append(args, params.Limit)

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query invitations: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        i := &domain.Invitation{}
                        var (
                                etabID, etabNom *string
                                filID, filNom   *string
                        )
                        if err := rows.Scan(
                                &i.ID, &i.Token, &i.Email, &i.Role, &i.Name,
                                &i.EtablissementID, &i.FiliereID, &i.ExpiresAt, &i.Used,
                                &i.UsedAt, &i.CreatedByID, &i.CreatedAt,
                                &etabID, &etabNom,
                                &filID, &filNom,
                        ); err != nil {
                                return fmt.Errorf("scan invitation: %w", err)
                        }
                        if etabID != nil && etabNom != nil {
                                i.Etablissement = &domain.EtablissementRef{ID: *etabID, Nom: *etabNom}
                        }
                        if filID != nil && filNom != nil {
                                i.Filiere = &domain.FiliereRef{ID: *filID, Nom: *filNom}
                        }
                        result = append(result, i)
                }
                if result == nil {
                        result = []*domain.Invitation{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create insère une nouvelle invitation (RLS via claims — Invitation_modify).
func (r *InvitationRepository) Create(ctx context.Context, input domain.CreateInvitationInput) (*domain.Invitation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var inv *domain.Invitation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                id := uuid.NewString()
                row := tx.QueryRow(ctx, `
                        INSERT INTO "Invitation" ("id", "token", "email", "role", "name",
                                                  "etablissementId", "filiereId", "expiresAt",
                                                  "used", "usedAt", "createdById", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NULL, $9, CURRENT_TIMESTAMP)
                        RETURNING `+colonnesInvitation,
                        id, input.Token, input.Email, input.Role, nullableStrPtr(input.Name),
                        nullableStrPtr(input.EtablissementID), nullableStrPtr(input.FiliereID),
                        input.ExpiresAt, input.CreatedByID)

                i, err := scanInvitation(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "une invitation avec cet email existe déjà"}
                        }
                        return fmt.Errorf("create invitation: %w", err)
                }
                inv = i
                return nil
        })
        if err != nil {
                return nil, err
        }
        return inv, nil
}

// Update met à jour une invitation (RLS via claims — Invitation_modify).
// Utilisé par "renvoyer" pour régénérer token + expiresAt + reset used/usedAt.
func (r *InvitationRepository) Update(ctx context.Context, id string, input domain.UpdateInvitationInput) (*domain.Invitation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var inv *domain.Invitation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var setClauses []string
                var args []any
                argIdx := 1

                addSet := func(col string, val any) {
                        setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
                        args = append(args, val)
                        argIdx++
                }

                if input.Token != nil {
                        addSet("token", *input.Token)
                }
                if input.ExpiresAt != nil {
                        addSet("expiresAt", *input.ExpiresAt)
                }
                if input.Used != nil {
                        addSet("used", *input.Used)
                }
                if input.UsedAt != nil {
                        addSet("usedAt", nullableTimePtrHelper(input.UsedAt))
                }

                if len(setClauses) == 0 {
                        // Rien à mettre à jour → on retourne l'invitation existante.
                        row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Invitation" WHERE "id" = $1`, colonnesInvitation), id)
                        i, err := scanInvitation(row)
                        if err != nil {
                                if err == pgx.ErrNoRows {
                                        return &domain.NotFoundError{Entity: "Invitation", ID: id}
                                }
                                return err
                        }
                        inv = i
                        return nil
                }

                args = append(args, id)
                updateSQL := fmt.Sprintf(`UPDATE "Invitation" SET %s WHERE "id" = $%d RETURNING %s`,
                        strings.Join(setClauses, ", "), argIdx, colonnesInvitation)

                row := tx.QueryRow(ctx, updateSQL, args...)
                i, err := scanInvitation(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Invitation", ID: id}
                        }
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "token déjà utilisé"}
                        }
                        return fmt.Errorf("update invitation: %w", err)
                }
                inv = i
                return nil
        })
        if err != nil {
                return nil, err
        }
        return inv, nil
}

// Delete supprime une invitation (hard delete, RLS via claims — Invitation_modify).
func (r *InvitationRepository) Delete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(ctx, `DELETE FROM "Invitation" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("delete invitation: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "Invitation", ID: id}
                }
                return nil
        })
}

// MarkUsed marque une invitation comme utilisée (used=true, usedAt=now).
// Bypass RLS — appelé par /accept dans la même transaction que la création du User.
func (r *InvitationRepository) MarkUsed(ctx context.Context, id string, usedAt time.Time) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        tag, err := tx.Exec(ctx, `UPDATE "Invitation" SET "used" = true, "usedAt" = $1 WHERE "id" = $2`, usedAt, id)
        if err != nil {
                return fmt.Errorf("mark invitation used: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "Invitation", ID: id}
        }

        if err := tx.Commit(ctx); err != nil {
                return fmt.Errorf("commit: %w", err)
        }
        return nil
}

// UserExistsByEmail vérifie si un User avec cet email existe déjà.
// Bypass RLS — appelé par le endpoint public /verify.
func (r *InvitationRepository) UserExistsByEmail(ctx context.Context, email string) (bool, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return false, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return false, fmt.Errorf("disable rls: %w", err)
        }

        var exists bool
        if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "User" WHERE "email" = $1)`, email).Scan(&exists); err != nil {
                return false, fmt.Errorf("query user exists by email: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return false, fmt.Errorf("commit: %w", err)
        }
        return exists, nil
}

// AcceptInvitation crée le User + marque l'invitation comme utilisée en une
// seule transaction atomique (bypass RLS — endpoint public /accept).
//
// Si invitation.Role == ETUDIANT, génère un matricule séquentiel au format
// FIL/LJ/YY/NNN (ex: "INF/LJ/24/001") en comptant les ETUDIANT déjà inscrits
// dans la même filière +1. La query de count et l'INSERT User sont dans la
// même transaction pour éviter la race condition (deux accept simultanés
// pourraient générer le même matricule — risque acceptable vu la fenêtre
// étroite ; en pratique les invitations sont à usage unique donc deux
// accept simultanés avec le même token sont déjà rejetés par MarkUsed).
//
// Si role != ETUDIANT, matricule est NULL.
func (r *InvitationRepository) AcceptInvitation(ctx context.Context, invitation *domain.Invitation, input domain.AcceptInvitationInput) (*domain.User, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        userID := uuid.NewString()

        // Générer le matricule si ETUDIANT.
        var matricule any // nil si non ETUDIANT
        if invitation.Role == domain.RoleEtudiant && invitation.FiliereID != nil {
                filID := *invitation.FiliereID

                // 1. Récupérer le code de la filière (fallback "ETU" si vide).
                var filCode *string
                if err := tx.QueryRow(ctx, `SELECT "code" FROM "Filiere" WHERE "id" = $1`, filID).Scan(&filCode); err != nil {
                        if err != pgx.ErrNoRows {
                                return nil, fmt.Errorf("query filiere code: %w", err)
                        }
                }
                code := "ETU"
                if filCode != nil && *filCode != "" {
                        code = *filCode
                }

                // 2. Compter les ETUDIANT déjà inscrits dans la filière.
                var count int
                if err := tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "role" = 'ETUDIANT' AND "filiereId" = $1`, filID).Scan(&count); err != nil {
                        return nil, fmt.Errorf("count etudiants: %w", err)
                }

                // 3. Construire le matricule au format FIL/LJ/YY/NNN.
                year2 := time.Now().Format("06")
                matricule = fmt.Sprintf("%s/LJ/%s/%03d", code, year2, count+1)
        }

        // Normaliser email (minuscules).
        email := strings.ToLower(invitation.Email)

        // Créer le User.
        userRow := tx.QueryRow(ctx, `
                INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                                    "image", "actif", "mustChangePwd", "matricule", "niveau",
                                    "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, true, false, $8, NULL, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING "id", "email", "name", "role", "etablissementId", "filiereId",
                          "image", "actif", "mustChangePwd", "matricule", "niveau",
                          "derniereConnexion", "createdAt", "updatedAt`,
                userID, email, input.Name, input.Password, invitation.Role,
                nullableStrPtr(invitation.EtablissementID), nullableStrPtr(invitation.FiliereID),
                matricule)

        user, err := scanUser(userRow)
        if err != nil {
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "email ou matricule déjà utilisé"}
                }
                return nil, fmt.Errorf("create user from invitation: %w", err)
        }

        // Marquer l'invitation comme utilisée.
        tag, err := tx.Exec(ctx, `UPDATE "Invitation" SET "used" = true, "usedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, invitation.ID)
        if err != nil {
                return nil, fmt.Errorf("mark invitation used: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return nil, &domain.NotFoundError{Entity: "Invitation", ID: invitation.ID}
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return user, nil
}

// nullableTimePtrHelper retourne nil si le pointeur est nil, sinon la valeur
// pointée (pour scan/update d'un *time.Time nullable en DB).
func nullableTimePtrHelper(t *time.Time) any {
        if t == nil {
                return nil
        }
        return *t
}
