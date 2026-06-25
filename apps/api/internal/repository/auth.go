// Package repository — implémentation AuthRepository avec pgx.
package repository

import (
        "context"
        "fmt"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/apps/api/internal/domain"
)

// AuthRepository implémente domain.AuthRepository avec pgx.
type AuthRepository struct {
        pool *pgxpool.Pool
}

// NewAuthRepository crée un nouveau AuthRepository.
func NewAuthRepository(pool *pgxpool.Pool) *AuthRepository {
        return &AuthRepository{pool: pool}
}

// FindUserForAuth récupère un utilisateur par email OU matricule.
// Détection automatique : si l'identifier contient '@', on cherche par email ;
// sinon par matricule. Contourne RLS (SET LOCAL row_security = off).
func (r *AuthRepository) FindUserForAuth(ctx context.Context, identifier string) (*domain.AuthUser, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        // Détection email vs matricule
        var whereClause string
        if isEmail(identifier) {
                whereClause = `"email" = $1`
        } else {
                whereClause = `"matricule" = $1`
        }

        query := fmt.Sprintf(`
                SELECT "id", "email", "name", "password", "role", "etablissementId", "filiereId",
                       "image", "actif", "mustChangePwd", "niveau", "loginAttempts", "lockedUntil",
                       "derniereConnexion"
                FROM "User"
                WHERE %s
        `, whereClause)

        row := tx.QueryRow(ctx, query, identifier)
        u, err := scanAuthUser(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "User", ID: identifier}
                }
                return nil, fmt.Errorf("query user for auth: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return u, nil
}

// GetUserByID récupère un utilisateur par ID (avec champs auth). Bypass RLS.
func (r *AuthRepository) GetUserByID(ctx context.Context, userID string) (*domain.AuthUser, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        row := tx.QueryRow(ctx, `
                SELECT "id", "email", "name", "password", "role", "etablissementId", "filiereId",
                       "image", "actif", "mustChangePwd", "niveau", "loginAttempts", "lockedUntil",
                       "derniereConnexion"
                FROM "User"
                WHERE "id" = $1
        `, userID)

        u, err := scanAuthUser(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "User", ID: userID}
                }
                return nil, fmt.Errorf("query user by id: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return u, nil
}

// UpdateLoginSuccess reset loginAttempts, lockedUntil et pose derniereConnexion = now.
func (r *AuthRepository) UpdateLoginSuccess(ctx context.Context, userID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "User"
                SET "loginAttempts" = 0, "lockedUntil" = NULL, "derniereConnexion" = CURRENT_TIMESTAMP
                WHERE "id" = $1
        `, userID)
        if err != nil {
                return fmt.Errorf("update login success: %w", err)
        }

        return tx.Commit(ctx)
}

// IncrementLoginAttempts incrémente loginAttempts. Si >= maxAttempts, pose lockedUntil.
// Retourne le nouveau count.
func (r *AuthRepository) IncrementLoginAttempts(ctx context.Context, userID string, maxAttempts int, lockDuration time.Duration) (int, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return 0, fmt.Errorf("disable rls: %w", err)
        }

        // Incrémenter + récupérer le nouveau count
        var attempts int
        err = tx.QueryRow(ctx, `
                UPDATE "User"
                SET "loginAttempts" = "loginAttempts" + 1
                WHERE "id" = $1
                RETURNING "loginAttempts"
        `, userID).Scan(&attempts)
        if err != nil {
                return 0, fmt.Errorf("increment login attempts: %w", err)
        }

        // Si seuil atteint, poser lockedUntil
        if attempts >= maxAttempts {
                _, err = tx.Exec(ctx, `
                        UPDATE "User"
                        SET "lockedUntil" = CURRENT_TIMESTAMP + $1::interval
                        WHERE "id" = $2
                `, fmt.Sprintf("%d seconds", int(lockDuration.Seconds())), userID)
                if err != nil {
                        return 0, fmt.Errorf("set locked until: %w", err)
                }
        }

        if err := tx.Commit(ctx); err != nil {
                return 0, fmt.Errorf("commit: %w", err)
        }
        return attempts, nil
}

// CreateRefreshToken insère un nouveau refresh token en base.
func (r *AuthRepository) CreateRefreshToken(ctx context.Context, rt *domain.RefreshToken) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                INSERT INTO "RefreshToken" ("id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "userAgent", "ip")
                VALUES ($1, $2, $3, $4, NULL, CURRENT_TIMESTAMP, $5, $6)
        `, rt.ID, rt.UserID, rt.TokenHash, rt.ExpiresAt, rt.UserAgent, rt.IP)
        if err != nil {
                return fmt.Errorf("insert refresh token: %w", err)
        }

        return tx.Commit(ctx)
}

