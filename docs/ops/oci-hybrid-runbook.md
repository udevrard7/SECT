# Runbook — Migration backend vers OCI Marseille (architecture hybride)

**Task ID : SECT-OCI-HYBRID-1** · État : kit livré, bascule en attente d'accès VM

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
# encore supporter cette distribution)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
# Login GHCR — l'image est PRIVÉE (défaut GHCR pour les packages poussés
# via GITHUB_TOKEN). PAT scope read:packages :
# https://github.com/settings/tokens → cocher read:packages uniquement.
echo "$GHCR_PAT" | docker login ghcr.io -u udevrard7 --password-stdin
# Fichiers du repo (une seule fois)
git clone --depth 1 https://github.com/udevrard7/SECT.git /tmp/sect
cp /tmp/sect/deploy/oci/{docker-compose.yml,caddy-vhost.conf} /opt/sect/
cp /tmp/sect/deploy/oci/.env.example /opt/sect/.env && chmod 600 /opt/sect/.env
```

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

### 3.7 Rollback (< 5 min)

1. Variable Vercel API URL → `https://sect-zead.onrender.com` + redeploy.
2. Render : `WORKERS_ENABLED=true` + redeploy (il redevient primaire).
3. OCI : `docker compose stop` (éviter les doublons workers).

## 4. Gardes permanentes

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

## 6. État du déploiement (mis à jour SECT-OCI-DEPLOY-3, 2026-10-09)

- ✅ **Accès SSH résolu** (rescue GRUB v7, clé `sect-deploy` injectée dans
  authorized_keys ubuntu+root) — après 15 tentatives documentées 2A→2O.
  Anomalie control plane constatée : `list_volume_attachments` retourne 0
  (record d'attachment invisible) alors que le boot volume est attaché et
  l'attach API le confirme (409) — le listing de ce tenancy/région est
  cassé ; n'AUTORISER aucun détachement/reattach du boot volume (impossible
  de toute façon sans OCID d'attachment).
- ✅ Kit §D.3 corrigé : compose API-only 127.0.0.1:8090 + vhost caddy
  système (`caddy-vhost.conf`), coexistence mikcloud documentée.
- ⬜ DNS `api.sect.ftci.fr` → 84.235.228.160 (Cloudflare — action
  utilisateur, record inexistant = NXDOMAIN confirmé).
- ⬜ Secrets GitHub `OCI_SSH_HOST/USER/KEY` à poser (le job deploy CI se
  skip proprement tant qu'ils sont absents).
- ⬜ Cutover §3.6 (E2E → DNS/Vercel → Render standby → OCI workers on).
- VM : Ubuntu 26.04 ARM64, 4 vCPU/24 Go (22 Go libres), Docker à installer,
  IP publique RESERVED 84.235.228.160.
