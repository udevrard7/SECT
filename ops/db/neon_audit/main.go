// Command neon_audit — sonde d'audit LECTURE SEULE pour l'étude BD hybride
// (SECT-DB-HYBRID-2 / ADR-0013). Réutilisable pour les audits mensuels et
// les exercices DR : elle ne modifie JAMAIS la base (SELECT uniquement) et
// n'affiche JAMAIS de secret (seul le host du endpoint est imprimé — public
// par nature ; les DSN ne transitent ni en argument ni dans les logs).
//
// Ce qu'elle mesure :
//
//  1. Identité & réglages du compute (version, wal_level, slots, buffers…)
//  2. WAKEFULNESS : le compute Neon dort-il ? — preuves directes du
//     keep-awake 24/7 : stats_reset (dernier (re)démarrage du compute),
//     âge de la plus ancienne connexion client (une suspension fermerait
//     TOUTES les connexions), transactions/s moyennes depuis le réveil.
//  3. Volumétrie (taille, tables, policies RLS, séquences, extensions, top)
//  4. Profil d'activité réel (RequestLog ~7 j : par jour + par heure ;
//     AuditLog : ancienneté approximative du projet)
//  5. Latence par endpoint (pooler vs direct) : connexion complète puis
//     RTT « SELECT 1 » ×20 (min/p50/p95/max)
//  6. Synthèse pour le modèle CU-heures Neon (formule officielle :
//     CU-h = CU moyen × heures actives — à 0,25 CU, 100 CU-h ≈ 400 h/mois)
//
// Usage :
//
//      export NEON_DATABASE_URL='postgres://…-pooler…'   # endpoint pooler (prod)
//      export NEON_DIRECT_URL='postgres://…'            # endpoint direct
//      go run ./ops/db/neon_audit
//
// Au moins un des deux DSN est requis ; le direct est préféré pour l'audit,
// les deux servent à la section latence.
package main

import (
        "context"
        "fmt"
        "os"
        "sort"
        "strings"
        "time"

        "github.com/jackc/pgx/v5"
)

func fatal(msg string, err error) {
        fmt.Fprintf(os.Stderr, "❌ %s : %v\n", msg, err)
        os.Exit(1)
}

// hostOf extrait le host d'un DSN pour l'afficher (non-secret), sans jamais
// imprimer le reste (user, mot de passe, base).
func hostOf(dsns ...string) string {
        for _, dsn := range dsns {
                if dsn == "" {
                        continue
                }
                if i := strings.Index(dsn, "@"); i >= 0 {
                        rest := dsn[i+1:]
                        for _, sep := range []string{":", "/", "?"} {
                                if j := strings.Index(rest, sep); j >= 0 {
                                        rest = rest[:j]
                                }
                        }
                        return rest
                }
        }
        return "(dsn masqué)"
}

func section(title string) {
        fmt.Printf("\n━━━ %s ━━━\n", title)
}

// quantile sur un slice de durées trié à la volée.
func quantile(durs []time.Duration, q float64) time.Duration {
        if len(durs) == 0 {
                return 0
        }
        s := append([]time.Duration(nil), durs...)
        sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
        return s[int(float64(len(s)-1)*q)]
}

func dur(t time.Duration) string { return t.Round(time.Millisecond).String() }

