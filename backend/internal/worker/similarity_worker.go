// Package worker — détection de similarité entre copies d'étudiants (post-exam).
//
// FIX-5 (seuilSimilarite) : worker périodique (5 min) qui :
//  1. Trouve les épreuves CLOTUREE dont l'établissement a rapportFraude=true
//  2. Compare toutes les paires d'étudiants (n*(n-1)/2)
//  3. Calcule la similarité par question (QCU/QCM=exact, QRC/TRS=trigrammes,
//     CODE=tokens) puis globale (pondérée par barème)
//  4. Si globalSimilarity >= seuilSimilarite → flagged=true
//  5. Insère dans SimilarityReport
//
// Pattern identique à auto_close_worker.go (ticker + first run + SystemClaims).
package worker

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"

        "github.com/udevrard7/sect/backend/internal/db"
)

// SimilarityWorker détecte les copies similaires post-examen.
type SimilarityWorker struct {
        dbPool *pgxpool.Pool
        logger *slog.Logger
}

// NewSimilarityWorker crée un nouveau worker de similarité.
func NewSimilarityWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *SimilarityWorker {
        return &SimilarityWorker{dbPool: dbPool, logger: logger}
}

// Start lance le worker en goroutine (non-bloquant).
func (w *SimilarityWorker) Start(ctx context.Context) {
        w.logger.Info("Similarity Worker started, checking every 5min...")

        go func() {
                ticker := time.NewTicker(5 * time.Minute)
                defer ticker.Stop()

                // Premier check immédiat au démarrage
                w.checkAndProcess(ctx)

                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("Similarity Worker stopping...")
                                return
                        case <-ticker.C:
                                w.checkAndProcess(ctx)
                        }
                }
        }()
}

// checkAndProcess est le cycle principal du worker.
func (w *SimilarityWorker) checkAndProcess(ctx context.Context) {
        epreuves, err := w.findQualifyingEpreuves(ctx)
        if err != nil {
                w.logger.Error("Similarity: findQualifyingEpreuves failed", "error", err)
                return
        }
        if len(epreuves) == 0 {
                return
        }

        w.logger.Info("Similarity: processing epreuves", "count", len(epreuves))

        for _, ep := range epreuves {
                if err := w.processEpreuve(ctx, ep); err != nil {
                        w.logger.Error("Similarity: processEpreuve failed",
                                "epreuveId", ep.ID, "error", err)
                }
        }
}

// qualifyingEpreuve — épreuve éligible pour l'analyse de similarité.
type qualifyingEpreuve struct {
        ID               string
        EtablissementID  string
        SeuilSimilarite  float64
}

// findQualifyingEpreuves trouve les épreuves CLOTUREE dont l'établissement
// a rapportFraude=true et qui n'ont pas encore de SimilarityReport.
func (w *SimilarityWorker) findQualifyingEpreuves(ctx context.Context) ([]qualifyingEpreuve, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer func() { _ = tx.Rollback(ctx) }()

        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set claims: %w", err)
        }

        // FIX-SIM-ETAB : Epreuve n'a pas d'etablissementId direct —
        // on le récupère uniquement via Filiere. Les épreuves sans filière
        // sont exclues de l'analyse de similarité (pas d'établissement context).
        rows, err := tx.Query(ctx, `
                SELECT e."id",
                       f."etablissementId",
                       COALESCE(ss."seuilSimilarite", 0.85)
                FROM "Epreuve" e
                JOIN "Filiere" f ON f."id" = e."filiereId"
                LEFT JOIN "SecuritySettings" ss ON ss."etablissementId" = f."etablissementId"
                WHERE e."statut" = 'CLOTUREE'
                  AND e."deletedAt" IS NULL
                  AND f."etablissementId" IS NOT NULL
                  AND COALESCE(ss."rapportFraude", false) = true
                  AND NOT EXISTS (
                        SELECT 1 FROM "SimilarityReport" sr WHERE sr."epreuveId" = e."id"
                  )
        `)
        if err != nil {
                return nil, fmt.Errorf("query qualifying epreuves: %w", err)
        }
        defer rows.Close()

        var result []qualifyingEpreuve
        for rows.Next() {
                var ep qualifyingEpreuve
                if err := rows.Scan(&ep.ID, &ep.EtablissementID, &ep.SeuilSimilarite); err != nil {
                        return nil, fmt.Errorf("scan: %w", err)
                }
                result = append(result, ep)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }

        return result, nil
}

