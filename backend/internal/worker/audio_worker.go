// Package worker — worker asynchrone pour la génération de podcasts de
// révision (Mode Audio-Learning).
//
// AUDIO-LEARNING-1 / SECT-TTS-3.
//
// Le handler POST /api/exam-prep/documents/{id}/audio :
//  1. Crée une ligne DocumentAudio (status=EN_COURS, script="") via le repo
//  2. Pousse un AudioGenerationJob dans AudioGenerationQueue (channel Go, < 1ms)
//  3. Retourne immédiatement 202 Accepted avec la ligne créée
//
// Le worker (goroutine) consomme la queue en arrière-plan :
//  1. Lit le document (contenu texte + titre depuis la DB)
//  2. Construit le prompt « résumé d'exception » (dialogue
//     Présentateur ↔ Expert, structure pédagogique complète — SECT-TTS-3)
//  3. Appelle l'IA via aiService.ChatCompletion (failover multi-provider)
//  4. UpdateDocumentAudioScript(audioID, script)
//  5. Synthèse TTS (SECT-TTS-3) :
//     a. VOXTRAL PREMIUM si opt-in explicite (extraConfig useForPodcasts
//     ou ref_audio configurés) — payant au caractère, clonage de voix ;
//     b. sinon CHAÎNE 0 COÛT multi-voix (tts.SynthesePodcast :
//     Gemini duo studio → MeloTTS, Edge retiré SECT-TTS-4) ;
//     c. succès : upload sur R2 (WAV ou MP3 selon le fournisseur),
//     durationSec ESTIMÉ depuis les octets, status PRET ;
//     d. échec total : PRET avec script seul (dégradation gracieuse —
//     le script reste lisible et exploitable).
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
	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/tts"
)

// AudioGenerationJob représente une tâche de génération de podcast audio.
// AudioID est l'ID de la ligne DocumentAudio pré-créée par le handler.
type AudioGenerationJob struct {
	AudioID    string `json:"audioId"`
	DocumentID string `json:"documentId"`
	UserID     string `json:"userId"`
}

// AudioGenerationQueue est la file d'attente globale (channel Go buffered).
// Buffer 25 jobs — les podcasts IA sont plus longs à générer (~1-4 min :
// script + une synthèse par réplique) que les questions d'entraînement,
// donc on limite la concurrence.
var AudioGenerationQueue = make(chan AudioGenerationJob, 25)

// AudioGenerationWorker est le worker qui consomme la queue.
type AudioGenerationWorker struct {
	dbPool     *pgxpool.Pool
	storage    domain.StorageClient // R2 client (peut être nil si désactivé)
	logger     *slog.Logger
	aiService  *ai.AIService // failover support for chat completion
	ttsService *tts.Service  // SECT-TTS-3 : chaîne 0 coût multi-voix
}