func main() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
        defer cancel()

        poolerURL := os.Getenv("NEON_DATABASE_URL")
        directURL := os.Getenv("NEON_DIRECT_URL")
        if poolerURL == "" && directURL == "" {
                fatal("DSN requis", fmt.Errorf("définir NEON_DATABASE_URL et/ou NEON_DIRECT_URL (variables d'environnement — jamais en argument)"))
        }
        auditURL := directURL
        if auditURL == "" {
                auditURL = poolerURL
        }

        fmt.Println("╔══════════════════════════════════════════════════════════════╗")
        fmt.Println("║ SECT neon_audit (SECT-DB-HYBRID-2) — LECTURE SEULE           ║")
        fmt.Printf("║ endpoint audité : %-42s ║\n", hostOf(auditURL))
        fmt.Printf("║ exécuté à       : %-42s ║\n", time.Now().UTC().Format("2006-01-02 15:04:05 UTC"))
        fmt.Println("╚══════════════════════════════════════════════════════════════╝")

        t0 := time.Now()
        conn, err := pgx.Connect(ctx, auditURL)
        if err != nil {
                fatal("connexion Neon", err)
        }
        defer func() { _ = conn.Close(ctx) }()
        fmt.Printf("connexion complète (TCP+TLS+auth+startup) : %d ms\n", time.Since(t0).Milliseconds())

        // ── 1. Identité & réglages ────────────────────────────────────────────
        section("1. IDENTITÉ & RÉGLAGES DU COMPUTE")
        var version string
        if err := conn.QueryRow(ctx, "SELECT version()").Scan(&version); err == nil {
                fmt.Printf("version : %s\n", version)
        }
        settingNames := []string{
                "wal_level", "max_replication_slots", "max_wal_senders",
                "max_slot_wal_keep_size", "shared_buffers", "effective_cache_size",
                "work_mem", "max_connections", "max_worker_processes",
                "autovacuum", "max_wal_size",
        }
        rows, err := conn.Query(ctx,
                `SELECT name, setting, coalesce(unit,'') FROM pg_settings WHERE name = ANY($1) ORDER BY name`, settingNames)
        if err != nil {
                fatal("lecture pg_settings", err)
        }
        for rows.Next() {
                var n, v, u string
                if err := rows.Scan(&n, &v, &u); err == nil {
                        fmt.Printf("  %-24s %s %s\n", n, v, u)
                }
        }
        rows.Close()

        slots, err := conn.Query(ctx,
                `SELECT slot_name, slot_type, active FROM pg_replication_slots ORDER BY slot_name`)
        if err == nil {
                fmt.Println("slots de réplication :")
                n := 0
                for slots.Next() {
                        var name, typ string
                        var active bool
                        if err := slots.Scan(&name, &typ, &active); err == nil {
                                fmt.Printf("  - %-30s type=%s active=%v\n", name, typ, active)
                                n++
                        }
                }
                slots.Close()
                if n == 0 {
                        fmt.Println("  (aucun)")
                }
        }

        // ── 2. Wakefulness ────────────────────────────────────────────────────
        section("2. WAKEFULNESS — LE COMPUTE DORT-IL ?")
        // pg_postmaster_start_time : l'âge du processus postgres du compute.
        // Toute suspension Neon détruit le compute → au réveil, NOUVEAU postmaster.
        // C'est la preuve directe de l'ancienneté de la période d'activité continue.
        var postmasterStart time.Time
        if err := conn.QueryRow(ctx, "SELECT pg_postmaster_start_time()").Scan(&postmasterStart); err == nil {
                age := time.Since(postmasterStart)
                fmt.Printf("pg_postmaster_start_time : %s → compute actif depuis %s\n",
                        postmasterStart.UTC().Format("2006-01-02 15:04:05 UTC"), dur(age))
                fmt.Println("  → toute suspension (idle ou quota épuisé) repartirait d'un postmaster tout récent :")
                fmt.Println("    un âge élevé = activité CONTINUE depuis cette date (preuve keep-awake)")
        }

        var statsReset *time.Time
        var xactCommit, xactRollback int64
        if err := conn.QueryRow(ctx,
                `SELECT stats_reset, xact_commit, xact_rollback
                 FROM pg_stat_database WHERE datname = current_database()`).Scan(&statsReset, &xactCommit, &xactRollback); err != nil {
                fatal("lecture pg_stat_database", err)
        }
        if statsReset != nil {
                age := time.Since(*statsReset)
                fmt.Printf("stats_reset (dernier reset des compteurs) : %s → il y a %s\n",
                        statsReset.UTC().Format("2006-01-02 15:04:05 UTC"), dur(age))
                if age > time.Minute {
                        avg := float64(xactCommit+xactRollback) / age.Seconds()
                        fmt.Printf("transactions depuis : %d commit + %d rollback\n", xactCommit, xactRollback)
                        fmt.Printf("débit moyen         : %.2f tx/s\n", avg)
                }
        } else {
                fmt.Printf("stats_reset : (null) — compteurs jamais reset : %d commit + %d rollback depuis le démarrage du compute\n", xactCommit, xactRollback)
                if !postmasterStart.IsZero() && time.Since(postmasterStart) > time.Minute {
                        avg := float64(xactCommit+xactRollback) / time.Since(postmasterStart).Seconds()
                        fmt.Printf("débit moyen depuis le démarrage du compute : %.2f tx/s\n", avg)
                }
        }

        var nActive, nIdle, nIdleTx, nTotal int
        if err := conn.QueryRow(ctx,
                `SELECT count(*) FILTER (WHERE state = 'active'),
                        count(*) FILTER (WHERE state = 'idle'),
                        count(*) FILTER (WHERE state = 'idle in transaction'),
                        count(*)
                 FROM pg_stat_activity WHERE backend_type = 'client backend'`).
                Scan(&nActive, &nIdle, &nIdleTx, &nTotal); err != nil {
                fatal("lecture pg_stat_activity", err)
        }
        fmt.Printf("connexions client : %d (active=%d idle=%d idle-in-tx=%d)\n", nTotal, nActive, nIdle, nIdleTx)

        var oldest *time.Time
        if err := conn.QueryRow(ctx,
                `SELECT min(backend_start) FROM pg_stat_activity
                 WHERE backend_type = 'client backend' AND client_addr IS NOT NULL`).Scan(&oldest); err == nil && oldest != nil {
                age := time.Since(*oldest)
                fmt.Printf("plus ancienne connexion client : ouverte il y a %s\n", dur(age))
                fmt.Printf("  → preuve : le compute n'a PAS été suspendu pendant au moins %s\n", dur(age))
                fmt.Printf("    (une suspension Neon ferme TOUTES les connexions — neon.com/docs compute-lifecycle)\n")
        }

        fmt.Println("connexions en cours (IP sources, non secrètes) :")
        list, err := conn.Query(ctx,
                `SELECT pid, coalesce(nullif(application_name,''),'(unset)'), usename,
                        coalesce(client_addr::text,'local'), state,
                        to_char(backend_start, 'MM-DD HH24:MI')
                 FROM pg_stat_activity WHERE backend_type = 'client backend'
                 ORDER BY backend_start`)
        if err != nil {
                fatal("liste pg_stat_activity", err)
        }
        for list.Next() {
                var pid int
                var app, user, addr, state, since string
                if err := list.Scan(&pid, &app, &user, &addr, &state, &since); err == nil {
                        fmt.Printf("  pid=%-6d depuis %s  %-18s %-12s %-22s %s\n", pid, since, addr, state, app, user)
                }
        }
        list.Close()

        // ── 3. Volumétrie ─────────────────────────────────────────────────────
        section("3. VOLUMÉTRIE")
        var sizePretty string
        var nTables, nPolicies, nSeqs, nExt int
        if err := conn.QueryRow(ctx,
                `SELECT pg_size_pretty(pg_database_size(current_database())),
                        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
                        (SELECT count(*) FROM pg_policies),
                        (SELECT count(*) FROM pg_sequences),
                        (SELECT count(*) FROM pg_extension)`).
                Scan(&sizePretty, &nTables, &nPolicies, &nSeqs, &nExt); err != nil {
                fatal("volumétrie", err)
        }
        fmt.Printf("taille base : %s | tables public : %d | policies RLS : %d | séquences : %d | extensions : %d\n",
                sizePretty, nTables, nPolicies, nSeqs, nExt)
        top, err := conn.Query(ctx,
                `SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
                 FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 5`)
        if err == nil {
                fmt.Println("top 5 tables (lignes estimées) :")
                for top.Next() {
                        var name string
                        var rowsN int64
                        var sz string
                        if err := top.Scan(&name, &rowsN, &sz); err == nil {
                                fmt.Printf("  %-30s %8d lignes  %s\n", name, rowsN, sz)
                        }
                }
                top.Close()
        }

        // ── 4. Profil d'activité (RequestLog ~7 j — purge automatique) ────────
        section("4. PROFIL D'ACTIVITÉ RÉEL (RequestLog — purge 7 j)")
        var minT, maxT time.Time
        var cnt int64
        if err := conn.QueryRow(ctx,
                `SELECT min("createdAt"), max("createdAt"), count(*) FROM "RequestLog"`).
                Scan(&minT, &maxT, &cnt); err != nil {
                fmt.Printf("RequestLog illisible : %v\n", err)
        } else {
                fmt.Printf("RequestLog : %d requêtes du %s au %s\n",
                        cnt, minT.UTC().Format("2006-01-02 15:04"), maxT.UTC().Format("2006-01-02 15:04"))
                daily, err := conn.Query(ctx,
                        `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)
                         FROM "RequestLog" GROUP BY 1 ORDER BY 1`)
                if err == nil {
                        fmt.Println("par jour (UTC) :")
                        for daily.Next() {
                                var d string
                                var c int64
                                if err := daily.Scan(&d, &c); err == nil {
                                        fmt.Printf("  %s : %6d\n", d, c)
                                }
                        }
                        daily.Close()
                }
                hourly, err := conn.Query(ctx,
                        `SELECT extract(hour from "createdAt")::int, count(*)
                         FROM "RequestLog" GROUP BY 1 ORDER BY 1`)
                if err == nil {
                        counts := map[int]int64{}
                        var maxH int64
                        for hourly.Next() {
                                var h, c int64
                                if err := hourly.Scan(&h, &c); err == nil {
                                        counts[int(h)] = c
                                        if c > maxH {
                                                maxH = c
                                        }
                                }
                        }
                        hourly.Close()
                        fmt.Println("par heure de la journée (UTC) — le trafic est-il continu ou diurne ? :")
                        for h := 0; h < 24; h++ {
                                c := counts[h]
                                bar := 0
                                if maxH > 0 {
                                        bar = int(float64(c) / float64(maxH) * 34)
                                }
                                fmt.Printf("  %02dh %7d %s\n", h, c, strings.Repeat("█", bar))
                        }
                }
        }
        // AuditLog : pas de purge connue → ancienneté approximative du projet.
        var auditCnt int64
        var auditMin *string
        if err := conn.QueryRow(ctx,
                `SELECT to_char(min("createdAt"), 'YYYY-MM-DD'), count(*) FROM "AuditLog"`).
                Scan(&auditMin, &auditCnt); err == nil && auditMin != nil {
                fmt.Printf("AuditLog : %d entrées, plus ancienne : %s (ancienneté approx. du projet)\n", auditCnt, *auditMin)
        } else {
                fmt.Println("AuditLog : (non lisible ou vide — ignoré)")
        }

        // ── 5. Latences par endpoint ──────────────────────────────────────────
        section("5. LATENCES PAR ENDPOINT (depuis CETTE machine)")
        probeEndpoint(ctx, "direct ", directURL, false)
        probeEndpoint(ctx, "pooler ", poolerURL, true)

        // ── 6. Synthèse CU-heures ─────────────────────────────────────────────
        section("6. SYNTHÈSE POUR LE MODÈLE CU-HEURES NEON")
        fmt.Println("faits à raccorder au modèle (ops/db/cu_model.py) :")
        if statsReset != nil {
                fmt.Printf("  - compute actif sans interruption depuis au moins : %s\n", dur(time.Since(*statsReset)))
        }
        if oldest != nil {
                fmt.Printf("  - plus ancienne connexion encore ouverte           : %s\n", dur(time.Since(*oldest)))
        }
        fmt.Println("  - formule officielle Neon : CU-h = CU moyen × heures actives")
        fmt.Println("  - à 0,25 CU (défaut Free) : 100 CU-h ≈ 400 h d'activité/mois (≈ 13 h/jour)")
        fmt.Println("  - au-delà du quota Free  : compute SUSPENDU jusqu'au cycle suivant (aucune grâce)")
}

