# SECT — Système d'Évaluation Casse-Tête

> Plateforme d'évaluation en ligne propulsée par l'IA pour l'enseignement supérieur en Afrique.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go)](https://go.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql)](https://www.postgresql.org)
[![Migrations](https://img.shields.io/badge/migrations-103-brightgreen)](backend/db/db/migrations)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend-000?logo=vercel)](https://sect-app.vercel.app)
[![Render](https://img.shields.io/badge/Render-Backend-46E3B7?logo=render)](https://sect-zead.onrender.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Vue d'ensemble

SECT est une plateforme complète d'évaluation qui permet aux établissements d'enseignement supérieur de **créer, surveiller et corriger** des examens en ligne avec l'aide de l'intelligence artificielle.

### Fonctionnalités principales

- **Multi-rôles** : ADMIN (propriétaire PaaS), RESPONSABLE, ENSEIGNANT, ÉTUDIANT
- **Gestion académique** : filières, niveaux (L1→Doctorat), unités d'enseignement, années académiques
- **Évaluations** : création d'épreuves (QCU/QCM/QRC/CODE), sessions de passation, correction automatique par IA
- **Modèle SaaS hybride** : B2C (Prof Solo gratuit / Prof Premium 4 900 FCFA/mois) + B2B (Institutionnel, capitation 900 FCFA/étudiant/an, plancher 50) avec self-service inscription, essai 14 jours, validation admin
- **Paiement** : GeniusPay (Wave, Côte d'Ivoire) pour B2C ; virement/cartes pour B2B ; factures PDF avec TVA
- **Sécurité** : Row Level Security (146 policies Neon sur 62 tables), JWT HMAC-SHA256, bcrypt, lockout
- **Stockage** : Cloudflare R2 (S3-compatible) pour les documents PDF/DOCX
- **Exam-prep** : révision espacée (SM-2), flashcards, planning, pratique, aide étudiant↔enseignant, audio TTS
- **Messagerie** : salons de classe/promo + DM étudiant↔enseignant avec modération, réactions, signalement
- **Surveillance** : anti-fraude (stats proctoring, WebSocket temps réel, lockout soumission)
- **PDF institutionnels** : sujets / corrigés / feuilles de réponses multi-pages avec branding B2B (logo, filière, niveau), watermark, barème récapitulatif, bloc émargement
- **Performance** : pic de soumission protégé (202 async + submit_limiter + jitter), ~800-1000 étudiants simultanés sur free tier

## Architecture (monorepo)

```
sect/
├── frontend/                     # Next.js 16 (UI) → Vercel
│   ├── src/
│   │   ├── app/                  # App Router (pages + routes API locales PDF)
│   │   │   ├── (app)/            # Routes authentifiées (layout group)
│   │   │   ├── api/              # Routes API locales (PDF certs/relevés/factures/épreuves)
│   │   │   ├── login/ invitation/ verify/ offline/
│   │   ├── components/           # 34 dossiers métier + shadcn/ui (components/ui)
│   │   ├── stores/               # Zustand (auth-store)
│   │   ├── hooks/                # Custom hooks
│   │   ├── lib/                  # Utilitaires (pdf, ai-providers, __tests__)
│   │   ├── types/                # Types TypeScript partagés
│   │   └── proxy.ts              # Auth gate + redirect /login
│   ├── public/                   # Assets statiques (logo, manifest PWA)
│   ├── e2e/                      # Tests Playwright (auth + facturation)
│   ├── docs/                     # Documentation frontend (design-system.md)
│   ├── vercel.json               # Rewrites /api/* → Render + headers sécurité
│   ├── next.config.ts
│   ├── tsconfig.json             # TypeScript strict
│   ├── eslint.config.mjs
│   ├── tailwind.config.ts
│   ├── playwright.config.ts
│   ├── vitest.config.ts
│   └── package.json
│
├── backend/                      # Go 1.24 (API REST) → Render
│   ├── cmd/api/                  # Point d'entrée (main.go)
│   ├── cmd/loadtest-submit/      # Outil de load testing (soumission massive)
│   ├── internal/
│   │   ├── ai/                   # Intégration LLM multi-providers (Z.ai / Mistral / failover)
│   │   ├── cache/                # Cache local en mémoire
│   │   ├── config/               # Chargement variables d'environnement
│   │   ├── db/                   # pgxpool + RLS claims (SetClaimsTx, WithTx)
│   │   ├── domain/               # Entités métier + interfaces repositories
│   │   ├── usecase/              # Logique métier (auth, CRUD, grading, messagerie…)
│   │   ├── repository/           # Implémentations pgx (RLS automatique)
│   │   ├── transport/http/       # Routeur chi + handlers HTTP (40 domaines, 222 routes)
│   │   ├── middleware/           # Auth (cookie+Bearer), logging, CORS
│   │   ├── jwt/                  # JWT HMAC-SHA256 (access 15min + refresh 7j)
│   │   ├── monitoring/           # Événements de monitoring applicatif
│   │   ├── storage/              # Client Cloudflare R2 (S3)
│   │   └── worker/               # Workers asynchrones (9 : IA, Correction, Document, Practice, Homework, Audio, AutoClose, Relance, Expire, Similarity)
│   ├── db/                       # Couche données
│   │   ├── db/migrations/        # 103 migrations golang-migrate (000001→000103)
│   │   ├── db/reference/         # Schéma consolidé (schema.sql, pour sqlc)
│   │   ├── queries/              # Requêtes sqlc (user.sql)
│   │   ├── MIGRATIONS_RECONCILIATION.md  # Audit doublons + dérive schema_migrations
│   │   └── sqlc.yaml
│   ├── Dockerfile                # Multi-stage (golang:1.24 → alpine:3.20)
│   ├── Makefile                  # dev / build / migrate-up / sqlc-gen…
│   └── go.mod
│
├── render.yaml                   # Config déploiement Render (backend, rootDir: backend)
├── vercel.json                   # Config déploiement Vercel (miroir de frontend/vercel.json)
├── worklog.md                    # Journal des évolutions (Task IDs SECT-*)
├── CONTRIBUTING.md
├── LICENSE
└── .gitignore
```

## Infrastructure

| Composant | Technologie | Hébergement | URL |
|-----------|-------------|-------------|-----|
| **Frontend** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui | Vercel | [sect-app.vercel.app](https://sect-app.vercel.app) |
| **Backend** | Go 1.24 + chi/v5 + pgx/v5 | Render (Docker) | [sect-zead.onrender.com](https://sect-zead.onrender.com) |
| **Base de données** | PostgreSQL 18 + RLS | Neon | endpoint `ep-muddy-river-asz862wj` (region `eu-central-1`) |
| **Stockage fichiers** | Cloudflare R2 (S3-compatible) | Cloudflare | bucket `sect-documents` |
| **CI/CD** | GitHub → Vercel (auto) + Render (auto) | GitHub | `udevrard7/SECT` |

> Le frontend Vercel agit comme proxy : `frontend/vercel.json` réécrit `/api/:path*` vers le backend Render. Les routes `/api/certificats/{id}/pdf`, `/api/etudiants/{id}/releve-notes`, `/api/factures/{id}/pdf` et `/api/epreuves/{id}/pdf` sont servies localement par Next.js (génération PDF côté serveur avec `@react-pdf/renderer`).

## Sécurité

- **Auth** : JWT HMAC-SHA256 natif Go (access 15min + refresh 7j avec rotation)
- **Mots de passe** : bcrypt cost 10 (compatible hashes existants)
- **Lockout** : 5 tentatives → verrouillage 15min
- **RLS Neon** : 146 policies sur 62 tables activées, claims de session (`app.claims.*` via `SET LOCAL app.claims.*`)
- **Cookies httpOnly** : `access_token` + `refresh_token` (Secure + SameSite=Lax)
- **CORS** : `AllowCredentials: true`, headers `Cookie` + `Authorization`
- **IP réelle** : `GetClientIP()` lit `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP`
- **Aucun secret en clair** dans le code source (tous via env vars, fichier `.env` gitignored)

## Démarrage rapide

### Prérequis

- [Bun](https://bun.sh/) (frontend)
- [Go 1.24+](https://go.dev/dl/) (backend)
- [golang-migrate](https://github.com/golang-migrate/migrate) (migrations DB)
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

Créer un fichier `.env` dans `backend/` (**jamais committé**, déjà dans `.gitignore`) avec :

```env
# Backend
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_DIRECT_URL=postgresql://user:pass@host/db?sslmode=require  # pour les migrations
JWT_SECRET=votre-secret-jwt-32-caracteres-min
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=sect-documents
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com

# Frontend (dans frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8080
```

> ⚠️ **Ne jamais committer de fichier `.env`.** Les secrets vont dans les dashboards Vercel / Render / GitHub Secrets. Le `.gitignore` exclut déjà `.env`, `.env.*`, `*.pem`, `*.key`.

## API

Le backend expose **222 routes HTTP** réparties sur **40 domaines** (vérifié depuis `backend/internal/transport/http/router.go` : 119 GET + 68 POST + 2 PUT + 15 PATCH + 18 DELETE) :

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
| AI-providers | 1 | Fournisseurs AI + failover (Z.ai, Mistral, OpenAI-compatible, DASHSCOPE, DEEPSEEK, CEREBRAS) |
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

Statistiques vérifiées sur la base Neon PostgreSQL de production (migration version 103) :

- **63 tables** + **1 vue** (schéma `public`, PascalCase)
- **28 types enum** (120 valeurs au total)
- **63 contraintes PRIMARY KEY** + **4 UNIQUE** + **106 FOREIGN KEY** + **481 CHECK**
- **213 index**
- **146 policies RLS** (Row Level Security) sur **62 tables activées**, claims de session posés via `SET LOCAL app.claims.*`
- **39 triggers** (essentiellement `updated_at` automatique)
- **76 fonctions** dont **75 `SECURITY DEFINER`** (helpers RLS, invitations, validation B2B, agrégats stats, capitation B2B…)
- **103 migrations** versionnées dans `backend/db/db/migrations/` (golang-migrate), numérotées `000001`→`000103`, toutes appliquées

```bash
# Appliquer les migrations
cd backend
make migrate-up DB_URL="$NEON_DATABASE_URL"
# ou directement :
migrate -path db/db/migrations -database "$NEON_DATABASE_URL" up
```

> ℹ️ Un audit des migrations (doublons historiques 000039/000040 et 000050, réconciliation `schema_migrations`) est documenté dans [`backend/db/MIGRATIONS_RECONCILIATION.md`](backend/db/MIGRATIONS_RECONCILIATION.md).
>
> 📋 Migrations récentes notables : `000055` (refonte B2B/B2C + capitation), `000059` (IA usage tracking), `000061` (GeniusPay Wave), `000067`→`000074` (self-service B2B/B2C, facturation, anti-abus, multi-établissements), `000075` (fix `validate_b2b_establishment`), `000099`→`000101` (session capture, similarity report, identity photo), `000102` (SecuritySettings RLS admin full access), `000103` (durée validité accès 24h). Voir `worklog.md` pour le détail des Task IDs `SECT-*`.

## Évolutions récentes

Le journal complet des évolutions est dans [`worklog.md`](worklog.md). Points marquants :

- **`EPREUVES-DATES-FIX` (V1→V4)** — Correction du bug « impossible de modifier les dates d'une épreuve » (le frontend envoyait le format `datetime-local` HTML au backend Go qui attendait du RFC3339 strict → `time.Parse` échouait). Fix : parser tolérant côté Go + conversion `toRFC3339()` côté front. Refonte UX du dialog « Fenêtre d'ouverture » : presets rapides, auto-calc via icône link, validation temps réel, layout responsive (flex-col sm:flex-row).
- **`EPREUVES-PDF-V2` / `EPREUVES-PDF-V3`** — Refonte professionnelle des PDFs épreuves (sujet/corrigé/feuille-réponses) avec `@react-pdf/renderer` server-side : multi-page (header/footer fixes sur chaque page), branding B2B (logo + nom établissement + filière + niveau), watermark diagonal configurable, barème récapitulatif, bloc émargement sur la feuille de réponses, badge session (NORMALE/RATTRAPAGE/SPECIALE).
- **`AI-PROVIDERS-MISTRAL`** — Ajout de Mistral AI comme provider dédié (chat) avec modèles propres + failover. `AIProviderType` étendu.
- **`AI-PROVIDERS-MODELS-V2`** — Modèles actualisés par fournisseur + nouveaux providers (DASHSCOPE, DEEPSEEK, CEREBRAS) + fallback Model Switcher.
- **`SECU-SYNC-FIX`** — Fix synchronisation Admin `/securite` ↔ Responsable `/parametres` Sécurité (migration 000102, RLS policies alignées pour ADMIN full access).
- **`DUREE-VALIDITE-24H`** — Formulaire accès établissements : durée max 24h avec sélection prédéfinie (migration 000103).
- **`SECT-B2B-VALIDATE-FIX-1`** — Correction du bug `SQLSTATE 42804` sur `validate_b2b_establishment()` (migration 000075).
- **`SECT-CAPACITY-V2` / `OPT-1`→`OPT-11`** — Optimisations performance pour le pic de soumission : `202 async` + `submit_limiter` (5 slots concurrents), jitter 45s, WebSocket push, gzip, debounce saves, SWR IndexedDB. Capacité mesurée free tier : ~800-1000 étudiants en pic sans perte de données.
- **`SECT-RENDER-DEPLOY-FIX-1`** — Cohérence `go.mod` (gorilla/websocket) pour le déploiement Render.
- **Refonte "Savane EdTech"** — Identité visuelle des modules `/facturation`, `/abonnements` (Validation B2B, Plans tarifaires) avec palette DS unifiée, kente strip, GlassModal, animations Framer Motion.
- **B2B self-service** — Inscription établissements sans intervention admin (`000067`→`000074`) : création Etablissement + RESPONSABLE + abonnement `EN_ATTENTE_VALIDATION`, vérification email par token, validation admin → ESSAI 14j, anti-abus (1 essai/nom, 1 essai/téléphone, flag email non-pro).
- **`DEVOPS-REPO-CLEANUP`** — Audit DevOps : nettoyage doublons et artefacts sandbox, `.gitignore` professionnel monorepo, structure propre `frontend/` + `backend/`.

## Qualité & conventions

- **TypeScript strict** sur tout le frontend (0 erreur tolérée)
- **ESLint** (Next.js + React + TypeScript rules) — 0 erreur sur les fichiers modifiés
- **Go vet** + **go build** obligatoires avant push backend
- **Conventional Commits** (en français) : `<SCOPE>-<TASK>: description` — exemples : `EPREUVES-DATES-FIX-V4:`, `feat:`, `fix:`
- **Une seule branche** : `main` (pas de dev/feature branches, déploiement continu auto)
- **Worklog obligatoire** : chaque tâche append une section dans `worklog.md` avec Task ID, Agent, Work Log, Stage Summary
- **Structure monorepo** : `frontend/` (Next.js → Vercel) + `backend/` (Go → Render), pas de code à la racine

## Licence

MIT — Voir le fichier [LICENSE](LICENSE).

## Auteurs

- **Ulrich EVRARD** — *Propriétaire* — [udevrard7](https://github.com/udevrard7) — ulrichdouh@gmail.com
