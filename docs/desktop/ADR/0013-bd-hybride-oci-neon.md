# ADR-0013 : Étude BD hybride — Neon serverless (source de vérité) × OCI Always Free (réplique de lecture / DR tier)

| Champ | Valeur |
|---|---|
| **Statut** | Proposé — étude complète livrée + **complément d'expertise §10** (mesures du 10/10 soir, §7 exécuté) ; vérifications console en attente (§10.4-R2) |
| **Date** | 10 octobre 2026 (complément §10 : même jour, soir) |
| **Décideurs** | Ulrich EVRARD (exploitant), Z.ai Code (tutorat) |
| **Parent** | ADR-0006 (migration backend OCI), ADR-0012 (monitoring p50/p95), runbook §3.6/§3.7 (bascules P2), SECT-FAILOVER-1/2 |

## 1. Question posée

Le double backend hybride (OCI primaire + Render standby, bascules P2 exécutables)
étant consolidé : faut-il construire une **base de données PostgreSQL hybride**
alliant « la puissance d'OCI Always Free » et « la stabilité serverless de Neon »
pour donner à SECT scalabilité, résilience et faible latence ?

Réponse courte : **oui, mais pas dans le sens que l'intuition suggère**. L'étude
chiffrée ci-dessous montre que le bon patron n'est pas « deux bases qui se
partagent le travail », ni « la base sur la VM puissante », mais
**Neon en source de vérité unique + OCI en réplique de lecture / plan de
reprise décorrélé** — déployé par phases, en commençant par ce qui rapporte
90 % du bénéfice pour 5 % du coût.

## 2. Données mesurées (2026-10-10, sonde lecture seule via pgx/v5)

### 2.1 Côté Neon (DSN direct, eu-central-1)

| Mesure | Valeur | Conséquence pour l'étude |
|---|---|---|
| Région | **eu-central-1 (AWS Francfort)** | Neon est déjà EN EUROPE, à ~1 100 km de la VM |
| Version | PostgreSQL 18.6, arch **aarch64** | Réplique OCI à monter en PG 18.x (pgdg, arm64 natif) |
| Taille base `neondb` | **24 Mo** (25 034 752 octets) | Volume dérisoire : réplication lag attendu ≈ 0 ; le cache de n'importe quel serveur avale toute la base |
| Tables (schéma public) | 85 | — |
| Tables SANS clé primaire | **0 sur 85** | Prérequis réplication logique natif : OK sur toutes les tables |
| RLS | **85/85 tables actives, 233 policies** | Vérifié : mécanique `SET LOCAL app.claims.*` (PostgreSQL standard) — **aucune extension propriétaire requise** |
| `pg_session_jwt` | Installée mais **non référencée** dans le code backend (vérifié) | Pas de verrou de portabilité vers un PG self-hosted |
| `wal_level` | **`replica`** (pas `logical`) | La réplication logique exige l'activation dans la console Neon — **irréversible** (cf §5.4) |
| Slots / max | 2 internes Neon (`wal_proposer_slot`, `wal_retention_slot`) / **10** | 8 slots disponibles ; les 2 existants sont internes (ne pas toucher) |
| `max_slot_wal_keep_size` | -1 (illimité) | Un abonné OCI arrêté des semaines retient des WAL → surveiller/dropper le slot (cf §5.4) |
| Rôle | `neondb_owner` (non-superuser) | Standard Neon : suffit pour CREATE PUBLICATION (owner des tables) |
| Top tables | RequestLog 4 074 lignes / 704 Ko ; AuditLog 2 680 / 1,1 Mo ; RefreshToken 1 653 / 1,1 Mo | Profil actuel : base de dev/démo — la volumétrie cible (5 000 étudiants, ADR-0006) reste à venir |
| RTT applicatif (référence) | 170 ms depuis la sandbox (Hong Kong) | Non représentatif d'OCI — sert de plancher de comparaison géographique |

### 2.2 Côté OCI

