# ============================================================
# SECT API — Dockerfile multi-stage (Go 1.27)
# ============================================================
# Stage 1: Build (compile le binaire Go)
# Stage 2: Runtime (image minimale Alpine avec le binaire)
# ============================================================

# --- Stage 1: Build ---
FROM golang:1.27-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances en premier (cache Docker)
COPY go.mod go.sum ./
RUN go mod download

# Copier le reste du code source
COPY . .

# Compiler le binaire statique (CGO_DISABLED pour Alpine)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /app/bin/sect-api \
    ./cmd/api

# --- Stage 2: Runtime ---
FROM alpine:3.20

# Installer ca-certificates (nécessaire pour HTTPS vers Neon/R2)
RUN apk --no-cache add ca-certificates tzdata

# HARDENING (audit DevOps 2026-09) : utilisateur non-root + healthcheck
# intégré (l'image est utilisable telle quelle hors Render).
RUN addgroup -S sect && adduser -S -G sect -u 10001 sect

WORKDIR /app

# Copier le binaire depuis le stage de build
COPY --from=builder --chown=sect:sect /app/bin/sect-api /app/sect-api

USER sect

# Port exposé (Render utilise la variable PORT)
ENV PORT=8080
EXPOSE 8080

# Healthcheck local (Render a son propre healthCheckPath — les deux cohabitent)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8080}/health || exit 1

# Démarrer le serveur
CMD ["/app/sect-api"]
