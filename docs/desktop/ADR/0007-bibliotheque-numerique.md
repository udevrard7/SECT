# ADR-0007 : Bibliothèque numérique — la couche normative de SECT

| Champ | Valeur |
|---|---|
| **Statut** | Accepté (architecture cible, livraison par phases P1→P4) |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

SECT est un *Système d'Évaluation* : la génération d'épreuves est traçable
depuis les supports de cours (`Question.documentId`, analyse IA avec
`themesDetectes`/`conceptsCles`, découpage `Chapter`). Aujourd'hui, rien ne
représente la **source normative** extérieure au cours : programmes officiels,
ouvrages de référence, recherche académique, pratique professionnelle.

Le modèle pédagogique retenu (transposition didactique, Chevallard) distingue
trois étages de savoir, chacun avec un propriétaire légitime distinct :

```
ÉTAGE 0 — SAVOIR SAVANT / NORMATIF           → la BIBLIOTHÈQUE (cette ADR)
  référentiels officiels · ouvrages de référence · recherche · pratique pro
        │  transposition didactique = travail HUMAIN de l'enseignant
        ▼
ÉTAGE 1 — SAVOIR À ENSEIGNER                 → le SUPPORT DE COURS (Document)
        │  génération traçable (chaîne existante, inchangée)
        ▼
ÉTAGE 2 — SAVOIR ÉVALUÉ                      → Questions, Épreuves, Résultats
  (la bibliothèque y revient en normatif : écart, conformité, audit)
```

Deux invariants structurels en découlent :

- **I1 — Le livre ne génère jamais.** Seul le support génère des questions.
  Un livre que le support ne couvre pas produirait une épreuve *hors programme
  effectif* (moteur classique de contestation de notes).
- **I2 — Le livre référence, le support enseigne.** Dans le feedback étudiant,
  le passage du support vient en premier (opérationnel), la référence au livre
  en approfondissement (normatif).

## Décisions de gouvernance (validées par le CTO)

| # | Décision | Motif |
|---|---|---|
| G1 | Dépôt réservé à l'ADMIN (super admin) en P1 ; file « proposer » RESPONSABLE→ADMIN en P4 | Contrôle éditorial, un seul point de responsabilité sur les droits |
| G2 | Catalogue **par établissement** (pas de fonds commun inter-établissements) | Cohérence stricte avec le RLS existant (leçon 000121 : scoping dès la création) |
| G3 | Ordre de livraison P1 → P2/P2.5 → P3 → P4 | Le paquet enseignant (P3) exige la bibliothèque (P1) et la traçabilité chapitre (P2.5) |

Poids normatif par catégorie (utilisée en P3 pour l'audit — jamais stockée,
toujours dérivée de la catégorie) :

| Catégorie (`CategorieOuvrage`) | Statut dans l'audit |
|---|---|
| `REFERENTIEL_OFFICIEL` | Normatif pur — la conformité se mesure À lui |
| `OUVRAGE_REFERENCE` | Référence normative — conformité croisée |
| `RECHERCHE_ACADEMIQUE` | Preuve — enrichit, ne norme pas |
| `PRATIQUE_PROFESSIONNELLE` | Contexte — ancre dans le métier |

## Options considérées

### Option A — Les livres comme lignes `Document` (discriminant de type)
- **Rejetée** : confusion catégorielle livre/support (la distinction fondatrice
  de cette ADR) ; pas de statut normatif ; pas de gestion de droits par ouvrage
  (licence, expiration) ; RLS de `Document` inadaptée (scope enseignant).

### Option B — Lecture sociale d'abord (pattern Perusall)
- **Rejetée** : non différenciant (Perusall existe) ; sans le cœur évaluation,
  pas de boucle normative. La dimension sociale arrive en P4, sur des fondations
  qui la rendent supérieure.

### Option C — Génération de questions depuis les livres
- **Rejetée** (invariant I1) : validité pédagogique (hors programme effectif),
  droits d'auteur (reproduction d'œuvre), et court-circuit de la transposition
  didactique — c'est-à-dire précisément l'expertise de l'enseignant.

### Option D — Fonds commun inter-établissements
- **Rejetée** (G2) : cassure de cohérence RLS ; un fonds commun est une
  évolution marquée, pas un choix de départ.

