package http

// monitoring_overview_handlers.go — GET /api/monitoring/overview (ADR-0011).
//
// SECT-MONITORING-ALIGN-1 : le « couteau suisse » de l'admin système.
// Une seule réponse assemblée :
//
//      score      — score santé plateforme (MÊME formule que /api/stats/admin
//                   champ "health" : internal/monitoring/score.go, une seule
//                   source de vérité côté backend — alignement dashboard ↔
//                   /monitoring)
//      kpis       — compteurs événements + autorisations + KPIs sécurité réels
//      runtime    — uptime process, goroutines, mémoire, GC, version Go
//      db         — statut + latence ping + connexions actives
//      storage    — R2 configuré/joignable + bucket
//      ai         — providers IA actifs
//      maintenance — mode maintenance (PlatformSettings)
//      workers    — registre des 13 workers (runs/erreurs/dernier run)
//      trend      — événements par jour et sévérité sur 7 jours
//
// Caveat documenté (ADR-0011 §3) : la tendance est calculée sur
// MonitoringEvent ; les RESOLU > 24 h sont purgés par le lazy cleanup →
// les jours passés sous-comptent les événements résolus entre-temps.

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/monitoring"
	"github.com/udevrard7/sect/backend/internal/storage"
)

// overviewTrendPoint — un jour de la tendance 7 jours.
type overviewTrendPoint struct {
	Date     string `json:"date"` // YYYY-MM-DD
	Critical int    `json:"critical"`
	Error    int    `json:"error"`
	Warning  int    `json:"warning"`
	Info     int    `json:"info"`
}

