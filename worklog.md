# SECT — Worklog / Document de transition

Projet : **SECT — Système d'Évaluation Casse-Tête** (plateforme d'évaluation IA pour l'enseignement supérieur)
Dépôt GitHub : https://github.com/udevrard7/SECT
Production Vercel : https://sect-app.vercel.app
Backend Render : https://sect-zead.onrender.com
Base de données : Neon PostgreSQL (eu-central-1)

---

## Session du 2026-07-21 — PROCTORING-FIX: 6 corrections Surveillance & Détection

### Task IDs: PROCTORING-FIX-1 à PROCTORING-FIX-6

**Commit**: `32f7e3a` — poussé vers GitHub → déploiement auto Vercel + Render

#### PROCTORING-FIX-1: `proctoringActif` — Master switch (HIGH)
- **Avant** : Toggle décoratif, aucune effet sur les détections
- **Après** : Toutes les détections anti-fraude nécessitent `proctoringActif=true`
- Exception : détection fullscreen reste active même sans proctoring (exigence de base)

#### PROCTORING-FIX-2: `nbOngletsMax` — Compteur dédié (HIGH)
- Compteur `tabSwitchCount` séparé, comparé à `nbOngletsMax`
- Auto-submit si seuil dépassé et `autoSubmitOnViolation=true`

#### PROCTORING-FIX-3: `captureEcran` — Stockage R2 (MEDIUM)
- Upload vers R2 + metadata en table `SessionCapture` (migration 000099)
- API `GET /api/sessions/{id}/captures` avec URLs présignées
- Frontend : CapturesViewer dans surveillance dashboard

#### PROCTORING-FIX-4: `rapportFraude` — Rapport de fraude (MEDIUM)
- API `GET /api/surveillance/{sessionId}/rapport-fraude`
- FraudReportDialog avec jauge de risque SVG + timeline événements
- Post-exam : notification étudiant si rapport généré

#### PROCTORING-FIX-5: `seuilSimilarite` — Détection similarité (LOW)
- Table `SimilarityReport` (migration 000100) + worker `similarity_worker.go`
- Trigram Jaccard (QRC/TRS), exact match (QCU/QCM), token Jaccard (CODE)
- Frontend : onglet "Similarité copies" avec matrice

#### PROCTORING-FIX-6: `verificationIdentite` — Webcam photo (LOW)
- Table `IdentityPhoto` (migration 101) + component WebcamCapture
- Photo obligatoire avant examen + photos périodiques mid-exam
- Surveillance : section Identité avec vérification enseignant

### Score final : ✅ 18/18 options fonctionnelles (vs 11/18 avant)

---

## Session du 2026-07-22 — FIX-SIM-ETAB: Bug Epreuve.etablissementId inexistant

### Task ID: FIX-SIM-ETAB

**Commit**: `cadb124` — poussé vers GitHub → déploiement auto Vercel + Render

### Bug identifié :
Le backend démarrait avec l'erreur :
```
ERROR: column e.etablissementId does not exist (SQLSTATE 42703)
```
dans le Similarity Worker. Deux fichiers référencaient `e."etablissementId"` sur la table `Epreuve`, mais cette colonne n'existe pas. L'établissement est accessible uniquement via `Filiere.etablissementId` (Epreuve → Filiere → Etablissement).

### Corrections :
1. **similarity_worker.go** (ligne 104-120) : `LEFT JOIN + COALESCE(f.etablissementId, e.etablissementId)` → `JOIN Filiere + f.etablissementId` uniquement. Ajout de `f.etablissementId IS NOT NULL` pour exclure les épreuves sans filière.

2. **downgrade_email.go** (ligne 61) : `SELECT count(*) FROM "Epreuve" WHERE "etablissementId" = $1` → `JOIN "Filiere" f ON f."id" = e."filiereId" WHERE f."etablissementId" = $1`.

### Résultat :
- Similarity Worker fonctionne correctement — trouvé 5 épreuves qualifiées (vs crash avant)
- Backend démarré sans erreur sur Neon DB
- Agent Browser : page d'accueil et login fonctionnelles

### Environnement restauré (session continuée) :
- Go 1.24.1 réinstallé dans `/home/z/go-sdk/go/`
- Backend daemonizé via `start-stop-daemon` (PID persistant)
- Frontend daemonizé via `start-stop-daemon` (PID persistant)
- Neon DB migration version : 101 (toutes les nouvelles tables créées)

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
