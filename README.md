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
- **Sécurité** : Row Level Security (143 policies Neon), JWT HMAC-SHA256, bcrypt, lockout
- **Stockage** : Cloudflare R2 (S3-compatible) pour les documents PDF/DOCX
- **Exam-prep** : révision espacée (SM-2), planning, pratique, aide étudiant↔enseignant
- **Messagerie** : salons de classe/promo + DM étudiant↔enseignant avec modération et réactions

## Architecture

```
sect/
├── frontend/                    # Next.js 16 (UI uniquement) → Vercel
│   ├── src/
│   │   ├── app/                 # App Router (pages + routes auth shim)
│   │   │   ├── (app)/           # Routes authentifiées (layout group)
│   │   │   ├── api/             # Routes API locales (PDF certs/relevés/factures)
│   │   │   ├── login/ invitation/ verify/ offline/
│   │   ├── components/          # 34 dossiers métier + shadcn/ui (components/ui)
│   │   ├── stores/              # Zustand (auth-store)
│   │   ├── hooks/               # Custom hooks
│   │   ├── lib/                 # Utilitaires (pdf, ai-providers, __tests__)
│   │   ├── types/               # Types TypeScript partagés
│   │   └── proxy.ts             # Auth gate + redirect /login
│   ├── e2e/                     # Tests Playwright
│   ├── docs/                    # Documentation frontend
│   ├── public/                  # Assets statiques (logo, manifest PWA)
│   ├── supabase/                # Config Supabase (legacy)
│   ├── vercel.json              # Rewrites /api/* → Render + headers sécurité
│   ├── playwright.config.ts
│   └── package.json
│
├── backend/                     # Go 1.24 (API REST) → Render
│   ├── cmd/api/                 # Point d'entrée (main.go)
│   ├── internal/
│   │   ├── ai/                  # Intégration LLM (Z.ai / failover providers)
│   │   ├── cache/               # Cache local en mémoire
│   │   ├── config/              # Chargement variables d'environnement
│   │   ├── db/                  # pgxpool + RLS claims (SetClaimsTx, WithTx)
│   │   ├── domain/              # Entités métier + interfaces repositories
│   │   ├── usecase/             # Logique métier (auth, CRUD, grading, messagerie…)
│   │   ├── repository/          # Implémentations pgx (RLS automatique)
│   │   ├── transport/http/      # Routeur chi + handlers HTTP (40 domaines)
│   │   ├── middleware/          # Auth (cookie+Bearer), logging, CORS
│   │   ├── jwt/                 # JWT HMAC-SHA256 (access 15min + refresh 7j)
│   │   ├── monitoring/          # Événements de monitoring applicatif
│   │   ├── storage/             # Client Cloudflare R2 (S3)
│   │   └── worker/              # Workers asynchrones
│   ├── db/                      # Couche données
│   │   ├── db/migrations/       # 53 migrations golang-migrate (000001→000053)
│   │   ├── db/reference/        # Schéma consolidé (schema.sql, pour sqlc)
│   │   ├── queries/             # Requêtes sqlc (user.sql)
│   │   ├── MIGRATIONS_RECONCILIATION.md  # Audit doublons + dérive schema_migrations
│   │   └── sqlc.yaml
│   ├── Dockerfile               # Multi-stage (golang:1.24 → alpine:3.20)
│   ├── Makefile                 # dev / build / migrate-up / sqlc-gen…
│   └── go.mod
│
├── render.yaml                  # Config déploiement Render (backend)
├── worklog.md                   # Journal des évolutions (Task IDs SECT-*)
├── CONTRIBUTING.md
├── LICENSE
└── .gitignore
```

## Infrastructure