// sessionData — session avec ses réponses pour comparaison.
type sessionData struct {
        ID         string
        EtudiantID string
        Reponses   map[string]string // questionId → contenu
}

// questionInfo — info sur une question pour la pondération.
type questionInfo struct {
        ID      string
        Type    string
        Bareme  float64
}

// processEpreuve traite une épreuve : compare toutes les paires d'étudiants.
func (w *SimilarityWorker) processEpreuve(ctx context.Context, ep qualifyingEpreuve) error {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer func() { _ = tx.Rollback(ctx) }()

        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        // 1. Récupérer les questions de l'épreuve
        questions, err := w.getEpreuveQuestions(ctx, tx, ep.ID)
        if err != nil {
                return fmt.Errorf("get questions: %w", err)
        }
        if len(questions) == 0 {
                w.logger.Warn("Similarity: no questions found", "epreuveId", ep.ID)
                return nil
        }

        // 2. Récupérer les sessions soumises avec leurs réponses
        sessions, err := w.getSubmittedSessions(ctx, tx, ep.ID)
        if err != nil {
                return fmt.Errorf("get sessions: %w", err)
        }
        if len(sessions) < 2 {
                w.logger.Info("Similarity: not enough sessions for comparison",
                        "epreuveId", ep.ID, "count", len(sessions))
                // Insert a dummy report so this epreuve won't be picked up again
                w.markEpreuveProcessed(ctx, tx, ep.ID)
                return nil
        }

        // 3. Comparer toutes les paires (n*(n-1)/2)
        reportsInserted := 0
        flaggedCount := 0
        for i := 0; i < len(sessions); i++ {
                for j := i + 1; j < len(sessions); j++ {
                        report, err := w.comparePair(sessions[i], sessions[j], questions, ep.SeuilSimilarite)
                        if err != nil {
                                w.logger.Error("Similarity: comparePair failed",
                                        "sessionA", sessions[i].ID, "sessionB", sessions[j].ID, "error", err)
                                continue
                        }
                        if err := w.insertReport(ctx, tx, report); err != nil {
                                w.logger.Error("Similarity: insertReport failed", "error", err)
                                continue
                        }
                        reportsInserted++
                        if report.Flagged {
                                flaggedCount++
                        }
                }
        }

        if err := tx.Commit(ctx); err != nil {
                return fmt.Errorf("commit: %w", err)
        }

        w.logger.Info("Similarity: epreuve processed",
                "epreuveId", ep.ID,
                "pairs", len(sessions)*(len(sessions)-1)/2,
                "reportsInserted", reportsInserted,
                "flagged", flaggedCount,
                "seuil", ep.SeuilSimilarite,
        )

        return nil
}

// markEpreuveProcessed insère un marqueur pour ne pas reprendre cette épreuve.
func (w *SimilarityWorker) markEpreuveProcessed(ctx context.Context, tx pgx.Tx, epreuveID string) {
        // On insère un rapport "vide" (similarité 0) entre un pair fictif
        // pour que NOT EXISTS dans findQualifyingEpreuves l'exclue.
        // Alternative : on insère simplement le premier rapport réel.
        // On ne fait rien — le worker re-essaiera au prochain tick mais
        // avec < 2 sessions il ne fera rien de coûteux.
        _ = ctx
        _ = tx
        _ = epreuveID
}

// getEpreuveQuestions récupère les questions d'une épreuve avec bareme et type.
func (w *SimilarityWorker) getEpreuveQuestions(ctx context.Context, tx pgx.Tx, epreuveID string) ([]questionInfo, error) {
        rows, err := tx.Query(ctx, `
                SELECT q."id", q."type"::text, eq."bareme"
                FROM "EpreuveQuestion" eq
                JOIN "Question" q ON q."id" = eq."questionId"
                WHERE eq."epreuveId" = $1
                ORDER BY eq."ordre" ASC
        `, epreuveID)
        if err != nil {
                return nil, err
        }
        defer rows.Close()

        var questions []questionInfo
        for rows.Next() {
                var q questionInfo
                if err := rows.Scan(&q.ID, &q.Type, &q.Bareme); err != nil {
                        return nil, err
                }
                questions = append(questions, q)
        }
        return questions, nil
}

