// Package db fournit la connexion PostgreSQL (pgxpool) vers Neon
// et des helpers pour poser les claims RLS au début de chaque transaction.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// --- Context claims ---

type ctxKey int

const claimsCtxKey ctxKey = iota

// WithClaimsContext pose les claims dans le context. Utilisé par le middleware
// d'authentification après validation du JWT.
func WithClaimsContext(ctx context.Context, claims SessionClaims) context.Context {
	return context.WithValue(ctx, claimsCtxKey, claims)
}

// ClaimsFromContext récupère les claims depuis le context.
// Retourne false si aucune claim n'est présente (request non authentifiée).
func ClaimsFromContext(ctx context.Context) (SessionClaims, bool) {
	c, ok := ctx.Value(claimsCtxKey).(SessionClaims)
	return c, ok
}

// New crée un pool de connexions vers Neon Postgres.
// Le pool est thread-safe et gère automatiquement le cycle de vie des connexions.
func New(databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	// Configuration du pool — Neon recommande un pool modeste
	config.MaxConns = 20
	config.MinConns = 2

	// BUGFIX (SCORES-NORM-1): désactiver les prepared statements car le
	// pooler Neon (PgBouncer) ne les supporte pas correctement → erreur
	// "prepared statement name is already in use (SQLSTATE 08P01)".
	// En mode simple protocol, pgx envoie chaque query sans préparation.
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	// Vérifier la connexion
	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// SessionClaims représente les claims de session posés pour RLS.
type SessionClaims struct {
	UserID          string // CUID de l'utilisateur courant
	Role            string // ADMIN | RESPONSABLE | ENSEIGNANT | ETUDIANT
	EtablissementID string // CUID de l'établissement ('' pour ADMIN)
	FiliereID       string // CUID de la filière ('' si non applicable)
}

// SetClaimsTx pose les claims RLS sur une transaction pgx.
// Les claims sont "local" à la transaction (is_local=true) : ils sont
// automatiquement nettoyés en fin de transaction (commit/rollback).
//
// Usage typique dans un repository :
//
//      tx, _ := pool.BeginTx(ctx, pgx.TxOptions{})
//      defer tx.Rollback(ctx)
//      db.SetClaimsTx(ctx, tx, claims)
//      // ... queries ...
//      tx.Commit(ctx)
func SetClaimsTx(ctx context.Context, tx pgx.Tx, claims SessionClaims) error {
	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', $1, true)", claims.UserID); err != nil {
		return fmt.Errorf("set user_id claim: %w", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.role', $1, true)", claims.Role); err != nil {
		return fmt.Errorf("set role claim: %w", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.etablissement_id', $1, true)", claims.EtablissementID); err != nil {
		return fmt.Errorf("set etablissement_id claim: %w", err)
	}
	// filiere_id n'est pas utilisé par les policies RLS actuelles, mais on le pose
	// pour future utilisation (policies par filière).
	if claims.FiliereID != "" {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.filiere_id', $1, true)", claims.FiliereID); err != nil {
			return fmt.Errorf("set filiere_id claim: %w", err)
		}
	}
	return nil
}

// WithTx exécute une fonction dans une transaction avec les claims RLS posés.
// Gère automatiquement commit (si la fonction retourne nil) et rollback (si erreur).
//
// Usage :
//
//      err := db.WithTx(ctx, pool, claims, func(tx pgx.Tx) error {
//          // queries ici, claims déjà posés
//          return nil
//      })
func WithTx(ctx context.Context, pool *pgxpool.Pool, claims SessionClaims, fn func(pgx.Tx) error) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) // safe à appeler après Commit (no-op)

	if err := SetClaimsTx(ctx, tx, claims); err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
