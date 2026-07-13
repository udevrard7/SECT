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
        "github.com/udevrard7/sect/backend/internal/jwt"
        "github.com/udevrard7/sect/backend/internal/mailer"
        "github.com/udevrard7/sect/backend/internal/middleware"
        "github.com/udevrard7/sect/backend/internal/monitoring"
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
        logger.Info("monitoring recorder + health checker initialized")

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
        epreuveRepo := repository.NewEpreuveRepository(pool)
        questionRepo := repository.NewQuestionRepository(pool)
        sessionRepo := repository.NewSessionRepository(pool)
        resultatRepo := repository.NewResultatRepository(pool)
        documentRepo := repository.NewDocumentRepository(pool)
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
        authUC := usecase.NewAuthUseCase(authRepo, signer, mailSvc, cfg.AppBaseURL)
        // E1/E6/U1/U7 : accessUC doit être créé AVANT etabUC et userUC car les
        // deux dépendent de accessUC pour valider l'autorisation ADMIN sur les writes.
        accessUC := usecase.NewAccessUseCase(accessRepo)
        // ABONNEMENTS-FIX-A3 : pool passé au EtablissementUseCase pour la
        // transaction atomique du wizard de souscription (étab + responsable + abonnement).
        etabUC := usecase.NewEtablissementUseCase(etabRepo, accessUC, pool)
        // U5 (CRITICAL) : UserUseCase dépend de authRepo pour ResetPassword +
        // UnlockAccount + RevokeAllUserRefreshTokens + CreateAuditLog.
        // U1/U7 (CRITICAL) : UserUseCase dépend de accessUC pour ValidateAccessForEtablissement.
        userUC := usecase.NewUserUseCase(userRepo, authRepo, accessUC, quotaRepo)
        filiereUC := usecase.NewFiliereUseCase(filiereRepo, quotaRepo)
        ueUC := usecase.NewUEUseCase(ueRepo)
        efUC := usecase.NewEnseignantFiliereUseCase(efRepo)
        anneeUC := usecase.NewAnneeUseCase(anneeRepo)
        // E1-INVITATIONS : usecase invitations (token + bcrypt + matricule + email).
        // mailer passé pour l'envoi de l'email d'invitation (template "Savane EdTech"
        // via ResendMailer en production).
        invitationUC := usecase.NewInvitationUseCase(invitationRepo, mailSvc, cfg.AppBaseURL, quotaRepo)
        epreuveUC := usecase.NewEpreuveUseCase(epreuveRepo, quotaRepo)
        questionUC := usecase.NewQuestionUseCase(questionRepo)
        sessionUC := usecase.NewSessionUseCase(sessionRepo, resultatRepo, epreuveRepo)
        resultatUC := usecase.NewResultatUseCase(resultatRepo)
        documentUC := usecase.NewDocumentUseCase(documentRepo, storageClient)
        certificatUC := usecase.NewCertificatUseCase(certificatRepo)
        correctionUC := usecase.NewCorrectionUseCase(correctionRepo)
        // AUDIO-LEARNING-1 : storageClient passé au ExamPrepUseCase pour les URLs présignées R2 des podcasts.
        examPrepUC := usecase.NewExamPrepUseCase(examPrepRepo, storageClient)

        // AI-CONNECT-1 : AIService — lit le provider actif depuis AIProviderConfig
        // et fait les appels chat completion vers le provider (Mistral, Groq, etc.).
        aiService := ai.NewAIService(pool)

        // Task 6 : Messagerie — hub SSE (temps réel) + UseCase (chat + IA hybride).
        messagerieHub := httptransport.NewMessagerieHub()
        messagerieUC := usecase.NewMessagerieUseCase(messagerieRepo, aiService, messagerieHub)

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

        correctionWorker := worker.NewCorrectionWorker(pool, logger)
        correctionWorker.RecoverInterruptedCorrections(context.Background())
        correctionWorker.Start(context.Background())

        docAnalyzer := worker.NewDocumentAnalyzerWorker(pool, logger)
        docAnalyzer.RecoverInterruptedAnalyses(context.Background())
        docAnalyzer.Start(context.Background())

        practiceWorker := worker.NewPracticeWorker(pool, logger)
        practiceWorker.Start(context.Background())

        homeworkWorker := worker.NewHomeworkCorrectionWorker(pool, logger)
        homeworkWorker.RecoverInterruptedHomeworkCorrections(context.Background())
        homeworkWorker.Start(context.Background())

        audioWorker := worker.NewAudioGenerationWorker(pool, storageClient, logger)
        audioWorker.RecoverInterruptedAudioJobs(context.Background())
        audioWorker.Start(context.Background())

        // CLOTURE-AUTO-WORKER : worker périodique (60s) qui clôture automatiquement
        // les épreuves EN_COURS dont dateFin + grâce est dépassée, ET les épreuves
        // où tous les étudiants ont soumis (TOUS_SOUMIS). Garantit la clôture même
        // sans étudiant actif pollant /api/epreuves/auto-close.
        autoCloseWorker := worker.NewAutoCloseWorker(pool, logger)
        autoCloseWorker.Start(context.Background())

        // MESSAGERIE-GROUP-TIMEOUT : la réponse IA en salon collectif (@assistant)
        // utilise désormais un timeout serveur synchrone de 25s (< 30s Render free)
        // avec message d'erreur gracieux si timeout. L'approche worker async avec
        // channel in-memory ne fonctionnait pas de façon fiable sur Render free
        // (cold start tue le worker goroutine avant traitement du job).

        server := httptransport.NewServer(userRepo, userUC, authUC, etabUC, accessUC, filiereUC, ueUC, efUC, anneeUC, invitationUC, epreuveUC, questionUC, sessionUC, resultatUC, documentUC, certificatUC, correctionUC, examPrepUC, messagerieUC, messagerieHub, aiService, storageClient, pool, cfg.CORSAllowedOrigins, authMiddleware, monRecorder, monHealthChecker, mailSvc, cfg.AppBaseURL, quotaRepo)

        // CACHE-RAM-1 : worker goroutine — synchronise le cache RAM vers Neon
        // toutes les 30s en une série d'appels SaveReponse (un par question).
        // Le worker n'a pas de claims HTTP : FlushSessionToNeon construit les
        // claims RLS depuis l'EtudiantID stocké en cache (RLS = ON, sécurisé).
        go func() {
                ticker := time.NewTicker(30 * time.Second)
                defer ticker.Stop()
                for range ticker.C {
                        dirtySessions := server.GetDirtySessions()
                        if len(dirtySessions) == 0 {
                                continue
                        }
                        logger.Info("flushing dirty sessions to Neon", "count", len(dirtySessions))
                        ctx := context.Background()
                        for _, ds := range dirtySessions {
                                if err := server.FlushSessionToNeon(ctx, ds); err != nil {
                                        logger.Warn("flush session to Neon failed", "sessionId", ds.SessionID, "error", err)
                                }
                        }
                }
        }()

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
