# Runbook — Migration backend vers OCI Marseille (architecture hybride)

**Task ID : SECT-OCI-HYBRID-1** · État : kit livré, bascule en attente d'accès VM

> **⚠️ Conventions VM OBLIGATOIRES** : toute intervention sur la VM Ftechci
> (installation, mise à jour, rollback, recréation de conteneur, édition du
> Caddyfile) est soumise au kit de l'exploitant :
> [`HANDOFF-INSTALL-BACKEND.md`](./HANDOFF-INSTALL-BACKEND.md) — publication
> 127.0.0.1 uniquement, env-file `/etc/<app>/<service>.env` 600 root, limites
> cgroups, **poweroff invité INTERDIT** (leçon N°282), audit de conformité
> sect-api et plan d'alignement en Annexe A dudit kit (SECT-VM-CONVENTIONS-1).

## 1. Architecture cible

```
                [ Clients / sect.ftci.fr (Vercel) ]
                              │  (fetch /api → api.sect.ftci.fr)
                     [ Cloudflare DNS ftci.fr ]
                              │
              ┌───────────────▼────────────────┐
              │  VM OCI Marseille (PRIMAIRE)   │
              │  Ampere A1 · 4 vCPU · 24 Go    │
              │  Docker Compose : api + caddy  │
              │  WORKERS_ENABLED=true (13 wk)  │
              └───────────────┬────────────────┘
                              │
                [ Neon Frankfurt (eu-central-1) ]
                              ▲
              ┌───────────────┴────────────────┐
              │  Render (STANDBY chaud)       │
              │  WORKERS_ENABLED=false        │
              │  0 trafic — bascule DNS < 5 min│
              └────────────────────────────────┘
```

**Pourquoi ce choix** (vs actif-actif load-balancé) :
- Les 13 workers de fond n'ont **aucun verrou advisory** → en actif-actif,
  alertes Discord doublées, clôtures/corrections IA traitées deux fois.
- La VM Always Free ne s'endort pas → fin des cold starts Render (~50 s).
- Le standby Render = plan de rollback immédiat (bascule DNS).
- Marseille ↔ Neon Frankfurt ≈ 10-15 ms ; Abidjan ↔ Marseille ≈ 100-150 ms.

## 2. Ce qui a été livré dans le repo

