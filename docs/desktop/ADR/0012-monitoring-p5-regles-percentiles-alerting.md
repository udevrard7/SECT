# ADR-0012 : Monitoring P5 — règles d'alerte configurables persistées, p50/p95 par endpoint, alerting externe (Slack/email dédié)

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Parent** | ADR-0011 (monitoring « couteau suisse » — P5 y était noté « non couvert ») |

## Contexte

ADR-0011 a livré l'alignement carte santé ↔ /monitoring (score backend unique)
et la vue système (runtime, workers, DB, R2, IA, tendance). Le chantier
terminait sur trois manques explicitement notés **pour P5** :

1. **Règles d'alerte non persistées** : les 6 seuils de l'onglet Alertes sont
   dérivés côté client (`systemThresholds` dans monitoring-page.tsx), en
   lecture seule — l'admin ne peut ni ajuster un seuil, ni désactiver une
   règle, ni en créer une, et tout est perdu au rechargement.
2. **Aucune latence par endpoint** : la colonne `duree` de MonitoringEvent
   n'alimente que les requêtes lentes (> 5 s) — pas de p50/p95 par route,
   pas de taux d'erreur par route, pas de volume.
3. **Alerting purement in-app** : seul le hook CRITICAL (ADR-0011 §6)
   notifie les ADMIN actifs ; rien ne sort de la plateforme (pas de Slack,
   pas d'email dédié) — un incident du week-end attend qu'un admin ouvre
   /monitoring.

## Décision

### 1. Migration 000133 — deux nouvelles tables + 11 règles seedées

**`AlertingRule`** (règles persistées, éditables) :

| Colonne | Rôle |
|---|---|
| `code` (UNIQUE) | identifiant stable (`errors-actifs`, …) |
| `metric` | clé du catalogue des métriques évaluables (voir §2) |
| `comparator` | `SUP` \| `SUP_EGAL` \| `INF` \| `INF_EGAL` |
| `threshold` (float8) | seuil de déclenchement |
| `severite` | sévérité de l'événement créé (`WARNING`/`ERROR`/`CRITICAL`) |
| `enabled` | activation |
| `cooldownMinutes` | anti-spam de la notification externe |
| `notifyInApp`/`notifySlack`/`notifyEmail` | canaux activés pour la règle |
| `isSystem` | règle seedée = non supprimable (éditable), custom = supprimable |
| `breachedSince` | franchissement en cours (NULL = règle saine) |
| `lastNotifiedAt` | date du dernier envoi externe (gate de cooldown) |

Policies TO PUBLIC (pattern 000117/000132) : `select` is_admin() OR
is_system(), `insert` is_admin(), `update` is_admin() OR is_system()
(le worker alerting ne touche QUE `breachedSince`/`lastNotifiedAt` sous
claims system), `delete` is_admin().

**`RequestLog`** (échantillonnage des requêtes API) : `method`, `route`
(pattern chi normalisé — `/api/epreuves/{id}` et non l'UUID), `status`,
`durationMs`, `createdAt`. Index sur `createdAt` (fenêtres + purge).
Policies : `insert`/`delete` is_system(), `select` is_admin() OR
is_system(). **Rétention 7 jours** (purge horaire dans le sampler) —
c'est de la télémétrie, pas des données métier.

**11 règles seedées** (`ON CONFLICT (code) DO NOTHING`, idempotent) :
les 6 seuils ADR-0011 (`score-sante-bas`, `critical-actifs`, `errors-actifs`,
`backlog-autorisations`, `db-latence`, `providers-ia-inactifs`,
`workers-erreur`) + 4 nouvelles rendues possibles par les tables P5
(`db-indisponible` CRITICAL, `warnings-actifs`, `p95-api-lente`,
`erreurs-5xx-24h`).

### 2. Catalogue de métriques — évaluation backend, une seule source

`internal/monitoring/rules.go` définit le catalogue des métriques
évaluables (`score_sante`, `critical_actifs`, `errors_actifs`,
`warnings_actifs`, `backlog_autorisations`, `db_latency_ms`, `db_down`,
`providers_ia_actifs`, `workers_en_erreur`, `p95_api_ms`,
`erreurs_5xx_24h`) et `CollectMetrics()` qui les mesure TOUTES côté
backend (mêmes requêtes que /overview ; le score réutilise `ComputeScore`
ADR-0011 → une règle `score_sante` ne peut jamais diverger de la carte).

Consommateurs : `GET /api/monitoring/rules` (statut live par règle :
`currentValue`, `violated`) et le worker d'alerting (§4). Les métriques
inconnues sont refusées à la création (400) — pas de règle orpheline.

### 3. Sampler de requêtes + `GET /api/monitoring/endpoints`

`internal/monitoring/sampler.go` — `RequestSampler` : file async (buffer
2000, drop-dégradé comme le Recorder), batch INSERT (unnest) sous claims
system. Le middleware de monitoring échantillonne 100 % des requêtes
`/api/*` (OPTIONS exclu, health/SSE déjà skippés) avec le **pattern chi**
(`rctx.RoutePattern()` post-handler) — les UUID deviennent `{id}`, les
stats par route restent lisibles et agrégables.

`GET /api/monitoring/endpoints?window=1h|24h|7d` (ADMIN) : par
`method+route` — `total`, `errors` (≥ 500), `errorRate`, `p50`, `p95`
(`percentile_cont`), `avg`, `max`, triés par volume (top 100). Affiché
dans l'onglet Système (sélecteur de fenêtre).

### 4. `AlertingWorker` — évaluation périodique + dispatch externe

Worker périodique (2 min, instrumenté `TrackContext` → visible dans le
registre de l'onglet Système) :

```
pour chaque règle enabled :
  value = CollectMetrics()[rule.metric]
  si violée :
    si breachedSince NULL → set now() + événement in-app (transition
    seule → pas d'auto-amplification du compteur errors_actifs)
    si cooldown écoulé (lastNotifiedAt) → canaux activés :
      - in-app  : MonitoringEvent (severite = règle) — un CRITICAL
                  déclenche en cascade le hook ADR-0011 §6 (dispatcher)
      - Slack   : POST SLACK_WEBHOOK_URL (best-effort, 5 s)
      - email   : mailer existant (Resend > SMTP > Log) vers
                  ALERTING_EMAIL_TO
    → lastNotifiedAt = now()
  sinon si breachedSince NON NULL → récupération :
    Slack/email « ✅ récupérée » (si notifiée pendant l'incident),
    breachedSince = NULL
```

Dégradation honnête : canaux non configurés = journalisés + **exposés dans
l'API** (`channels.slackConfigured`, `channels.emailReady`,
`channels.emailTo`) pour que l'UI indique quoi configurer, jamais de
silence feint. La valeur `ALERTING_EMAIL_TO` est positionnée d'usine sur
l'email du propriétaire ; l'expédition réelle devient active dès qu'un
mailer (RESEND_API_KEY ou SMTP) est configuré sur Render.

### 5. API règles (ADMIN)

- `GET /api/monitoring/rules` — règles + statut live + config canaux +
  catalogue métriques/comparateurs (alimente l'UI).
- `POST /api/monitoring/rules` — création custom (métrique du catalogue,
  code généré `custom-<uuid8>`, `isSystem=false`).
- `PUT /api/monitoring/rules/{id}` — édition (seuil, comparateur, sévérité,
  activation, cooldown, canaux, libellé). `metric` immuable (éditer une
  métrique = recréer). Désactiver une règle clears `breachedSince`.
- `DELETE /api/monitoring/rules/{id}` — refusé sur règle système (403).

Validation stricte : métrique inconnue / comparateur invalide /
threshold < 0 / sévérité hors {INFO,WARNING,ERROR,CRITICAL} /
cooldown hors [1, 1440] → 400.

### 6. Frontend — l'onglet Alertes devient opérable

- Le disclaimer « règles non persistées » disparaît ; les cartes seuils
  sont remplacées par les règles de la base : état live (current vs seuil,
  comparateur affiché), badge « Franchie », `Switch` d'activation,
  édition (GlassModal : seuil, comparateur, sévérité, cooldown, canaux),
  création, suppression (custom uniquement).
- Bandeau canaux externes : état Slack/email configuré ou action requise.
- Onglet Système : table « Endpoints API — p50/p95 » avec fenêtre
  1 h/24 h/7 j, p95 > 3 s mis en évidence.

## Conséquences

- L'admin peut enfin AGIR depuis /monitoring : ajuster un seuil bruyant,
  couper un canal pour une règle donnée, créer une règle métier sur une
  métrique réelle — persisté, auditable (colonnes updatedAt/breachedSince).
- Les vrais signaux prod (ex : 16 erreurs 5xx actives) génèrent désormais
  des événements + notifications externes dès le premier franchissement —
  c'est le comportement voulu, pas une régression du score.
- Charge ajoutée négligeable : 1 INSERT batché/s max, 1 évaluation/2 min
  (5 requêtes de comptage), purge horaire indexée.
- Non couvert (noté pour plus tard) : alerting par établissement,
  fenêtres horaires (pause nuit), webhooks génériques sortants.

## Références

- ADR-0011 (parent), migration 000132 (pattern policies MonitoringEvent)
- Patterns réutilisés : Recorder async (drop-dégradé), WorkerRegistry
  TrackContext (panic-safe), WithRegistry/fin de signature NewServer,
  SystemClaims + WithSystemTx, seeds idempotents ON CONFLICT.
