-- ============================================================
-- Migration 000137 — Bibliothèque : visibilité 3 niveaux + analyse IA
-- Transposition SECT-BIBLIO-5 des décisions validées en sandbox
-- (worklog BIBLIOTHEQUE-1/BIBLIOTHEQUE-2, demande exploitant).
-- ============================================================
-- OBJET : corriger le modèle « catalogue par établissement » (G2,
-- 000123) pour le modèle à 3 niveaux demandé par l'exploitant :
--
--   1. PLATEFORME   — déposé par l'ADMIN plateforme : destiné à TOUS
--                     les clients SECT (établissements), pas à une
--                     seule université (plainte de l'exploitant) ;
--   2. ETABLISSEMENT— déposé par le RESPONSABLE : destiné et vu par
--                     SON établissement uniquement ;
--   3. CLASSE       — déposé par l'ENSEIGNANT : destiné uniquement à
--                     ses classes (filière, niveau) — table de
--                     ciblage OuvrageClasse, intersection scellée
--                     serveur avec EnseignantFiliere.
--
-- GOUVERNANCE (human-in-the-loop, aligné ADR-0007/0008) :
--   - le dépôt ENSEIGNANT naît BROUILLON : invisible des étudiants,
--     validé par le RESPONSABLE de son établissement (la file
--     propositions G1 P4 devient non nécessaire pour ce flux) ;
--   - RESPONSABLE et ADMIN déposent directement VALIDE ;
--   - l'ANALYSE IA du PDF (pré-remplissage assisté, tâche 2) est une
--     AIDE à la saisie : l'humain valide/complète TOUJOURS
--     (endpoint /api/ouvrages/analyze côté Go, aucune métadonnée
--     IA n'est persistée sans relecture).
--
-- ANTI-RÉCURSION RLS (leçon 000020/current_user_filiere_id) : la
-- visibilité d'un ouvrage vit désormais dans UNE SEULE fonction
-- SECURITY DEFINER ouvrage_visible(p_ouvrage_id) — les policies
-- (Ouvrage, OuvrageLecture, OuvrageSection, AlignementOuvrage,
-- OuvrageAnnotation, OuvrageClasse) y délèguent toutes. Une fonction
-- DEFINER contourne les policies (rôle propriétaire) : aucune
-- récursion policy↔policy n'est possible, là où un EXISTS nu sur
-- "Ouvrage" depuis OuvrageClasse_select (et inversement) produirait
-- l'erreur « infinite recursion detected in policy ».
--
-- SÉMANTIQUE etablissementId (évolution 000123) :
--   PLATEFORME    → NULL (nouveau dépôt) OU conservé (provenance
--                   d'origine après promotion d'un ouvrage étab —
--                   le retour arrière reste possible, leçon sandbox
--                   BIBLIOTHEQUE-2) ;
--   ETABLISSEMENT/CLASSE → NOT NULL (CHECK).
--
-- Leçons répercutées : RLS dans la MÊME migration (000121) ; TO
-- PUBLIC (000117) ; ASSERTs post-migration (000122) ; comparaisons
-- enum uniquement enum↔enum, jamais text↔enum (ENUM-SWEEP-1).
-- ============================================================

-- 1. Les enums
CREATE TYPE "VisibiliteOuvrage" AS ENUM ('PLATEFORME', 'ETABLISSEMENT', 'CLASSE');
CREATE TYPE "StatutOuvrage" AS ENUM ('VALIDE', 'BROUILLON');

-- 2. Colonnes Ouvrage (défauts = comportement 000123 inchangé pour
-- les lignes existantes : ETABLISSEMENT + VALIDE).
ALTER TABLE "Ouvrage"
  ADD COLUMN "visibility" "VisibiliteOuvrage" NOT NULL DEFAULT 'ETABLISSEMENT',
  ADD COLUMN "statut" "StatutOuvrage" NOT NULL DEFAULT 'VALIDE';

-- Un ouvrage PLATEFORME n'appartient à aucun établissement (déposé
-- par l'admin global, pour tous les clients) — la FK devient
-- nullable. La CHECK ci-dessous garde les autres visibilities
-- toujours rattachées.
ALTER TABLE "Ouvrage" ALTER COLUMN "etablissementId" DROP NOT NULL;

ALTER TABLE "Ouvrage"
  ADD CONSTRAINT "Ouvrage_visibility_etab_ck"
  CHECK (
    ("visibility" = 'PLATEFORME')
    OR ("etablissementId" IS NOT NULL)
  );

-- NOTE : la contrainte « un ouvrage CLASSE cible au moins une classe »
-- (EXISTS OuvrageClasse) ne peut PAS être exprimée en CHECK (les
-- sous-requêtes y sont interdites en PostgreSQL) — elle est garantie
-- par le usecase (ValidationError si aucune classe légitime) et par
-- la policy OuvrageClasse_insert (intersection scellée). L'ordre des
-- écritures dans la même transaction (ouvrage puis classes) la rend
-- momentanément suspendue par construction.

CREATE INDEX "Ouvrage_visibility_idx" ON "Ouvrage"("visibility") WHERE "deletedAt" IS NULL;
CREATE INDEX "Ouvrage_statut_idx" ON "Ouvrage"("statut") WHERE "deletedAt" IS NULL;

-- 3. OuvrageClasse — ciblage « classe » = (filière, niveau)
-- (une « classe » SECT = couple Filiere×NiveauEtude, cf. salons
-- 000122 ; les classes d'un ENSEIGNANT = EnseignantFiliere).
CREATE TABLE "OuvrageClasse" (
  "id"         TEXT PRIMARY KEY,
  "ouvrageId"  TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "filiereId"  TEXT NOT NULL REFERENCES "Filiere"("id"),
  "niveau"     "NiveauEtude" NOT NULL,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("ouvrageId", "filiereId", "niveau")
);

CREATE INDEX "OuvrageClasse_ouvrage_idx" ON "OuvrageClasse"("ouvrageId");
CREATE INDEX "OuvrageClasse_filiere_niveau_idx" ON "OuvrageClasse"("filiereId", "niveau");

-- 4. Fonctions helper SECURITY DEFINER (anti-récursion, pattern
-- 000020/current_user_filiere_id)

-- 4a. current_user_classes — les classes de l'utilisateur courant :
-- étudiant → (sa filière, son niveau) ; enseignant → ses
-- EnseignantFiliere. SECURITY DEFINER : lit User/EnseignantFiliere
-- en propriétaire (BYPASSRLS), sans déclencher leurs policies.
CREATE OR REPLACE FUNCTION public.current_user_classes()
RETURNS TABLE ("filiereId" text, "niveau" "NiveauEtude")
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT ef."filiereId", ef."niveau"
  FROM "EnseignantFiliere" ef
  WHERE ef."enseignantId" = current_user_id()
  UNION
  SELECT u."filiereId", u."niveau"
  FROM "User" u
  WHERE u."id" = current_user_id()
    AND u."filiereId" IS NOT NULL
    AND u."niveau" IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.current_user_classes() TO PUBLIC;

-- 4b. ouvrage_visible_par_classes — intersection (OuvrageClasse de
-- l'ouvrage) × (classes de l'utilisateur courant).
CREATE OR REPLACE FUNCTION public.ouvrage_visible_par_classes(p_ouvrage_id text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "OuvrageClasse" oc
    JOIN public.current_user_classes() c
      ON c."filiereId" = oc."filiereId" AND c."niveau" = oc."niveau"
    WHERE oc."ouvrageId" = p_ouvrage_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.ouvrage_visible_par_classes(text) TO PUBLIC;

-- 4c. ouvrage_visible — LA visibilité d'un ouvrage, source de
-- vérité unique (toutes les policies du module y délèguent) :
--   - is_system/is_admin : tout (corbeille + brouillons inclus) ;
--   - PLATEFORME VALIDE : visible de tous les clients SECT ;
--   - ETABLISSEMENT : son établissement ;
--   - CLASSE : intersection avec les classes de l'utilisateur ;
--   - BROUILLON : déposant + responsable de l'établissement (JAMAIS
--     l'étudiant) ;
--   - lecteurs : corbeille et droits expirés auto-masqués (000123).
CREATE OR REPLACE FUNCTION public.ouvrage_visible(p_ouvrage_id text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Ouvrage" o
    WHERE o."id" = p_ouvrage_id
      AND (
        is_system()
        OR is_admin()
        OR (
          o."deletedAt" IS NULL
          AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
          AND (
            (o."visibility" = 'PLATEFORME' AND o."statut" = 'VALIDE')
            OR (o."visibility" = 'ETABLISSEMENT' AND o."etablissementId" = current_etablissement_id())
            OR (o."visibility" = 'CLASSE' AND public.ouvrage_visible_par_classes(o."id"))
          )
          AND (
            o."statut" = 'VALIDE'
            OR o."createdById" = current_user_id()
            OR (is_responsable() AND o."etablissementId" = current_etablissement_id())
          )
        )
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.ouvrage_visible(text) TO PUBLIC;

-- 4d. ouvrage_parent_gestionnable — droit de GESTION (édition,
-- ciblage, modération) : ADMIN, RESPONSABLE de l'établissement,
-- déposant enseignant.
CREATE OR REPLACE FUNCTION public.ouvrage_parent_gestionnable(p_ouvrage_id text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Ouvrage" o
    WHERE o."id" = p_ouvrage_id
      AND (
        is_admin()
        OR (is_responsable() AND o."etablissementId" = current_etablissement_id())
        OR (is_enseignant() AND o."createdById" = current_user_id())
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.ouvrage_parent_gestionnable(text) TO PUBLIC;

-- 5. RLS Ouvrage — réécriture des policies 000123 (délégation à
-- ouvrage_visible, périmètre étendu resp/ens pour les écritures).

DROP POLICY IF EXISTS "Ouvrage_select" ON "Ouvrage";
CREATE POLICY "Ouvrage_select" ON "Ouvrage"
    FOR SELECT TO PUBLIC
    USING (public.ouvrage_visible("Ouvrage"."id"));

-- INSERT : le périmètre est DÉRIVÉ DU RÔLE (défense serveur, le
-- client ne choisit jamais sa visibilité — le usecase force les
-- colonnes AVANT l'INSERT, la policy est la 2e ligne de défense) :
--   ADMIN (global)      → PLATEFORME ;
--   ADMIN (assistance)  → ETABLISSEMENT de l'étab assisté ;
--   RESPONSABLE         → ETABLISSEMENT, SON établissement ;
--   ENSEIGNANT          → CLASSE, SON établissement, son dépôt.
DROP POLICY IF EXISTS "Ouvrage_insert" ON "Ouvrage";
CREATE POLICY "Ouvrage_insert" ON "Ouvrage"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR is_admin()
        OR (
            is_responsable()
            AND "visibility" = 'ETABLISSEMENT'
            AND "etablissementId" = current_etablissement_id()
            AND "statut" = 'VALIDE'
        )
        OR (
            is_enseignant()
            AND "visibility" = 'CLASSE'
            AND "etablissementId" = current_etablissement_id()
            AND "createdById" = current_user_id()
            AND "statut" = 'BROUILLON'
        )
    );

-- UPDATE : gestion étendue (resp : son étab ; ens : son dépôt) ; le
-- WITH CHECK FIGE la visibilité des non-admin (promotion/démotion
-- PLATEFORME = ADMIN seul) et le statut reste piloté par
-- resp/admin (l'enseignant ne publie pas lui-même son brouillon).
DROP POLICY IF EXISTS "Ouvrage_update" ON "Ouvrage";
CREATE POLICY "Ouvrage_update" ON "Ouvrage"
    FOR UPDATE TO PUBLIC
    USING (
        is_system()
        OR is_admin()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_enseignant() AND "createdById" = current_user_id())
    )
    WITH CHECK (
        is_system()
        OR is_admin()
        OR (
            is_responsable()
            AND "etablissementId" = current_etablissement_id()
            AND "visibility" = 'ETABLISSEMENT'
        )
        OR (
            is_enseignant()
            AND "createdById" = current_user_id()
            AND "visibility" = 'CLASSE'
            AND "statut" = 'BROUILLON'
        )
    );

-- 6. RLS OuvrageClasse (même migration que la table — leçon 000121)
ALTER TABLE "OuvrageClasse" ENABLE ROW LEVEL SECURITY;

-- SELECT : classes d'un ouvrage visible OU gérable (le déposant
-- édite le ciblage de son brouillon).
DROP POLICY IF EXISTS "OuvrageClasse_select" ON "OuvrageClasse";
CREATE POLICY "OuvrageClasse_select" ON "OuvrageClasse"
    FOR SELECT TO PUBLIC
    USING (
        is_system()
        OR is_admin()
        OR public.ouvrage_visible("ouvrageId")
        OR public.ouvrage_parent_gestionnable("ouvrageId")
    );

-- INSERT : gestion de l'ouvrage parent +, pour l'ENSEIGNANT, la
-- classe ciblée doit être une de SES classes (intersection scellée
-- en 3e ligne de défense — le usecase filtre déjà côté Go).
DROP POLICY IF EXISTS "OuvrageClasse_insert" ON "OuvrageClasse";
CREATE POLICY "OuvrageClasse_insert" ON "OuvrageClasse"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR is_admin()
        OR (
            is_responsable()
            AND public.ouvrage_parent_gestionnable("ouvrageId")
        )
        OR (
            is_enseignant()
            AND public.ouvrage_parent_gestionnable("ouvrageId")
            AND EXISTS (
                SELECT 1 FROM public.current_user_classes() c
                WHERE c."filiereId" = "OuvrageClasse"."filiereId"
                  AND c."niveau" = "OuvrageClasse"."niveau"
            )
        )
    );

-- DELETE : le ciblage se remplace à l'édition (hard delete des
-- lignes de jointure uniquement — l'ouvrage lui-même garde deny,
-- pattern 000123/000128).
DROP POLICY IF EXISTS "OuvrageClasse_delete" ON "OuvrageClasse";
CREATE POLICY "OuvrageClasse_delete" ON "OuvrageClasse"
    FOR DELETE TO PUBLIC
    USING (is_system() OR public.ouvrage_parent_gestionnable("ouvrageId"));

-- 7. Délégation des policies voisines à ouvrage_visible (elles
-- ré-exprimaient les conditions 000123 en dur — source de vérité
-- unique désormais ; pattern « RLS évalué avant contraintes »
-- conservé : un ouvrage invisible produit toujours 42501).

-- 7a. OuvrageLecture (000124) — propriétaire + ouvrage visible.
DROP POLICY IF EXISTS "OuvrageLecture_select" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_select" ON "OuvrageLecture"
    FOR SELECT TO PUBLIC
    USING ("userId" = current_user_id() AND public.ouvrage_visible("ouvrageId"));

DROP POLICY IF EXISTS "OuvrageLecture_insert" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_insert" ON "OuvrageLecture"
    FOR INSERT TO PUBLIC
    WITH CHECK ("userId" = current_user_id() AND public.ouvrage_visible("ouvrageId"));

DROP POLICY IF EXISTS "OuvrageLecture_update" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_update" ON "OuvrageLecture"
    FOR UPDATE TO PUBLIC
    USING ("userId" = current_user_id() AND public.ouvrage_visible("ouvrageId"))
    WITH CHECK ("userId" = current_user_id() AND public.ouvrage_visible("ouvrageId"));

-- 7b. OuvrageSection (000126) — TOC d'un ouvrage visible.
DROP POLICY IF EXISTS "OuvrageSection_select" ON "OuvrageSection";
CREATE POLICY "OuvrageSection_select" ON "OuvrageSection"
    FOR SELECT TO PUBLIC
    USING (public.ouvrage_visible("ouvrageId"));

-- 7c. AlignementOuvrage (000126) — la partie « ouvrage visible »
-- des policies délègue à la fonction ; le parent Document garde ses
-- conditions d'origine (user_etab_id : l'enseignant voit SES
-- supports, le RESP ceux de son etab, l'étudiant ceux des UE de sa
-- filière).
DROP POLICY IF EXISTS "AlignementOuvrage_select" ON "AlignementOuvrage";
CREATE POLICY "AlignementOuvrage_select" ON "AlignementOuvrage"
    FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM "Document" d
            WHERE d."id" = "documentId"
              AND d."deletedAt" IS NULL
              AND (
                  is_system()
                  OR is_admin()
                  OR user_etab_id(d."ownerId") = current_etablissement_id()
              )
        )
        AND public.ouvrage_visible("ouvrageId")
    );

DROP POLICY IF EXISTS "AlignementOuvrage_insert" ON "AlignementOuvrage";
CREATE POLICY "AlignementOuvrage_insert" ON "AlignementOuvrage"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Document" d
            WHERE d."id" = "documentId"
              AND (
                  d."ownerId" = current_user_id()
                  OR is_admin()
                  OR is_system()
              )
        )
        AND public.ouvrage_visible("ouvrageId")
    );