// FindRefreshTokenByHash récupère un refresh token par son hash. Bypass RLS.
func (r *AuthRepository) FindRefreshTokenByHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return nil, fmt.Errorf("disable rls: %w", err)
        }

        row := tx.QueryRow(ctx, `
                SELECT "id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "userAgent", "ip"
                FROM "RefreshToken"
                WHERE "tokenHash" = $1
        `, hash)

        rt := &domain.RefreshToken{}
        err = row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.RevokedAt, &rt.CreatedAt, &rt.UserAgent, &rt.IP)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "RefreshToken", ID: hash}
                }
                return nil, fmt.Errorf("query refresh token: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return rt, nil
}

// RevokeRefreshToken marque un refresh token comme révoqué.
func (r *AuthRepository) RevokeRefreshToken(ctx context.Context, tokenID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "id" = $1
        `, tokenID)
        if err != nil {
                return fmt.Errorf("revoke refresh token: %w", err)
        }

        return tx.Commit(ctx)
}

// RevokeAllUserRefreshTokens révoque tous les refresh tokens actifs d'un user.
func (r *AuthRepository) RevokeAllUserRefreshTokens(ctx context.Context, userID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "RefreshToken"
                SET "revokedAt" = CURRENT_TIMESTAMP
                WHERE "userId" = $1 AND "revokedAt" IS NULL
        `, userID)
        if err != nil {
                return fmt.Errorf("revoke all user refresh tokens: %w", err)
        }

        return tx.Commit(ctx)
}

// CreateAuditLog insère une entrée d'audit. Le champ userId peut être NULL.
func (r *AuthRepository) CreateAuditLog(ctx context.Context, entry *domain.AuditLogEntry) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AuditLog a une policy INSERT WITH CHECK(true) → pas besoin de bypass RLS
        _, err = tx.Exec(ctx, `
                INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        `,
                uuid.NewString(), nullableString(entry.UserID), nullableString(entry.UserEmail),
                entry.Action, entry.Entite, nullableString(entry.EntiteID),
                entry.Details, entry.AdresseIP,
        )
        if err != nil {
                return fmt.Errorf("insert audit log: %w", err)
        }

        return tx.Commit(ctx)
}

// UpdatePassword met à jour le hash + reset mustChangePwd + reset attempts.
func (r *AuthRepository) UpdatePassword(ctx context.Context, userID string, passwordHash string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "User"
                SET "password" = $2, "mustChangePwd" = false, "loginAttempts" = 0, "lockedUntil" = NULL
                WHERE "id" = $1
        `, userID, passwordHash)
        if err != nil {
                return fmt.Errorf("update password: %w", err)
        }

        return tx.Commit(ctx)
}

// --- Helpers ---

func isEmail(s string) bool {
        for _, c := range s {
                if c == '@' {
                        return true
                }
        }
        return false
}

func nullableString(s *string) any {
        if s == nil {
                return nil
        }
        return *s
}

// scanAuthUser scan une ligne User avec tous les champs auth.
func scanAuthUser(s scanner) (*domain.AuthUser, error) {
        u := &domain.AuthUser{}
        err := s.Scan(
                &u.ID, &u.Email, &u.Name, &u.Password, &u.Role,
                &u.EtablissementID, &u.FiliereID, &u.Image, &u.Actif,
                &u.MustChangePwd, &u.Niveau, &u.LoginAttempts, &u.LockedUntil,
                &u.DerniereConnexion,
        )
        if err != nil {
                return nil, err
        }
        return u, nil
}
