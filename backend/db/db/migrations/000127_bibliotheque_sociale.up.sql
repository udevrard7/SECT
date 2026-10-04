-- ============================================================
-- Migration 000127 — Bibliothèque P4 : dimension sociale (1/2)
-- ADR-0008 (docs/desktop/ADR/0008-bibliotheque-p4-social.md),
-- exécution du sketch §P4 de l'ADR-0007.
-- ============================================================
-- CONTENU : OuvrageAnnotation (annotations de page à visibilité
-- PRIVEE/FILIERE/ETABLISSEMENT) + OuvrageProposition (file G1
-- RESPONSABLE propose → ADMIN tranche) + OuvrageVeille (veille
-- thématique sur la recherche du catalogue).
--
-- DESIGN :
--   OuvrageAnnotation.filiereId est DÉNORMALISÉE (la filière de
--   l'auteur à la création) — évite tout JOIN "User" dans la policy
--   (leçon P3 : un JOIN dans une policy hérite de la RLS de la table
--   jointe ; on compare à current_user_filiere_id(), helper
--   SECURITY DEFINER 000020).
--
--   La visibilité d'une annotation dépend de la visibilité de
--   l'OUVRAGE : délégation EXISTS aux conditions exactes de
--   Ouvrage_select (pattern 000124 — etab + corbeille + droits
--   expirés en UN seul endroit).
--
--   OuvrageProposition.ouvrageId est ON DELETE SET NULL : la
--   proposition (trace de la décision) SURVIT à la purge de l'ouvrage
--   (le job P4 hard-delete les Ouvrage > 30 j de corbeille ; un
--   RESTRICT bloquerait la purge — leçon P3 : vérifier chaque action
--   FK contre TOUTES les contraintes). Pas d'UNIQUE sur cette colonne
--   → SET NULL est sûr (contraire du cas 23505 de 000126).
--
-- Leçons répercutées : RLS dans la MÊME migration (000121) ; TO PUBLIC
-- (sect_app NOBYPASSRLS, pattern 000117) ; littéraux enum sûrs dans
-- les policies, params plpgsql typés enum (ENUM-SWEEP) ; ASSERTs
-- post-migration (000122) ; idempotence DROP IF EXISTS.
-- ============================================================

-- 1. Les enums
CREATE TYPE "VisibiliteAnnotation" AS ENUM (
  'PRIVEE',
  'FILIERE',
  'ETABLISSEMENT'
);

CREATE TYPE "StatutProposition" AS ENUM (
  'EN_ATTENTE',
  'ACCEPTEE',
  'REFUSEE'
);

-- 2. OuvrageAnnotation (ADR-0008 §1)
CREATE TABLE "OuvrageAnnotation" (
  "id"          TEXT PRIMARY KEY,
  "ouvrageId"   TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  -- filiereId : snapshot de la filière de l'AUTEUR (pas de FK — valeur
  -- informative de scopage ; une filière supprimée ne doit jamais
  -- bloquer une annotation, la visibilité retombe sans match).
  "filiereId"   TEXT,
  "page"        INTEGER NOT NULL,
  "contenu"     TEXT NOT NULL,
  "visibilite"  "VisibiliteAnnotation" NOT NULL DEFAULT 'PRIVEE',
  "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX "OuvrageAnnotation_ouvrage_page_idx" ON "OuvrageAnnotation"("ouvrageId", "page");
CREATE INDEX "OuvrageAnnotation_user_idx" ON "OuvrageAnnotation"("userId");

-- 3. OuvrageProposition (ADR-0008 §2) — file G1
CREATE TABLE "OuvrageProposition" (
  "id"                TEXT PRIMARY KEY,
  "etablissementId"   TEXT NOT NULL REFERENCES "Etablissement"("id"),
  "proposantId"       TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  -- Métadonnées demandées (miroir Ouvrage, SANS fichier : le dépôt du
  -- PDF reste un acte ADMIN — G1 inchangé).
  "titre"             TEXT NOT NULL,
  "auteurs"           TEXT,
  "categorie"         "CategorieOuvrage" NOT NULL,
  "editeur"           TEXT,
  "anneePublication"  INTEGER,
  "isbn"              TEXT,
  "langue"            TEXT,
  "filiereId"         TEXT,
  "niveau"            "NiveauEtude",
  "themes"            TEXT,
  "description"       TEXT,
  "licenceOrigine"    TEXT NOT NULL,
  "statut"            "StatutProposition" NOT NULL DEFAULT 'EN_ATTENTE',
  "motifRefus"        TEXT,
  "trancheParId"      TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "trancheAt"         TIMESTAMP,
  "ouvrageId"         TEXT REFERENCES "Ouvrage"("id") ON DELETE SET NULL,
  "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX "OuvrageProposition_etab_statut_idx" ON "OuvrageProposition"("etablissementId", "statut");
CREATE INDEX "OuvrageProposition_proposant_idx" ON "OuvrageProposition"("proposantId");

-- 4. OuvrageVeille (ADR-0008 §4) — veille thématique
CREATE TABLE "OuvrageVeille" (
  "id"                TEXT PRIMARY KEY,
  "userId"            TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "etablissementId"   TEXT NOT NULL REFERENCES "Etablissement"("id"),
  "terme"             TEXT NOT NULL,
  "categorie"         "CategorieOuvrage",
  "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "OuvrageVeille_user_terme_key" ON "OuvrageVeille"("userId", "terme");
CREATE INDEX "OuvrageVeille_etab_idx" ON "OuvrageVeille"("etablissementId");

-- ============================================================
-- RLS — même migration que les tables (leçon 000121)
-- ============================================================
ALTER TABLE "OuvrageAnnotation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OuvrageProposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OuvrageVeille" ENABLE ROW LEVEL SECURITY;

-- OuvrageAnnotation : la visibilité de l'ouvrage est déléguée aux
-- conditions exactes de Ouvrage_select (000123) — une annotation sur
-- un ouvrage corbeille/expiré/hors-etab est invisible, point.
DROP POLICY IF EXISTS "OuvrageAnnotation_select" ON "OuvrageAnnotation";
CREATE POLICY "OuvrageAnnotation_select" ON "OuvrageAnnotation"
    FOR SELECT TO PUBLIC
    USING (
        is_system()
        OR (
            EXISTS (SELECT 1 FROM "Ouvrage" o
                    WHERE o."id" = "ouvrageId"
                      AND (is_admin()
                           OR (o."etablissementId" = current_etablissement_id()
                               AND o."deletedAt" IS NULL
                               AND (o."dateExpirationDroits" IS NULL
                                    OR o."dateExpirationDroits" > now()))))
            AND (
                "userId" = current_user_id()
                OR ("visibilite" = 'FILIERE'
                    AND "filiereId" IS NOT NULL
                    AND "filiereId" = current_user_filiere_id())
                OR "visibilite" = 'ETABLISSEMENT'
            )
        )
    );

DROP POLICY IF EXISTS "OuvrageAnnotation_insert" ON "OuvrageAnnotation";
CREATE POLICY "OuvrageAnnotation_insert" ON "OuvrageAnnotation"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR (
            "userId" = current_user_id()
            AND EXISTS (SELECT 1 FROM "Ouvrage" o
                    WHERE o."id" = "ouvrageId"
                      AND (is_admin()
                           OR (o."etablissementId" = current_etablissement_id()
                               AND o."deletedAt" IS NULL
                               AND (o."dateExpirationDroits" IS NULL
                                    OR o."dateExpirationDroits" > now()))))
        )
    );

-- update/delete : propriétaire uniquement (l'auteur édite/supprime SES
-- annotations, même visibles par d'autres).
DROP POLICY IF EXISTS "OuvrageAnnotation_update" ON "OuvrageAnnotation";
CREATE POLICY "OuvrageAnnotation_update" ON "OuvrageAnnotation"
    FOR UPDATE TO PUBLIC
    USING (is_system() OR "userId" = current_user_id())
    WITH CHECK (is_system() OR "userId" = current_user_id());

DROP POLICY IF EXISTS "OuvrageAnnotation_delete" ON "OuvrageAnnotation";
CREATE POLICY "OuvrageAnnotation_delete" ON "OuvrageAnnotation"
    FOR DELETE TO PUBLIC
    USING (is_system() OR "userId" = current_user_id());

-- OuvrageProposition : le proposant voit SES propositions ; l'ADMIN
-- (global) voit la file entière ; insert = RESPONSABLE de son etab ;
-- update = tranche ADMIN ; delete = ADMIN ou retrait du proposant
-- tant que EN_ATTENTE.
DROP POLICY IF EXISTS "OuvrageProposition_select" ON "OuvrageProposition";
CREATE POLICY "OuvrageProposition_select" ON "OuvrageProposition"
    FOR SELECT TO PUBLIC
    USING (is_system() OR is_admin() OR "proposantId" = current_user_id());

DROP POLICY IF EXISTS "OuvrageProposition_insert" ON "OuvrageProposition";
CREATE POLICY "OuvrageProposition_insert" ON "OuvrageProposition"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR (
            is_responsable()
            AND "proposantId" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
        )
    );

DROP POLICY IF EXISTS "OuvrageProposition_update" ON "OuvrageProposition";
CREATE POLICY "OuvrageProposition_update" ON "OuvrageProposition"
    FOR UPDATE TO PUBLIC
    USING (is_system() OR is_admin())
    WITH CHECK (is_system() OR is_admin());

DROP POLICY IF EXISTS "OuvrageProposition_delete" ON "OuvrageProposition";
CREATE POLICY "OuvrageProposition_delete" ON "OuvrageProposition"
    FOR DELETE TO PUBLIC
    USING (
        is_system()
        OR is_admin()
        OR ("proposantId" = current_user_id() AND "statut" = 'EN_ATTENTE')
    );

-- OuvrageVeille : propriétaire seul ; is_system sur select pour le
-- matching au dépôt (l'ADMIN déposant ne voit pas les veilles des
-- lecteurs — le matching tourne sous SystemClaims).
DROP POLICY IF EXISTS "OuvrageVeille_select" ON "OuvrageVeille";
CREATE POLICY "OuvrageVeille_select" ON "OuvrageVeille"
    FOR SELECT TO PUBLIC
    USING (is_system() OR "userId" = current_user_id());

DROP POLICY IF EXISTS "OuvrageVeille_insert" ON "OuvrageVeille";
CREATE POLICY "OuvrageVeille_insert" ON "OuvrageVeille"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR ("userId" = current_user_id() AND "etablissementId" = current_etablissement_id())
    );

DROP POLICY IF EXISTS "OuvrageVeille_delete" ON "OuvrageVeille";
CREATE POLICY "OuvrageVeille_delete" ON "OuvrageVeille"
    FOR DELETE TO PUBLIC
    USING (is_system() OR "userId" = current_user_id());

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122)
-- ============================================================
DO $$
BEGIN
  -- RLS active sur les 3 tables
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('OuvrageAnnotation','OuvrageProposition','OuvrageVeille')
            AND c.relrowsecurity) = 3,
         'RLS doit etre active sur les 3 tables sociales';

  -- Policies attendues
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageAnnotation"'::regclass) = 4,
         'OuvrageAnnotation : 4 policies (select/insert/update/delete)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageProposition"'::regclass) = 4,
         'OuvrageProposition : 4 policies';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageVeille"'::regclass) = 3,
         'OuvrageVeille : 3 policies (pas de update)';

  -- Toutes TO PUBLIC (leçon 000117 — jamais TO neondb_owner)
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid IN ('"OuvrageAnnotation"'::regclass,
                             '"OuvrageProposition"'::regclass,
                             '"OuvrageVeille"'::regclass)
            AND polroles <> '{0}') = 0,
         'Toutes les policies sociales doivent etre TO PUBLIC';

  -- Contenu des policies critiques
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'OuvrageAnnotation_select'
            AND position('current_user_filiere_id' in pg_get_expr(p.polqual, p.polrelid)) > 0
            AND position('ETABLISSEMENT' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'Annotation_select doit couvrir FILIERE (helper) et ETABLISSEMENT';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'OuvrageProposition_delete'
            AND position('EN_ATTENTE' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'Proposition_delete doit permettre le retrait uniquement EN_ATTENTE';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'OuvrageProposition_insert'
            AND position('is_responsable' in pg_get_expr(p.polwithcheck, p.polrelid)) > 0) = 1,
         'Proposition_insert doit exiger is_responsable';

  -- FK : CASCADE sur Annotation.ouvrageId (la purge emporte les
  -- annotations) ; SET NULL sur Proposition.ouvrageId (la trace survit).
  ASSERT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = '"OuvrageAnnotation"'::regclass
            AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%') >= 2,
         'Annotation : FK ouvrageId+userId ON DELETE CASCADE';
  ASSERT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = '"OuvrageProposition"'::regclass
            AND pg_get_constraintdef(oid) LIKE '%ON DELETE SET NULL%') = 2,
         'Proposition : trancheParId+ouvrageId ON DELETE SET NULL (survie a la purge)';

  -- Enums
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'VisibiliteAnnotation') = 3,
         'VisibiliteAnnotation : 3 valeurs';
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'StatutProposition') = 3,
         'StatutProposition : 3 valeurs';

  -- Veille : UNIQUE(userId, terme)
  -- NB : la PRIMARY KEY est aussi un index unique — on l'exclut.
  ASSERT (SELECT count(*) FROM pg_index i
          JOIN pg_class c ON c.oid = i.indrelid
          WHERE c.relname = 'OuvrageVeille' AND i.indisunique
            AND NOT i.indisprimary) = 1,
         'OuvrageVeille : UNIQUE(userId, terme)';
END $$;
