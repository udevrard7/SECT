# ADR-0008 : Bibliothèque P4 — dimension sociale (exécution de l'ADR-0007 §P4)

| Champ | Valeur |
|---|---|
| **Statut** | Accepté (exécution de la phase P4 de l'ADR-0007) |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Parent** | ADR-0007 (bibliothèque numérique — §P4 sketch) |
| **Supersedes** | — |

## Contexte

L'ADR-0007 est livré jusqu'à P3 inclus : catalogue, lecture mesurée,
traçabilité chapitre, paquet enseignant. Le sketch §P4 prévoit la dimension
sociale : annotations, file de propositions (G1), badges « lecteur assidu »,
veille thématique, et le job de purge R2 renvoyé à P4 par §stockage
(« soft delete = ligne seulement ; purge des octets R2 = job P4 »).

Deux découvertes de l'audit pré-P4 (SECT-R2-AUDIT-1) et de l'exploration du
système de badges conditionnent cette ADR :

1. **R2 est opérationnel en prod** (round-trip prouvé) — la purge d'octets
   devient réelle.
2. **Le mécanisme d'attribution des badges n'existe pas côté Go** : les 31
   `BadgeProgression` de la prod viennent de l'ancienne stack Prisma ;
   `POST /api/badges` est un no-op documenté ; aucun writer. De plus les
   policies du repo sont `TO neondb_owner` (inopérantes sous `sect_app`
   NOBYPASSRLS — drift avec la prod qui a `TO PUBLIC`, piège documenté en
   000117), et `BadgeProgression_modify` est self-only — un décerneur
   système serait bloqué. P4 est l'occasion de réparer cette fondation :
   le badge « lecteur assidu » sera **le premier badge décerné par le
   backend Go**.

## Décision

### 1. `OuvrageAnnotation` (000127) — annotations de page

```sql
CREATE TYPE "VisibiliteAnnotation" AS ENUM ('PRIVEE', 'FILIERE', 'ETABLISSEMENT');
CREATE TABLE "OuvrageAnnotation" (
  "id" TEXT NOT NULL,
  "ouvrageId" TEXT NOT NULL,          -- FK → Ouvrage ON DELETE CASCADE
  "userId" TEXT NOT NULL,             -- FK → User ON DELETE CASCADE
  "filiereId" TEXT,                   -- dénormalisée du créateur (PRIVEE si NULL)
  "page" INTEGER NOT NULL,            -- 1..100000 (MaxPageOuvrage)
  "contenu" TEXT NOT NULL,            -- 1..2000 car.
  "visibilite" "VisibiliteAnnotation" NOT NULL DEFAULT 'PRIVEE',
  "createdAt"/"updatedAt" TIMESTAMP(3)
);
```

- **`filiereId` dénormalisée** (la filière de l'auteur à la création) :
  évite tout `JOIN "User"` dans la policy (leçon P3 : un JOIN dans une
  policy hérite de la RLS de la table jointe — on utilise
  `current_user_filiere_id()`, helper SECURITY DEFINER 000020).
- `visibilite = 'FILIERE'` avec auteur sans filière → 400 (validation
  usecase, jamais de fallback silencieux).
- Policies (TO PUBLIC, pattern 000124 — délégation EXISTS aux conditions de
  `Ouvrage_select` : etab + corbeille + droits expirés, UN seul endroit) :
  - `select` : `(userId = current_user_id() OR (visibilite='FILIERE' AND
    filiereId = current_user_filiere_id()) OR visibilite='ETABLISSEMENT')`
    ∧ ouvrage visible ;
  - `insert` : `userId = current_user_id()` ∧ ouvrage visible (WITH CHECK) ;
  - `update`/`delete` : propriétaire uniquement (l'auteur édite/supprime
    SES annotations, même visibles par d'autres).
- API : `GET/POST /api/ouvrages/{id}/annotations`,
  `PATCH/DELETE /api/ouvrages/{id}/annotations/{annotationId}` — tous
  rôles etab (le lecteur étudiant annote ; l'enseignant annote en
  ETABLISSEMENT pour guider la lecture).

### 2. `OuvrageProposition` (000127) — file G1 RESPONSABLE→ADMIN

```sql
CREATE TYPE "StatutProposition" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');
CREATE TABLE "OuvrageProposition" (
  "id" TEXT NOT NULL,
  "etablissementId" TEXT NOT NULL,    -- FK → Etablissement
  "proposantId" TEXT NOT NULL,        -- FK → User (RESPONSABLE)
  -- métadonnées demandées (miroir Ouvrage, SANS fichier : le dépôt reste ADMIN)
  "titre" TEXT NOT NULL, "auteurs"/"editeur"/"isbn"/"langue"/"themes"/"description" TEXT,
  "categorie" "CategorieOuvrage" NOT NULL, "anneePublication" INTEGER,
  "filiereId" TEXT, "niveau" "NiveauEtude",
  "licenceOrigine" TEXT NOT NULL,     -- garde-fou droits (§risques ADR-0007)
  "statut" "StatutProposition" NOT NULL DEFAULT 'EN_ATTENTE',
  "motifRefus" TEXT,                  -- requis si REFUSEE
  "trancheParId" TEXT,                -- FK → User (ADMIN)
  "trancheAt" TIMESTAMP(3),
  "ouvrageId" TEXT,                   -- FK → Ouvrage : la référence déposée
  "createdAt"/"updatedAt"
);
```

- Flux G1 : RESPONSABLE propose (metadata seulement — **le dépôt du PDF
  reste un acte ADMIN**, G1 inchangé) → ADMIN tranche → notif
  `PROPOSITION_TRANCHEE` au proposant. `ACCEPTEE` : le dépôt existant
  `POST /api/ouvrages` gagne un champ `propositionId` optionnel qui lie
  l'ouvrage créé (exige `ACCEPTEE`, sinon 409). `REFUSEE` : `motifRefus`
  obligatoire (400 sinon).
- Le proposant peut retirer sa proposition tant qu'elle est `EN_ATTENTE`
  (DELETE). Pas d'édition après soumission (l'historique de la file est
  intègre).
- Policies : `select` = ADMIN (∀ etab) ∨ propriétaire ; `insert` =
  `is_responsable() ∧ proposantId = current_user_id()` ; `update` =
  ADMIN seul (le tranche) ; `delete` = ADMIN ∨
  (`proposantId = current_user_id() ∧ statut = 'EN_ATTENTE'`).
- API : `GET/POST /api/ouvrages/propositions`,
  `POST /api/ouvrages/propositions/{id}/trancher` (ADMIN),
  `DELETE /api/ouvrages/propositions/{id}`. Littéraux AVANT `/{id}`
  (leçon router P3).

### 3. Badges « lecteur assidu » (000128) — premier writer Go

- **Seed** `BadgeDefinition` : `cle='lecteur_assidu'`, `categorie=
  'ENGAGEMENT'`, `roleCible=NULL` (tous rôles — la bibliothèque est
  universelle), `niveaux = {BRONZE,ARGENT,OR,DIAMANT}`, `ordre=50`
  (pattern INSERT…ON CONFLICT (id) DO NOTHING, migration 000033).
- **Métrique** : `tempsTotalSec` cumulé de `OuvrageLecture` (la lecture
  mesurée P2 = la matière première). Paliers (secondes) :
  BRONZE 1 800 (30 min) · ARGENT 7 200 (2 h) · OR 21 600 (6 h) ·
  DIAMANT 72 000 (20 h).
- **Réparation de fondation (000128)** : normalisation des 4 policies
  badges en `TO PUBLIC` (alignement repo↔prod, leçon 000117) +
  `BadgeProgression_modify` gagne `OR is_system()` (le décerneur système
  peut écrire — pattern `_all_system` 000117). Sans cela, aucun writer
  Go ne peut fonctionner sous `sect_app`.
- **Décerneur** : `OuvrageSocialUseCase.EvaluateLecteurAssidu(ctx, claims)` —
  1 `SUM(tempsTotalSec)` + 1 upsert `ON CONFLICT ("userId",
  "badgeDefinitionId")` (UNIQUE 000003). Appelé UNIQUEMENT depuis
  `POST /api/badges` (le no-op devient réel — réponse `newlyUnlocked`
  enfin remplie, shape `BadgeWithProgress[]` que le frontend consomme
  déjà : RewardToast + ring). Décision de design : NE PAS évaluer dans
  le heartbeat `PUT /{id}/lecture` — la montée de niveau y serait
  consommée et `newlyUnlocked` serait vide au POST on-mount du
  dashboard (le RewardToast ne se déclencherait jamais). Le badge est
  donc décerné quand le lecteur REVIENT sur son dashboard — les 4
  dashboards font POST au montage, c'est le flux naturel.
- `newlyUnlocked` = badges dont le niveau vient d'augmenter (première
  obtention BRONZE ou montée de palier). Notification `BADGE_DEBLOQUE`
  (Dispatcher, fire-and-forget) sur chaque nouvelle obtention.
- `valeurActuelle` = secondes cumulées ; `valeurPalier` = seuil du
  prochain niveau (DIAMANT atteint → palier = seuil DIAMANT, progression
  100 %) ; `dateObtention` = date du niveau courant.

### 4. `OuvrageVeille` (000127) — veille thématique

```sql
CREATE TABLE "OuvrageVeille" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,             -- FK → User CASCADE
  "etablissementId" TEXT NOT NULL,    -- cloisonnement G2
  "terme" TEXT NOT NULL,              -- 2..100 car.
  "categorie" "CategorieOuvrage",     -- filtre optionnel
  "createdAt"/"updatedAt",
  UNIQUE ("userId", "terme")
);
```

- Au dépôt d'un ouvrage (Upload, APRÈS l'INSERT réussi, sous
  `SystemClaims` — les veilles des autres utilisateurs ne sont pas
  lisibles sous les claims de l'ADMIN) : matching du `terme` contre
  `titre/auteurs/themes/description` (ILIKE) + filtre catégorie →
  notification `OUVRAGE_VEILLE` à chaque abonné du même
  établissement (hors le déposant). Best-effort, jamais bloquant.
  Une veille vit jusqu'à sa suppression (pas d'état inactif —
  supprimer/recréer une recherche sauvegardée est sans coût).
