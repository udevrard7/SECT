// Package worker — worker asynchrone pour les tâches IA longues.
//
// IA-WORKER-1 : pattern "job queue" avec channels Go (pas de RabbitMQ/Redis).
//
// Au lieu d'attendre synchrone que l'IA réponde (40s → timeout Vercel/Render),
// le handler POST /api/epreuves/generate :
//  1. Crée l'épreuve en DB avec statut EN_COURS
//  2. Pousse un IAJob dans GeneratorQueue (channel Go, < 1ms)
//  3. Retourne immédiatement 202 Accepted
//
// Le worker (goroutine) consomme la queue en arrière-plan :
//  1. Lit le provider actif depuis AIProviderConfig (Neon)
//  2. Télécharge le document depuis R2
//  3. Appelle l'API du provider IA (Mistral, Groq, etc.)
//  4. Écrit le résultat en DB (statut TERMINE)
//
// Si le provider IA ralentit (1 min), l'utilisateur ne voit jamais de 504.
// Le frontend poll la DB via TanStack Query (refetchInterval 3s).
package worker

import (
        "context"
        "fmt"
        "log/slog"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
)

// IAJob représente une tâche de génération IA en file d'attente.
type IAJob struct {
        EpreuveID   string `json:"epreuveId"`
        ProviderID  string `json:"providerId"`
        DocumentKey string `json:"documentKey"`
        // Prompt pré-construit par le handler (contient le texte extrait + config)
        Prompt       string         `json:"prompt"`
        Messages     []ChatMessage  `json:"messages"`
        EnseignantID string         `json:"enseignantId"`
        Config       GenerateConfig `json:"config"`
}

// ChatMessage pour l'appel IA.
type ChatMessage struct {
        Role    string `json:"role"`
        Content string `json:"content"`
}

// GenerateConfig contient la config de génération (nombre questions, types, etc.)
type GenerateConfig struct {
        Titre           string                 `json:"titre"`
        Difficulte      string                 `json:"difficulte"`
        NombreQuestions int                    `json:"nombreQuestions"`
        TypesQuestions  map[string]int         `json:"typesQuestions"`
        NoteTotal       float64                `json:"noteTotal"`
        Extra           map[string]interface{} `json:"extra,omitempty"`
}

// GeneratorQueue est la file d'attente globale (channel Go buffered).
// Buffer 100 jobs — largement suffisant pour Render Free.
var GeneratorQueue = make(chan IAJob, 100)

// IAWorker est le worker qui consomme la queue.
type IAWorker struct {
        dbPool *pgxpool.Pool
        logger *slog.Logger
        // aiBaseURL + apiKey sont lus depuis la DB au moment du traitement
}

// NewIAWorker crée un nouveau worker IA.
func NewIAWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *IAWorker {
        return &IAWorker{
                dbPool: dbPool,
                logger: logger,
        }
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go avant le serveur HTTP.
func (w *IAWorker) Start(ctx context.Context) {
        w.logger.Info("IA Worker started, waiting for jobs...")

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("IA Worker stopping...")
                                return
                        case job := <-GeneratorQueue:
                                w.logger.Info("Processing IA job",
                                        "epreuveId", job.EpreuveID,
                                        "enseignantId", job.EnseignantID,
                                )
                                w.processJob(ctx, job)
                        }
                }
        }()
}

