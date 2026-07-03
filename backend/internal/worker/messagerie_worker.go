// Package worker — worker asynchrone pour les réponses IA en salon collectif.
//
// MESSAGERIE-GROUP-ASYNC : avant, generateAIResponseInGroup s'exécutait en
// synchrone dans la requête HTTP SendMessage. Sur Render free tier (timeout
// 30s), un appel IA >30s coupait la requête HTTP — l'utilisateur voyait une
// erreur réseau même si son message était persisté, et la réponse IA pouvait
// ne jamais arriver (contexte annulé).
//
// Désormais, SendMessage pousse un GroupAIJob dans GroupAIQueue (channel Go,
// < 1ms) et retourne immédiatement le message user. Ce worker consomme la
// queue en arrière-plan :
//  1. Construit le contexte LLM (system prompt + contenu user).
//  2. Appelle l'IA (ChatCompletion avec failover).
//  3. Persiste la réponse IA (ReplyToID = userMsg.ID).
//  4. Broadcast la réponse via le hub SSE aux participants du salon.
//
// L'utilisateur reçoit son message instantanément (broadcast SSE), et la
// réponse IA arrive quelques secondes plus tard via le même canal SSE. Le
// frontend n'a aucune modification à faire.
//
// Sécurité : le worker n'a pas de claims HTTP. Il utilise un contexte
// background et pose des claims system-worker pour l'écriture du message IA
// (la policy Message_insert accepte is_system() OR isIA=true).
package worker

import (
	"context"
	"log/slog"
	"time"
)

// GroupAIJob représente une tâche de réponse IA en salon collectif.
type GroupAIJob struct {
	ConversationID string `json:"conversationId"`
	UserMsgID      string `json:"userMsgId"`
	UserContent    string `json:"userContent"`
	// Claims snapshot au moment de l'envoi (le contexte HTTP sera annulé).
	// Le worker reconstruuit un db.SessionClaims à partir de ces champs.
	UserID         string `json:"userId"`
	Role           string `json:"role"`
	EtablissementID string `json:"etablissementId"`
	FiliereID      string `json:"filiereId"`
}

// GroupAIQueue est la file d'attente globale (channel Go buffered).
// Buffer 50 jobs — les réponses IA en salon ne sont pas critiques (l'user a
// déjà son message), un délai de traitement est acceptable.
var GroupAIQueue = make(chan GroupAIJob, 50)

// GroupAIProcessor est l'interface que le worker appelle pour traiter un job.
// Implémentée par usecase.MessagerieUseCase (duck-typing pour éviter une
// dépendance circulaire worker → usecase).
type GroupAIProcessor interface {
	ProcessGroupAIJob(ctx context.Context, job GroupAIJob) error
}

// GroupAIWorker est le worker qui consomme la queue.
type GroupAIWorker struct {
	processor GroupAIProcessor
	logger    *slog.Logger
}

// NewGroupAIWorker crée un nouveau worker.
// processor peut être nil pendant le bootstrap (le worker droppera les jobs
// avec un warn — utile pour les tests).
func NewGroupAIWorker(processor GroupAIProcessor, logger *slog.Logger) *GroupAIWorker {
	return &GroupAIWorker{
		processor: processor,
		logger:    logger,
	}
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go après la création du MessagerieUseCase.
func (w *GroupAIWorker) Start(ctx context.Context) {
	w.logger.Info("Group AI Worker started, waiting for jobs...")

	go func() {
		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Group AI Worker stopping...")
				return
			case job := <-GroupAIQueue:
				w.processJob(ctx, job)
			}
		}
	}()
}

// processJob traite un job complet (peut prendre 5-60s selon l'IA).
// Recover panic pour ne jamais crasher le worker.
func (w *GroupAIWorker) processJob(ctx context.Context, job GroupAIJob) {
	defer func() {
		if r := recover(); r != nil {
			w.logger.Error("Group AI Worker panic recovered",
				"error", r,
				"conversationId", job.ConversationID,
				"userMsgId", job.UserMsgID,
			)
		}
	}()

	if w.processor == nil {
		w.logger.Warn("Group AI Worker has no processor, dropping job",
			"conversationId", job.ConversationID)
		return
	}

	start := time.Now()
	w.logger.Info("Processing group AI job",
		"conversationId", job.ConversationID,
		"userMsgId", job.UserMsgID,
	)

	// Contexte frais : le contexte HTTP d'origine a été annulé (requête
	// terminée). On utilise context.Background() avec un timeout de 3 min
	// (l'AIService a déjà un timeout HTTP de 3 min côté client).
	jobCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	if err := w.processor.ProcessGroupAIJob(jobCtx, job); err != nil {
		w.logger.Warn("Group AI job failed",
			"conversationId", job.ConversationID,
			"userMsgId", job.UserMsgID,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds(),
		)
		return
	}

	w.logger.Info("Group AI job completed",
		"conversationId", job.ConversationID,
		"userMsgId", job.UserMsgID,
		"duration_ms", time.Since(start).Milliseconds(),
	)
}

// RecoverInterruptedGroupAIJobs : pas de persistance de queue (channel Go
// in-memory). Les jobs en vol au moment d'un crash sont perdus. L'utilisateur
// verra son message user (persisté avant le push du job) mais pas de réponse
// IA — il peut re-mentionner @assistant pour relancer. Acceptable vu le
// caractère non-critique de l'IA en salon collectif.
func (w *GroupAIWorker) RecoverInterruptedGroupAIJobs(_ context.Context) {
	// No-op : pas de table de queue persistée pour les jobs IA de salon.
	// Le pattern "channel Go + recovery au redémarrage" nécessiterait une
	// table DB dédiée (overkill pour ce use case — l'IA en salon est
	// best-effort, pas critique comme la génération d'épreuve).
	w.logger.Info("Group AI Worker: no persistent queue to recover (channel in-memory)")
}