// NewAudioGenerationWorker crée un nouveau worker Audio.
// storageClient peut être nil si R2 est désactivé (le worker marquera
// l'audio PRET avec script seul, sans upload MP3). ttsService peut être
// nil si la chaîne vocale est désactivée (dégradation gracieuse identique).
func NewAudioGenerationWorker(dbPool *pgxpool.Pool, storageClient domain.StorageClient, logger *slog.Logger, aiService *ai.AIService, ttsService *tts.Service) *AudioGenerationWorker {
	return &AudioGenerationWorker{dbPool: dbPool, storage: storageClient, logger: logger, aiService: aiService, ttsService: ttsService}
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

// processJob traite un job Audio complet (peut prendre 1 à 4 minutes).
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
			_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		}
	}()

	// 1. Lire le contenu textuel + le titre du document depuis la DB.
	docContent, docTitre, docErr := w.getDocumentContent(ctx, job.DocumentID)
	if docErr != nil {
		w.logger.Error("Failed to read document content",
			"error", docErr,
			"documentId", job.DocumentID,
		)
		errMsg := "document introuvable ou illisible"
		_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		return
	}
	if strings.TrimSpace(docContent) == "" || len(docContent) < 50 {
		w.logger.Warn("Document has no extractable text, skipping audio generation",
			"documentId", job.DocumentID,
		)
		errMsg := "le document ne contient pas de texte extractible (trop court)"
		_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		return
	}

	// 2. Tronquer à 12k caractères (cohérent avec practice_worker).
	if len(docContent) > 12_000 {
		docContent = docContent[:12_000] + "\n... [contenu tronqué]"
	}

	// 3. Construire le prompt podcast (SECT-TTS-5 : émission de radio
	// « Révision Express » — l'épisode numéro N de CET utilisateur sur
	// CE document est annoncé à l'antenne ; la ligne EN_COURS du job
	// compte déjà dans le décompte).
	episode := w.compterEpisodes(ctx, job.DocumentID, job.UserID)
	messages := w.buildPodcastPrompt(docContent, docTitre, episode)

	// 4. Convert worker.ChatMessage → ai.ChatMessage and call AI with failover
	aiMessages := make([]ai.ChatMessage, len(messages))
	for i, m := range messages {
		aiMessages[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
	}
	result, err := w.aiService.ChatCompletion(ctx, aiMessages)
	if err != nil {
		w.logger.Error("AI podcast script generation failed (all providers exhausted)",
			"error", err,
			"documentId", job.DocumentID,
		)
		errMsg := fmt.Sprintf("échec IA: %v", err)
		_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		return
	}
	script := result.Content

	if strings.TrimSpace(script) == "" {
		w.logger.Warn("AI returned empty podcast script", "documentId", job.DocumentID)
		errMsg := "script généré vide"
		_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		return
	}

	w.logger.Info("Podcast script generated",
		"audioId", job.AudioID,
		"documentId", job.DocumentID,
		"scriptLength", len(script),
		"model", result.Model,
	)

	// 5. Sauvegarder le script dans la ligne DocumentAudio.
	if err := w.updateScript(ctx, job.AudioID, script); err != nil {
		w.logger.Error("Failed to save podcast script",
			"error", err,
			"audioId", job.AudioID,
		)
		errMsg := fmt.Sprintf("échec sauvegarde script: %v", err)
		_ = w.updateStatus(ctx, job.AudioID, "ERREUR", nil, &errMsg, nil)
		return
	}

	// 6. Synthèse TTS (SECT-TTS-3). Voxtral premium (opt-in) PUIS chaîne
	// 0 coût — jamais l'inverse : sans configuration explicite, un podcast
	// ne coûte RIEN (posture SECT-TTS-1 : garantit le 0 coût).
	if w.ttsService == nil {
		w.logger.Warn("TTS service not configured, keeping script only", "audioId", job.AudioID)
		_ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil, nil)
		return
	}

	var synth *tts.Result
	if vox, ok := w.voxtralPodcastOptIn(ctx); ok {
		res, voxErr := callVoxtralTTS(ctx, vox, script, w.logger)
		if voxErr == nil {
			synth = res
			w.logger.Info("Podcast synthétisé via Voxtral (premium, payant)",
				"audioId", job.AudioID, "model", res.Model, "bytes", len(res.Audio))
		} else {
			// Premium en échec → bascule 0 coût (l'épisode doit exister).
			w.logger.Warn("Voxtral premium échec — bascule chaîne 0 coût",
				"audioId", job.AudioID, "error", voxErr)
		}
	}
	if synth == nil {
		res, err := w.ttsService.SynthesePodcast(ctx, script, job.UserID)
		if err != nil {
			w.logger.Warn("TTS 0 coût indisponible, keeping script only (graceful fallback)",
				"audioId", job.AudioID, "ttsError", err)
			_ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil, nil)
			return
		}
		synth = res
	}

	// 7. Succès synthèse → upload audio sur R2. Le format suit le
	// FOURNISSEUR effectif (WAV Gemini 24 kHz / MP3 ou WAV Voxtral) —
	// plus de format codé en dur.
	if w.storage == nil {
		w.logger.Warn("R2 storage not configured, keeping script only",
			"audioId", job.AudioID,
		)
		_ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil, nil)
		return
	}

	ext, ct := ".mp3", "audio/mpeg"
	if strings.Contains(synth.ContentType, "wav") {
		ext, ct = ".wav", "audio/wav"
	}
	r2Key := fmt.Sprintf("audio/%s%s", job.AudioID, ext)
	_, err = w.storage.Upload(ctx, domain.StorageObject{
		Key:           r2Key,
		Content:       synth.Audio,
		ContentType:   ct,
		ContentLength: int64(len(synth.Audio)),
	})
	if err != nil {
		w.logger.Warn("Failed to upload audio to R2, keeping script only",
			"error", err,
			"audioId", job.AudioID,
		)
		_ = w.updateStatus(ctx, job.AudioID, "PRET", nil, nil, nil)
		return
	}

	// 8. Marquer PRET avec la clé R2 + durée estimée (affichée sur la
	// carte podcast côté frontend).
	duree := tts.DureeAudio(synth.Audio, synth.ContentType)
	if err := w.updateStatus(ctx, job.AudioID, "PRET", &r2Key, nil, &duree); err != nil {
		w.logger.Error("Failed to mark audio as PRET (with R2 key)",
			"error", err, "audioId", job.AudioID, "r2Key", r2Key)
		return
	}

	w.logger.Info("Audio podcast completed successfully",
		"audioId", job.AudioID,
		"documentId", job.DocumentID,
		"r2Key", r2Key,
		"provider", synth.Provider,
		"model", synth.Model,
		"audioBytes", len(synth.Audio),
		"durationSec", duree,
	)
}

