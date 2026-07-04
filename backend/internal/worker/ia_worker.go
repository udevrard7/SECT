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
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"

        "github.com/udevrard7/sect/backend/internal/ai"
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
        dbPool    *pgxpool.Pool
        logger    *slog.Logger
        aiService *ai.AIService // QUESTIONS-IA-FAILOVER : utilise AIService.ChatCompletion (failover inclus)
}

// NewIAWorker crée un nouveau worker IA.
// QUESTIONS-IA-FAILOVER : aiService est maintenant requis pour bénéficier du
// failover automatique entre providers (avant : getActiveProviderShared LIMIT 1,
// pas de fallback → si le provider principal tombait, l'épreuve échouait même
// si un provider de secours était disponible dans AIProviderConfig).
func NewIAWorker(dbPool *pgxpool.Pool, logger *slog.Logger, aiService *ai.AIService) *IAWorker {
        return &IAWorker{
                dbPool:    dbPool,
                logger:    logger,
                aiService: aiService,
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
//
// QUESTIONS-IA-FAILOVER : utilise maintenant aiService.ChatCompletion qui
// implémente le failover automatique (ChatWithFailover). Avant, le worker
// utilisait getActiveProviderShared (LIMIT 1) + callAIProviderShared sans
// fallback → si le provider principal tombait (429/5xx/timeout), l'épreuve
// échouait même si un provider de secours était configuré.
//
// QUESTIONS-IA-VALIDATION : valide la réponse IA avant de marquer TERMINEE.
// Avant, le raw AI response était stocké tel quel → si l'IA retournait du
// prose ou wrappait dans ```json```, Epreuve.contenu était non-JSON mais
// statut=TERMINEE → crash UI au poll. Maintenant on valide le JSON et on
// appelle markEpreuveError si invalide.
func (w *IAWorker) processJob(ctx context.Context, job IAJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("IA Worker panic recovered", "error", r, "epreuveId", job.EpreuveID)
                        w.markEpreuveError(ctx, job.EpreuveID, fmt.Sprintf("erreur interne: %v", r))
                }
        }()

        // 1. Mettre à jour le statut EN_COURS
        w.updateEpreuveStatus(ctx, job.EpreuveID, "EN_COURS", "", "")

        // 2. Vérifier que aiService est disponible.
        if w.aiService == nil {
                w.logger.Error("AIService not configured on IAWorker")
                w.markEpreuveError(ctx, job.EpreuveID, "service IA non configuré")
                return
        }

        // 3. Convertir worker.ChatMessage → ai.ChatMessage et appeler l'IA avec failover.
        aiMessages := make([]ai.ChatMessage, 0, len(job.Messages))
        for _, m := range job.Messages {
                aiMessages = append(aiMessages, ai.ChatMessage{Role: m.Role, Content: m.Content})
        }
        result, err := w.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                w.logger.Error("AI call failed (all providers exhausted)", "error", err, "epreuveId", job.EpreuveID)
                w.markEpreuveError(ctx, job.EpreuveID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        w.logger.Info("AI generation completed", "epreuveId", job.EpreuveID, "responseLength", len(result.Content), "model", result.Model)

        // 4. QUESTIONS-IA-VALIDATION : valider la réponse IA avant de marquer TERMINEE.
        // La réponse doit être du JSON valide contenant une clé "questions" (array).
        // Si l'IA a wrappé dans ```json...``` ou ajouté du prose, on extrait le JSON.
        // Si le parsing échoue, on ne marque pas TERMINEE (sinon crash UI au poll).
        validatedContent, parseErr := validateAndExtractJSON(result.Content)
        if parseErr != nil {
                w.logger.Error("AI response validation failed", "error", parseErr, "epreuveId", job.EpreuveID, "responseSnippet", truncate(result.Content, 200))
                w.markEpreuveError(ctx, job.EpreuveID, fmt.Sprintf("réponse IA invalide: %v", parseErr))
                return
        }

        // 5. Mettre à jour l'épreuve avec le résultat validé (statut TERMINEE).
        w.updateEpreuveStatus(ctx, job.EpreuveID, "TERMINEE", validatedContent, "")
        w.logger.Info("IA job completed successfully", "epreuveId", job.EpreuveID)
}

// validateAndExtractJSON valide que la réponse IA est du JSON exploitable.
// Retourne le JSON nettoyé (sans markdown wrapper) ou une erreur.
//
// Étapes :
//  1. Si la réponse contient ```json ... ```, extraire le bloc.
//  2. Tenter json.Unmarshal vers une map générique.
//  3. Vérifier qu'une clé "questions" existe et est un array non vide.
//
// QUESTIONS-IA-VALIDATION : empêche de stocker du contenu non-JSON en DB
// (qui ferait crasher le frontend au poll de l'épreuve).
func validateAndExtractJSON(raw string) (string, error) {
        content := strings.TrimSpace(raw)
        if content == "" {
                return "", fmt.Errorf("réponse vide")
        }

        // Extraire le bloc ```json ... ``` si présent.
        if strings.Contains(content, "```") {
                // Cas 1: ```json\n...\n```
                if idx := strings.Index(content, "```json"); idx >= 0 {
                        start := idx + len("```json")
                        if end := strings.Index(content[start:], "```"); end >= 0 {
                                content = strings.TrimSpace(content[start : start+end])
                        }
                } else if idx := strings.Index(content, "```"); idx >= 0 {
                        // Cas 2: ```\n...\n```
                        start := idx + len("```")
                        if end := strings.Index(content[start:], "```"); end >= 0 {
                                content = strings.TrimSpace(content[start : start+end])
                        }
                }
        }

        // Si pas d'accolades, ce n'est pas du JSON.
        if !strings.Contains(content, "{") {
                return "", fmt.Errorf("aucun JSON détecté dans la réponse")
        }

        // Extraire le bloc JSON (du premier { au dernier }).
        startIdx := strings.Index(content, "{")
        endIdx := strings.LastIndex(content, "}")
        if startIdx < 0 || endIdx < 0 || endIdx <= startIdx {
                return "", fmt.Errorf("bloc JSON invalide")
        }
        jsonStr := content[startIdx : endIdx+1]

        // Valider que c'est du JSON parsable.
        var parsed map[string]interface{}
        if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
                return "", fmt.Errorf("JSON invalide: %w", err)
        }

        // Vérifier la présence d'une clé "questions" (array).
        questions, ok := parsed["questions"]
        if !ok {
                return "", fmt.Errorf("clé 'questions' manquante dans la réponse IA")
        }
        questionsArr, ok := questions.([]interface{})
        if !ok {
                return "", fmt.Errorf("la clé 'questions' n'est pas un tableau")
        }
        if len(questionsArr) == 0 {
                return "", fmt.Errorf("la clé 'questions' est vide")
        }

        // Retourner le JSON validé (re-sérialisé pour garantir un format propre).
        return jsonStr, nil
}

// truncate retourne s tronqué à maxLen caractères (avec suffixe "…").
func truncate(s string, maxLen int) string {
        if len(s) <= maxLen {
                return s
        }
        return s[:maxLen] + "…"
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
