// Package monitoring — Event Recorder automatique pour MonitoringEvent.
//
// Bug B1 (CRITICAL, audit monitoring 2025) : la table MonitoringEvent était
// vide à vie car aucun code Go n'écrivait automatiquement d'événements.
//
// Ce package fournit un EventRecorder qui peut être appelé depuis :
//   - middleware HTTP (erreurs 5xx, panics)
//   - workers (échecs IA, timeouts DB)
//   - hooks métier (AIFailoverEvent, échecs auth)
//
// L'écriture est asynchrone (channel bufferé) pour ne jamais bloquer la requête
// HTTP principale. En cas de crash, les événements en attente sont perdus —
// acceptable pour un monitoring best-effort.
package monitoring

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Event represents un événement de monitoring à enregistrer.
type Event struct {
	Type     string // API | DATABASE | AUTH | EVALUATION | PAYMENT | SYSTEM
	Severite string // INFO | WARNING | ERROR | CRITICAL
	Message  string
	Source   string
	Details  string // JSON stringifié (peut être vide)
	Duree    *int   // durée en ms (optionnel)
}

// Recorder enregistre les événements de monitoring de manière asynchrone.
type Recorder struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
	queue  chan Event
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewRecorder crée un nouveau Recorder et démarre le worker goroutine.
// Le buffer est de 500 événements — au-delà, les événements sont droppés
// (logged warning) pour éviter la pression mémoire.
func NewRecorder(pool *pgxpool.Pool, logger *slog.Logger) *Recorder {
	ctx, cancel := context.WithCancel(context.Background())
	r := &Recorder{
		pool:   pool,
		logger: logger,
		queue:  make(chan Event, 500),
		ctx:    ctx,
		cancel: cancel,
	}
	r.wg.Add(1)
	go r.worker()
	return r
}

// Record enqueue un événement de monitoring (non-bloquant).
// Si la queue est pleine, l'événement est droppé + log warning.
func (r *Recorder) Record(evt Event) {
	if r == nil {
		return
	}
	select {
	case r.queue <- evt:
	default:
		if r.logger != nil {
			r.logger.Warn("monitoring event dropped (queue full)",
				"type", evt.Type, "severite", evt.Severite, "message", evt.Message)
		}
	}
}

// RecordError raccourci pour enregistrer une erreur (severite ERROR).
func (r *Recorder) RecordError(eventType, message, source string) {
	r.Record(Event{
		Type:     eventType,
		Severite: "ERROR",
		Message:  message,
		Source:   source,
	})
}

// RecordCritical raccourci pour enregistrer un événement critique.
func (r *Recorder) RecordCritical(eventType, message, source string) {
	r.Record(Event{
		Type:     eventType,
		Severite: "CRITICAL",
		Message:  message,
		Source:   source,
	})
}

// RecordWarning raccourci pour enregistrer un avertissement.
func (r *Recorder) RecordWarning(eventType, message, source string) {
	r.Record(Event{
		Type:     eventType,
		Severite: "WARNING",
		Message:  message,
		Source:   source,
	})
}

// RecordInfo raccourci pour enregistrer un événement d'information.
func (r *Recorder) RecordInfo(eventType, message, source string) {
	r.Record(Event{
		Type:     eventType,
		Severite: "INFO",
		Message:  message,
		Source:   source,
	})
}

// worker consomme la queue et écrit les événements en DB.
func (r *Recorder) worker() {
	defer r.wg.Done()
	for {
		select {
		case <-r.ctx.Done():
			// Flush remaining events before shutdown
			r.flushQueue()
			return
		case evt := <-r.queue:
			if err := r.writeEvent(evt); err != nil {
				if r.logger != nil {
					r.logger.Error("failed to write monitoring event",
						"error", err, "type", evt.Type, "severite", evt.Severite)
				}
			}
		}
	}
}

// flushQueue vide la queue au shutdown (best-effort, 5s timeout).
func (r *Recorder) flushQueue() {
	timeout := time.After(5 * time.Second)
	for {
		select {
		case evt := <-r.queue:
			_ = r.writeEvent(evt)
		case <-timeout:
			return
		default:
			return
		}
	}
}

// writeEvent insère un événement dans MonitoringEvent.
// Utilise claims system-worker (is_system() = true) pour bypass RLS.
func (r *Recorder) writeEvent(evt Event) error {
	if r.pool == nil {
		return fmt.Errorf("db pool not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Claims system-worker pour bypass RLS (policy insert_system WITH CHECK(true))
	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
		return fmt.Errorf("set claims: %w", err)
	}

	id := "mon-" + uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO "MonitoringEvent" ("id", "type", "severite", "message", "details", "source", "duree", "statut", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, NULLIF($5, '')::text, NULLIF($6, '')::text, $7, 'ACTIF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`,
		id, evt.Type, evt.Severite, evt.Message,
		evt.Details, evt.Source, evt.Duree,
	)
	if err != nil {
		return fmt.Errorf("insert monitoring event: %w", err)
	}

	return tx.Commit(ctx)
}

// Shutdown arrête proprement le recorder (flush la queue).
func (r *Recorder) Shutdown() {
	if r == nil {
		return
	}
	r.cancel()
	r.wg.Wait()
}