### Option E — Retenue : bibliothèque à statut normatif, couplée à l'évaluation
Dépôt ADMIN par établissement, lecture in-browser, déclaration
support↔référentiel par l'enseignant (assistée IA), indicateurs d'écart et de
conformité, audit de direction. **Le différenciateur concurrentiel est
l'écart support↔référentiel : aucun LMS ne peut le produire, car il exige
les deux chaînes à la fois — une génération traçable depuis les supports
(SECT l'a) et une bibliothèque à statut normatif (cette ADR).**

## Décision — Modèle de données

### P1 / migration `000123_bibliotheque_ouvrages` — le catalogue

```sql
CREATE TYPE "CategorieOuvrage" AS ENUM
  ('REFERENTIEL_OFFICIEL','OUVRAGE_REFERENCE','RECHERCHE_ACADEMIQUE','PRATIQUE_PROFESSIONNELLE');

CREATE TABLE "Ouvrage" (
  "id"                     TEXT PRIMARY KEY,
  "etablissementId"        TEXT NOT NULL REFERENCES "Etablissement"("id"),
  "titre"                  TEXT NOT NULL,
  "auteurs"                TEXT,          -- JSON array (pattern Document.themesDetectes)
  "categorie"              "CategorieOuvrage" NOT NULL,
  "editeur"                TEXT,
  "edition"                TEXT,
  "anneePublication"       INTEGER,
  "isbn"                   TEXT,
  "langue"                 TEXT,
  "filiereId"              TEXT REFERENCES "Filiere"("id"),   -- NULL = toutes filières
  "niveau"                 "NiveauEtude",                     -- NULL = tous niveaux (enum typé)
  "themes"                 TEXT,          -- JSON array de thèmes
  "description"            TEXT,
  "licenceOrigine"         TEXT NOT NULL, -- OBLIGATOIRE : droits déclarés (garde-fou §Risques)
  "dateExpirationDroits"   TIMESTAMP,     -- NULL = pas d'expiration
  "nomFichier"             TEXT NOT NULL,
  "cheminStockage"         TEXT,          -- clé R2 (NULL = mode DB-only dégradé, pattern Document)
  "tailleFichier"          INTEGER NOT NULL DEFAULT 0,
  "typeMime"               TEXT NOT NULL DEFAULT 'application/pdf',
  "telechargementAutorise" BOOLEAN NOT NULL DEFAULT false,   -- lecture in-browser par défaut
  "createdById"            TEXT NOT NULL REFERENCES "User"("id"), -- ADMIN dépositeur (audit)
  "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
  "deletedAt"              TIMESTAMP     -- soft delete (pattern Document/Epreuve)
);
CREATE INDEX "Ouvrage_etab_idx" ON "Ouvrage"("etablissementId") WHERE "deletedAt" IS NULL;
CREATE INDEX "Ouvrage_filiere_idx" ON "Ouvrage"("filiereId");
CREATE INDEX "Ouvrage_categorie_idx" ON "Ouvrage"("categorie");
ALTER TABLE "Ouvrage" ENABLE ROW LEVEL SECURITY;
```

Sémantique des colonnes de scoping (précision importante) :
`etablissementId` = **contrôle d'accès** (RLS) ; `filiereId`/`niveau` =
**recommandation** (filtrage UI/liste) — NULL signifie « pertinent pour tous »,
et non « caché ». Un étudiant voit le catalogue de son établissement ;
l'interface priorise sa filière et son niveau.

Policies RLS (helpers 000020) :

```sql
CREATE POLICY "Ouvrage_select" ON "Ouvrage" FOR SELECT USING (
  is_system() OR is_admin()
  OR ("etablissementId" = current_etablissement_id()
      AND "deletedAt" IS NULL
      AND ("dateExpirationDroits" IS NULL OR "dateExpirationDroits" > now()))
);
CREATE POLICY "Ouvrage_insert" ON "Ouvrage" FOR INSERT
  WITH CHECK (is_admin() OR is_system());
CREATE POLICY "Ouvrage_update" ON "Ouvrage" FOR UPDATE
  USING (is_admin() OR is_system());     -- soft delete/restore + toggles inclus
-- pas de policy DELETE : hard delete interdit (pattern IAUsage 000121)
```

- Lecteurs = tous les rôles de l'établissement (ENSEIGNANT, ETUDIANT,
  RESPONSABLE) — c'est la finalité « disponible pour les enseignants et
  étudiants » ; l'ADMIN global voit tout (is_admin()), y compris les ouvrages
  aux droits expirés (badge UI), qui sont **auto-masqués** pour les lecteurs.
- Écriture = ADMIN seul (G1) ; workers = is_system().

### P2 / migration `000124_bibliotheque_lecture` — la lecture mesurée

```sql
CREATE TABLE "OuvrageLecture" (
  "id"               TEXT PRIMARY KEY,
  "ouvrageId"        TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "userId"           TEXT NOT NULL REFERENCES "User"("id"),
  "dernierePage"     INTEGER NOT NULL DEFAULT 1,
  "pagesVues"        TEXT,       -- JSON {"12": 3} page → vues (pattern TEXT-JSON)
  "tempsTotalSec"    INTEGER NOT NULL DEFAULT 0,
  "derniereLectureAt" TIMESTAMP NOT NULL DEFAULT now(),
  "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("ouvrageId","userId")
);
ALTER TABLE "OuvrageLecture" ENABLE ROW LEVEL SECURITY;
-- select/insert/update : "userId" = current_user_id() (et ouvrage visible)
-- agrégats enseignant/admin : fonction SECURITY DEFINER (pattern 000116)
```

