# ADR-0006 : Migration backend Render → Oracle Cloud (OCI) + scalabilité composition massive

| Champ | Valeur |
|---|---|
| **Statut** | Accepté (plan par phases, bascule conditionnée aux tests de charge) |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — (complète ADR-0003 : le backend reste un binaire cloud unique, seul l'hébergeur change) |
| **Superseded by** | — |

## Contexte

Le backend Go/Fiber tourne aujourd'hui sur Render avec **`plan: free`** (`render.yaml`).
Conséquences concrètes en production :

1. **Spin-down après 15 min d'inactivité** → cold start de ~50 s à la première requête.
   Pour une plateforme d'examens utilisée par vagues (début d'épreuve à heure fixe),
   c'est le pire scénario : les premiers étudiants d'une session tapent sur une API endormie.
2. **512 Mo RAM, CPU partagé** — suffisant aujourd'hui, mais sans marge pour des pics
   de composition simultanée.
3. Aucun contrôle sur l'OS, les limits de FD, le tuning réseau.

Le besoin exprimé : **des milliers d'étudiants en composition simultanée**, avec un budget
devant rester proche de zéro. Un compte Oracle Cloud (OCI) a été créé.

État de l'art du code (atouts déjà en place — la migration n'a **aucun code applicatif à changer**) :

- Pool `pgxpool` déjà tuné pour 5000+ sessions (`db/db.go` : MaxConns=100 via `DB_MAX_CONNS`,
  Neon pooler PgBouncer transaction mode, `QueryExecModeDescribeExec` pour RLS) ;
- Pic de soumission fin d'épreuve déjà absorbé : **202 async + jitter frontend** (OPT-11 /
  SUBMIT-RATELIMIT-1 / SUBMIT-JITTER-1) avec outil de charge dédié `cmd/loadtest-submit` ;
- Temps réel = **SSE** (messagerie/notification/surveillance hubs) avec heartbeats 45-60 s ;
- 12 workers métier tournent **in-process** du binaire unique (ADR-0003) ;
- Dockerfile multi-stage durci (non-root, healthcheck, statique `CGO_ENABLED=0`) — portable
  tel quel sur ARM en changeant `GOARCH=arm64`.

## Options considérées

### Option A — Rester sur Render (plan payant Starter, ~7 $/mois)
- **Avantages** : zéro ops, déploiement déjà en place
- **Inconvénients** : coût mensuel, 512 Mo→1 Go seulement, toujours PaaS fermé,
  spin-down réglé mais marge de scaling limitée

### Option B — Oracle Cloud Always Free (VM.Standard.A1.Flex ARM Ampere)
- **Avantages** : **4 OCPU + 24 Go RAM gratuits à vie** (≈ 10-20× le plan free de Render),
  **zéro cold start** (VM 24/7), contrôle total (ulimit, tuning, docker), région
  `eu-frankfurt-1` = même métro que Neon `eu-central-1` (latence DB ~1-3 ms),
  Go compile nativement en ARM64, l'image Docker existante est portable telle quelle
- **Inconvénients** : ops à assumer (hardening, TLS, backups, monitoring),
  1 VM = SPOF tant qu'on ne duplique pas, capacité Ampere A1 parfois difficile à
  obtenir en région chargée

### Option C — Fly.io / Railway
- **Avantages** : deploiement simple, regions proches
- **Inconvénients** : gratuits limités/péremptoires, coût récurrent au-delà,
  re-vendor lock-in PaaS — mêmes limites structurelles que Render

### Option D — Kubernetes (k3s sur les VMs Always Free)
- **Avantages** : scale-out natif
- **Inconvénients** : over-engineering manifeste pour 1-3 services et un solo dev ;
  le coût d'ops explose ; YAGNI

## Décision

**Option B : Oracle Cloud Always Free**, dans l'architecture cible suivante :

