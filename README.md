# SECT — Système d'Évaluation Casse-Tête

> Plateforme d'évaluation en ligne propulsée par l'IA pour l'enseignement supérieur en Afrique.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go)](https://go.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Vue d'ensemble

SECT est une plateforme complète d'évaluation qui permet aux établissements d'enseignement supérieur de **créer, surveiller et corriger** des examens en ligne avec l'aide de l'intelligence artificielle.

### Fonctionnalités principales

- **Multi-rôles** : ADMIN (propriétaire PaaS), RESPONSABLE, ENSEIGNANT, ÉTUDIANT
- **Gestion académique** : filières, niveaux (L1→Doctorat), unités d'enseignement, années académiques
- **Évaluations** : création d'épreuves (QCU/QCM/QRC/CODE), sessions de passation, correction automatique
- **Sécurité** : Row Level Security (96 policies Neon), JWT HMAC-SHA256, bcrypt, lockout
- **Stockage** : Cloudflare R2 (S3-compatible) pour les documents PDF/DOCX
- **Exam-prep** : révision espacée (SM-2), planning, pratique, aide étudiant↔enseignant

## Architecture

```
sect/
├── frontend/                    # Next.js 16 (UI uniquement) → Vercel
│   ├── src/
│   │   ├── app/                 # App Router (pages + 4 routes auth shim)
│   │   ├── components/          # Composants React + shadcn/ui
│   │   ├── stores/              # Zustand (auth-store)
│   │   ├── hooks/               # Custom hooks
│   │   ├── lib/                 # Utilitaires
│   │   └── proxy.ts             # Auth gate + redirect /login
│   ├── prisma/                  # Schéma Prisma (legacy, build-time only)
│   └── package.json
│
├── backend/                     # Go 1.24 (API REST) → Render
│   ├── cmd/api/                 # Point d'entrée (main.go)
│   ├── internal/
│   │   ├── config/              # Chargement variables d'environnement
│   │   ├── db/                  # pgxpool + RLS claims (SetClaimsTx, WithTx)
│   │   ├── domain/              # Entités métier + interfaces repositories
│   │   ├── usecase/             # Logique métier (auth, CRUD, grading)
│   │   ├── repository/          # Implémentations pgx (RLS automatique)
│   │   ├── transport/http/      # Routeur chi + handlers HTTP
│   │   ├── middleware/          # Auth (cookie+Bearer), logging, CORS
│   │   ├── jwt/                 # JWT HMAC-SHA256 (access 15min + refresh 7j)
│   │   └── storage/             # Client Cloudflare R2 (S3)
│   ├── db/                      # Migrations SQL (golang-migrate)
│   │   ├── migrations/          # 8 migrations (DDL + RLS + triggers)
│   │   └── reference/           # Schéma consolidé (pour sqlc)
│   ├── Dockerfile               # Multi-stage (golang:1.24 → alpine:3.20)
│   └── go.mod
│
├── render.yaml                  # Config déploiement Render (backend)
└── .gitignore
```

## Infrastructure

