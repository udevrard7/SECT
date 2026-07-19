package worker

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"

        "github.com/udevrard7/sect/backend/internal/ai"
)

// IA-CORRECTION-1 : Worker asynchrone pour la correction IA des QRC/CODE.
//
// Contrairement au worker de génération (lourd, PDF), la correction est
// rapide (traitement de texte). File dédiée pour ne pas bloquer la génération.

// CorrectionJob représente une tâche de correction IA pour une réponse.
type CorrectionJob struct {
        ReponseID   string `json:"reponseId"`
        SessionID   string `json:"sessionId"`
        QuestionID  string `json:"questionId"`
        EnseignantID string `json:"enseignantId"`
}

// CorrectionQueue est la file d'attente pour les corrections IA.
// Buffer 500 (plus grand que génération car les corrections sont rapides).
var CorrectionQueue = make(chan CorrectionJob, 500)

// CorrectionWorker est le worker qui consomme la queue de correction.
type CorrectionWorker struct {
        dbPool    *pgxpool.Pool
        logger    *slog.Logger
        aiService *ai.AIService // failover support
}

// NewCorrectionWorker crée un nouveau worker de correction.
func NewCorrectionWorker(dbPool *pgxpool.Pool, logger *slog.Logger, aiService *ai.AIService) *CorrectionWorker {
        return &CorrectionWorker{dbPool: dbPool, logger: logger, aiService: aiService}
}

// Start lance le worker en goroutine.
func (w *CorrectionWorker) Start(ctx context.Context) {
        w.logger.Info("Correction IA Worker started, waiting for jobs...")

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("Correction IA Worker stopping...")
                                return
                        case job := <-CorrectionQueue:
                                w.logger.Info("Processing correction job",
                                        "reponseId", job.ReponseID,
                                        "sessionId", job.SessionID,
                                )
                                w.processCorrectionJob(ctx, job)
                        }
                }
        }()
}

// processCorrectionJob corrige une réponse via l'IA.
func (w *CorrectionWorker) processCorrectionJob(ctx context.Context, job CorrectionJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("Correction Worker panic recovered", "error", r, "reponseId", job.ReponseID)
                        w.markReponseError(ctx, job.ReponseID, fmt.Sprintf("erreur interne: %v", r))
                }
        }()

        // 1. Marquer statusIA = EN_COURS
        w.updateReponseStatusIA(ctx, job.ReponseID, "EN_COURS", nil, nil)

        // 2. Récupérer la question (énoncé, barème, réponse type) + réponse étudiant
        question, reponse, err := w.getQuestionAndReponse(ctx, job.ReponseID)
        if err != nil {
                w.logger.Error("Failed to get question/reponse", "error", err, "reponseId", job.ReponseID)
                w.markReponseError(ctx, job.ReponseID, "données introuvables")
                return
        }

        // 3. Construire le prompt de notation
        messages := w.buildCorrectionPrompt(question, reponse)

        // 4. Convertir worker.ChatMessage → ai.ChatMessage et appeler l'IA avec failover
        aiMessages := make([]ai.ChatMessage, len(messages))
        for i, m := range messages {
                aiMessages[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
        }
        result, err := w.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                w.logger.Error("AI call failed (all providers exhausted)", "error", err)
                w.markReponseError(ctx, job.ReponseID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        // 5. Extraire le contenu textuel du résultat
        rawContent := result.Content

        // 6. Parser la réponse JSON { noteIA, justificationIA }
        noteIA, justification, err := w.parseCorrectionResponse(rawContent)
        if err != nil {
                w.logger.Error("Failed to parse AI response", "error", err, "raw", rawContent[:200])
                w.markReponseError(ctx, job.ReponseID, "réponse IA illisible")
                return
        }

        // 7. Écrire noteIA + justificationIA en DB
        w.updateReponseStatusIA(ctx, job.ReponseID, "TERMINE", &noteIA, &justification)
        w.logger.Info("Correction completed", "reponseId", job.ReponseID, "noteIA", noteIA)
}

// questionData contient les données de la question pour le prompt.
type questionData struct {
        Enonce       string
        Bareme       float64
        Type         string
        ReponseType  *string // réponse modèle / correction type
}

// reponseData contient la réponse de l'étudiant.
type reponseData struct {
        Contenu string
}

// getQuestionAndReponse récupère la question et la réponse depuis la DB.
func (w *CorrectionWorker) getQuestionAndReponse(ctx context.Context, reponseID string) (*questionData, *reponseData, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var q questionData
        var r reponseData
        var contenu *string
        var reponseType *string

        // Joindre Reponse → EpreuveQuestion → Question pour récupérer l'énoncé
        err = tx.QueryRow(ctx, `
                SELECT
                        q."enonce",
                        eq."bareme",
                        q."type"::text,
                        q."reponseCorrecte"::text,
                        r."contenu"
                FROM "Reponse" r
                JOIN "EpreuveQuestion" eq ON eq."questionId" = r."questionId"
                JOIN "Question" q ON q."id" = r."questionId"
                WHERE r."id" = $1
        `, reponseID).Scan(&q.Enonce, &q.Bareme, &q.Type, &reponseType, &contenu)

        if err != nil {
                return nil, nil, fmt.Errorf("query question/reponse: %w", err)
        }

        q.ReponseType = reponseType
        if contenu != nil {
                r.Contenu = *contenu
        }

        tx.Commit(ctx)
        return &q, &r, nil
}

// buildCorrectionPrompt construit les messages pour l'IA.
func (w *CorrectionWorker) buildCorrectionPrompt(q *questionData, r *reponseData) []ChatMessage {
        systemPrompt := `Tu es un enseignant expert et impartial. Ton rôle est de corriger la réponse d'un étudiant à partir d'un barème strict.
Tu dois renvoyer UNIQUEMENT un objet JSON valide contenant deux champs :
{
  "noteIA": (nombre, ne doit jamais dépasser la note maximale du barème),
  "justificationIA": "Explication claire, constructive et concise des points attribués ou retirés à l'étudiant."
}`

        correctionType := "Non fournie"
        if q.ReponseType != nil && *q.ReponseType != "" {
                correctionType = *q.ReponseType
        }

        userPrompt := fmt.Sprintf(`[ÉNONCÉ DE LA QUESTION]
%s

[CORRECTION TYPE / ATTENTES]
%s

[BARÈME MAXIMUM]
%.1f points

[RÉPONSE DE L'ÉTUDIANT]
%s

Évalue la réponse de l'étudiant en fonction des attentes et du barème. Sois indulgent sur l'orthographe mais strict sur le fond. Réponds UNIQUEMENT avec le JSON demandé.`, q.Enonce, correctionType, q.Bareme, r.Contenu)

        return []ChatMessage{
                {Role: "system", Content: systemPrompt},
                {Role: "user", Content: userPrompt},
        }
}

// parseCorrectionResponse extrait noteIA et justification du JSON retourné par l'IA.
func (w *CorrectionWorker) parseCorrectionResponse(raw string) (float64, string, error) {
        // Extraire le JSON (l'IA peut l'enrober dans des markdown code blocks)
        jsonStr := raw
        if idx := indexOf(raw, "{"); idx >= 0 {
                endIdx := lastIndexOf(raw, "}")
                if endIdx > idx {
                        jsonStr = raw[idx : endIdx+1]
                }
        }

        var result struct {
                NoteIA          float64 `json:"noteIA"`
                JustificationIA string  `json:"justificationIA"`
        }
        if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
                return 0, "", fmt.Errorf("parse JSON: %w", err)
        }
        return result.NoteIA, result.JustificationIA, nil
}

