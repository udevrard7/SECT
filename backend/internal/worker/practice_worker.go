// Package worker — worker asynchrone pour la génération de questions
// d'entraînement Exam-prep.
//
// EXAM-PREP-CONNECT-1 — Étape 2a.
//
// Le handler POST /api/exam-prep/practice/generate :
//  1. Valide le body (documentId + config)
//  2. Pousse un PracticeJob dans PracticeQueue (channel Go, < 1ms)
//  3. Retourne immédiatement 202 Accepted
//
// Le worker (goroutine) consomme la queue en arrière-plan :
//  1. Lit le document (contenu texte depuis la DB)
//  2. Lit le provider IA actif via getActiveProviderShared
//  3. Construit un prompt pour générer des questions
//  4. Appelle l'IA via callAIProviderShared
//  5. Parse le JSON retourné (questions)
//  6. Insère les questions dans la table "Question" (avec documentId + auteurId)
//
// Le frontend poll ensuite /api/questions?documentId=X pour récupérer les
// questions générées (pattern identique à /api/epreuves/{id}/status).
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
	"github.com/udevrard7/sect/backend/internal/domain"
)

// PracticeJob représente une tâche de génération de questions d'entraînement.
type PracticeJob struct {
	UserID     string         `json:"userId"`
	DocumentID string         `json:"documentId"`
	Config     PracticeConfig `json:"config"`
}

// PracticeConfig contient la config de génération demandée par l'étudiant.
type PracticeConfig struct {
	NombreQuestions int               `json:"nombreQuestions"`
	TypesQuestions  map[string]int    `json:"typesQuestions"` // qcu, qcm, qrc, code, reflexion
	Difficulte      domain.Difficulte `json:"difficulte"`
	ChapterID       string            `json:"chapterId,omitempty"`
}

// PracticeQueue est la file d'attente globale (channel Go buffered).
// Buffer 100 jobs — cohérent avec GeneratorQueue.
var PracticeQueue = make(chan PracticeJob, 100)

// PracticeWorker est le worker qui consomme la queue.
type PracticeWorker struct {
	dbPool *pgxpool.Pool
	logger *slog.Logger
}

// NewPracticeWorker crée un nouveau worker Practice.
func NewPracticeWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *PracticeWorker {
	return &PracticeWorker{dbPool: dbPool, logger: logger}
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go avant le serveur HTTP.
func (w *PracticeWorker) Start(ctx context.Context) {
	w.logger.Info("Practice Worker started, waiting for jobs...")

	go func() {
		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Practice Worker stopping...")
				return
			case job := <-PracticeQueue:
				w.logger.Info("Processing practice job",
					"userId", job.UserID,
					"documentId", job.DocumentID,
					"nombreQuestions", job.Config.NombreQuestions,
				)
				w.processJob(ctx, job)
			}
		}
	}()
}

// processJob traite un job Practice complet (peut prendre 30-60s).
func (w *PracticeWorker) processJob(ctx context.Context, job PracticeJob) {
	defer func() {
		if r := recover(); r != nil {
			w.logger.Error("Practice Worker panic recovered",
				"error", r,
				"userId", job.UserID,
				"documentId", job.DocumentID,
			)
		}
	}()

	// 1. Lire le contenu textuel du document depuis la DB.
	docContent, docErr := w.getDocumentContent(ctx, job.DocumentID)
	if docErr != nil {
		w.logger.Error("Failed to read document content",
			"error", docErr,
			"documentId", job.DocumentID,
		)
		return
	}
	if strings.TrimSpace(docContent) == "" {
		w.logger.Warn("Document has no extractable text, skipping practice generation",
			"documentId", job.DocumentID,
		)
		return
	}

	// 2. Lire le provider IA actif depuis la DB.
	provider, err := getActiveProviderShared(ctx, w.dbPool)
	if err != nil {
		w.logger.Error("Failed to get active AI provider", "error", err)
		return
	}
	w.logger.Info("Using AI provider", "name", provider.Name, "model", provider.Model)

	// 3. Construire le prompt.
	messages := w.buildPracticePrompt(docContent, job.Config)

	// 4. Appeler l'API du provider IA.
	result, err := callAIProviderShared(ctx, provider, messages, w.logger)
	if err != nil {
		w.logger.Error("AI provider call failed",
			"error", err,
			"provider", provider.Name,
			"documentId", job.DocumentID,
		)
		return
	}

	w.logger.Info("AI practice generation completed",
		"documentId", job.DocumentID,
		"responseLength", len(result),
	)

	// 5. Parser le JSON retourné (questions).
	questions := parsePracticeResponse(result)
	if len(questions) == 0 {
		w.logger.Warn("AI returned no parseable questions",
			"documentId", job.DocumentID,
		)
		return
	}

	// 6. Insérer les questions en DB.
	inserted, err := w.insertQuestions(ctx, job, questions)
	if err != nil {
		w.logger.Error("Failed to insert generated questions",
			"error", err,
			"documentId", job.DocumentID,
		)
		return
	}
	w.logger.Info("Practice job completed successfully",
		"documentId", job.DocumentID,
		"generated", len(questions),
		"inserted", inserted,
	)
}

