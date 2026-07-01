// Package worker — worker asynchrone pour la génération de podcasts de
// révision (Mode Audio-Learning).
//
// AUDIO-LEARNING-1.
//
// Le handler POST /api/exam-prep/documents/{id}/audio :
//  1. Crée une ligne DocumentAudio (status=EN_COURS, script="") via le repo
//  2. Pousse un AudioGenerationJob dans AudioGenerationQueue (channel Go, < 1ms)
//  3. Retourne immédiatement 202 Accepted avec la ligne créée
//
// Le worker (goroutine) consomme la queue en arrière-plan :
//  1. Lit le document (contenu texte depuis la DB)
//  2. Lit le provider IA actif via getActiveProviderShared
//  3. Construit un prompt "podcast" (dialogue Présentateur ↔ Expert)
//  4. Appelle l'IA via callAIProviderShared → obtient le script textuel
//  5. UpdateDocumentAudioScript(audioID, script)
//  6. Tente la synthèse TTS via callTTSProviderShared :
//     - succès : upload MP3 sur R2, UpdateDocumentAudioStatus(PRET, r2Key, nil)
//     - échec (provider sans TTS) : UpdateDocumentAudioStatus(PRET, nil, nil)
//       (le script reste utilisable — dégradation gracieuse)
//
// Le frontend poll GET /api/exam-prep/documents/{id}/audio (TanStack Query)
// toutes les 3s tant qu'un audio est EN_COURS.
package worker

import (
        "context"
        "fmt"
        "log/slog"
        "strings"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// AudioGenerationJob représente une tâche de génération de podcast audio.
// AudioID est l'ID de la ligne DocumentAudio pré-créée par le handler.
type AudioGenerationJob struct {
        AudioID    string `json:"audioId"`
        DocumentID string `json:"documentId"`
        UserID     string `json:"userId"`
}

// AudioGenerationQueue est la file d'attente globale (channel Go buffered).
// Buffer 25 jobs — les podcasts IA sont plus longs à générer (~30-90s) que
// les questions d'entraînement, donc on limite la concurrence.
var AudioGenerationQueue = make(chan AudioGenerationJob, 25)

// AudioGenerationWorker est le worker qui consomme la queue.
type AudioGenerationWorker struct {
        dbPool  *pgxpool.Pool
        storage domain.StorageClient // R2 client (peut être nil si désactivé)
        logger  *slog.Logger
}

// NewAudioGenerationWorker crée un nouveau worker Audio.
// storageClient peut être nil si R2 est désactivé (le worker marquera
// l'audio PRET avec script seul, sans upload MP3).
func NewAudioGenerationWorker(dbPool *pgxpool.Pool, storageClient domain.StorageClient, logger *slog.Logger) *AudioGenerationWorker {
        return &AudioGenerationWorker{dbPool: dbPool, storage: storageClient, logger: logger}
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go avant le serveur HTTP.
func (w *AudioGenerationWorker) Start(ctx context.Context) {
        w.logger.Info("Audio Generation Worker started, waiting for jobs...")

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                w.logger.Info("Audio Generation Worker stopping...")
                                return
                        case job := <-AudioGenerationQueue:
                                w.logger.Info("Generating audio podcast",
                                        "audioId", job.AudioID,
                                        "documentId", job.DocumentID,
                                )
                                w.processJob(ctx, job)
                        }
                }
        }()
}