// monitoringOverview — GET /api/monitoring/overview
func (s *Server) monitoringOverview(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// ─── SECT-LATENCY-3 : blocs parallélisés ───
	// Les 7 blocs ci-dessous étaient SÉQUENTIELS — ~7 allers-retours cumulés
	// (Neon ~20ms chacun + fonction sécurité lourde + R2 réseau) = 0,9-1,4s
	// mesurés en prod pour CHAQUE appel de la console (poll 60s). Chaque bloc
	// écrit des variables DISJOINTES → parallélisation sûre par WaitGroup,
	// sans mutex. La latence devient max(blocs) au lieu de somme(blocs).
	var (
		activeCount, criticalCount, errorCount, warningCount int
		resolvedToday, resolved24h                           int
		autEnAttente, autActives                             int
		providersActifs                                      int
	)
	dbDown := false
	var dbLatencyMs int64
	var activeConns int
	etabProteges, etabVerification := 0, 0
	trend := []overviewTrendPoint{}
	storageInfo := map[string]any{"configured": false, "reachable": false, "bucket": ""}
	maintenanceActive := false
	maintenanceMessage := ""
	replicaInfo := map[string]any{"enabled": false}

	var wg sync.WaitGroup
	wg.Add(7)

	// Bloc A — KPIs événements + autorisations + providers IA (une tx).
	go func() {
		defer wg.Done()
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			_ = tx.QueryRow(r.Context(), `
				SELECT
					count(*) FILTER (WHERE "statut" = 'ACTIF'),
					count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'CRITICAL'),
					count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'ERROR'),
					count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'WARNING'),
					count(*) FILTER (WHERE "statut" = 'RESOLU' AND "resoluLe" >= CURRENT_DATE),
					count(*) FILTER (WHERE "statut" = 'RESOLU' AND "resoluLe" >= NOW() - INTERVAL '24 hours')
				FROM "MonitoringEvent"
			`).Scan(&activeCount, &criticalCount, &errorCount, &warningCount, &resolvedToday, &resolved24h)

			_ = tx.QueryRow(r.Context(), `
				SELECT
					count(*) FILTER (WHERE "statut" = 'EN_ATTENTE'),
					count(*) FILTER (WHERE "statut" = 'APPROUVE')
				FROM "EtablissementAccess"
			`).Scan(&autEnAttente, &autActives)

			_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "AIProviderConfig" WHERE "isActive" = true`).Scan(&providersActifs)
			return nil
		})
	}()

	// Bloc B — KPIs sécurité réels (helper SECURITY DEFINER 000132, re-check claims).
	go func() {
		defer wg.Done()
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), `SELECT proteges, verification FROM admin_securite_etablissements_counts()`).Scan(&etabProteges, &etabVerification)
		})
	}()

	// Bloc C — DB : latence ping + connexions actives.
	go func() {
		defer wg.Done()
		pingStart := time.Now()
		if err := s.dbPool.Ping(r.Context()); err != nil {
			dbDown = true
		} else {
			dbLatencyMs = time.Since(pingStart).Milliseconds()
			_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
				_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`).Scan(&activeConns)
				return nil
			})
		}
	}()

	// Bloc D — Réplique locale (ADR-0013 §6 Phase 3) : état du flag + latence.
	// nil-safe par conception : flag OFF → "replica": {"enabled": false}
	// (visible dans l'onglet Système — jamais de silence feint).
	go func() {
		defer wg.Done()
		if s.replicaPool != nil {
			info := map[string]any{"enabled": true, "source": "sect_replica@5433", "analyticsReadSource": s.replicaReadSource()}
			rStart := time.Now()
			if err := s.replicaPool.Ping(r.Context()); err != nil {
				info["up"] = false
			} else {
				info["up"] = true
				info["latencyMs"] = time.Since(rStart).Milliseconds()
			}
			replicaInfo = info
		}
	}()

	// Bloc E — Tendance 7 jours.
	go func() {
		defer wg.Done()
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			rows, err := tx.Query(r.Context(), `
				SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
					count(e."id") FILTER (WHERE e."severite" = 'CRITICAL'),
					count(e."id") FILTER (WHERE e."severite" = 'ERROR'),
					count(e."id") FILTER (WHERE e."severite" = 'WARNING'),
					count(e."id") FILTER (WHERE e."severite" = 'INFO')
				FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') AS d(day)
				LEFT JOIN "MonitoringEvent" e
					ON date_trunc('day', e."createdAt") = d.day
				GROUP BY d.day
				ORDER BY d.day
			`)
			if err != nil {
				return nil
			}
			defer rows.Close()
			for rows.Next() {
				var p overviewTrendPoint
				if err := rows.Scan(&p.Date, &p.Critical, &p.Error, &p.Warning, &p.Info); err == nil {
					trend = append(trend, p)
				}
			}
			return nil
		})
	}()

	// Bloc F — Stockage R2 (type-assertion : seul R2Client a un Health réel).
	go func() {
		defer wg.Done()
		if s.storage != nil {
			info := map[string]any{"configured": true}
			if r2c, ok := s.storage.(*storage.R2Client); ok {
				info["bucket"] = r2c.BucketName()
				hctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
				if err := r2c.Health(hctx); err == nil {
					info["reachable"] = true
				} else {
					info["reachable"] = false
				}
				cancel()
			}
			storageInfo = info
		}
	}()

	// Bloc G — Mode maintenance (PlatformSettings singleton — pattern maintenanceStatus).
	go func() {
		defer wg.Done()
		var settingsJSON string
		_ = appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), `SELECT "settings"::text FROM "PlatformSettings" WHERE "id" = 'default'`).Scan(&settingsJSON)
		})
		if settingsJSON != "" {
			var settings map[string]any
			if json.Unmarshal([]byte(settingsJSON), &settings) == nil {
				if general, ok := settings["general"].(map[string]any); ok {
					if mm, ok := general["maintenanceMode"].(bool); ok && mm {
						maintenanceActive = true
					}
					if msg, ok := general["maintenanceMessage"].(string); ok {
						maintenanceMessage = msg
					}
				}
			}
		}
	}()

	wg.Wait()

	// ─── Score santé (formule unique, partagée avec statsAdmin) ───
	score := monitoring.ComputeScore(monitoring.ScoreInputs{
		CriticalActifs:         criticalCount,
		ErrorActifs:            errorCount,
		WarningActifs:          warningCount,
		AutorisationsEnAttente: autEnAttente,
		DBIndisponible:         dbDown,
		DBLatencyMs:            dbLatencyMs,
		ProvidersIAActifs:      providersActifs,
		EtablissementsProteges: etabProteges,
	})

	// ─── Assemblage ───
	resp := map[string]any{
		"score": score,
		"kpis": map[string]any{
			"activeEvents":           activeCount,
			"criticalEvents":         criticalCount,
			"errorEvents":            errorCount,
			"warningEvents":          warningCount,
			"resolvedToday":          resolvedToday,
			"resolved24h":            resolved24h,
			"autorisationsEnAttente": autEnAttente,
			"autorisationsActives":   autActives,
			"etablissementsProteges": etabProteges,
			"verificationIdentite":   etabVerification,
		},
		"runtime":        monitoring.CollectRuntime(),
		"db":             map[string]any{"down": dbDown, "latencyMs": dbLatencyMs, "activeConns": activeConns},
		"replica":        replicaInfo,
		"storage":        storageInfo,
		"ai":             map[string]any{"providersActifs": providersActifs},
		"maintenance":    map[string]any{"active": maintenanceActive, "message": maintenanceMessage},
		"workers":        s.workerRegistry.Snapshot(), // nil-safe
		"workersEnabled": s.workersEnabled,            // SECT-OCI-HYBRID-1 : false = standby API-only
		"trend":          trend,
		"generatedAt":    time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
