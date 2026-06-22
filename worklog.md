# SECT — Worklog / Document de transition

Projet : **SECT — Système d'Évaluation Casse-Tête** (plateforme d'évaluation IA pour l'enseignement supérieur)
Dépôt GitHub : https://github.com/udevrard7/SECT
Production Vercel : https://sect-app.vercel.app
Base de données : Supabase (PostgreSQL)

---

## 1. État actuel du projet / Description

### Environnement de développement — OPÉRATIONNEL ✅

Le projet SECT a été cloné depuis GitHub et configuré dans le sandbox de développement. L'environnement est pleinement fonctionnel :

- **Code source** : dépôt GitHub `udevrard7/SECT` cloné à `/home/z/my-project` (branche `main`)
- **Identité Git** : `udevrard7 <ulrichdouh@gmail.com>` (config locale + globale) — tous les commits porteront cette identité
- **Remote Git** : `https://udevrard7@github.com/udevrard7/SECT.git` (authentifié par token) — tout `git push` déploie automatiquement sur Vercel
- **Variables d'environnement** : fichier `.env` créé avec les identifiants Supabase (PostgreSQL), NextAuth, cron secret. `.env` est ignoré par git (sécurité).
- **Dépendances** : 1040 packages installés via `bun install`
- **Prisma Client** : généré (v6.19.2)
- **Base Supabase** : connexion vérifiée — `prisma db push` confirme "The database is already in sync with the Prisma schema" (schéma déjà synchronisé)
- **Serveur dev** : Next.js 16.1.3 (Turbopack) démarré sur le port 3000, répond HTTP 200 sur `/` et `/login`

### Stack technique du projet
- **Frontend** : Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Shadcn/ui, Framer Motion, Zustand, TanStack Query
- **Backend** : Next.js API Routes, Prisma ORM, PostgreSQL (Supabase), bcryptjs, NextAuth.js
- **Outils** : Bun, Recharts, @dnd-kit, JSZip, react-pdf, @react-pdf/renderer, z-ai-web-dev-sdk (IA)
- **Mini-services** : `ai-proxy`, `ai-worker`, `closure-watcher` (dossiers présents dans `mini-services/`)

### Fonctionnalités principales (d'après le README)
- Multi-rôles : ADMIN, RESPONSABLE, ENSEIGNANT, ÉTUDIANT
- Gestion académique : filières, niveaux (L1→Doctorat), import CSV
- Évaluations : questions QCU/QCM/QRC/TRS, épreuves, sessions de passation, correction IA
- Documents : upload PDF/DOCX, extraction, génération de questions
- PaaS/SaaS : multi-établissements, abonnements, sécurité configurable
- Certificats : génération PDF (système récemment retravaillé d'après l'historique git)
- Surveillance, monitoring, alertes, rapports, coding exercises

### Routes API détectées (40+)
`abonnements, affectations, ai-providers, ai-proxy, alertes, annees-academiques, auth, badges, certificats, coding, corbeille, correction, db, devoirs, documents, enseignant, enseignant-filieres, epreuves, etablissement-access, etablissements, factures, filieres, grilles-evaluation, invitations, ip-whitelist, landing-demo, logs, migrate, monitoring, notifications, plans, platform-settings, questions, responsable, resultats, security-settings, seed, sessions, soumissions, stats, surveillance, unites-enseignement, users, validations-ue`

---

## 2. Objectifs actuels / Modifications effectuées / Résultats de vérification

### Objectif de cette session
Mettre en place l'environnement de travail pour poursuivre le développement du projet SECT en tant que tuteur/assistant, en s'appuyant exclusivement sur les projets existants (GitHub + Vercel + Supabase).

### Modifications effectuées
1. **Clonage du dépôt** : `git clone https://udevrard7:<token>@github.com/udevrard7/SECT.git`
2. **Migration vers la racine du sandbox** : déplacement de tous les fichiers SECT (y compris `.git`) vers `/home/z/my-project` pour compatibilité avec le tooling du sandbox (dev.log, port 3000). Le dépôt template du sandbox a été supprimé.
3. **Configuration Git** :
   - Identité locale ET globale : `udevrard7 <ulrichdouh@gmail.com>`
   - Remote `origin` pointe vers le dépôt GitHub de l'utilisateur (authentifié par token)
   - Branche courante : `main`
