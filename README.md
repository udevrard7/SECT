# SECT — Système d'Évaluation Casse-Tête

Monorepo : **Frontend Next.js** + **Backend Go (Clean Architecture)**

## Structure

```
sect/
├── frontend/          # Next.js 16 (UI + API routes) → Vercel
│   ├── src/           # App Router, composants, hooks
│   ├── prisma/        # Schéma Prisma
│   └── package.json
├── backend/           # Go 1.24 (API REST) → Render
│   ├── cmd/api/       # Point d'entrée
│   ├── internal/      # Clean Architecture
│   ├── db/            # Migrations SQL
│   └── go.mod
├── render.yaml        # Config déploiement Render
└── worklog.md         # Journal de développement
```

## Infrastructure

| Service | Technologie | Hébergement |
|---------|-------------|-------------|
| Frontend | Next.js 16 + React 19 | Vercel |
| Backend | Go 1.24 + chi/v5 + pgx/v5 | Render |
| Base de données | PostgreSQL 18 + RLS | Neon |
| Stockage fichiers | Cloudflare R2 (S3) | Cloudflare |
