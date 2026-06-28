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
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/repository"
	"github.com/udevrard7/sect/backend/internal/storage"
	httptransport "github.com/udevrard7/sect/backend/internal/transport/http"
	"github.com/udevrard7/sect/backend/internal/usecase"
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

	// AI-CONNECT-1 : AIService — lit le provider actif depuis AIProviderConfig
	// et fait les appels chat completion vers le provider (Mistral, Groq, etc.).
	aiService := ai.NewAIService(pool)

	// 4. Configurer le serveur HTTP
	authMiddleware := middleware.Auth(signer)
	server := httptransport.NewServer(userRepo, userUC, authUC, etabUC, accessUC, filiereUC, ueUC, efUC, anneeUC, epreuveUC, questionUC, sessionUC, resultatUC, documentUC, certificatUC, correctionUC, examPrepUC, aiService, pool, cfg.CORSAllowedOrigins, authMiddleware)

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