DROP POLICY IF EXISTS "AlignementOuvrage_update" ON "AlignementOuvrage";
CREATE POLICY "AlignementOuvrage_update" ON "AlignementOuvrage"
    FOR UPDATE TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM "Document" d
            WHERE d."id" = "documentId"
              AND (
                  d."ownerId" = current_user_id()
                  OR is_admin()
                  OR is_system()
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Document" d
            WHERE d."id" = "documentId"
              AND (
                  d."ownerId" = current_user_id()
                  OR is_admin()
                  OR is_system()
              )
        )
        AND public.ouvrage_visible("ouvrageId")
    );

-- 7d. OuvrageAnnotation (000127) — la visibilité de l'ouvrage
-- déléguée à ouvrage_visible ; la visibilité de l'ANNOTATION
-- (PRIVEE/FILIERE/ETABLISSEMENT) garde ses conditions d'origine.
DROP POLICY IF EXISTS "OuvrageAnnotation_select" ON "OuvrageAnnotation";
CREATE POLICY "OuvrageAnnotation_select" ON "OuvrageAnnotation"
    FOR SELECT TO PUBLIC
    USING (
        is_system()
        OR (
            public.ouvrage_visible("ouvrageId")
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
            AND public.ouvrage_visible("ouvrageId")
        )
    );

