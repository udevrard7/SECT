# ADR-0011 : Monitoring plateforme — alignement dashboard ↔ /monitoring et « couteau suisse » admin système

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Parent** | ADR-0009/0010 (philosophie RBAC : ADMIN = propriétaire plateforme, consoles transverses) |

## Contexte

Demande produit : la **carte « Santé plateforme »** du dashboard ADMIN et le
module **/monitoring** doivent être alignés, et /monitoring doit devenir un
véritable outil de suivi admin système (« le couteau suisse »).

L'audit complet (backend + frontend) a révélé :

### Constats d'alignement (dashboard ↔ monitoring)

1. **Score santé calculé côté client** dans admin-dashboard.tsx avec une
   formule qui pénalise à vie de −20 points : `nbEtablissementsProteges` et
   `nbVerificationIdentite` sont **hardcodés à 0** côté backend
   (stats_handlers.go:934-939) alors que la donnée existe
   (SecuritySettings.proctoringActif / verificationIdentite). Le score ne
   peut jamais atteindre 100.
2. **Deux sources, deux formes** : /api/stats/admin expose
   `monitoringResolvedToday` (absent de /api/monitoring), /api/monitoring
   expose `stats.{active,critical,error}Count` ; aucun des deux ne expose
   les WARNING ni un score.
3. **Aucun lien** entre la carte santé et /monitoring.

### Constats « couteau suisse » (lacunes de /monitoring)

4. **Escalade cassée** : le frontend envoie `details` (objet JSON) où le
   backend attend un `*string` → 400 « JSON invalide » systématique.
5. **Notes de résolution jamais persistées** (pas de colonne, pas envoyées).
6. **`duree` jamais peuplée** par les sources auto (le middleware calcule
   les ms mais ne les envoie pas) → latence moyenne frontend toujours 0.
7. **Uptime fake** : /api/monitoring/health retourne des SLA hardcodés
   (« 99.95% ») ; `checkDatabase` scanne `activeConns` puis jette la valeur.
8. **Règles d'alerte factices** : 6 règles hardcodées dans le frontend avec
   des `current` inventés, toggles sans backend.
9. **Zéro visibilité workers** : 13 workers sans registre, sans statut,
   sans instrumentation — un worker qui panique tue le process (pas de
   recover au niveau boucle pour les périodiques).
10. **Zéro métriques runtime** : pas d'uptime process, goroutines, mémoire,
    GC, version Go.
11. **Pas de tendance** : aucun agrégat par jour/sévérité ; pas de filtre
    date ni pagination réelle (limit 100 sans total).
12. **CRITICAL muet** : aucun Dispatch de notification sur événement
    critique (seul le poll 30s de la page le montre).
13. **Types orphelins** : DATABASE/AUTH/EVALUATION/PAYMENT ne sont produits
    par aucune source automatique (seuls 5xx/panic/lenteur via middleware).
14. **Mine RLS** : les 3 policies MonitoringEvent sont `TO neondb_owner`
    (drift prod — déjà TO PUBLIC en prod) → deny-all après bascule
    sect_app (pattern 000117).
15. **Pas d'index** sur (statut ACTIF, createdAt) → seq scan sur les
    compteurs et listes.

## Décision

### 1. Source de vérité unique : le score santé calculé côté BACKEND

Nouveau `internal/monitoring/score.go` — `ComputeScore(Inputs)` retourne
`{Score, Verdict, Breakdown[]}`, consommé par :

- `GET /api/monitoring/overview` (nouveau) ;
- `GET /api/stats/admin` (nouveau champ `health` dans la réponse) — la carte
  du dashboard affiche la valeur backend, plus de formule client.

**Formule v2** (corrige la pénalité perpétuelle — les KPIs SecuritySettings
sont dorénavant réels et deviennent des bonus/malus mesurés) :

```
score = 100
  − 5 × CRITICAL actifs        (plafond −30)
  − 2 × ERROR actifs           (plafond −20)
  − 0,5 × WARNING actifs       (plafond −10)
  − 1 × autorisations en attente (plafond −10)
  − 10 si latence DB > 1 s ; −30 si DB indisponible
  − 10 si 0 provider IA actif
  borné [0, 100]
```

Chaque composant est retourné dans `breakdown[]` (label, pénalité, détail)
→ la carte affique un score, /monitoring affiche le détail. Même chiffre,
même formule, deux niveaux de lecture.

### 2. Migration 000132 — durcissement MonitoringEvent

- Index partiel `(createdAt DESC) WHERE statut='ACTIF'` (compteurs + listes).
- Normalisation des 3 policies **TO PUBLIC** (pattern 000117) :
  `select` USING is_admin(), `insert` WITH CHECK (is_system() OR is_admin()),
  `modify` FOR ALL is_admin() — désamorce la mine sect_app.
- Helper SECURITY DEFINER `admin_securite_etablissements_counts()` (re-check
  claims is_admin, pattern 000130/000131) : compte réels des établissements
  proctoringActif / verificationIdentite → alimente
  `nbEtablissementsProteges`/`nbVerificationIdentite` (statsAdmin + overview).
- ASSERTs de contrôle (pattern 000127).

