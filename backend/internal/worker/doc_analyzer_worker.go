package worker

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"

        "github.com/udevrard7/sect/backend/internal/ai"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// DOC-ANALYZER-1 : Worker d'analyse automatique des documents.
//
// Au moment de l'upload d'un document par l'enseignant, le backend
// déclenche l'analyse en arrière-plan. Ce worker :
//   1. Lit le contenu textuel du document depuis la DB
//   2. Demande à l'IA une cartographie pédagogique complète (SECT-DOC-IA-1 :
//      chapitres + thèmes + concepts clés + volume de questions estimé +
//      résumé pédagogique + niveau + temps de lecture — avant : seuls les
//      chapitres, avec un résumé fabriqué par concaténation de titres et
//      conceptsCles/volumeEstime JAMAIS remplis alors que le frontend les
//      affiche)
//   3. Insère les chapitres dans la table Chapter
//   4. Met à jour le document : statut=ANALYSE + champs d'analyse
//
// Une fois les chapitres créés, l'étudiant peut :
//   - Filtrer par chapitre dans l'onglet Entraînement
//   - Voir les lacunes par chapitre dans le Dashboard
//
// SECT-DOC-IA-1 — Force : le bouton « Analyser avec l'IA » envoie un job
// forcé qui REPREND l'analyse à zéro (suppression des chapitres existants
// puis régénération). Avant, le worker SKIPPait les documents déjà analysés
// sans réinitialiser le statut EN_COURS posé par le handler → le document
// restait « Analyse en cours... » à VIE (statut posé, jamais raboté).

type DocumentAnalysisJob struct {
        DocumentID string `json:"documentId"`
        // Force : true = re-analyse (purge des chapitres existants d'abord).
        // False = analyse initiale (skip si chapitres déjà présents).
        Force bool `json:"force,omitempty"`
}

var DocumentAnalysisQueue = make(chan DocumentAnalysisJob, 50)

type DocumentAnalyzerWorker struct {
        dbPool    *pgxpool.Pool
        logger    *slog.Logger
        aiService *ai.AIService // failover support
        docRepo   domain.DocumentRepository
}

func NewDocumentAnalyzerWorker(dbPool *pgxpool.Pool, logger *slog.Logger, aiService *ai.AIService, docRepo domain.DocumentRepository) *DocumentAnalyzerWorker {
        return &DocumentAnalyzerWorker{dbPool: dbPool, logger: logger, aiService: aiService, docRepo: docRepo}
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
                                w.logger.Info("Analyzing document", "documentId", job.DocumentID, "force", job.Force)
                                w.processAnalysisJob(ctx, job)
                        }
                }
        }()
}