-- 8. Agrégats : les ouvrages PLATEFORME lus par les étudiants d'un
-- établissement comptent dans SON activité/conformité (avant : seuls
-- les ouvrages de l'étab étaient agrégés).
CREATE OR REPLACE FUNCTION public.bibliotheque_activite_etablissement(p_etablissement_id text)
RETURNS TABLE(
    ouvrage_id text,
    titre text,
    categorie text,
    nb_lecteurs bigint,
    pages_vues_total bigint,
    temps_total_sec bigint,
    derniere_activite timestamp
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
      SELECT
        o."id",
        o."titre",
        o."categorie"::text,
        count(l."id"),
        COALESCE(sum(
          (SELECT COALESCE(sum((t.v)::bigint), 0)
           FROM jsonb_each_text(COALESCE(l."pagesVues", '{}')::jsonb) AS t(k, v))
        ), 0),
        COALESCE(sum(l."tempsTotalSec"), 0),
        max(l."derniereLectureAt")
      FROM "Ouvrage" o
      LEFT JOIN "OuvrageLecture" l ON l."ouvrageId" = o."id"
      WHERE (o."etablissementId" = p_etablissement_id OR o."visibility" = 'PLATEFORME')
        AND o."statut" = 'VALIDE'
        AND o."deletedAt" IS NULL
        AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
        -- cloisonnement rôle + etab (conservé de 000124)
        AND current_setting('app.claims.role', true)
              IN ('ENSEIGNANT', 'RESPONSABLE', 'ADMIN')
        AND (
            current_setting('app.claims.role', true) = 'ADMIN'
            OR current_setting('app.claims.etablissement_id', true) = p_etablissement_id
        )
      GROUP BY o."id", o."titre", o."categorie"
      ORDER BY max(l."derniereLectureAt") DESC NULLS LAST, o."titre" ASC
    $function$;

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122/000123)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'VisibiliteOuvrage') = 3,
         'VisibiliteOuvrage doit avoir 3 valeurs';
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'StatutOuvrage') = 2,
         'StatutOuvrage doit avoir 2 valeurs';
  ASSERT (SELECT count(*) FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'Ouvrage' AND a.attname = 'visibility') = 1,
         'Ouvrage.visibility doit exister';
  ASSERT (SELECT count(*) FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'Ouvrage' AND a.attname = 'etablissementId'
            AND a.attnotnull = false) = 1,
         'Ouvrage.etablissementId doit etre nullable (ouvrages PLATEFORME)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass
            AND polname IN ('Ouvrage_select','Ouvrage_insert','Ouvrage_update')) = 3,
         'Ouvrage doit avoir exactement 3 policies (select/insert/update)';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"Ouvrage"'::regclass
            AND p.polname = 'Ouvrage_select'
            AND position('ouvrage_visible' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'Ouvrage_select doit deleguer a ouvrage_visible (source de verite unique)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageClasse"'::regclass
            AND polname IN ('OuvrageClasse_select','OuvrageClasse_insert','OuvrageClasse_delete')) = 3,
         'OuvrageClasse doit avoir 3 policies (select/insert/delete)';
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'OuvrageClasse'
            AND c.relrowsecurity) = 1,
         'RLS doit etre active sur OuvrageClasse';
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('ouvrage_visible','ouvrage_visible_par_classes',
                              'current_user_classes','ouvrage_parent_gestionnable')
            AND p.prosecdef) = 4,
         'Les 4 fonctions SECURITY DEFINER du scoping doivent exister';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"OuvrageLecture"'::regclass
            AND p.polname = 'OuvrageLecture_select'
            AND position('ouvrage_visible' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'OuvrageLecture_select doit deleguer a ouvrage_visible';
  -- Cohérence des données existantes : tout ouvrage pré-000137 est
  -- ETABLISSEMENT (défaut) avec un établissement renseigné.
  ASSERT (SELECT count(*) FROM "Ouvrage"
          WHERE "visibility" <> 'PLATEFORME' AND "etablissementId" IS NULL) = 0,
         'Tout ouvrage non-PLATEFORME doit avoir un etablissementId';
END $$;