| Mesure / fait | Valeur | Source |
|---|---|---|
| Localisation VM | **Marseille** (84.235.228.160, AS31898 Oracle) | géoloc IP |
| Shape documentée | **VM.Standard.A1.Flex 4 OCPU / 24 Go** (ARM64) | ADR-0006, HANDOFF-INSTALL-BACKEND |
| ⚠️ Quota Always Free **réduit mi-2026** | ~~Ampere A1 : 4 OCPU/24 Go → 2 OCPU / 12 Go~~ **✅ RÉSOLU (§10.2)** : la console de la tenancy affiche l'enveloppe INTÉGRALE 3 000 OCPU-h + 18 000 GB-h/mois (= 4 OCPU/24 Go) | console OCI (message exploitant, 10/10) |
| Charge actuelle VM | sect-api (14 workers) + Caddy + OS — utilisation réelle non mesurée cette session (pas de SSH) | Annexe A du kit (E4 : limites cgroups à vérifier) |
| Bloc Storage gratuit | 200 Go totaux (boot volumes inclus) | doc Oracle (inchangé) |
| Object Storage gratuit | ~10 Go standard + 10 Go archive | doc Oracle |
| RTT estimé Marseille ↔ Neon Francfort | **≈ 15-25 ms** (estimation géographique, à mesurer en phase 0) | ~1 100 km fibre + routage IP |

### 2.3 Chemins publics mesurés (depuis Hong Kong — vécu « pire cas » géographique)

| Chemin | TTFB mesuré | Lecture |
|---|---|---|
| `sect.ftci.fr/api/health` (Vercel edge → rewrite → OCI) | 650-960 ms | Edge HK proche (connect 15-20 ms) + saut intermédiaire vers Marseille + retour |
| `api.sect.ftci.fr/health` (OCI direct, Caddy) | 557-583 ms dont connect 190 ms | Cohérent : 3 RTT HK↔Marseille (TCP + TLS 1.3 + requête), **le handler `/health` est statique et ne touche PAS la base** |

Le RTT qui compte pour l'étude (OCI→Neon) ne peut pas être mesuré depuis la
sandbox : à mesurer en phase 0 depuis la VM (une requête chronométrée suffit).

### 2.4 Plans Neon 2026 (pour situer le plafond de croissance)

| Plan | Inclusions | Limite qui nous concerne |
|---|---|---|
| Free | 100 CU-heures/mois, 0,5 Go storage/projet, autoscale ≤ 2 CU, PITR 6 h | **14 workers en continu + API = le compute ne dort jamais** → 100 CU-h tiennent ~14 jours à 0,25 CU en continu. Le plan courant du projet est À CONFIRMER (console Neon → Billing) |
| Launch | ~5 $/mois mini, $0,14/CU-h, PITR 7 j | — |
| Scale | $0,222/CU-h, storage $0,35/Go-mois, PITR 30 j | Répliques de lecture gérées (même région) |

## 3. Ce que chaque plateforme apporte UNIQUEMENT

| Atout | Neon | OCI Always Free |
|---|---|---|
| **Calcul colocalisé avec la base** | — | ✔ (API/workers et PG sur la même VM : latence locale < 1 ms) |
| **Storage découplé du compute (pageservers)** | ✔ (le compute peut mourir sans perdre les données ; scale-to-zero ; cold start ~0,5 s) | — (le stockage bloc meurt/résiste avec la VM) |
| **PITR + backups gérés** | ✔ (6 h → 30 j selon plan) | — (à outiller soi-même : pg_dump/WAL archiving) |
| **Branching instantané (copie-sur-écriture)** | ✔ (preview/dev/tests) | — |
| **Ops zéro (upgrades, tuning, failover du compute)** | ✔ | — (tout est manuel) |
| **Contrôle total (extensions, pg_cron, réglages)** | limité | ✔ |
| **Coût marginal** | CU-heures au-delà du plan | 0 € (mais quota désormais 2 OCPU/12 Go) |
| **Souveraineté / données en France** | non (Frankfurt, AWS) | ✔ (Marseille) |
| **Disponibilité intrinsèque** | SaaS multi-locataires (incidents rares mais déjà vus : sonde P1 en existe car la VM meurt) | **SPOF assumé** : une VM, une tenancy, redémarrages UEFI vus au cutover |