func (w *DocumentAnalyzerWorker) processAnalysisJob(ctx context.Context, job DocumentAnalysisJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("Document Analyzer panic recovered", "error", r, "documentId", job.DocumentID)
                        w.markAnalysisError(ctx, job.DocumentID, "erreur interne du worker d'analyse")
                }
        }()

        // 1. Skip if already analyzed (sauf re-analyse forcée)
        existing, _ := w.countChapters(ctx, job.DocumentID)
        if existing > 0 {
                if job.Force {
                        // SECT-DOC-IA-1 : purge des chapitres avant régénération.
                        if err := w.docRepo.DeleteChapters(ctx, job.DocumentID); err != nil {
                                w.logger.Error("Failed to delete chapters for re-analysis", "error", err, "documentId", job.DocumentID)
                                w.markAnalysisError(ctx, job.DocumentID, "impossible de purger les anciens chapitres")
                                return
                        }
                        w.logger.Info("Chapters purged for re-analysis", "documentId", job.DocumentID, "previous", existing)
                } else {
                        // Déjà analysé. SECT-DOC-IA-1 : on RABOTE un éventuel statut
                        // EN_COURS résiduel (bug historique : handler → EN_COURS puis
                        // skip silencieux → « Analyse en cours... » éternel).
                        analyse := domain.StatutAnalyseAnalyse
                        _ = w.docRepo.UpdateAnalysis(ctx, job.DocumentID, domain.UpdateAnalysisInput{
                                StatutAnalyse: &analyse,
                        })
                        w.logger.Info("Document already analyzed, skipping", "documentId", job.DocumentID, "chapters", existing)
                        return
                }
        }

        // 2. Get document content
        content, err := w.getDocumentContent(ctx, job.DocumentID)
        if err != nil {
                w.logger.Error("Failed to get document content", "error", err, "documentId", job.DocumentID)
                return
        }
        if len(strings.TrimSpace(content)) < 50 {
                // SECT-DOC-IA-1 : avant, skip silencieux → EN_COURS éternel si le
                // handler avait déjà posé le statut. Message actionnable à la place.
                w.markAnalysisError(ctx, job.DocumentID, "contenu textuel trop court pour une analyse pertinente (re-déposez un document avec du texte)")
                w.logger.Info("Document content too short, skipping", "documentId", job.DocumentID, "len", len(content))
                return
        }

        // 3. Truncate to 15k chars — borne de coût/latence IA : suffisante pour
        // le découpage (les chapitres reflètent la STRUCTURE du support,
        // lisible sur le début du document), sans épuiser le budget des
        // providers gratuits.
        if len(content) > 15000 {
                content = content[:15000] + "\n... [contenu tronqué]"
        }

        // 4. Build prompt
        messages := w.buildAnalysisPrompt(content)

        // 5. Convert worker.ChatMessage → ai.ChatMessage and call AI with failover
        aiMessages := make([]ai.ChatMessage, len(messages))
        for i, m := range messages {
                aiMessages[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
        }
        result, err := w.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                w.logger.Error("AI call failed (all providers exhausted)", "error", err, "documentId", job.DocumentID)
                w.markAnalysisError(ctx, job.DocumentID, fmt.Sprintf("erreur API IA: %v", err))
                return
        }

        // 6. Parse the pedagogical analysis
        analysis, err := w.parseAnalysis(result.Content)
        if err != nil {
                w.logger.Error("Failed to parse analysis", "error", err, "documentId", job.DocumentID)
                w.markAnalysisError(ctx, job.DocumentID, "réponse IA illisible")
                return
        }

        // 7. Insert chapters
        inserted := w.insertChapters(ctx, job.DocumentID, analysis.Chapters)

        // 8. SECT-DOC-IA-1 : mettre à jour le document avec l'analyse complète
        // (statut ANALYSE + themesDetectes + conceptsCles + volumeEstime +
        // resumeAnalyse enrichi).
        w.markAnalysisSuccess(ctx, job.DocumentID, analysis, inserted)

        w.logger.Info("Document analyzed successfully", "documentId", job.DocumentID, "chapters", inserted)
}

// analysisLLM — SECT-DOC-IA-1 : miroir du JSON attendu du LLM. L'analyse
// couvre désormais toute la carte pédagogique du support (ingénierie
// pédagogique : structure, concepts, volume d'entraînement possible,
// niveau cible, temps de lecture), pas seulement le découpage.
type analysisLLM struct {
        Chapters []parsedChapter `json:"chapters"`
        Themes   []string        `json:"themesDetectes"`
        Concepts []string        `json:"conceptsCles"`
        Volume   map[string]int  `json:"volumeEstime"`
        Resume   string          `json:"resume"`
        Niveau   string          `json:"niveauEstime"`
        TempsMin int             `json:"tempsLectureMin"`
}