```
Étudiants (Abidjan/CI)
   │
   ▼
Cloudflare (DNS + proxy + WAF + TLS edge + anti-DDoS)   ← gratuit
   │            ├─ sect.ftci.fr         → Vercel (frontend Next.js)
   │            └─ api.sect.ftci.fr     → OCI Frankfurt (backend)
   ▼
OCI eu-frankfurt-1 — VM.Standard.A1.Flex 4 OCPU / 24 Go (Always Free, ARM64)
   Ubuntu 24.04 + Docker
   ├─ sect-api (image GHCR ARM64, docker compose, restart: always)
   └─ Caddy (reverse proxy, TLS auto, compression, ulimit nofile 65536)
   │
   ▼
Neon eu-central-1 (AWS Francfort) — INCHANGÉ
   pooler PgBouncer + autoscaling CU ; même métro → ~1-3 ms inter-cloud
```

GitHub reste la source unique (code + CI/CD) : le workflow existant `backend-ci.yml`
est étendu d'un job `deploy` : build ARM64 → push GHCR → SSH sur la VM →
`docker compose pull && up -d` → healthcheck `/health` → rollback automatique en cas
d'échec. **Vercel et Neon restent inchangés.**

### Capacité vis-à-vis de l'objectif « milliers d'étudiants simultanés »

| Charge @ 5000 étudiants simultanés | Valeur | Capacité 4 OCPU/24 Go ARM | Marge |
|---|---|---|---|
| Flush autosave (30 s) | ~167 écritures/s | Fiber/Go : >10 000 req/s sur 4 cœurs | ×60 |
| HTTP global hors flush | ~600 req/s | idem | ×16 |
| Connexions SSE ouvertes | ~5000 (1 goroutine + 1 FD chacune) | nofile 65536, goroutines ~4 Ko | confortable |
| RAM API | ~300-500 Mo | 24 Go | ×50 |
| **Vrai plafond** | **Neon (CU autoscaling + PgBouncer)** | — | à surveiller via métriques |

Conclusion : **le backend Go n'est pas le goulot — la DB l'est**. L'OCI Always Free
couvre largement le tier API ; l'effort de scalabilité se concentre sur Neon
(autoscale, éventuellement read replica pour les consultations/corrections).

### Contraintes architecturales à respecter (héritées de l'existant)

1. **SSE hubs in-memory + workers in-process + limiter in-memory** → le backend reste
   **une seule instance** tant que ces états ne sont pas externalisés (Phase 3).
   Ne JAMAIS lancer 2 répliques de l'image telle quelle (double exécution des workers,
   temps réel cassé).
2. Le runtime DB reste `sect_app` (RLS NOBYPASSRLS) — la dette « audit GRANT » est
   inchangée et indépendante de l'hébergeur (même DSN, même comportement).
3. SSE via Cloudflare : OK grâce aux heartbeats 45-60 s déjà implémentés (< timeout 100 s).

## Plan de migration (phases, sans downtime)

### Phase 0 — Provisioning + hardening (Render continue de servir la prod)
- VM OCI `eu-frankfurt-1`, A1.Flex 4 OCPU/24 Go, Ubuntu 24.04, image cloud-init
- Hardening : SSH par clés uniquement, `ufw` (22 restreint, 80/443 ouverts),
  `fail2ban`, `unattended-upgrades`, utilisateur non-root, swap 4 Go (filet de sécurité)
- Caddy : reverse proxy → `127.0.0.1:8080`, TLS auto, `nofile` 65536
- DNS : `api.sect.ftci.fr` → Cloudflare (proxied) → IP publique VM
- GitHub Actions deploy (GHCR + SSH + healthcheck + rollback)
- Snapshots OCI quotidiens (gratuits, 5 volumes max) + export des secrets dans 1Password

### Phase 1 — Shadow run + preuve par la charge
- Déployer l'image sur Oracle **en parallèle de Render** (même Neon)
- Rejouer `cmd/loadtest-submit` contre l'URL Oracle :
  `-n 1000`, puis `-n 3000 -jitter 45000` (simulation OPT-11) → valider
  distribution 200/202, p95/p99, 0 % 5xx
- Soak test SSE 24 h (heartbeaux, reconnexion, fuite mémoire)
- Critère GO : p95 < 300 ms à 3000 virtuels, 0 erreur 5xx, RAM stable

### Phase 2 — Bascule (réversible)
- Vercel : `NEXT_PUBLIC_API_URL` → `https://api.sect.ftci.fr`
- Repo : mettre à jour les ~10 fallbacks hardcodés `sect-zead.onrender.com`
  (`vercel.json` rewrite, `manifest.json` origin, `next.config.ts` remotePattern,
  routes `go-auth/*`), `render.yaml` marqué deprecated (documentation)