// probeEndpoint mesure : (a) 3 connexions complètes de bout en bout, puis
// (b) 20 « SELECT 1 » sur une connexion tenue (RTT applicatif pur).
// Le mode Exec est imposé sur le pooler (PgBouncer transaction mode refuse
// les prepared statements réutilisés entre connexions serveur).
func probeEndpoint(ctx context.Context, label, dsn string, forceExecMode bool) {
        if dsn == "" {
                fmt.Printf("  %s : (DSN non fourni — ignoré)\n", label)
                return
        }
        cfg, err := pgx.ParseConfig(dsn)
        if err != nil {
                fmt.Printf("  %s : DSN invalide (%v) — ignoré\n", label, err)
                return
        }
        if forceExecMode {
                cfg.DefaultQueryExecMode = pgx.QueryExecModeExec
        }
        var connects []time.Duration
        var c *pgx.Conn
        for i := 0; i < 3; i++ {
                t := time.Now()
                cc, err := pgx.ConnectConfig(ctx, cfg)
                if err != nil {
                        fmt.Printf("  %s : connexion impossible (%v)\n", label, err)
                        return
                }
                connects = append(connects, time.Since(t))
                if c != nil {
                        _ = c.Close(ctx)
                }
                c = cc
        }
        defer func() { _ = c.Close(ctx) }()
        fmt.Printf("  %s : host=%s | connexions complètes ×3 : min=%s max=%s\n",
                label, hostOf(dsn), dur(quantile(connects, 0)), dur(quantile(connects, 1)))
        var durs []time.Duration
        var one int
        for i := 0; i < 20; i++ {
                t := time.Now()
                if err := c.QueryRow(ctx, "SELECT 1").Scan(&one); err != nil {
                        fmt.Printf("  %s : requête %d en échec : %v\n", label, i+1, err)
                        return
                }
                durs = append(durs, time.Since(t))
        }
        fmt.Printf("  %s : SELECT 1 ×20 : min=%s p50=%s p95=%s max=%s\n",
                label, dur(quantile(durs, 0)), dur(quantile(durs, 0.5)), dur(quantile(durs, 0.95)), dur(quantile(durs, 1)))
}
