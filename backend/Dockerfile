# ============================================================
# SECT API — Dockerfile (Go 1.24, single-stage for Render compatibility)
# ============================================================
# Simplified from multi-stage to single-stage for Render free tier.
# The multi-stage build was failing on Render — single-stage avoids
# the COPY --from=builder step which might be the failure point.
# ============================================================

FROM golang:1.24-alpine

WORKDIR /app

# Copier les fichiers de dépendances en premier (cache Docker)
COPY go.mod go.sum ./
RUN go mod download

# Copier le reste du code source
COPY . .

# Compiler le binaire statique (CGO_DISABLED pour Alpine)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /app/sect-api \
    ./cmd/api

# Installer ca-certificates (nécessaire pour HTTPS vers Neon/R2)
RUN apk --no-cache add ca-certificates tzdata

# Port exposé (Render utilise la variable PORT)
ENV PORT=8080
EXPOSE 8080

# Démarrer le serveur
CMD ["/app/sect-api"]
