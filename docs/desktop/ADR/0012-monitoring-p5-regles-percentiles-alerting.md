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

---

## Addendum — SECT-INFRA-MONITOR-1 : monitoring d'INFRASTRUCTURE hybride (11 octobre 2026)

### Motivation

Le P5 (cette ADR) regardait l'APPLICATION : requêtes, score, workers,
santé des services. Or l'option C (ADR-0013) a construit une
infrastructure décisionnelle — réplique 5433, backups chiffrés, VM OCI,
DR voie D, mur CU Neon — qui n'était visible dans AUCUNE console du
produit (uniquement dans les ops hors prod : workflows, Discord, le
dashboard sandbox du tuteurat). La demande de l'exploitant (11/10) :
« un système de monitoring à la pointe de notre infrastructure ».

### Décision

Un 5ᵉ onglet « Infrastructure » dans la console super admin
(/monitoring), alimenté par **GET /api/monitoring/infra** (ADMIN), et
3 règles système (migration 000136) qui étendent l'alerting existant
à l'infrastructure :

| Règle | Métrique | Seuil | Sévérité | Rationale |
|---|---|---|---|---|
| replica-fraicheur | replica_lag_min | ≥ 90 | WARNING | 3 fenêtres grille M1 manquées (voie D dégradée) |
| backup-fraicheur | backup_age_h | ≥ 36 | CRITICAL | RPO voie B — aligné watchdog §5-3 |
| disque-libre | disk_free_pct | ≤ 15 | CRITICAL | le maillon fragile §3 (disque plein = API + réplique + DR morts ensemble) |

### Principe directeur (leçon §13.3 appliquée à l'observabilité)

**Rien dans ce module ne réveille Neon.** Les mesures viennent de :
la réplique locale 5433 (RPO vécu = now() − max(createdAt RequestLog)),
/proc + statfs (la VM), le staging backup monté ro dans le conteneur
(/state/backup — fichiers last_success et markers restore-ok-* que
les scripts écrivent déjà), et le control plane Neon (API console
UNIQUEMENT — optionnel, cache 5 min process-wide). La sonde du
primaire (?probe=primary) est un geste VOLONTAIRE de l'admin : un
bouton, un ping, un toast qui rappelle le coût grille.

### Disponibilité ≠ zéro

Chaque métrique d'infrastructure porte un flag de disponibilité
(*OK dans MetricsSnapshot) : une sonde absente (standby Render sans
réplique, staging non monté) rend la métrique INÉVALUABLE — une règle
ne peut PAS se déclencher sur une mesure qui n'existe pas. C'est la
version alerting de « jamais 0 silencieux ».

### Pièges résolus en conditions (runs 38158907538 → 38159850405)

1. **EXTRACT() renvoie numeric** : un scan pgx dans interface{} ne
   type-assert PAS en float64 → valeur silencieusement perdue. Cast
   ::float8 côté SQL.
2. **pg_stat_subscription JOINT pg_subscription** (superuser-only) :
   le rôle applicatif NOSUPERUSER y voit ZÉRO ligne. Les stats de
   souscription ne sont pas exposées — la fraîcheur des DONNÉES est
   la métrique de référence du RPO.
3. **Le staging /var/lib/sect-backup était 750** (héritage de l'ère
   User=postgres du service) : l'utilisateur conteneur (sect, non
   root) ne pouvait pas traverser. Remédiation sudo chmod dans
   deploy-oci (chaque déploiement la ré-affirme).
4. **Un silence d'écriture n'est pas une grille cassée** : fraîcheur
   46 min à 17:29 = dernière REQUÊTE à 16:43 (mesuré : 5 253 lignes,
   max 16:43:01, souscription enabled=false entre fenêtres = normal).
   Le seuil voie D est aligné sur la règle (90 min), le verdict réel
   avant promotion reste dr_gate.sh (superuser).

### Vérification en conditions réelles (workflow infra-verify)

JWT ADMIN forgé sur la VM (pattern dr-drill MARK 8), assertions :
HTTP 200, readSource=replica, voie D, tables ≥ 80, âge backup lu,
diskFreePct > 0, règles 000136 = 3/3. Dernier état : SUCCÈS
(run 38159850405, 17:29 UTC — 5 253 RequestLog, backup 13,5 h,
restore marker 2026-10, CU cycle 24,75/100, disque 78 % libre).

## Addendum — SECT-LATENCY-1/2/3 : audit latence + corrections (11 octobre 2026)

### Mesures de référence (workflows latency-audit / latency-diag, lecture seule)

| Composant | Mesure | Verdict |
|---|---|---|
| Handler Go pur (`/health`) | 0,6-0,9 ms | sain |
| Pool → Neon (connexion tenue) | 20-23 ms | sain (Marseille→Francfort) |
| Nouvelle connexion Neon | 176-212 ms | sain (chemin froid) |
| TCP Neon (RTT) | 25-31 ms | sain |
| Réplique locale 5433 (socket) | 0,05-0,23 ms | sain |
| api.sect.ftci.fr direct (TLS caddy) | 16-23 ms | sain |
| sect.ftci.fr via rewrite Vercel | 217-428 ms | coût du relais Vercel |
| POST /api/landing-demo | 30 002 ms, 100 % erreur, réponse VIDE | CASSÉ → corrigé |
| GET /api/monitoring/overview | 892-1 430 ms | 5× trop lent → corrigé |

