# ADR-0013 : Étude BD hybride — Neon serverless (source de vérité) × OCI Always Free (réplique de lecture / DR tier)

| Champ | Valeur |
|---|---|
| **Statut** | Proposé — §10-11 expertises/vérifications console ; **M1 DÉCIDÉE (exploitant, 10/10) et IMPLÉMENTÉE en prod (11/10, commit 0feee790, §12)** ; **mode « à la demande » + plancher jour + sonde grille DÉCIDÉS (exploitant, 10/10) et LIVRÉS en prod (10-11/10, commit 054efa7f, §13)** ; §14 : projection capacité 5×2 000 étudiants (question exploitant — analyse chiffrée, aucune exécution) ; **§15 : phases 0-1 (backups chiffrés + alerte taille) DÉCIDÉES (exploitant, 11/10 — D1-D10) et LIVRÉES (11/10) : outillage + workflows + migration 000135 APPLIQUÉE (Neon 135), mise en service exploitant en cours (runbook)** ; phase 2 = décision séparée |
| **Date** | 10-11 octobre 2026 (§10 : soir ; §11 : vérifications console ; §12 : 11/10, M1 livrée ; §13 : 10-11/10, mode « à la demande » + plancher jour + sonde grille livrés ; §14 : nuit du 10/10, projection capacité ; §15 : 11/10, phases 0-1 exécutées) |
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

---

## 11. Vérifications console — SECT-DB-HYBRID-4 (10 octobre 2026, soir tard)