**Le fait structurant** : chez SECT, la VM OCI est le maillon **le plus fragile**
(pannes matérielle/SSH vues, leçon N°282, sonde P1 et bascules P2 construites
pour ça). Neon est le maillon **le plus solide** (données survivent au compute).
Toute architecture qui déplace la source de vérité vers le maillon fragile
inverse la résilience du système.

## 4. Architectures envisagées — analyse et verdict

### 4.1 Option A — « Actif-actif » : écritures des deux côtés, réplication bidirectionnelle

**Verdict : ÉCARTÉ sans examen supplémentaire.**
La réplication logique bidirectionnelle PostgreSQL ne résout pas les
conflits (dernier écrivant gagne par ligne, pertes silencieuses possibles),
et les séquences divergent immédiatement. C'est la leçon « jamais deux
primaires » du runbook §4 appliquée à la base — mais avec des conséquences
de corruption de données au lieu d'un simple double-traitement.

### 4.2 Option B — Primaire PostgreSQL self-hosted sur OCI, Neon en standby

**Verdict : ÉCARTÉ.** Arguments mesurés :

1. **Concentration du risque** : données = stockage bloc attaché à LA VM qui
   crève périodiquement (la sonde P1 et les bascules P2 existent précisément
   parce que cette VM meurt). On échangerait un stockage Neon distribué et
   survivant contre un disque de VM.
2. **Perte des avantages Neon** : plus de PITR, plus de branching, plus
   d'ops gérées ; à la place : pg_dump manuels, upgrades de version majeure
   manuels (18.x → 19 futurs), tuning, surveillance WAL, test de restore.
3. **Ressources** : la VM partage déjà 14 workers + API + Caddy ; PostgreSQL
   en production réclame ses propres Go de RAM (shared_buffers,
   work_mem, connections) — dans une enveloppe Always Free désormais
   réduite à 2 OCPU/12 Go si la tenancy doit redescendre (cf §2.2 ⚠️).
4. **Le gain visé n'existe pas** : la latence OCI→Neon est ≈ 15-25 ms
   (Francfort). Un endpoint qui fait 5 requêtes séquentielles paie ~100 ms
   — c'est optimisable par batch applicatif (§4.4), pas en risquant la
   source de vérité.
5. **Le failover P2 actuel devient incohérent** : Render (standby API) ne
   serait plus utilisable si la base est morte avec la VM — on détruirait
   la chaine de secours P1/P2 en déplaçant le point de défaillance.

### 4.3 Option C — Neon = source de vérité, OCI = réplique logique de lecture + DR tier

**Verdict : RETENUE (par phases, §6).** C'est le seul patron qui additionne
les forces sans additionner les faiblesses :

- Neon garde **exactement** son rôle actuel (écritures, RLS, migrations,
  PITR, branching) : zéro changement pour l'application, zéro risque
  de régression sur le chemin critique.
- OCI reçoit une **réplique à jour en continu** (base de 24 Mo → lag
  attendu en secondes, voire sub-seconde) qui sert :
  1. **lectures analytiques/lourdes locales** (exports PDF, agrégats
     monitoring, RequestLog/AuditLog) sans consommer de CU-heures Neon
     ni ajouter le RTT réseau ;
  2. **plan de reprise (DR) décorrélé du fournisseur** : si Neon
     (région/compte/service) a un incident majeur, la donnée vit aussi à
     Marseille — promotion en écriture en ~15-30 min (RTO), perte = lag
     de réplication (RPO ≈ secondes) ;
  3. **sécurité des données** : copie physique sous contrôle direct,
     chiffrable, en France.
- Le flux de réplication est **initié par OCI vers Neon en sortie seule**
  (CREATE SUBSCRIPTION côté OCI se connecte au DSN direct Neon) :
  **aucun port de base à exposer sur la VM**, la surface d'attaque
  n'augmente pas. C'est le sens de réplication le plus sûr possible.