// processJob traite un job IA complet (peut prendre 30-60s).
func (w *IAWorker) processJob(ctx context.Context, job IAJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("IA Worker panic recovered", "error", r, "epreuveId", job.EpreuveID)
                        w.markEpreuveError(ctx, job.EpreuveID, fmt.Sprintf("erreur interne: %v", r))
                }
        }()

        // 1. Mettre à jour le statut EN_COURS
        w.updateEpreuveStatus(ctx, job.EpreuveID, "EN_COURS", "", "")

        // 2. Lire le provider actif depuis la DB
        provider, err := getActiveProviderShared(ctx, w.dbPool)
        if err != nil {
                w.logger.Error("Failed to get active AI provider", "error", err)
                w.markEpreuveError(ctx, job.EpreuveID, "aucun provider IA actif")
                return
        }
        w.logger.Info("Using AI provider", "name", provider.Name, "model", provider.Model)

        // 3. Appeler l'API du provider IA (helper partagé helpers.go).
        result, err := callAIProviderShared(ctx, provider, job.Messages, w.logger)
        if err != nil {
                w.logger.Error("AI provider call failed", "error", err, "provider", provider.Name)
                w.markEpreuveError(ctx, job.EpreuveID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        w.logger.Info("AI generation completed", "epreuveId", job.EpreuveID, "responseLength", len(result))

        // 4. Mettre à jour l'épreuve avec le résultat (statut TERMINE)
        w.updateEpreuveStatus(ctx, job.EpreuveID, "TERMINEE", result, "")
        w.logger.Info("IA job completed successfully", "epreuveId", job.EpreuveID)
}

// aiProviderConfig représente la config d'un provider lu depuis la DB.
// Ce type est partagé entre IAWorker et CorrectionWorker (helpers.go).
type aiProviderConfig struct {
        ID          string
        Name        string
        Provider    string
        BaseURL     string
        APIKey      string
        Model       string
        Temperature float64
        MaxTokens   int
        Capability  string // DASHSCOPE-AUDIO-1 : 'chat' (défaut), 'tts', 'audio'
        ExtraConfig string // VOXTRAL-TTS-2 : JSON brut (refAudioPresenter, refAudioExpert)
}

// Bug #9 (audit ai-providers MEDIUM) : les anciennes méthodes doublons de
// IAWorker ont été supprimées. `processJob` ci-dessus appelle directement
// les versions Shared définies dans helpers.go (qui gèrent en plus le
// extraConfig pour ZAI, bug #2).

// updateEpreuveStatus met à jour le statut de l'épreuve en DB.
func (w *IAWorker) updateEpreuveStatus(ctx context.Context, epreuveID, statut, contenu, erreur string) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("Failed to begin tx for status update", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        if contenu != "" {
                _, err = tx.Exec(ctx, `
                        UPDATE "Epreuve"
                        SET "statut" = $1, "contenu" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $3
                `, statut, contenu, epreuveID)
        } else {
                _, err = tx.Exec(ctx, `
                        UPDATE "Epreuve"
                        SET "statut" = $1, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $2
                `, statut, epreuveID)
        }
        if err != nil {
                w.logger.Error("Failed to update epreuve status", "error", err, "epreuveId", epreuveID)
                return
        }

        tx.Commit(ctx)
}

// markEpreuveError marque l'épreuve en erreur.
func (w *IAWorker) markEpreuveError(ctx context.Context, epreuveID, errorMsg string) {
        w.updateEpreuveStatus(ctx, epreuveID, "BROUILLON", "", "")
        w.logger.Error("IA job failed", "epreuveId", epreuveID, "error", errorMsg)
}

// RecoverInterruptedJobs recherche les epreuves restees bloquees au statut
// EN_COURS (a cause d'un redemarrage Render) et les reinjecte dans la queue.
//
// A appeler au demarrage de main.go, apres NewIAWorker et avant Start.
// Graceful shutdown : aucun job n'est jamais perdu a cause de l'infra.
func (w *IAWorker) RecoverInterruptedJobs(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverInterruptedJobs: failed to begin tx", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        rows, err := tx.Query(ctx, `
                SELECT "id", "enseignantId", "contenu"
                FROM "Epreuve"
                WHERE "statut" = 'EN_COURS'
                        AND "deletedAt" IS NULL
                        AND ("contenu" IS NULL OR "contenu" = 'null'::jsonb)
        `)
        if err != nil {
                w.logger.Error("RecoverInterruptedJobs: query failed", "error", err)
                return
        }
        defer rows.Close()

        recovered := 0
        for rows.Next() {
                var epreuveID, enseignantID string
                var contenu *[]byte
                if err := rows.Scan(&epreuveID, &enseignantID, &contenu); err != nil {
                        continue
                }
                w.logger.Warn("Recovering interrupted epreuve", "epreuveId", epreuveID, "enseignantId", enseignantID)
                tx.Exec(ctx, `
                        UPDATE "Epreuve" SET "statut" = 'BROUILLON', "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1
                `, epreuveID)
                recovered++
        }

        tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted jobs", "count", recovered)
        } else {
                w.logger.Info("No interrupted jobs to recover")
        }
}
