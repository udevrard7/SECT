// Package http — submit_limiter.go
//
// SUBMIT-RATELIMIT-1 (OPT-7) : rate limiting du pic de soumission.
//
// PROBLÈME
// Quand N étudiants atteignent la fin du temps d'examen simultanément, tous
// déclenchent POST /api/sessions/{id}/submit au même instant (t=0). Chaque
// Submit effectue ~8-12 queries DB synchrones (session, épreuve, réponses,
// questions, auto-grading ×N, persistance scores, upsert résultat).
// Sur Render free (0,1 vCPU, timeout 30s/requête), la capacité réelle est
// ~6-7 submits/s. Au-delà, la queue gonfle, les requêtes attendent >30s,
// Render tue la connexion → 502 → l'étudiant réessaie → cascade → submit
// échoue et les réponses (encore en cache RAM) peuvent être perdues si
// l'instance redémarre.
//
// SOLUTION
// Un semaphore pondéré limite le nombre de submits traités CONCURREMMENT.
// Quand tous les slots sont pris, au lieu d'attendre (et risquer le timeout
// 30s), on renvoie immédiatement HTTP 202 Accepted + Retry-After. Le frontend
// réessaie après le délai indiqué. Le Submit est idempotent : si l'étudiant
// recommence, le usecase Submit détecte (sess.Statut != EN_COURS) et renvoie
// une erreur gérée — pas de double correction.
//
// Cette approche préserve l'UX (sous charge normale, traitement synchrone,
// résultat immédiat) tout en protégeant le pic (sous forte charge, étalement
// automatique via retry).
//
// CONFIGURATION
//   SUBMIT_MAX_CONCURRENT (défaut 5) — nombre de submits traités en parallèle.
//     5 est adapté à Render free (0,1 vCPU, ~6-7 submits/s théoriques, on
//     garde une marge). Sur Render Starter (0,5 vCPU), monter à 20-25.
//   SUBMIT_QUEUE_RETRY_AFTER (défaut 3s) — délai conseillé au frontend
//     quand la file est pleine. Assez court pour ne pas frustrer, assez
//     long pour vider ~15-20 submits du slot.
package http

import (
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// SubmitLimiter limite le nombre de soumissions d'examen traitées
// concurremment. Au-delà, renvoie 202 + Retry-After (pattern queue douce).
//
// Thread-safe. Compteur atomique pour éviter toute contention sur le hot path.
type SubmitLimiter struct {
	maxConcurrent int32
	active        int32 // nombre de submits en cours de traitement (atomic)
	queued        int32 // nombre de requêtes en attente de slot (atomic, pour observabilité)
	retryAfter    time.Duration
}

// NewSubmitLimiter crée un limiteur. maxConcurrent doit être > 0.
func NewSubmitLimiter(maxConcurrent int, retryAfter time.Duration) *SubmitLimiter {
	if maxConcurrent < 1 {
		maxConcurrent = 5
	}
	if retryAfter <= 0 {
		retryAfter = 3 * time.Second
	}
	return &SubmitLimiter{
		maxConcurrent: int32(maxConcurrent),
		retryAfter:    retryAfter,
	}
}

// NewSubmitLimiterFromEnv crée un limiteur configuré via variables d'env.
// Défauts adaptés au Render free tier (0,1 vCPU).
func NewSubmitLimiterFromEnv() *SubmitLimiter {
	maxConcurrent := getEnvIntDefault("SUBMIT_MAX_CONCURRENT", 5)
	retryAfterSec := getEnvIntDefault("SUBMIT_QUEUE_RETRY_AFTER", 3)
	return NewSubmitLimiter(maxConcurrent, time.Duration(retryAfterSec)*time.Second)
}

// TryAcquire tente de réserver un slot de traitement.
// Retourne (acquired=true, release func) si un slot est disponible.
// Retourne (false, nil) si la file est pleine — l'appelant doit renvoyer 202.
func (l *SubmitLimiter) TryAcquire() (bool, func()) {
	cur := atomic.LoadInt32(&l.active)
	if cur >= l.maxConcurrent {
		// File pleine. Incrémenter queued pour observabilité (best-effort).
		atomic.AddInt32(&l.queued, 1)
		return false, nil
	}
	if !atomic.CompareAndSwapInt32(&l.active, cur, cur+1) {
		// Quelqu'un d'autre a pris le slot entre-temps — réessayer une fois.
		return l.TryAcquire()
	}
	// Slot acquis. Décrémenter queued si on était en file (cas rare où un slot
	// s'est libéré juste après l'incrément queued).
	atomic.AddInt32(&l.queued, -1)
	release := func() {
		atomic.AddInt32(&l.active, -1)
	}
	return true, release
}

// Stats retourne l'état courant (pour monitoring / logs).
func (l *SubmitLimiter) Stats() (active, queued, max int32) {
	return atomic.LoadInt32(&l.active), atomic.LoadInt32(&l.queued), l.maxConcurrent
}

// RetryAfterSeconds retourne le délai de retry conseillé en secondes (pour header).
func (l *SubmitLimiter) RetryAfterSeconds() int {
	return int(l.retryAfter / time.Second)
}

// writeSubmitAccepted écrit une réponse 202 Accepted indiquant au client de
// réessayer après retryAfterSec. Body JSON conforme au reste de l'API.
func writeSubmitAccepted(w http.ResponseWriter, retryAfterSec int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", strconv.Itoa(retryAfterSec))
	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte(`{"status":"queued","retryAfter":` + strconv.Itoa(retryAfterSec) + `,"message":"soumission en file, réessayez dans quelques secondes"}`))
}

// --- helpers ---

// getEnvIntDefault retourne la valeur entière d'une variable d'env, ou le fallback.
// (Dupliqué volontairement de db.getEnvInt pour éviter un import cyclique et
// garder ce fichier self-contained.)
func getEnvIntDefault(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// _ pour forcer l'usage de sync dans le package (clarité intentionnelle).
var _ = sync.Once{}