L'exploitant a fourni les deux accès demandés en §10.4-R2 : **API key Neon**
(token napi, org FTCI) et **clé API OCI** (fingerprint 8c:0d:c0:84, tenancy
urielledouh, eu-marseille-1). Toutes les mesures ci-dessous sont des lectures
directes des consoles via API officielles (jamais d'écriture), croisées avec
une sonde SQL lecture seule (`pg_stat_activity`). Aucun secret ne figure dans
ce document.

### 11.1 Console Neon — le plan, le cycle, le sommeil, la consommation

| Question ouverte (§10) | Réponse mesurée | Preuve |
|---|---|---|
| Plan réel ? | **Free confirmé** aux deux niveaux (utilisateur + organisation FTCI `org-gentle-pond-54934166`) | `GET /users/me`, `GET /users/me/organizations` |
| Structure du projet | 1 projet (SECT `autumn-rain-10233998`), 1 branche (production), 1 endpoint read_write, aucune réplique ; PG 18, aws-eu-central-1 ; autoscale 0,25-2 CU ; PITR 6 h | `GET /projects?org_id=…` |
| `enable_logical_replication` | **false** (cohérent : `wal_level=replica` mesuré §10.1 — phase 2 non engagée) | `GET /projects/{id}` |
| Limite storage | **1 GiB** par branche (corrige §2.4 « 0,5 Go ») ; usage actuel 47 Mo / 1 024 Mo | `branch_logical_size_limit` |
| Reset du quota | **2026-11-01T00:00:00Z** (cycle courant : 01/10 → 01/11) | `quota_reset_at` |
| Fenêtre maintenance | samedi 00:00-01:00 UTC | `maintenance_window` |

**Le scale-to-zero fonctionne — preuve par l'historique des opérations**
(`GET /operations`, 200 dernières = 28/09 → 10/10) : 94 sessions
suspend→start reconstruites, **89 h éveillé sur ~12 jours**. Nuits
pré-cutover : 1 à 3 h d'éveil ; la plupart des sessions durent **5,2-5,4 min
(= timeout 300 s + détection)** — un client périodique (~toutes les 30 min,
identité non identifiée : reste d'ancienne chaîne ou moniteur externe)
réveillait le compute qui se rendormait aussitôt. Jour le plus chargé :
29/09 (22,6 h — travaux de cutover).

**Le « redémarrage inexpliqué » du 09/10 22:20:13 est résolu** : il est
précédé d'un `suspend_compute` à 22:08:31 — c'est un **réveil ordinaire**, et
le commit de fin de cutover (`7324a1a5`) est poussé à 22:26 : c'est le trafic
de production basculé sur la VM OCI qui a réveillé le compute. Question
§10.1 close.

**Post-cutover : éveil continu 24/7 — preuve par la base** (sonde
`pg_stat_activity` au DSN direct, 19:48 UTC) : backends `pgbouncer` (user
`sect_app`) idle depuis 7,5-47,5 min — le pool pgx de l'API VM via le pooler
tient des connexions ouvertes ; les moniteurs internes Neon
(`compute_monitor`, `vm-monitor`, `sql_exporter`) sont connectés depuis le
start (21,5 h) et dominent le débit (886 641 tx — cohérent §10.1). Les ticks
workers (promotion 10 s, auto_close 60 s, alerting 120 s, similarity 5 min —
constantes vérifiées dans `internal/worker/*.go`) maintiennent une activité
< 300 s d'intervalle en permanence → le compute ne peut plus jamais atteindre
son seuil de sommeil.

**Consommation du cycle en cours** : `active_time` = 287 556 s = **79,9 h
éveillé** (01/10 → 10/10) ≈ **20 CU-h** (croisement : `compute_time_seconds`
75 206 s ≈ 79,9 h × 0,25 CU ; l'écart +4 % s'explique par les pointes
d'autoscale). **Rythme post-cutover : ~6,3 CU-h/jour** (24 h × 0,25 CU, plus
pointes). Reste ~80 CU-h.

### 11.2 Console OCI — la VM, la facturation, la charge réelle

| Point vérifié | Valeur mesurée | Preuve |
|---|---|---|
| Tenancy / région | `urielledouh`, home **eu-marseille-1** (MRS), région unique | `iam tenancy get`, `region-subscription list` |
| VM | **VM.Standard.A1.Flex 4 OCPU / 24 Go / 4 Gbps, RUNNING**, AD-1, **créée 08/10 01:12 UTC**, IP publique 84.235.228.160 confirmée | `compute instance list`, `network vnic get` |
| Boot volume | 50 Go (AVAILABLE) | `bv boot-volume list` |
| **Facturation** | **0,000 USD sur toute la vie de la tenancy** (aucune ligne avant 2026-10) | Usage API, granularité mensuelle |
| **Charge réelle VM** | CPU **1,6-2,7 %** (pic pendant le cutover) ; RAM **4,0-4,7 % ≈ 1,05 Go / 24 Go** | Monitoring API (`oci_computeagent`, moyennes horaires 28/09 → 10/10) |

L'enveloppe intégrale 4/24 (§10.2) est confirmée et la VM est **quasi vide**
(les limites compose sect-api 3,5 CPU/20 Go plafonnent, l'usage réel est
~0,1 CPU). Marge considérable pour toute option colocalisée.

**Découverte annexe — bucket `mikcloud-wal`** (Object Storage, créé 09/10
04:38) : un **pipeline d'archivage WAL chiffré est ACTIF dans la tenancy** —
2 290 objets / 1 958 Mo ; rythme **60 WAL/heure (~45-56 Mo/h ≈ 1,2 Go/jour)** ;
timeline 1, position 0/8E5 ; 6 basebackups chiffrés de 7-7,7 Mo (petite base,
`archive_timeout` vraisemblablement 60 s). La source n'est pas identifiable
par l'API (nom suggérant un autre projet de l'exploitant — à confirmer par
SSH ; si elle tourne sur la VM SECT, la marge N3 doit en tenir compte).
⚠️ **Alerte quota partagé** : ~10 Go d'Object Storage gratuit → saturation
estimée vers le **16/10** sans politique de rétention (WAL-G `retain` ou
lifecycle rule) — à traiter côté exploitant.

### 11.3 Le mur CU-h — confirmé, daté, et la contradiction §10.3 résolue

Les deux moitiés du paradoxe étaient vraies, chacune à sa période :

- **Avant le cutover (jusqu'au 09/10 22:20)** : le primaire était Render
  (spin-down 15 min) → rien ne tenait le compute éveillé → il dormait la
  plupart du temps → consommation négligeable, **le mur était hors de portée**.
- **Depuis le cutover (09/10 22:20 →)** : les workers de la VM tickent à
  10 s/60 s/120 s/5 min via le pool → **jamais 300 s d'inactivité → éveil
  24/7 confirmé par les ops (21 h+ continues) et par `pg_stat_activity`**.

Projection du cycle courant : 20 CU-h consommés au 10/10 soir + ~6,3 CU-h/j
au rythme actuel → **épuisement des 100 CU-h ≈ 23-24/10** (±1 j selon
autoscale). Politique documentée du plan Free à l'épuisement : suspension du
compute jusqu'au reset du cycle (**01/11**) — soit **7-9 jours de base
injoignable**, jamais encore observée sur ce projet car le mur n'avait jamais
été approché.

**Correction importante de §10.3-N1** : l'incompatibilité alléguée « alerting
2 min pendant les examens vs mise en veille » est un faux dilemme — pendant
les fenêtres d'examen, le trafic réel éveille le compute de toute façon
(l'alerting coûte alors 0 de plus) ; la veille permanente ne coûte que sur
les **fenêtres creuses**, précisément là où quelques minutes de latence
d'alerte sont sans conséquence.

### 11.4 Propositions révisées (R3 remplacée ; R1/R4/R5 inchangées et toujours recommandées)

**M1 — Cadences adaptatives (RECOMMANDÉE — 0 €, réversible, ~2 h de code + 48 h
de mesure). À déployer avant le ~22/10 pour éviter la suspension de fin de
cycle.**
1. Rendre les intervalles workers configurables par env (défauts inchangés :
   `promotionTickInterval`, `alertingCheckInterval`, etc. — constantes
   aujourd'hui) ;
2. Fenêtre creuse nocturne (ex. 22:00-06:00 UTC, Abidjan) où tous les ticks
   passent à ≥ 10-15 min ;
3. Côté pool pgx : `MaxConnIdleTime` ~90 s (les connexions idle ferment, le
   compute peut dormir entre deux ticks — preuve §11.1 que des backends idle
   persistent 7-47 min aujourd'hui).
Budget estimé : nuits ~1-2 CU-h + jours ~6 max → mois type ≈ **60-80 CU-h <
100**. Coût produit : alertes Discord et fermetures auto retardées de ≤ 15 min
la nuit (arbitrage exploitant explicite).
**Mesure zéro-risque à exécuter dès ce soir par l'exploitant** : arrêter les
workers 30-60 min sur la VM et observer l'historique `GET /operations` —
mesure directe du duty cycle atteignable sans écrire une ligne de code.

**N2 — Neon Launch (~5-19 $/mois)** : inchangé (§10.4). Lève toute contrainte
de cadence ; naturel aux premiers revenus ; révise la promesse 0-coût.

**N3 — Inversion hybride (PG primaire sur VM)** : les ressources sont
**confirmées disponibles** (§11.2 — marge massive). MAIS la vérification
console fait émerger un **deal-breaker structurel supplémentaire** : le
standby Render (bascule P2) ne peut pas joindre un PostgreSQL local à la VM
sans exposer un port DB — **interdit par l'anti-décision n°3** → N3 détruit
la chaîne P1/P2 (le secours applicatif meurt avec la base) pour contourner
un mur de quota temporaire. À réserver au scénario « Launch refusé ET M1
insuffisante ». Les arguments §4.2 restent.

**R1 (backups pg_dump chiffrés → Object Storage)** : inchangée, toujours le
trou n°1. Nota : le bucket `mikcloud-wal` prouve qu'une chaîne d'archivage
chiffrée vers Object Storage tourne déjà dans la tenancy (outil WAL-G
compatible) — SECT peut réutiliser le patron. Attention au quota partagé
(§11.2).

**R4 (batch pgx `SendBatch`)** : inchangée — levier latence, rentabilise tout.

**R5 (phase 2 réplication logique)** : inchangée — facilitée par les mesures
(1 séquence, 85/85 PK, 24 Mo), non urgente (~800 req/j), décision séparée
après résolution du mur.

### 11.5 Anti-décisions (inchangées §8/§10.5) + ajout

7. **Aucune des propositions §11.4 n'est exécutée par ce document** — M1, N2
   et N3 attendent une décision explicite de l'exploitant (l'horloge du mur
   rend la décision urgente, pas automatique). Le tuteur ne bascule rien.

## 12. M1 — décision, implémentation, et intégration du PostgreSQL local (SECT-DB-HYBRID-5, 11 octobre 2026)

### 12.1 Décision de l'exploitant (10/10, chat)

**M1 approuvée** (« va y M1 (recommandée, 0 €) ») — N2 et N3 écartées pour
l'instant. Fait nouveau simultané : l'exploitant signale que **la VM héberge
déjà un PostgreSQL installé** (intégré au plan en §12.4).

### 12.2 Implémentation livrée (commit 0feee790, déployée + vérifiée le 11/10)

| Élément | Détail |
|---|---|
| `internal/worker/cadence.go` (nouveau) | `AdaptiveTicker` : intervalle recalculé à chaque cycle (transitions jour/nuit vivantes), aligné grille horaire, fenêtre nocturne, overrides env |
| Fenêtre nocturne | 22:00-06:00 `Africa/Abidjan` (UTC+0), plancher 15 min — `WORKER_NIGHT_*` |
| 8 workers périodiques | Bases JOUR inchangées (10 s/60 s/2 min/5 min/1 h/6 h/24 h) ; la nuit, plancher 15 min |
| Pool pgx (`db.go`) | `MaxConnIdleTime` 5 min → **90 s** (`DB_MAX_CONN_IDLE_TIME`) ; `MinConns` 5 → **0** (les health-checks pgx — Ping/30 s sur conn idle — ne réveillent plus Neon) |
| Sonde uptime | Nuit → process-only (retire `/db`) : un Ping DB/5 min interdirait la suspension (timeout 300 s) |
| Workers « file » (6), flush cache RAM | Inchangés — zéro polling DB structurel (channel Go / écrit si sessions actives) |
| Déploiement | backend-ci ✔, deploy-oci ✔ (VM healthy), sonde self-test E2E ✔ ; 3 chemins 200 (`db: up`, 40/39/25 ms) |

**Deux renforcements d'ingénierie au-delà du texte §11.4** (sans changement
de cadence jour, motivation mesurée) :

1. **Alignement grille horaire** — sans lui, 4 tickers à 15 min
d   désynchronisés entretiennent ~4 fenêtres d'éveil par quart d'heure
   (≈ éveil nocturne ~100 %, annulant M1). Alignés (:00/:15/:30/:45), ils
   partagent UNE fenêtre ≈ 6,5 min par 15 min (tick + résiduel idle 90 s +
   timeout suspension 300 s) → **duty nocturne ~43 % ≈ 0,9 CU/nuit** (vs 2).
2. **`MinConns` 5 → 0** — le « pool 30 s » du diagnostic §10.1 : pgx
   health-check (Ping) chaque 30 s les conns idle, et MinConns=5 les recrée
   indéfiniment → éveil sans aucune requête applicative. Corrigé.

### 12.3 Arithmétique honnête post-livraison (correction du modèle §11.4)

Le budget « ~60-80 CU-h » de §11.4 supposait des suspensions sur les fenêtres
creuses de JOUR. Or avec promotion à 10 s (base inchangée), le jour reste
éveillé en continu : **tout tick < 300 s interdit la suspension**. Donc :

- **Mois PLEIN sans plancher jour : ~4,0 CU (jour) + ~0,9 CU (nuit) ≈ 4,9/j
  → ~145 CU-h/mois → mur à ~21/11.**
- **Cycle d'octobre en cours** : ~28 CU consommés au 11/10 soir (agrégat
  laggué : 20,9 + 24/7 depuis) + ~20 j restants ≈ 4,9/j → **mur ~26-28/10**
  (reculé de ~3 j vs sans M1, mais TOUJOURS DANS LE CYCLE).
- **Avec plancher jour 15 min** (même mécanique que la nuit) : duty ~43 %
  24 h/24 → **~2,6-2,9 CU/j → cycle final ~80-88 CU < 100 ✔ sous le mur.**

**Décision attendue de l'exploitant (recommandée avant ~25/10 pour la
marge)** : activer le plancher jour — UNE ligne dans `/opt/sect/.env` puis
`docker compose up -d` :

```
WORKER_DAY_MIN_INTERVAL=15m
```

Arbitrage produit explicite : clôtures auto / alertes / promotion passent
à ≤ 15 min de latence AUX HEURES CREUSES de jour (le vécu étudiant ne
change pas — seuls les jobs de fond ralentissent quand personne n'utilise
la plateforme ; en cas d'examen nocturne/à la demande, `WORKER_PROMOTION_NIGHT_EXEMPT=true` etc. restent disponibles).

**Mesure 48 h (protocole)** : `GET /api/v2/projects/{id}/operations?limit=50`
(suspend/start — TEMPS RÉEL) ; NE PAS utiliser `consumption`
(`compute_time_seconds` = agrégat avec lag, lu figé à 75 206 s deux fois à
24 h d'intervalle). Attendu dès la 1ʳᵉ nuit M1 : ~32 cycles suspend/start
par nuit. Si le rythme reste > 3,5 CU/j après activation du plancher jour,
réexaminer (trafic réel dominant → N2).

### 12.4 Le PostgreSQL local de la VM — intégration au plan hybride

**Fait (exploitant + preuve dépôt)** : la VM héberge déjà
`postgresql@18-main` (~1 Go RAM au repos — commentaire
`deploy/oci/docker-compose.yml`) AINSI QUE **mikcloud** (autre application,
caddy système 80/443, `api.mikcloud.ftci.fr:4000`). Conséquences :

1. **Question §11.2 (source du bucket `mikcloud-wal`) RÉSOLUE par
   recoupement** : pipeline WAL-G de mikcloud (basebackup chiffré quotidien
   03:01 UTC + WAL continus). Re-mesuré 11/10 20:45 : 2 339 objets /
   2 005 Mo, croissance mesurée ~52 Mo/j → saturation ~10 Go vers
   **mi-2027** (l'alerte « ≈16/10 » de §11.2 était ~4× trop pessimiste —
   corrigée). Rétention (WAL-G retain / lifecycle) à planifier côté mikcloud
   — non urgent, hors périmètre SECT.
2. **Phases 1-2 accélérées** : PG 18 local = même version majeure que
   Neon 18.6 → abonné de réplication idéal (§5.1). L'installation
   « PostgreSQL 18 (pgdg arm64) » de la phase 2 est DÉJÀ LÀ — restent à
   créer une base dédiée (`sect_replica`) dans un cluster dédié/isonolé
   (NE PAS toucher au cluster mikcloud — garde docker-compose), DSN local
   + schéma par golang-migrate, puis publication/souscription.
3. **Phase 0 ajustée** — vérifications restantes côté VM (SSH, à la prochaine
   fenêtre) : `pg_lsclusters` (version exacte), charge réelle du cluster
   mikcloud, ports/`pg_hba`, `df -h`. L'anti-décision n°3 (jamais de port
   PG exposé) s'applique au réplique comme au reste (OCI abonné → Neon
   éditeur, en sortie seule).
4. **Réponse à la question de l'exploitant** (« hybride tirant le meilleur
   de chaque instance ») : c'est l'option C (§4.3), RENFORCÉE par ce fait —
   Neon apporte le serverless (autosuspend/branching/PITR 6 h, source de
   vérité) ; la VM apporte un PG 18 local 24 h/24 à 0 CU (réplique de
   lecture/DR, restores de test mensuels de la phase 1 dans le PG local,
   levier latence R4). Séquence inchangée : **phases 0-1 d'abord**
   (backups décorrélés R1 — inoffensives, ~90 % du bénéfice résilience),
   puis DÉCISION séparée sur la phase 2 (`wal_level=logical` IRRÉVERSIBLE
   côté Neon, cf §5.4).

### 12.5 Anti-décisions — ajout

8. Le tuteur n'active ni le plancher jour (`WORKER_DAY_MIN_INTERVAL`), ni
   la phase 2, sans décision explicite de l'exploitant — la mesure 48 h
   d'abord pour le premier, l'étude d'irréversibilité pour la seconde.