- **Bonus recherche** : le filtre `q` du catalogue étendu à `themes`
  (colonne jamais cherchée en P1 — la veille et la recherche partagent
  la même surface de matching).
- API : `GET/POST /api/ouvrages/veilles`, `DELETE
  /api/ouvrages/veilles/{id}` — propriétaire seul. UI : bouton
  « Créer une alerte » dans la barre de recherche du catalogue + chips
  des veilles actives.

### 5. Purge R2 (000128 + worker) — corbeille vidée à 30 jours

- `BibliothequePurgeWorker` (pattern cleanup_worker : ticker 1 h +
  premier check au boot) : `Ouvrage` soft-déletés depuis > 30 jours →
  1. `INSERT AuditLog` (action `OUVRAGE_PURGE_AUTO`) **avant** le
     DELETE ;
  2. hard `DELETE` (nouvelle policy `Ouvrage_delete` `TO PUBLIC USING
     (is_system())` — la seule porte, l'app ne peut jamais hard-deleter) ;
     CASCADE emporte `OuvrageLecture`/`OuvrageSection`/
     `AlignementOuvrage`/`OuvrageAnnotation` (cohérent : plus de
     référence = plus de métriques sociales) ;
  3. suppression de l'objet R2 **post-commit** (pattern corbeillePurge —
     jamais dans la tx).
