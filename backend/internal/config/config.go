// Package config centralise le chargement des variables d'environnement
// pour le backend Go SECT.
package config

import (
        "fmt"
        "os"
        "strings"
)

// Config holds all application configuration loaded from environment.
type Config struct {
        // HTTP server
        Port string `env:"PORT" default:"8080"`

        // Neon Postgres (poolé — pour le runtime)
        DatabaseURL string `env:"NEON_DATABASE_URL"`

        // Neon Postgres (direct — pour golang-migrate)
        DirectURL string `env:"NEON_DIRECT_URL"`

        // JWT / Auth
        JWTSecret string `env:"JWT_SECRET"`

        // CORS
        CORSAllowedOrigins []string `env:"CORS_ORIGINS" default:"https://sect-app.vercel.app"`

        // Environment (dev / staging / production)
        Environment string `env:"ENVIRONMENT" default:"development"`

        // SMTP (emails transactionnels — mot de passe oublié)
        // Fallback si Resend n'est pas configuré. Si SMTP_HOST est vide, un LogMailer
        // journalise les emails (utile en dev).
        SMTPHost     string
        SMTPPort     string
        SMTPUser     string
        SMTPPassword string
        SMTPFrom     string

        // Resend (recommandé — emails transactionnels via API REST)
        // Si RESEND_API_KEY est non vide, ResendMailer est utilisé en priorité.
        // RESEND_FROM_EMAIL doit être une adresse sur un domaine vérifié dans Resend.
        ResendAPIKey string
        ResendFrom   string

        // AppBaseURL est l'URL publique du frontend (pour construire le lien de
        // reset password). Par défaut l'URL Vercel de production.
        AppBaseURL string
}

// Load reads configuration from environment variables.
// Returns an error if a required variable is missing.
func Load() (*Config, error) {
        cfg := &Config{
                Port:        getEnv("PORT", "8080"),
                DatabaseURL: getEnv("NEON_DATABASE_URL", ""),
                DirectURL:   getEnv("NEON_DIRECT_URL", ""),
                JWTSecret:   getEnv("JWT_SECRET", ""),
                Environment: getEnv("ENVIRONMENT", "development"),

                SMTPHost:     getEnv("SMTP_HOST", ""),
                SMTPPort:     getEnv("SMTP_PORT", "587"),
                SMTPUser:     getEnv("SMTP_USER", ""),
                SMTPPassword: getEnv("SMTP_PASS", ""),
                SMTPFrom:     getEnv("SMTP_FROM", ""),

                ResendAPIKey: getEnv("RESEND_API_KEY", ""),
                ResendFrom:   getEnv("RESEND_FROM_EMAIL", ""),

                AppBaseURL: getEnv("APP_BASE_URL", "https://sect-app.vercel.app"),
        }

        // Parse CORS origins (comma-separated)
        corsRaw := getEnv("CORS_ORIGINS", "https://sect-app.vercel.app")
        cfg.CORSAllowedOrigins = strings.Split(corsRaw, ",")

        // Validate required
        if cfg.DatabaseURL == "" {
                return nil, fmt.Errorf("NEON_DATABASE_URL is required")
        }
        if cfg.JWTSecret == "" {
                // In dev, allow fallback to a default; in prod, fail
                if cfg.Environment == "production" {
                        return nil, fmt.Errorf("JWT_SECRET is required in production")
                }
                cfg.JWTSecret = "dev-secret-change-me"
        }

        return cfg, nil
}

func getEnv(key, fallback string) string {
        if v := os.Getenv(key); v != "" {
                return v
        }
        return fallback
}
