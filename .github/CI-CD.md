# SECT — CI/CD Pipeline : Du Code au Binaire

## 🔄 Le Pipeline

```
┌──────────────────────┐       ┌──────────────────────────┐       ┌──────────────────────┐
│  1. Votre PC         │       │ 2. GitHub Actions        │       │ 3. Binaires générés  │
│  Vous écrivez du     │──────►│ compile votre code       │──────►│  • app-release.apk   │
│  code source         │ Push  │ sur ses serveurs         │       │  • SECT.app/.ipa     │
│  (Kotlin / Swift)    │       │ Linux + macOS            │       └──────────┬───────────┘
└──────────────────────┘       └──────────────────────────┘                   │
                                                                              ▼
                                                                    4. Test visuel
                                                                    Appetize.io
```

## 📁 Workflows

| Fichier | Trigger | Ce qu'il fait |
|---------|---------|---------------|
| `backend-ci.yml` | push/PR sur `backend/**` | golangci-lint → go test → build binaire → vérif migrations (105 paires up/down) |
| `frontend-ci.yml` | push/PR sur `frontend/**` | bun lint → tests vitest → build Next.js 16 |
| `mobile-ci.yml` | push/PR sur `mobile/**` | Compile shared KMP → APK Android → .app iOS → deploy Appetize (main) |
| `mobile-release.yml` | tag `v*` | Build release signé → GitHub Release avec binaires |
| `build-desktop.yml` | push/PR sur `desktop/**` | Build Wails v2 3 OS (Windows/macOS/Linux) + packaging .deb/.rpm |
| `release-desktop.yml` | tag `desktop-v*` | Build + signing (optionnel) → GitHub Release + `latest.json` auto-update |
| `deploy-oci.yml` | push `main` sur `backend/**`·`deploy/oci/**` (+ dispatch) | Image Docker multi-arch → GHCR (digest) → SSH VM OCI → `docker compose up` + healthcheck (primaire — SECT-OCI-HYBRID-1) |
| `uptime-probe.yml` | cron `*/5` UTC (+ dispatch, push sur ses fichiers) | Sonde externe du CHEMIN PUBLIC (`sect.ftci.fr/api/health` via rewrite Vercel → suit le primaire courant) + keep-warm standby Render, alertes Discord 🔴/🟠/🟢 (SECT-UPTIME-PROBE-1, P1 ; cible élargie SECT-FAILOVER-1) |
| `failover.yml` | dispatch UNIQUEMENT + approval `production-failover` | Bascule urgence OCI → Render (runbook §3.7 exécutable) : gardes → commit trafic (Vercel redéploie seul) → OCI `compose stop` (best-effort) → `WORKERS_ENABLED=true` Render → vérifs + Discord (SECT-FAILOVER-1, P2) |
| `failback.yml` | dispatch UNIQUEMENT + approval `production-failover` | Retour à la normale Render → OCI (runbook §3.6 exécutable) : OCI standby API-only sain (GATE) → trafic → workers Render OFF → workers OCI ON → vérifs + Discord (SECT-FAILOVER-1, P2) |

### Normes appliquées (audit DevOps 2026-09)
- **Actions épinglées par SHA** (anti supply-chain) — mises à jour via Dependabot
- **`timeout-minutes`** sur tous les jobs (CI 10-30 min, builds OS 60-90 min)
- **`permissions: contents: read`** par défaut (jobs de release seulement : `write` ; sonde uptime : `actions: read` pour sa machine à états)
- **`concurrency` + `cancel-in-progress`** sur les CI (pas d'empilement de runs ; sonde uptime : file d'attente, jamais annulée — l'état compte)
- **Bascules de production (P2)** : `failover.yml`/`failback.yml` — dispatch manuel uniquement, `dry_run` par défaut, double confirmation (`BASCULER`/`REVENIR`), approbation d'environnement (`production-failover`), groupe `concurrency` partagé (jamais deux bascules simultanées) ; commit de bascule par `github-actions[bot]` (`contents: write` ponctuel) ; scripts `ops/failover_switch.sh` (bascule trafic par commit versionné) et `ops/render_workers.sh` (GET → PUT complet → deploy → live, règles d'or du runbook env vars)
- Outils épinglés : golangci-lint `v2.14.0` (config `backend/.golangci.yml`), Wails `v2.13.0`, nfpm `v2.47.0`, bun `1.3.14`

## 🤖 Comment ça marche concrètement

### Rien à compiler sur votre PC
Vous continuez d'écrire du code sous Windows dans VS Code. **Aucun SDK Android/Xcode requis localement.**

### Compilation dans le Cloud
Quand vous faites `git push`:

1. **GitHub Actions** lit vos fichiers `.github/workflows/*.yml`
2. Il crée des serveurs virtuels temporaires :
   - **Linux (ubuntu-latest)** → compile l'APK Android avec Gradle
   - **macOS (macos-14)** → compile l'app iOS avec Xcode (fourni par GitHub)
3. Chaque étape est visible dans l'onglet **Actions** de GitHub

### Artefacts générés
| Plateforme | Fichier | Serveur | Taille approx. |
|-----------|---------|---------|---------------|
| Android | `app-release.apk` | Linux | ~15-30 MB |
| iOS | `SECT.app` (simulator) | macOS | ~50-100 MB |
| iOS | `SECT.ipa` (device) | macOS | ~30-60 MB |

### Test sur Appetize.io
L'APK est automatiquement uploadé vers Appetize.io. Vous recevez un lien pour tester l'app **dans votre navigateur** sans téléphone.

## 🔑 Secrets GitHub à configurer

Allez dans **GitHub → Settings → Secrets and variables → Actions** :

### Requis (build Android)

| Secret | Description | Comment l'obtenir |
|--------|-------------|-------------------|
| `GOOGLE_SERVICES_JSON_B64` | Firebase Android config | `base64 -i google-services.json` |
| `ANDROID_KEYSTORE_B64` | Keystore release | `base64 -i sect-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Mot de passe keystore | Celui de `keystore.properties` |
| `ANDROID_KEY_ALIAS` | Alias de la clé signing | `sect-release` |
| `ANDROID_KEY_PASSWORD` | Mot de passe de la clé | Celui de `keystore.properties` |

### Requis (build iOS)

| Secret | Description | Comment l'obtenir |
|--------|-------------|-------------------|
| `GOOGLE_SERVICE_INFO_PLIST_B64` | Firebase iOS config | `base64 -i GoogleService-Info.plist` |
| `APPLE_CERT_B64` | Certificat Apple Developer (.p12) | `base64 -i certificate.p12` |
| `APPLE_CERT_PASSWORD` | Mot de passe du .p12 | Celui de Keychain Access |
| `APPLE_PROVISION_PROFILE_B64` | Provisioning profile | `base64 -i sect.mobileprovision` |
| `APPLE_PROVISION_UUID` | UUID du provisioning profile | Dans le fichier .mobileprovision |

### Optionnel

| Secret | Description |
|--------|-------------|
| `APPETIZE_API_TOKEN` | Token API Appetize.io pour test navigateur |

### Bascules de production (P2 — secret d'ENVIRONNEMENT, pas du dépôt)

**POSÉ le 2026-10-10 (SECT-FAILOVER-2) — rien à faire.** Emplacement
(pour une rotation future) : **Settings → Environments →
production-failover → Add environment secret** (approbateur : udevrard7 —
chaque exécution réelle de `failover.yml`/
`failback.yml` exige son approbation) :

| Secret | Description |
|--------|-------------|
| `RENDER_API_KEY` | Clé API Render (`rnd_…`) — pilote `WORKERS_ENABLED` + redeploy via `ops/render_workers.sh`, garde `ops/render_env_check.py` |

### Exploitation Vercel (POSÉS le 2026-10-10 — SECT-FAILOVER-2, aucun workflow ne les consomme)

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Clé API Vercel (`vcp_…`) — secours CLI/API (rollback, redéploiement, aliases) ; les bascules P2 passent par commit versionné (zéro token) |
| `VERCEL_ORG_ID` | Team Vercel — convention CLI |
| `VERCEL_PROJECT_ID` | Projet `sect-app` — convention CLI |

## 🚀 Lancer un Release

```bash
# 1. Taguer une version
git tag v1.0.0
git push origin v1.0.0

# 2. GitHub Actions compile automatiquement
# 3. Une GitHub Release est créée avec l'APK + IPA attachés
# 4. L'APK est uploadé sur Appetize.io pour test
```

## 📊 Monitoring

- **Onglet Actions** sur GitHub → voir les runs en temps réel
- Chaque run affiche : ✅ succès / ❌ échec / ⚠️ warnings
- Les artefacts sont téléchargeables pendant 30 jours (release) ou 7 jours (PR)

## 🔧 Dépannage

| Problème | Solution |
|----------|----------|
| `google-services.json is missing` | Vérifiez que `GOOGLE_SERVICES_JSON_B64` est configuré dans les secrets |
| Keystore not found | Vérifiez `ANDROID_KEYSTORE_B64` + `keystore.properties` |
| iOS build fails | Vérifiez certificat Apple + provisioning profile |
| `APK too large` | Activez R8/ProGuard (déjà configuré) + shrinkResources |