### 4.4 Option D — Optimisation applicative pure (complémentaire, pas exclusive)

Le levier n°1 de la latence SECT n'est pas la topologie de la base, c'est le
**nombre d'allers-retours** : pgx supporte le batching (`pgx.Batch`,
`SendBatch`) et le pipelining — 5 requêtes séquentielles à 20 ms de RTT
(100 ms) deviennent 1 aller-retour (~22 ms). Couplé au pooling déjà en place
(pooler Neon) et, si besoin, à un cache lecture Go en mémoire (la base
entière fait 24 Mo — le cache applicatif des lectures chaudes est trivial),
ce patron résout la plupart des objectifs « latence » **sans aucune
nouvelle infrastructure**. À faire quoi qu'il arrive — il rentabilise
l'option C en réduisant la charge sur la réplique.

### 4.5 Option E — Renforcement Neon natif (l'alternative simple)

Si l'objectif est uniquement la **scalabilité de lecture** : les plans Neon
payants fournissent des **read replicas gérées dans la même région**
(pas cross-cloud — Neon ne fournit pas de réplique gérée chez Oracle).
Moins de travail, zéro ops, mais : pas de DR décorrélé (tout reste chez
Neon), pas de localisation Marseille, coût CU-heures, et le plan courant
du projet reste à confirmer (§2.4). C'est l'option de repli si la phase 0
révèle que la réplication logique est contre-indiquée.

### 4.6 Matrice multicritère

| Critère | A. Actif-actif | B. Primaire OCI | C. Neon + réplique OCI | D. Batch/cache | E. Réplicas Neon |
|---|---|---|---|---|---|
| Scalabilité écriture | ✖ (corruption) | ✔ mais fragile | ✔ (Neon autoscale) | n/a | ✔ |
| Scalabilité lecture | ✖ | ✔ | ✔✔ (locale + Neon) | ✔ (réduit la demande) | ✔ |
| Résilience données | ✖✖ | ✖ (SPOF VM) | **✔✔ (deux fournisseurs, deux pays)** | ✔ (inchangé) | ✔ (un fournisseur) |
| Latence lecture locale | — | ✔✔ | ✔ (analytics) | ✔✔ (batch) | — |
| Charge ops ajoutée | énorme | énorme | **modérée (1 souscription à surveiller)** | nulle | nulle |
| Impact chemin critique | fatal | élevé | **nul (Neon inchangé)** | nul | nul |
| Coût | — | 0 € | 0 € | 0 € | $ |
| Cohérence P1/P2 | contredit | détruit le failover | **étend (§3.8 futur)** | neutre | neutre |
| Sécurité (ports exposés) | pire | 5432 à exposer | **aucun (sortie seule)** | nul | nul |
| Réversibilité | — | douloureuse | **totale (drop slot + sub)** | nulle | facile |

## 5. L'option C en détail — mécanique, pièges, sécurité

### 5.1 Mécanique (littéralement 4 commandes côté OCI une fois le schéma posé)

```sql
-- Côté Neon (après activation §5.4) : publier ce qu'on réplique
CREATE PUBLICATION sect_read FOR TABLE "RequestLog", "AuditLog", ...;

-- Côté OCI (PostgreSQL 18 self-hosted, schéma déjà posé par golang-migrate) :
CREATE SUBSCRIPTION sect_from_neon
  CONNECTION 'host=<neon-direct> ... sslmode=require'
  PUBLICATION sect_read
  WITH (copy_data = true, enabled = true);
```

### 5.2 Ce qui se réplique / ce qui ne se réplique PAS (pièges PostgreSQL)

