package monitoring

// infra.go — SECT-INFRA-MONITOR-1 (11 octobre 2026) : monitoring
// d'INFRASTRUCTURE hybride pour la console super admin (addendum
// ADR-0012 — le module P5 regardait l'APPLICATION : requêtes, score,
// workers ; il ne voyait RIEN de l'infrastructure décisionnelle de
// l'option C : réplique 5433, backups chiffrés, VM, DR voie D).
//
// PRINCIPE DIRECTEUR (ADR-0013 §13.3, leçon de la sonde) : RIEN ici ne
// réveille Neon. Toutes les mesures viennent de :
//   - la RÉPLIQUE locale (cluster 5433, 0 CU — fenêtres grille M1) ;
//   - /proc & statfs (la VM elle-même — gratuit) ;
//   - fichiers d'état du pipeline backup (last_success, markers
//     restore-ok-* — staging /var/lib/sect-backup monté ro via compose) ;
//   - le CONTROL PLANE Neon (API console — ne touche PAS le compute),
//     UNIQUEMENT pour l'endpoint on-demand /api/monitoring/infra avec
//     cache 5 min : jamais dans la boucle de l'AlertingWorker.
//
// Métriques ajoutées au catalogue (règles système migration 000136) :
//   - replica_lag_min : fraîcheur des données répliquées (RPO vécu) —
//     now() − max("createdAt") de RequestLog SUR LA RÉPLIQUE ;
//   - backup_age_h   : âge du dernier backup chiffré (voie B) —
//     alignée sur le watchdog §5-3 du runbook (36 h) ;
//   - disk_free_pct  : disque libre de la VM (le maillon fragile,
//     ADR-0013 §3 — un disque plein tuerait API + réplique + DR).
//
// Dégradation honnête : chaque sonde absente (réplique non configurée,
// staging non monté, Render standby) rend sa métrique INDISPONIBLE
// (ok=false dans Value) — jamais 0 silencieux : une règle ne peut pas
// se déclencher sur une mesure qui n'existe pas.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// infraStartedAt — boot du process API (uptime).
var infraStartedAt = time.Now()

// ─── Structures mesurées (contrat GET /api/monitoring/infra) ───

// APIInfo — runtime Go de l'instance API interrogée.
type APIInfo struct {
	UptimeS    float64 `json:"uptimeS"`
	Goroutines int     `json:"goroutines"`
	HeapMB     float64 `json:"heapMB"`
	NumCPU     int     `json:"numCPU"`
}

// VMInfo — la VM hôte vue depuis le conteneur (procfs n'est pas
// namespacé pour meminfo/loadavg/uptime : ce sont les VALEURS HÔTE ;
// statfs("/") reflète le disque hôte derrière l'overlay).
type VMInfo struct {
	UptimeS        float64 `json:"uptimeS"`
	Load1          float64 `json:"load1"`
	Load5          float64 `json:"load5"`
	Load15         float64 `json:"load15"`
	CPUs           int     `json:"cpus"`
	DiskTotalBytes uint64  `json:"diskTotalBytes"`
	DiskFreeBytes  uint64  `json:"diskFreeBytes"`
	DiskFreePct    float64 `json:"diskFreePct"`
	MemTotalBytes  uint64  `json:"memTotalBytes"`
	MemFreeBytes   uint64  `json:"memFreeBytes"`
	MemFreePct     float64 `json:"memFreePct"`
}

// ReplicaInfo — état de la réplique logique sect_replica (cluster
// 5433). DataFreshnessMin est le RPO VÉCU (âge de la donnée la plus
// récente répliquée) ; LastApplyMin l'âge du dernier WAL appliqué
// (vue pg_stat_subscription, lisible sans privilège superuser).
type ReplicaInfo struct {
	Up               bool      `json:"up"`
	Err              string    `json:"err,omitempty"`
	CollectedAt      time.Time `json:"collectedAt"`
	DataFreshnessMin *float64  `json:"dataFreshnessMin,omitempty"` // RPO vécu
	LastApplyMin     *float64  `json:"lastApplyMin,omitempty"`
	ActiveWorkers    int       `json:"activeWorkers"`
	TablesApp        int       `json:"tablesApp"` // tables applicatives présentes (84 attendues)
	DBSizeMB         int64     `json:"dbSizeMB"`
}

