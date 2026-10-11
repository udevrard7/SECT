-- ============================================================
-- Migration 000137 (down) — retour au modèle 000123/000124/000126/000127
-- « catalogue par établissement » (G2). Inverse TOUTES les
-- modifications de 000137 : policies d'origine restaurées,
-- OuvrageClasse/colonnes/enums/fonctions supprimés.
-- ATTENTION : les ouvrages PLATEFORME existants seraient perdus de
-- vue (etablissementId NULL remis NOT NULL impossible sans
-- ré-affectation) — ce down est fourni pour rollback propre AVANT
-- toute donnée PLATEFORME créée.
-- ============================================================

-- 1. Policies Ouvrage d'origine (000123)
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

-- 2. Policies OuvrageLecture d'origine (000124 — délégation EXISTS)
DROP POLICY IF EXISTS "OuvrageLecture_select" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_select" ON "OuvrageLecture"
    FOR SELECT TO PUBLIC
    USING (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

DROP POLICY IF EXISTS "OuvrageLecture_insert" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_insert" ON "OuvrageLecture"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

DROP POLICY IF EXISTS "OuvrageLecture_update" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_update" ON "OuvrageLecture"
    FOR UPDATE TO PUBLIC
    USING (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    )
    WITH CHECK (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

-- 3. Policies OuvrageSection/AlignementOuvrage d'origine (000126)
DROP POLICY IF EXISTS "OuvrageSection_select" ON "OuvrageSection";
CREATE POLICY "OuvrageSection_select" ON "OuvrageSection"
    FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

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
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
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
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
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
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

-- 4. Policies OuvrageAnnotation d'origine (000127)
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

-- 5. Fonction agrégat d'origine (000124)
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
      WHERE o."etablissementId" = p_etablissement_id
        AND o."deletedAt" IS NULL
        AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
        AND current_setting('app.claims.role', true)
              IN ('ENSEIGNANT', 'RESPONSABLE', 'ADMIN')
        AND (
            current_setting('app.claims.role', true) = 'ADMIN'
            OR current_setting('app.claims.etablissement_id', true) = p_etablissement_id
        )
      GROUP BY o."id", o."titre", o."categorie"
      ORDER BY max(l."derniereLectureAt") DESC NULLS LAST, o."titre" ASC
    $function$;

-- 6. Table OuvrageClasse + fonctions de scoping
DROP TABLE IF EXISTS "OuvrageClasse";
DROP FUNCTION IF EXISTS public.ouvrage_visible(text);
DROP FUNCTION IF EXISTS public.ouvrage_visible_par_classes(text);
DROP FUNCTION IF EXISTS public.ouvrage_parent_gestionnable(text);
DROP FUNCTION IF EXISTS public.current_user_classes();

-- 7. Colonnes + contraintes + enums
ALTER TABLE "Ouvrage" DROP CONSTRAINT IF EXISTS "Ouvrage_visibility_etab_ck";
DROP INDEX IF EXISTS "Ouvrage_visibility_idx";
DROP INDEX IF EXISTS "Ouvrage_statut_idx";
ALTER TABLE "Ouvrage" DROP COLUMN IF EXISTS "visibility";
ALTER TABLE "Ouvrage" DROP COLUMN IF EXISTS "statut";
ALTER TABLE "Ouvrage" ALTER COLUMN "etablissementId" SET NOT NULL;

DROP TYPE IF EXISTS "VisibiliteOuvrage";
DROP TYPE IF EXISTS "StatutOuvrage";