| Objet | Répliqué ? | Impact SECT / parade |
|---|---|---|
| Lignes INSERT/UPDATE/DELETE | ✔ | Fonctionne car **100 % des tables ont une PK** (mesuré §2.1) |
| **DDL (ALTER TABLE…)** | ✖ | Les **134 migrations** doivent être rejouées côté OCI (golang-migrate, DSN de la réplique) ; toute nouvelle migration devra être appliquée des deux côtés (checklist §6 phase 2) |
| **Séquences** (nextval) | ✖ | **Piège n°1 de toute promotion DR** : à la promotion, resynchroniser chaque séquence (`setval('X', max(id)+marge)`) — script à écrire en phase 3, pas à la hâte pendant l'incident |
| Policies RLS | ✖ (mais recréées par les migrations rejouées) | OK : le schéma réplique = schéma des migrations = RLS identique. Le worker d'apply de la souscription écrit en tant que propriétaire de la table (bypass RLS standard) — comportement voulu |
| TRUNCATE | ✔ (PG 18) | — |
| Grandes valeurs (TOAST) | ✔ | — |

### 5.3 Risque de dérive silencieuse : surveiller, pas croire

- **Lag** : `pg_stat_subscription` (côté OCI) + sonde dans le module
  /monitoring existant (ADR-0011/0012) — le lag de SECT sera minuscule
  (24 Mo), donc toute dérive est un signal d'incident, pas un bruit.