// BackupInfo — état du pipeline backup lu depuis le staging monté en
// lecture seule (/state/backup = /var/lib/sect-backup côté hôte) :
// last_success (timestamp ISO) et markers restore-ok-<mois> écrits par
// sect_backup.sh / sect_restore_test.sh. Le watchdog 12:32 reste LE
// canal Discord ; ici c'est la VISIBILITÉ console.
type BackupInfo struct {
	Readable        bool       `json:"readable"`
	Err             string     `json:"err,omitempty"`
	LastSuccessAt   *time.Time `json:"lastSuccessAt,omitempty"`
	AgeH            *float64   `json:"ageH,omitempty"`
	LastRestoreTest string     `json:"lastRestoreTest,omitempty"` // marker YYYY-MM
}

// InfraSnapshot — une mesure complète (réplique + VM + backups + API).
type InfraSnapshot struct {
	CollectedAt time.Time    `json:"collectedAt"`
	API         APIInfo      `json:"api"`
	VM          VMInfo       `json:"vm"`
	Replica     *ReplicaInfo `json:"replica,omitempty"` // nil = non configurée (flag OFF)
	Backups     *BackupInfo  `json:"backups,omitempty"` // nil = staging illisible
}

// ─── Collecte ───

// CollectInfra mesure l'infrastructure locale. Best-effort total :
// chaque sonde qui échoue dégrade SA section (Err renseigné), jamais
// l'ensemble. claims servent uniquement le passage WithTx sur la
// réplique (policies TO PUBLIC — cohérence de pattern avec les autres
// lectures réplique).
func CollectInfra(ctx context.Context, replicaPool *pgxpool.Pool, claims appdb.SessionClaims, backupStateDir string) InfraSnapshot {
	s := InfraSnapshot{CollectedAt: time.Now().UTC()}
	s.API = collectAPI()
	s.VM = collectVM()
	if replicaPool != nil {
		s.Replica = collectReplica(ctx, replicaPool, claims)
	}
	s.Backups = collectBackups(backupStateDir)
	return s
}

// CollectInfraPtr — variante pointeur pour l'usage inline (worker,
// handlers) : nil n'est JAMAIS retourné (une InfraSnapshot vide est
// valide — les sondes absentes dégradent leurs sections).
func CollectInfraPtr(ctx context.Context, replicaPool *pgxpool.Pool, claims appdb.SessionClaims, backupStateDir string) *InfraSnapshot {
	s := CollectInfra(ctx, replicaPool, claims, backupStateDir)
	return &s
}

// collectAPI — runtime Go.
func collectAPI() APIInfo {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return APIInfo{
		UptimeS:    time.Since(infraStartedAt).Seconds(),
		Goroutines: runtime.NumGoroutine(),
		HeapMB:     float64(ms.HeapAlloc) / (1024 * 1024),
		NumCPU:     runtime.NumCPU(),
	}
}

// collectVM — /proc + statfs (valeurs HÔTE).
func collectVM() VMInfo {
	var v VMInfo
	v.CPUs = runtime.NumCPU()

	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		var up float64
		if _, err := fmt.Sscanf(strings.TrimSpace(string(b)), "%f", &up); err == nil {
			v.UptimeS = up
		}
	}
	if b, err := os.ReadFile("/proc/loadavg"); err == nil {
		_, _ = fmt.Sscanf(string(b), "%f %f %f", &v.Load1, &v.Load5, &v.Load15)
	}
	if b, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			var kb uint64
			switch {
			case strings.HasPrefix(line, "MemTotal:"):
				if n, _ := fmt.Sscanf(line, "MemTotal: %d kB", &kb); n == 1 {
					v.MemTotalBytes = kb * 1024
				}
			case strings.HasPrefix(line, "MemAvailable:"):
				if n, _ := fmt.Sscanf(line, "MemAvailable: %d kB", &kb); n == 1 {
					v.MemFreeBytes = kb * 1024
				}
			}
		}
		if v.MemTotalBytes > 0 {
			v.MemFreePct = float64(v.MemFreeBytes) / float64(v.MemTotalBytes) * 100
		}
	}

	var st syscall.Statfs_t
	if err := syscall.Statfs("/", &st); err == nil {
		v.DiskTotalBytes = uint64(st.Blocks) * uint64(st.Bsize)
		v.DiskFreeBytes = uint64(st.Bfree) * uint64(st.Bsize)
		if v.DiskTotalBytes > 0 {
			v.DiskFreePct = float64(v.DiskFreeBytes) / float64(v.DiskTotalBytes) * 100
		}
	}
	return v
}