// voxtralPodcastOptIn — le provider TTS actif est-il Voxtral ET
// explicitement activé pour les podcasts (useForPodcasts ou ref_audio
// configurés — cf voxtralOptIn) ? Payant au caractère : jamais le défaut.
func (w *AudioGenerationWorker) voxtralPodcastOptIn(ctx context.Context) (*ai.ActiveProvider, bool) {
	vox, err := getActiveProviderByCapabilityShared(ctx, w.dbPool, "tts")
	if err != nil || vox == nil {
		return nil, false
	}
	if !strings.EqualFold(vox.Provider, "VOXTRAL") {
		return nil, false
	}
	if !voxtralOptIn(vox.ExtraConfig) {
		return nil, false
	}
	return vox, true
}

// compterEpisodes — numéro de l'épisode EN COURS de génération pour ce
// couple (document, utilisateur) : les lignes DocumentAudio de cet
// utilisateur sur ce document, Y COMPRIS la ligne EN_COURS du job (elle
// est créée par le handler AVANT que le worker ne traite le job). Un
// étudiant qui regénère après suppression retombe sur le même numéro —
// c'est SON numéro d'épisode. Claims system-worker pour RLS.
func (w *AudioGenerationWorker) compterEpisodes(ctx context.Context, documentID, userID string) int {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 1
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	var n int
	err = tx.QueryRow(ctx, `
                SELECT COUNT(*) FROM "DocumentAudio"
                WHERE "documentId" = $1 AND "userId" = $2
        `, documentID, userID).Scan(&n)
	if err != nil || n < 1 {
		return 1
	}
	return n
}

