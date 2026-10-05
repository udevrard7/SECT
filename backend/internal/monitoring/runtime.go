// Package monitoring — métriques runtime du process Go (ADR-0011 §3).
//
// SECT-MONITORING-ALIGN-1 : aucune métrique runtime n'était exposée
// (uptime, goroutines, mémoire, GC). L'onglet « Système » de /monitoring
// les affiche désormais via GET /api/monitoring/overview.
package monitoring

import (
	"runtime"
	"time"
)

// processStart — démarrage du process (capturé au chargement du package).
var processStart = time.Now()

// RuntimeMetrics — instantané des métriques du process.
type RuntimeMetrics struct {
	UptimeSeconds  int64   `json:"uptimeSeconds"`
	GoVersion      string  `json:"goVersion"`
	Goroutines     int     `json:"goroutines"`
	NumCPU         int     `json:"numCPU"`
	MemAllocMB     float64 `json:"memAllocMB"`
	MemSysMB       float64 `json:"memSysMB"`
	NumGC          uint32  `json:"numGC"`
	GCPauseTotalMs float64 `json:"gcPauseTotalMs"`
}

// CollectRuntime retourne l'instantané runtime courant.
func CollectRuntime() RuntimeMetrics {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return RuntimeMetrics{
		UptimeSeconds:  int64(time.Since(processStart).Seconds()),
		GoVersion:      runtime.Version(),
		Goroutines:     runtime.NumGoroutine(),
		NumCPU:         runtime.NumCPU(),
		MemAllocMB:     float64(ms.Alloc) / (1024 * 1024),
		MemSysMB:       float64(ms.Sys) / (1024 * 1024),
		NumGC:          ms.NumGC,
		GCPauseTotalMs: float64(ms.PauseTotalNs) / 1e6,
	}
}

// Uptime — durée de vie du process (exposée aussi au healthcheck).
func Uptime() time.Duration {
	return time.Since(processStart)
}
