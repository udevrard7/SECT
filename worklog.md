# SECT — Worklog / Document de transition

Projet : **SECT — Système d'Évaluation Casse-Tête** (plateforme d'évaluation IA pour l'enseignement supérieur)
Dépôt GitHub : https://github.com/udevrard7/SECT
Production Vercel : https://sect-app.vercel.app
Backend Render : https://sect-zead.onrender.com
Base de données : Neon PostgreSQL (eu-central-1)

---

## Session du 2026-07-21 — Mise en place environnement de développement

### Task ID: SECT-ENV-SETUP-1

**Agent**: Main (tuteur/assistant)
**Tâche**: Clonage du dépôt, installation Go, configuration environnement local, vérification end-to-end

### Work Log:
- Clonage du dépôt GitHub `udevrard7/SECT` vers `/home/z/SECT`
- Installation de Go 1.24.1 dans `~/go-sdk/go` (ajout au PATH dans `.bashrc`)
- Téléchargement des dépendances Go (`go mod download`) — succès
- Build test du backend Go (`go build ./cmd/api`) — succès, compilation sans erreur
- Installation de `golang-migrate` CLI (`go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`)
- Vérification de la version de migration Neon : **version 98** (98 migrations, toutes appliquées)
- Création du fichier `/home/z/SECT/backend/.env` avec les variables Neon, JWT, CORS, etc.
- Création du fichier `/home/z/my-project/.env.local` avec `NEXT_PUBLIC_API_URL=http://localhost:8080`
- Copie du frontend SECT vers `/home/z/my-project` (le sandbox attend le projet Next.js ici)
- Installation des dépendances frontend (`bun install`) — 285 packages
- Démarrage du frontend Next.js 16.1.3 sur le port 3000 — succès
- Démarrage du backend Go sur le port 8080 — succès, connexion Neon vérifiée
- Test du proxy API : `curl http://localhost:3000/api/health` → `{"service":"sect-api","status":"ok","version":"0.2.0"}`
- Vérification Agent Browser : page d'accueil SECT affichée correctement, page de connexion fonctionnelle
- Configuration Git : `user.name=udevrard7`, `user.email=ulrichdouh@gmail.com`

### Stage Summary:
- **Environnement local opérationnel** : Frontend (port 3000) + Backend Go (port 8080) + Neon DB
- **Architecture respectée** : Frontend Next.js proxy vers Backend Go, identique à la production (Vercel → Render)
- **Migration DB** : Version 98/98, base synchronisée
- **Go 1.24.1** installé et fonctionnel, backend compile sans erreur
- **Proxy API** : Le rewrite `next.config.ts` redirige `/api/*` vers `localhost:8080` en dev

### Architecture locale vs production:
| Composant | Local | Production |
|-----------|-------|------------|
| Frontend | Next.js dev (localhost:3000) | Vercel (sect-app.vercel.app) |
| Backend | Go API (localhost:8080) | Render Docker (sect-zead.onrender.com) |
| Database | Neon PostgreSQL (même base) | Neon PostgreSQL |
| API Proxy | next.config.ts rewrites | vercel.json rewrites (CDN) |
| Storage | R2 désactivé (mode DB-only) | Cloudflare R2 |

### Workflow de développement établi:
1. **Frontend** : Modifier les fichiers dans `/home/z/my-project/src/`
2. **Backend** : Modifier les fichiers dans `/home/z/SECT/backend/`
3. **Synchronisation GitHub** :
   - Frontend : copier les modifications de `/home/z/my-project/` vers `/home/z/SECT/frontend/`
   - Backend : directement dans `/home/z/SECT/backend/`
   - Push depuis `/home/z/SECT/` avec l'identité `udevrard7 <ulrichdouh@gmail.com>`
4. **Migrations DB** : `cd /home/z/SECT/backend && migrate -path db/db/migrations -database "$NEON_DIRECT_URL" up`
5. **Déploiement automatique** : GitHub → Vercel (frontend) + Render (backend)

### Services non configurés en dev local (optionnels):
- Cloudflare R2 (stockage fichiers) — mode DB-only
- Resend/SMTP (emails) — LogMailer (emails journalisés dans la console)
- GeniusPay (paiement Wave) — endpoints retourneront 503
- Cloudflare Turnstile (captcha) — vérification désactivée
- Web Push VAPID — notifications push désactivées