// markAnalysisSuccess met à jour le document : statut=ANALYSE + toute la
// cartographie pédagogique (SECT-DOC-IA-1). Fallbacks dégradés mais
// honnêtes : si l'IA omet un champ, on retombe sur les chapitres.
func (w *DocumentAnalyzerWorker) markAnalysisSuccess(ctx context.Context, documentID string, a *analysisLLM, inserted int) {
        // Thèmes : ceux de l'IA, sinon les titres de chapitres.
        themes := a.Themes
        if len(themes) == 0 {
                for _, c := range a.Chapters {
                        themes = append(themes, c.Titre)
                }
        }
        themesJSON := marshalJSON(themes)

        // Concepts clés : ceux de l'IA, sinon l'union des sujets de chapitres.
        concepts := a.Concepts
        if len(concepts) == 0 {
                seen := map[string]bool{}
                for _, c := range a.Chapters {
                        for _, s := range c.Sujets {
                                if !seen[s] {
                                        seen[s] = true
                                        concepts = append(concepts, s)
                                }
                        }
                }
                // Borné à 12 pour rester lisible sur la fiche.
                if len(concepts) > 12 {
                        concepts = concepts[:12]
                }
        }
        conceptsJSON := ""
        if len(concepts) > 0 {
                conceptsJSON = marshalJSON(concepts)
        }

        // Volume estimé de questions : que les types valides.
        vol := map[string]int{}
        for _, t := range []string{"QCU", "QCM", "QRC", "TRS"} {
                if n, ok := a.Volume[t]; ok && n > 0 {
                        vol[t] = n
                }
        }
        volumeJSON := ""
        if len(vol) > 0 {
                volumeJSON = marshalJSON(vol)
        }

        // Résumé pédagogique : texte de l'IA + ligne de synthèse méta.
        var resume strings.Builder
        if strings.TrimSpace(a.Resume) != "" {
                resume.WriteString(strings.TrimSpace(a.Resume))
        } else {
                fmt.Fprintf(&resume, "Support analysé et découpé en %d chapitre(s).", inserted)
        }
        resume.WriteString("\n\n")
        fmt.Fprintf(&resume, "Niveau estimé : %s · Temps de lecture : ~%s min · %d chapitre(s)",
                niveauOrDash(a.Niveau), tempsOrDash(a.TempsMin), inserted)

        statut := domain.StatutAnalyseAnalyse
        err := w.docRepo.UpdateAnalysis(ctx, documentID, domain.UpdateAnalysisInput{
                StatutAnalyse:      &statut,
                ThemesDetectes:     &themesJSON,
                ResumeAnalyse:      strPtr(resume.String()),
                ClearErreurAnalyse: true,
        })
        if err != nil {
                w.logger.Error("markAnalysisSuccess: update failed", "error", err, "documentId", documentID)
                return
        }
        // conceptsCles/volumeEstime : COALESCE — on ne les pose que s'ils ont
        // une valeur (sinon nil = inchangé, un reste vide reste vide).
        if conceptsJSON != "" {
                _ = w.docRepo.UpdateAnalysis(ctx, documentID, domain.UpdateAnalysisInput{ConceptsCles: &conceptsJSON})
        }
        if volumeJSON != "" {
                _ = w.docRepo.UpdateAnalysis(ctx, documentID, domain.UpdateAnalysisInput{VolumeEstime: &volumeJSON})
        }
}

func niveauOrDash(n string) string {
        n = strings.TrimSpace(n)
        if n == "" {
                return "indéterminé"
        }
        return n
}

func tempsOrDash(m int) string {
        if m <= 0 {
                return "?"
        }
        return fmt.Sprintf("%d", m)
}

func strPtr(s string) *string { return &s }

func marshalJSON(v any) string {
        data, err := json.Marshal(v)
        if err != nil {
                return "[]"
        }
        return string(data)
}

// markAnalysisError met à jour le document : statut=ERREUR + erreurAnalyse
// (P1-D1). Passe par le repo (claims system) — même sémantique COALESCE.
func (w *DocumentAnalyzerWorker) markAnalysisError(ctx context.Context, documentID, errorMsg string) {
        statut := domain.StatutAnalyseErreur
        err := w.docRepo.UpdateAnalysis(ctx, documentID, domain.UpdateAnalysisInput{
                StatutAnalyse: &statut,
                ErreurAnalyse: &errorMsg,
        })
        if err != nil {
                w.logger.Error("markAnalysisError: update failed", "error", err, "documentId", documentID)
        }
}

