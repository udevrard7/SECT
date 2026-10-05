// Package monitoring — échantillonnage des requêtes API (ADR-0012 §3).
//
// SECT-MONITORING-P5-1 : p50/p95 par endpoint. Le middleware de
// monitoring échantillonne chaque requête /api/* (route normalisée au
// pattern chi — les UUID deviennent {id}) dans une file async ; ce
// sampler insère par batch (unnest) sous claims system et purge au-delà
// de 7 jours (télémétrie jetable — index createdAt, purge horaire).
//
// Résilience (pattern Recorder) : file bufferée (2000), drop-dégradé —
// une requête HTTP ne bloque JAMAIS sur l'écriture de télémétrie, et
// une DB lente n'accumule pas de mémoire.
package monitoring

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// requestSample — un échantillon (une requête API).
type requestSample struct {
	Method     string
	Route      string
	Status     int
	DurationMs int
	At         time.Time
}

// RequestSampler — file async + worker d'écriture batchée + purge.
type RequestSampler struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
	queue  chan requestSample
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// requestLogRetention — rétention de la télémétrie (7 jours).
const requestLogRetentionDays = 7

// NewRequestSampler crée le sampler et démarre le worker goroutine.
func NewRequestSampler(pool *pgxpool.Pool, logger *slog.Logger) *RequestSampler {
	ctx, cancel := context.WithCancel(context.Background())
	s := &RequestSampler{
		pool:   pool,
		logger: logger,
		queue:  make(chan requestSample, 2000),
		ctx:    ctx,
		cancel: cancel,
	}
	s.wg.Add(1)
	go s.worker()
	return s
}

// Sample enregistre un échantillon (non-bloquant, drop si pleine).
func (s *RequestSampler) Sample(method, route string, status, durationMs int) {
	if s == nil {
		return
	}
	select {
	case s.queue <- requestSample{Method: method, Route: route, Status: status, DurationMs: durationMs, At: time.Now().UTC()}:
	default:
		// Drop silencieux (le Recorder logge déjà ses drops — ici on
		// évite le spam sous charge : la télémétrie est best-effort).
	}
}

// Shutdown arrête le sampler (flush best-effort).
func (s *RequestSampler) Shutdown() {
	if s == nil {
		return
	}
	s.cancel()
	s.wg.Wait()
}

// worker consomme la file : batch de 100 max ou fenêtre de 2 s (flush
// même à faible trafic — le p95 "1 h" ne doit pas dépendre du volume),
// puis purge horaire de la rétention.
func (s *RequestSampler) worker() {
	defer s.wg.Done()

	batch := make([]requestSample, 0, 100)
	lastPurge := time.Time{} // purge immédiate au boot (rattrapage)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := s.writeBatch(batch); err != nil && s.logger != nil {
			s.logger.Error("RequestSampler: batch insert échoué",
				"error", err, "samples", len(batch))
		}
		batch = batch[:0]
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	purgeTicker := time.NewTicker(1 * time.Hour)
	defer purgeTicker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			flush()
			return
		case sample := <-s.queue:
			batch = append(batch, sample)
			if len(batch) >= 100 {
				flush()
			}
		case <-ticker.C:
			flush()
			if time.Since(lastPurge) >= time.Hour {
				lastPurge = time.Now()
				if err := s.purge(); err != nil && s.logger != nil {
					s.logger.Error("RequestSampler: purge échouée", "error", err)
				}
			}
		case <-purgeTicker.C:
			if time.Since(lastPurge) >= time.Hour {
				lastPurge = time.Now()
				if err := s.purge(); err != nil && s.logger != nil {
					s.logger.Error("RequestSampler: purge échouée", "error", err)
				}
			}
		}
	}
}

// writeBatch insère les échantillons en une requête (unnest) sous
// claims system (policy RequestLog_insert = is_system).
func (s *RequestSampler) writeBatch(batch []requestSample) error {
	if s.pool == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	methods := make([]string, len(batch))
	routes := make([]string, len(batch))
	statuses := make([]int, len(batch))
	durations := make([]int, len(batch))
	ats := make([]time.Time, len(batch))
	for i, b := range batch {
		methods[i], routes[i], statuses[i], durations[i], ats[i] = b.Method, b.Route, b.Status, b.DurationMs, b.At
	}

	return appdb.WithSystemTx(ctx, s.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO "RequestLog" ("method", "route", "status", "durationMs", "createdAt")
			SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::timestamptz[])
		`, methods, routes, statuses, durations, ats)
		return err
	})
}

// purge supprime la télémétrie au-delà de la rétention (claims system —
// policy RequestLog_delete = is_system).
func (s *RequestSampler) purge() error {
	if s.pool == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return appdb.WithSystemTx(ctx, s.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			DELETE FROM "RequestLog"
			WHERE "createdAt" < now() - make_interval(days => $1::int)
		`, requestLogRetentionDays)
		return err
	})
}
