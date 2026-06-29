package worker

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/google/uuid"
)

// DOC-ANALYZER-1 : Worker d'analyse automatique des documents.
//
// Au moment de l'upload d'un document par l'enseignant, le backend
// déclenche l'analyse en arrière-plan. Ce worker :
//   1. Lit le contenu textuel du document depuis la DB
//   2. Demande à l'IA de découper le document en chapitres + thèmes
//   3. Insère les chapitres dans la table Chapter
//
// Une fois les chapitres créés, l'étudiant peut :
//   - Filtrer par chapitre dans l'onglet Entraînement
//   - Voir les lacunes par chapitre dans le Dashboard

type DocumentAnalysisJob struct {
        DocumentID string `json:"documentId"`
}

var DocumentAnalysisQueue = make(chan DocumentAnalysisJob, 50)

type DocumentAnalyzerWorker struct {
        dbPool *pgxpool.Pool
        logger *slog.Logger
}

func NewDocumentAnalyzerWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *DocumentAnalyzerWorker {
        return &DocumentAnalyzerWorker{dbPool: dbPool, logger: logger}
}

func (w *DocumentAnalyzerWorker) Start(ctx context.Context) {
        w.logger.Info("Document Analyzer Worker started, waiting for jobs...")

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("Document Analyzer Worker stopping...")
                                return
                        case job := <-DocumentAnalysisQueue:
                                w.logger.Info("Analyzing document", "documentId", job.DocumentID)
                                w.processAnalysisJob(ctx, job)
                        }
                }
        }()
}