func (w *DocumentAnalyzerWorker) getDocumentContent(ctx context.Context, documentID string) (string, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return "", fmt.Errorf("begin tx: %w", err)
        }
        defer func() { _ = tx.Rollback(ctx) }()

        _, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var content *string
        err = tx.QueryRow(ctx, `SELECT "contenuTexte" FROM "Document" WHERE "id" = $1`, documentID).Scan(&content)
        if err != nil {
                return "", fmt.Errorf("query document: %w", err)
        }

        _ = tx.Commit(ctx)
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
        defer func() { _ = tx.Rollback(ctx) }()

        _, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var count int
        err = tx.QueryRow(ctx, `SELECT count(*) FROM "Chapter" WHERE "documentId" = $1`, documentID).Scan(&count)
        _ = tx.Commit(ctx)
        return count, err
}

// buildAnalysisPrompt — SECT-DOC-IA-1 : prompt d'expert Edtech. Le LLM
// produit la carte pédagogique COMPLÈTE du support en un seul appel :
// structure (chapitres), thèmes, concepts clés, volume d'entraînement
// estimé par type de question (liés au générateur d'épreuves QCU/QCM/
// QRC/TRS), résumé orienté apprentissage (public, prérequis, objectifs),
// niveau CECI (L1→M2) et temps de lecture.
func (w *DocumentAnalyzerWorker) buildAnalysisPrompt(content string) []ChatMessage {
        systemPrompt := `Tu es un expert en ingénierie pédagogique (Edtech) pour l'enseignement supérieur ivoirien et francophone.
Analyse le support de cours fourni et produis sa cartographie pédagogique complète.

Réponds UNIQUEMENT avec un objet JSON valide de cette forme exacte :
{
  "chapters": [
    { "titre": "Introduction aux variables", "sujets": ["variable", "affectation", "type"] }
  ],
  "themesDetectes": ["thème global 1", "thème global 2"],
  "conceptsCles": ["concept fondamental 1", "concept fondamental 2"],
  "volumeEstime": { "QCU": 15, "QCM": 10, "QRC": 5, "TRS": 2 },
  "niveauEstime": "L1",
  "tempsLectureMin": 45,
  "resume": "Résumé pédagogique de 3 à 5 phrases : sujet du support, public visé, prérequis, objectifs d'apprentissage."
}

Règles :
- chapters : 3 à 10 chapitres logiques couvrant la progression du support, dans l'ordre.
- sujets : 3 à 5 mots-clés par chapitre.
- themesDetectes : 3 à 6 thèmes transversaux du document.
- conceptsCles : 5 à 10 concepts fondamentaux qu'un étudiant doit maîtriser.
- volumeEstime : nombre de questions ENTRAÎNABLES que le support permet de générer, par type (QCM à choix multiple, QCU à choix unique, QRC réponse courte, TRS texte à trous). Estimation honnête basée sur la densité du contenu.
- niveauEstime : L1, L2, L3, M1, M2 ou "Doctorat".
- tempsLectureMin : temps de lecture studieuse estimée.
- resume : en français, orienté apprentissage (pas un simple résumé de contenu).
Ne mets PAS de markdown autour. Réponds avec le JSON brut.`

        userPrompt := fmt.Sprintf(`Voici le contenu du document à analyser :

%s

Produis la cartographie pédagogique complète.`, content)

        return []ChatMessage{
                {Role: "system", Content: systemPrompt},
                {Role: "user", Content: userPrompt},
        }
}

type parsedChapter struct {
        Titre  string   `json:"titre"`
        Sujets []string `json:"sujets"`
}

// parseAnalysis parse la réponse du LLM — objet complet v2, avec fallback
// sur l'ancien format (tableau de chapitres nu) pour tolérer un modèle
// qui ignorerait le schéma.
func (w *DocumentAnalyzerWorker) parseAnalysis(raw string) (*analysisLLM, error) {
        jsonStr := extractJSON(raw)

        var a analysisLLM
        if err := json.Unmarshal([]byte(jsonStr), &a); err == nil && len(a.Chapters) > 0 {
                return &a, nil
        }

        // Fallback : ancien format [ { "titre": ..., "sujets": [...] } ]
        var chapters []parsedChapter
        if err := json.Unmarshal([]byte(jsonStr), &chapters); err == nil && len(chapters) > 0 {
                return &analysisLLM{Chapters: chapters}, nil
        }

        return nil, fmt.Errorf("parse JSON: aucun chapitre exploitable")
}