// collectReplica — 4 requêtes LOCALES sur 5433 (0 CU Neon). La fraîcheur
// des DONNÉES (max createdAt RequestLog) est le RPO vécu : elle ne
// demande aucun privilège catalogue — les policies RequestLog sont TO
// PUBLIC (000133) et le rôle applicatif local a SELECT (grants phase 3).
func collectReplica(ctx context.Context, pool *pgxpool.Pool, claims appdb.SessionClaims) *ReplicaInfo {
	ri := &ReplicaInfo{CollectedAt: time.Now().UTC()}

	err := appdb.WithTx(ctx, pool, claims, func(tx pgx.Tx) error {
		// 1. RPO vécu : âge de la donnée la plus récente répliquée.
		var freshness *float64
		var nullOK any
		if err := tx.QueryRow(ctx, `
                        SELECT EXTRACT(EPOCH FROM (now() - max("createdAt"))) / 60.0
                        FROM "RequestLog"
                `).Scan(&nullOK); err == nil && nullOK != nil {
			if f, ok := nullOK.(float64); ok {
				freshness = &f
			}
		}
		ri.DataFreshnessMin = freshness

		// 2. Dernier WAL appliqué + workers actifs (vue stats publique).
		var lastApply any
		if err := tx.QueryRow(ctx, `
                        SELECT max(latest_end_time), count(pid) FROM pg_stat_subscription
                `).Scan(&lastApply, &ri.ActiveWorkers); err == nil && lastApply != nil {
			if t, ok := lastApply.(time.Time); ok {
				min := time.Since(t).Minutes()
				if min < 0 {
					min = 0
				}
				ri.LastApplyMin = &min
			}
		}

		// 3. Tables applicatives présentes (84 attendues — publication
		//    sect_poc élargie SECT-OPS-1 ; schema_migrations tenu localement
		//    par golang-migrate, jamais répliquée).
		_ = tx.QueryRow(ctx, `
                        SELECT count(*) FROM pg_class
                        WHERE relkind = 'r'
                          AND relnamespace = 'public'::regnamespace
                          AND relname <> 'schema_migrations'
                `).Scan(&ri.TablesApp)

		// 4. Taille de la base réplique.
		_ = tx.QueryRow(ctx, `SELECT pg_database_size(current_database()) / (1024 * 1024)`).Scan(&ri.DBSizeMB)
		return nil
	})

	if err != nil {
		ri.Up = false
		ri.Err = err.Error()
		return ri
	}
	ri.Up = true
	return ri
}

// collectBackups — lecture du staging (monté ro : /state/backup).
func collectBackups(stateDir string) *BackupInfo {
	bi := &BackupInfo{}
	if stateDir == "" {
		return nil
	}
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		bi.Err = "staging illisible : " + err.Error()
		return bi
	}
	bi.Readable = true

	// last_success — timestamp ISO écrit par sect_backup.sh (§9).
	if b, err := os.ReadFile(stateDir + "/last_success"); err == nil {
		line := strings.TrimSpace(string(b))
		if t, err := time.Parse(time.RFC3339, line); err == nil {
			bi.LastSuccessAt = &t
			age := time.Since(t).Hours()
			bi.AgeH = &age
		}
	} else {
		bi.Err = "aucun last_success (pipeline jamais exécuté ?)"
	}

	// markers restore-ok-<YYYY-MM> — sect_restore_test.sh (§6).
	last := ""
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "restore-ok-") {
			m := strings.TrimPrefix(name, "restore-ok-")
			if m > last {
				last = m
			}
		}
	}
	bi.LastRestoreTest = last
	return bi
}