4. **Création du fichier `.env`** avec :
   - `DATABASE_URL` (pooler Supabase PgBouncer, port 6543)
   - `DIRECT_URL` (connexion directe Supabase, port 5432 — pour migrations)
   - `DATABASE_URL_PG` (override forçant PostgreSQL dans `lib/db.ts`)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://sect-app.vercel.app`
   - `CRON_SECRET`
   - **Note** : les identifiants fournis contenaient 2 coquilles (espace avant `@` et `:` manquant dans DIRECT_URL) — corrigées. Mot de passe `Victoire@1993#` URL-encodé en `Victoire%401993%23`.
5. **Installation des dépendances** : `bun install` (1040 packages, ~6.4s)
6. **Génération Prisma** : `bun run db:generate` ✓
7. **Synchronisation base de données** : `bun run db:push` → "already in sync" ✓
8. **Démarrage serveur dev** : Next.js 16.1.3 (Turbopack) sur port 3000

### Résultats de vérification (par curl, sans agent-browser)
- `GET /` → **HTTP 200** (29 005 octets, 48 ms)
- `GET /login` → **HTTP 200** (29 945 octets, 1.98 s)
- Compilation Turbopack opérationnelle
- `.env` chargé correctement par Next.js
- Connexion PostgreSQL Supabase fonctionnelle

### Workflow établi pour le développement futur
Pour chaque modification du code :
```bash
# 1. Effectuer les modifications dans /home/z/my-project
# 2. Synchroniser la base si le schéma Prisma a changé
bun run db:push          # pousse le schéma vers Supabase

# 3. Committer avec la bonne identité (déjà configurée)
git add -A
git commit -m "description de la modification"

# 4. Pousser vers GitHub → déclenchement automatique du déploiement Vercel
git push origin main
```

**Toute modification poussée sur `main` déploie automatiquement sur Vercel** (GitHub ↔ Vercel connectés). L'identité des commits est `udevrard7 <ulrichdouh@gmail.com>`.

---

## 3. Problèmes non résolus / Risques / Priorités suivantes

### Avertissement technique (non bloquant)
- **Next.js 16 déprécie `middleware`** au profit de `proxy`. Le projet contient un `middleware.ts` (probablement `src/middleware.ts` ou `src/proxy.ts`). À migrer ultérieurement vers la convention `proxy.ts` pour éviter l'avertissement. (Priorité basse — non bloquant)

### Variables d'environnement IA non configurées
- Les variables `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_TOKEN`, `ZAI_CHAT_ID`, `ZAI_USER_ID` ne sont **pas encore définies** dans `.env`. Les fonctionnalités IA (génération de questions, correction IA) peuvent échouer tant qu'elles ne sont pas renseignées. Le `z-ai-web-dev-sdk` est installé. (Priorité moyenne — à configurer quand l'utilisateur fournira les clés)

### Priorités recommandées pour la prochaine phase
1. **Exploration fonctionnelle** : parcourir les pages clés (`/login`, dashboards par rôle, création d'épreuve, passation, certificats) pour identifier les éventuels bugs runtime.
2. **Migration `middleware` → `proxy`** (Next.js 16) pour supprimer l'avertissement.
3. **Configuration des clés IA** (z-ai-web-dev-sdk) si l'utilisateur souhaite activer la génération/correction IA.
4. **Mini-services** : vérifier que `closure-watcher` (fermeture auto des sessions d'épreuves) et `ai-proxy` sont démarrés en production (Vercel) — en dev local ils ne tournent pas automatiquement.
5. **Tests de bout en bout** des flux critiques : connexion multi-rôles → création d'épreuve → passation étudiant → correction → certificat.

### Notes de connexion
- **GitHub** : token PAT intégré dans l'URL du remote (persistance de l'auth).
- **Supabase** : pooler PgBouncer (port 6543) pour le runtime, connexion directe (port 5432) pour les migrations.
- **Vercel** : déploiement automatique depuis `main` ; token `vcp_...` disponible si déploiement CLI nécessaire.

---

## Historique des sessions

### Session 1 — Configuration environnement (tuteur Z.ai)
- **Task ID** : setup
- **Agent** : Z.ai (tuteur principal)
- Clonage, migration, configuration Git/.env/dépendances, sync DB, démarrage serveur dev.
- Résultat : environnement 100% opérationnel, serveur dev répond HTTP 200.
