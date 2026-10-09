# ============================================================
# SECT API — Dockerfile multi-stage (Go 1.27)
# ============================================================
# Stage 1: Build (compile le binaire Go)
# Stage 2: Runtime (image minimale Alpine avec le binaire)
#
# SECT-OCI-HYBRID-1 : build MULTI-ARCH. La VM OCI Marseille est Ampere A1
# (ARM64) ; Render build en AMD64. Les ARG TARGETOS/TARGETARCH sont
# pré-remplis par BuildKit (docker buildx --platform linux/arm64) et
# retombent sur linux/amd64 en build simple — Render est inchangé.
# Build ARM64 : docker buildx build --platform linux/arm64 .
#
# SECT-OCI-DEPLOY-3 (fix exec format error) : le builder tourne sur la
# plateforme NATIVE du runner (--platform=$BUILDPLATFORM) et cross-compile
# via GOARCH=$TARGETARCH — pattern Go canonique : pas d'émulation QEMU sur le
# stage lourd (go mod download + go build). Avant ce fix, le binaire amd64 se
# retrouvait dans l'image arm64 (exec format error sur l'A1) — preuve ELF
# e_machine=0x3E dans l'image linux/arm64 sha256:5edb47f… du 09/10.
# ============================================================

# --- Stage 1: Build (cross-compile — NATIF sur le runner, zéro émulation) ---
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS builder

# SECT-OCI-HYBRID-1 : cible d'architecture (auto par BuildKit multi-plateforme,
# défaut amd64 pour un docker build simple — ex. Render).
ARG TARGETOS=linux
ARG TARGETARCH=amd64
# BUILDPLATFORM (auto BuildKit) : plateforme du runner — le binaire Go est
# cross-compilé pour TARGETARCH, le compilateur reste natif.
WORKDIR /app

# Copier les fichiers de dépendances en premier (cache Docker)
COPY go.mod go.sum ./
RUN go mod download

# Copier le reste du code source
COPY . .

# Compiler le binaire statique (CGO_DISABLED pour Alpine)
# SECT-OCI-HYBRID-1 : GOARCH paramétré par TARGETARCH (arm64 sur OCI Ampere A1,
# amd64 par défaut — Render inchangé).
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
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
