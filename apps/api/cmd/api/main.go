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

        "github.com/udevrard7/sect/apps/api/internal/config"
        appdb "github.com/udevrard7/sect/apps/api/internal/db"
        "github.com/udevrard7/sect/apps/api/internal/domain"
        "github.com/udevrard7/sect/apps/api/internal/jwt"
        "github.com/udevrard7/sect/apps/api/internal/middleware"
        "github.com/udevrard7/sect/apps/api/internal/repository"
        "github.com/udevrard7/sect/apps/api/internal/storage"
        httptransport "github.com/udevrard7/sect/apps/api/internal/transport/http"
        "github.com/udevrard7/sect/apps/api/internal/usecase"
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

        // 3. Initialiser repositories + usecases
        userRepo := repository.NewUserRepository(pool)
        authRepo := repository.NewAuthRepository(pool)
        etabRepo := repository.NewEtablissementRepository(pool)
        accessRepo := repository.NewEtablissementAccessRepository(pool)
        filiereRepo := repository.NewFiliereRepository(pool)
        ueRepo := repository.NewUERepository(pool)
        efRepo := repository.NewEnseignantFiliereRepository(pool)
        anneeRepo := repository.NewAnneeAcademiqueRepository(pool)
        epreuveRepo := repository.NewEpreuveRepository(pool)
        questionRepo := repository.NewQuestionRepository(pool)
        sessionRepo := repository.NewSessionRepository(pool)
        resultatRepo := repository.NewResultatRepository(pool)
        documentRepo := repository.NewDocumentRepository(pool)
        certificatRepo := repository.NewCertificatRepository(pool)
        correctionRepo := repository.NewCorrectionRepository(pool)
        examPrepRepo := repository.NewExamPrepRepository(pool)

        // R2 storage client (optionnel — si credentials non fournis, storage = nil)
        var storageClient domain.StorageClient
        r2AccountID := os.Getenv("R2_ACCOUNT_ID")
        r2AccessKey := os.Getenv("R2_ACCESS_KEY_ID")
        r2SecretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
        r2Bucket := os.Getenv("R2_BUCKET_NAME")
        if r2AccountID != "" && r2AccessKey != "" && r2SecretKey != "" {
                r2Client, err := storage.NewR2Client(context.Background(), r2AccountID, r2AccessKey, r2SecretKey, r2Bucket)
                if err != nil {
                        logger.Warn("R2 client init failed, storage disabled", "error", err)
                } else {
                        storageClient = r2Client
                        logger.Info("Cloudflare R2 storage enabled", "bucket", r2Bucket)
                }
        } else {
                logger.Info("R2 credentials not provided, storage disabled (documents will use DB-only mode)")
        }

        signer := jwt.NewSigner(cfg.JWTSecret)
        authUC := usecase.NewAuthUseCase(authRepo, signer)
        userUC := usecase.NewUserUseCase(userRepo)
        etabUC := usecase.NewEtablissementUseCase(etabRepo)
        accessUC := usecase.NewAccessUseCase(accessRepo)
        filiereUC := usecase.NewFiliereUseCase(filiereRepo)
        ueUC := usecase.NewUEUseCase(ueRepo)
        efUC := usecase.NewEnseignantFiliereUseCase(efRepo)
        anneeUC := usecase.NewAnneeUseCase(anneeRepo)
        epreuveUC := usecase.NewEpreuveUseCase(epreuveRepo)
        questionUC := usecase.NewQuestionUseCase(questionRepo)
        sessionUC := usecase.NewSessionUseCase(sessionRepo, resultatRepo, epreuveRepo)
        resultatUC := usecase.NewResultatUseCase(resultatRepo)
        documentUC := usecase.NewDocumentUseCase(documentRepo, storageClient)
        certificatUC := usecase.NewCertificatUseCase(certificatRepo)
        correctionUC := usecase.NewCorrectionUseCase(correctionRepo)
        examPrepUC := usecase.NewExamPrepUseCase(examPrepRepo)

        // 4. Configurer le serveur HTTP
        authMiddleware := middleware.Auth(signer)
        server := httptransport.NewServer(userRepo, userUC, authUC, etabUC, accessUC, filiereUC, ueUC, efUC, anneeUC, epreuveUC, questionUC, sessionUC, resultatUC, documentUC, certificatUC, correctionUC, examPrepUC, cfg.CORSAllowedOrigins, authMiddleware)

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