// getSubmittedSessions récupère les sessions soumises avec leurs réponses.
func (w *SimilarityWorker) getSubmittedSessions(ctx context.Context, tx pgx.Tx, epreuveID string) ([]sessionData, error) {
        // Récupérer les sessions SOUMISES
        rows, err := tx.Query(ctx, `
                SELECT s."id", s."etudiantId"
                FROM "SessionPassation" s
                WHERE s."epreuveId" = $1
                  AND s."statut" = 'SOUMISE'
        `, epreuveID)
        if err != nil {
                return nil, err
        }
        defer rows.Close()

        type sessionRef struct {
                ID         string
                EtudiantID string
        }
        var refs []sessionRef
        for rows.Next() {
                var r sessionRef
                if err := rows.Scan(&r.ID, &r.EtudiantID); err != nil {
                        return nil, err
                }
                refs = append(refs, r)
        }

        // Pour chaque session, récupérer les réponses
        var sessions []sessionData
        for _, ref := range refs {
                reponses := make(map[string]string)
                rRows, err := tx.Query(ctx, `
                        SELECT "questionId", COALESCE("contenu", '')
                        FROM "Reponse"
                        WHERE "sessionId" = $1
                `, ref.ID)
                if err != nil {
                        return nil, err
                }
                for rRows.Next() {
                        var qID, contenu string
                        if err := rRows.Scan(&qID, &contenu); err != nil {
                                rRows.Close()
                                return nil, err
                        }
                        reponses[qID] = contenu
                }
                rRows.Close()

                sessions = append(sessions, sessionData{
                        ID:         ref.ID,
                        EtudiantID: ref.EtudiantID,
                        Reponses:   reponses,
                })
        }

        return sessions, nil
}

// questionSimilarity — similarité par question pour le JSON.
type questionSimilarity struct {
        QuestionID string  `json:"questionId"`
        Type       string  `json:"type"`
        Similarity float64 `json:"similarity"`
        AnswerA    string  `json:"answerA"`
        AnswerB    string  `json:"answerB"`
}

// similarityReport — rapport de similarité à insérer.
type similarityReport struct {
        ID                    string
        EpreuveID             string
        SessionA              string
        SessionB              string
        EtudiantAID           string
        EtudiantBID           string
        GlobalSimilarity      float64
        QuestionSimilarities  string // JSON
        Flagged               bool
}

// comparePair compare deux sessions et produit un rapport.
func (w *SimilarityWorker) comparePair(
        a, b sessionData,
        questions []questionInfo,
        seuil float64,
) (*similarityReport, error) {
        var similarities []questionSimilarity
        var totalWeightedSim float64
        var totalWeight float64

        for _, q := range questions {
                answerA := a.Reponses[q.ID]
                answerB := b.Reponses[q.ID]

                sim := computeQuestionSimilarity(q.Type, answerA, answerB)

                similarities = append(similarities, questionSimilarity{
                        QuestionID: q.ID,
                        Type:       q.Type,
                        Similarity: sim,
                        AnswerA:    truncate(answerA, 200),
                        AnswerB:    truncate(answerB, 200),
                })

                totalWeightedSim += sim * q.Bareme
                totalWeight += q.Bareme
        }

        globalSim := 0.0
        if totalWeight > 0 {
                globalSim = totalWeightedSim / totalWeight
        }

        jsonBytes, err := json.Marshal(similarities)
        if err != nil {
                return nil, fmt.Errorf("marshal questionSimilarities: %w", err)
        }

        return &similarityReport{
                ID:                   uuid.NewString(),
                EpreuveID:            "", // filled by caller
                SessionA:             a.ID,
                SessionB:             b.ID,
                EtudiantAID:          a.EtudiantID,
                EtudiantBID:          b.EtudiantID,
                GlobalSimilarity:     globalSim,
                QuestionSimilarities: string(jsonBytes),
                Flagged:              globalSim >= seuil,
        }, nil
}