// getDocumentContent lit le contenu textuel d'un document depuis la DB.
// RLS désactivé car le worker n'a pas de claims HTTP.
func (w *PracticeWorker) getDocumentContent(ctx context.Context, documentID string) (string, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tx.Exec(ctx, "SET LOCAL row_security = off")

	var contenu *string
	err = tx.QueryRow(ctx, `
                SELECT "contenuTexte" FROM "Document" WHERE "id" = $1 AND "deletedAt" IS NULL
        `, documentID).Scan(&contenu)
	if err != nil {
		return "", fmt.Errorf("query document content: %w", err)
	}

	tx.Commit(ctx)

	if contenu == nil {
		return "", nil
	}
	// Tronquer à 12k caractères (cohérent avec epreuvesGenerate).
	c := *contenu
	if len(c) > 12_000 {
		c = c[:12_000] + "\n... [contenu tronqué]"
	}
	return c, nil
}

// buildPracticePrompt construit les messages (system + user) envoyés au LLM.
func (w *PracticeWorker) buildPracticePrompt(docContent string, cfg PracticeConfig) []ChatMessage {
	system := strings.TrimSpace(`Tu es un enseignant expert en création de questions d'entraînement pour étudiants de l'enseignement supérieur.
Ta réponse DOIT être un objet JSON valide, sans texte avant ou après, sans bloc markdown, sans commentaires.
Structure exacte attendue :
{
  "questions": [
    {
      "type": "QCU",
      "enonce": "Texte de la question",
      "propositions": [{"text": "Option A", "isCorrect": false}, {"text": "Option B", "isCorrect": true}, {"text": "Option C", "isCorrect": false}, {"text": "Option D", "isCorrect": false}],
      "reponseCorrecte": "Option B",
      "explication": "Pourquoi la réponse est B",
      "difficulte": "FACILE"
    }
  ]
}

Règles :
- Types valides : QCU (choix unique, 4 propositions dont 1 correcte), QCM (choix multiples, ≥1 correcte), QRC (réponse courte ouverte, propositions=null), REFLEXION (question ouverte longue), CODE (question de programmation).
- Pour QRC/REFLEXION : propositions doit être null (omets la clé ou mets null).
- Difficultés valides : FACILE, MOYEN, DIFFICILE, EXPERT.
- Les questions doivent couvrir différents aspects du contenu du document fourni.`)

	// Construire la consigne sur les types de questions.
	tq := cfg.TypesQuestions
	var typeParts []string
	if tq["qcu"] > 0 {
		typeParts = append(typeParts, fmt.Sprintf("%d QCU", tq["qcu"]))
	}
	if tq["qcm"] > 0 {
		typeParts = append(typeParts, fmt.Sprintf("%d QCM", tq["qcm"]))
	}
	if tq["qrc"] > 0 {
		typeParts = append(typeParts, fmt.Sprintf("%d QRC", tq["qrc"]))
	}
	if tq["code"] > 0 {
		typeParts = append(typeParts, fmt.Sprintf("%d CODE", tq["code"]))
	}
	if tq["reflexion"] > 0 {
		typeParts = append(typeParts, fmt.Sprintf("%d REFLEXION", tq["reflexion"]))
	}

	typeInstr := fmt.Sprintf("Génère exactement %d questions.", cfg.NombreQuestions)
	if len(typeParts) > 0 {
		typeInstr = fmt.Sprintf("Génère exactement %d questions réparties ainsi : %s.",
			cfg.NombreQuestions, strings.Join(typeParts, ", "))
	}

	diff := string(cfg.Difficulte)
	if diff == "" {
		diff = "MOYEN"
	}

	user := fmt.Sprintf(`%s

Difficulté visée : %s

Contenu du document source :
%s
`, typeInstr, strings.ToUpper(diff), docContent)

	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
}

// practiceQuestionAI est la projection d'une question générée par l'IA,
// alignée sur ce que parsePracticeResponse attend.
type practiceQuestionAI struct {
	Type            string           `json:"type"`
	Enonce          string           `json:"enonce"`
	Propositions    []map[string]any `json:"propositions,omitempty"`
	ReponseCorrecte *string          `json:"reponseCorrecte,omitempty"`
	Explication     *string          `json:"explication,omitempty"`
	Difficulte      string           `json:"difficulte"`
}