### P2.5 / migration `000125_question_chapter` — traçabilité chapitre (prérequis P3)

```sql
ALTER TABLE "Question" ADD COLUMN "chapterId" TEXT REFERENCES "Chapter"("id");
CREATE INDEX "Question_chapter_idx" ON "Question"("chapterId");
```

Pas de backfill (historiquement impossible) : NULL = héritage,
`documentId` reste la source primaire. Le feedback peut désormais citer
« support, chap. X » — valeur autonome (gestion des contestations),
indépendante de la bibliothèque.

### P3 / migration `000126_bibliotheque_alignement` — le paquet enseignant

```sql
CREATE TABLE "OuvrageSection" (            -- TOC curaté par l'ADMIN
  "id"         TEXT PRIMARY KEY,
  "ouvrageId"  TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "titre"      TEXT NOT NULL,
  "pageDebut"  INTEGER,
  "pageFin"    INTEGER,
  "ordre"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT now()
);
ALTER TABLE "OuvrageSection" ENABLE ROW LEVEL SECURITY;
-- select : etab-scoped via parent ; write : is_admin()/is_system()

CREATE TABLE "AlignementOuvrage" (         -- la déclaration des 5 minutes
  "id"               TEXT PRIMARY KEY,
  "documentId"       TEXT NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE,
  "ouvrageId"        TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "ouvrageSectionId" TEXT REFERENCES "OuvrageSection"("id") ON DELETE SET NULL,
  "declareParId"     TEXT NOT NULL REFERENCES "User"("id"),
  "note"             TEXT,
  "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT ("documentId","ouvrageId","ouvrageSectionId") -- PG 18.6 OK
);
ALTER TABLE "AlignementOuvrage" ENABLE ROW LEVEL SECURITY;
-- select : etab-scoped (EXISTS sur les deux parents)
-- insert/update : enseignant propriétaire du support ("ownerId" = current_user_id())
--                 OR is_admin()/is_system()
```