## 13. Mode « à la demande » + plancher jour — décision, implémentation, sonde corrigée (SECT-DB-HYBRID-6, 11 octobre 2026)

### 13.1 Décision de l'exploitant (10/10, chat)

Feu vert complet sur l'arbitrage §12.3 : « va y applique... la
recommandation qui fera tenir sans suspension tout en gardant la
réactivité de l'app », avec la spécification citée : les jobs de fond
(clôtures auto, alertes, promotion) passent à ≤ 15 min aux heures creuses
uniquement — le vécu étudiant ne change pas (pendant un examen réel, le
trafic éveille le compute de toute façon) — et pour GARDER la
réactivité 10 s des promotions, un MODE « À LA DEMANDE » : « le worker
reste rapide quand des batches existent, ralentit sinon ». La décision
couvre donc DEUX livrables liés :
1. le plancher jour (`WORKER_DAY_MIN_INTERVAL=15m`) — l'anti-décision n°8
   est levée par cette décision explicite ;
2. le mode à la demande promotion — la contrepartie produit du plancher.

### 13.2 Implémentation (commit 054efa7f, déployée + vérifiée le 10/10 21:51 UTC)

| Élément | Détail |
|---|---|
| `internal/worker/wakeup.go` (nouveau) | `WakeupBus` in-process : `Subscribe` (canal buffer 1, jamais fermé) / `Notify` (non-bloquant, coalescent — un signal en attente suffit : le drain vide TOUT ce qui est PENDING, pas un batch par signal). Abonnement pris au CONSTRUCTEUR (`WithWakeup`), pas dans `Start` : aucune fenêtre où un Notify serait perdu avant la première écoute. |
| `promotion_worker.go` | 3ᵉ case au select (`case <-w.wake` ; canal nil = case jamais prêt — idiome Go, zéro changement sans bus). `drainPendingBatches` : batches PENDING traités back-to-back jusqu'à épuisement. `processPendingBatches` retourne « un batch a-t-il été claimé » (false = rien/erreur lecture ; true = claimé, quel que soit le dénouement COMPLETED/FAILED). |
| `promotion_handlers.go` | `runPromotion` appelle `s.promotionWakeup()` JUSTE APRÈS le COMMIT du batch PENDING, avant le 202 : pickup < 1 s — STRICTEMENT MIEUX que les 10 s de polling historiques. Nil-safe ; non-bloquant. |
| `main.go` | Bus créé sous la garde `WorkersEnabled`, closure injectée au serveur (`WithPromotionWakeup`, pattern setter). En standby (Render, workers OFF) : Notify sans abonné = no-op — le chemin chaud n'existe que là où tournent les workers (primaire OCI), qui est aussi là où le chemin public route le trafic. Registre /monitoring : « promotion — à la demande (< 1 s) + filet 15 min ». |
| Filet de sécurité | Ticker adaptatif M1 INCHANGÉ (planchers 15 min jour/nuit, grille alignée :00/:15/:30/:45) : rattrape tout ce qui n'est pas passé par l'API (reprise après restart, Notify perdu, chemin externe futur). |
| Activation plancher jour | `deploy-oci.yml` : le script de déploiement SEED `WORKER_DAY_MIN_INTERVAL=15m` dans `/opt/sect/.env` SI la ligne n'existe pas (seed-once : jamais écrasée ensuite — l'exploitant garde la main sur la VM). Défaut code 0 inchangé (Render/dev locaux). Exécuté au déploiement du 10/10 (deploy-oci SUCCESS ⇒ seed posé, conteneur recréé avec la var). |
| Sonde uptime | Gating grille remplace la fenêtre nocturne : check /db UNIQUEMENT sur le run minute%15==2 (:02/:17/:32/:47 — cron 2-57/5), qui rode la fenêtre d'éveil des ticks alignés (:00/:15/:30/:45) à coût marginal ≈ 0 ; tous les autres runs process-only. `PROBE_DBCHECK=force\|off` pour tests/exploitation (self-test E2E vert en 3 modes). |

Vérifications : gofmt/vet/build 0 ; CI 3/3 SUCCESS (sonde uptime 9 s,
backend-ci 121 s, deploy-oci 124 s) ; 3 chemins 200 post-déploiement
(public /api/health/db 39 ms, direct OCI 40 ms, standby Render v0.2.0) ;
audit indépendant du diff avant commit (12/12 points, aucune régression).

### 13.3 Correction du modèle §12.3 — la sonde défaisait le plancher jour

§12.3 projetait « duty ~43 % 24 h/24 » avec le plancher jour, mais la
sonde pingait `/db` TOUTES LES 5 MIN DE JOUR (M1 §11.4 n'avait retiré le
suffixe que la nuit) : un Ping DB/5 min interdit la suspension (timeout
300 s) → le jour serait resté éveillé EN CONTINU, plancher ou pas — mur
fin de cycle conservé, §12.3 invalidé par construction. Corrigé par le
gating grille. Leçon générale : une chaîne d'éveil se casse sur le
maillon le plus FRÉQUENT — la sonde (5 min) était plus fréquente que le
plancher (15 min) ; tout élément réveillant Neon doit être inventorié
AVANT d'arbitrer un budget.

### 13.4 Arithmétique finale

- Workers 15 min alignés 24 h/24 : ~6,5-7 min d'éveil par quart d'heure
  (tick + conn idle 90 s + timeout suspension 300 s) → duty ~43-47 % ≈
  **2,6-2,8 CU/j → ~78-85 CU/cycle** < 100 ✔. Le trafic réel d'usage
  s'y AJOUTE (c'est le produit qui fonctionne — arbitrage §11.4
  inchangé : pendant un examen, le trafic éveille le compute de toute
  façon).