// getDocumentContent lit le contenu textuel + le nom de fichier d'un
// document depuis la DB. Pose les claims system-worker pour RLS (le
// worker n'a pas de claims HTTP). Le TITRE nourrit le prompt (l'IA situe
// le cours qu'elle résume — SECT-TTS-3).
func (w *AudioGenerationWorker) getDocumentContent(ctx context.Context, documentID string) (string, string, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	var contenu *string
	var nomFichier string
	err = tx.QueryRow(ctx, `
                SELECT "contenuTexte", COALESCE("nomFichier", '') FROM "Document" WHERE "id" = $1 AND "deletedAt" IS NULL
        `, documentID).Scan(&contenu, &nomFichier)
	if err != nil {
		return "", "", fmt.Errorf("query document content: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", fmt.Errorf("commit: %w", err)
	}

	if contenu == nil {
		return "", nomFichier, nil
	}
	return *contenu, nomFichier, nil
}

// buildPodcastPrompt construit les messages (system + user) envoyés au LLM.
//
// SECT-TTS-3 — « RÉSUMÉ DE COURS D'EXCEPTION » : structure pédagogique
// complète (accroche, panorama, concept→exemple→piège d'examen, moyen
// mnémotechnique, mini-quiz, récap) avec consignes de style ORAL.
//
// SECT-TTS-5 — « VÉRITABLE ÉMISSION DE RADIO » : le script devient un
// épisode de « Révision Express » avec PERSONNAGES NOMMÉS et TITRÉS
// (Aya Konan, journaliste et animatrice ; docteur Kouassi Brou, expert
// invité dont la spécialité s'adapte au domaine du document), numéro
// d'épisode annoncé à l'antenne, génériques d'ouverture et de clôture,
// tournures d'antenne, réactions sincères de l'animatrice, quiz éclair
// joué comme un jeu radio, phrase signature. Les marqueurs de réplique
// changent en conséquence (« Aya : » / « Dr Brou : ») — parserDialogue
// (internal/tts/podcast.go) les reconnaît, les hérités restent acceptés.
func (w *AudioGenerationWorker) buildPodcastPrompt(docContent, docTitre string, episode int) []ChatMessage {
	system := strings.TrimSpace(`Tu es le scénariste en chef de « Révision Express », une émission de radio éducative de prestige. Tu transformes un support de cours en un épisode vivant de ~6 minutes (900 à 1100 mots) qui doit SONNER comme une vraie émission diffusée à l'antenne.

LES DEUX PERSONNAGES (identité fixe, ne les change jamais) :
- « Aya : » — Aya Konan, journaliste et animatrice de Révision Express. Pétillante, curieuse, mène l'émission : accroches, transitions, réactions sincères, relances. Elle tutoie l'auditeur et vouvoie son invité.
- « Dr Brou : » — le docteur Kouassi Brou, expert invité. Chaleureux, posé, précis. Il explique avec des analogies du quotidien, adore prévenir « Et le piège à éviter absolument… », et signe ses astuces « le truc du Docteur ».

FORMAT EXACT de ta réponse (texte brut, PAS de JSON, PAS de markdown, aucune didascalie, aucun indicateur sonore) :
- Chaque réplique commence par « Aya : » ou « Dr Brou : » sur une nouvelle ligne, suivie d'un espace.
- Aucun autre personnage n'intervient. Pas de musique ni d'applaudissements écrits.
- 18 à 28 répliques. Celles d'Aya font 1 à 2 phrases ; celles de Dr Brou font 2 à 5 phrases (c'est lui qui développe).

PLAN DE L'ÉMISSION (dans cet ordre) :
1. Générique d'ouverture — Aya : « Bonjour à toutes et à tous ! Vous écoutez « Révision Express », l'émission qui transforme vos cours en succès. Je suis Aya Konan, et c'est l'épisode numéro {N}. Aujourd'hui : [formulation accrocheuse du sujet]. Avec moi pour tout démêler : le docteur Kouassi Brou, [titre ou spécialité adapté au domaine du document]. Bonsoir Docteur ! »
2. Réponse d'ouverture — Dr Brou : salutation radio + pourquoi ce sujet vaut des points à l'examen (un fait précis du document).
3. Le panorama — Aya annonce le menu (« Au programme ce soir : … ») avec les 3 à 5 concepts clés ; Dr Brou les présente en une phrase chacun.
4. Concepts un à un — pour chaque concept : Aya lance (« Alors Docteur, parlons de… ») ; Dr Brou donne définition simple + exemple concret du quotidien + LE piège classique d'examen ; Aya réagit (surprise, reformulation pour l'auditeur).
5. Le truc du Docteur — Dr Brou livre son moyen mnémotechnique comme une astuce de conférencier chevronné ; Aya s'en émerveille et le répète à l'auditeur.
6. Quiz éclair — Aya : « C'est l'heure du Quiz Éclair ! » puis pose 2 ou 3 questions (une par réplique) ; Dr Brou répond en une phrase nette.
7. Le dernier mot — Dr Brou : le récapitulatif en 3 phrases mémorisables.
8. Générique de clôture — Aya remercie (« Merci docteur Brou, c'était lumineux ! »), énonce la phrase signature « Réviser malin, réussir tranquillement », invite à rejoindre le prochain épisode et salue l'auditeur.

STYLE RADIO EXIGÉ :
- Tournures d'antenne vivantes : « Vous écoutez Révision Express », « Restez avec nous », « On passe à la vitesse supérieure », « Un mot là-dessus, Docteur ? »
- Aya RÉAGIT vraiment : « Ah, vraiment ? », « Attendez… vous êtes en train de me dire que… », elle reformule ce qu'elle vient d'apprendre.
- Écrire pour l'OREILLE : phrases orales et respirables (jamais plus de ~25 mots), aucune liste à puces, aucun titre de section, aucun emoji, aucune notation mathématique complexe (épelle les formules avec des mots).
- Rigueur académique (niveau L1/M1) mais langage parlé et vivant : chaque affirmation de Dr Brou s'appuie sur un fait PRÉCIS du document.
- Ton chaleureux et positif : on révise entre amis, jamais dans la culpabilité.`)

	var user string
	if strings.TrimSpace(docTitre) != "" {
		user = fmt.Sprintf(`Voici le support de cours à transformer en épisode de « Révision Express » (~6 minutes).

Titre du support : %s
Numéro de l'épisode : %d — Aya l'annonce dans le générique d'ouverture (« c'est l'épisode numéro %d »).

Contenu :
%s

Génère le script de l'épisode en respectant le format, les personnages et le plan demandés. Concentre-toi sur les concepts les plus importants du document.`, docTitre, episode, episode, docContent)
	} else {
		user = fmt.Sprintf(`Voici le support de cours à transformer en épisode de « Révision Express » (~6 minutes).

Numéro de l'épisode : %d — Aya l'annonce dans le générique d'ouverture (« c'est l'épisode numéro %d »).

Contenu :
%s

Génère le script de l'épisode en respectant le format, les personnages et le plan demandés. Concentre-toi sur les concepts les plus importants du document.`, episode, episode, docContent)
	}

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
	defer func() { _ = tx.Rollback(ctx) }()

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

// updateStatus met à jour le statut (+ r2Key/errorMessage/durationSec si
// non-nil). Claims system-worker posés pour RLS : écriture système (worker).
func (w *AudioGenerationWorker) updateStatus(ctx context.Context, audioID, status string, r2Key *string, errorMessage *string, durationSec *int) error {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
		return fmt.Errorf("set system claims: %w", err)
	}

	_, err = tx.Exec(ctx, `
                UPDATE "DocumentAudio"
                SET "status" = $1,
                    "r2Key" = COALESCE($2, "r2Key"),
                    "errorMessage" = $3,
                    "durationSec" = COALESCE($4, "durationSec"),
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $5
        `, status, r2Key, errorMessage, durationSec, audioID)
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
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

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

	if err := tx.Commit(ctx); err != nil {
		w.logger.Error("RecoverInterruptedAudioJobs: commit failed", "error", err)
		return
	}

	if recovered > 0 {
		w.logger.Info("Recovered interrupted audio jobs", "count", recovered)
	} else {
		w.logger.Info("No interrupted audio jobs to recover")
	}
}
