// Package main est le point d'entrée du backend Go SECT.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/config"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/geniuspay"
	"github.com/udevrard7/sect/backend/internal/jwt"
	"github.com/udevrard7/sect/backend/internal/mailer"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/monitoring"
	"github.com/udevrard7/sect/backend/internal/notification"
	"github.com/udevrard7/sect/backend/internal/repository"
	"github.com/udevrard7/sect/backend/internal/storage"
	httptransport "github.com/udevrard7/sect/backend/internal/transport/http"
	"github.com/udevrard7/sect/backend/internal/usecase"
	"github.com/udevrard7/sect/backend/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	logger.Info("starting SECT API server", "version", "0.2.0")

	// 1. Configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	logger.Info("configuration loaded", "env", cfg.Environment, "port", cfg.Port)

	// 2. Connexion Neon
	pool, err := appdb.New(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to Neon", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	logger.Info("connected to Neon Postgres")

	// 2b. Monitoring : Event Recorder (async) + Health Checker
	// Bug B1+B2 (audit monitoring 2025) : table MonitoringEvent était vide,
	// services hardcodés. Le recorder capture erreurs 5xx/panics, le health
	// checker fait de vrais checks DB/API/AI.
	monRecorder := monitoring.NewRecorder(pool, logger)
	defer monRecorder.Shutdown()
	monHealthChecker := monitoring.NewHealthChecker(pool)
	// ADR-0012 §3 (monitoring P5) : échantillonneur des requêtes API —
	// alimente RequestLog (p50/p95 par endpoint, rétention 7 j, purge
	// horaire intégrée). File async drop-dégradée (pattern Recorder).
	monSampler := monitoring.NewRequestSampler(pool, logger)
	defer monSampler.Shutdown()
	logger.Info("monitoring recorder + health checker + request sampler initialized")

	// ADR-0011 §4 — registre de workers : visibilité des 13 workers dans
	// l'onglet « Système » de /monitoring (runs/erreurs/dernier run/durée).
	// Les 7 workers périodiques sont instrumentés (TrackContext — panic-safe),
	// les 6 workers de file sont déclarés (leur état métier vit dans leurs
	// tables de jobs : statut ERREUR, AIFailoverEvent).
	workerRegistry := monitoring.NewWorkerRegistry(monRecorder)
	workerRegistry.Register("ia-generation", "Génération de questions IA (file)", "file", "événementiel")
	workerRegistry.Register("ia-correction", "Correction IA des copies (file)", "file", "événementiel")
	workerRegistry.Register("ia-doc-analyzer", "Analyse des documents de cours (file)", "file", "événementiel")
	workerRegistry.Register("ia-practice", "Exercices pratiques IA (file)", "file", "événementiel")
	workerRegistry.Register("ia-homework", "Correction des devoirs (file)", "file", "événementiel")
	workerRegistry.Register("ia-audio", "Génération audio (file)", "file", "événementiel")
	workerRegistry.Register("auto-close", "Clôture automatique des épreuves", "periodique", "60 s")
	workerRegistry.Register("relance", "Relances J-7 (abonnements B2C)", "periodique", "6 h")
	workerRegistry.Register("expire", "Expiration des abonnements B2C", "periodique", "1 h")
	workerRegistry.Register("cleanup", "Purge des utilisateurs soft-deleted (>90 j)", "periodique", "24 h")
	workerRegistry.Register("promotion", "Clôture d'année académique", "periodique", "10 s")
	workerRegistry.Register("bibliotheque-purge", "Purge de la corbeille bibliothèque (>30 j)", "periodique", "1 h")
	workerRegistry.Register("similarity", "Détection de similarité entre copies", "periodique", "5 min")

	// 3. Initialiser repositories + usecases
	userRepo := repository.NewUserRepository(pool)
	authRepo := repository.NewAuthRepository(pool)
	etabRepo := repository.NewEtablissementRepository(pool)
	accessRepo := repository.NewEtablissementAccessRepository(pool)
	filiereRepo := repository.NewFiliereRepository(pool)
	ueRepo := repository.NewUERepository(pool)
	efRepo := repository.NewEnseignantFiliereRepository(pool)
	anneeRepo := repository.NewAnneeAcademiqueRepository(pool)
	// E1-INVITATIONS : module invitations (6 endpoints, table "Invitation" déjà en DB).
	invitationRepo := repository.NewInvitationRepository(pool)
	// SECT-REG-LINK-B2C-MVP-1 : liens d'inscription direct étudiant (migration 000079).
	// 2 fonctions SECURITY DEFINER (find_student_signup_link_by_token + accept_student_signup).
	studentSignupLinkRepo := repository.NewStudentSignupLinkRepository(pool)
	// SECT-TEACHER-REG-LINK-1 : liens d'inscription direct enseignant (migration
	// 000107). Même pattern — 2 fonctions SECURITY DEFINER
	// (find_teacher_signup_link_by_token + accept_teacher_signup).
	teacherSignupLinkRepo := repository.NewTeacherSignupLinkRepository(pool)
	// SECT-INSCRIPTION-SIGNUP-HOOK-1 : InscriptionRepository pour le hook de
	// création automatique d'Inscription à l'inscription étudiante (migration 000088).
	inscriptionRepo := repository.NewInscriptionRepository(pool)
	// SECT-PROMOTION-BACKEND-1 : PromotionRepository pour la clôture d'année
	// académique (migration 000087). Implémente CreateBatch, GetBatch,
	// ListBatchesByEtablissement, UpdateBatchStatut, GetReglesPassage,
	// ListEtudiantsForPromotion + l'appel à la fonction SECURITY DEFINER
	// cloturer_annee_etudiant.
	promotionRepo := repository.NewPromotionRepository(pool)
	epreuveRepo := repository.NewEpreuveRepository(pool)
	questionRepo := repository.NewQuestionRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)
	resultatRepo := repository.NewResultatRepository(pool)
	documentRepo := repository.NewDocumentRepository(pool)
	// SECT-BIBLIO-P1 (ADR-0007) : bibliothèque numérique.
	ouvrageRepo := repository.NewOuvrageRepository(pool)
	// SECT-BIBLIO-P2 (ADR-0007 §P2) : lecture mesurée (OuvrageLecture,
	// migration 000124 — reprise de page, temps visibilité-gated,
	// agrégats d’activité enseignante).
	ouvrageLectureRepo := repository.NewOuvrageLectureRepository(pool)
	// SECT-BIBLIO-P3 (ADR-0007 §P3) : paquet enseignant — TOC curaté
	// (OuvrageSection) + déclarations d’alignement (AlignementOuvrage,
	// migration 000126) + bibliographie + audit de conformité.
	ouvrageSectionRepo := repository.NewOuvrageSectionRepository(pool)
	alignementRepo := repository.NewAlignementRepository(pool)
	certificatRepo := repository.NewCertificatRepository(pool)
	correctionRepo := repository.NewCorrectionRepository(pool)
	examPrepRepo := repository.NewExamPrepRepository(pool)
	// Task 6 : Messagerie — chat temps réel + IA hybride.
	messagerieRepo := repository.NewMessagerieRepository(pool)
	// SECT-QUOTA-GUARDS : QuotaRepository pour vérifier les limites des plans.
	quotaRepo := repository.NewQuotaRepository(pool)

	// R2 storage client (optionnel — si credentials non fournis, storage = nil)
	var storageClient domain.StorageClient
	r2AccountID := os.Getenv("R2_ACCOUNT_ID")
	r2AccessKey := os.Getenv("R2_ACCESS_KEY_ID")
	r2SecretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	r2Bucket := os.Getenv("R2_BUCKET_NAME")
	r2Endpoint := os.Getenv("R2_ENDPOINT")
	if r2AccountID != "" && r2AccessKey != "" && r2SecretKey != "" {
		r2Client, err := storage.NewR2Client(context.Background(), r2AccountID, r2AccessKey, r2SecretKey, r2Bucket, r2Endpoint)
		if err != nil {
			logger.Warn("R2 client init failed, storage disabled", "error", err)
		} else {
			storageClient = r2Client
			logger.Info("Cloudflare R2 storage enabled", "bucket", r2Bucket, "endpoint", r2Endpoint)
		}
	} else {
		logger.Info("R2 credentials not provided, storage disabled (documents will use DB-only mode)")
	}

	signer := jwt.NewSigner(cfg.JWTSecret)
	// Mailer pour l'envoi des emails transactionnels (reset password, etc.).
	// Priorité : Resend (RESEND_API_KEY) > SMTP (SMTP_HOST) > LogMailer (fallback).
	// Resend est recommandé : délivrabilité élevée, analytics dans le dashboard.
	mailSvc := mailer.New(mailer.Config{
		SMTP: mailer.SMTPConfig{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			User:     cfg.SMTPUser,
			Password: cfg.SMTPPassword,
			From:     cfg.SMTPFrom,
		},
		ResendAPIKey: cfg.ResendAPIKey,
		ResendFrom:   cfg.ResendFrom,
	}, logger)
	// SECT-MONITORING-EMAIL-1 : le type de mailer booté (resend|smtp|log)
	// alimente le check santé « Emails transactionnels » — un LogMailer en
	// prod (var RESEND_API_KEY/SMTP absente ou écrasée) sera visible DEGRADE
	// dans la carte santé au lieu d'un silence feint (emails journalisés).
	monHealthChecker.WithMailer(mailSvc.Kind())
	authUC := usecase.NewAuthUseCase(authRepo, signer, mailSvc, cfg.AppBaseURL, cfg.SessionIdleTimeout)
	// E1/E6/U1/U7 : accessUC doit être créé AVANT etabUC et userUC car les
	// deux dépendent de accessUC pour valider l'autorisation ADMIN sur les writes.
	accessUC := usecase.NewAccessUseCase(accessRepo)
	// ABONNEMENTS-FIX-A3 : pool passé au EtablissementUseCase pour la
	// transaction atomique du wizard de souscription (étab + responsable + abonnement).
	etabUC := usecase.NewEtablissementUseCase(etabRepo, accessUC, pool, authRepo) // SECT-ANNEE-AUDITLOG-1 : +authRepo pour audit SetCurrentAnnee
	// U5 (CRITICAL) : UserUseCase dépend de authRepo pour ResetPassword +
	// UnlockAccount + RevokeAllUserRefreshTokens + CreateAuditLog.
	// U1/U7 (CRITICAL) : UserUseCase dépend de accessUC pour ValidateAccessForEtablissement.
	userUC := usecase.NewUserUseCase(userRepo, authRepo, accessUC, quotaRepo)
	filiereUC := usecase.NewFiliereUseCase(filiereRepo, quotaRepo)
	ueUC := usecase.NewUEUseCase(ueRepo)
	efUC := usecase.NewEnseignantFiliereUseCase(efRepo)
	anneeUC := usecase.NewAnneeUseCase(anneeRepo, authRepo) // SECT-ANNEE-AUDITLOG-1 : +authRepo pour audit mutations
	// E1-INVITATIONS : usecase invitations (token + bcrypt + matricule + email).
	// mailer passé pour l'envoi de l'email d'invitation (template "Savane EdTech"
	// via ResendMailer en production).
	invitationUC := usecase.NewInvitationUseCase(invitationRepo, mailSvc, cfg.AppBaseURL, quotaRepo)
	// SECT-REG-LINK-B2C-MVP-1 : usecase liens d'inscription direct étudiant.
	// - TTL 30 jours (vs 7j invitation — partage manuel WhatsApp/QR).
	// - mailer pour l'email StudentWelcome après acceptation.
	// - quotaRepo injecté pour anticipation Phase 2 (nil-safe côté usecase).
	// SECT-ETABLISSEMENT-AUDIT-1 : authRepo injecté pour journaliser la
	// révocation d'un lien dans AuditLog (avec etablissementId + reason).
	studentSignupLinkUC := usecase.NewStudentSignupLinkUseCase(studentSignupLinkRepo, pool, mailSvc, cfg.AppBaseURL, quotaRepo, authRepo, inscriptionRepo)
	studentSignupLinkUC.SetLogger(func(msg string, args ...any) { logger.Warn(msg, args...) })
	// SECT-TEACHER-REG-LINK-1 : usecase des liens d'inscription enseignant
	// (page /enseignants — même pattern que les liens étudiant).
	// - quotaRepo : check capitation enseignants (CheckEnseignantsQuota).
	// - authRepo  : journalisation AuditLog (TEACHER_SIGNUP_LINK_REVOKED).
	// - mailer    : email de bienvenue WelcomeInvitation (rôle ENSEIGNANT).
	teacherSignupLinkUC := usecase.NewTeacherSignupLinkUseCase(teacherSignupLinkRepo, pool, mailSvc, cfg.AppBaseURL, quotaRepo, authRepo)
	teacherSignupLinkUC.SetLogger(func(msg string, args ...any) { logger.Warn(msg, args...) })
	// SECT-PROMOTION-BACKEND-1 : usecase de clôture d'année académique.
	// - promoRepo : port d'accès PromotionBatch + ReglesPassage + cloturer_annee_etudiant.
	// - authRepo  : journalisation AuditLog (PROMOTION_BATCH_STARTED — pattern
	//   SECT-ETABLISSEMENT-AUDIT-1, le spec permet explicitement authRepo.CreateAuditLog).
	// - pool      : SELECT direct du filiereId+niveau d'un étudiant pour l'override
	//   manuel (PromoteStudentManual) — pas de méthode dédiée dans PromotionRepository,
	//   on évite de polluer l'interface pour un cas isolé.
	// - logger    : journalisation structurée (slog).
	promotionUC := usecase.NewPromotionUseCase(promotionRepo, authRepo, pool, logger)
	epreuveUC := usecase.NewEpreuveUseCase(epreuveRepo, quotaRepo, pool) // SECT-ANNEE-HISTOIRE-2 : pool pour le défaut anneeAcademiqueId
	questionUC := usecase.NewQuestionUseCase(questionRepo)
	sessionUC := usecase.NewSessionUseCase(sessionRepo, resultatRepo, epreuveRepo)
	resultatUC := usecase.NewResultatUseCase(resultatRepo)
	documentUC := usecase.NewDocumentUseCase(documentRepo, storageClient)
	// SECT-BIBLIO-P1 (ADR-0007) : quota stockage bibliothèque lu depuis
	// BIBLIOTHEQUE_QUOTA_MO (défaut 2048 Mo) dans le usecase.
	// SECT-BIBLIO-P2 : le usecase porte aussi la lecture mesurée.
	ouvrageUC := usecase.NewOuvrageUseCase(ouvrageRepo, ouvrageLectureRepo, storageClient)
	// SECT-BIBLIO-P3 (ADR-0007 §P3) : paquet enseignant.
	alignementUC := usecase.NewAlignementUseCase(alignementRepo, ouvrageSectionRepo)
	// SECT-BIBLIO-P4 (ADR-0008) : dimension sociale — annotations,
	// propositions G1, veilles + badge « lecteur assidu » (premier
	// writer Go de BadgeProgression — policies normalisées 000128).
	ouvrageAnnotationRepo := repository.NewOuvrageAnnotationRepository(pool)
	ouvragePropositionRepo := repository.NewOuvragePropositionRepository(pool)
	ouvrageVeilleRepo := repository.NewOuvrageVeilleRepository(pool)
	badgeProgressionRepo := repository.NewBadgeProgressionRepository(pool)
	ouvrageSocialUC := usecase.NewOuvrageSocialUseCase(ouvrageAnnotationRepo, ouvragePropositionRepo, ouvrageVeilleRepo, badgeProgressionRepo, ouvrageRepo, ouvrageLectureRepo)
	certificatUC := usecase.NewCertificatUseCase(certificatRepo)
	correctionUC := usecase.NewCorrectionUseCase(correctionRepo)
	// AUDIO-LEARNING-1 : storageClient passé au ExamPrepUseCase pour les URLs présignées R2 des podcasts.
	examPrepUC := usecase.NewExamPrepUseCase(examPrepRepo, storageClient)

	// AI-CONNECT-1 : AIService — lit le provider actif depuis AIProviderConfig
	// et fait les appels chat completion vers le provider (Mistral, Groq, etc.).
	aiService := ai.NewAIService(pool)

	// AI-PROVIDERS-1 : AIProviderUseCase — logique métier pour la gestion des AI providers.
	aiProviderRepo := repository.NewAIProviderRepository(pool)
	aiProviderUC := usecase.NewAIProviderUseCase(aiProviderRepo)

	// Task 6 : Messagerie — hub SSE (temps réel) + UseCase (chat + IA hybride).
	messagerieHub := httptransport.NewMessagerieHub()
	messagerieUC := usecase.NewMessagerieUseCase(messagerieRepo, aiService, messagerieHub)

	// OPT-7 : hub WebSocket temps réel pour la surveillance.
	// Remplace le polling TanStack Query (30s) par push immédiat.
	surveillanceHub := httptransport.NewSurveillanceHub(logger)
	go surveillanceHub.Run()

	// 4. Configurer le serveur HTTP
	authMiddleware := middleware.Auth(signer)

	// Workers réactivés (policies is_system ajoutées sur les 12 tables worker).
	// SECURITY-BASCULE : les workers posent des claims system-worker via
	// set_config('app.claims.user_id', 'system-worker', true) au lieu de
	// SET LOCAL row_security = off. Les policies _all_system (is_system())
	// permettent l'accès full aux 12 tables : AIProviderConfig, Chapter,
	// Devoir, Document, DocumentAudio, Epreuve, EpreuveQuestion,
	// GrilleEvaluation, Question, Reponse, SessionPassation, Soumission.
	// QUESTIONS-IA-FAILOVER : passer aiService au worker pour bénéficier du
	// failover automatique entre providers (ChatWithFailover).
	iaWorker := worker.NewIAWorker(pool, logger, aiService)
	iaWorker.RecoverInterruptedJobs(context.Background())
	iaWorker.Start(context.Background())

	correctionWorker := worker.NewCorrectionWorker(pool, logger, aiService)
	correctionWorker.RecoverInterruptedCorrections(context.Background())
	correctionWorker.Start(context.Background())

	docAnalyzer := worker.NewDocumentAnalyzerWorker(pool, logger, aiService)
	docAnalyzer.RecoverInterruptedAnalyses(context.Background())
	docAnalyzer.Start(context.Background())

	practiceWorker := worker.NewPracticeWorker(pool, logger, aiService)
	practiceWorker.Start(context.Background())

	homeworkWorker := worker.NewHomeworkCorrectionWorker(pool, logger, aiService)
	homeworkWorker.RecoverInterruptedHomeworkCorrections(context.Background())
	homeworkWorker.Start(context.Background())

	audioWorker := worker.NewAudioGenerationWorker(pool, storageClient, logger, aiService)
	audioWorker.RecoverInterruptedAudioJobs(context.Background())
	audioWorker.Start(context.Background())

	// CLOTURE-AUTO-WORKER : worker périodique (60s) qui clôture automatiquement
	// les épreuves EN_COURS dont dateFin + grâce est dépassée, ET les épreuves
	// où tous les étudiants ont soumis (TOUS_SOUMIS). Garantit la clôture même
	// sans étudiant actif pollant /api/epreuves/auto-close.
	autoCloseWorker := worker.NewAutoCloseWorker(pool, logger).WithRegistry(workerRegistry)
	autoCloseWorker.Start(context.Background())

	// SECT-FACTURE-EMAIL : worker de relance J-7 avant expiration abonnement B2C.
	// Vérifie toutes les 6h les abonnements ACTIF dont dateFin ≤ 7j, envoie email.
	relanceWorker := worker.NewRelanceWorker(pool, logger, mailSvc, cfg.AppBaseURL).WithRegistry(workerRegistry)
	relanceWorker.Start(context.Background())

	// SECT-B2C-EXPIRE : worker d'expiration des abonnements B2C.
	// Vérifie toutes les 1h les abonnements ACTIF dont dateFin < NOW(), les passe
	// à EXPIRE (bloque l'accès), envoie email avec option renouvellement/downgrade.
	expireWorker := worker.NewExpireWorker(pool, logger, mailSvc, cfg.AppBaseURL).WithRegistry(workerRegistry)
	expireWorker.Start(context.Background())

	// SECT-USER-CLEANUP-INFRA-1 : worker de cleanup des users soft-deleted > 90 jours.
	// Vérifie toutes les 24h les users dont deletedAt < NOW() - 90 jours, journalise
	// chaque suppression dans AuditLog (action=USER_HARD_DELETED_AUTO) AVANT le DELETE
	// (pour traçabilité même si le DELETE échoue), puis hard-delete via cascade manuel
	// sur les tables enfants (FK RESTRICT) + final DELETE FROM "User".
	// Pattern identique à expire_worker.go (struct + ticker 24h + first run on startup).
	cleanupWorker := worker.NewCleanupWorker(pool, logger).WithRegistry(workerRegistry)
	cleanupWorker.Start(context.Background())

	// SECT-PROMOTION-BACKEND-1 : worker de clôture d'année académique.
	// Vérifie toutes les 10s les batches PENDING créés par POST
	// /api/etablissements/{id}/cloture-annee, les passe en RUNNING, traitent
	// chaque étudiant via cloturer_annee_etudiant (best-effort), puis marque
	// le batch COMPLETED. Le frontend poll /status pour suivre la progression.
	// Pattern identique à cleanup_worker.go (struct + ticker 10s + first run).
	// Toutes les opérations DB utilisent SystemClaims() (is_system() dans les
	// policies PromotionBatch_modify + User_select permet le bypass worker).
	// Concurrency safety : SELECT ... FOR UPDATE SKIP LOCKED + UPDATE statut=
	// RUNNING dans la même tx → claim atomique multi-instance safe.
	promotionWorker := worker.NewPromotionWorker(pool, logger, promotionRepo).WithRegistry(workerRegistry)
	promotionWorker.Start(context.Background())

	// SECT-BIBLIO-P4 (ADR-0008 §5) : purge de la corbeille bibliothèque.
	// Ouvrages soft-déletés > 30 jours : AuditLog AVANT le DELETE, hard
	// delete sous claims system (policy Ouvrage_delete is_system — 000128,
	// l'app ne peut JAMAIS hard-deleter), CASCADE emporte lectures/
	// sections/alignements/annotations, objet R2 supprimé POST-COMMIT.
	// Pattern cleanup_worker : ticker 1h + premier check au boot.
	bibliothequePurgeWorker := worker.NewBibliothequePurgeWorker(pool, logger, storageClient).WithRegistry(workerRegistry)
	bibliothequePurgeWorker.Start(context.Background())

	// FIX-5 : worker de détection de similarité entre copies (post-exam).
	// Vérifie toutes les 5 min les épreuves CLOTUREE dont l'établissement
	// a rapportFraude=true, compare les paires d'étudiants et insère
	// dans SimilarityReport. Utilise SystemClaims() pour bypass RLS.
	similarityWorker := worker.NewSimilarityWorker(pool, logger).WithRegistry(workerRegistry)
	similarityWorker.Start(context.Background())

	// ADR-0012 §4 (monitoring P5) : worker d'alerting — évalue les règles
	// persistées (AlertingRule) toutes les 2 min contre les métriques
	// réelles et dispatch : événement in-app (transition), Slack
	// (SLACK_WEBHOOK_URL), email dédié (ALERTING_EMAIL_TO via le mailer
	// Resend > SMTP > Log). Canaux non configurés = journalisés +
	// exposés à l'UI (GET /rules → channels) — jamais de silence feint.
	alertingEmailReady := cfg.ResendAPIKey != "" ||
		(cfg.SMTPHost != "" && cfg.SMTPUser != "" && cfg.SMTPPassword != "" && cfg.SMTPFrom != "")
	alertingCfg := monitoring.AlertingConfig{
		SlackWebhookURL:   cfg.SlackWebhookURL,
		AlertingEmailTo:   cfg.AlertingEmailTo,
		EmailReady:        alertingEmailReady,
		AppBaseURL:        cfg.AppBaseURL,
		DiscordWebhookURL: cfg.DiscordWebhookURL, // SECT-MONITORING-DISCORD-1 — canal principal
	}
	alertingWorker := worker.NewAlertingWorker(pool, logger, monRecorder, mailSvc, alertingCfg).WithRegistry(workerRegistry)
	alertingWorker.Start(context.Background())

	// MESSAGERIE-GROUP-TIMEOUT : la réponse IA en salon collectif (@assistant)
	// utilise désormais un timeout serveur synchrone de 25s (< 30s Render free)
	// avec message d'erreur gracieux si timeout. L'approche worker async avec
	// channel in-memory ne fonctionnait pas de façon fiable sur Render free
	// (cold start tue le worker goroutine avant traitement du job).

	server := httptransport.NewServer(userRepo, userUC, authUC, etabUC, accessUC, filiereUC, ueUC, efUC, anneeUC, invitationUC, epreuveUC, questionUC, sessionUC, resultatUC, documentUC, certificatUC, correctionUC, examPrepUC, messagerieUC, messagerieHub, surveillanceHub, aiService, aiProviderUC, storageClient, pool, cfg.CORSAllowedOrigins, authMiddleware, monRecorder, monHealthChecker, mailSvc, cfg.AppBaseURL, quotaRepo, studentSignupLinkUC, teacherSignupLinkUC, authRepo, promotionUC, inscriptionRepo, ouvrageUC, alignementUC, ouvrageSocialUC, monSampler)

	// ADR-0012 (monitoring P5) : config des canaux d'alerting exposée à
	// l'UI (GET /api/monitoring/rules → channels).
	server.WithAlertingConfig(alertingCfg)

	// SECT-NOTIF-DISPATCHER-1 : dispatcher central de notifications.
	// Instancié APRÈS le serveur (le hub SSE global est dans transport/http,
	// on passe une fonction de broadcast qui l'utilise). Injecté via setter
	// (pattern WithGeniusPay/WithTurnstile) — évite d'étendre NewServer.
	// Le dispatcher est nil-safe côté handlers : si nil, pas de notification.

	// FCM mobile push (canal 5). nil = FCM désactivé (dev mode).
	fcmSender := notification.NewFCMSender(pool, logger, cfg.FirebaseProjectID, cfg.FirebaseServiceAccountKey)

	notifDispatcher := notification.New(pool, mailSvc, logger, func(userID string, event notification.SSEEvent) {
		// Adaptateur : le hub SSE attend transport/http.SSEEventAdapter,
		// le dispatcher utilise notification.SSEEvent (pas de dépendance
		// circulaire notification → transport/http). On convertit ici.
		httptransport.BroadcastNotification(userID, httptransport.SSEEventAdapter{
			Type:      event.Type,
			Data:      event.Data,
			Timestamp: event.Timestamp,
		})
	}, cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey, cfg.VAPIDSubject, fcmSender)
	server.WithNotificationDispatcher(notifDispatcher)
	// ADR-0011 §6 — plus de « CRITICAL muet » : chaque événement CRITICAL
	// inséré (panic, escalade) notifie les ADMIN actifs via le dispatcher
	// (in-app + SSE + push + email selon préférences). Throttle 15 min pour
	// éviter le spam en cas de cascade (les CRITICAL partagent souvent la
	// même cause racine).
	var lastCriticalNotify time.Time
	monRecorder.SetOnCritical(func(evt monitoring.Event) {
		if time.Since(lastCriticalNotify) < 15*time.Minute {
			return
		}
		lastCriticalNotify = time.Now()
		// Destinataires : ADMIN actifs (claims system — lecture directe,
		// le runtime tourne en neondb_owner BYPASSRLS).
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rows, err := pool.Query(ctx, `SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "actif" = true`)
		if err != nil {
			logger.Error("OnCritical: query admins failed", "error", err)
			return
		}
		defer rows.Close()
		var adminIDs []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err == nil {
				adminIDs = append(adminIDs, id)
			}
		}
		for _, adminID := range adminIDs {
			notifDispatcher.Dispatch(ctx, notification.Event{
				UserID:      adminID,
				Type:        "ALERTE_SYSTEME_CRITIQUE",
				Titre:       "Alerte système critique",
				Message:     evt.Message,
				Categorie:   "admin",
				Priorite:    "error",
				ActionURL:   "/monitoring",
				ActionLabel: "Ouvrir le monitoring",
				Icone:       "Activity",
			})
		}
		logger.Info("OnCritical: admins notifiés", "count", len(adminIDs), "message", evt.Message)
	})

	// ADR-0011 — registre de workers exposé à /api/monitoring/overview.
	server.WithWorkerRegistry(workerRegistry)
	server.WithVapidPublicKey(cfg.VAPIDPublicKey)
	logger.Info("Notification dispatcher configured", "pushEnabled", cfg.VAPIDPublicKey != "", "fcmEnabled", fcmSender != nil)

	// SECT-NOTIF-CLOTURE-1 : injecte le dispatcher dans PromotionUseCase
	// pour que la clôture notifie chaque étudiant (promu/redoublant/diplômé).
	promotionUC.SetNotificationDispatcher(notifDispatcher)

	// SECT-BIBLIO-P4 (ADR-0008) : notifications sociales — décision sur
	// une proposition (au proposant), badge débloqué (au lecteur),
	// veille matchante (à l'abonné). Fire-and-forget, nil-safe.
	ouvrageSocialUC.SetNotificationDispatcher(notifDispatcher)

	// SECT-GENIUSPAY-WAVE : injecte le client GeniusPay si configuré.
	// Si GENIUSPAY_API_KEY est vide, le client est nil et les handlers retournent 503.
	if cfg.GeniusPayAPIKey != "" {
		gpClient := geniuspay.NewClient(cfg.GeniusPayAPIKey, cfg.GeniusPayAPISecret, cfg.GeniusPayBaseURL)
		server.WithGeniusPay(gpClient, cfg.GeniusPayWebhookSecret)
		logger.Info("GeniusPay client configured",
			"baseURL", cfg.GeniusPayBaseURL,
			"webhookSecretSet", cfg.GeniusPayWebhookSecret != "",
		)
	} else {
		logger.Warn("GeniusPay not configured (GENIUSPAY_API_KEY empty) — payment endpoints will return 503")
	}

	// SECT-REG-LINK-PHASE2-BACKEND-1 : injecte le TurnstileVerifier si configuré.
	// Si TURNSTILE_SECRET_KEY est vide, la vérification est skipée (dev mode).
	// Le frontend détecte l'absence de site key via GET /api/turnstile/site-key
	// et skip le widget côté UI.
	if cfg.TurnstileSecretKey != "" {
		turnstileVerifier := httptransport.NewTurnstileVerifier(cfg.TurnstileSecretKey)
		server.WithTurnstile(turnstileVerifier, cfg.TurnstileSiteKey)
		logger.Info("Cloudflare Turnstile configured",
			"siteKeySet", cfg.TurnstileSiteKey != "",
		)
	} else {
		logger.Warn("Cloudflare Turnstile not configured (TURNSTILE_SECRET_KEY empty) — /api/student-signup will skip captcha verification (dev mode)")
	}

	// CACHE-RAM-1 + OPT-3 : worker goroutine — synchronise le cache RAM vers Neon.
	//
	// AVANT : FlushSessionToNeon par session → 1 tx par session (5000 tx / 30s).
	// APRÈS : BatchFlushToNeon → 1 tx pour toutes les sessions (~10 tx / 30s).
	// Si le batch échoue, un fallback individuel par session est appliqué.
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			dirtySessions := server.GetDirtySessions()
			if len(dirtySessions) == 0 {
				continue
			}
			logger.Info("flushing dirty sessions to Neon (batch)", "count", len(dirtySessions))
			ctx := context.Background()
			flushed, errs := server.BatchFlushToNeon(ctx, dirtySessions)
			if len(errs) > 0 {
				for _, err := range errs {
					logger.Warn("batch flush partial failure", "error", err)
				}
			}
			if flushed > 0 {
				logger.Info("batch flush completed", "flushed", flushed, "total", len(dirtySessions))
			}
		}
	}()

	// OPT-6 : self-ping pour empêcher Render free tier de s'endormir.
	// Render s'endort après 15 min d'inactivité. Pendant un examen, l'API est
	// active, mais avant/après, le self-ping maintient l'instance éveillée.
	// Le ping est sur le localhost (pas de coût réseau externe).
	if cfg.Environment != "production" || os.Getenv("RENDER") != "" {
		go func() {
			ticker := time.NewTicker(10 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				resp, err := http.Get("http://localhost:" + cfg.Port + "/health")
				if err != nil {
					logger.Warn("self-ping failed", "error", err)
					continue
				}
				_ = resp.Body.Close()
				logger.Debug("self-ping ok", "port", cfg.Port)
			}
		}()
	}

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      middleware.Logging(logger)(server),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 5. Démarrer (graceful shutdown)
	go func() {
		logger.Info("HTTP server listening", "port", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("server forced shutdown", "error", err)
	}
	logger.Info("server exited")
}