// ─── Control plane Neon (OPTIONNEL — ne réveille PAS le compute) ───

// NeonStatus — état vu du control plane : endpoint (idle/active) et
// consommation CU du cycle + des dernières 24 h. API console
// UNIQUEMENT (jamais le DSN de données — discipline §13.3 : un ping
// data toutes les N minutes rendormirait le compute à chaque fois).
type NeonStatus struct {
	Configured    bool      `json:"configured"`
	ProjectID     string    `json:"projectId,omitempty"`
	EndpointState string    `json:"endpointState,omitempty"` // idle | active | ""
	Compute24hS   float64   `json:"compute24hS"`
	CycleFrom     time.Time `json:"cycleFrom,omitempty"`
	CycleComputeS float64   `json:"cycleComputeS"`
	QuotaCUS      float64   `json:"quotaCUS"` // 100 CU-h Free (informatif)
	Err           string    `json:"err,omitempty"`
	MeasuredAt    time.Time `json:"measuredAt"`
}

const (
	neonAPIBase  = "https://console.neon.tech/api/v2"
	neonCacheTTL = 5 * time.Minute
)

// neonCache — cache process-wide (2 appels HTTP max toutes les 5 min,
// même si plusieurs admins laissent la console ouverte).
var neonCache = struct {
	sync.Mutex
	at     time.Time
	status *NeonStatus
}{}

// NeonControlPlane interroge l'API console (endpoints + consumption).
// apiKey/projectID vides → Configured=false (dégradation affichée).
func NeonControlPlane(ctx context.Context, apiKey, projectID string) NeonStatus {
	if apiKey == "" || projectID == "" {
		return NeonStatus{Configured: false, MeasuredAt: time.Now().UTC()}
	}

	neonCache.Lock()
	defer neonCache.Unlock()
	if neonCache.status != nil && time.Since(neonCache.at) < neonCacheTTL {
		return *neonCache.status
	}

	st := NeonStatus{
		Configured: true,
		ProjectID:  projectID,
		QuotaCUS:   100,
		MeasuredAt: time.Now().UTC(),
	}
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. État de l'endpoint (sans le réveiller — lecture catalogue).
	if body, err := neonGet(ctx, client, apiKey,
		fmt.Sprintf("%s/projects/%s/endpoints", neonAPIBase, projectID)); err != nil {
		st.Err = "endpoints: " + err.Error()
	} else {
		var out struct {
			Endpoints []struct {
				State string `json:"state"`
			} `json:"endpoints"`
		}
		if err := json.Unmarshal(body, &out); err == nil {
			for _, e := range out.Endpoints {
				if e.State != "" {
					st.EndpointState = e.State
					break
				}
			}
		}
	}

	// 2. Consommation — cycle courant (1er du mois UTC) + 24 h glissantes.
	now := time.Now().UTC()
	cycleFrom := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if secs, err := neonConsumption(ctx, client, apiKey, projectID, cycleFrom, now); err == nil {
		st.CycleFrom = cycleFrom
		st.CycleComputeS = secs
	}
	if secs, err := neonConsumption(ctx, client, apiKey, projectID, now.Add(-24*time.Hour), now); err == nil {
		st.Compute24hS = secs
	} else if st.Err == "" {
		st.Err = "consumption: " + err.Error()
	}

	neonCache.status = &st
	neonCache.at = time.Now()
	return st
}

func neonGet(ctx context.Context, client *http.Client, apiKey, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
}

// neonConsumption — compute_time_seconds agrégé sur [from, to].
func neonConsumption(ctx context.Context, client *http.Client, apiKey, projectID string, from, to time.Time) (float64, error) {
	url := fmt.Sprintf("%s/projects/%s/consumption?from=%s&to=%s",
		neonAPIBase, projectID,
		from.Format(time.RFC3339), to.Format(time.RFC3339))
	body, err := neonGet(ctx, client, apiKey, url)
	if err != nil {
		return 0, err
	}
	var out struct {
		ComputeTimeSeconds float64 `json:"compute_time_seconds"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return 0, err
	}
	return out.ComputeTimeSeconds, nil
}
