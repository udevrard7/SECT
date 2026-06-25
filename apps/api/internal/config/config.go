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
}

// Load reads configuration from environment variables.
// Returns an error if a required variable is missing.
func Load() (*Config, error) {
	cfg := &Config{
		Port:       getEnv("PORT", "8080"),
		DatabaseURL: getEnv("NEON_DATABASE_URL", ""),
		DirectURL:  getEnv("NEON_DIRECT_URL", ""),
		JWTSecret:  getEnv("JWT_SECRET", ""),
		Environment: getEnv("ENVIRONMENT", "development"),
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