// updateReponseStatusIA met à jour le statut IA + noteIA + justification en DB.
func (w *CorrectionWorker) updateReponseStatusIA(ctx context.Context, reponseID, statusIA string, noteIA *float64, justification *string) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("Failed to begin tx for IA status update", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        _, err = tx.Exec(ctx, `
                UPDATE "Reponse"
                SET "noteIA" = $1,
                    "justificationIA" = $2,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $3
        `, noteIA, justification, reponseID)

        if err != nil {
                w.logger.Error("Failed to update reponse IA", "error", err, "reponseId", reponseID)
                return
        }

        tx.Commit(ctx)
}

// markReponseError marque la réponse en erreur (noteIA = 0, justification = erreur).
func (w *CorrectionWorker) markReponseError(ctx context.Context, reponseID, errorMsg string) {
        errMsg := errorMsg
        w.updateReponseStatusIA(ctx, reponseID, "ERREUR", nil, &errMsg)
}

// RecoverInterruptedCorrections reprend les corrections interrompues au redémarrage.
func (w *CorrectionWorker) RecoverInterruptedCorrections(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverCorrections: failed to begin tx", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        // Chercher les réponses QRC/CODE sans noteIA (correction IA en attente)
        rows, err := tx.Query(ctx, `
                SELECT r."id", r."sessionId", r."questionId"
                FROM "Reponse" r
                JOIN "Question" q ON q."id" = r."questionId"
                JOIN "SessionPassation" s ON s."id" = r."sessionId"
                WHERE r."noteIA" IS NULL
                  AND r."contenu" IS NOT NULL
                  AND q."type" IN ('QRC', 'CODE', 'REFLEXION')
                  AND s."statut" = 'SOUMISE'
        `)
        if err != nil {
                w.logger.Error("RecoverCorrections: query failed", "error", err)
                return
        }
        defer rows.Close()

        recovered := 0
        for rows.Next() {
                var reponseID, sessionID, questionID string
                if err := rows.Scan(&reponseID, &sessionID, &questionID); err != nil {
                        continue
                }
                w.logger.Warn("Recovering interrupted correction", "reponseId", reponseID)
                // Réinjecter dans la queue
                select {
                case CorrectionQueue <- CorrectionJob{ReponseID: reponseID, SessionID: sessionID, QuestionID: questionID}:
                        recovered++
                default:
                        w.logger.Warn("CorrectionQueue full, skipping recovery", "reponseId", reponseID)
                }
        }

        tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted corrections", "count", recovered)
        } else {
                w.logger.Info("No interrupted corrections to recover")
        }
}

// Helper: indexOf / lastIndexOf for string
func indexOf(s, substr string) int {
        for i := 0; i <= len(s)-len(substr); i++ {
                if s[i:i+len(substr)] == substr {
                        return i
                }
        }
        return -1
}

func lastIndexOf(s, substr string) int {
        for i := len(s) - len(substr); i >= 0; i-- {
                if s[i:i+len(substr)] == substr {
                        return i
                }
        }
        return -1
}
