# Runbook — Variables d'environnement Render (sect-api)

> **Statut : ✅ restauré le 2026-10-05 (SECT-RENDER-ENV-RESTORE-1)** après
> l'incident du 05-10 02:17 (full-replace P5 ayant écrasé RESEND×2).
> Ce runbook rend l'incident **impossible à reproduire silencieusement** :
> source de vérité versionnée + garde automatique + règles d'or.

## 1. Incident racine (post-mortem condensé)

Le 05-10 02:17, un « full-replace » des env vars via l'API Render
(`PUT /v1/services/{id}/env-vars` avec 9 vars) a **silencieusement supprimé**
`RESEND_API_KEY` + `RESEND_FROM_EMAIL` : le PUT bulk **remplace l'ensemble
entier** — toute var non listée est supprimée. Conséquence : tous les emails
transactionnels (reset password, invitations, factures, alertes) stoppés
pendant ~5 h, sans aucune erreur visible (le fallback LogMailer journalise
stdout au lieu d'envoyer).

Détection : le bandeau « Canaux d'alerte » de /monitoring + le 7e check santé
« Emails transactionnels » (ajoutés par SECT-MONITORING-EMAIL-1) — c'est
cette exposition honnête qui a permis le diagnostic.

## 2. Source de vérité : `render.yaml` (repo, racine)

Toute variable d'environnement du service **doit exister dans `render.yaml`**
avant d'être posée sur Render. Le fichier encode trois cas :

| Syntaxe yaml            | Sémantique                                              |
|-------------------------|---------------------------------------------------------|
| `value: "…"`            | valeur littérale, comparée **exactement** par la garde   |
| `sync: false`           | secret qui vit dans le dashboard Render (présence exigée)|
| `generateValue: true`   | généré par Render (présence exigée)                      |

⚠️ Le service Render a été **créé manuellement** (2026-07-19) : il ne
synchronisera JAMAIS render.yaml automatiquement. Le yaml est la référence
pour les audits, pas un mécanisme de déploiement.

## 3. Garde automatique : `ops/render_env_check.py`

```bash
RENDER_API_KEY=rnd_… python3 ops/render_env_check.py
```

Compare l'état **live** de Render à `render.yaml` :
- chaque var REQUIRED absente/vide ou divergente = **FAIL** (exit 1) ;
- vars optionnelles (feature-gated : SMTP/Turnstile/VAPID/GeniusPay/Firebase/
  Slack) absentes = INFO (fonctionnalité désactivée, pas une panne) ;
- var live inconnue du yaml = WARNING (drift IaC).

**À exécuter AVANT et APRÈS toute opération sur les env vars.**

## 4. Règles d'or (à ne jamais violer)

1. **Jamais de PUT bulk sans GET préalable.** Le PUT remplace TOUT. Toujours :
   GET → modifier la liste obtenue → PUT de la liste COMPLÈTE.
2. **Jamais retaper un secret.** Relire les valeurs depuis le GET de l'API
   (elle renvoie les valeurs complètes) et les renvoyer à l'identique.
3. **`NEON_DATABASE_URL` utilise le rôle `sect_app`** (least-privilege, RLS
   opposable) — ne JAMAIS la remplacer par le DSN `neondb_owner`
   (BYPASSRLS). Le DSN owner ne sert qu'aux migrations (`NEON_DIRECT_URL`).
4. **Les vars API ne prennent effet qu'au redéploiement** : après un PUT,
   déclencher un deploy (`POST /v1/services/{id}/deploys`) et attendre `live`.
5. **Vérifier AVANT/APRÈS** avec `ops/render_env_check.py` (exit 0 requis),
   puis vérification comportementale (le mailer est observable :
   `GET /api/monitoring/rules` → `channels.mailer`).
6. **Toute nouvelle var : d'abord un commit render.yaml, ensuite le PUT.**

## 5. Procédure d'ajout/modification (pas à pas)

```bash
# 0. État AVANT (doit être conforme)
RENDER_API_KEY=rnd_… python3 ops/render_env_check.py

# 1. Commiter la var dans render.yaml (value: ou sync: false)

# 2. Lire l'état live complet (garder la sortie)
curl -s https://api.render.com/v1/services/srv-d9ed5bdaeets73auosj0/env-vars \
     -H "Authorization: Bearer $RENDER_API_KEY"

# 3. PUT de la liste COMPLÈTE = 9/14/etc. existantes (valeurs du GET,
#    byte-à-byte) + la nouvelle — jamais moins que l'existant
curl -s -X PUT https://api.render.com/v1/services/srv-d9ed5bdaeets73auosj0/env-vars \
     -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
     -d '[{"key":"…","value":"…"}, …]'

# 4. Déployer (les vars ne prennent effet qu'au redeploy)
curl -s -X POST https://api.render.com/v1/services/srv-d9ed5bdaeets73auosj0/deploys \
     -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
     -d '{"clearCache":"do_not_clear"}'

# 5. État APRÈS + vérification comportementale
RENDER_API_KEY=rnd_… python3 ops/render_env_check.py
```

## 6. Inventaire actuel (2026-10-05, post SECT-MONITORING-DISCORD-1 — 14 vars live)

**REQUIRED (14)** : `NEON_DATABASE_URL` (sect_app), `JWT_SECRET` (256 bits),
`ENVIRONMENT=production`, `CORS_ORIGINS`, `APP_BASE_URL`, `R2_*` ×5,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` (transactionnels uniquement),
`DISCORD_WEBHOOK_URL` (canal principal de l'alerting), `NEON_DIRECT_URL`.

**Optionnelles désactivées (18)** — absence = fonctionnalité off, pas une
panne : `SMTP_*` ×5, `TURNSTILE_*` ×2, `VAPID_*` ×3, `GENIUSPAY_*` ×4,
`FIREBASE_*` ×2, `SLACK_WEBHOOK_URL`, `ALERTING_EMAIL_TO` (email d'alerte
désactivé par décision produit quota — SECT-MONITORING-DISCORD-1 : le
reposer + réactiver notifyEmail par règle réactive le canal). Pour en
activer une : créer le secret chez le fournisseur, l'ajouter à render.yaml
(`sync: false`), PUT, deploy, puis vérifier (ex. Turnstile :
`GET /api/turnstile/site-key`).

**Réservées Render** : `PORT` (auto-injecté pour les services Docker).

## 7. Observabilité (le filet de sécurité)

L'état des canaux critiques est **exposé en prod** — une var perdue ne peut
plus passer inaperçue :
- `GET /api/monitoring/rules` → `channels {mailer, emailReady, slackConfigured, emailTo}` ;
- `GET /api/monitoring/health` → 7e check « Emails transactionnels »
  (OPERATIONNEL ⇔ Resend/SMTP réel, DEGRADE ⇔ LogMailer) ;
- UI /monitoring → bandeau « Canaux d'alerte » + nav SERVICES n/7.

## 8. Historique des écritures Render

| Date       | Opération                                                        | Vars |
|------------|------------------------------------------------------------------|------|
| 2026-07-19 | Création manuelle du service (aucun blueprint)                   | 1    |
| 2026-09-29 | USER : RESEND×2 + APP_BASE_URL (emails livrés ×2) — disparues avant le 04-10 | — |
| 2026-10-04 | SECT-R2-CONFIG-1 : full-replace 8 vars (JWT 256 bits, ENV, 5×R2, NEON préservée) | 8 |
| 2026-10-05 | SECT-MONITORING-P5-1 : full-replace 9 vars — **ÉCRASE RESEND×2 (incident)** | 9 |
| 2026-10-05 | SECT-RENDER-ENV-RESTORE-1 : PUT 14 vars (9 préservées byte-à-byte + RESEND×2, APP_BASE_URL, CORS_ORIGINS, NEON_DIRECT_URL) + deploy + vérif 8/8 (email réel DELIVERED) | 14 |
| 2026-10-05 | SECT-MONITORING-DISCORD-1 : PUT 14 vars (13 préservées byte-à-byte + `DISCORD_WEBHOOK_URL` ; `ALERTING_EMAIL_TO` retirée — alertes par Discord, quota Resend réservé aux transactionnels) + migration 000134 (notifyEmail=false, notifyDiscord=true) | 14 |