- La corbeille UI reste inchangée (restore < 30 jours) ; le quota
  stockage se libère à la purge (`SumTaillesByEtablissement` compte les
  soft-deleted jusqu'au purge).

### 6. Watermarking — périmètre explicite

- **Inclus P4** : overlay UI dans le lecteur (email + date, répété,
  `pointer-events-none`, `select-none`) — dissuasion visuelle à coût
  nul, au-dessus de l'iframe.
- **Exclu P4** : watermarking des octets (stamp PDF serveur) — exigerait
  une dépendance PDF lourde (pdfcpu) et une re-transformation par
  lecteur ; renvoyé à une éventuelle P5. Motif : le rapport
  dissuasion/coût est défavorable tant que la lecture est in-browser
  par URL présignée 15 min + bannière + audit.

## Plan de migrations (golang-migrate uniquement)

| N° | Contenu | Down |
|---|---|---|
| 000127 | enums `VisibiliteAnnotation`/`StatutProposition` + `OuvrageAnnotation` + `OuvrageProposition` + `OuvrageVeille` + indexes + FK + RLS same-migration + ASSERTs | DROP ×3 tables + ×2 types |
| 000128 | seed `BadgeDefinition` lecteur_assidu + normalisation 4 policies badges `TO PUBLIC` (+ `is_system` sur modify) + policy `Ouvrage_delete` (is_system) + ASSERTs | seed inversé + policies restaurées à l'état 000007 + DROP policy delete |

Règles transverses héritées : RLS dans la même migration (000121) ;
params plpgsql typés enum (ENUM-SWEEP) ; ASSERTs (000122) ; `TO PUBLIC`
systématique (000117) ; tabs Go / SQL 2 espaces.

## Critères d'acceptation

- Annotation PRIVEE invisible des autres ; FILIERE visible des pairs de
  la filière ; ETABLISSEMENT visible de l'étab — et jamais sur un ouvrage
  corbeille/expiré (RLS déléguée).
- Proposition RESPONSABLE → statut EN_ATTENTE → ADMIN tranche (refus
  avec motif ; acceptation + dépôt lié via `propositionId`) ;
  notifications reçues des deux côtés ; retrait possible avant tranche.
- Badge lecteur assidu décerné au fil de la lecture (paliers exacts),
  visible dans le dashboard étudiant, `newlyUnlocked` non vide à la
  première obtention, notification émise.
- Veille : un nouveau dépôt matchant le terme notifie l'abonné.
- Corbeille : un ouvrage soft-déleté depuis > 30 j est purgé (ligne +
  octets R2 + audit) ; restore impossible après purge.
- 0 table sans RLS (80 → 83 tables, toutes couvertes) ; résidu E2E 0.

## Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| Spam de notifications veille | 1 notif par dépôt MATCHANT (pas par veille morte) ; `actif=false` désactivable ; terme min. 2 car. ; best-effort |
| Annotation illégale (contenu) | Longueur bornée 2 000 ; visibilité max ETABLISSEMENT (jamais public) ; suppression propriétaire ; audit possible via DB |
| Purge irréversible | 30 j de grâce + AuditLog AVANT delete + policy is_system (l'app ne peut jamais) ; première exécution au boot uniquement après migration |
| Concurrence upsert badges | `ON CONFLICT ("userId","badgeDefinitionId")` (UNIQUE 000003) — dernier écrivain gagne, la métrique est recomputée (idempotent) |
| Dérive policies badges (drift repo) | 000128 normalise + ASSERTs vérifient TO PUBLIC + is_system (le harnais dry-run rejoue depuis 0) |

## Conséquences

- La bibliothèque devient sociale : l'étudiant annote, le responsable
  propose, la communauté reçoit les nouveautés — la boucle
  adoption↔valeur de l'ADR-0007 est fermée.
- Le backend Go décerne son premier badge : la fondation `BadgeProgression`
  (writer + policies réparées) sert tous les futurs badges (les 31
  définitions existantes retrouvent un chemin d'attribution).
- La corbeille a une durée de vie définie (30 j) → le stockage R2 est
  borné par le quota + la purge automatique.