| Artefact | Rôle |
|---|---|
| `backend/internal/config/config.go` | Flag `WORKERS_ENABLED` (défaut `true` — Render inchangé tant qu'on ne le pose pas) |
| `backend/cmd/api/main.go` | Garde `if cfg.WorkersEnabled` autour des 13 workers + config alerting hissée (l'UI /monitoring reste honnête en standby) |
| `backend/internal/monitoring/registry.go` | `WorkerStatus.Disabled/DisabledReason` + `SetAllDisabled()` |
| `backend/internal/transport/http/router.go` | `Server.workersEnabled` + `WithWorkersEnabled()` (défaut true) |
| `backend/internal/transport/http/monitoring_overview_handlers.go` | `workersEnabled` exposé dans `/api/monitoring/overview` |
| `frontend/src/components/admin/monitoring/types.ts` + `system-tab.tsx` | Bandeau « Instance standby » + badge `Standby` par worker (honnêteté UI) |
| `backend/Dockerfile` | Multi-arch : `ARG TARGETARCH` — Render (amd64) inchangé, `buildx --platform linux/arm64` pour l'A1 |
| `deploy/oci/docker-compose.yml` | **API-only** (§D.3 corrigé) : publie `127.0.0.1:8090` uniquement — le caddy SYSTÈME de la VM (mikcloud) détient 80/443 ; healthcheck, limits 3.5 CPU/20 Go, logs rotés |
| `deploy/oci/caddy-vhost.conf` | Vhost `api.sect.ftci.fr` → `127.0.0.1:8090` à AJOUTER au Caddy système : `flush_interval -1` (SSE/WebSocket), HSTS, max body 100 Mo |
| `deploy/oci/.env.example` | Inventaire complet aligné sur render.yaml — secrets à COPIER depuis Render (jamais retaper) |
| `.github/workflows/deploy-oci.yml` | build multi-arch → GHCR → SSH deploy (porte `gate` : skip propre tant que les secrets SSH sont absents) |

## 3. Procédure de mise en service (à exécuter avec accès VM)

### 3.1 Sonde (déjà prête côté API — clé fournie tronquée, voir §6)

Re-réalimenter `/home/z/oci/config` avec la clé privée COMPLÈTE (BEGIN→END),
puis le SDK OCI liste : instances (shape/état/IP), VCN/subnets/security lists
(ouvrir 80/443 — et 22 restreint), boot volume, plugins Oracle Cloud Agent.

### 3.2 Préparer la VM (SSH)

⚠️ **La VM n'est PAS vierge** (découvert SECT-OCI-DEPLOY-2A/3) : elle héberge
la prod **mikcloud** — caddy SYSTÈME (api.mikcloud.ftci.fr → 127.0.0.1:4000,
détient 80/443), postgresql@18-main (127.0.0.1:5432), mikcloud.service.
Le compose SECT est **API-only** sur `127.0.0.1:8090` — on ne lance JAMAIS
de conteneur caddy ici, ni ne touche au Caddyfile existant autrement qu'en
lui AJOUTANT le vhost §3.4.

```bash
sudo mkdir -p /opt/sect && sudo chown $USER /opt/sect && cd /opt/sect
# Docker — paquets Ubuntu (la VM est en 26.04 ; get.docker.com peut ne pas
# encore supporter cette distribution). buildx requis pour tout build local.
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 docker-buildx
# Login GHCR — l'image est PRIVÉE (défaut GHCR pour les packages poussés
# via GITHUB_TOKEN). PAT scope read:packages :
# https://github.com/settings/tokens → cocher read:packages uniquement.
echo "$GHCR_PAT" | sudo docker login ghcr.io -u udevrard7 --password-stdin
# Fichiers du repo (une seule fois)
git clone --depth 1 https://github.com/udevrard7/SECT.git /tmp/sect
cp /tmp/sect/deploy/oci/{docker-compose.yml,caddy-vhost.conf} /opt/sect/
cp /tmp/sect/deploy/oci/.env.example /opt/sect/.env && chmod 600 /opt/sect/.env
```

**Fallback urgence** (image GHCR indisponible/cassée) — build natif ARM64 sur
la VM (~40 s) : `git clone --depth 1 <repo> /tmp/sect-src && sudo env
DOCKER_BUILDKIT=1 docker build --build-arg TARGETOS=linux --build-arg
TARGETARCH=arm64 --build-arg BUILDPLATFORM=linux/arm64 -t sect-api:local
/tmp/sect-src/backend/` puis `API_IMAGE=sect-api:local` dans `.env` (c'est ce
qui a servi le 09/10 pendant que le build CI était cassé — cf worklog
SECT-OCI-DEPLOY-3).

### 3.3 Remplir `/opt/sect/.env` — RÈGLE D'OR

Les valeurs se **relisent depuis Render** (jamais retaper un secret — cf.
`docs/ops/render-env-vars-runbook.md`) :

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d9ed5bdaeets73auosj0/env-vars" \
  | python3 -c 'import json,sys; [print(e["envVar"]["key"], "=", e["envVar"]["value"]) for e in json.load(sys.stdin)]'
```

Spécificités VM (déjà pré-remplies dans `.env.example`) :
- `WORKERS_ENABLED=false` au **bring-up** (Render reste primaire — jamais
  d'actif-actif) ; basculé à `true` au cutover §3.6
- `DB_MAX_CONNS=60` (deux backends partagent le pooler Neon)
- `NEON_DATABASE_URL` : garder le rôle **sect_app** (least-privilege) —
  PAS le DSN owner BYPASSRLS
- `JWT_SECRET` : IDENTIQUE à Render (tokens interchangeables, zéro disruption)

### 3.4 Vhost Caddy + DNS + premier démarrage

1. Ajouter le vhost au Caddy SYSTÈME (mikcloud reste maître du 80/443) :
   ```bash
   cat /opt/sect/caddy-vhost.conf | sudo tee -a /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
   (Tant que le DNS n'existe pas, Caddy réessaie l'ACME en arrière-plan et
   mikcloud continue de servir normalement.)
2. `cd /opt/sect && docker compose up -d` → l'API écoute sur 127.0.0.1:8090
   (`WORKERS_ENABLED=false` : mode standby API-only, aucun doublon).
3. `curl -s http://127.0.0.1:8090/health` → `{"status":"ok"}`.
4. Créer `api.sect.ftci.fr` → IP publique OCI 84.235.228.160 (A record,
   Cloudflare DNS-only le temps de l'émission Let's Encrypt, puis proxy on).
5. `curl https://api.sect.ftci.fr/health` → `{"status":"ok"}`.

### 3.5 CI/CD — secrets GitHub

`Settings → Secrets and variables → Actions` :
- `OCI_SSH_HOST` = IP publique VM
- `OCI_SSH_USER` = utilisateur SSH (ubuntu/opc)
- `OCI_SSH_KEY` = clé privée OpenSSH

Le workflow `deploy-oci.yml` passe alors de « build only » à « build+deploy ».
Chaque push `backend/**` redéploie par digest immuable + healthcheck + smoke test.

### 3.6 Bascule contrôlée (cutover)

> **Version exécutable (P2, SECT-FAILOVER-1)** : le workflow « Retour à la
> normale Render → OCI » (`.github/workflows/failback.yml`) automatise cette
> procédure (gardes de santé, ordre strict, vérifications, alertes Discord)
> sous approbation manuelle (environnement GitHub `production-failover`).
> La procédure ci-dessous reste la référence manuelle (dashboard).

Ordre STRICT — jamais deux instances à workers actifs (doublons Discord/
corrections IA), jamais zéro API en ligne :

1. E2E sur OCI (API-only, workers standby) : rejouer `sect-audit/verify_dash_alertes_live.py`
   avec `BASE_URL=https://api.sect.ftci.fr` (login, alertes, focus API).
2. Basculer le trafic : record DNS `api.sect.ftci.fr` → 84.235.228.160 (s'il
   n'existe pas déjà) + variable Vercel `NEXT_PUBLIC_API_URL` →
   `https://api.sect.ftci.fr` + redeploy Vercel. Render sert toujours ses
   workers — c'est OK, les deux instances ne font AUCUN double traitement
   tant que les workers ne tournent que sur Render.
3. **Passer Render en standby** : env var `WORKERS_ENABLED=false` sur Render
   + redeploy (les 13 workers s'arrêtent là-bas).
4. **Activer les workers sur OCI** : `/opt/sect/.env` → `WORKERS_ENABLED=true`
   puis `cd /opt/sect && docker compose up -d` (les 13 workers démarrent ICI).
5. Vérifier /monitoring DES DEUX côtés : côté OCI → 13 workers actifs ;
   côté Render → bandeau « Instance standby » + 13 badges `Standby`
   (c'est la preuve que la garde fonctionne).

### 3.7 Bascule urgence OCI → Render

**Voie normale (P2)** — workflow « Bascule OCI → Render (failover) »
(`.github/workflows/failover.yml`) :

1. Onglet Actions → « Bascule OCI → Render (failover) » → Run workflow :
   saisir le motif, laisser `dry_run` coché → pré-vol (standby Render sain,
   SSH OCI informatif, prévisualisation du commit de bascule).
2. Relancer avec `confirmer = BASCULER` → **approbation requise**
   (environnement `production-failover`, approbateur udevrard7) → le
   workflow exécute : garde Render → commit trafic (vercel.json + 12
   routes, Vercel redéploie seul — preuve `x-render-origin-server: Render`)
   → `docker compose stop` sur OCI (**toléré si la VM est morte** — scénario
   nominal) → `WORKERS_ENABLED=true` sur Render (GET→PUT complet→deploy,
   règles d'or env vars) → vérifications + Discord.
   Ordre interne : arrêt OCI AVANT activation Render (garde §4) — jamais
   d'actif-actif, jamais de trafic vers une instance morte.
   Prérequis unique : secret d'environnement `RENDER_API_KEY` (cf
   `.github/CI-CD.md`).
3. Une fois la VM réparée : workflow « Retour à la normale Render → OCI »
   (`failback.yml`) — §3.6 automatisée.

**Voie manuelle** (GitHub indisponible, ou secret absent) :

1. Trafic → Render : variable Vercel `API_BASE_URL` →
   `https://sect-zead.onrender.com` + redeploy **ET** bascule du rewrite
   `vercel.json` (revert du dernier commit `ops(failover):` — le rewrite
   CDN ne se pilote PAS par variable d'environnement).
2. Render : `WORKERS_ENABLED=true` + redeploy (il redevient primaire).
3. OCI : `docker compose stop` (éviter les doublons workers).

## 4. Gardes permanentes

- **Détection externe (SECT-UPTIME-PROBE-1, P1)** : le workflow
  `.github/workflows/uptime-probe.yml` (cron */5) sonde le **chemin
  public** `https://sect.ftci.fr/api/health` (via le rewrite Vercel → il
  suit automatiquement le primaire courant, OCI ou Render — l'URL directe
  OCI resterait morte après une bascule, faux 🔴 éternels) DEPUIS GitHub
  Actions : il survit à une panne de la VM (le worker alerting SECT, lui,
  meurt avec elle) et prévient le canal Discord principal (secret
  `UPTIME_DISCORD_WEBHOOK_URL`). Alertes 🔴 immédiate / 🟠 rappel ~30 min /
  🟢 rétablissement ; l'onglet Actions du workflow = historique de
  disponibilité (run rouge = DOWN). Le standby Render est sondé au passage
  → **reste chaud** (pas de cold start de ~50 s au moment d'une bascule §3.7).
- **Bascule/retour semi-automatiques (SECT-FAILOVER-1, P2)** : les
  workflows `failover.yml` (OCI → Render, §3.7) et `failback.yml` (Render
  → OCI, §3.6) exécutent la procédure sous **approbation manuelle**
  (environnement GitHub `production-failover`, approbateur udevrard7),
  avec gardes de santé (standby sain avant d'écrire, VM saine avant d'y
  rebasculer), ordre anti-actif-actif strict (arrêt AVANT activation),
  commit de bascule versionné (vercel.json + 12 routes — preuve par
  en-têtes `x-render-origin-server`/`via: 1.1 Caddy`) et alertes Discord.
  Secret requis : `RENDER_API_KEY` (environnement, cf `.github/CI-CD.md`).
  Scripts : `ops/failover_switch.sh` (bascule trafic), `ops/render_workers.sh`
  (toggle workers Render, règles d'or env vars). Limite connue : ne pas
  dérouler de bascule pendant un `deploy-oci.yml` en cours (groupe
  `concurrency` différent).
- **Ordre bascule/rollback TOUJOURS** : désactiver les workers de l'instance
  qui cesse d'être primaire AVANT/juste après l'activation ailleurs. Deux
  primaires = doublons ; zéro primaire = alertes/corrections en pause.
- `ops/render_env_check.py` : jouer avant/après toute opération Render.
- Migrations : additives (déjà la pratique, 134/134) — les deux instances
  doivent toujours pouvoir servir la même version du schéma.
- OCI Always Free : l'instance A1 idle peut être stoppée par Oracle après
  7 jours < ~20 % CPU — non-concerné en pratique (workers périodiques).

## 5. Accidents connus / leçons

- **Clé API OCI tronquée au collage** (cette session) : toujours vérifier
  BEGIN/END et la longueur (~1218 bytes DER pour RSA 2048 PKCS#8) avant
  d'importer.
- **Actif-actif interdit** tant que les workers n'ont pas de
  `pg_advisory_lock` (élection de leader) — explicitement hors scope ici.

## 6. État du déploiement (mis à jour SECT-OCI-DEPLOY-3, 2026-10-09 10:05 UTC)

- ✅ **Accès SSH résolu** (rescue GRUB v7 — clé `sect-deploy` dans authorized_keys
  ubuntu+root) après 15 tentatives documentées 2A→2O. Anomalie control plane :
  `list_volume_attachments` retourne 0 alors que le volume est attaché (l'API
  d'attach le confirme : 409) — le listing du tenancy est cassé : ne JAMAIS
  tenter de détacher/réattacher le boot volume.
- ✅ **Kit §D.3 corrigé** (cbd21185) : compose API-only `127.0.0.1:8090` +
  vhost `caddy-vhost.conf` (caddy SYSTÈME mikcloud), WORKERS_ENABLED piloté
  par `.env`.
- ✅ **VM outillée** : docker.io + compose v2 + buildx installés, GHCR login
  OK (PAT read:packages), `/opt/sect/.env` rempli (14 vars COPIÉES de
  l'API Render, `WORKERS_ENABLED=false`, `DB_MAX_CONNS=60`).
- ✅ **Backend DÉPLOYÉ et SAIN sur OCI** (image GHCR CI `3fdb11d2`, ELF AArch64
  vérifié) : `http://127.0.0.1:8090/health` → `{"status":"ok"}`, conteneur
  healthy, logs « workers de fond DESACTIVES — instance standby API-only »,
  mikcloud/caddy/postgres intacts (22 Go RAM libres).
- ✅ **Build CI multi-arch RÉPARÉ** (3fdb11d2) : cause racine = les DÉFAUTS
  `ARG TARGETOS=linux/TARGETARCH=amd64` écrasaient l'injection BuildKit des
  auto-args → binaire amd64 dans l'image arm64 (preuve log #22 + ELF 0x3E).
  Fix : ARG nus + fallback shell. Cache GHA retiré au passage (fc3a004f).
- ✅ **P2 BASCULES SEMI-AUTOMATIQUES OPÉRATIONNELLES (SECT-FAILOVER-1,
  2026-10-10)** : workflows `failover.yml` (§3.7) + `failback.yml` (§3.6 —
  retour à la normale) sous approbation `production-failover` ;
  `ops/failover_switch.sh` + `ops/render_workers.sh` ; `WORKERS_ENABLED`
  versionné dans render.yaml (règle d'or 6) ; sonde P1 recentrée sur le
  chemin public `sect.ftci.fr/api/health` (suit le primaire courant).
- ✅ Vhost `api.sect.ftci.fr` → 127.0.0.1:8090 AJOUTÉ au Caddy système
  (validé + reload ; TLS Let's Encrypt dès que le DNS existera).
- ✅ DNS `api.sect.ftci.fr` → 84.235.228.160 créé (Cloudflare, GREY/DNS-only
  — voir §7 orange impossible). TLS Let's Encrypt émis par le Caddy système.
- ✅ Secrets GitHub `OCI_SSH_HOST/USER/KEY` posés (API, 2026-10-09) — le job
  deploy CI est ACTIF (redéploiement par digest immuable à chaque push backend).
- ✅ **CUTOVER §3.6 EXÉCUTÉ (2026-10-09 ~22:25 UTC)** : E2E OCI 6/6 (×2) →
  trafic Vercel basculé (commit 02de6dd, `via: 1.1 Caddy` prouvé sur
  sect.ftci.fr/api/health) → Render standby (`WORKERS_ENABLED=false`,
  dep-db4mhtrtqb8s7396tomg LIVE, 13 badges « Mode standby ») → OCI primaire
  (`WORKERS_ENABLED=true` + compose up, 14 workers started). Vérifié
  /api/monitoring/overview des deux côtés (fixture ADMIN jetable, résidu 0).
  Rollback < 5 min : §3.7.

## 7. Recette rescue SSH (v13 — SECT-OCI-CUTOVER-1, 2026-10-09)

GRUB_TIMEOUT=0 sur cette image : GRUB ne lit JAMAIS le clavier au boot —
l'interception par spam est VOIE MORTE (vérifié 4 rounds + 2G→2N historiques).
La voie fiable passe par le **BootManagerMenuApp UEFI** (rend sur le port
série et le lit via TerminalDxe) :

1. Console connection OCI (clé RSA — ed25519 REFUSÉE par l'API console) ;
   connexion : hop1 SSH `instance-console.<region>.oci.oraclecloud.com:443`
   (username = OCID de la console connection, pkey=) → canal direct-tcpip
   (OCID instance, 22) → `t2.auth_publickey(OCID_INSTANCE, clé)` → session
   `get_pty + invoke_shell` (SANS ça les touches n'atteignent pas la console).
2. SOFTSTOP → START. À t+1,2 s : UN SEUL burst `ESC` + `x`×24 (l'ESC en TÊTE
   de la file SimpleTextIn → le poll BdsDxe lit l'ESC → menu ; les `x`
   suivants sont drainés par l'app SANS la tuer — un 2e ESC dans la file
   tuerait l'app : ESC = exit).
3. Stabiliser 6 s SANS rien envoyer, puis flèches `\x1b[B` ×3 (TerminalDxe
   traduit ANSI → SCAN_DOWN ; les LETTRES ne marchent pas) → surbrillance
   Ubuntu→BlockVolume→Firmware Setup→**EFI Internal Shell** → `\r`.
4. Shell UEFI : `fs0:\EFI\ubuntu` (ESP FAT). Backup + réécrire le stub
   `grub.cfg` (echo ») avec `menuentry 'RESCUE' { linux (hd0,gpt13)/vmlinuz…
   root=UUID=… rw init=/bin/bash console=ttyAMA0,115200n8 ; initrd … }` puis
   `reset`. NB : les `\r` du echo cassent le parse → GRUB tombe en `grub>`
   (shell) → taper `linux`/`initrd`/`boot` directement — encore plus simple.
5. Root shell (`root@localhost:/#`) : injecter la clé dans
   /home/ubuntu/.ssh + /root/.ssh (append, chmod 700/600) ; **RESTAURER le
   stub original** (`mount /dev/sda15 /boot/efi`, `cp grub.cfg.sectbak
   grub.cfg`) ; `sync` ; `exec /sbin/init` → boot propre → SSH.
6. Actions API valides : start/stop/reset/softreset/softstop/diagnosticreboot
   (STOPFORCE n'existe pas). Pendant un cycle reset, toute 2e action → 409.
