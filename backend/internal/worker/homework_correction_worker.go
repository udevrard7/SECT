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

// P4-DEVOIRS-4 : Worker asynchrone pour la correction IA des soumissions de devoirs.
//
// Clone du pattern CorrectionWorker (correction d'examens QRC/CODE), adapté pour :
//   - les Soumissions de Devoirs (table "Soumission" au lieu de "Reponse")
//   - la grille d'évaluation (criteres JSON injectés dans le prompt)
//   - le statut IA explicite (colonne statutIA : EN_ATTENTE→EN_COURS→TERMINE/ERREUR)
//     pour permettre un polling propre côté frontend.
//
// Le handler POST /api/soumissions/{id}/ai-grade répond 202 Accepted immédiatement
// et pousse un job dans HomeworkCorrectionQueue. Le worker consomme la queue en
// tâche de fond, appelle l'IA, et écrit noteIA + justificationIA + statutIA en DB.

// HomeworkJob représente une tâche de correction IA pour une soumission de devoir.
type HomeworkJob struct {
        SoumissionID string `json:"soumissionId"`
        DevoirID     string `json:"devoirId"`
        EnseignantID string `json:"enseignantId"`
}

// HomeworkCorrectionQueue est la file d'attente pour les corrections IA de devoirs.
// Buffer 200 (les devoirs sont moins nombreux que les réponses d'examen).
var HomeworkCorrectionQueue = make(chan HomeworkJob, 200)

// HomeworkCorrectionWorker consomme la queue et corrige les soumissions via l'IA.
type HomeworkCorrectionWorker struct {
        dbPool    *pgxpool.Pool
        logger    *slog.Logger
        aiService *ai.AIService // failover support
}

// NewHomeworkCorrectionWorker crée un nouveau worker.
func NewHomeworkCorrectionWorker(dbPool *pgxpool.Pool, logger *slog.Logger, aiService *ai.AIService) *HomeworkCorrectionWorker {
        return &HomeworkCorrectionWorker{dbPool: dbPool, logger: logger, aiService: aiService}
}

// Start lance le worker en goroutine.
func (w *HomeworkCorrectionWorker) Start(ctx context.Context) {
        w.logger.Info("Homework Correction IA Worker started, waiting for jobs...")

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("Homework Correction IA Worker stopping...")
                                return
                        case job := <-HomeworkCorrectionQueue:
                                w.logger.Info("Processing homework correction job",
                                        "soumissionId", job.SoumissionID,
                                        "devoirId", job.DevoirID,
                                )
                                w.processJob(ctx, job)
                        }
                }
        }()
}

// homeworkData contient les données nécessaires à la correction IA.
type homeworkData struct {
        Titre         string
        Consignes     string
        Description   string
        NoteMax       float64
        GrilleCriteres string // JSON string des critères (peut être vide)
        ContenuEtudiant string
}