| Composant | Technologie | Hébergement | URL |
|-----------|-------------|-------------|-----|
| **Frontend** | Next.js 16 + React 19 + Tailwind CSS 4 | Vercel | [sect-app.vercel.app](https://sect-app.vercel.app) |
| **Backend** | Go 1.24 + chi/v5 + pgx/v5 | Render | [sect-s1pb.onrender.com](https://sect-s1pb.onrender.com) |
| **Base de données** | PostgreSQL 18 + RLS (96 policies) | Neon | `autumn-rain-10233998` |
| **Stockage fichiers** | Cloudflare R2 (S3-compatible) | Cloudflare | `sect-documents` |
| **CI/CD** | GitHub → Vercel (auto) + Render (auto) | GitHub | `udevrard7/SECT` |

## Sécurité

- **Auth** : JWT HMAC-SHA256 natif Go (access 15min + refresh 7j avec rotation)
- **Mots de passe** : bcrypt cost 10 (compatible hashes existants)
- **Lockout** : 5 tentatives → verrouillage 15min
- **RLS Neon** : 96 policies sur 49 tables, claims de session (`app.claims.*`)
- **Cookies httpOnly** : `access_token` + `refresh_token` (Secure + SameSite=Lax)
- **CORS** : `AllowCredentials: true`, headers `Cookie` + `Authorization`
- **IP réelle** : `GetClientIP()` lit `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP`
- **Aucun secret en clair** dans le code source (tous via env vars)

## Démarrage rapide

### Prérequis

- [Bun](https://bun.sh/) (frontend)
- [Go 1.24+](https://go.dev/dl/) (backend)
- PostgreSQL (Neon, Supabase, ou local)

### Frontend (port 3000)

```bash
cd frontend
bun install
bun run dev
```

### Backend (port 8080)

```bash
cd backend
go run ./cmd/api
```

### Variables d'environnement

Copier `.env.example` vers `.env` et remplir :

```env
# Backend
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=votre-secret-jwt
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=sect-documents
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8080
# Variables optionnelles pour le skill Z.ai (chatbot, génération de questions)
# ZAI_BASE_URL=...
# ZAI_API_KEY=...
# ZAI_CHAT_ID=...
# ZAI_USER_ID=...
# ZAI_TOKEN=...
```

## API

Le backend expose **115 endpoints** sur **36 domaines** (dénombrement vérifié depuis `backend/internal/transport/http/router.go`) :

| Domaine | # | Endpoints | Description |
|---------|--:|-----------|-------------|
| Auth | 5 | login, refresh, logout, change-password, /me | JWT + refresh rotation + audit |
| Users | 5 | CRUD complet | CRUD + permission matrix |
| Etablissements | 8 | CRUD + upload-logo + watermark | CRUD + logo + watermark config |
| Etablissement-access | 5 | list, create, check, authorized, update | Demandes d'accès ADMIN + check |
| Filieres | 7 | CRUD + bulk + export | CRUD + bulk update + export CSV |
| Unites-enseignement | 5 | CRUD complet | CRUD + filières supplémentaires |
| Enseignant-filieres | 3 | list, create, delete | Assignations + delete composite |
| Annees-academiques | 2 | list, create | List + create |
| Epreuves | 6 | CRUD + questions | CRUD + state machine + questions list |
| Questions | 6 | CRUD + batch delete | CRUD + batch hard delete |
| Sessions | 5 | list, start, save, get, submit | Passation + auto-grading |
| Resultats | 3 | list, overview, etudiant-overview | Stats globales et par étudiant |
| Documents | 5 | CRUD + download | Upload R2 + presigned URLs |
| Certificats | 4 | list, get, verify, revoquer | CRUD + verify public + revoquer |
| Correction | 4 | list, retourner-batch, retourner, update-reponse | Sessions à corriger + retourner |
| Exam-prep | 14 | dashboard, documents, review, planning, practice, help | Dashboard + review + planning + practice + help |
| Stats | 4 | enseignant, etudiant, admin, responsable | Tableaux de bord par rôle |
| Badges | 2 | list, create | Définitions de badges |
| Devoirs | 2 | list, stats | List + statistiques |
| Alertes | 1 | list | Centre d'alertes |
| Surveillance | 1 | stats | Stats anti-fraude |
| Corbeille | 1 | list | Éléments supprimés |
| Notifications | 2 | list, admin | List + notifications admin |
| Abonnements | 1 | list | Abonnements SaaS |
| Factures | 1 | list | Factures |
| Plans | 1 | list | Plans tarifaires |
| Platform-settings | 1 | get | Paramètres plateforme |
| AI-providers | 1 | list | Fournisseurs AI + failover |
| Monitoring | 1 | list | Événements de monitoring |
| Logs | 1 | list | Logs applicatifs |
| Ip-whitelist | 1 | list | Liste blanche IP |
| Security-settings | 1 | get | Paramètres de sécurité |
| Enseignant | 2 | context, etudiants | Contexte + liste étudiants |
| Etudiants | 1 | list | Liste étudiants |
| Validations-ue | 1 | list | Validations d'UE |
| Health | 2 | `/health` + `/api/health` | Healthcheck (même handler, 2 paths pour compat rewrite Vercel) |

> **Note** : Les routes publiques (sans auth) sont `/health`, `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/certificats/verify/{code}`. Toutes les autres exigent un cookie `access_token` httpOnly ou un header `Authorization: Bearer` valide.

## Base de données

Statistiques vérifiées sur la base Neon PostgreSQL de production :

- **50 tables** (schéma `public`, PascalCase) + **23 enums** + **82 FK** + **162 index**
- **98 policies RLS** (Row Level Security) avec claims de session posés via `SET LOCAL`
- **35 triggers** (essentiellement `updated_at` automatique)
- **8 migrations** versionnées dans `backend/db/db/migrations/` (golang-migrate)

```bash
# Appliquer les migrations
cd backend
migrate -path db/migrations -database "$NEON_DIRECT_URL" up
```

## Licence

MIT — Voir le fichier [LICENSE](LICENSE).

## Auteurs

- **Ulrich EVRARD** — *Propriétaire* — [udevrard7](https://github.com/udevrard7)
