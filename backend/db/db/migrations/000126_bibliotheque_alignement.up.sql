-- ============================================================
-- Migration 000126 — Bibliothèque numérique P3 : le paquet enseignant
-- (OuvrageSection + AlignementOuvrage + audit de conformité).
-- ADR-0007 (docs/desktop/ADR/0007-bibliotheque-numerique.md §P3),
-- décision SECT-BIBLIO-P3.
-- ============================================================
-- OBJET : la « déclaration des 5 minutes » (invariant P3 : l'IA propose,
-- l'enseignant décide — la transposition didactique reste HUMAINE) :
--   1. OuvrageSection = TOC curaté par l'ADMIN (G1) — permet de cibler
--      la déclaration au chapitre/section de l'ouvrage de référence ;
--   2. AlignementOuvrage = la déclaration support ↔ ouvrage (± section)
--      par l'enseignant PROPRIÉTAIRE du support ;
--   3. conformite_referentiels_etablissement = l'audit de direction
--      (« le cours de M. X couvre N % du référentiel officiel »),
--      fonction SECURITY DEFINER cloisonnée (pattern 000124).
--
-- INVARIANTS (ADR-0007 I1/I2) : le livre ne génère JAMAIS de questions ;
-- la bibliographie référence, le support enseigne. Les alignements
-- nourrissent la bibliographie automatique et l'indicateur de conformité
-- — jamais la génération.
--
-- RLS — DÉLÉGATION (pattern 000124) :
--   - OuvrageSection_select délègue la visibilité à Ouvrage_select
--     (EXISTS : etab + non-supprimé + droits non expirés) ;
--   - AlignementOuvrage_select exige les DEUX parents visibles
--     (EXISTS Document etab-scopé via le propriétaire + EXISTS Ouvrage
--     aux conditions de Ouvrage_select) ;
--   - écritures : OuvrageSection = ADMIN/system (G1, TOC curaté) ;
--     AlignementOuvrage = enseignant propriétaire du support
--     (« ownerId » = current_user_id()) OU ADMIN/system, ET ouvrage
--     visible (WITH CHECK — un alignement sur un ouvrage masqué serait
--     une ligne zombie, invisible en lecture : on la refuse à l'écriture).
--
-- Leçons répercutées : RLS dans la MÊME migration que la table (000121) ;
-- TO PUBLIC (sect_app NOBYPASSRLS, pattern 000117) ; RLS évalué AVANT
-- contraintes sur INSERT (ouvrage/document invisible → 42501, pas 23503) ;
-- UNIQUE NULLS NOT DISTINCT (PG 18.6 — validé à l'ADR) ; aucun paramètre
-- plpgsql non typé, comparaisons enum uniquement contre des littéraux
-- (ENUM-SWEEP) ; ASSERTs post-migration (000122).
-- ============================================================

-- 1. OuvrageSection — TOC curaté par l'ADMIN (DDL ADR-0007 §P3)
CREATE TABLE "OuvrageSection" (
  "id"         TEXT PRIMARY KEY,
  "ouvrageId"  TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "titre"      TEXT NOT NULL,
  "pageDebut"  INTEGER,
  "pageFin"    INTEGER,
  "ordre"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX "OuvrageSection_ouvrage_idx" ON "OuvrageSection"("ouvrageId");

ALTER TABLE "OuvrageSection" ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "OuvrageSection_insert" ON "OuvrageSection";
CREATE POLICY "OuvrageSection_insert" ON "OuvrageSection"
    FOR INSERT TO PUBLIC
    WITH CHECK (is_admin() OR is_system());

DROP POLICY IF EXISTS "OuvrageSection_update" ON "OuvrageSection";
CREATE POLICY "OuvrageSection_update" ON "OuvrageSection"
    FOR UPDATE TO PUBLIC
    USING (is_admin() OR is_system())
    WITH CHECK (is_admin() OR is_system());

-- DELETE autorisé pour l'ADMIN (G1) : le TOC est une métadonnée légère
-- curatée, sans soft-delete (pas de colonne deletedAt — DDL ADR-0007).
-- Différence assumée avec Ouvrage/OuvrageLecture (actifs de lecture).
DROP POLICY IF EXISTS "OuvrageSection_delete" ON "OuvrageSection";
CREATE POLICY "OuvrageSection_delete" ON "OuvrageSection"
    FOR DELETE TO PUBLIC
    USING (is_admin() OR is_system());

-- 2. AlignementOuvrage — la déclaration support ↔ ouvrage (± section)
CREATE TABLE "AlignementOuvrage" (
  "id"               TEXT PRIMARY KEY,
  "documentId"       TEXT NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE,
  "ouvrageId"        TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  -- ON DELETE CASCADE (et non SET NULL comme esquisssé à l'ADR) : la
  -- contrainte UNIQUE NULLS NOT DISTINCT interdit le SET NULL dès qu'une
  -- déclaration « ouvrage entier » existe pour le même couple — le retour
  -- à NULL dupliquerait (doc, ouvrage, NULL) → 23505. Une citation ciblée
  -- qui perd son ancre (section retirée du TOC) est retirée : plus honnête
  -- que de la transformer silencieusement en « ouvrage entier ».
  "ouvrageSectionId" TEXT REFERENCES "OuvrageSection"("id") ON DELETE CASCADE,
  "declareParId"     TEXT NOT NULL REFERENCES "User"("id"),
  "note"             TEXT,
  "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
  -- Une déclaration par (support, ouvrage, section) — NULLS NOT DISTINCT :
  -- deux déclarations « sans section » du même ouvrage sont un doublon,
  -- mais (doc, ouvrage, NULL) + (doc, ouvrage, section A) coexistent
  -- (l'ouvrage entier ET un chapitre ciblé sont deux citations distinctes).
  UNIQUE NULLS NOT DISTINCT ("documentId","ouvrageId","ouvrageSectionId")
);

CREATE INDEX "AlignementOuvrage_document_idx" ON "AlignementOuvrage"("documentId");
CREATE INDEX "AlignementOuvrage_ouvrage_idx" ON "AlignementOuvrage"("ouvrageId");

ALTER TABLE "AlignementOuvrage" ENABLE ROW LEVEL SECURITY;

-- NB scoping : user_etab_id (helper SECURITY DEFINER 000020) plutôt qu'un
-- JOIN "User" — le JOIN hériterait de la RLS User (un étudiant ne voit pas
-- la ligne User de l'enseignant → EXISTS faux) alors que le scoping voulu
-- est « même établissement ». La RLS Document s'applique toujours au
-- EXISTS : l'enseignant voit SES supports, le RESP ceux de son etab,
-- l'étudiant ceux des UE de sa filière — plafond etab + plancher Document.
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

DROP POLICY IF EXISTS "AlignementOuvrage_delete" ON "AlignementOuvrage";
CREATE POLICY "AlignementOuvrage_delete" ON "AlignementOuvrage"
    FOR DELETE TO PUBLIC
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
    );

-- 3. Audit de direction — fonction ADDITIVE SECURITY DEFINER
-- (pattern 000124 : cloisonnement rôle+etab DANS la fonction).
--
-- Définitions (P3 v1, recoupement textuel — pas d'embedding, aucun LMS
-- concurrent ne peut produire cet indicateur sans les deux chaînes) :
--   - taux_couverture(support) = % des thèmes détectés du support qui
--     recoupent (contient/contenu-dans, casse ignorée) un thème d'un
--     ouvrage REFERENTIEL_OFFICIEL aligné et visible ;
--   - question conforme = rattachée à un chapitre (P2.5) dont un sujet
--     recoupe un thème d'un référentiel officiel aligné au support ;
--   - taux_conformite(épreuve) = % questions conformes (parmi les
--     questions de l'épreuve issues du support).
--
-- SORTIE : une ligne par support ANALYSE des enseignants de l'étab,
-- avec epreuves = jsonb agrégé des épreuves qui évaluent ce support.
CREATE FUNCTION public.conformite_referentiels_etablissement(p_etablissement_id text)
RETURNS TABLE(
    document_id text,
    nom_fichier text,
    enseignant text,
    ue_code text,
    nb_chapitres int,
    nb_questions int,
    nb_questions_alignees int,
    nb_alignements int,
    nb_alignements_referentiel int,
    taux_couverture int,
    dernier_alignement timestamp,
    epreuves jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_doc record;
    v_theme text;
    v_themes_doc text[];
    v_themes_ref text[];
    v_couverts int;
    v_taux int;
    v_nb_chapitres int;
    v_nb_questions int;
    v_nb_alignees int;
    v_nb_alignements int;
    v_nb_align_ref int;
    v_dernier timestamp;
    v_epreuves jsonb;
    v_row_eq record;
BEGIN
    -- Cloisonnement (pattern 000124) : SECURITY DEFINER exécute en tant
    -- que propriétaire (BYPASSRLS) — la fonction RÉ-IMPOSE l'accès sur
    -- les claims de la transaction appelante : RESPONSABLE/ADMIN
    -- uniquement, et un non-ADMIN ne sonde que SON établissement.
    IF current_setting('app.claims.role', true) NOT IN ('RESPONSABLE', 'ADMIN') THEN
        RETURN;
    END IF;
    IF current_setting('app.claims.role', true) <> 'ADMIN'
       AND current_setting('app.claims.etablissement_id', true) <> p_etablissement_id THEN
        RETURN;
    END IF;

    FOR v_doc IN
        SELECT doc."id", doc."nomFichier", doc."themesDetectes",
               u."name" AS enseignant, ue."code" AS ue_code
        FROM "Document" doc
        JOIN "User" u ON u."id" = doc."ownerId"
        LEFT JOIN "UniteEnseignement" ue ON ue."id" = doc."uniteEnseignementId"
        WHERE u."etablissementId" = p_etablissement_id
          AND doc."deletedAt" IS NULL
          AND doc."statutAnalyse" = 'ANALYSE'
    LOOP
        -- Thèmes du support (titres de chapitres — format TEXT-JSON du worker)
        SELECT COALESCE(array_agg(DISTINCT trim(t)), ARRAY[]::text[])
          INTO v_themes_doc
          FROM jsonb_array_elements_text(
                 CASE WHEN v_doc."themesDetectes" IS NULL
                        OR trim(v_doc."themesDetectes") = ''
                      THEN '[]'::jsonb
                      ELSE v_doc."themesDetectes"::jsonb
                 END) AS t;

        -- Thèmes des référentiels officiels alignés (ouvrages visibles)
        SELECT COALESCE(array_agg(DISTINCT trim(th)), ARRAY[]::text[])
          INTO v_themes_ref
          FROM "AlignementOuvrage" a
          JOIN "Ouvrage" o ON o."id" = a."ouvrageId"
          CROSS JOIN LATERAL jsonb_array_elements_text(
                 CASE WHEN o."themes" IS NULL OR trim(o."themes") = ''
                      THEN '[]'::jsonb
                      ELSE o."themes"::jsonb
                 END) AS th
          WHERE a."documentId" = v_doc.id
            AND o."categorie" = 'REFERENTIEL_OFFICIEL'
            AND o."deletedAt" IS NULL
            AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now());

        -- Recoupement textuel : un thème est couvert s'il contient ou est
        -- contenu dans un thème du référentiel (casse ignorée).
        v_couverts := 0;
        FOREACH v_theme IN ARRAY v_themes_doc LOOP
            IF EXISTS (
                SELECT 1 FROM unnest(v_themes_ref) AS r(th)
                WHERE lower(v_theme) LIKE '%' || lower(r.th) || '%'
                   OR lower(r.th) LIKE '%' || lower(v_theme) || '%'
            ) THEN
                v_couverts := v_couverts + 1;
            END IF;
        END LOOP;

        v_taux := 0;
        IF array_length(v_themes_doc, 1) > 0 THEN
            v_taux := (v_couverts * 100) / array_length(v_themes_doc, 1);
        END IF;

        SELECT count(*) INTO v_nb_chapitres
          FROM "Chapter" WHERE "documentId" = v_doc.id;

        -- Attribution : par documentId (questions de banque) OU, pour les
        -- questions IA d''épreuve (documentId NULL, P1-QUESTIONS-IA), par le
        -- document du chapitre rattaché (P2.5) — la traçabilité chapitre
        -- rend la question attributable au support qu''elle évalue.
        SELECT count(*),
               count(*) FILTER (WHERE q."chapterId" IS NOT NULL)
          INTO v_nb_questions, v_nb_alignees
          FROM "Question" q
          LEFT JOIN "Chapter" chq ON chq."id" = q."chapterId"
          WHERE COALESCE(q."documentId", chq."documentId") = v_doc.id
            AND q."deletedAt" IS NULL;

        SELECT count(*),
               count(*) FILTER (WHERE o."categorie" = 'REFERENTIEL_OFFICIEL'),
               max(a."createdAt")
          INTO v_nb_alignements, v_nb_align_ref, v_dernier
          FROM "AlignementOuvrage" a
          JOIN "Ouvrage" o ON o."id" = a."ouvrageId"
          WHERE a."documentId" = v_doc.id
            AND o."deletedAt" IS NULL
            AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now());

        -- Épreuves qui évaluent ce support (leurs questions issues du
        -- support) + taux de conformité (questions dont le chapitre
        -- recoupe les thèmes des référentiels alignés — P2.5 requise).
        v_epreuves := '[]'::jsonb;
        FOR v_row_eq IN
            SELECT e."id" AS eid, e."titre" AS titre,
                   count(q."id") AS total,
                   count(q."id") FILTER (
                       WHERE q."chapterId" IS NOT NULL
                         AND EXISTS (
                             SELECT 1 FROM "Chapter" ch
                             WHERE ch."id" = q."chapterId"
                               AND EXISTS (
                                   SELECT 1
                                     FROM jsonb_array_elements_text(
                                            CASE WHEN ch."sujets" IS NULL
                                                    OR trim(ch."sujets") = ''
                                                 THEN '[]'::jsonb
                                                 ELSE ch."sujets"::jsonb
                                            END) AS s(sv)
                                     WHERE EXISTS (
                                         SELECT 1 FROM unnest(v_themes_ref) AS r(th)
                                         WHERE lower(s.sv) LIKE '%' || lower(r.th) || '%'
                                            OR lower(r.th) LIKE '%' || lower(s.sv) || '%'
                                     )
                               )
                         )
                   ) AS conformes
            FROM "Epreuve" e
            JOIN "EpreuveQuestion" eq ON eq."epreuveId" = e."id"
            JOIN "Question" q ON q."id" = eq."questionId"
                             AND q."deletedAt" IS NULL
            LEFT JOIN "Chapter" chq ON chq."id" = q."chapterId"
            WHERE e."deletedAt" IS NULL
              AND COALESCE(q."documentId", chq."documentId") = v_doc.id
              AND e."enseignantId" IN (
                  SELECT "id" FROM "User" WHERE "etablissementId" = p_etablissement_id
              )
            GROUP BY e."id", e."titre"
        LOOP
            v_epreuves := v_epreuves || jsonb_build_object(
                'epreuveId', v_row_eq.eid,
                'titre', v_row_eq.titre,
                'nbQuestions', v_row_eq.total,
                'nbQuestionsConformes', v_row_eq.conformes,
                'tauxConformite', CASE WHEN v_row_eq.total > 0
                                       THEN (v_row_eq.conformes * 100) / v_row_eq.total
                                       ELSE 0 END);
        END LOOP;

        document_id := v_doc.id;
        nom_fichier := v_doc."nomFichier";
        enseignant := v_doc.enseignant;
        ue_code := v_doc.ue_code;
        nb_chapitres := v_nb_chapitres;
        nb_questions := v_nb_questions;
        nb_questions_alignees := v_nb_alignees;
        nb_alignements := v_nb_alignements;
        nb_alignements_referentiel := v_nb_align_ref;
        taux_couverture := v_taux;
        dernier_alignement := v_dernier;
        epreuves := v_epreuves;
        RETURN NEXT;
    END LOOP;
END;
$function$;

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122/000123/000124)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'OuvrageSection'
            AND c.relrowsecurity) = 1,
         'RLS doit etre active sur OuvrageSection';
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'AlignementOuvrage'
            AND c.relrowsecurity) = 1,
         'RLS doit etre active sur AlignementOuvrage';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageSection"'::regclass) = 4,
         'OuvrageSection doit avoir exactement 4 policies (select/insert/update/delete ADMIN)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"AlignementOuvrage"'::regclass) = 4,
         'AlignementOuvrage doit avoir exactement 4 policies (select/insert/update/delete)';
  -- UNIQUE NULLS NOT DISTINCT (PG 15+ ; requis PG 18.6 — validé ADR-0007)
  ASSERT (SELECT count(*) FROM pg_index i
          WHERE i.indrelid = '"AlignementOuvrage"'::regclass
            AND i.indisunique AND i.indnullsnotdistinct) = 1,
         'UNIQUE NULLS NOT DISTINCT (documentId, ouvrageId, ouvrageSectionId) doit exister';
  -- La délégation de visibilité doit exister dans les policies
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"AlignementOuvrage"'::regclass
            AND p.polname = 'AlignementOuvrage_select'
            AND position('dateExpirationDroits' in COALESCE(pg_get_expr(p.polqual, p.polrelid), '')) > 0
            AND position('ownerId' in COALESCE(pg_get_expr(p.polqual, p.polrelid), '')) > 0) = 1,
         'AlignementOuvrage_select doit exiger les DEUX parents visibles';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"AlignementOuvrage"'::regclass
            AND p.polname = 'AlignementOuvrage_insert'
            AND position('ownerId' in COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) > 0) = 1,
         'AlignementOuvrage_insert doit exiger le proprietaire du support (ou admin/system)';
  -- FK ON DELETE CASCADE : une citation ciblée perdant son ancre (section
  -- retirée du TOC) est retirée — le SET NULL dupliquerait (doc, ouvrage,
  -- NULL) si une déclaration « ouvrage entier » existe (23505, cf. DDL).
  ASSERT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = '"AlignementOuvrage"'::regclass
            AND contype = 'f'
            AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
            AND pg_get_constraintdef(oid) LIKE '%OuvrageSection%') = 1,
         'FK ouvrageSectionId ON DELETE CASCADE doit exister';
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'conformite_referentiels_etablissement'
            AND p.prosecdef) = 1,
         'conformite_referentiels_etablissement doit exister en SECURITY DEFINER';
END $$;