// processJob traite un job Audio complet (peut prendre 30-90s).
func (w *AudioGenerationWorker) processJob(ctx context.Context, job AudioGenerationJob) {
        defer func() {
                if r := recover(); r != nil {
                        w.logger.Error("Audio Generation Worker panic recovered",
                                        "error", r,
                                        "audioId", job.AudioID,
                                        "documentId", job.DocumentID,
                        )
                        // Marquer en ERREUR pour que le frontend arrête de poller.
                        errMsg := "panic interne du worker"
                        _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                }
        }()

        // 1. Lire le contenu textuel du document depuis la DB.
        docContent, docErr := w.getDocumentContent(ctx, job.DocumentID)
        if docErr != nil {
                w.logger.Error("Failed to read document content",
                        "error", docErr,
                        "documentId", job.DocumentID,
                )
                errMsg := "document introuvable ou illisible"
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }
        if strings.TrimSpace(docContent) == "" || len(docContent) < 50 {
                w.logger.Warn("Document has no extractable text, skipping audio generation",
                        "documentId", job.DocumentID,
                )
                errMsg := "le document ne contient pas de texte extractible (trop court)"
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }

        // 2. Tronquer à 12k caractères (cohérent avec practice_worker).
        if len(docContent) > 12_000 {
                docContent = docContent[:12_000] + "\n... [contenu tronqué]"
        }

        // 3. Lire le provider IA actif depuis la DB.
        provider, err := getActiveProviderShared(ctx, w.dbPool)
        if err != nil {
                w.logger.Error("Failed to get active AI provider", "error", err)
                errMsg := "aucun provider IA actif"
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }
        w.logger.Info("Using AI provider for podcast", "name", provider.Name, "model", provider.Model)

        // 4. Construire le prompt podcast.
        messages := w.buildPodcastPrompt(docContent)

        // 5. Appeler l'IA pour générer le script.
        script, err := callAIProviderShared(ctx, provider, messages, w.logger)
        if err != nil {
                w.logger.Error("AI podcast script generation failed",
                        "error", err,
                        "provider", provider.Name,
                        "documentId", job.DocumentID,
                )
                errMsg := fmt.Sprintf("échec IA: %v", err)
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }

        if strings.TrimSpace(script) == "" {
                w.logger.Warn("AI returned empty podcast script", "documentId", job.DocumentID)
                errMsg := "script généré vide"
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }

        w.logger.Info("Podcast script generated",
                "audioId", job.AudioID,
                "documentId", job.DocumentID,
                "scriptLength", len(script),
        )

        // 6. Sauvegarder le script dans la ligne DocumentAudio.
        if err := w.updateScript(ctx, job.AudioID, script); err != nil {
                w.logger.Error("Failed to save podcast script",
                        "error", err,
                        "audioId", job.AudioID,
                )
                errMsg := fmt.Sprintf("échec sauvegarde script: %v", err)
                _ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg)
                return
        }

        // 7. Tenter la synthèse TTS (optionnelle — dégradation gracieuse).
        // DASHSCOPE-AUDIO-1 : utiliser un provider TTS dédié si configuré
        // (capability='tts'), sinon fallback sur le provider chat (rétro-compatible).
        ttsProvider, ttsProvErr := getActiveProviderByCapabilityShared(ctx, w.dbPool, "tts")
        if ttsProvErr != nil {
                w.logger.Warn("No TTS provider available, keeping script only",
                        "audioId", job.AudioID, "error", ttsProvErr)
                if err := w.updateStatus(ctx, job.AudioID, "PRET", nil, nil); err != nil {
                        w.logger.Error("Failed to mark audio as PRET (script only)",
                                "error", err, "audioId", job.AudioID)
                }
                return
        }
        audioBytes, ttsErr := callTTSProviderShared(ctx, ttsProvider, script, w.logger)
        if ttsErr != nil {
                // TTS indisponible pour ce provider → on marque PRET avec script seul.
                // Le frontend affichera le script dans un <details> collapsible avec
                // une note "Audio non disponible pour ce provider".
                w.logger.Warn("TTS not available for provider, keeping script only (graceful fallback)",
                        "provider", ttsProvider.Name,
                        "providerType", ttsProvider.Provider,
                        "audioId", job.AudioID,
                        "ttsError", ttsErr,
                )
                if err := w.updateStatus(ctx, job.AudioID, "PRET", nil, nil); err != nil {
                        w.logger.Error("Failed to mark audio as PRET (script only)",
                                "error", err, "audioId", job.AudioID)
                }
                return
        }

        // 8. TTS succès → upload audio sur R2.
        // KOKORO-TTS-1 : le format dépend du provider (WAV pour HuggingFace/Kokoro,
        // MP3 pour DashScope/OpenAI). ttsAudioFormat() retourne l'extension + content-type.
        if w.storage == nil {
                w.logger.Warn("R2 storage not configured, keeping script only",
                        "audioId", job.AudioID,
                )
                _ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil)
                return
        }

        audioExt, audioContentType := ttsAudioFormat(ttsProvider)
        r2Key := fmt.Sprintf("audio/%s%s", job.AudioID, audioExt)
        _, err = w.storage.Upload(ctx, domain.StorageObject{
                Key:         r2Key,
                Content:     audioBytes,
                ContentType: audioContentType,
                ContentLength: int64(len(audioBytes)),
        })
        if err != nil {
                w.logger.Warn("Failed to upload audio to R2, keeping script only",
                        "error", err,
                        "audioId", job.AudioID,
                )
                _ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil)
                return
        }

        // 9. Marquer PRET avec la clé R2.
        if err := w.updateStatus(ctx, job.AudioID, "PRET", &r2Key, nil); err != nil {
                w.logger.Error("Failed to mark audio as PRET (with R2 key)",
                        "error", err, "audioId", job.AudioID, "r2Key", r2Key)
                return
        }

        w.logger.Info("Audio podcast completed successfully",
                "audioId", job.AudioID,
                "documentId", job.DocumentID,
                "r2Key", r2Key,
                "audioBytes", len(audioBytes),
        )
}

// getDocumentContent lit le contenu textuel d'un document depuis la DB.
// Pose les claims system-worker pour RLS (le worker n'a pas de claims HTTP).
func (w *AudioGenerationWorker) getDocumentContent(ctx context.Context, documentID string) (string, error) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return "", fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

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
        return *contenu, nil
}