// processJob corrige une soumission via l'IA (7 étapes, comme CorrectionWorker).
func (w *HomeworkCorrectionWorker) processJob(ctx context.Context, job HomeworkJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("Homework Worker panic recovered", "error", r, "soumissionId", job.SoumissionID)
                        w.markSoumissionError(ctx, job.SoumissionID, fmt.Sprintf("erreur interne: %v", r))
                }
        }()

        // 1. Marquer statutIA = EN_COURS
        w.updateSoumissionStatusIA(ctx, job.SoumissionID, "EN_COURS", nil, nil, nil)

        // 2. Récupérer le devoir (titre, consignes, noteMax, grille) + contenu étudiant
        data, err := w.getHomeworkData(ctx, job.SoumissionID)
        if err != nil {
                w.logger.Error("Failed to get homework data", "error", err, "soumissionId", job.SoumissionID)
                w.markSoumissionError(ctx, job.SoumissionID, "données introuvables")
                return
        }

        // 3. Construire le prompt (avec grille d'évaluation si présente)
        messages := w.buildHomeworkPrompt(data)

        // 4. Convert worker.ChatMessage → ai.ChatMessage and call AI with failover
        aiMessages := make([]ai.ChatMessage, len(messages))
        for i, m := range messages {
                aiMessages[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
        }
        result, err := w.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                w.logger.Error("AI call failed (all providers exhausted)", "error", err)
                w.markSoumissionError(ctx, job.SoumissionID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        // 5. Parser la réponse JSON { noteIA, justificationIA }
        noteIA, justification, err := w.parseHomeworkResponse(result.Content)
        if err != nil {
                w.logger.Error("Failed to parse AI response", "error", err, "raw", result.Content[:200])
                w.markSoumissionError(ctx, job.SoumissionID, "réponse IA illisible")
                return
        }

        // 6. Écrire noteIA + justificationIA + statutIA=TERMINE en DB
        w.updateSoumissionStatusIA(ctx, job.SoumissionID, "TERMINE", &noteIA, &justification, nil)
        w.logger.Info("Homework correction completed",
                "soumissionId", job.SoumissionID,
                "noteIA", noteIA,
                "noteMax", data.NoteMax,
        )
}

// getHomeworkData récupère le devoir + la soumission + la grille depuis la DB.
func (w *HomeworkCorrectionWorker) getHomeworkData(ctx context.Context, soumissionID string) (*homeworkData, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var d homeworkData
        var contenu, consignes, description, grilleCriteres *string

        // JOIN Soumission → Devoir + LEFT JOIN GrilleEvaluation
        err = tx.QueryRow(ctx, `
                SELECT
                        dv."titre",
                        dv."consignes",
                        dv."description",
                        dv."noteMax",
                        g."criteres",
                        s."contenuTexte"
                FROM "Soumission" s
                JOIN "Devoir" dv ON dv."id" = s."devoirId"
                LEFT JOIN "GrilleEvaluation" g ON g."devoirId" = dv."id"
                WHERE s."id" = $1
        `, soumissionID).Scan(&d.Titre, &consignes, &description, &d.NoteMax, &grilleCriteres, &contenu)

        if err != nil {
                return nil, fmt.Errorf("query homework data: %w", err)
        }

        if consignes != nil {
                d.Consignes = *consignes
        }
        if description != nil {
                d.Description = *description
        }
        if grilleCriteres != nil {
                d.GrilleCriteres = *grilleCriteres
        }
        if contenu != nil {
                d.ContenuEtudiant = *contenu
        }

        tx.Commit(ctx)
        return &d, nil
}

// buildHomeworkPrompt construit les messages pour l'IA, en injectant la grille.
func (w *HomeworkCorrectionWorker) buildHomeworkPrompt(d *homeworkData) []ChatMessage {
        systemPrompt := `Tu es un enseignant expert et impartial. Ton rôle est de corriger la soumission d'un étudiant à un devoir, en t'aidant de la grille d'évaluation si elle est fournie.
Tu dois renvoyer UNIQUEMENT un objet JSON valide contenant deux champs :
{
  "noteIA": (nombre entre 0 et la note maximale, ne jamais dépasser le barème),
  "justificationIA": "Explication claire, constructive et concise des points attribués ou retirés. Si une grille est fournie, évalue critère par critère."
}`

        grilleSection := "Aucune grille d'évaluation fournie. Évalue globalement."
        if d.GrilleCriteres != "" && d.GrilleCriteres != "null" && d.GrilleCriteres != "[]" {
                // Essayer de formatter joliment la grille
                var criteres []map[string]any
                if err := json.Unmarshal([]byte(d.GrilleCriteres), &criteres); err == nil && len(criteres) > 0 {
                        grilleSection = "Grille d'évaluation (évalue chaque critère) :\n"
                        for i, c := range criteres {
                                nom, _ := c["nom"].(string)
                                desc, _ := c["description"].(string)
                                poids, _ := c["poids"].(float64)
                                if nom == "" {
                                        nom = fmt.Sprintf("Critère %d", i+1)
                                }
                                grilleSection += fmt.Sprintf("  %d. %s (poids: %.1f) — %s\n", i+1, nom, poids, desc)
                        }
                }
        }

        consignesSection := "Aucune consigne spécifique."
        if d.Consignes != "" {
                consignesSection = d.Consignes
        }

        descriptionSection := ""
        if d.Description != "" {
                descriptionSection = fmt.Sprintf("\n\n[DESCRIPTION DU DEVOIR]\n%s", d.Description)
        }

        userPrompt := fmt.Sprintf(`[DEVOIR : %s]%s

[CONSIGNES]
%s

[GRILLE D'ÉVALUATION]
%s

[BARÈME MAXIMUM]
%.1f points

[SOUMISSION DE L'ÉTUDIANT]
%s

Évalue la soumission de l'étudiant en fonction des consignes, de la grille d'évaluation et du barème. Sois indulgent sur l'orthographe mais strict sur le fond. Réponds UNIQUEMENT avec le JSON demandé.`,
                d.Titre, descriptionSection, consignesSection, grilleSection, d.NoteMax, d.ContenuEtudiant)

        return []ChatMessage{
                {Role: "system", Content: systemPrompt},
                {Role: "user", Content: userPrompt},
        }
}

// parseHomeworkResponse extrait noteIA et justification du JSON retourné par l'IA.
// Réutilise la logique tolerant de parseCorrectionResponse (gestion markdown fences).
func (w *HomeworkCorrectionWorker) parseHomeworkResponse(raw string) (float64, string, error) {
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

// updateSoumissionStatusIA met à jour statutIA + noteIA + justificationIA + erreurIA en DB.
func (w *HomeworkCorrectionWorker) updateSoumissionStatusIA(ctx context.Context, soumissionID, statusIA string, noteIA *float64, justification, erreur *string) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("Failed to begin tx for IA status update", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        _, err = tx.Exec(ctx, `
                UPDATE "Soumission"
                SET "statutIA" = $1::"StatutIASoumission",
                    "noteIA" = $2,
                    "justificationIA" = $3,
                    "erreurIA" = $4,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $5
        `, statusIA, noteIA, justification, erreur, soumissionID)

        if err != nil {
                w.logger.Error("Failed to update soumission IA", "error", err, "soumissionId", soumissionID)
                return
        }

        tx.Commit(ctx)
}

// markSoumissionError marque la soumission en erreur (statutIA = ERREUR).
func (w *HomeworkCorrectionWorker) markSoumissionError(ctx context.Context, soumissionID, errorMsg string) {
        errMsg := errorMsg
        w.updateSoumissionStatusIA(ctx, soumissionID, "ERREUR", nil, nil, &errMsg)
}

// RecoverInterruptedHomeworkCorrections reprend les corrections interrompues au redémarrage.
// Cherche les soumissions avec statutIA = EN_COURS (job en cours au moment du crash).
func (w *HomeworkCorrectionWorker) RecoverInterruptedHomeworkCorrections(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverHomework: failed to begin tx", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        rows, err := tx.Query(ctx, `
                SELECT s."id", s."devoirId", dv."enseignantId"
                FROM "Soumission" s
                JOIN "Devoir" dv ON dv."id" = s."devoirId"
                WHERE s."statutIA"::text = 'EN_COURS'
                  AND dv."deletedAt" IS NULL
        `)
        if err != nil {
                w.logger.Error("RecoverHomework: query failed", "error", err)
                return
        }
        defer rows.Close()

        recovered := 0
        for rows.Next() {
                var soumissionID, devoirID, enseignantID string
                if err := rows.Scan(&soumissionID, &devoirID, &enseignantID); err != nil {
                        continue
                }
                w.logger.Warn("Recovering interrupted homework correction", "soumissionId", soumissionID)
                select {
                case HomeworkCorrectionQueue <- HomeworkJob{
                        SoumissionID: soumissionID,
                        DevoirID:     devoirID,
                        EnseignantID: enseignantID,
                }:
                        recovered++
                default:
                        w.logger.Warn("HomeworkCorrectionQueue full, skipping recovery", "soumissionId", soumissionID)
                }
        }

        tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted homework corrections", "count", recovered)
        } else {
                w.logger.Info("No interrupted homework corrections to recover")
        }
}
