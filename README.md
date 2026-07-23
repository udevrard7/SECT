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

SECT est une plateforme complète d'évaluation qui permet aux établissements d'enseignement supérieur de **créer, surveiller et corriger** des examens en ligne avec l'aide de l'intelligence artificielle. Elle embarque également un **module de révision espacée** (exam-prep) pour la préparation aux examens, une **messagerie** de classe, et un **modèle SaaS hybride** B2C/B2B.

### Fonctionnalités principales

- **Multi-rôles** : ADMIN (propriétaire PaaS), RESPONSABLE (établissement), ENSEIGNANT, ÉTUDIANT
- **Gestion académique** : établissements, filières, niveaux (L1→Doctorat), unités d'enseignement, années académiques, clôture/promotion
- **Évaluations** : création d'épreuves (QCU / QCM / QRC / CODE), sessions de passation, correction automatique par IA
- **Surveillance anti-fraude** : fullscreen obligatoire, capture d'écran périodique, photo d'identité, rapport de similarité, WebSocket temps réel, pénalités, lockout
- **Exam-prep (révision)** : répétition espacée SM-2, flashcards IA, planning de révision, pratique, banque collaborative, Q&A RAG, aide étudiant↔enseignant, audio TTS (podcasts de révision)
- **Messagerie** : salons de classe/promo + DM étudiant↔enseignant avec modération, réactions, signalement, mode silencieux
- **Modèle SaaS hybride** : B2C (Prof Solo gratuit / Prof Premium 4 900 FCFA/mois) + B2B (Institutionnel, capitation 900 FCFA/étudiant/an, plancher 50) avec self-service inscription, essai 14 jours, validation admin
- **Paiement** : GeniusPay (Wave, Côte d'Ivoire) pour B2C ; virement/cartes pour B2B ; factures PDF avec TVA
- **Sécurité** : Row Level Security (173 policies Neon sur 67 tables), JWT HMAC-SHA256, bcrypt, lockout, Turnstile anti-bot
- **Stockage** : Cloudflare R2 (S3-compatible) pour les documents PDF/DOCX
- **PDF institutionnels** : sujets / corrigés / feuilles de réponses / certificats / relevés de notes / fiches de notes / factures — multi-pages avec branding B2B
- **Performance** : pic de soumission protégé (`202 async` + `submit_limiter` + jitter 45s), capacité mesurée > 1000 étudiants simultanés en pic (test de charge réel)
- **Notifications** : in-app, SSE temps réel, Web Push (VAPID), email transactionnel (Resend/SMTP)
- **IA multi-providers** : 10 fournisseurs (Z.ai, OpenAI, Anthropic, Mistral, Google, Voxtral, DashScope, DeepSeek, Cerebras, OpenAI-compatible) avec failover automatique

---

## Architecture (monorepo)

```
sect/
├── frontend/                     # Next.js 16 (UI) → Vercel
│   ├── src/
│   │   ├── app/                  # App Router
│   │   │   ├── (app)/            # Route dynamique protégée [...slug] (proxy.ts gate)
│   │   │   ├── api/              # Routes API locales (go-auth proxy + PDFs server-side)
│   │   │   ├── login/ reset-password/ invitation/ inscription/ verify/
│   │   │   ├── b2b/verify/ souscrire-b2b/ souscrire-b2c/
│   │   │   ├── paiement/ (succes/erreur/retry/renouvellement)
│   │   │   ├── abonnement-expire/ offline/
│   │   ├── components/           # 34 dossiers métier + shadcn/ui (components/ui)
│   │   ├── stores/               # Zustand (auth-store, practice-session-store)
│   │   ├── hooks/                # Custom hooks (use-correction, use-surveillance-ws…)
│   │   ├── lib/                  # Utilitaires (pdf/, ai-providers/, __tests__/, …)
│   │   ├── types/                # Types TypeScript partagés
│   │   └── proxy.ts              # Auth gate Edge (access_token OU refresh_token)
│   ├── public/                   # Assets statiques (logo, manifest PWA, sw.js)
│   ├── e2e/                      # Tests Playwright (auth + facturation)
│   ├── docs/                     # Documentation frontend (design-system.md)
│   ├── vercel.json               # Rewrites /api/* → Render + headers sécurité
│   ├── next.config.ts            # serverExternalPackages, rewrites dev-only
│   ├── tsconfig.json             # TypeScript strict
│   ├── tailwind.config.ts
│   ├── playwright.config.ts
│   └── vitest.config.ts
│
├── backend/                      # Go 1.24 (API REST) → Render
│   ├── cmd/
│   │   ├── api/                  # Point d'entrée (main.go, ~413 lignes)
│   │   └── loadtest-submit/      # Outil de load testing (soumission massive)
│   ├── internal/
│   │   ├── ai/                   # LLM multi-providers (10) + failover
│   │   ├── cache/                # Cache RAM write-behind (SessionCache)
│   │   ├── config/               # Chargement variables d'environnement
│   │   ├── db/                   # pgxpool + RLS claims (SetClaimsTx, WithTx)
│   │   ├── domain/               # 16 fichiers entités métier + interfaces
│   │   ├── emailtpl/             # Templates d'emails transactionnels
│   │   ├── geniuspay/            # Intégration paiement Wave (CI)
│   │   ├── jwt/                  # JWT HMAC-SHA256 (access 15min + refresh 7j)
│   │   ├── mailer/               # ResendMailer > SMTPMailer > LogMailer
│   │   ├── middleware/           # Auth (cookie+Bearer), RequireRole, logging, CORS
│   │   ├── monitoring/           # Événements + healthcheck
│   │   ├── notification/         # Dispatcher (in-app + SSE + Push + Email)
│   │   ├── repository/           # Implémentations pgx (RLS automatique)
│   │   ├── storage/              # Client Cloudflare R2 (S3)
│   │   ├── transport/http/       # Routeur chi + handlers (40+ domaines, 222 routes)
│   │   ├── usecase/              # Logique métier (auth, CRUD, grading, messagerie…)
│   │   └── worker/               # 13 workers asynchrones
│   ├── db/                       # Couche données
│   │   ├── db/migrations/        # 103 migrations golang-migrate (000001→000103)
│   │   ├── db/reference/         # Schéma consolidé (schema.sql, pour sqlc)
│   │   ├── queries/              # Requêtes sqlc
│   │   ├── MIGRATIONS_RECONCILIATION.md
│   │   └── sqlc.yaml
│   ├── Dockerfile                # Multi-stage (golang:1.24-alpine → alpine:3.20)
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
| **Emails** | Resend (prioritaire) + SMTP (fallback) | Resend | `noreply@sect.ftci.fr` |
| **Paiement** | GeniusPay (Wave, Côte d'Ivoire) | GeniusPay | `geniuspay.ci` |
| **Anti-bot** | Cloudflare Turnstile | Cloudflare | widget Managed |
| **CI/CD** | GitHub → Vercel (auto) + Render (auto) | GitHub | `udevrard7/SECT` |

> Le frontend Vercel agit comme proxy : `frontend/vercel.json` réécrit `/api/:path*` vers le backend Render **au niveau CDN** (0 invocation middleware/Edge Function). Les routes `/api/certificats/{id}/pdf`, `/api/etudiants/{id}/releve-notes`, `/api/enseignant/fiche-notes-pdf`, `/api/factures/{id}/pdf` et `/api/epreuves/{id}/pdf` sont servies localement par Next.js (génération PDF côté serveur avec `@react-pdf/renderer`).

---

## Fonctionnalités détaillées

### 1. Gestion académique

- **Établissements** : CRUD complet, upload logo, watermark configurable, multi-établissements par responsable (B2B)
- **Filières** : CRUD + bulk update + export CSV, gestion des dépendances avant suppression
- **Niveaux d'étude** : L1, L2, L3, M1, M2, Doctorat (enum `NiveauEtude`, 6 valeurs)
- **Unités d'enseignement (UE)** : CRUD + affectation aux filières, suivi des dépendances
- **Enseignant↔Filière** : assignations multiples, delete composite
- **Années académiques** : création, clôture, **promotion** (passage étudiants N→N+1) avec preview, batch async, polling de statut, historique
- **Affectations** : enseignant↔filière/UE avec cycle de vie (statut `Affectation`)
- **Validations d'UE** : suivi des acquisitions par étudiant

### 2. Évaluations (cœur métier)

- **Épreuves** : CRUD complet avec state machine (`BROUILLON` → `PLANIFIEE` → `EN_COURS` → `CLOTUREE`), fenêtre d'ouverture (dateDebut/dateFin) distincte de la durée de passation, sessions spéciales (NORMALE/RATTRAPAGE/SPECIALE), épreuves orphelines (nettoyage), clôture auto
- **Questions** : 6 types via l'enum `TypeQuestion` — **QCU** (1 réponse), **QCM** (plusieurs), **QRC** (réponse courte), **CODE** (évaluation de code), + difficulté (`Difficulte` 4 niveaux), barème, thèmes
- **Génération IA** : création d'épreuves + questions par LLM (mode `ModeGeneration` : MANUEL ou IA), polling de statut de génération
- **Sessions de passation** : démarrage par l'étudiant, auto-save RAM (write-behind), flush au submit, photo d'identité (vérification), capture d'écran
- **Correction automatique** : 4 statuts IA (`StatutIASoumission`), auto-grading QCU/QCM, correction IA des QRC/CODE via LLM avec grille d'évaluation
- **Résultats** : overview global + par étudiant, stats par épreuve
- **Grilles d'évaluation** : critères personnalisables pour la correction IA
- **Documents** : upload R2 (PDF/DOCX), presigned URLs, analyse de contenu (extraction de texte via `unpdf`/`pdfjs-dist`/`mammoth`)

### 3. Surveillance anti-fraude (proctoring)

- **Fullscreen obligatoire** : sortie de plein écran détectée → pénalité configurable (`penaliteFullscreenExit`, défaut 5 points)
- **Capture d'écran périodique** : intervalle configurable (`intervalleCaptureEcran`, défaut 60s), stockée en DB + R2
- **Photo d'identité** : capturée au démarrage de la session, liste consultable par l'enseignant
- **Rapport de similarité** : détection de plagiat entre soumissions (worker `Similarity Worker`, toutes les 5 min, seuil `seuilSimilarite` défaut 0.85)
- **WebSocket temps réel** : hub `SurveillanceHub` pousse les événements (SESSION_STARTED, SESSION_SUBMITTED, ALERT_TRIGGERED, SESSION_UPDATED) aux enseignants surveillants — remplace le polling
- **SSE de secours** : endpoint `/api/surveillance/stream` pour les clients sans WebSocket
- **Flag manuel** : enseignant peut signaler une session suspecte
- **Rapport de fraude** : génération PDF par session
- **Lockout** : verrouillage de la soumission en cas de comportement critique

### 4. Exam-prep (module de révision) — **deep dive**

Le module exam-prep est une **plateforme de révision espacée** complète, accessible aux étudiants pour préparer leurs examens :

- **Répétition espacée SM-2** : algorithme SuperMemo-2 simplifié. Chaque `ReviewItem` a un `Interval` (jours), `EaseFactor` (difficulté), `NextReviewAt`, `Repetitions`. La qualité de réponse (0-5) est calculée depuis le score et la correction (`computeSM2Quality`). Le dashboard affiche les items dus aujourd'hui, maîtrisés, et le taux de maîtrise moyen.
- **Flashcards IA** : génération de cartes recto/verso depuis un passage sélectionné dans un document (highlight → flashcard via LLM). Appartenance dérivée via ReviewItem (pas de colonne userId sur Flashcard, astuce anti-migration).
- **Planning de révision** : `StudySession` planifiable (type `TypeSeance` : lecture / exercices / révision, statut PLANIFIEE/EN_COURS/TERMINEE), avec notes.
- **Pratique** : `PracticeAttempt` (score 0-1, correct, durée). Génération async de questions via worker `Practice Worker` (202 + `PracticeQueue`, polling). Soumission notée.
- **Banque collaborative** : `QuestionBank` — questions validées par la communauté, votes (+1/-1) avec contrainte UNIQUE(questionId, userId), tri par netVotes. Permet la mutualisation des questions d'entraînement.
- **Q&A RAG** : endpoint `/api/exam-prep/qa` — question synchrone répondue par LLM avec contexte du document (RAG sur les documents de révision).
- **Aide étudiant↔enseignant** : `HelpThread` + `HelpMessage` — l'étudiant ouvre un fil sur un document, l'enseignant répond. Statut OUVERT/CLOS. L'enseignant voit les fils de ses documents.
- **Audio TTS (podcasts de révision)** : génération de podcasts depuis un document via `Audio Generation Worker` + Voxtral/DashScope TTS. Endpoints de génération, liste, lecture, suppression. Capability `tts`/`audio` sur les providers IA.
- **Dashboard de progression** : score moyen, total attempts, taux de réussite, temps de révision, sessions à venir, stats SRS (items dus, maîtrisés, avg mastery), **lacunes par chapitre** (avgScore < 0.5).
- **Lecteur de documents** : `document-reader.tsx` avec rendu markdown, surlignage, navigation par chapitre.
- **8 onglets** : Progress, Flashcards, Planning, Practice, Q&A, Question Bank, Audio, Help.

### 5. Messagerie

- **Conversations** : 6 types via enum `ConversationType` (salon classe, salon promo, DM, IA privée, groupe, support)
- **Salons de classe/promo** : auto-créés selon la filière/niveau, participants gérés par RLS
- **DM étudiant↔enseignant** : création directe, modération
- **Messages** : envoi, édition, suppression (soft delete), marquage lu, mode silencieux (mute), nettoyage (clear)
- **Réactions** : toggle emoji sur les messages
- **Signalement** : 4 raisons (`SignalementRaison`), 4 statuts (`SignalementStatut`), résolution par modérateur
- **Temps réel** : SSE `/api/messagerie/stream` + présence (`/api/messagerie/presence`, heartbeat 45s)
- **IA privée** : conversation avec assistant IA (tutorat)
- **Pièces jointes** : 3 types via `MessageAttachmentType`

### 6. Modèle SaaS B2C + B2B

- **B2C — Prof Solo (gratuit)** : 1 enseignant, épreuves illimitées, pas d'établissement
- **B2C — Prof Premium (4 900 FCFA/mois)** : multi-filières, messagerie, exam-prep avancé, paiement Wave via GeniusPay
- **B2B — Institutionnel** : capitation 900 FCFA/étudiant/an, plancher 50 étudiants, multi-établissements, validation admin, essai 14 jours
- **Self-service** : inscription établissement sans intervention admin (migrations 000067→000074), création Etablissement + RESPONSABLE + abonnement `EN_ATTENTE_VALIDATION`, vérification email par token, validation admin → ESSAI 14j
- **Anti-abus** : 1 essai/nom d'établissement, 1 essai/téléphone, flag email non-pro (domaine gratuit détecté)
- **Abonnements** : 7 statuts (`StatutAbonnement`), résiliation, renouvellement, downgrade B2C→Solo
- **Facturation** : factures PDF avec TVA, 4 statuts, export CSV, annulation
- **Plans tarifaires** : 4 types (`TypePlan`), CRUD admin
- **Paiement** : GeniusPay (Wave, Côte d'Ivoire) — `create_payment`, `get_payment`, webhook HMAC-SHA256, retry, renouvellement, downgrade

### 7. Notifications

- **Dispatcher multi-canal** : in-app (DB persistée) + SSE temps réel + Web Push (VAPID) + Email (Resend/SMTP)
- **Préférences** : par utilisateur, `emailEnabled` toggle
- **Centre d'alertes** : 5 types (`TypeAlerte`), 3 severités (`SeverityAlerte`), marquage lu, marquer-tout-lu
- **Notifications admin** : canal dédié pour les validations B2B, monitoring
- **Web Push** : VAPID keys, subscribe/unsubscribe, push désactivé si non configuré (dev)

### 8. PDF institutionnels

6 générateurs `@react-pdf/renderer` (server-side, Vercel) :

- **Sujets d'épreuves** : multi-page, header/footer fixes, branding B2B (logo + nom + filière + niveau), watermark diagonal, barème récapitulatif, badge session, encouragement
- **Corrigés types** : réponses correctes + explications, même charte que les sujets
- **Feuilles de réponses** : grille QCM/QCU, bloc émargement, notice code
- **Certificats** : vérification publique par code, révocation, watermark
- **Relevés de notes** : par étudiant
- **Fiches de notes** : par enseignant
- **Factures** : TVA, ligne de détail, statut

### 9. Tableaux de bord par rôle

- **ADMIN** : monitoring global, healthcheck services, abonnements, facturation, AI providers, sécurité, IP whitelist, logs, corbeille, paramètres plateforme
- **RESPONSABLE** : établissement, filières, UE, enseignants, étudiants, années académiques, clôture/promotion, paramètres (dont sécurité), audit
- **ENSEIGNANT** : épreuves, sessions, corrections, messagerie, exam-prep (gestion), surveillance, aide étudiants, fiche de notes
- **ÉTUDIANT** : dashboard, exam-prep (révision), mes épreuves, mes devoirs, mes résultats, mes certificats, messagerie

### 10. Sécurité

- **Auth** : JWT HMAC-SHA256 natif Go (access 15min + refresh 7j avec rotation). Le proxy Edge laisse passer si access OU refresh présent (le client fait le refresh transparent).
- **Mots de passe** : bcrypt cost 10 (compatible hashes existants), force-change au 1er login
- **Lockout** : 5 tentatives → verrouillage 15min, unlock par admin
- **RLS Neon** : **173 policies** sur **67 tables activées**, claims de session (`SET LOCAL app.claims.*` via `SetClaimsTx`/`WithTx`). 84 fonctions `SECURITY DEFINER` (helpers RLS, invitations, validation B2B, agrégats stats, capitation).
- **Cookies httpOnly** : `access_token` + `refresh_token` (Secure + SameSite=Lax)
- **CORS** : `AllowCredentials: true`, headers `Cookie` + `Authorization`
- **IP réelle** : `GetClientIP()` lit `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP`
- **Anti-spoofing (audit 2025)** : un ETUDIANT/ENSEIGNANT ne peut cibler que son propre ID (query params ignorés, forcés à `claims.UserID`). Vérification d'ownership des sessions avant écriture cache (VULN-6).
- **RequireRole** : mutations sensibles (IP whitelist, security-settings) réservées ADMIN/+RESPONSABLE
- **Turnstile** : anti-bot sur endpoints publics (`/api/student-signup`, `/api/landing-demo`)
- **Aucun secret en clair** dans le code source (tous via env vars, `.env` gitignored)

### 11. Performance — pic de soumission

L'architecture est conçue pour absorber le pic de soumission de fin d'examen :

| Mécanisme | Fichier | Rôle |
|-----------|---------|------|
| `SubmitLimiter` (sémaphore) | `submit_limiter.go` | `SUBMIT_MAX_CONCURRENT=5` (défaut, Render free). Au-delà → `202 Accepted` + `Retry-After` |
| Jitter frontend 45s | `passation-page.tsx` | `NEXT_PUBLIC_SUBMIT_JITTER_MS=45000` — étale les submits sur 45s |
| Cache RAM write-behind | `cache/memory.go` | Auto-save en RAM (< 1ms), flush bulk toutes les 30s |
| `BatchFlushToNeon` | `session_handlers.go` | 1 transaction pour toutes les sessions dirty (vs 1 tx/session avant) |
| Ownership cache | `cache/memory.go` | Vérif DB au 1er save, puis skip (0 tx après) |
| Self-ping | `main.go` | Empêche Render free de s'endormir (toutes les 10 min) |
| Flush au submit | `session_handlers.go` | Réponses persistées **avant** le slot → safe même si `202` |
| Retry frontend | `passation-page.tsx` | 10 × 3s = 30s max, reste sous le timeout de session |
| Pool Neon | `db.go` | `DB_MAX_CONNS=100`, `MinConns=5`, `HealthCheckPeriod=30s`, prepared statements désactivés (pooler PgBouncer) |
| Gzip + debounce + SWR IndexedDB | frontend | Réduction de la charge réseau |

**Capacité mesurée** (test de charge réel contre Render prod, voir section Tests) :
- **Avec jitter 45s** : 0% de saturation jusqu'à 1000 étudiants, 0,2% à 2000 → capacité > 2000 (chemin fast), ~150-250 en vrai submit complet
- **Sans jitter (worst case)** : 0 crash jusqu'à 200 étudiants (max 16,8s < timeout 30s Render), mais UX dégradée

### 12. Workers asynchrones (13)

| Worker | Fichier | Fréquence | Rôle |
|--------|---------|-----------|------|
| IA Worker | `ia_worker.go` | on job | Génération d'épreuves/questions par LLM |
| Correction IA Worker | `correction_worker.go` | on job | Correction des QRC/CODE par LLM |
| Document Analyzer | `doc_analyzer_worker.go` | on job | Extraction texte PDF/DOCX, chapitrage |
| Practice Worker | `practice_worker.go` | on job | Génération de questions d'entraînement |
| Homework Correction | `homework_correction_worker.go` | on job | Correction des devoirs par IA |
| Audio Generation | `audio_worker.go` | on job | TTS podcasts de révision (Voxtral/DashScope) |
| AutoClose | `auto_close_worker.go` | 60s | Clôture auto des épreuves à fin de fenêtre |
| Relance | `relance_worker.go` | 6h | Relances email (essais expirants, factures impayées) |
| Expire | `expire_worker.go` | 1h | Expiration des abonnements, accès, invitations |
| Cleanup | `cleanup_worker.go` | 24h | Nettoyage des données obsolètes |
| Promotion | `promotion_worker.go` | 10s | Traitement des batchs de clôture d'année |
| Similarity | `similarity_worker.go` | 5min | Rapports de similarité (anti-plagiat) |
| Voxtral TTS | `voxtral_tts.go` | on job | Helper TTS Voxtral spécifique |

> Chaque worker récupère les jobs interrompus au démarrage (graceful recovery).

---

## API

Le backend expose **222 routes HTTP** réparties sur **40+ domaines** :

| Domaine | Routes | Méthodes | Description |
|---------|-------|----------|-------------|
| Health | 2 | GET | `/health`, `/api/health` |
| Auth | 6 | POST | login, refresh, logout, password-reset (+confirm), demo-request |
| Subscriptions B2C/B2B | 9 | POST/GET | création, paiement (initiate/confirm/status), renew, downgrade, verify-email |
| Webhooks | 1 | POST | GeniusPay webhook (HMAC) |
| Invitations | 2 | GET/POST | verify, accept |
| Student-signup | 2 | GET/POST | verify, accept (liens directs B2C/B2B) |
| Turnstile | 1 | GET | site-key public |
| Certificats verify | 1 | GET | verify public par code |
| Users | 9 | GET/POST/PATCH/DELETE | CRUD + import + orphans + reset-password + unlock + dependencies |
| Etablissements | 8+ | GET/POST/PATCH | CRUD + annee-courante + watermark + logo |
| Etablissement-access | 6 | GET/POST/PATCH/DELETE | demandes ADMIN + check + authorized |
| Filieres | 7 | GET/POST/PATCH/DELETE | CRUD + export CSV + dependencies + bulk |
| Unites-enseignement | 5 | GET/POST/PATCH/DELETE | CRUD + dependencies |
| Enseignant-filieres | 3 | GET/POST/DELETE | assignations + delete composite |
| Affectations | 5 | GET/POST/PATCH/DELETE | CRUD + dependencies |
| Annees-academiques | 4 | GET/POST | list + create + dependencies |
| Cloture-annee | 6 | GET/POST | run/preview/run-sync + status + batches |
| Invitations (admin) | 3 | GET/POST | list + create |
| Student-signup-links | 3 | GET/POST | list + create |
| Epreuves | 8 | GET/POST/PATCH/DELETE | CRUD + auto-close + orphelines + session-speciale + questions + status |
| Questions | 5 | GET/POST/PATCH/DELETE | CRUD + batch hard delete |
| Sessions | 11 | GET/POST/PUT/PATCH | list/start/save/save-bulk/get/submit/capture/captures/identity-photo/photos |
| Resultats | 3 | GET | list + overview + etudiant-overview |
| Messagerie | 22 | GET/POST/PATCH/DELETE | conversations (CRUD + IA/direct) + messages (CRUD + signaler + réactions + hide) + stream + presence + signalements |
| Documents | 5 | GET/POST | list + get + download + presign + analyze |
| Certificats | 5 | GET/POST/PATCH | CRUD + watermark-config + verify |
| Correction | 2 | GET/POST | sessions à corriger + retourner |
| Exam-prep | 22 | GET/POST/DELETE | dashboard + documents + review + flashcards + planning + practice + qa + question-bank + votes + audio + help |
| Stats | 4 | GET | enseignant + etudiant + admin + responsable |
| Badges | 2 | GET/POST | définitions + progression |
| Devoirs | 2 | GET | list + stats |
| Soumissions | 3 | POST/PATCH | presign-upload + create + update |
| Grilles-evaluation | 1 | GET | list |
| Alertes | 3 | GET/PATCH/POST | list + update + mark-all-read |
| Surveillance | 7 | GET/POST | list + stats + stream (SSE) + ws + flag + rapport-fraude + similarities |
| Corbeille | 3 | GET/POST/DELETE | list + restore + purge |
| Push | 3 | GET/POST/DELETE | vapid-public-key + subscribe + unsubscribe |
| Notifications | 8 | GET/PATCH | list + me + mark-read + unified + stream + preferences |
| Abonnements | 8 | GET/POST/PATCH/DELETE | list + pending-b2b + validate + CRUD + résilier + soft-delete |
| Factures | 5 | GET/POST/PATCH/DELETE | list + create + get + update + cancel |
| Plans | 3 | GET/POST/PATCH | list + create + update |
| Platform-settings | 2 | GET/POST | get + update |
| AI-providers | 6+ | GET/POST/PATCH | config + failover (status/config/health) |
| AI-assistant | 1 | POST | chat IA frontend |
| Monitoring | 5 | GET/POST/PATCH/DELETE | events + health + bulk + resolve + ignore (ADMIN) |
| Logs | 1 | GET | list (ADMIN) |
| IP-whitelist | 4 | GET/POST/PATCH/DELETE | list (auth) + mutations ADMIN |
| Security-settings | 3 | GET/PATCH | get + by-etablissement + update (ADMIN+RESP) |
| Enseignant | 3 | GET | context + etudiants + fiche-notes |
| Etudiants | 1 | GET | list (+ relevé PDF) |
| Validations-ue | 1 | GET | list |

> **Routes publiques (sans auth)** : `/health`, `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/password-reset`, `/api/auth/password-reset/confirm`, `/api/subscriptions/b2c`, `/api/subscriptions/b2b`, `/api/b2b/verify-email`, `/api/subscriptions/{id}/initiate-payment`, `/api/subscriptions/b2c/{id}/confirm-payment`, `/api/subscriptions/b2c/{id}/payment-status`, `/api/subscriptions/b2c/{id}/renew`, `/api/subscriptions/b2c/{id}/downgrade`, `/api/webhooks/geniuspay`, `/api/demo-request`, `/api/invitations/verify`, `/api/invitations/accept`, `/api/student-signup/verify`, `/api/student-signup`, `/api/turnstile/site-key`, `/api/certificats/verify/{code}`, `/api/landing-demo`. Toutes les autres exigent un cookie `access_token` httpOnly ou un header `Authorization: Bearer` valide.

---

## Base de données

Statistiques vérifiées sur la base Neon PostgreSQL de production (migration version 103) :

- **71 tables** + **1 vue** (schéma `public`, PascalCase)
- **30 types enum** (131 valeurs au total) :
  `Role` (4), `TypeQuestion` (6), `Difficulte` (4), `StatutAnalyse` (4), `ModeGeneration` (2), `StatutEpreuve` (5), `StatutSession` (7), `StatutAbonnement` (7), `TypePlan` (4), `NiveauEtude` (6), `TypeSeance` (3), `StatutAffectation` (3), `SeverityAlerte` (3), `TypeAlerte` (5), `StatutDevoir` (4), `StatutSoumission` (4), `SessionExamen` (5), `TypeSessionSpeciale` (3), `CategorieBadge` (7), `NiveauBadge` (4), `StatutValidation` (3), `TypeCertificat` (3), `StatutCertificat` (3), `StatutInscription` (7), `StatutIASoumission` (4), `ConversationType` (6), `MessageAttachmentType` (3), `SignalementRaison` (4), `SignalementStatut` (4), `PromotionBatchStatut` (4)
- **71 contraintes PRIMARY KEY** + **7 UNIQUE** + **130 FOREIGN KEY** + **553 CHECK**
- **250 index**
- **173 policies RLS** (Row Level Security) sur **67 tables activées**, claims de session posés via `SET LOCAL app.claims.*`
- **39 triggers** (essentiellement `updated_at` automatique)
- **86 fonctions** dont **84 `SECURITY DEFINER`** (helpers RLS, invitations, validation B2B, agrégats stats, capitation B2B, promotion…)
- **103 migrations** versionnées dans `backend/db/db/migrations/` (golang-migrate), numérotées `000001`→`000103`, toutes appliquées

```bash
# Appliquer les migrations
cd backend
make migrate-up DB_URL="$NEON_DIRECT_URL"
# ou directement :
migrate -path db/db/migrations -database "$NEON_DIRECT_URL" up
```

> ℹ️ Un audit des migrations (doublons historiques 000039/000040 et 000050, réconciliation `schema_migrations`) est documenté dans [`backend/db/MIGRATIONS_RECONCILIATION.md`](backend/db/MIGRATIONS_RECONCILIATION.md).
>
> 📋 Migrations récentes notables : `000055` (refonte B2B/B2C + capitation), `000059` (IA usage tracking), `000061` (GeniusPay Wave), `000067`→`000074` (self-service B2B/B2C, facturation, anti-abus, multi-établissements), `000075` (fix `validate_b2b_establishment`), `000099`→`000101` (session capture, similarity report, identity photo), `000102` (SecuritySettings RLS admin full access), `000103` (durée validité accès 24h). Voir `worklog.md` pour le détail des Task IDs `SECT-*`.

### Modèle de données (entités clés)

| Domaine | Tables principales |
|---------|-------------------|
| Auth/Users | `User`, `Invitation`, `PasswordReset`, `IpWhitelist`, `AuditLog` |
| Établissements | `Etablissement`, `EtablissementAccess`, `SecuritySettings`, `Filiere`, `UniteEnseignement`, `UniteEnseignementFiliere`, `EnseignantFiliere`, `AnneeAcademique`, `Affectation` |
| Évaluations | `Epreuve`, `EpreuveQuestion`, `EpreuveDocument`, `Question`, `SessionPassation`, `Reponse`, `Resultat`, `Soumission`, `GrilleEvaluation`, `ValidationUE`, `SessionSpeciale` |
| Documents | `Document`, `Chapter` |
| Exam-prep | `ReviewItem`, `Flashcard`, `StudySession`, `PracticeAttempt`, `HelpThread`, `HelpMessage` |
| Messagerie | `ChatThread`, `ChatMessage` (avec `ConversationType`, `SignalementRaison/Statut`, `MessageAttachmentType`) |
| Surveillance | Captures (dans `SessionPassation`), identity photos, similarity reports |
| SaaS | `Abonnement`, `Plan`, `Facture`, `PlatformSettings` |
| IA | `AIProviderConfig`, `AIFailoverEvent` |
| Notifications | `NotificationAdmin`, `PushSubscription` |
| Gamification | `BadgeDefinition`, `BadgeProgression` |
| Monitoring | `MonitoringEvent`, `Alerte`, `Devoir` |
| Certificats | `Certificat` |

---

## Tests & Qualité

### Tests de charge (production, mesurés ce jour)

Test de charge réel exécuté contre le backend Render en production via `cmd/loadtest-submit` (mode fake = JWT signés avec le JWT_SECRET prod, sessions fictives → 404 attendu après slot). 0 effet de bord sur la DB (aucun INSERT/UPDATE).

| Palier | N | Jitter | % en file (202) | Retries | p50 | p95 | Max | Crash/Timeout |
|--------|-----|--------|-----------------|---------|--------|--------|---------|---------------|
| 1 | 10 | 0 | 30% | 3 | 524ms | 3,4s | 3,4s | ✅ 0 |
| 2 | 50 | 0 | 62% | 59 | 3,7s | 9,8s | 13,0s | ✅ 0 |
| 3a | 100 | 0 | 74% | 139 | 3,8s | 13,0s | 13,4s | ✅ 0 |
| 3b | 100 | 45s | **0%** | 0 | 217ms | 236ms | 622ms | ✅ 0 |
| 4 | 200 | 45s | 0% | 0 | 210ms | 231ms | 643ms | ✅ 0 |
| 5 | 500 | 45s | 0% | 0 | 212ms | 234ms | 641ms | ✅ 0 |
| 6a | **1000** | 45s | **0%** | 0 | 218ms | 247ms | 667ms | ✅ 0 |
| 6b | 2000 | 45s | 0,2% | 5 | 213ms | 240ms | 3,4s | ✅ 0 |
| 7 | 200 | 0 | 91,5% | 428 | 7,0s | 13,6s | 16,8s | ✅ 0 |

**Verdict** : Le système **ne crash jamais** sur tous les paliers. Le `submitLimiter (202)` + jitter 45s protège efficacement le pic. Avec jitter, capacité > 1000 étudiants sans saturation. Sans jitter (worst case), tient jusqu'à 200 étudiants (max 16,8s, sous le timeout Render 30s) mais UX dégradée.

> ⚠️ Le test utilise le chemin "404" (session inexistante → réponse ~210ms). Un vrai submit effectue 8-12 queries DB (~1-3s/submit) → capacité réelle estimée ~150-250 étudiants simultanés avec jitter sur Render free.

### Configuration production vérifiée

| Variable | Valeur prod | Source |
|----------|-------------|--------|
| `SUBMIT_MAX_CONCURRENT` | 5 (défaut code) | non définie sur Render |
| `DB_MAX_CONNS` | 100 (défaut code) | non définie sur Render |
| `NEXT_PUBLIC_SUBMIT_JITTER_MS` | 45000 (défaut code) | non définie sur Vercel |
| `ENVIRONMENT` | production | Render |
| `CORS_ORIGINS` | `https://sect-app.vercel.app` | Render |

### Tests automatisés

- **Vitest** (frontend) : `routes.test.ts`, `permissions.test.ts` (couverture routing + RBAC)
- **Playwright E2E** (frontend) : `auth.setup.ts` + `facturation.spec.ts` (8 scénarios : accès/KPIs, filtres, tri, création, paiement, annulation, export CSV, dialogue détail)
- **Go** : `go vet ./...` + `go build ./cmd/api` obligatoires avant push backend (0 erreur)
- **TypeScript strict** : 0 erreur tolérée (`tsc --noEmit`)
- **ESLint** : Next.js + React + TypeScript rules — 0 erreur sur les fichiers modifiés

### Conventions

- **Conventional Commits** (en français) : `<SCOPE>-<TASK>: description` — exemples : `EPREUVES-DATES-FIX-V4:`, `feat:`, `fix:`
- **Une seule branche** : `main` (pas de dev/feature branches, déploiement continu auto)
- **Worklog obligatoire** : chaque tâche append une section dans `worklog.md` avec Task ID, Agent, Work Log, Stage Summary
- **Structure monorepo** : `frontend/` (Next.js → Vercel) + `backend/` (Go → Render), pas de code à la racine

---

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
bun run dev        # http://localhost:3000
```

### Backend (port 8080)

```bash
cd backend
go run ./cmd/api
# ou
make dev
```

### Variables d'environnement

Créer un fichier `.env` dans `backend/` (**jamais committé**, déjà dans `.gitignore`) :

```env
# Backend
PORT=8080
ENVIRONMENT=development
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_DIRECT_URL=postgresql://user:pass@host/db?sslmode=require  # pour les migrations
JWT_SECRET=votre-secret-jwt-32-caracteres-min
CORS_ORIGINS=http://localhost:3000,https://sect-app.vercel.app
APP_BASE_URL=http://localhost:3000

# Tuning performance (optionnel — défauts adaptés Render free)
# SUBMIT_MAX_CONCURRENT=5
# DB_MAX_CONNS=100
# DB_MIN_CONNS=5

# Cloudflare R2 (stockage documents — optionnel en dev)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=sect-documents
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com

# Resend (emails — optionnel, fallback LogMailer si vide)
RESEND_API_KEY=...
RESEND_FROM_EMAIL=SECT <noreply@votre-domaine.fr>

# GeniusPay (paiement Wave B2C — optionnel)
GENIUSPAY_API_KEY=...
GENIUSPAY_API_SECRET=...
GENIUSPAY_WEBHOOK_SECRET=...
GENIUSPAY_BASE_URL=https://api.geniuspay.ci

# Cloudflare Turnstile (anti-bot — optionnel, skip si vide)
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...

# Web Push VAPID (optionnel, push désactivé si vide)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@sect.app
```

```env
# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8080
# NEXT_PUBLIC_SUBMIT_JITTER_MS=45000  # optionnel, défaut 45000
```

> ⚠️ **Ne jamais committer de fichier `.env`.** Les secrets vont dans les dashboards Vercel / Render. Le `.gitignore` exclut `.env`, `.env.*`, `*.pem`, `*.key`.

### Build backend

```bash
cd backend
make build         # binaire bin/sect-api (27 MB)
make run           # build + run
make tidy          # go mod tidy
make sqlc-gen      # regénérer le code sqlc
```

### Outil de load testing

```bash
cd backend
# Test worst case : 100 étudiants simultanés, pas de jitter
go run ./cmd/loadtest-submit -n 100 -url http://localhost:8080 \
    -session test-session-id -secret $JWT_SECRET

# Test avec jitter 45s (simulation frontend)
go run ./cmd/loadtest-submit -n 1000 -url http://localhost:8080 \
    -session test-session-id -secret $JWT_SECRET -jitter 45000

# Test end-to-end contre Render prod (mode login)
go run ./cmd/loadtest-submit -n 200 -url https://sect-zead.onrender.com \
    -session <real-session-id> -secret $JWT_SECRET -mode login \
    -login-email-base etudiant -login-password Test1234!
```

---

## Évolutions récentes

Le journal complet des évolutions est dans [`worklog.md`](worklog.md). Points marquants :

- **`SECT-LOGIN-TIMEOUT-FIX-1`** — Fix erreur "serveur d'authentification met trop de temps" (cold start Render free) : warmup préventif au montage du login form, timeout backend 25s + maxDuration Vercel 30s, retry automatique au timeout, message pédagogique.
- **`EPREUVES-DATES-FIX` (V1→V4)** — Bug "impossible de modifier les dates d'une épreuve" (format datetime-local vs RFC3339). Fix : parser tolérant Go + conversion `toRFC3339()` front. Refonte UX dialog : presets, auto-calc, validation, layout responsive flex-col sm:flex-row.
- **`EPREUVES-PDF-V2` / `EPREUVES-PDF-V3`** — Refonte PDFs épreuves (sujet/corrigé/feuille-réponses) avec `@react-pdf/renderer` : multi-page, header/footer fixes, branding B2B, watermark, barème récapitulatif, bloc émargement, badge session.
- **`AI-PROVIDERS-MISTRAL` / `AI-PROVIDERS-MODELS-V2`** — Ajout Mistral + DashScope, DeepSeek, Cerebras. `AIProviderType` étendu à 10 providers. Failover automatique configurable.
- **`SECU-SYNC-FIX`** — Fix synchro Admin `/securite` ↔ Responsable `/parametres` (migration 000102, RLS ADMIN full access).
- **`DUREE-VALIDITE-24H`** — Formulaire accès établissements : durée max 24h (migration 000103).
- **`SECT-B2B-VALIDATE-FIX-1`** — Fix `SQLSTATE 42804` sur `validate_b2b_establishment()` (migration 000075).
- **`SECT-CAPACITY-V2` / `OPT-1`→`OPT-11`** — Optimisations pic de soumission : `202 async` + `submit_limiter` (5 slots), jitter 45s, WebSocket push, gzip, debounce saves, SWR IndexedDB, batch flush, ownership cache, self-ping.
- **`SECT-RENDER-DEPLOY-FIX-1`** — Cohérence `go.mod` (gorilla/websocket) pour déploiement Render.
- **Refonte "Savane EdTech"** — Identité visuelle `/facturation`, `/abonnements` avec palette DS unifiée, kente strip, GlassModal, animations Framer Motion.
- **B2B self-service** — Inscription établissements sans intervention admin (`000067`→`000074`) : création Etablissement + RESPONSABLE + abonnement `EN_ATTENTE_VALIDATION`, vérification email par token, validation admin → ESSAI 14j, anti-abus.
- **`DEVOPS-REPO-CLEANUP`** — Audit DevOps : nettoyage doublons et artefacts sandbox, `.gitignore` professionnel monorepo, structure propre `frontend/` + `backend/`.
- **`LOADTEST-PROD-1`** — Test de charge réel contre Render prod (7 paliers, N=10 à 2000) : 0 crash, capacité > 1000 étudiants avec jitter, validation config env prod.

---

## Licence

MIT — Voir le fichier [LICENSE](LICENSE).

## Auteurs

- **Ulrich EVRARD** — *Propriétaire* — [udevrard7](https://github.com/udevrard7) — ulrichdouh@gmail.com