func (w *DocumentAnalyzerWorker) processAnalysisJob(ctx context.Context, job DocumentAnalysisJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("Document Analyzer panic recovered", "error", r, "documentId", job.DocumentID)
                }
        }()

        // 1. Skip if already analyzed
        existing, _ := w.countChapters(ctx, job.DocumentID)
        if existing > 0 {
                w.logger.Info("Document already analyzed, skipping", "documentId", job.DocumentID, "chapters", existing)
                return
        }

        // 2. Get document content
        content, err := w.getDocumentContent(ctx, job.DocumentID)
        if err != nil {
                w.logger.Error("Failed to get document content", "error", err, "documentId", job.DocumentID)
                return
        }
        if len(content) < 50 {
                w.logger.Info("Document content too short, skipping", "documentId", job.DocumentID, "len", len(content))
                return
        }

        // 3. Truncate to 15k chars
        if len(content) > 15000 {
                content = content[:15000] + "\n... [contenu tronqué]"
        }

        // 4. Get active AI provider
        provider, err := getActiveProviderShared(ctx, w.dbPool)
        if err != nil {
                w.logger.Error("Failed to get active AI provider", "error", err)
                return
        }

        // 5. Build prompt
        messages := w.buildAnalysisPrompt(content)

        // 6. Call AI
        result, err := callAIProviderShared(ctx, provider, messages, w.logger)
        if err != nil {
                w.logger.Error("AI analysis failed", "error", err, "documentId", job.DocumentID)
                w.markAnalysisError(ctx, job.DocumentID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        // 7. Parse chapters
        chapters, err := w.parseChapters(result)
        if err != nil {
                w.logger.Error("Failed to parse chapters", "error", err, "documentId", job.DocumentID)
                w.markAnalysisError(ctx, job.DocumentID, "réponse IA illisible")
                return
        }

        // 8. Insert chapters
        inserted := w.insertChapters(ctx, job.DocumentID, chapters)

        // P1-D1 : mettre à jour le statut du document à ANALYSE + remplir
        // themesDetectes + resumeAnalyse à partir des chapters.
        themesJSON := w.extractThemesFromChapters(chapters)
        resume := w.generateResumeFromChapters(chapters)
        w.markAnalysisSuccess(ctx, job.DocumentID, themesJSON, resume)

        w.logger.Info("Document analyzed successfully", "documentId", job.DocumentID, "chapters", inserted)
}

// markAnalysisSuccess met à jour le document : statut=ANALYSE + themes + resume (P1-D1).
func (w *DocumentAnalyzerWorker) markAnalysisSuccess(ctx context.Context, documentID, themes, resume string) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("markAnalysisSuccess: begin tx failed", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        _, err = tx.Exec(ctx, `
                UPDATE "Document"
                SET "statutAnalyse" = 'ANALYSE',
                    "themesDetectes" = $1,
                    "resumeAnalyse" = $2,
                    "erreurAnalyse" = NULL,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $3
        `, themes, resume, documentID)
        if err != nil {
                w.logger.Error("markAnalysisSuccess: update failed", "error", err, "documentId", documentID)
                return
        }
        tx.Commit(ctx)
}

// markAnalysisError met à jour le document : statut=ERREUR + erreurAnalyse (P1-D1).
func (w *DocumentAnalyzerWorker) markAnalysisError(ctx context.Context, documentID, errorMsg string) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("markAnalysisError: begin tx failed", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        _, err = tx.Exec(ctx, `
                UPDATE "Document"
                SET "statutAnalyse" = 'ERREUR',
                    "erreurAnalyse" = $1,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $2
        `, errorMsg, documentID)
        if err != nil {
                w.logger.Error("markAnalysisError: update failed", "error", err, "documentId", documentID)
                return
        }
        tx.Commit(ctx)
}

// extractThemesFromChapters sérialise les titres de chapters en JSON string.
func (w *DocumentAnalyzerWorker) extractThemesFromChapters(chapters []parsedChapter) string {
        themes := make([]string, len(chapters))
        for i, c := range chapters {
                themes[i] = c.Titre
        }
        data, err := json.Marshal(themes)
        if err != nil {
                return "[]"
        }
        return string(data)
}

// generateResumeFromChapters génère un résumé court à partir des chapters.
func (w *DocumentAnalyzerWorker) generateResumeFromChapters(chapters []parsedChapter) string {
        if len(chapters) == 0 {
                return ""
        }
        resume := fmt.Sprintf("Document analysé en %d chapitre(s) : ", len(chapters))
        for i, c := range chapters {
                if i > 0 {
                        resume += ", "
                }
                resume += c.Titre
        }
        return resume
}

func (w *DocumentAnalyzerWorker) getDocumentContent(ctx context.Context, documentID string) (string, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return "", fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        var content *string
        err = tx.QueryRow(ctx, `SELECT "contenuTexte" FROM "Document" WHERE "id" = $1`, documentID).Scan(&content)
        if err != nil {
                return "", fmt.Errorf("query document: %w", err)
        }

        tx.Commit(ctx)
        if content == nil {
                return "", nil
        }
        return *content, nil
}

func (w *DocumentAnalyzerWorker) countChapters(ctx context.Context, documentID string) (int, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, err
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        var count int
        err = tx.QueryRow(ctx, `SELECT count(*) FROM "Chapter" WHERE "documentId" = $1`, documentID).Scan(&count)
        tx.Commit(ctx)
        return count, err
}

func (w *DocumentAnalyzerWorker) buildAnalysisPrompt(content string) []ChatMessage {
        systemPrompt := `Tu es un assistant pédagogique expert. Analyse le document fourni et découpe-le en chapitres logiques.
Pour chaque chapitre, extrais :
- titre : un titre court et descriptif
- sujets : une liste de 3-5 mots-clés/thèmes abordés dans ce chapitre

Réponds UNIQUEMENT avec un tableau JSON valide de cette forme :
[
  { "titre": "Introduction aux variables", "sujets": ["variable", "affectation", "type"] },
  { "titre": "Structures de contrôle", "sujets": ["if", "else", "boucle", "while"] }
]

Ne mets PAS de markdown autour. Réponds avec le JSON brut.`

        userPrompt := fmt.Sprintf(`Voici le contenu du document à analyser :

%s

Découpe ce document en chapitres logiques (3 à 10 chapitres maximum).`, content)

        return []ChatMessage{
                {Role: "system", Content: systemPrompt},
                {Role: "user", Content: userPrompt},
        }
}

type parsedChapter struct {
        Titre  string   `json:"titre"`
        Sujets []string `json:"sujets"`
}

func (w *DocumentAnalyzerWorker) parseChapters(raw string) ([]parsedChapter, error) {
        jsonStr := raw
        if idx := strings.Index(raw, "["); idx >= 0 {
                endIdx := strings.LastIndex(raw, "]")
                if endIdx > idx {
                        jsonStr = raw[idx : endIdx+1]
                }
        }

        var chapters []parsedChapter
        if err := json.Unmarshal([]byte(jsonStr), &chapters); err != nil {
                return nil, fmt.Errorf("parse JSON: %w", err)
        }
        return chapters, nil
}

func (w *DocumentAnalyzerWorker) insertChapters(ctx context.Context, documentID string, chapters []parsedChapter) int {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("Failed to begin tx for chapters", "error", err)
                return 0
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        inserted := 0
        for i, ch := range chapters {
                sujetsJSON, _ := json.Marshal(ch.Sujets)
                _, err := tx.Exec(ctx, `
                        INSERT INTO "Chapter" ("id", "documentId", "titre", "ordre", "sujets", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, uuid.NewString(), documentID, ch.Titre, i+1, string(sujetsJSON))
                if err != nil {
                        w.logger.Error("Failed to insert chapter", "error", err, "titre", ch.Titre)
                        continue
                }
                inserted++
        }

        tx.Commit(ctx)
        return inserted
}

func (w *DocumentAnalyzerWorker) RecoverInterruptedAnalyses(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverAnalyses: failed to begin tx", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SET LOCAL row_security = off")

        rows, err := tx.Query(ctx, `
                SELECT d."id"
                FROM "Document" d
                WHERE d."contenuTexte" IS NOT NULL
                  AND d."deletedAt" IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM "Chapter" c WHERE c."documentId" = d."id"
                  )
        `)
        if err != nil {
                w.logger.Error("RecoverAnalyses: query failed", "error", err)
                return
        }
        defer rows.Close()

        recovered := 0
        for rows.Next() {
                var docID string
                if err := rows.Scan(&docID); err != nil {
                        continue
                }
                select {
                case DocumentAnalysisQueue <- DocumentAnalysisJob{DocumentID: docID}:
                        recovered++
                default:
                        w.logger.Warn("DocumentAnalysisQueue full, skipping", "docId", docID)
                }
        }

        tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted document analyses", "count", recovered)
        } else {
                w.logger.Info("No interrupted document analyses to recover")
        }
}