- Sonde : ~0 marginal (elle rode la fenêtre d'éveil) ; pire cas jitter
  cron +0,2 CU/j.
- Cycle d'octobre en cours : ~28-30 CU consommés au déploiement +
  ~21 j × 2,7 ≈ **~80-88 CU** → sous le mur, reset 01/11 (marge fine —
  la mesure 48 h tranche, cf. §13.6).

### 13.5 Sémantique du mode « à la demande » (garanties)

- RAPIDE : POST /cloture-annee → COMMIT → Notify → drain < 1 s ; les
  batches créés PENDANT le traitement sont traités back-to-back (le
  signal coalescé resté en attente déclenche un second drain).
- LENT sinon : filet ticker 15 min, grille alignée (UNE fenêtre d'éveil
  pour tous les workers).
- `run-sync` (POST /run-sync) : traitement synchrone inchangé —
  palliatif en failover Render (aucun réveil cross-process ; le
  primaire est seul à porter les workers — cohérent avec
  l'architecture hybride).
- Multi-instance : claim FOR UPDATE SKIP LOCKED inchangé — un réveil
  « inutile » coûte un SELECT.
- Intra-batch : la progression live (UPDATE par étudiant + polling
  /status) est inchangée — c'est du traitement, pas de la cadence.

### 13.6 Mesure 48 h (protocole §12.3 inchangé + attendus révisés)

`GET /api/v2/projects/{id}/operations?limit=50` (suspend/start — temps
réel). Attendus avec plancher 24 h/24 + sonde grille : **~4 cycles
suspend/start par heure (~96/jour)**, et non plus seulement ~32/nuit. Si
le rythme reste > 3,5 CU/j après 48 h, réexaminer (trafic réel dominant
→ N2 Launch, reste documenté §10.4/§11.4).

### 13.7 Anti-décisions — ajout

9. Le mode à la demande ne s'étend à AUCUN autre worker sans décision
   explicite de l'exploitant (chaque extension exige l'analyse de son
   chemin d'entrée réel). La sonde ne repasse PAS au /db toutes les
   5 min 24 h/24 sans décision explicite (elle déferait §13 par
   construction — cf. §13.3).

---

## 14. Projection capacité 5×2 000 étudiants — « le meilleur de chacun ? » (SECT-DB-HYBRID-7, 10 octobre 2026, nuit)

### 14.1 La question de l'exploitant (3 volets)

1. Pourquoi ne pas profiter de la puissance de l'instance A1 et maintenir la DB sur Neon ?
2. N'y a-t-il pas une possibilité d'utiliser le meilleur de chacun ?
3. Avec une instance free (à ~500), combien de temps Neon peut-il tenir si l'on a 5 établissements de plus de 2 000 étudiants ?

### 14.2 Réponses courtes

1. **C'est déjà l'architecture en place.** L'app et les 14 workers tournent sur la VM A1 (charge mesurée : CPU 1,6-2,7 %, RAM ~1 Go/24 — §11.2) et la DB est sur Neon. La puissance A1 ne soulage **aucun** des deux murs : chaque requête aboutit sur le compute Neon (CU-h) et chaque ligne sur son stockage. « Puissance A1 + DB Neon » = le statu quo — optimal pour le pilot, mais pas un levier supplémentaire à activer.
2. **Oui, mais le patron « meilleur de chacun » a une limite structurelle.** L'option C (§4.3, §12.4) — Neon source de vérité + A1 réplique de lecture/DR + R2 pour les fichiers — reste le bon hybride, MAIS il ne déplace pas les écritures : les deux murs (CU-h, stockage) sont consommés par les écritures, qui restent chez Neon. À l'échelle 5×2 000, « le meilleur de chacun » exige donc un arbitrage : **N2** (Neon payant + la puissance A1 pour tout le calcul) ou **N3** (inversion : la puissance A1 POUR la DB, Neon DR froid).
3. **Ça tient le pilot indéfiniment ; à 5×2 000 ça ne tient pas un semestre.** Mur stockage (1 GiB/branche) en ~2-8 semaines de période d'examens réelle — avec écrits rejetés à la limite, c'est-à-dire des copies d'étudiants en péril en plein examen ; mur CU-h dans le mois d'examens (autoscale 0,25→2 CU = burn ×4-8). Détail chiffré §14.4-14.5. (NB : la limite storage mesurée est **1 GiB**/branche, §11.1 — l'intuition « 500 Mo » du §2.4 avait déjà été corrigée par la console.)

### 14.3 Hypothèses — mesurées vs projetées

| Type | Donnée | Valeur | Source |
|---|---|---|---|
| **Mesuré** | Limite storage branche | 1 GiB (1 024 Mo) ; usage actuel 47 Mo | API Neon §11.1 |
| **Mesuré** | Quota compute | 100 CU-h/cycle ; autoscale 0,25-2 CU | API Neon §11.1 |
| **Mesuré** | Rythme post-§13 (bruit de fond) | ~2,6-2,8 CU/j → ~78-85 CU/cycle | ADR §13.4 |
| **Mesuré** | RequestLog | ~172 o/ligne ; rétention 7 j (purge horaire) | §2.1 + monitoring/sampler.go |
| **Mesuré** | Trafic actuel | ~800 req/j ; base pré-revenu | §10.1 |
| **Projeté** | Poids d'une copie (réponses JSON + résultat + métadonnées) | **~25 Ko ±×2** (12-50 Ko) | à MESURER à la 1re épreuve réelle (§14.7-4) |
| **Projeté** | Épreuves par étudiant par semestre | ~8-12 | hypothèse université |
| **Projeté** | Concurrents par créneau d'examen | ~2 000 (1 établissement) ; ~300 req/étudiant/créneau (autosave 30 s × 90-120 min) | hypothèse |

### 14.4 Mur n°1 — stockage (1 GiB) : ~2-8 semaines de période d'examens

- Disponible : 1 024 − 47 ≈ **975 Mo**.
- Copies durables : à 25 Ko/copie → ~39 000 copies ; à 12,5 Ko → ~78 000 ; à 50 Ko → ~20 000. Un semestre à 5×2 000 ≈ 10 000 étudiants × 10 épreuves = **~100 000 copies ≈ 2,5 Go** → **2,5× la limite, saturée en ~2-8 semaines de pleine période d'examens** (selon le Ko/copie réel).
- RequestLog : borné par la rétention 7 j, mais la fenêtre de pointe pèse **100-500 Mo transitoires EN PLUS** pendant les semaines d'examens (600 000 req/créneau de 2 000 étudiants × 172 o ≈ 103 Mo/créneau, purge 7 j glissante).
- **Comportement à la limite : les écritures sont REJETÉES** (branch logical size limit) — c'est-à-dire des INSERT de réponses/copies qui échouent en plein examen. C'est le pire scénario produit imaginable, et il est silencieux jusqu'au moment où il frappe.
- Ce mur n'est PAS attaquable par des cadences (M1) ni par le pooling : c'est de la donnée métier qui s'accumule.

### 14.5 Mur n°2 — CU-h (100/cycle) : le mois d'examens

- Le bruit de fond post-§13 (~2,6-2,8 CU/j ≈ 80 CU/cycle) tient le mur **tant qu'il n'y a pas de trafic** — c'est le pilot d'aujourd'hui. ✔
- Le trafic d'examen n'est pas optimisable : **c'est le produit**. Jour d'examen : compute éveillé ~12 h (0,25 CU = 3 CU) + autoscale sous charge — 2 000 concurrents qui écrivent en continu poussent vers 0,5-2 CU (burn ×2-8).
- Mois contenant ~10 jours d'examens : 20 j × 2,7 CU + 10 × (3-12 CU) = **~84-175 CU** → même le scénario bas frôle le mur, tout autoscale le fait franchir → suspension jusqu'au reset = plateforme DOWN pendant/après les examens.
- Leçon structurelle : **M1/§13 ont optimisé le bruit de fond ; à cette échelle, le signal (trafic réel) domine.** Ce n'est pas un défaut de réglage, c'est le plan Free.

### 14.6 « Le meilleur de chacun » à 5×2 000 — les deux voies honnêtes

| Critère | **N2 : Neon Launch/Scale + option C** | **N3 : inversion (PG primaire sur la VM A1)** |
|---|---|---|
| Coût | ~0,14 $/CU-h au-delà de l'inclus (§2.4) ; dizaines de $/mois en session d'examens | 0 € |
| Murs Free | Tous levés (facturation à l'usage) | Tous levés (locaux : 4 OCPU/24 Go à 2-3 % de charge, disque 200 Go) |
| Rôle de la puissance A1 | App + workers + **réplique lecture/DR** + exports (option C) | **Tout, DB incluse** (latence sub-ms app↔DB) |
| Risques | Dépendance fournisseur ($) ; opérations gérées | SPOF app+DB (RTO ~1 h, RPO = dernier backup) ; chaîne P2 Render inopérante pour la DB (anti-décision n°3) ; backups WAL-G + tests de restore mensuels OBLIGATOIRES ; upgrades majeurs manuels |
| Position dans le plan | **Naturel dès les premiers revenus B2B** | Souveraineté totale — à assumer en connaissance de cause (§11.4-N3, §12.4) |

Note économique : 5 établissements × 2 000+ étudiants = **5 contrats B2B signés** — à ce stade, ~20-60 $/mois de DB est marginal devant le risque d'un échec d'examen (la confiance EdTech se perd une fois). N3 reste l'option indépendance si l'exploitant la préfère ; les deux voies sont préparées par les mêmes travaux (R1 backups + phase 2 réplique).

### 14.7 Déclencheurs mesurables (à poser AVANT d'embarquer les 5 établissements)

1. **`pg_database_size(current_database())` ≥ 600 Mo (60 % du GiB)** → décision sous 7 jours (mur DUR : écrits rejetés à 1 GiB).
2. **Cadence > 3,5 CU/j soutenu hors période d'examens** → N2 (seuil §13.6 inchangé).
3. **2e établissement signé OU 1re session d'examens > 500 étudiants planifiée** → bascule décisionnée et exécutée **avant** la session (jamais pendant).
4. **1re épreuve pilote réelle** : mesurer le Ko/copie réel (taille des tables Reponse/SessionPassation ÷ nombre de copies — 2 requêtes SQL) → recalibrer §14.3 (la projection ±×2 devient une mesure).

Proposition (décision exploitant) : règle d'alerte Discord « taille base ≥ 60 % » dans le module /monitoring (pattern alerting_worker existant) — le mur stockage est aujourd'hui **silencieux jusqu'à l'échec d'écriture**.

### 14.8 Anti-décisions — ajout

10. La bascule N2/N3 à l'échelle 5×2 000 est une décision d'exploitant, à exécuter hors période d'examens ; le tuteur n'embarque aucun établissement et ne déclenche aucune bascule sur la seule base de cette projection. Les déclencheurs §14.7 sont des seuils d'ALERTE, pas des automatismes.

## 15. Phases 0-1 exécutées — backups chiffrés + alerte taille base (SECT-BACKUP-1 / SECT-DB-ALERT-1, 11 octobre 2026)

### 15.1 Décision de l'exploitant (11/10, chat)

« **D1-D10 validées, GO** » — avec le fil conducteur : une app performante qui
ne s'écroule pas sous forte charge. Toutes les décisions de cette section
servent ce but par la verticale « ne jamais s'effondrer SILENCIEUSEMENT » :
backups PROUVÉS restaurables, mur stockage rendu visible (D10), watchdog
anti-silence, calibration CU du pipeline de sauvegarde.

### 15.2 Preuve d'intégrité mesurée (prérequis D1 — le risque silencieux n°1 écarté)

Un dump Neon sur des tables RLS FORCE par un rôle sans privilèges serait
silencieusement amputé des lignes filtrées. Sonde jetable lecture seule
(pgx, exécutée puis supprimée, jamais commitée — protocole habituel) :

- `neondb_owner` (le rôle du DSN direct, celui de pg_dump) porte
  **`bypassrls=true`** (non-superuser, createrole) sur Neon ;
- counts SANS claims sur les tables FORCE (AlertingRule, RequestLog,
  AuditLog, Reponse) : **complets** — 11 règles, 4 886 / 2 741 / 597 lignes,
  + User 29, Epreuve 6.

**Conclusion mesurée : `pg_dump` via le DSN direct capture TOUTES les
lignes, tables RLS FORCE incluses — un backup amputé par RLS est exclu par
construction.** (La preuve vaut pour CE rôle ; si un jour le DSN change de
rôle, refaire la sonde avant de faire confiance aux backups.)

### 15.3 Livré — inventaire (commit associé à ce §15)

| Livrable | Contenu / décision couverte |
|---|---|
| `ops/backup/sect_backup.sh` | Flux D1-D9 : pg_dump -Fc + pg_dumpall globals + manifest (counts User/Epreuve/Reponse/RequestLog/AuditLog + policies + tables) → age (clé publique seule) → rclone → Object Storage ; rétention 30 j + 12 mensuels ; échec = Discord (loud) ; `--announce` pour la 1ʳᵉ fois |
| `ops/backup/sect_restore_test.sh` | Preuve D6/D8 : download → sha256 vs index clair → déchiffrement (clé escrow passée par `--identity-file`) → restore cluster dédié 5433 → vérification EXACTE des counts/policies vs manifest → PASS/FAIL Discord + marker `restore-ok-<mois>`. EST le moteur break-glass (`--keep`) |
| `ops/backup/sect_backup_watchdog.sh` | Silence > 36 h → Discord ; listing bucket (dégradation visible) ; rappel mensuel test restore (jours 1-3, marker mensuel) |
| `ops/backup/vm_audit.sh` | Phase 0 lecture seule : host/PG (pg_lsclusters, bases, écoute, cluster dédié, pg_hba résumé)/docker/ports/prérequis + reclaim §15.6. Ne fail jamais (collecte) |
| `ops/backup/install.sh` | Idempotent : apt rclone+age+git, scripts/units en place, **cluster dédié `sect` 5433 127.0.0.1 (D6 — jamais le cluster mikcloud)**, seed-once `backup.env` 600, timers armés SEULEMENT si env configuré |
| `ops/backup/systemd/` | `sect-backup.timer` 03:32 UTC (Persistent, AccuracySec 30 s) + `sect-backup-watchdog.timer` 12:32 UTC ; services durcis (ProtectSystem, NoNewPrivileges) |
| `.github/workflows/backup-install.yml` | Job self-test (bash -n + `--self-test` de chaque script + systemd-analyze) TOUJOURS vert + gate secrets SSH + job install idempotent (clone token éphémère → `/opt/sect/backup` → install.sh) |
| `.github/workflows/vm-audit.yml` | `workflow_dispatch` manuel : audit lecture seule, rapport dans le log du job |
| `docs/ops/backup-restore-runbook.md` | Mise en service complète : console OCI (bucket, IAM group+policy scopée, CSK), escrow DOUBLÉ, 1ᵉʳ backup + 1ʳᵉ preuve restore, test mensuel, break-glass « Neon down » (RTO 15-30 min), évolutions (horaire = 1 ligne calée grille) |
| Backend (SECT-DB-ALERT-1, D10) | Métrique `db_size_mb` au catalogue (`CollectMetrics`, `MetricsSnapshot.Value`) + **migration 000135** : règle système `db-taille-quota` — `db_size_mb SUP_EGAL 600`, CRITICAL, cooldown 1440 min, in-app + Discord (pattern claims ADMIN + asserts des migrations 000133/000134). **APPLIQUÉE : Neon 134 → 135 (11/10)** |

Self-tests CI internes (chacun `--self-test`) : parseur env SANS eval (un DSN
contient `&` — un `source` cassé enverrait l'affectation en arrière-plan :
faille documentée), rétention (`oldest_beyond`), manifest (SQL quoté,
anti-injection), fonctions d'audit. Trois défauts réels attrapés par les
self-tests avant tout déploiement (inversion rétention, dispatch, units) —
la CI travaille déjà.

### 15.4 Calage CU — arithmétique (à ne pas casser)

Le timer 03:32 UTC tombe DANS la fenêtre d'éveil du tick 03:30 de la grille
M1 (§13.4 : tick + conn idle 90 s + timeout suspension 300 s → awake
≈ 03:30→03:36:30). Un dump de 47 Mo dure quelques secondes → il chevauche
une fenêtre DÉJÀ payée : **coût CU marginal ≈ 0** (un réveil isolé mal calé
coûterait ~0,8 CU/mois). Le watchdog 12:32 ne touche PAS Neon (marker local
+ listing bucket + Discord). Anti-décision : ce calage ne se déplace pas
hors grille sans refaire l'arithmétique (§13.4 leçon générale : la chaîne
d'éveil se casse sur le maillon le plus fréquent).

### 15.5 Sécurité — menaces couvertes (D2/D7)

- Clé privée age : JAMAIS sur la VM ni dans le bucket — escrow exploitant
  DOUBLÉ (coffre + hors site). Perte des deux = backups illisibles (voulu) ;
- Chiffrement double couche : age client-side + SSE bucket par défaut ;
- IAM : utilisateur `sect-backup` sans console, CSK rotative, policy
  `manage objects` scopée au SEUL bucket — rien d'autre n'est lisible ;
- Aucun port exposé (flux en SORTIE uniquement : Neon 5432, Object Storage
  443, Discord 443) — anti-décision n°3 intacte ;
- Break-glass humain uniquement (anti-décision n°4) : le script restore
  fournit le moteur, le runbook §7 le geste — jamais d'automatisation.

### 15.6 Reclaim Oracle — VERDICT après audit outillé + Monitoring API (11/10/2026)

L'audit (vm-audit.yml, 01:14 UTC) a fourni la charge instantanée ; les 95ᵉ
percentiles 7 j — « n'existent que dans la console » — ont été extraits par
le tuteur via l'API Monitoring (l'équivalent exact des graphes console) :

| Métrique (95ᵉ pct, fenêtre 7 j glissante) | Mesuré | Seuil « idle » |
|---|---|---|
| CPU | 9-13 % (pic 13,1 %, stable ~9 %) | < 20 % |
| Mémoire | 4,42 % (1,2/24 Go) | < 20 % |
| Réseau | ~0,05 % effectif (2,0 GiB rx / 3,4 GiB tx cumulés/boot) | < 20 % |

**Verdict : reclaim = risque RÉEL mais pas encore déclenchable.** Toutes
les métriques sont dans la bande « idle » de la politique A1 (CPU + réseau +
mémoire < 20 % pendant 7 j consécutifs) — MAIS l'instance n'a été créée que
le 08/10 01:12 UTC : la fenêtre « 7 jours consécutifs » ne peut pas être
complète avant ~le 15/10. Deux amortisseurs : la tenancy n'a jamais été
reclaimée en ~4 mois (mikcloud actif dedans — ses pics comptent dans les
métriques), et Oracle annonce par email avant tout stop. La parade
structurante est livrée par ce même train : backups chiffrés décorrélés
Object Storage → un stop/reclaim ne perd AUCUNE donnée SECT (restore vers
n'importe quel PostgreSQL ≥ 16, runbook §7).

Actions exploitant : (a) surveiller les emails OCI (pré-avis avant stop) ;
(b) le futur N3 (VM primaire) ferait mécaniquement passer le CPU au-dessus
du seuil ; (c) re-vérifier les percentiles après le 15/10 si le sujet
revient. Volume Backups Always Free : 0/5 slots utilisés (audit).

### 15.7 État de mise en service (qui fait quoi maintenant)

| Étape | Qui | Statut (mise en service effective 11/10/2026, 02:07 UTC) |
|---|---|---|
| Code + workflows + migration 000135 appliquée | tuteur | **FAIT** |
| CI self-test + install (run #38101701353 + fixs) | tuteur (délégation) | **FAIT** — cluster 5433 créé, scripts/unités en place |
| Console OCI : bucket + IAM + CSK (§3.1-3.2) | tuteur (CLI OCI, délégation) | **FAIT** — sect-backups/user/group/policy scopée + CSK prouvée S3 (75 s propagation) |
| Clé age + escrow doublé (§3.3) | tuteur → **exploitant** | **GÉNÉRÉE + testée** — l'escrow physique (coffre + papier/USB) reste à faire PAR L'EXPLOITANT avec le fichier livré (download/) |
| `backup.env` renseigné (§3.4) puis activation (§4) | tuteur (backup-configure.yml) | **FAIT** — timers ARMÉS (03:32/12:32 UTC), is-enabled ✓ |
| **1ᵉʳ backup `--announce` + 1ʳᵉ preuve de restore (§5)** | tuteur (backup-run/restore-test.yml) | **FAIT, PREUVÉ** — daily/2026-10-11 chiffré ; restore PASS : 85/85 tables, 233/233 policies, counts exacts, escrow vérifié ; marker restore-ok-2026-10 |
| Mesure 48 h §13.6 (2 curls API Neon) | tuteur | En cours (premier point §16.3 ; à compléter sur 48 h) |
| Rapport vm-audit → verdict reclaim (§15.6) | tuteur | **FAIT** (voir §15.6 ci-dessus) |

Détail : la mise en service a été exécutée de bout en bout par le tuteur sur
délégation explicite de l'exploitant (« toute l'opération doit être gérée de
bout en bout par toi ») — chaque geste reste auditable dans les logs des
workflows (runs GitHub Actions listés §16). Le secret transitoire
SECT_AGE_IDENTITY a été posé pour le test puis SUPPRIMÉ (vérifié absent) —
anti-décision 11 respectée.

### 15.8 Anti-décisions — ajout

11. La clé privée age ne vit JAMAIS durablement sur la VM : pour un test
    break-glass, elle est apportée, utilisée, retirée (dans cet ordre).
12. Aucune promotion automatique d'un backup/réplique — le break-glass est
    un geste humain approuvé (runbook §7 ; symétrie anti-décision n°4).
13. Le calage 03:32 UTC ne bouge pas hors de la grille M1 sans refaire
    l'arithmétique §13.4/§15.4 (idem pour tout futur rythme horaire).

## 16. Phase 2 exécutée — POC réplication logique (SECT-REPLICA-1/2, 11 octobre 2026)

Feu vert de l'exploitant : « et enchaîne la phase 2 » — POC §6 exécuté de
bout en bout le jour même, mesures à l'appui.

### 16.1 Décisions irréversibles appliquées (validées)

- **wal_level=logical sur Neon** — piège documenté : le setting est un
  paramètre **PROJET** (`PATCH /v2/projects/{id}` avec
  `{"project":{"settings":{"enable_logical_replication":true}}}`), PAS un
  setting endpoint (le champ y est silencieusement ignoré — spec OpenAPI v2
  de référence). Vérifié SQL après restart du compute (01:39:06 UTC).
  Une fois posé il ne se désactive plus (§5.4) — assumé.
- **Publication `sect_poc`** : RequestLog, AuditLog, Reponse. Le rôle du DSN
  direct (neondb_owner) porte `rolreplication` (vérifié SQL) — pas de rôle
  dédié nécessaire.

### 16.2 Livré

| Livrable | Contenu |
|---|---|
| `ops/replica/sect_replica_sync.sh` | Fenêtre de réplication : ENABLE → convergence (received_lsn == latest_end_lsn ×3, horodatage frais) → DISABLE |
| `ops/replica/systemd/` | `sect-replica-sync.service` (durci, oneshot) + `.timer` (**:02/:32 UTC**, Persistent — D4 : systemd, pas GitHub Actions) |
| `.github/workflows/replica-setup.yml` | Setup idempotent + auto-réparant (tant que la souscription n'existe pas, sect_replica est un scratch : DROP WITH FORCE + recréation + migrations) : base dédiée sur le cluster **5433 (jamais mikcloud)**, schéma par golang-migrate (135/135, DSN local socket peer), souscription, outillage sync |
| `.github/workflows/replica-status.yml` | Mesures à la demande : pg_subscription, lag, counts répliqués, charge VM (sar + docker) |
| Migration 000058 corrigée | Fresh-run-safe (voir §16.5) |

### 16.3 Mesures (le cœur du POC — mesurées, pas projetées)

- **Lag** : received_lsn == latest_end_lsn en continu (keepalives ~5 s) ;
  retard affiché ≈ 1,3 s (fréquence keepalive, pas un vrai retard) ;
- **Live** : RequestLog suit le trafic réel en direct (4 886 → 4 888 pendant
  la session — chaque requête API journalisée arrive sur la réplique) ;
- **API prod : ingérence NULLE** — /health 0,93 s, /health/db 1,16 s
  (plage habituelle), les lectures de prod ne changent pas (§6 phase 2 ✔) ;
- **Charge VM** : négligeable (loadavg 0,14 ; le pic %sys 22 % mesuré
  provenait du déploiement backend déclenché par le push de la migration
  000058, pas de la réplication) ;
- **DÉCOUVERTE DÉCISIVE — une souscription active 24/7 EMPÊCHE
  l'autosuspend Neon** : le walsender vivant fait avancer `last_active`
  (keepalives interprétés comme activité). Mesuré : AUCUN suspend ≥ 8 min
  après sa création, contre un rythme de 5:16 par cycle avant (historique
  operations API). Coût implicite : compute 24/7 ≈ 720 h × 0,25 CU ≈
  **180 CU-h/cycle — incompatible avec le budget Free de 100 CU-h**.

### 16.4 Décision : réplication en FENÊTRES calées sur la grille M1 — CYCLE COMPLET PROUVÉ (03:32-03:50 UTC)

Preuve observée le 11/10 (journaux + operations API Neon) : fenêtre 03:32:00
(ENABLE) → convergence 15 s (received=latest ×3) → DISABLE 03:32:15 →
walsender parti → `suspend_compute` à 03:50:16 — **le premier suspend depuis
02:28** : l'autosuspend est RESTAURÉ par les fenêtres, coût CU marginal ≈ 0.
Première fenêtre 03:02 avait échoué (unité durcie NoNewPrivileges qui
interdit sudo — service désormais User=postgres, plus aucune élévation).

La souscription ne vit que par fenêtres chevauchant les éveils DÉJÀ payés
par les workers : timer :02/:32 UTC → ENABLE à T+1-2 min du tick, DISABLE à
la convergence (secondes pour notre volume) → le walsender quitte AVANT le
point de suspension habituel → **coût CU marginal ≈ 0 le jour** (fenêtre
dans le tick :00/:30). La nuit, la grille étant plus clairsemée, le :32 peut
être un éveil isolé (~5 min × 0,25 CU ≈ 0,8 CU/mois — à surveiller sur la
mesure 48 h §13.6). Le slot conserve le WAL entre fenêtres (volume trivial :
3 tables, ~Go de marge). **RPO réplique : ≤ 30 min** — pour un usage
DR/analytique, conforme au but de la phase 2.

### 16.5 Dettes découvertes et corrigées — la checklist double-cible naît ici

Le fresh-run séquentiel sur la réplique a révélé que les migrations
historiques n'étaient PAS rejouables à neuf (Neon les a absorbées au fil de
l'eau au moment de leur écriture — le drift est invisible tant qu'on ne
rejoue pas) :

- **000058** : `create_b2c_subscription` passe de 5 à 6 args — un CREATE
  OR REPLACE de signature différente crée une SURCHARGE au lieu de
  remplacer, et ses grants non qualifiés échouaient (« function name is not
  unique », run #38104688451). Corrigé au patron du dépôt (000070/000082) :
  DROP IF EXISTS de l'ancienne signature + grants qualifiés. No-op côté
  Neon (déjà appliquée, jamais rejouée).
- **RÈGLES pour toute migration future (la « checklist double-cible » du
  plan §6)** : (1) un fresh-run séquentiel sur la réplique fait partie de
  la définition du fini ; (2) changer une signature de fonction = DROP
  l'ancienne AVANT le CREATE ; (3) grants/REVOKE ON FUNCTION toujours
  QUALIFIÉS (signature complète) ; (4) ne jamais référencer un objet avant
  sa création (le sweep du 11/10 n'a plus trouvé que 000058 fautif).
- **rclone × OCI Object Storage (découvert en vérifiant le nightly 03:32)** :
  la couche S3-compat (provider « Other ») ne persiste pas le mtime →
  rclone retombe sur TAILLE SEULE → un re-run du même jour skippait
  silencieusement les fichiers de taille identique (l'index, à taille
  fixe, restait ancien alors que le dump changeait → dossier potentiellement
  INCOHÉRENT). Corrigé : `--ignore-times` (upload inconditionnel, 4
  fichiers ~1,3 Mo). Preuve post-fix : sha256 de l'index = sha256 du dump
  téléchargé. Accessoire : `time-created` OCI ne bouge PAS sur overwrite
  (juger sur les etags/tailles, pas sur lui).

### 16.6 Limites documentées du POC

- **Séquences non répliquées** (publication tables seules) — toute
  promotion N3 exige le resync des séquences (déjà prévu §3.8 runbook
  hybride) ;
- **Extensions fournisseur** : pg_session_jwt (auth JWT du backend,
  hors migrations, posée main sur Neon) est absente de la réplique vanilla —
  sans impact sur les 3 tables répliquées ; à traiter avant toute
  promotion N3 ;
- RLS : l'apply worker passe en superuser du cluster dédié (bypass
  standard de la réplication logique — les données sont identiques).

### 16.7 Anti-décisions — ajout

14. La souscription sect_poc ne reste JAMAIS active hors des fenêtres calées
    grille M1 (mesure §16.3 : autosuspend bloqué ≈ 180 CU-h/cycle — budget
    Free fichu). Le timer est la seule porte.

## 17. Phase 3 exécutée — lectures analytiques locales + DR runbook (SECT-REPLICA-3, 11 octobre 2026)

Feu vert de l'exploitant : « continu la phase suivante » — §6 phase 3
exécutée le jour même, POC §16 étant concluant (RPO 30 min, coût ≈ 0 CU).

### 17.1 Lectures analytiques locales derrière feature flag (§6 ✔)

- **Mécanisme** : `REPLICA_DATABASE_URL` (vide = OFF — comportement 100 %
  inchangé). Pool dédié `db.NewReplica` : minuscule (MaxConns 4, MinConns 0,
  idle 60 s — le cluster 5433 ne consomme rien au repos), même
  `QueryExecModeDescribeExec` que le pool primaire (sémantique RLS identique,
  cf. le bug RLS-FIX — zéro divergence).
- **Périmètre (endpoints exports/agrégats SEULEMENT, §6)** : les routes
  ADMIN lecture-seule dont les requêtes ne lisent QUE des tables
  répliquées — `GET /api/logs` (AuditLog) et `GET /api/monitoring/endpoints`
  (RequestLog p50/p95). Toutes les autres lectures et TOUTES les écritures
  restent sur Neon (anti-décision 1). Les endpoints Reponse ne sont PAS
  éligibles (jointures Session/Question/User non répliquées).
- **Repli automatique** : réplique down/erreur → WARN journalisé + requête
  rejouée sur Neon (le flag ne dégrade JAMAIS le service — la source de
  vérité reste Neon). Boot résilient : réplique injoignable au démarrage →
  API démarre sans le flag (ré-armable au restart suivant).
- **Instrumentation observable** : en-tête `X-Sect-Read-Source`
  (`replica`/`primary`/`primary-fallback`) + section `replica` dans
  `/api/monitoring/overview` (enabled/up/latencyMs).
- **Sécurité réseau** : réseau docker FIXE `sect` 172.28.0.0/24 (compose) ;
  le cluster 5433 n'écoute QUE `localhost,172.28.0.1` (jamais 0.0.0.0) ;
  pg_hba scopé `172.28.0.0/24 scram-sha-256` ; rôle applicatif
  `neondb_owner` créé LOCALEMENT `NOSUPERUSER NOBYPASSRLS` (le nom que les
  policies `TO neondb_owner` attendent — zéro dérive de schéma, la
  checklist double-cible §16.5 reste vraie) + grants `SELECT` sur les 3
  tables répliquées UNIQUEMENT. Security List OCI fermée sur 5433
  (anti-décision 3 : rien d'exposé publiquement).

### 17.2 Runbook §3.8 « Reprise sur réplique OCI » + outillage DR (§6 ✔)

- **`ops/replica/dr_gate.sh`** : garde de santé LECTURE SEULE G1-G8
  (cluster, base, fraîcheur, souscription, Neon public+pooler, Render,
  disque, backups) — verdict GO/NO-GO. Decision support : la promotion
  reste HUMAINE (anti-décision 4).
- **`ops/replica/resync_sequences.sql`** : le geste de promotion §16.6 —
  `setval(max(colonne))` générique (pg_depend) + séquences autonomes
  listées pour resync manuel. Idempotent.
- **`ops/replica/dr_promote.sh`** : dry-run par défaut + plan affiché ;
  `--prepare-publication` (online, 0 coupure, idempotent : élargit la
  publication aux 85 tables + copie initiale fenêtrée — pré-positionnement
  recommandé avant les 5 établissements, §14.7) ; `--confirm PROMOUVOIR`
  (mot exact, symétrie failover.yml) : stop writers → sync finale
  best-effort → `DROP SUBSCRIPTION` (slot détachable : `SET (slot_name =
  NONE)` si origine morte) → grants RW → resync séquences → bascule DSN
  `.env` (ancien DSN conservé `# pre-dr-*`) → `up -d` + health + Discord.
- **Arbre de décision documenté (runbook §3.8)** : la promotion de la
  réplique « telle quelle » (3 tables) laisserait 82 tables vides — la
  reprise réelle passe par la **voie B** (restore break-glass du backup
  complet — chemin prouvé mensuellement) ou la **voie D** (réplique
  pré-positionnée par `--prepare-publication`, RPO 30 min sur TOUT).

### 17.3 Correction de l'ADR §6 : le retour vers Neon n'est PAS une réplication inverse

Le plan §6 phase 3 esquissait « réplication inverse : OCI publie → Neon
souscrit ». **Rejeté** : cela exigerait d'exposer 5433 publiquement
(anti-décision 3 — même temporairement ; les IP sources de Neon ne sont
ni documentées ni garanties) pour économiser un dump/restore de ~24 Mo.
Le retour documenté (runbook §3.8-C) : freeze écritures → `pg_dump` local
→ `pg_restore --clean --if-exists` dans Neon (le moteur prouvé par les
tests de restauration) → DSN restaurés → pipeline réplique relancé
(workflows idempotents). Minutes, zéro exposition, données identiques.

### 17.4 Exercice DR trimestriel (§6 ✔)

`dr-drill.yml` (dispatch + cron trimestriel sentinelle) : restore complet
chiffré du dernier backup → base éphémère `sect_drill` → resync séquences
→ **boot du conteneur API réel** (même digest que la prod,
`WORKERS_ENABLED=false` — zéro worker/écriture) sur le réseau fixe →
vérifs `/health`, `/api/health/db` (pool sur la base restaurée) et
`/api/logs` avec JWT ADMIN forgé (RLS + claims + données restaurées) →
teardown intégral (conteneur, base, identité escrow shred). La preuve du
chemin §3.8 sans toucher la production — miroir des rehearsals failback P2.

### 17.5 Anti-décisions — ajout

15. Les lectures analytiques locales ne JAMAIS servies par la réplique
    sans repli Neon (le feature flag dégrade la latence, jamais la
    disponibilité — `X-Sect-Read-Source: primary-fallback` observable).
16. Le rôle applicatif local ne reçoit les grants RW (INSERT/UPDATE/
    DELETE) QUE par `dr_promote.sh --confirm PROMOUVOIR` — en régime
    normal il est SELECT-seul sur les 3 tables répliquées.

### 17.6 Exécution réelle du drill + pièges résolus en conditions (11/10, runs #38127309915→#38128653822)

L'exercice DR a été exécuté le jour même — 5 itérations de réalité avant
le **SUCCESS** (run #38128653822) :

- **Preuve complète** : restore chiffré du backup daily/2026-10-11 →
  `sect_drill` (85/85 tables, counts exacts) → grants → **resync séquence**
  (`RequestLog_id_seq` → 4986) → **boot du conteneur API réel** (digest
  prod, `WORKERS_ENABLED=false`) → `/health` 200, `/api/health/db` up
  (0 ms local), **`/api/logs` = 2741 lignes via JWT ADMIN forgé + RLS**
  → teardown intégral + Discord. **Contrôle prod inclus** : après le
  ré-affirmation du mot de passe, `X-Sect-Read-Source: replica` sur le
  chemin public — le pool réplique de la prod s'est **auto-guéri** (les
  connexions pgx repartent seules, sans restart).
- **Piège n°1 — setval() fold les noms non quotés** : un nom de séquence
  en chaîne NON quoté est foldé en minuscules (`RequestLog_id_seq` →
  `requestlog_id_seq` inexistant). Corrigé : `pg_get_serial_sequence()`
  (nom proprement quoté + couvre serial ET identity).
- **Piège n°2 — les globals de restauration CLOBBRENT le mot de passe
  local** : le `pg_dumpall --globals` de Neon contient
  `ALTER ROLE neondb_owner PASSWORD '<Neon>'` → tout restore (test
  mensuel OU drill) écrase le mot de passe local des lectures phase 3 →
  le pool réplique passe en 28P01 → repli Neon silencieux (feature OFF).
  Contre-mesure : le restore **ré-affirme** le mot de passe local depuis
  `/opt/sect/.env` après les globals (sect_restore_test.sh + drill).
- **Piège n°3 — parse JSON en shell** : `json.loads('''$VAR'''`) mange
  les `\"` du JSON embeddé → échec silencieux → faux négatif (les
  données étaient là dès la 1ʳᵉ itération). Règle : toujours passer par
  un fichier.
- Ancillary : la lecture ADMIN out-of-band doit passer par le DSN DIRECT
  (BYPASSRLS) — le DSN pooler sans claims = RLS User_select = 0 ligne ;
  et l'image OCI Ubuntu porte un `INPUT REJECT icmp-host-prohibited`
  par défaut (iptables-persistent) → toute écoute sur une IP docker
  bridge exige une règle ACCEPT explicite + persistance.

## 18. Les 4 actions d'exploitation post-phase 3 (SECT-OPS-1, 11 octobre 2026)

Décision de l'exploitant (11/10, chat) : « met en ouvre toute ces action et
décide selon tes recommandation » — les 4 actions en attente de §17 sont
exécutées de bout en bout, avec les arbitrages indiqués ci-dessous.

### 18.1 Action 1 — Pré-positionnement EXÉCUTÉ : publication 84 tables, RPO 30 min sur TOUT (voie D prête)

- **Décision (déléguée, exécutée)** : élargir la publication AVANT les
  5 établissements (déclencheur §14.7), pour que la réplique soit
  « promotion-ready » (voie D du runbook §3.8) — au lieu de 3 tables
  sur 87 objets.
- **Livrés** : workflow `dr-prepare-publication.yml` (dispatch manuel —
  à lancer à :15/:45, hors fenêtres grille :02/:32) ; `dr_promote.sh`
  durci (auto-guérison seeds + sync workers 4 + timeouts 3600 s) ;
  `replica-status.yml` enrichi (noms des tables en attente + lignes
  locales + erreurs journal 5433 — le diagnostic qui a résolu le piège
  n°4 ci-dessous).
- **Preuve (runs #38131341078 → #38133382381, 11/10 10:13→10:51)** :
  publication `sect_poc` = **84 tables** côté Neon (85 objets publics
  − `schema_migrations`, tenu localement par golang-migrate) ; côté
  réplique **84/84 en état 'r'**, convergence 5-10 s, souscription
  re-DISABLE (grille M1 préservée, autosuspend intact) ; 0 slot zombie
  restant sur Neon.
- **Ce que ça change** : en cas de DR, la voie D (promotion) reprend
  TOUTES les tables à RPO ≤ 30 min — la voie B (restore nightly)
  reste le chemin mensuellement prouvé. `schema_migrations` n'est PAS
  répliqué : la réplique tient son propre registre (mêmes 134
  migrations, vérifiées par le fresh-run §16.5).

### 18.2 Action 2 — Escrow physique : package prêt-à-imprimer LIVRÉ (le geste final reste humain)

- Livré dans la sandbox : `download/escrow/ESCROW-SECT-age.pdf` (A4,
  imprimable tel quel) — QR code de la clé privée **vérifié machine**
  (le QR du PDF décode exactement la clé de 74 caractères — zéro risque
  de retranscription), clé en clair monospace, clé publique
  d'empreinte, avertissement, procédure de test mensuel, lignes de
  signature déposée/reçue. Source HTML + PNG fournis.
- **Ce qui reste à l'exploitant (5 minutes, non automatisable)** :
  imprimer → sceller → coffre (escrow n°2 papier), copie hors site ou
  USB si double papier refusé ; l'escrow n°1 (password manager) reste
  la première copie ; détruire ensuite les copies de travail.
- Rappel (anti-décision 11) : les deux escrows perdus = backups
  DÉFINITIVEMENT illisibles — c'est voulu.

### 18.3 Action 3 — Mesure 48 h §13.6 : baseline posée + surveillance outillée (verdict 12-13/10)

- **Fenêtres de mesure** : M1 live depuis le 10/10 21:51 UTC → verdict
  48 h le **12/10 21:51 UTC** ; phase 3 complète (lectures locales +
  fenêtres) depuis le 11/10 09:37 → fenêtre post-phase-3 complète le
  **13/10 09:37**.
- **Baseline (11/10 ~10:00, operations API, éveil reconstruit)** :
  depuis M1 (12,5 h) : **6,95 h éveil → 1,74 CU → 3,35 CU/j** (SOUS le
  seuil de ré-examen de 3,5 CU/j) ; 49 cycles suspend/start sur 24 h
  (2,0/h contre ~4/h attendus — nuits clairsemées). Les 24 h
  glissantes (4,62 CU/j) mélangent le pré-M1 : non représentatives.
- **Outillage** : panneau CU live du dashboard sandbox (éveil reconstruit
  + cycles + verdict vs 3,5 CU/j, rafraîchi à l'ouverture) ; baseline
  JSON archivée (`download/cu-measure/operations-baseline-*.json`).
- **Lecture du verdict** : > 3,5 CU/j soutenu hors examens → réexaminer
  (N2 Launch, §13.6 inchangé). NB : les sondes ADMIN (drills, restores,
  ce pré-positionnement) réveillent Neon quelques minutes chacune — à
  retrancher mentalement du verdict (≈ 0,02 CU par réveil de 5 min).

### 18.4 Action 4 — Reclaim OCI : verdict fenêtre partielle + PLAYBOOK (décision : rester Always Free)

- **Mesures fraîches (11/10 10:50, Monitoring API, p95 sur 30 min)** :
  CPU **19,93 %** (24 h : 17,72 % — max 52,97 %), mémoire **6,23 %**,
  réseau ~2,2 GiB rx / 3,2 GiB tx par 24 h (0,22/0,32 Mbps moyens).
  Les 3 axes sont SOUS les seuils « idle » (< 20 %) — mais la fenêtre
  ne couvre que 3,4 j (création 08/10 01:12) et ce sont des journées
  de travail lourd (drills, restores, réplications) : le régime de
  croisière mesuré le 10/10 était CPU p95 9-13 %.
- **Fenêtre 7 j complète le 15/10 01:12 UTC.** Le signal opérationnel
  reste l'EMAIL OCI (pré-avis avant tout stop) — à surveiller.
- **Décisions (déléguées, exécutées)** : (a) rester Always Free — ne
  PAS gamer les métriques (charge factice = anti-pattern, détection
  certaine à terme) ; (b) ne PAS convertir en PAYG sans décision
  explicite de l'exploitant (moyen de paiement + risque de dépassement
  du quota 3 000 OCPU-h/mois) ; (c) le risque est couvert
  structurellement : backups chiffrés Object Storage décorrélés de la
  VM → un reclaim ne perd AUCUNE donnée SECT (runbook §7) ; (d) le
  N3 futur (VM primaire) ferait mécaniquement passer le CPU au-dessus
  du seuil.
- **Playbook livré (runbook §9)** — inclut le geste CRITIQUE nouveau :
  si la VM meurt/reclaimée, **dropper le slot `sect_poc` (et tout slot
  `pg_*_sync_*`) sur Neon** — un slot orphelin retient le WAL
  indéfiniment contre la limite de stockage 1 GiB (piège n°5).

### 18.5 Pièges résolus en conditions (prepare-publication, runs du 11/10)

1. `format('%L', t)` produit un LITTÉRAL chaîne (`'public.X'`) —
   identifiant invalide pour `ALTER PUBLICATION` (run #38131147494).
   Toujours `quote_ident()` pour les identifiants en SQL dynamique.
2. `to_regclass('public.'||nom)` sur un nom CamelCase NON quoté fold
   en minuscules → `NULL` → le filtre éliminait SILENCIEUSEMENT toutes
   les tables applicatives (la requête ne retenait que
   `schema_migrations`, la seule minuscule). La preuve : la sonde de
   validation pré-push n'a rien vu — seul l'exécution réelle l'a révélé.
3. `schema_migrations` ne doit JAMAIS être publié : golang-migrate la
   remplit sur la réplique → la COPY initiale violerait sa PK.
4. **Les SEEDS de migrations peuplent la réplique** (Plan 3,
   BadgeDefinition 7, AlertingRule 12 lignes — diagnostic
   replica-status 11/10) → COPY initiale = violation PK en boucle →
   sync workers en retry infini (81 tables sychronisées, 3 bloquées).
   Fix générique (dans `dr_promote.sh`) : purge des lignes locales des
   tables en attente, en mode `session_replication_role = replica`
   (FK désarmés). **JAMAIS `TRUNCATE CASCADE`** : il viderait des
   tables déjà 'r' qui les référencent (ex. User→Plan).
5. **Slots tablesync zombies** : chaque worker tué (échec, fenêtre
   interrompue, annulation) abandonne un slot `pg_<sub>_sync_<relid>...`
   qui RETIENT le WAL côté Neon (limite 1 GiB). Le nom étant
   déterministe par table, un retry réussi le nettoie ; sinon :
   `SELECT pg_drop_replication_slot(...)` sur slots inactifs.
6. CI : `grep` sans correspondance = exit 1 sous `set -e` → les
   diagnostics « preuves » tuaient le workflow APRÈS le succès
   (2 runs rouges à tort) — `|| true` systématique sur les greps.
7. **drone-ssh `script_stop` + `else/elif` = exit 1 SILENCIEUX** — la
   règle documentée dans l'en-tête de `dr-drill.yml` s'applique à TOUT
   workflow : `replica-status` a marché 10:44 (branche *then*) puis est
   mort à 11:07 en prenant le `else` pour la première fois (19 ms, zéro
   message) ; `dr-prepare` est mort 2× pareil sur son `if/else` final.
   Patron obligatoire : `if … then … fi` seuls (deux `if` à conditions
   opposées), jamais de `else`/`elif` dans un script drone-ssh.

### 18.6 Anti-décisions — ajout

17. Le pré-positionnement (voie D prête) ne PROMEUT rien : la
    promotion reste `--confirm PROMOUVOIR` par décision humaine
    (anti-décision 4 inchangée ; le workflow refuse tout mode confirm).
18. Aucune charge factice pour élever les métriques reclaim au-dessus
    de 20 % : la réponse au pré-avis OCI est le playbook §9 du
    runbook, pas la triche sur la mesure.
19. Pas de conversion PAYG de la tenancy sans décision explicite de
    l'exploitant (moyen de paiement + vigilance quota) — l'option est
    documentée dans le playbook comme parade de dernier recours.

## 19. Décision de reconduction de l'option C — trois variantes examinées et écartées (SECT-ARCH-1, 11 octobre 2026)

### 19.1 Contexte et décision

À la veille d'embarquer les 5 établissements, l'exploitant a
stress-testé l'architecture avec trois variantes successives. Après
expertise contradictoire (mesures à l'appui, §19.2), la décision est
rendue le 11/10 : **« super, on garde le plan de l'option C »** —
l'option C est reconduite sans modification pour l'embarquement.

### 19.2 Mesures effectuées pendant l'examen (11/10, API control plane — ne réveille pas le compute)

- **Le plan Free est attaché à l'ORGANISATION** (`org-gentle-pond-54934166`,
  `plan: "free"` — `GET /users/me/organizations`), pas au projet : un
  second projet Neon **puiserait dans le même réservoir de 100 CU-h/mois**.
- Consommation du cycle : **85 508 s de compute = 23,75 CU-h** au 11/10
  13:00 UTC (`GET /projects/{id}/consumption`), soit ~2,3 CU/j —
  trajectoire ~70/100 en fin de cycle.
- État live : base 47 Mo / 1 024 Mo ; CU/j M1 = 3,42 (sous le seuil 3,5).
- Politique Supabase free vérifiée (recherche web 11/10) : **pause du
  projet après ~7 jours sans activité base suffisante** ; Supabase
  documente la réplication **sortante** (publisher), l'abonnement
  **entrant** (subscriber) est « plus délicat » ; limites free : 500 Mo
  de base, 5 Go d'egress/mois, 2 projets.

### 19.3 Les trois variantes et leurs verdicts

**Variante (a) — « Neon 2 » comme base de sauvegarde + PG primaire sur
VM + Neon 1 pour le backend** : ÉCARTÉE. Trois défauts rédhibitoires :
(1) un secours chez le même fournisseur que le primaire est corrélé
(incident Neon ou souci de compte = secours et original perdus
ensemble — viole l'esprit D1) ; (2) le second projet partage le même
pool de CU (mesuré §19.2) — ce n'est pas de la redondance, c'est un
troisième consommateur ; (3) « Neon 1 pour le backend » + primaire sur
VM = deux sources de vérité = réplication bidirectionnelle = pertes
silencieuses (anti-décision 1, §4.1).

**Variante (b) — N3 (inversion, PG primaire sur la VM)** : ÉCARTÉE à ce
stade, examinée sérieusement. L'analyse a produit un argument décisif
nouveau : **la chaîne P2 Render devient inopérante pour la DB** — Render
ne peut plus servir que si la VM vit (ou en exposant 5433 publiquement,
anti-décision 3) ; la reprise devient OCI-only (WAL-G, restauration
ARM→ARM uniquement — un backup physique ne se restaure pas de aarch64
vers x86_64, donc pas de retour rapide vers Neon) ; et une éventuelle
réplique de sortie vers Neon exigerait un endpoint éveillé 24 h/24
(~183 CU-h/mois > 100 gratuits). Aucun déclencheur §14.7 n'est atteint :
rester sur l'option C. N3 reste l'option souveraineté, exécutable le
jour d'un déclencheur via la voie D (`dr_promote.sh`, déjà déployé).

**Variante (c) — « P3 » : réplique Supabase + Render secondaire branché
dessus** : la v1 de l'exploitant (souscription entrante VM→Supabase +
VM→Neon) a été restructurée en v2 viable (§19.4), puis **ARCHIVÉE sans
construction** : elle couvre le double décès de fournisseurs
(probabilité quasi nulle — Neon et la VM n'ont aucun défaut commun) au
prix d'un RPO filet 12-24 h, d'un mur à 500 Mo et d'une gouvernance
supplémentaire. Le coût permanent dépasse le bénéfice marginal tant
qu'aucun déclencheur n'est atteint.

### 19.4 Design « P3 v2 » archivé (pour ne pas le perdre)

Si un jour la contrainte « 0 € absolu + établissements embarqués » le
justifie, la recette validée par expertise est la suivante :

1. **Aucune souscription entrante** : le flux reste sortant uniquement.
   Un workflow `p3-refresh` (GitHub Actions) réutilise le **moteur de
   restore du pipeline de backup existant** (download → déchiffrement
   age → pg_restore vers le DSN Supabase) — jamais de connexion
   entrante vers `VM:5433` (anti-décision 21).
2. Le refresh quotidien **est lui-même l'activité** qui empêche la pause
   à 7 jours — le risque de standby silencieux disparaît par
   construction. Vérification counts vs manifest + Discord (échec = LOUD).
   Chaque refresh = un test de restauration vivant (la devise « un
   backup non testé n'existe pas » passe du mensuel au quotidien).
3. **Activation humaine uniquement** (jamais automatique) : bascule du
   `DATABASE_URL` de Render vers Supabase + resync des séquences
   (`resync_sequences.sql` existant).
4. **Règle d'or anti-fork** : dès que P3 prend UNE écriture, P3 DEVIENT
   la source de vérité ; tout primaire qui ressuscite passe en lecture
   seule jusqu'à réconciliation documentée (dump/restore). Pas deux
   primaires, même en DR.
5. Limites à assumer : 500 Mo (mur plus bas que le GiB Neon — même
   déclencheur §14.7) ; RPO du filet 12-24 h (raffraissable 4×/jour en
   session d'examens) ; **Supabase n'est PAS une sauvegarde** — le
   bucket OCI chiffré reste LA référence ; retour arrière ~1 h par
   dump/restore.
6. Conditions de réexamen : déclencheur §14.7 atteint + contrainte 0 €
   maintenue + besoin réel d'un filet sous le double décès. Préalables
   de vérification (30 min) : comportement réel de la pause par activité
   de restore, privilèges du rôle postgres Supabase (publications
   entrantes), extensions du schéma, latence Render→Supabase.

### 19.5 Anti-décisions — ajout

20. Pas de second projet Neon comme secours du premier : même réservoir
    de CU (plan attaché à l'organisation, mesuré 11/10 §19.2) et même
    fournisseur que le primaire — un secours doit être décorrélié (D1).
    Le seul usage légitime d'un second projet Neon serait un
    environnement dev/staging, déjà couvert par le PG local de la VM à
    0 CU.
21. Aucun flux entrant vers la base de la VM : « l'architecture ne
    réceptionne jamais de connexion base » est un invariant de sécurité
    (exposer 5433 à des IP egress tierces non garanties = régression de
    surface d'attaque sur le maillon le plus scruté).
22. Le filet P3 ne se construit pas sans décision explicite de
    l'exploitant sur un déclencheur §14.7 ; s'il est construit, le
    moteur est le pipeline de backup (restore sortant), jamais une
    souscription entrante (§19.4-1).