// buildPodcastPrompt construit les messages (system + user) envoyés au LLM
// pour générer un script de podcast de ~5 minutes (dialogue Présentateur ↔
// Expert). Le script est en texte brut (pas de JSON), formaté pour la synthèse
// TTS.
func (w *AudioGenerationWorker) buildPodcastPrompt(docContent string) []ChatMessage {
        system := strings.TrimSpace(`Tu es un scénariste de podcasts éducatifs pour étudiants de l'enseignement supérieur.
Tu crées des scripts de podcasts engageants qui transforment un contenu académique en une conversation vivante et pédagogique de ~5 minutes (environ 700 à 900 mots).

Format EXACT de ta réponse (texte brut, PAS de JSON, PAS de markdown) :
- Le podcast est un dialogue entre deux personnages :
  • "Présentateur" : un host enthousiaste et curieux qui pose les questions, lance les transitions, garde le rythme.
  • "Expert" : un professeur passionné qui explique les concepts avec clarté, des exemples concrets et des analogies.
- Chaque ligne commence par "Présentateur :" ou "Expert :".
- Début obligatoire : "Présentateur : Bonjour et bienvenue dans ce podcast de révision !"
- Fin obligatoire : "Présentateur : Merci d'avoir écouté, et bonne révision !"
- Évite les listes à puces, les titres de sections, les emojis. Format dialogue uniquement.
- Inclus une brève introduction (contexte du sujet), 3 à 5 concepts clés du document avec explications, et une conclusion/récapitulatif.
- Adapte le niveau de langage : accessible mais rigoureux (étudiant L1/M1).`)

        user := fmt.Sprintf(`Voici le contenu d'un cours à transformer en podcast de révision de ~5 minutes :

%s

Génère le script du podcast en respectant le format demandé. Concentre-toi sur les concepts les plus importants du document.`, docContent)

        return []ChatMessage{
                {Role: "system", Content: system},
                {Role: "user", Content: user},
        }
}

// updateScript met à jour le script dans la ligne DocumentAudio.
// Claims system-worker posés pour RLS : écriture système (worker).
func (w *AudioGenerationWorker) updateScript(ctx context.Context, audioID, script string) error {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
                return fmt.Errorf("set system claims: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "DocumentAudio"
                SET "script" = $1, "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $2
        `, script, audioID)
        if err != nil {
                return fmt.Errorf("update script: %w", err)
        }

        return tx.Commit(ctx)
}

// updateStatus met à jour le statut (+ r2Key/errorMessage si non-nil).
// Claims system-worker posés pour RLS : écriture système (worker).
func (w *AudioGenerationWorker) updateStatus(ctx context.Context, audioID, status string, r2Key *string, errorMessage *string) error {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
                return fmt.Errorf("set system claims: %w", err)
        }

        if r2Key != nil && errorMessage != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "r2Key" = $2, "errorMessage" = $3, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $4
                `, status, *r2Key, *errorMessage, audioID)
        } else if r2Key != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "r2Key" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $3
                `, status, *r2Key, audioID)
        } else if errorMessage != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "errorMessage" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $3
                `, status, *errorMessage, audioID)
        } else {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $2
                `, status, audioID)
        }
        if err != nil {
                return fmt.Errorf("update status: %w", err)
        }

        return tx.Commit(ctx)
}

// RecoverInterruptedAudioJobs recherche les DocumentAudio restés bloqués au
// statut EN_COURS (à cause d'un redémarrage Render) et les réinjecte dans
// la queue. À appeler au démarrage de main.go, après NewAudioGenerationWorker
// et avant Start. Graceful shutdown : aucun job n'est jamais perdu à cause
// de l'infra.
func (w *AudioGenerationWorker) RecoverInterruptedAudioJobs(ctx context.Context) {
        tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                w.logger.Error("RecoverInterruptedAudioJobs: failed to begin tx", "error", err)
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        rows, err := tx.Query(ctx, `
                SELECT "id", "documentId", "userId"
                FROM "DocumentAudio"
                WHERE "status" = 'EN_COURS'
                ORDER BY "createdAt" ASC
        `)
        if err != nil {
                w.logger.Error("RecoverInterruptedAudioJobs: query failed", "error", err)
                return
        }
        defer rows.Close()

        recovered := 0
        for rows.Next() {
                var job AudioGenerationJob
                if err := rows.Scan(&job.AudioID, &job.DocumentID, &job.UserID); err != nil {
                        continue
                }
                select {
                case AudioGenerationQueue <- job:
                        recovered++
                default:
                        w.logger.Warn("AudioGenerationQueue full, skipping", "audioId", job.AudioID)
                }
        }

        tx.Commit(ctx)

        if recovered > 0 {
                w.logger.Info("Recovered interrupted audio jobs", "count", recovered)
        } else {
                w.logger.Info("No interrupted audio jobs to recover")
        }
}