Flux P3 (l'atout enseignant, coût cible ≤ 5 min par support) :
1. au dépôt du support, l'IA **propose** les ouvrages/sections dont les thèmes
   recoupent `themesDetectes` (retrieval) ;
2. l'enseignant **valide/ajuste** (autorité de la transposition — l'IA propose,
   l'enseignant décide) ;
3. la **bibliographie automatique** est générée sur la fiche du support
   (exportable) — bénéfice immédiat et personnel pour l'enseignant ;
4. sous-produit sans saisie additionnelle : carte d'alignement support↔référentiel,
   indicateur de conformité par épreuve (questions via `chapterId` → chapitres →
   thèmes vs `REFERENTIEL_OFFICIEL`), audit de direction
   « le cours de M. X couvre N % du référentiel officiel ».

### P4 / `000127+` — dimension sociale (sketch, spécifié dans son ADR d'exécution)

- `OuvrageAnnotation` (page, section NULL, contenu, visibilité
  `PRIVEE|FILIERE|ETABLISSEMENT`) ;
- `OuvrageProposition` — file G1 : `EN_ATTENTE|ACCEPTEE|REFUSEE`,
  RESPONSABLE propose, ADMIN tranche ;
- badges « lecteur assidu » (réutilise `BadgeDefinition`/`BadgeProgression`) ;
- veille thématique sur la recherche ; watermarking des octets du fichier
  (évolution au-delà de la bannière lecteur P1).

## Décision — API (chi, routes préfixées `/api`)

| Phase | Route | Rôle | Notes |
|---|---|---|---|
| P1 | `GET /api/ouvrages` | tous rôles etab | filtres `q`, `categorie`, `filiereId`, `niveau` + pagination |
| P1 | `GET /api/ouvrages/{id}` | tous rôles etab | fiche + sections (P3) |
| P1 | `POST /api/ouvrages` | ADMIN | multipart fichier + métadonnées → R2 + ligne |
| P1 | `PATCH /api/ouvrages/{id}` | ADMIN | métadonnées, `telechargementAutorise`, restore |
| P1 | `DELETE /api/ouvrages/{id}` | ADMIN | soft delete |
| P1 | `GET /api/ouvrages/{id}/fichier` | tous rôles etab | presigned 15 min ; **AuditLog** `ouvrage.lecture` |
| P2 | `GET/PUT /api/ouvrages/{id}/lecture` | propriétaire | upsert position/pages/temps |
| P2 | `GET /api/etablissements/{id}/bibliotheque-activite` | ENSEIGNANT/RESP | agrégats SECURITY DEFINER |
| P2.5 | `PATCH /api/questions/{id}` | enseignant | gagne `chapterId` (handler existant étendu) |
| P3 | `GET/POST/DELETE /api/documents/{id}/alignements` | enseignant owner | déclaration assistée |
| P3 | `GET /api/ouvrages/{id}/sections` + CRUD | ADMIN/lecteurs | TOC curaté |
| P3 | `GET /api/documents/{id}/bibliographie` | tous rôles etab | générée depuis les alignements |
| P3 | `GET /api/etablissements/{id}/conformite-referentiels` | RESP/ADMIN | audit de direction |

## Décision — Stockage, lecture et quotas

- **R2** (client `internal/storage/r2.go`, AWS SDK v2) : clé
  `ouvrages/{ouvrageId}/{ts}_{safeName}` — étend la convention existante
  (`documents/…`, `captures/…`, `identity-photos/…`) ; même bucket
  (`R2_BUCKET_NAME`, défaut `sect-documents`), séparation par préfixe ;
  mode dégradé DB-only si R2 non configuré (pattern Document).
- **Lecture in-browser par défaut** (rendu paginé dans l'app, pas un lien de
  téléchargement) ; `telechargementAutorise` opt-in par ouvrage (ADMIN) ;
  URL presigned courte durée ; watermarking d'octets = P4.
- **Quota stockage par établissement** : extension du pattern `repository/quota.go`
  (IAUsage) — cumul `tailleFichier` par `etablissementId`, défaut configurable
  (cible initiale 2 Go/etab), refus 402/413 à la frontière.
- Soft delete = ligne seulement ; purge des octets R2 = job P4 (le soft delete
  conserve le stockage, assumé en P1-P3).

## Plan de migrations (golang-migrate uniquement — leçon DTTES-AUDIT-2)

| N° | Phase | Contenu | Down |
|---|---|---|---|
| 000123 | P1 | enum + table Ouvrage + indexes + RLS + policies | DROP POLICY ×3, DROP TABLE, DROP TYPE |
| 000124 | P2 | OuvrageLecture + RLS | DROP |
| 000125 | P2.5 | Question.chapterId + FK + index | DROP COLUMN |
| 000126 | P3 | OuvrageSection + AlignementOuvrage + RLS | DROP ×2 |
| 000127+ | P4 | annotations/propositions/badges (ADR d'exécution dédié) | — |

Règles transverses héritées : RLS dans la même migration que la table (leçon
000121) ; tout paramètre plpgsql typé avec son enum, jamais text (leçon
ENUM-SWEEP) ; ASSERTs post-migration (pattern 000122) ; tabs Go / SQL 2 espaces.

## Critères d'acceptation par phase

- **P1** : dépôt ADMIN < 2 min ; lecteur in-browser opérationnel ; 0 table sans
  RLS ; quota actif ; ouvrage expiré auto-masqué des lecteurs.
- **P2** : reprise de lecture à la page exacte ; activité lisible par
  l'enseignant ; P2.5 : PATCH `chapterId` OK, feedback cite le chapitre.
- **P3** : déclaration ≤ 5 min/support ; bibliographie auto sur la fiche du
  support ; carte d'alignement + conformité par UE ; export audit direction.
- **P4** : file de proposition OK ; badges lecteur assidu décernés.

## Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| Droits d'auteur (le vrai risque du projet) | `licenceOrigine` obligatoire ; `dateExpirationDroits` auto-masque les lecteurs ; lecture in-browser par défaut ; téléchargement opt-in ; audit des accès (AuditLog) |
| Adoption enseignants (leçons LMS : > 5 min = jamais) | Déclaration assistée IA (retrieval) ; validation en clics, aucune nouvelle habitude d'écriture |
| Coût stockage | Quota par etab ; soft delete ; purge P4 |
| Perf catalogue | Indexes partiels + pagination dès P1 |
| Périmètre (fuite) | Pas de traitement de texte intégré ; pas d'IA rédactrice de support ; citations courtes sourcées uniquement |

## Conséquences

- SECT devient le seul LMS du segment à produire **l'écart
  support↔référentiel** comme objet de première classe (carte d'alignement,
  conformité par épreuve, audit institutionnel) — impossible sans les deux
  chaînes simultanées, dont la chaîne générative existante est l'actif rare.
- La bibliothèque est **la couche normative du Système d'Évaluation** — place
  légitime pour un produit qui s'appelle SECT.
- Les invariants I1/I2 bornent toute évolution future (aucune dérive vers la
  génération depuis les livres, quelle que soit la demande).
