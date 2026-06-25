// Package main est le point d'entrée du backend Go SECT.
//
// Le serveur expose une API REST sur le port 8080 (configurable via PORT).
// Il se connecte à Neon Postgres via pgxpool et utilise les claims RLS
// pour le filtrage automatique des données par rôle.
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
	"github.com/udevrard7/sect/apps/api/internal/middleware"
	"github.com/udevrard7/sect/apps/api/internal/repository"
	httptransport "github.com/udevrard7/sect/apps/api/internal/transport/http"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	logger.Info("starting SECT API server", "version", "0.1.0")

	// 1. Charger la configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	logger.Info("configuration loaded",
		"env", cfg.Environment,
		"port", cfg.Port,
	)

	// 2. Connexion à Neon Postgres
	pool, err := appdb.New(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to Neon", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	logger.Info("connected to Neon Postgres")

	// 3. Initialiser les repositories
	userRepo := repository.NewUserRepository(pool)

	// 4. Configurer le serveur HTTP
	server := httptransport.NewServer(userRepo, cfg.JWTSecret, cfg.CORSAllowedOrigins)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      middleware.Logging(logger)(server),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 5. Démarrer le serveur (graceful shutdown)
	go func() {
		logger.Info("HTTP server listening", "port", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Attendre SIGINT / SIGTERM
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
