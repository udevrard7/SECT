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
| `deploy/oci/docker-compose.yml` | api (healthcheck, limits 3.5 CPU/20 Go, logs rotés) + caddy (TLS auto, ports 80/443) |
| `deploy/oci/Caddyfile` | Reverse proxy : `flush_interval -1` (SSE/WebSocket), HSTS, max body 100 Mo |
| `deploy/oci/.env.example` | Inventaire complet aligné sur render.yaml — secrets à COPIER depuis Render (jamais retaper) |
| `.github/workflows/deploy-oci.yml` | build multi-arch → GHCR → SSH deploy (porte `gate` : skip propre tant que les secrets SSH sont absents) |

## 3. Procédure de mise en service (à exécuter avec accès VM)

### 3.1 Sonde (déjà prête côté API — clé fournie tronquée, voir §6)

Re-réalimenter `/home/z/oci/config` avec la clé privée COMPLÈTE (BEGIN→END),
puis le SDK OCI liste : instances (shape/état/IP), VCN/subnets/security lists
(ouvrir 80/443 — et 22 restreint), boot volume, plugins Oracle Cloud Agent.

### 3.2 Préparer la VM (SSH)

```bash
sudo mkdir -p /opt/sect && sudo chown $USER /opt/sect && cd /opt/sect
# Docker + compose plugin (Ubuntu/Oracle Linux : voir doc officielle)
curl -fsSL https://get.docker.com | sudo sh
# Login GHCR — l'image est PRIVÉE (défaut GHCR pour les packages poussés
# via GITHUB_TOKEN). Créer un PAT scope read:packages :
# https://github.com/settings/tokens → cocher read:packages uniquement.
echo "$GHCR_PAT" | docker login ghcr.io -u udevrard7 --password-stdin
# Fichiers du repo (une seule fois)
git clone --depth 1 https://github.com/udevrard7/SECT.git /tmp/sect
cp /tmp/sect/deploy/oci/{docker-compose.yml,Caddyfile} /opt/sect/
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
- `WORKERS_ENABLED=true` (PRIMAIRE)
- `DB_MAX_CONNS=60` (deux backends partagent le pooler Neon)
- `NEON_DATABASE_URL` : garder le rôle **sect_app** (least-privilege) —
  PAS le DSN owner BYPASSRLS
- `JWT_SECRET` : IDENTIQUE à Render (tokens interchangeables, zéro disruption)

### 3.4 DNS + premier démarrage

1. Créer `api.sect.ftci.fr` → IP publique OCI (A record, proxy Cloudflare en
   mode DNS-only le temps de l'émission Let's Encrypt, puis proxy on).
2. `cd /opt/sect && docker compose up -d` → caddy obtient le certificat.
3. `curl https://api.sect.ftci.fr/health` → `{"status":"ok"}`.

### 3.5 CI/CD — secrets GitHub

`Settings → Secrets and variables → Actions` :
- `OCI_SSH_HOST` = IP publique VM
- `OCI_SSH_USER` = utilisateur SSH (ubuntu/opc)
- `OCI_SSH_KEY` = clé privée OpenSSH

Le workflow `deploy-oci.yml` passe alors de « build only » à « build+deploy ».
Chaque push `backend/**` redéploie par digest immuable + healthcheck + smoke test.

### 3.6 Bascule contrôlée (cutover)

1. E2E sur OCI : rejouer `sect-audit/verify_discord_live.py` avec
   `API=https://api.sect.ftci.fr` (login, règles, santé 7/7, score).
2. Basculer le frontend : variable Vercel `NEXT_PUBLIC_API_URL` (ou équivalent
   selon la config frontend) → `https://api.sect.ftci.fr` + redeploy Vercel.
3. **Passer Render en standby** : env var `WORKERS_ENABLED=false` sur Render
   + redeploy (sinon doublons d'alertes/corrections).
4. Vérifier /monitoring sur Render : bandeau « Instance standby » visible,
   13 badges `Standby` (c'est la preuve que la garde fonctionne).

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

## 6. Bloqueurs en cours

- La clé privée OCI fournie est **tronquée** (~55 % — coupée avant
  `-----END PRIVATE KEY-----`). La sonde en profondeur (instances, réseau,
  plugins) et le pilotage API attendent la clé complète.
- Les secrets GitHub `OCI_SSH_*` ne sont pas posés (nécessitent la VM).
- L'IP publique de la VM n'est pas encore connue de ce poste.
