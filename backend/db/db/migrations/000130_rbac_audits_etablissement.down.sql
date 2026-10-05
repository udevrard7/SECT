-- ============================================================
-- Migration 000130 (DOWN) — restaure les définitions 000124/000126
-- d'origine (bypass ADMIN global : role = 'ADMIN' OR etab = claims).
-- Rétro-conformité ADR-0009 : le rollback ré-ouvre le god-mode
-- lecture de l'ADMIN global — assumé et documenté.
-- ============================================================

-- 1. conformite_referentiels_etablissement — définition 000126 d'origine.
CREATE OR REPLACE FUNCTION public.conformite_referentiels_etablissement(p_etablissement_id text)
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

-- 2. bibliotheque_activite_etablissement — définition 000124 d'origine.
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
        -- cloisonnement rôle + etab (cf. ci-dessus)
        AND current_setting('app.claims.role', true)
              IN ('ENSEIGNANT', 'RESPONSABLE', 'ADMIN')
        AND (
            current_setting('app.claims.role', true) = 'ADMIN'
            OR current_setting('app.claims.etablissement_id', true) = p_etablissement_id
        )
      GROUP BY o."id", o."titre", o."categorie"
      ORDER BY max(l."derniereLectureAt") DESC NULLS LAST, o."titre" ASC
    $function$;