// parsePracticeResponse extrait les questions du JSON retourné par l'IA.
// Tolérant : gère le cas où l'IA wrappe la réponse dans un bloc markdown.
func parsePracticeResponse(raw string) []practiceQuestionAI {
	jsonStr := extractPracticeJSON(raw)
	if jsonStr == "" {
		return nil
	}

	var parsed struct {
		Questions []practiceQuestionAI `json:"questions"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil
	}

	// Normaliser chaque question.
	validTypes := map[string]bool{"QCU": true, "QCM": true, "QRC": true, "REFLEXION": true, "CODE": true}
	validDiffs := map[string]bool{"FACILE": true, "MOYEN": true, "DIFFICILE": true, "EXPERT": true}

	out := make([]practiceQuestionAI, 0, len(parsed.Questions))
	for _, q := range parsed.Questions {
		if !validTypes[q.Type] {
			q.Type = "QRC"
		}
		if !validDiffs[q.Difficulte] {
			q.Difficulte = "MOYEN"
		}
		if strings.TrimSpace(q.Enonce) == "" {
			continue // skip empty
		}
		out = append(out, q)
	}
	return out
}

// extractPracticeJSON tente d'extraire un objet JSON du texte.
func extractPracticeJSON(text string) string {
	// 1. Bloc markdown.
	if i := strings.Index(text, "```"); i >= 0 {
		rest := text[i+3:]
		rest = strings.TrimPrefix(rest, "json")
		if j := strings.Index(rest, "```"); j >= 0 {
			return strings.TrimSpace(rest[:j])
		}
	}
	// 2. Objet JSON brut — trouver la première '{' et la dernière '}'.
	start := strings.Index(text, "{")
	if start < 0 {
		return ""
	}
	end := strings.LastIndex(text, "}")
	if end <= start {
		return ""
	}
	return text[start : end+1]
}

// insertQuestions insère les questions générées dans la table "Question".
// RLS désactivé (le worker n'a pas de claims HTTP).
// Renvoie le nombre de questions effectivement insérées.
func (w *PracticeWorker) insertQuestions(ctx context.Context, job PracticeJob, questions []practiceQuestionAI) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return 0, fmt.Errorf("disable rls: %w", err)
	}

	// documentId nullable si vide ; auteurId = userId de l'étudiant qui a
	// demandé la génération (cela permet de retrouver ses questions plus tard).
	var docID any
	if job.DocumentID != "" {
		docID = job.DocumentID
	}
	auteurID := job.UserID

	inserted := 0
	for _, q := range questions {
		// Sérialiser propositions et reponseCorrecte en JSONB.
		var propsBytes []byte
		if q.Type == "QCU" || q.Type == "QCM" {
			if len(q.Propositions) > 0 {
				propsBytes, _ = json.Marshal(q.Propositions)
			}
		}
		var reponseBytes []byte
		if q.ReponseCorrecte != nil && *q.ReponseCorrecte != "" {
			// Stocker comme JSON string pour rester cohérent avec QuestionRepository.Create.
			reponseBytes, _ = json.Marshal(*q.ReponseCorrecte)
		}

		// Construire la requête d'insertion.
		// On génère l'UUID côté Go (google/uuid) pour ne pas dépendre
		// d'une extension Postgres.
		qID := uuid.NewString()

		var propsArg, reponseArg any
		if propsBytes != nil {
			propsArg = propsBytes
		}
		if reponseBytes != nil {
			reponseArg = reponseBytes
		}

		_, err := tx.Exec(ctx, `
                        INSERT INTO "Question" ("id", "documentId", "auteurId", "type", "enonce",
                                "propositions", "reponseCorrecte", "explication", "difficulte",
                                "themes", "tags", "scoreQualite", "validee", "langue",
                                "createdAt", "updatedAt", "deletedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, NULL, true, 'fr',
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                `, qID, docID, auteurID, q.Type, q.Enonce,
			propsArg, reponseArg,
			nullableString(q.Explication), q.Difficulte)
		if err != nil {
			w.logger.Warn("Failed to insert question, skipping",
				"error", err,
				"enonce", truncateEnonce(q.Enonce),
			)
			continue
		}
		inserted++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return inserted, nil
}

// nullableString retourne nil si s est nil ou vide, sinon *s.
func nullableString(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

// truncateEnonce limite la taille d'un énoncé pour les logs.
func truncateEnonce(s string) string {
	if len(s) > 80 {
		return s[:80] + "…"
	}
	return s
}
