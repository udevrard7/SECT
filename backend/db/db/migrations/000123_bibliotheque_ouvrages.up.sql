-- ============================================================
-- Migration 000123 — Bibliothèque numérique P1 : la table Ouvrage
-- ADR-0007 (docs/desktop/ADR/0007-bibliotheque-numerique.md),
-- décision SECT-BIBLIO-P1, gouvernance G1/G2/G3 validées par le CTO.
-- ============================================================
-- CONTEXTE : SECT évalue sur des supports traçables (Question.documentId,
-- analyse IA, Chapter). Il manquait l'étage 0 du modèle (transposition
-- didactique, Chevallard) : la SOURCE NORMATIVE extérieure au cours —
-- référentiels officiels, ouvrages de référence, recherche académique,
-- pratique professionnelle. La bibliothèque est la couche normative du
-- Système d'Évaluation : elle NE GÉNÈRE JAMAIS de questions (invariant I1),
-- elle référence (invariant I2).
--
-- G1 (validée) : dépôt réservé à l'ADMIN en P1 (file RESPONSABLE en P4).
-- G2 (validée) : catalogue PAR ÉTABLISSEMENT (cohérence RLS stricte).
--
-- SÉMANTIQUE DES COLONNES DE SCOPING :
--   etablissementId = contrôle d'accès (RLS) ;
--   filiereId/niveau = recommandation (filtrage UI) — NULL = « pertinent
--   pour tous », PAS « caché ».
--
-- AUTO-MASQUAGE DES DROITS EXPIRÉS : les lecteurs (ENSEIGNANT/ETUDIANT/
-- RESPONSABLE) ne voient pas les ouvrages dont dateExpirationDroits est
-- passé ; l'ADMIN global (is_admin()) les voit toujours (badge UI). Le
-- hard delete est interdit (aucune policy DELETE — deny par défaut,
-- pattern 000121/IAUsage).
--
-- Leçon ENUM-SWEEP-1 : « niveau » est TYPÉ enum NiveauEtude (jamais text)
-- — cohérent avec User.niveau ; les comparaisons enum_col = $n sont sûres
-- (inférence exact-match à la colonne), seules les comparaisons avec un
-- paramètre plpgsql TEXT exigeront un cast (aucune fonction dans cette
-- migration).
--
-- Leçons répercutées : RLS dans la MÊME migration que la table (000121) ;
-- TO PUBLIC (sect_app NOBYPASSRLS, pattern 000117) ; ASSERTs
-- post-migration (000122) ; idempotence DROP IF EXISTS.
-- ============================================================

-- 1. L'enum des catégories (poids normatif — cf. ADR §Taxonomie)
CREATE TYPE "CategorieOuvrage" AS ENUM (
  'REFERENTIEL_OFFICIEL',
  'OUVRAGE_REFERENCE',
  'RECHERCHE_ACADEMIQUE',
  'PRATIQUE_PROFESSIONNELLE'
);

-- 2. La table (DDL ADR-0007 §P1)
CREATE TABLE "Ouvrage" (
  "id"                     TEXT PRIMARY KEY,
  "etablissementId"        TEXT NOT NULL REFERENCES "Etablissement"("id"),
  "titre"                  TEXT NOT NULL,
  "auteurs"                TEXT,
  "categorie"              "CategorieOuvrage" NOT NULL,
  "editeur"                TEXT,
  "edition"                TEXT,
  "anneePublication"       INTEGER,
  "isbn"                   TEXT,
  "langue"                 TEXT,
  "filiereId"              TEXT REFERENCES "Filiere"("id"),
  "niveau"                 "NiveauEtude",
  "themes"                 TEXT,
  "description"            TEXT,
  "licenceOrigine"         TEXT NOT NULL,
  "dateExpirationDroits"   TIMESTAMP,
  "nomFichier"             TEXT NOT NULL,
  "cheminStockage"         TEXT,
  "tailleFichier"          INTEGER NOT NULL DEFAULT 0,
  "typeMime"               TEXT NOT NULL DEFAULT 'application/pdf',
  "telechargementAutorise" BOOLEAN NOT NULL DEFAULT false,
  "createdById"            TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
  "deletedAt"              TIMESTAMP
);

CREATE INDEX "Ouvrage_etab_idx" ON "Ouvrage"("etablissementId") WHERE "deletedAt" IS NULL;
CREATE INDEX "Ouvrage_filiere_idx" ON "Ouvrage"("filiereId");
CREATE INDEX "Ouvrage_categorie_idx" ON "Ouvrage"("categorie");

-- 3. RLS — même migration que la table (leçon 000121)
ALTER TABLE "Ouvrage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ouvrage_select" ON "Ouvrage";
CREATE POLICY "Ouvrage_select" ON "Ouvrage"
    FOR SELECT TO PUBLIC
    USING (
        is_system()
        OR is_admin()
        OR (
            "etablissementId" = current_etablissement_id()
            AND "deletedAt" IS NULL
            AND (
                "dateExpirationDroits" IS NULL
                OR "dateExpirationDroits" > now()
            )
        )
    );

DROP POLICY IF EXISTS "Ouvrage_insert" ON "Ouvrage";
CREATE POLICY "Ouvrage_insert" ON "Ouvrage"
    FOR INSERT TO PUBLIC
    WITH CHECK (is_system() OR is_admin());

DROP POLICY IF EXISTS "Ouvrage_update" ON "Ouvrage";
CREATE POLICY "Ouvrage_update" ON "Ouvrage"
    FOR UPDATE TO PUBLIC
    USING (is_system() OR is_admin())
    WITH CHECK (is_system() OR is_admin());

-- DELETE : VOLONTAIREMENT AUCUNE policy (deny par défaut, pattern
-- 000121/IAUsage) — le hard delete d'un ouvrage ne se fait pas par l'app ;
-- le soft delete passe par UPDATE "deletedAt" (policy update).

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'Ouvrage'
            AND c.relrowsecurity) = 1,
         'RLS doit etre active sur Ouvrage';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass
            AND polname IN ('Ouvrage_select','Ouvrage_insert','Ouvrage_update')) = 3,
         'Ouvrage doit avoir exactement 3 policies (select/insert/update)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass) = 3,
         'Aucune policy DELETE sur Ouvrage (hard delete interdit)';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'Ouvrage_select'
            AND position('dateExpirationDroits' in pg_get_expr(p.polqual, p.polrelid)) > 0
            AND position('current_etablissement_id' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'Ouvrage_select doit auto-masquer les droits expires et scoper par etab';
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'CategorieOuvrage') = 4,
         'CategorieOuvrage doit avoir 4 valeurs';
  ASSERT (SELECT count(*) FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'Ouvrage' AND a.attname = 'niveau'
            AND t.typname = 'NiveauEtude') = 1,
         'Ouvrage.niveau doit etre type enum NiveauEtude (lecon ENUM-SWEEP)';
END $$;
