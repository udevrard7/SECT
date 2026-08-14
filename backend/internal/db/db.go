// Package db fournit la connexion PostgreSQL (pgxpool) vers Neon
// et des helpers pour poser les claims RLS au début de chaque transaction.
package db

import (
        "context"
        "fmt"
        "os"
        "strconv"
        "strings"
        "time"

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

        // Configuration du pool — optimisé pour haute charge (BULK-FLUSH-1).
        // Avant : MaxConns=20, insuffisant pour 5000+ étudiants simultanés.
        // Maintenant : MaxConns configurable via DB_MAX_CONNS (défaut 100).
        // Neon pooler (PgBouncer transaction mode) gère le multiplexage côté serveur.
        //
        // Calcul : 5000 sessions / 30s flush = 167 sessions/s × ~20ms/tx = 3.3 connexions
        // + 585 req/s HTTP × ~10ms = 5.85 connexions + marge = ~20 connexions actives.
        // MaxConns=100 donne un buffer confortable pour les pics.
        config.MaxConns = int32(getEnvInt("DB_MAX_CONNS", 100))
        config.MinConns = int32(getEnvInt("DB_MIN_CONNS", 5))

        // Health check pour détecter les connexions mortes (Neon cold start)
        config.HealthCheckPeriod = 30 * time.Second

        // Connection max idle time — fermer les connexions inactives après 5 min
        config.MaxConnIdleTime = 5 * time.Minute

        // Connection max lifetime — renouveler les connexions après 30 min
        config.MaxConnLifetime = 30 * time.Minute

        // ConnectTimeout — 10s pour se connecter à Neon (sur ConnConfig)
        config.ConnConfig.ConnectTimeout = 10 * time.Second

        // BUGFIX (SCORES-NORM-1): désactiver les prepared statements car le
        // pooler Neon (PgBouncer) ne les supporte pas correctement → erreur
        // "prepared statement name is already in use (SQLSTATE 08P01)".
        // BUGFIX (EPR-1): QueryExecModeSimpleProtocol causait 0 résultat sur
        // queries complexes (43 colonnes + 3 LEFT JOINs).
        // BUGFIX (RLS-FIX): QueryExecModeExec causait 0 résultat sur les queries
        // avec RLS policies (set_config/SET LOCAL non appliqués pour l'évaluation
        // des policies). QueryExecModeDescExec ajoute une étape Describe qui
        // force le serveur à traiter la query complètement (incluant les SET LOCAL
        // précédents) avant l'exécution.
        config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeDescribeExec

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

// getEnvInt retourne la valeur entière d'une variable d'environnement, ou le fallback.
func getEnvInt(key string, fallback int) int {
        if v := os.Getenv(key); v != "" {
                if n, err := strconv.Atoi(v); err == nil {
                        return n
                }
        }
        return fallback
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

// SystemClaims retourne des claims "system-worker" pour les opérations backend
// qui doivent bypasser le filtrage RLS par utilisateur (ex: workers IA, compte
// de dépendances cross-tenant après checkOwnership côté usecase, endpoints
// publics de vérification de certificat).
//
// Les policies RLS qui acceptent is_system() (Document_all_system,
// Question_all_system, SessionPassation_all_system, Etablissement_select,
// etc.) laissent passer ces claims. Les policies sans is_system() (User_select,
// Certificat_select, etc.) continuent d'appliquer leur logique — pour celles-ci,
// le system-worker est traité comme un ADMIN (is_admin()=true) ce qui couvre
// la plupart des cas (admin_has_etablissement_access n'étant pas appelé sans
// etablissement_id, les policies ADMIN-only sans subquery laissent passer).
//
// AUDIT-RLS-REPOS-001 : standardise le pattern de bypass worker précédemment
// implémenté in-line dans etablissement_access.go via SELECT set_config(...)
// brut. Préférer SystemClaims() + db.WithTx ou db.SetClaimsTx pour tous les
// nouveaux bypass.
func SystemClaims() SessionClaims {
        return SessionClaims{
                UserID: "system-worker",
                Role:   "ADMIN",
        }
}

// SetClaimsTx pose les claims RLS sur une transaction pgx.
// Les claims sont "local" à la transaction (is_local=true) : ils sont
// automatiquement nettoyés en fin de transaction (commit/rollback).
//
// Usage typique dans un repository :
//
//      tx, _ := pool.BeginTx(ctx, pgx.TxOptions{})
//      defer func() { _ = tx.Rollback(ctx) }()
//      db.SetClaimsTx(ctx, tx, claims)
//      // ... queries ...
//      tx.Commit(ctx)
//
// SetClaimsTx pose les claims RLS (app.claims.*) au début d'une transaction.
// RLS-POOLER-FIX : utilise SET LOCAL au lieu de SELECT set_config(...) car
// pgx + QueryExecModeExec peut ne pas appliquer correctement set_config local
// pour l'évaluation des policies RLS. SET LOCAL est l'équivalent SQL standard
// et est traité différemment par pgx (commande DDL plutôt que SELECT).
func SetClaimsTx(ctx context.Context, tx pgx.Tx, claims SessionClaims) error {
        // SET LOCAL ne supporte pas les paramètres bindés ($1). On utilise
        // pgEscape pour l'échappement sûr (anti-injection SQL).
        setters := []string{
                fmt.Sprintf("SET LOCAL app.claims.user_id = '%s'", pgEscape(claims.UserID)),
                fmt.Sprintf("SET LOCAL app.claims.role = '%s'", pgEscape(claims.Role)),
                fmt.Sprintf("SET LOCAL app.claims.etablissement_id = '%s'", pgEscape(claims.EtablissementID)),
        }
        if claims.FiliereID != "" {
                setters = append(setters, fmt.Sprintf("SET LOCAL app.claims.filiere_id = '%s'", pgEscape(claims.FiliereID)))
        }
        for _, s := range setters {
                if _, err := tx.Exec(ctx, s); err != nil {
                        return fmt.Errorf("set claims: %w", err)
                }
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
        defer func() { _ = tx.Rollback(ctx) }() // safe à appeler après Commit (no-op)

        if err := SetClaimsTx(ctx, tx, claims); err != nil {
                return err
        }

        if err := fn(tx); err != nil {
                return err
        }

        return tx.Commit(ctx)
}
