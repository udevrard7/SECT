// Package config centralise le chargement des variables d'environnement
// pour le backend Go SECT.
package config

import (
        "fmt"
        "os"
        "strings"

        "github.com/joho/godotenv"
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

        // GeniusPay (SECT-GENIUSPAY-WAVE) : paiement Wave pour B2C Prof Premium.
        // Clé API (sk_sandbox_... / sk_live_...) pour create_payment + get_payment.
        GeniusPayAPIKey string
        // Secret API (ss_sandbox_... / ss_live_...) — requis pour payouts uniquement
        // (non utilisé pour les paiements entrants, mais stocké pour usage futur).
        GeniusPayAPISecret string
        // Secret webhook (whsec_sandbox_... / whsec_live_...) pour vérifier la
        // signature HMAC-SHA256 des webhooks entrants.
        GeniusPayWebhookSecret string
        // Base URL de l'API GeniusPay (sandbox = https://api.geniuspay.ci/sandbox,
        // production = https://api.geniuspay.ci/v1/merchant).
        GeniusPayBaseURL string

        // SECT-REG-LINK-PHASE2-BACKEND-1 : Cloudflare Turnstile (captcha pour
        // /api/student-signup endpoint public). Si TURNSTILE_SECRET_KEY est vide,
        // la vérification est skipée côté backend (dev mode). Le site key est exposé
        // au frontend via GET /api/turnstile/site-key pour rendre le widget.
        TurnstileSecretKey string
        TurnstileSiteKey   string

        // SECT-NOTIF-VAPID-1 : Web Push (VAPID). Si VAPID_PUBLIC_KEY est vide,
        // le push est désactivé (le dispatcher log seulement). Configurer dans
        // Render dashboard avec les clés générées via `web-push generate-vapid-keys`.
        VAPIDPublicKey  string
        VAPIDPrivateKey string
        VAPIDSubject    string // "mailto:contact@sect.app" ou "https://sect-app.vercel.app"

        // Firebase Cloud Messaging (FCM) for mobile push notifications.
        // If FIREBASE_PROJECT_ID is empty, FCM push is disabled (dev mode).
        // In production, configure via Render environment variables.
        FirebaseProjectID       string
        FirebaseServiceAccountKey string // JSON string of service account key (base64 encoded)
}

// Load reads configuration from environment variables.
// In development, loads .env file first (if present).
// Returns an error if a required variable is missing.
func Load() (*Config, error) {
        // Charger .env si présent (dev local uniquement)
        _ = godotenv.Load()
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

                // SECT-GENIUSPAY-WAVE
                GeniusPayAPIKey:        getEnv("GENIUSPAY_API_KEY", ""),
                GeniusPayAPISecret:     getEnv("GENIUSPAY_API_SECRET", ""),
                GeniusPayWebhookSecret: getEnv("GENIUSPAY_WEBHOOK_SECRET", ""),
                // Base URL : défaut sandbox (dev). En prod, set GENIUSPAY_BASE_URL=https://api.geniuspay.ci/v1/merchant
                GeniusPayBaseURL: getEnv("GENIUSPAY_BASE_URL", "https://api.geniuspay.ci"),

                // SECT-REG-LINK-PHASE2-BACKEND-1 : Cloudflare Turnstile.
                // Secrets vides en dev → vérification skipée (TurnstileVerifier.Verify
                // retourne true, nil). En prod, set TURNSTILE_SECRET_KEY + TURNSTILE_SITE_KEY.
                TurnstileSecretKey: getEnv("TURNSTILE_SECRET_KEY", ""),
                TurnstileSiteKey:   getEnv("TURNSTILE_SITE_KEY", ""),

                // SECT-NOTIF-VAPID-1 : Web Push (VAPID).
                VAPIDPublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
                VAPIDPrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
                VAPIDSubject:    getEnv("VAPID_SUBJECT", "mailto:contact@sect.app"),

                // Firebase Cloud Messaging (FCM) for mobile push.
                FirebaseProjectID:         getEnv("FIREBASE_PROJECT_ID", ""),
                FirebaseServiceAccountKey: getEnv("FIREBASE_SERVICE_ACCOUNT_KEY", ""),
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