- **Slot abandonné** : si la VM OCI reste hors ligne des semaines, le slot
  côté Neon retient des WAL (storage facturé au plan, `max_slot_wal_keep_size=-1`
  mesuré) → règle d'or : si le POC est abandonné, **DROP SUBSCRIPTION côté OCI
  puis DROP PUBLICATION + slot côté Neon** (jamais l'inverse, jamais à moitié).
- **Contrôle d'intégrité périodique** : comparaison mensuelle `count()` sur les
  tables répliquées + checksum par table (la taille le rend trivial).

### 5.4 Points de décision irréversibles ou à assumer

1. **`wal_level=logical` sur Neon** : activation dans la console
   (Settings → Logical Replication), redémarrage du compute — et **le retour
   à `replica` n'est pas possible** ensuite. C'est un engagement définitif
   (sans conséquence fonctionnelle connue, mais à décider en connaissance).
2. **Plan Neon courant à confirmer** (§2.4) : si le projet est encore en Free,
   les 14 workers en continu consomment le quota — la question du plan se
   pose de toute façon, indépendamment de cet ADR.
3. **⚠️ Facturation VM** : la VM documentée est 4 OCPU/24 Go ; le quota gratuit
   Ampere A1 est passé à **2 OCPU/12 Go mi-2026** (sans annonce). À vérifier
   dans la console OCI (Billing) : si l'enveloppe existante doit être
   rabotée, la place pour un PostgreSQL colocalisé se réduit d'autant —
   ça n'invalide pas l'option C (24 Mo !) mais à savoir AVANT.

### 5.5 Ce que l'option C n'apporte PAS (limites honnêtes)

- **Pas de bascule automatique de la base** : la promotion OCI est un geste
  d'exploitation (runbook §3.8 à écrire), cohérent avec la philosophie du
  projet (bascules manuelles approuvées — jamais d'auto-failover DB sur
  décision d'un seul côté du réseau).
- **Pas de scalabilité d'écriture** : une seule primaire (Neon). C'est une
  limite saine pour SECT (l'écriture multi-primaire est le chemin de la
  corruption, §4.1).
- **Pas une réplique pour Render** : Render (standby API) lirait aussi Neon
  — on ne duplique pas la réplique (le DR tier est Marseille, point).

## 6. Décision proposée : adoption progressive, chaque phase est un livrable autonome

### Phase 0 — Validation des hypothèses (30 min, bloquante pour la suite)
- [ ] Confirmer le **plan Neon courant** (console → Billing) et l'usage CU-h.
- [ ] Vérifier la **facturation OCI** post-réduction du quota (VM 4/24 → 2/12 ?) et la place réelle libre sur la VM (`free -h`, `docker stats` — prochaine fenêtre SSH, Annexe A E4).
- [ ] Mesurer le **RTT réel OCI→Neon** (une requête chronométrée via psql depuis la VM).
- [ ] Extraire les **p50/p95 par endpoint** du module /monitoring (ADR-0012) pour cibler les endpoints à batcher (option D) ou à délester (option C).

### Phase 1 — Backups décorrélés (le gain maximal par euro d'effort, faisable immédiatement)
- [ ] `pg_dump` nightly de Neon (depuis la VM, ~24 Mo = secondes) chiffré (age/gpg) vers **Object Storage OCI Always Free** (~20 Go gratuits) avec rétention glissante 30 jours.
- [ ] **Test de restauration mensuel** documenté (un backup non testé n'existe pas).
- → Résilience fournisseur acquise pour ~5 % de l'effort de l'option C complète. Ne dépend d'aucune décision irréversible.

### Phase 2 — POC réplication logique (3 tables, réversible)
- [ ] Activer `wal_level=logical` côté Neon (irréversible — cf §5.4).
- [ ] PostgreSQL 18 (pgdg arm64) sur la VM + schéma posé par golang-migrate (DSN local).
- [ ] Publication limitée à `RequestLog`, `AuditLog`, `Reponse` + souscription OCI.
- [ ] Mesurer : lag, charge ajoutée sur la VM, ingérence nulle sur l'API (les lectures de prod ne changent PAS).
- [ ] Checklist migration double-cible (toute migration future : Neon puis réplique).

### Phase 3 — Si le POC est concluant : lectures locales + DR runbook
- [ ] Lectures analytiques locales derrière feature flag (endpoints exports/agrégats seulement).
- [ ] **Runbook §3.8 « Reprise sur réplique OCI »** : garde de santé, promotion, **resync des séquences** (script préparé), bascule des DSN (API+workers vers la base locale), alerte Discord, et procédure de RETOUR vers Neon (réplication inverse :OCI publie → Neon souscrit) — le miroir exact de la symétrie §3.6/§3.7 des bascules API.
- [ ] Exercice DR trimestriel en conditions réelles (rehearsal), comme un failback P2.

## 7. Découverte annexe de l'étude — trous à part entière

En mesurant les chemins, l'étude a mis au jour un trou dans la garde P1 :
**le handler `/health` est statique** (ne touche pas la base) — donc si Neon
tombe, la sonde P1 reste verte alors que tous les endpoints métier échouent.
Recommandation indépendante de cet ADR (à intégrer à SECT-UPTIME-PROBE) :
ajouter un `GET /api/health/db` (ping `SELECT 1` avec timeout 2 s, sans
authentification, sans détail) et l'inclure dans la sonde — le RPO de
détection d'une panne Neon passe alors de « jamais détecté » à ≤ 5 min.

> **✅ EXÉCUTÉ le 10/10 soir (SECT-HEALTH-DB-1, commit cac75ba6)** : endpoint
> déployé sur OCI + Render, vérifié sur les 3 chemins (public/direct/standby),
> sonde pointée dessus — voir §10.1. `/health` reste statique par conception
> (healthCheckPath Render + HEALTHCHECK Docker = sémantique process-alive,
> jamais de restart-loop sur panne DB).

## 8. Anti-décisions explicites (ce que cette ADR refuse)

1. **Jamais deux primaires en écriture** (option A) — corruption silencieuse possible.
2. **Jamais la source de vérité sur la VM OCI** (option B) — le maillon le plus fragile du système ne doit pas porter les données.
3. **Jamais de port PostgreSQL exposé publiquement** — le sens de connexion retenu (OCI abonné → Neon éditeur) n'expose rien.
4. **Pas d'auto-failover DB** — toute promotion est humaine, approuvée, avec runbook (symétrie P2).
5. **Pas de réplication « au cas où » sans surveillance** — un slot abandonné coûte du storage et une fausse confiance.

## 9. Conséquences si adopté

- **Positives** : DR fournisseur (RPO ≈ secondes, RTO ~15-30 min) ; lectures
  analytiques locales ; zéro changement du chemin critique ; coûts 0 € ;
  cohérence totale avec la philosophie P1/P2 (couches de secours approuvées).
- **Négatives/risques** : +1 service à surveiller sur la VM (modéré) ;
  migrations à appliquer double-cible (checklist) ; engagement
  `wal_level=logical` irréversible côté Neon ; phase 3 exige un runbook
  sérieux (séquences !).
- **Si rejeté** : les phases 1 (backups) et l'option D (batch/cache) restent
  recommandées seules — elles couvrent la résilience minimale et la latence
  sans aucune des contreparties.

---
*Références mesurées en §2 — toute décision devrait reprendre la phase 0
avant engagement (notamment la ⚠️ facturation VM post-réduction du quota
Always Free mi-2026).*

---

## 10. Complément d'expertise — SECT-DB-HYBRID-3 (10 octobre 2026, soir)

Session de tuteurat demandée par l'exploitant : analyse approfondie **par le
code et par les données DB** pour un système de BD hybride résilient (EdTech
africaine), **aucune décision sans vérification console**. Ce complément met
à jour l'ADR avec les mesures du soir et reformule les propositions.

### 10.1 Mesures nouvelles (production + audit lecture seule `ops/db/neon_audit`)

| Mesure | Valeur | Impact |
|---|---|---|
| Ping VM→Neon via `/api/health/db` (direct, pool) | **20 ms** | Confirme l'estimation §2.2 (15-25 ms) |
| Idem via chemin public (Vercel→OCI→Neon) | 40 ms | Chemin utilisateur réel, pool inclus |
| Ping Render→Neon (`/api/health/db` standby) | **4 ms** | Le standby Render (Francfort) est ~5× plus proche de la DB que le primaire (Marseille) — toute bascule P2 **améliore** la latence DB |
| Redémarrage compute Neon | 2026-10-09 22:20:13 UTC (20 h 42 d'activité continue depuis) | **Cause inconnue** — reprise de suspension quota ? maintenance ? → question console n°1 |
| Débit depuis redémarrage | 11,88 tx/s (885 492 tx / 20,7 h) | Dominé par monitoring interne Neon + workers + health-checks pool — le trafic applicatif réel n'est que ~800 req/j |
| Trafic applicatif (RequestLog 7 j) | 4 868 req, ~811/j en moyenne (81→2 530/j, très variable) | Base pré-revenu confirmée |
| Ancienneté projet (AuditLog) | depuis **2026-06-06** (~4 mois) | Les workers tournent 24/7 depuis des mois → l'historique console dira si le quota a déjà suspendu |
| Séquences | **1 seule** (BIGSERIAL migration 000133, monitoring) | Resync de promotion DR = trivial (1 `setval`) |
| `/api/health/db` | **Déployé et vérifié** (OCI + Render + sonde, run #7 vert) | Recommandation §7 EXÉCUTÉE (SECT-HEALTH-DB-1, commit cac75ba6) |

### 10.2 Hypothèses résolues par l'exploitant (10/10)

- **Quota OCI Always Free** : la console de la tenancy affiche
  « 3 000 OCPU-h + 18 000 GB-h/mois (équivalent 4 OCPU / 24 Go) » —
  l'enveloppe INTÉGRALE reste disponible. La ⚠️ §2.2 (réduction mi-2026)
  ne s'applique PAS à cette tenancy → l'argument n°3 contre l'option B
  (ressources insuffisantes) disparaît.
- **Plan Neon** : Free 100 CU-h confirmé, objectif **0 coût** jusqu'à des
  revenus stables.

### 10.3 La tension critique quantifiée (le mur CU-h)

Le modèle `ops/db/cu_model.py` (code-preuve) + les mesures du soir :

- Workers (promotion **10 s**, auto_close 60 s, alerting 120 s…) + pool pgx
  (HealthCheckPeriod 30 s, MinConns 5) maintiennent le compute éveillé 24/7 —
  **preuve structurelle par le code** (aucun intervalle ≥ 5 min possible)
  **+ preuve empirique** (plus ancienne connexion : 20 h 42, aucune suspension).
- Besoin : 730 h × 0,25 CU = **182,5 CU-h/mois** vs **100 inclus** (Free).
- **Si la limite est appliquée strictement** → mur vers le ~17ᵉ jour du cycle
  → ~13 jours/mois de DB suspendue ; pire cas métier : suspension **en plein
  examen** (S3 du modèle : autoscale ≤ 2 CU = burn ×8).
- **Contradiction à résoudre par la console** : le projet tourne 24/7 depuis
  ~4 mois sans incident de suspension rapporté — soit l'application de la
  limite diffère des docs 2026 (laxité, seuil différent, taille CU différente),
  soit des suspensions ont déjà eu lieu sans être attribuées (le redémarrage
  du 10-09 22:20 en est-il une ?). **C'est LA question que la console Neon
  doit trancher avant toute décision.**

### 10.4 Propositions (en attente des vérifications console)

**R1 — Backups Phase 1 (§6) : à exécuter dans TOUS les scénarios.**
Trou n°1 actuel : aucune sauvegarde décorrélée de Neon n'existe. Design
affiné : cron **sur la VM** (pas GitHub Actions — les schedules sont cassés,
SECT-UPTIME-PROBE-3), `pg_dump` (24 Mo = secondes) chiffré `age` vers Object
Storage OCI, rétention glissante 30 j, **test de restauration mensuel**
documenté. RPO 24 h (option horaire : trivial en volume). Ne dépend d'aucune
décision de cet ADR.

**R2 — Vérifications console (bloquantes) — accès demandés à l'exploitant :**
1. **Neon** : API key (console.neon.tech → Account → API keys) → vérifier
   plan réel, consommation CU-h du cycle en cours + projection fin de mois,
   historique de suspension, taille CU réelle du compute, usage storage.
2. **VM OCI** : accès SSH (utilisateur + clé privée) → ressources réelles
   (`docker stats`, `free -h`, disque libre), RTT VM→Neon mesuré depuis la
   VM, et alignement opportuniste E1-E4 (Annexe A du kit VM).

**R3 — Si le mur CU-h est confirmé réel : trois chemins :**
- **N1 Réduction de veille** : ≤ 13,2 h/jour d'activité MAXIMUM au total
  (100 CU-h ÷ 0,25 CU ÷ 30,4 j) — imposerait des cadences nocturnes ≥ 30 min
  ET un plafond diurne → incompatible avec l'alerting 2 min pendant les
  examens. **À peine viable — écarté sauf impossibilité des alternatives.**
- **N2 Neon Launch** (~5-19 $/mois selon usage) : rompt l'objectif 0-coût —
  décision exploitant, naturelle aux premiers revenus.
- **N3 Inversion hybride (variante B')** : PostgreSQL primaire sur la VM
  (latence sub-ms, 0 €, enveloppe 4/24 confirmée §10.2) + **Neon conservé
  comme DR froid** (endpoint suspendu = 0 CU-h consommé ; les 100 CU-h du
  plan couvrent ~16 jours de secours continu en urgence) + backups R1 +
  runbook de promotion inversée (miroir §3.8). Les arguments structurels
  contre B (§4.2) tiennent : SPOF combiné app+DB (RTO ~1 h vs minutes
  aujourd'hui, RPO = dernière sauvegarde), et la place réelle côté VM doit
  être vérifiée (compose API 3,5 CPU/20 Go — R2). C'est un compromis
  **d'exploitant** (risque données vs coût), pas un choix technique — à ne
  faire que si le mur est confirmé ET l'objectif 0-coût maintenu.

**R4 — Option D (batch pgx / `SendBatch`)** : levier latence du chemin
critique — chaque transaction RLS coûte 3-4 allers-retours (~60-160 ms à
20-40 ms le RTT mesuré) ; le pipelining les réduit à 1. À faire dans tous
les cas (rentabilise C comme N3).

**R5 — Phase 2 réplication logique** : inchangée (décision séparée,
post-vérifications). Les mesures du soir la **facilitent** (1 séquence,
85/85 PK, 24 Mo, lag attendu ≈ 0) sans la rendre **urgente** (~800 req/j).

### 10.5 Anti-décisions inchangées (§8) + ajout

6. **Aucune bascule de primaire DB ne se fera sur la seule lecture de ce
   document** — les vérifications console (§10.4-R2) sont un prérequis
   explicite posé par l'exploitant.
