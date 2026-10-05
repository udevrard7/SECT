// Package monitoring — registre de workers (ADR-0011 §4).
//
// SECT-MONITORING-ALIGN-1 : les 13 workers étaient invisibles (pas de
// registre, pas de statut — un worker périodique qui paniquait tuait le
// process). Le WorkerRegistry expose l'état des workers à l'onglet
// « Système » de /monitoring, et Track() rend les boucles périodiques
// panic-safe : le panic est attrapé, journalisé + enregistré en
// MonitoringEvent (SYSTEM/ERROR), et la boucle CONTINUE.
//
// Nil-safety : toutes les méthodes acceptent un récepteur nil (un worker
// sans registre se comporte comme avant) — indispensable pour ne pas
// toucher aux 27 signatures de constructeurs.
package monitoring

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// WorkerStatus — état d'un worker (sérialisable pour /overview).
type WorkerStatus struct {
	Name           string `json:"name"`           // identifiant (ex: "auto-close")
	Label          string `json:"label"`          // libellé affiché (ex: "Clôture auto des épreuves")
	Kind           string `json:"kind"`           // "periodique" | "file"
	IntervalLabel  string `json:"intervalLabel"`  // ex: "60 s", "événementiel"
	Runs           int64  `json:"runs"`           // nombre d'exécutions trackées
	Errors         int64  `json:"errors"`         // échecs (erreur retournée ou panic)
	LastRunAt      string `json:"lastRunAt"`      // RFC3339, "" si jamais
	LastDurationMs int64  `json:"lastDurationMs"` // durée de la dernière exécution
	LastError      string `json:"lastError"`      // dernier message d'erreur, "" si OK
	StartedAt      string `json:"startedAt"`      // enregistrement (RFC3339)
}

// workerEntry — état interne (champ mutable derrière mutex).
type workerEntry struct {
	status WorkerStatus
}

// WorkerRegistry — registre in-memory, thread-safe, nil-safe.
type WorkerRegistry struct {
	mu      sync.Mutex
	entries map[string]*workerEntry
	order   []string // ordre d'enregistrement (Snapshot trié)
	rec     *Recorder
}

// NewWorkerRegistry crée le registre. rec peut être nil (pas d'événements
// de monitoring sur échec worker — logs seulement).
func NewWorkerRegistry(rec *Recorder) *WorkerRegistry {
	return &WorkerRegistry{
		entries: make(map[string]*workerEntry),
		rec:     rec,
	}
}

// Register déclare un worker (kind "periodique" ou "file"). Idempotent :
// ré-enregistrer un nom existant met à jour libellé/intervalle sans
// perdre les stats. Nil-safe.
func (r *WorkerRegistry) Register(name, label, kind, intervalLabel string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if e, ok := r.entries[name]; ok {
		e.status.Label = label
		e.status.Kind = kind
		e.status.IntervalLabel = intervalLabel
		return
	}
	r.entries[name] = &workerEntry{status: WorkerStatus{
		Name: name, Label: label, Kind: kind, IntervalLabel: intervalLabel,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}}
	r.order = append(r.order, name)
}

// Track exécute fn en mesurant durée/erreurs/panics. En cas de panic :
// recover → événement SYSTEM/ERROR + log, la boucle appelante continue.
// Nil-safe (r == nil → fn exécutée telle quelle, sans instrumentation).
func (r *WorkerRegistry) Track(name string, fn func()) {
	if r == nil {
		fn()
		return
	}

	r.mu.Lock()
	e, ok := r.entries[name]
	r.mu.Unlock()
	if !ok {
		// Worker non déclaré : on l'enregistre à la volée (kind inconnu).
		r.Register(name, name, "periodique", "?")
		r.mu.Lock()
		e = r.entries[name]
		r.mu.Unlock()
	}

	start := time.Now()
	err := func() (err error) {
		defer func() {
			if rec := recover(); rec != nil {
				err = fmt.Errorf("panic: %v", rec)
			}
		}()
		fn()
		return nil
	}()
	duration := time.Since(start).Milliseconds()

	r.mu.Lock()
	e.status.Runs++
	e.status.LastRunAt = start.UTC().Format(time.RFC3339)
	e.status.LastDurationMs = duration
	if err != nil {
		e.status.Errors++
		e.status.LastError = err.Error()
	} else {
		e.status.LastError = ""
	}
	r.mu.Unlock()

	if err != nil {
		if r.rec != nil {
			r.rec.RecordError("SYSTEM",
				fmt.Sprintf("Worker %s : %s", name, err.Error()),
				"worker:"+name)
		}
	}
}

// Snapshot retourne une copie triée par ordre d'enregistrement.
// Nil-safe (retourne nil).
func (r *WorkerRegistry) Snapshot() []WorkerStatus {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]WorkerStatus, 0, len(r.order))
	for _, name := range r.order {
		out = append(out, r.entries[name].status)
	}
	return out
}

// TrackContext — variante de Track pour les fonctions prenant un contexte
// (les checkAndXxx des workers périodiques).
func (r *WorkerRegistry) TrackContext(ctx context.Context, name string, fn func(context.Context)) {
	r.Track(name, func() { fn(ctx) })
}