| Composant | Technologie | Hébergement | URL |
|-----------|-------------|-------------|-----|
| **Frontend** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui | Vercel | [sect-app.vercel.app](https://sect-app.vercel.app) |
| **Backend** | Go 1.24 + chi/v5 + pgx/v5 | Render (Docker) | [sect-s1pb.onrender.com](https://sect-s1pb.onrender.com) |
| **Base de données** | PostgreSQL 18 + RLS | Neon | endpoint `ep-muddy-river-asz862wj` (region `eu-central-1`) |
| **Stockage fichiers** | Cloudflare R2 (S3-compatible) | Cloudflare | bucket `sect-documents` |
| **CI/CD** | GitHub → Vercel (auto) + Render (auto) | GitHub | `udevrard7/SECT` |

> Le frontend Vercel agit comme proxy : `vercel.json` réécrit `/api/:path*` vers le backend Render. Les routes `/api/certificats/{id}/pdf`, `/api/etudiants/{id}/releve-notes` et `/api/factures/{id}/pdf` sont servies localement par Next.js (génération PDF côté serveur).

## Sécurité

- **Auth** : JWT HMAC-SHA256 natif Go (access 15min + refresh 7j avec rotation)
- **Mots de passe** : bcrypt cost 10 (compatible hashes existants)
- **Lockout** : 5 tentatives → verrouillage 15min
- **RLS Neon** : 143 policies sur 59 tables activées, claims de session (`app.claims.*`)
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

Créer un fichier `.env` à la racine de chaque service avec les variables suivantes :

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

> ⚠️ Ne jamais committer de fichier `.env`. Les secrets vont dans les dashboards Vercel / Render / GitHub Secrets.

## API

Le backend expose **183 enregistrements de routes** répartis sur **40 domaines** (dénombrement vérifié depuis `backend/internal/transport/http/router.go`) :

| Domaine | Endpoints | Description |
|---------|-----------|-------------|
| Auth | 5 | login, refresh, logout, change-password, /me (JWT + refresh rotation + audit) |
| Users | 5 | CRUD complet + permission matrix |
| Etablissements | 8 | CRUD + upload-logo + watermark |
| Etablissement-access | 5 | Demandes d'accès ADMIN + check |
| Filieres | 7 | CRUD + bulk update + export CSV |
| Unites-enseignement | 5 | CRUD + filières supplémentaires |
| Enseignant-filieres | 3 | Assignations + delete composite |
| Annees-academiques | 2 | List + create |
| Epreuves | 6 | CRUD + state machine + questions list |
| Questions | 6 | CRUD + batch hard delete |
| Sessions | 5 | Passation + auto-grading |
| Soumissions | — | Gestion des soumissions d'épreuves |
| Resultats | 3 | Stats globales et par étudiant |
| Documents | 5 | Upload R2 + presigned URLs |
| Certificats | 4 | CRUD + verify public + revoquer |
| Correction | 4 | Sessions à corriger + retourner |
| Messagerie | — | Salons classe/promo + DM + réactions + modération |
| Grilles-evaluation | — | Grilles de critères d'évaluation |
| Affectations | — | Affectations enseignant↔filière/UE |
| Invitations | — | Invitations utilisateurs (fonctions SQL `SECURITY DEFINER`) |
| Exam-prep | 14 | Dashboard + review (SM-2) + planning + practice + help |
| Stats | 4 | Tableaux de bord par rôle (enseignant, étudiant, admin, responsable) |
| Badges | 2 | Définitions de badges |
| Devoirs | 2 | List + statistiques |
| Alertes | 1 | Centre d'alertes |
| Surveillance | 1 | Stats anti-fraude |
| Corbeille | 1 | Éléments supprimés |
| Notifications | 2 | List + notifications admin |
| Abonnements | 1 | Abonnements SaaS |
| Factures | 1 | Factures (+ PDF) |
| Plans | 1 | Plans tarifaires |
| Platform-settings | 1 | Paramètres plateforme |
| AI-providers | 1 | Fournisseurs AI + failover |
| Monitoring | 1 | Événements de monitoring |
| Logs | 1 | Logs applicatifs |
| Ip-whitelist | 1 | Liste blanche IP |
| Security-settings | 1 | Paramètres de sécurité |
| Enseignant | 2 | Contexte + liste étudiants |
| Etudiants | 1 | Liste étudiants (+ relevé PDF) |
| Validations-ue | 1 | Validations d'UE |
| Failover | — | Bascule AI providers |

> **Routes publiques (sans auth)** : `/health`, `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/certificats/verify/{code}`. Toutes les autres exigent un cookie `access_token` httpOnly ou un header `Authorization: Bearer` valide.

## Base de données

Statistiques vérifiées sur la base Neon PostgreSQL de production :

- **61 tables** + **1 vue** (schéma `public`, PascalCase)
- **28 types enum** (118 valeurs au total)
- **104 contraintes de clés étrangères**
- **200 index**
- **143 policies RLS** (Row Level Security) sur **59 tables activées**, claims de session posés via `SET LOCAL`
- **39 triggers** (essentiellement `updated_at` automatique)
- **58 fonctions** (helpers RLS, invitations `SECURITY DEFINER`, agrégats stats…)
- **53 migrations** versionnées dans `backend/db/db/migrations/` (golang-migrate), numérotées `000001`→`000053`, toutes appliquées

```bash
# Appliquer les migrations
cd backend
make migrate-up DB_URL="$NEON_DATABASE_URL"
# ou directement :
migrate -path db/db/migrations -database "$NEON_DATABASE_URL" up
```

> ℹ️ Un audit des migrations (doublons historiques 000039/000040 et 000050, réconciliation `schema_migrations`) est documenté dans [`backend/db/MIGRATIONS_RECONCILIATION.md`](backend/db/MIGRATIONS_RECONCILIATION.md).

## Licence

MIT — Voir le fichier [LICENSE](LICENSE).

## Auteurs

- **Ulrich EVRARD** — *Propriétaire* — [udevrard7](https://github.com/udevrard7)