- `CORS_ORIGINS` backend inchangé (origins frontend identiques)
- **Render reste allumé 2 semaines** comme plan de rollback (flip DNS inverse) ;
  à l'issue : scale down Render → statut archive
- Surveillance 48 h : `/health` + MonitoringEvent existants + uptime externe

### Phase 3 — Scale-out (UNIQUEMENT si les métriques l'exigent)
- Split `cmd/api` / `cmd/workers` en deux déploiements (les workers ne tournent qu'une fois)
- Rate limiter + verrous → Redis managé (ex. Upstash) au lieu de la mémoire
- Fan-out SSE → Redis pub/sub entre N répliques API
- 2 VM (2 OCPU/12 Go chacune) + Cloudflare Load Balancing
- Read replica Neon pour consultations de résultats / corrections

## Justification

1. **Rapport performance/prix imbattable** : 4 OCPU ARM + 24 Go à 0 €/mois, à vie,
   contre 7 $/mois pour 1 Go chez Render. Go + ARM64 = mariage idéal (compilation
   native, pas d'émulation).
2. **Le spin-down de Render free est un bug de production déguisé** : cold start ~50 s
   juste avant une épreuve = plaintes utilisateurs garanties. Une VM always-on l'élimine.
3. **Latence DB préservée** : OCI Frankfurt ↔ Neon Francfort = même métro, ~1-3 ms.
   Aucune dégradation du chemin critique (autosave, RLS par transaction).
4. **Zéro changement applicatif** : l'image Docker durcie existante est portable
   (`GOARCH=arm64` + même variables d'env que `render.yaml`).
5. **Décision réversible** : Render peut resservir en inversant deux variables d'env
   et un DNS pendant toute la fenêtre de rollback.

## Conséquences

### Positives
- Fin des cold starts ; ×10-20 en ressources backend ; 0 €/mois
- Contrôle ops complet (ulimit pour 5000 SSE, tuning TCP, logs centralisés)
- CI/CD GitHub Actions homogène : GitHub = code + build + deploy (une seule pane de verre)

### Négatives / risques + mitigations
| Risque | Mitigation |
|---|---|
| Solo dev = charge ops réelle | Tout scripté (cloud-init + compose + CI), 1-2 j de setup, runbook dans ce repo |
| 1 VM = SPOF | Snapshots quotidiens OCI, `restart: always`, healthcheck Actions, rollback Render 2 semaines |
| « Out of capacity » Ampere A1 en région chargée | Passer le compte OCI en PAYG (sans consommer) : quotas Always Free plus accessibles + retry hors peak |
| Reclaim Always Free si idle 7 j (CPU/réseau faibles) | Non applicable : workers 24/7 + healthchecks + trafic réel |
| Compromis sécurité VM publique | Hardening Phase 0 (clés, ufw, fail2ban, updates auto), utilisateur non-root déjà dans l'image |
| Perte de l'observabilité Render | `/health` + MonitoringEvent existants + uptime externe (UptimeRobot) + logs JSON docker |

## Critères de réévaluation

- Si la charge réelle dépasse durablement ~10 000 SSE simultanés ou si Neon devient
  le facteur limitant confirmé par les métriques → activer la Phase 3 (split workers,
  Redis, multi-VM) via un nouvel ADR.
- Si l'ops Oracle menace la vélocité produit (incidents répétés) → retour Render Starter
  ou équivalent PaaS (décision réversible, cf. Phase 2).
- Si le budget le permet plus tard : envisager Neon Scale + répliques lecture avant
  tout nouvel investissement compute.

## Références

- [ADR-0003 : backend cloud unique](./0003-single-cloud-backend.md) — inchangé, seul l'hébergeur bouge
- `backend/internal/db/db.go` — pool pgx + calculs de charge 5000 sessions
- `backend/cmd/loadtest-submit/main.go` — outil de charge du pic de soumission (202/jitter)
- `render.yaml` — plan free actuel (spin-down) + liste exacte des variables d'env à répliquer
- Docs Neon : autoscaling compute (CU) et PgBouncer transaction mode