**Conclusion système : l'infrastructure (option C) n'est PAS le goulot.** Les
deux vrais problèmes étaient applicatifs : la chaîne IA du landing-demo et le
WriteTimeout du serveur HTTP.

### Cause racine n°1 — WriteTimeout tuait les réponses tardives en silence

Le serveur (`cmd/api/main.go`) pose `WriteTimeout: 30s` à la lecture des
headers. Test local (WriteTimeout=3s, écrits chaque seconde) : tout écrit TCP
après le deadline disparaît SILENCIEUSEMENT — `Fprintf` retourne `err=nil`,
le client ne reçoit RIEN, puis EOF (connexion tuée par le serveur).

Victimes :
1. `POST /api/landing-demo` : le 503 était journalisé à 30 001 ms mais la
   connexion mourait AVANT l'écriture → curl exit 52, http=000, réponse vide.
2. Les 3 flux SSE (messagerie, notifications, surveillance) : heartbeats 45s
   et événements perdus au-delà de 30 s de connexion → EventSource du
   navigateur se reconnecte en boucle ; le RequestLog enregistrait des
   « latences » de 950 s = durée de vie de connexions zombies.

Fix : `http.ResponseController.SetWriteDeadline` (mécanisme prévu par
net/http pour les timeouts par-réponse). Pré-requis : `Unwrap()` sur les
wrappers maison de ResponseWriter (statusRecorder, statusWriter — chi
compress l'avait déjà en v5.3.2). Les 3 hubs SSE réarment le deadline avant
chaque flush ; landing-demo l'étend à l'entrée du handler (réponse TOUJOURS
livrée, même l'erreur).

**Règle d'architecture désormais obligatoire** : tout handler qui peut
écrire après 30 s (SSE, génération IA, export) DOIT réarmer son write
deadline via ResponseController — ou finir AVANT 30 s.

### Cause racine n°2 — chaîne IA sans budget par tentative ni cooldown

Mesures providers (run 38164208378, clés de prod, depuis l'hôte) :
Mistral p1 = 403 (0,09 s, « not available in your subscription tier ») ;
Groq p3 = 404 (0,05 s, modèle inexistant) ; MuleRouter p4 = 200 mais TTFB
5,8-6,6 s pour 20 tokens (QCM complet ≈ 30 s+) ; OpenRouter p5 = 200 en
0,5-1,1 s (fonctionnel) ; DeepSeek = 402 (crédits épuisés) ; Cerebras/ZAI =
404 (modèles invalides).

Le 30 s observé : Mistral+Groq échouent vite, puis MuleRouter consommait
TOUT le budget — OpenRouter (le seul rapide et valide) n'était jamais
essayé. De plus `AIFailoverEvent` était écrit avec le ctx de la requête déjà
mort → table vide ; et `ChatCompletion` passait un logger nil → échecs
invisibles dans les logs serveur.

Fix :
1. `attemptCtx` : part FIXE de 12 s par tentative quand le budget parent est
   court (< 60 s) ; budgets longs (workers, 5 min) inchangés ;
2. cooldown mémoire ENFIN implémenté (`FailoverConfig.CooldownDurationMs`,
   défaut 60 s) : un provider en échec est écarté jusqu'à guérison ou
   expiration — le provider de tête reste toujours essayé pour garantir
   une erreur parlable ;
3. `AIFailoverEvent` via ctx DÉTACHÉ (`context.WithoutCancel` + 3 s) ;
4. logger réel (`slog.Default()`) ;
5. landing-demo : budget 20 s + 503 livré avec message actionnable + WARN
   serveur de la cause.

**Vérifié en prod (run 38166366991)** : essai 1 = 200 en 19,0 s (QCM
kimi-k2.6 complet), essai 2 (cooldown armé) = 200 en 4,5 s.

### Améliorations connexes

- `monitoring/overview` : 7 blocs séquentiels (0,9-1,4 s mesurés, poll
  console 60 s) parallélisés par WaitGroup — 211-264 ms mesurés post-fix
  (~5×).
- `monitoring/endpoints` : les flux SSE restent loggés dans RequestLog mais
  sont EXCLUS des percentiles (durée de connexion ≠ latence de requête).

### Nettoyage providers (données opérateur, découvertes par l'audit)

Mistral : le plan n'inclut pas mistral-large-latest (403 tier_not_allowed,
code 1910) → clé/plan ou modèle à corriger. Groq : le modèle
`llama-3.1-8b-instant` n'existe plus ou l'org n'y a pas accès. DeepSeek :
crédits épuisés (402). Cerebras `qwen3.7-max` et ZAI `default` : modèles
invalides (404). Tant qu'au moins un provider rapide est configuré, la
démo répond en 2-5 s sans même solliciter le cooldown.

### Pièges documentés (complément §18.5)

8. Un wrapper de ResponseWriter SANS `Unwrap()` masque
   `ResponseController` → `SetWriteDeadline` échoue en silence. Tout
   wrapper ajouté à l'avenir DOIT implémenter `Unwrap()`.
9. Les durées SSE dans RequestLog ne sont PAS des latences : les exclure
   des agrégations percentile (fait) et ne jamais s'en servir de seuil
   d'alerte.
10. Un context expiré tue aussi les écritures d'audit « best-effort » :
    tout log d'erreur conditionné par l'échec qu'on diagnostique DOIT
    utiliser un ctx détaché (`WithoutCancel` + timeout court).