### 3. GET /api/monitoring/overview — le tableau de bord système

Réponse : `score{score,verdict,breakdown[]}`, `kpis{activeEvents,
criticalEvents, errorEvents, warningEvents, resolvedToday, resolved24h,
autorisationsEnAttente, autorisationsActives, etablissementsProteges,
verificationIdentite}`, `runtime{uptimeSeconds, goVersion, goroutines,
numCPU, memAllocMB, memSysMB, numGC, gcPauseTotalMs}`, `db{status,
latencyMs, activeConns}`, `storage{configured, reachable, bucket}`,
`ai{providersActifs}`, `maintenance{active, message}`, `workers[]`,
`trend[7 jours par sévérité]`, `generatedAt`.

Caveat documenté : la tendance est calculée sur MonitoringEvent (les RESOLU
> 24 h sont purgés par le lazy cleanup → les jours passés sous-comptent les
événements résolus entre-temps).

### 4. Registre de workers + boucles instrumentées

- `internal/monitoring/registry.go` : `WorkerRegistry` (in-memory, nil-safe,
  mutex) — nom, libellé, intervalle, runs, erreurs, lastRunAt,
  lastDurationMs, lastError, startedAt.
- Les **7 workers périodiques** (autoClose 60 s, relance 6 h, expire 1 h,
  cleanup 24 h, promotion 10 s, purge biblio 1 h, similarité 5 min)
  instrumentés via `reg.Track(name, fn)` : mesure durée, catch panique
  (recover → l'événement SYSTEM/ERROR est enregistré, la boucle CONTINUE —
  avant, une panic tuait le process), enregistre l'échec.
- Les 6 workers de file (IA, correction, docAnalyzer, practice, homework,
  audio) sont **enregistrés** (visibilité « file événementielle ») — leur
  état métier vit déjà dans leurs tables de jobs (statut ERREUR,
  AIFailoverEvent).

### 5. Corrections de vérité (fini les chiffres inventés)

- POST escalade : `details` accepté objet **ou** string (marshal JSON) →
  répare le 400 systématique.
- PATCH resolve : `notes` optionnel persisté dans `details`
  (`{"resolutionNotes": "…"}` fusionné).
- Middleware : la latence mesurée est enfin envoyée dans `duree`.
- Healthcheck : suppression des uptime hardcodés → status + latence
  mesurée + lastError + `activeConns` (DB) — champ uptime conservé pour
  compat mais vide.
- Frontend : le panneau « Règles d'alertes » factice est remplacé par des
  **seuils système réels** dérivés d'overview (critiques actifs, erreurs
  actives, backlog autorisations, latence DB, providers IA, workers en
  erreur) avec état franchi/atteint/OK.

### 6. CRITICAL muet → notifié

`Recorder.OnCritical` (hook nil-safe) : après INSERT réussi d'un CRITICAL,
le hook (câblé dans main.go) notifie les ADMIN actifs via le dispatcher
existant (in-app + SSE + push + email selon préférences), throttle 15 min.

### 7. Liste d'événements : pagination + fenêtre temporelle

`GET /api/monitoring` : `page`/`pageSize` (défaut 100, max 500) + `total`
(COUNT même WHERE) + `since` (heures, filtre createdAt) ; stats étendues
`warningCount` + `resolvedToday` + `resolved24h`. Le lazy cleanup 24 h est
conservé.

### 8. Frontend

- **Carte santé dashboard** : valeur backend (`stats.health`), breakdown
  compact, bouton « Monitoring » → /monitoring.
- **/monitoring** réorganisé en 4 onglets : Événements (pagination + filtre
  période), Services (cartes réelles sans uptime fake), **Système**
  (runtime Go, workers, DB, stockage R2, IA, maintenance, tendance 7 j),
  Alertes (alertes actives + seuils système réels).

## Conséquences

- Le score affiché dashboard = score /monitoring = formule unique backend,
  auditable et versionnée dans le code.
- Les workers périodiques deviennent panic-safe (résilience accrue) et
  observables (runs/erreurs/dernière exécution).
- L'ADMIN gagne une vue système complète sans quitter la console.
- La rétention RESOLU 24 h (lazy cleanup) reste le plafond de l'historique —
  une vraie rétention/agrégation quotidienne persistée est notée pour P5.
- Non-couvert (noté) : règles d'alerte configurables persistées, métriques
  p50/p95 par endpoint (nécessiterait une table ApiLatency), alerting
  externe (email/Slack dédié).

## Livrables

- Migration 000132 (index + policies TO PUBLIC + helper counts + ASSERTs)
- internal/monitoring : score.go, runtime.go, registry.go, recorder.go
  (+OnCritical), healthcheck.go (honnête), middleware.go (duree)
- transport/http : monitoring_overview_handlers.go (nouveau),
  stub_handlers_real2.go (pagination/since/stats), monitoring_mutation_handlers.go
  (details objet, notes), stats_handlers.go (health + KPIs réels), router.go
- 7 workers périodiques instrumentés + main.go (registre, hook CRITICAL)
- frontend : admin-dashboard.tsx (carte alignée), monitoring-page.tsx
  (4 onglets, seuils réels, pagination)