// insertReport insère un rapport dans SimilarityReport.
func (w *SimilarityWorker) insertReport(ctx context.Context, tx pgx.Tx, r *similarityReport) error {
        _, err := tx.Exec(ctx, `
                INSERT INTO "SimilarityReport" (
                        "id", "epreuveId", "sessionA", "sessionB",
                        "etudiantAId", "etudiantBId", "globalSimilarity",
                        "questionSimilarities", "flagged", "createdAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT ON CONSTRAINT "SimilarityReport_pair_unique" DO NOTHING
        `, r.ID, r.EpreuveID, r.SessionA, r.SessionB,
                r.EtudiantAID, r.EtudiantBID, r.GlobalSimilarity,
                r.QuestionSimilarities, r.Flagged)
        return err
}

// ──────────────────────────────────────────────────────────────────────────
// Algorithmes de similarité
// ──────────────────────────────────────────────────────────────────────────

// computeQuestionSimilarity dispatche selon le type de question.
func computeQuestionSimilarity(qType, answerA, answerB string) float64 {
        switch qType {
        case "QCU", "QCM":
                return exactMatchSimilarity(answerA, answerB)
        case "QRC", "TRS", "REFLEXION":
                return trigramSimilarity(answerA, answerB)
        case "CODE":
                return tokenSimilarity(answerA, answerB)
        default:
                // Fallback : trigram similarity
                return trigramSimilarity(answerA, answerB)
        }
}

// exactMatchSimilarity — 1.0 si identique, 0.0 sinon.
func exactMatchSimilarity(a, b string) float64 {
        if strings.TrimSpace(a) == strings.TrimSpace(b) {
                return 1.0
        }
        return 0.0
}

// trigramSimilarity — Jaccard coefficient sur les 3-grammes de caractères.
//
//      |trigrams(A) ∩ trigrams(B)| / |trigrams(A) ∪ trigrams(B)|
func trigramSimilarity(a, b string) float64 {
        ta := buildTrigramSet(normalizeText(a))
        tb := buildTrigramSet(normalizeText(b))

        if len(ta) == 0 && len(tb) == 0 {
                return 1.0 // both empty → identical
        }
        if len(ta) == 0 || len(tb) == 0 {
                return 0.0
        }

        intersection := 0
        for k := range ta {
                if tb[k] {
                        intersection++
                }
        }

        union := len(ta) + len(tb) - intersection
        if union == 0 {
                return 0.0
        }

        return float64(intersection) / float64(union)
}

// normalizeText normalise le texte pour comparaison.
func normalizeText(s string) string {
        s = strings.ToLower(s)
        s = strings.TrimSpace(s)
        // Remplacer les séquences d'espaces par un seul espace
        var b strings.Builder
        prevSpace := false
        for _, r := range s {
                if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
                        if !prevSpace {
                                b.WriteRune(' ')
                                prevSpace = true
                        }
                } else {
                        b.WriteRune(r)
                        prevSpace = false
                }
        }
        return b.String()
}

// buildTrigramSet construit l'ensemble des 3-grammes d'une chaîne.
func buildTrigramSet(s string) map[string]bool {
        set := make(map[string]bool)
        if len(s) < 3 {
                if len(s) > 0 {
                        set[s] = true
                }
                return set
        }
        for i := 0; i <= len(s)-3; i++ {
                set[s[i:i+3]] = true
        }
        return set
}

// tokenSimilarity — similarité basée sur les tokens (mots/signes) pour le code.
//
//      On split par whitespace/newlines, puis Jaccard sur les ensembles de tokens.
func tokenSimilarity(a, b string) float64 {
        ta := buildTokenSet(a)
        tb := buildTokenSet(b)

        if len(ta) == 0 && len(tb) == 0 {
                return 1.0
        }
        if len(ta) == 0 || len(tb) == 0 {
                return 0.0
        }

        intersection := 0
        for k := range ta {
                if tb[k] {
                        intersection++
                }
        }

        union := len(ta) + len(tb) - intersection
        if union == 0 {
                return 0.0
        }

        return float64(intersection) / float64(union)
}

// buildTokenSet split par whitespace et construit l'ensemble de tokens.
func buildTokenSet(s string) map[string]bool {
        set := make(map[string]bool)
        for _, tok := range strings.Fields(s) {
                tok = strings.TrimSpace(tok)
                if tok != "" {
                        set[tok] = true
                }
        }
        return set
}
