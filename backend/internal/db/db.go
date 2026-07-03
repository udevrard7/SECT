// Package db fournit la connexion PostgreSQL (pgxpool) vers Neon
// et des helpers pour poser les claims RLS au début de chaque transaction.
package db

import (
        "context"
        "fmt"
        "strings"

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
        // BUGFIX (EPR-1): QueryExecModeSimpleProtocol causait 0 résultat sur
        // queries complexes (43 colonnes + 3 LEFT JOINs). QueryExecModeExec
        // désactive les prepared statements (compatible PgBouncer) tout en
        // gardant le Extended Protocol pour une exécution correcte.
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
        // U3 (CRITICAL) : MustChangePwd est propagé dans le JWT pour permettre au
        // middleware RequireAuth d'enforcer le changement de password obligatoire.
        // Avant ce fix, le flag était en DB mais non inclus dans le JWT → un user avec
        // password temporaire pouvait utiliser l'API indéfiniment.
        MustChangePwd bool
        // ACCESS-ASSISTANCE : Email et Name pour le mode assistance (émission de nouveau JWT).
        Email string
        Name  string
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
// SetClaimsTx pose les claims RLS (app.claims.*) au début d'une transaction.
// RLS-POOLER-FIX : tous les set_config sont combinés en UN SEUL Exec pour
// garantir qu'ils sont appliqués atomiquement. Avec pgx + QueryExecModeExec +
// PgBouncer (mode transaction), des Exec séparés pour SELECT set_config(...)
// peuvent ne pas persister correctement entre les queries de la transaction.
// Combiner en un seul Exec (comme le fait déjà getActiveProvider dans ai/service.go)
// garantit que tous les claims sont posés avant la première query RLS.
func SetClaimsTx(ctx context.Context, tx pgx.Tx, claims SessionClaims) error {
        // Construire la liste des set_config dans un seul SELECT.
        // set_config retourne text, on les chaîne avec des virgules dans le SELECT.
        parts := []string{
                fmt.Sprintf("set_config('app.claims.user_id', '%s', true)", pgEscape(claims.UserID)),
                fmt.Sprintf("set_config('app.claims.role', '%s', true)", pgEscape(claims.Role)),
                fmt.Sprintf("set_config('app.claims.etablissement_id', '%s', true)", pgEscape(claims.EtablissementID)),
        }
        if claims.FiliereID != "" {
                parts = append(parts, fmt.Sprintf("set_config('app.claims.filiere_id', '%s', true)", pgEscape(claims.FiliereID)))
        }
        query := "SELECT " + strings.Join(parts, ", ")
        if _, err := tx.Exec(ctx, query); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }
        return nil
}

// pgEscape échappe une chaîne pour l'inclusion dans un littéral SQL de façon
// sûre (anti-injection). Utilisé pour construire les set_config en un seul Exec
// (les paramètres bindés ne peuvent pas être utilisés pour les noms de
// configuration dans set_config).
func pgEscape(s string) string {
        return strings.ReplaceAll(s, "'", "''")
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