// extractJSON isole le JSON de la réponse (tolère les balises ```json```
// et le texte parasite avant/après — réalité de terrain des LLM).
func extractJSON(raw string) string {
        s := strings.TrimSpace(raw)
        // Balises markdown.
        if i := strings.Index(s, "```"); i >= 0 {
                if j := strings.Index(s[i+3:], "\n"); j >= 0 {
                        s = s[i+3+j+1:]
                }
                if k := strings.LastIndex(s, "```"); k >= 0 {
                        s = s[:k]
                }
                s = strings.TrimSpace(s)
        }
        // Objet complet prioritaire.
        if idx := strings.Index(s, "{"); idx >= 0 {
                if end := strings.LastIndex(s, "}"); end > idx {
                        return s[idx : end+1]
                }
        }
        // Sinon tableau (ancien format).
        if idx := strings.Index(s, "["); idx >= 0 {
                if end := strings.LastIndex(s, "]"); end > idx {
                        return s[idx : end+1]
                }
        }
        return s
}

func (w *DocumentAnalyzerWorker) insertChapters(ctx context.Context, documentID string, chapters []parsedChapter) int {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("Failed to begin tx for chapters", "error", err)
                return 0
        }
        defer func() { _ = tx.Rollback(ctx) }()

        _, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

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

        _ = tx.Commit(ctx)
        return inserted
}

func (w *DocumentAnalyzerWorker) RecoverInterruptedAnalyses(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverAnalyses: failed to begin tx", "error", err)
                return
        }
        defer func() { _ = tx.Rollback(ctx) }()

        _, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        // SECT-DOC-IA-1 — hygiène de démarrage : les documents restés EN_COURS
        // ALORS qu'ils ont déjà des chapitres sont des analyses interrompues
        // entre insertChapters et markAnalysisSuccess (crash worker) ou des
        // vestiges du bug « re-analyse skippée sans raboter le statut ». Ils
        // SONT analysés : on normalise vers ANALYSE plutôt que de les laisser
        // tourner « Analyse en cours... » éternellement.
        ct, err := tx.Exec(ctx, `
                UPDATE "Document" d
                SET "statutAnalyse" = 'ANALYSE', "updatedAt" = CURRENT_TIMESTAMP
                WHERE d."statutAnalyse" = 'EN_COURS'
                  AND d."deletedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM "Chapter" c WHERE c."documentId" = d."id")
        `)
        if err == nil && ct.RowsAffected() > 0 {
                w.logger.Info("Normalized stuck EN_COURS documents to ANALYSE", "count", ct.RowsAffected())
        }

        // SECT-DOC-IA-1 — vestiges du bug « handler → EN_COURS + worker skip
        // silencieux » sur des PDF SANS texte extrait (v1) : EN_COURS sans
        // chapitres NI contenuTexte ne se résoudra jamais seul. On les repasse
        // EN_ATTENTE (actionnable : le bouton « Analyser » re-extrait le texte
        // via la chaîne v2 — pdftotext/OOXML — avant de lancer l'IA). L'ancienne
        // erreurAnalyse « extraction non disponible en Go » est purgée : fausse
        // depuis la v2.
        ct2, err := tx.Exec(ctx, `
                UPDATE "Document" d
                SET "statutAnalyse" = 'EN_ATTENTE', "erreurAnalyse" = NULL, "updatedAt" = CURRENT_TIMESTAMP
                WHERE d."statutAnalyse" = 'EN_COURS'
                  AND d."deletedAt" IS NULL
                  AND d."contenuTexte" IS NULL
                  AND NOT EXISTS (SELECT 1 FROM "Chapter" c WHERE c."documentId" = d."id")
        `)
        if err == nil && ct2.RowsAffected() > 0 {
                w.logger.Info("Normalized stuck EN_COURS documents (no text) to EN_ATTENTE", "count", ct2.RowsAffected())
        }

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

        _ = tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted document analyses", "count", recovered)
        } else {
                w.logger.Info("No interrupted document analyses to recover")
        }
}
