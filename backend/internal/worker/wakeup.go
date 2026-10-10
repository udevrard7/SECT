// Package worker — réveil événementiel in-process (mode « à la demande »,
// ADR-0013 §13).
//
// PROBLÈME (§12.3) : le pickup des batches PENDING repose sur un ticker
// périodique. Sous plancher jour 15 min, un RESPONSABLE qui poste
// POST /cloture-annee attendrait jusqu'à 15 min le premier tick —
// régression produit vs les 10 s historiques.
//
// MODE « À LA DEMANDE » (décision exploitant — cf. ADR-0013 §13.1) :
// « le worker reste rapide quand des batches existent, ralentit sinon ».
//   - RAPIDE : le handler runPromotion appelle Notify JUSTE APRÈS le COMMIT
//     du batch PENDING → le worker réagit en < 1 s (mieux que les 10 s de
//     polling) et draine TOUS les batches PENDING back-to-back (tant qu'il
//     en trouve, il ne se rendort pas).
//   - LENT (sinon) : le ticker adaptatif M1 reste le FILET DE SÉCURITÉ
//     (planchers 15 min jour/nuit) — il rattrape ce qui n'est PAS passé
//     par l'API : Notify perdu, reprise après restart, chemin externe
//     futur.
//
// SÉMANTIQUE DE COALESCENCE : canal buffer 1 + envoi non-bloquant. Si N
// Notify arrivent pendant que le worker traite, UN seul signal reste en
// attente — suffisant : le drain traite TOUT ce qui est PENDING, pas un
// batch par signal. Un signal « perdu » (canal plein) se rattrape par le
// filet ticker, jamais par un batch orphelin.
//
// MULTI-INSTANCE : le bus est in-process (OCI = une seule instance avec
// workers ; Render standby a WORKERS_ENABLED=false). Même si une instance
// concurrente notifiait sans voir le batch, le claim atomique
// FOR UPDATE SKIP LOCKED (promotion_worker.go) garantit qu'un batch n'est
// traité qu'une fois — un réveil « inutile » coûte un SELECT.
package worker

import "sync"

// WorkerPromotion est le nom du worker promotion AU SENS du bus de réveil
// et du registre ADR-0011 (cadence.go lit WORKER_PROMOTION_* sur ce même
// nom — une seule source de vérité pour les trois mécanismes).
const WorkerPromotion = "promotion"

// WakeupBus distribue les réveils événementiels par nom de worker.
type WakeupBus struct {
	mu   sync.Mutex
	subs map[string]chan struct{}
}

// NewWakeupBus crée un bus vide (aucun abonné).
func NewWakeupBus() *WakeupBus {
	return &WakeupBus{subs: make(map[string]chan struct{})}
}

// Subscribe retourne le canal de réveil du worker name (créé au premier
// appel, buffer 1, jamais fermé — le worker le consomme jusqu'à ctx.Done).
func (b *WakeupBus) Subscribe(name string) <-chan struct{} {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch, ok := b.subs[name]
	if !ok {
		ch = make(chan struct{}, 1)
		b.subs[name] = ch
	}
	return ch
}

// Notify réveille le worker name s'il est abonné. Non-bloquant et
// coalescent : un signal déjà en attente suffit (le drain vide tout ce
// qui est PENDING, pas un batch par signal).
func (b *WakeupBus) Notify(name string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if ch, ok := b.subs[name]; ok {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
