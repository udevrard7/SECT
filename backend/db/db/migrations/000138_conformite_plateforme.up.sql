-- ============================================================
-- Migration 000138 — Conformité : les ouvrages PLATEFORME alignés
-- comptent dans l'audit d'établissement (SECT-BIBLIO-6, demande
-- exploitant — piste restante du worklog SECT-BIBLIO-5 : « l'audit
-- conformite_referentiels_etablissement() pourrait inclure les
-- ouvrages PLATEFORME alignés »).
-- ============================================================
-- OBJET : conformite_referentiels_etablissement() date de 000126
-- (corps repris tel quel par 000130) — AVANT le modèle 3 niveaux
-- (000137), les policies AlignementOuvrage_insert restreignaient de
-- fait les déclarations aux ouvrages du MÊME établissement
-- (o."etablissementId" = current_etablissement_id()) : l'audit ne
-- voyait donc que des ouvrages d'étab. Depuis 000137, un enseignant
-- PEUT déclarer un ouvrage PLATEFORME (référentiel national déposé
-- par l'admin plateforme, visible de TOUS les clients SECT) —
-- l'audit doit le compter : c'est précisément la valeur d'un
-- référentiel national que d'être alignable par chaque établissement.
--
-- PÉRIMÈTRE COMPTÉ (cohérent avec bibliotheque_activite_etablissement
-- 000137 §8 : WHERE etab = p OR visibility='PLATEFORME' + statut
-- VALIDE) : ouvrages PUBLIÉS (statut = 'VALIDE') disponibles pour
-- l'établissement sondé — les SIENS (ETABLISSEMENT + CLASSE, via
-- etablissementId) OU les ouvrages PLATEFORME. Sont exclus :
--   - les BROUILLON : un dépôt enseignant non validé n'est pas un
--     référentiel opposable pour l'audit de direction (le dépôt
--     reste visible par son auteur via ListByDocument) ;
--   - les ouvrages d'un AUTRE établissement (défense en profondeur :
--     la policy insert 000137 empêche déjà de les déclarer) ;
--   - corbeille et droits expirés (inchangé).
--
-- IMPACT : nb_alignements / nb_alignements_referentiel /
-- taux_couverture / epreuves[*].tauxConformite / dernier_alignement
-- ne comptent plus que ce périmètre. Prod à l'application :
-- Ouvrage = 0, AlignementOuvrage = 0 → zéro changement observable.
--
-- ZÉRO-RUPTURE : CREATE OR REPLACE (pattern 000130) — signature et
-- colonnes de sortie inchangées, le code Go appelant ne change pas.
--
-- Leçons répercutées : ASSERTs post-migration (000122) ; comparaison
-- enum↔littéral text OK en SQL (ENUM-SWEEP-1 ne concerne que
-- current_setting) ; SECURITY DEFINER préservé par le OR REPLACE.
-- ============================================================

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
    -- Cloisonnement (pattern 000124 + ADR-0009) : SECURITY DEFINER
    -- exécute en tant que propriétaire (BYPASSRLS) — la fonction
    -- RÉ-IMPOSE l'accès sur les claims de la transaction appelante :
    -- RESPONSABLE/ADMIN uniquement, et l'établissement sondé doit être
    -- CELUI des claims pour tous — l'ADMIN global passe par le mode
    -- assistance (JWT avec etablissementId, accès APPROUVE par le
    -- RESPONSABLE, B-2 : pas d'auto-approbation).
    IF current_setting('app.claims.role', true) NOT IN ('RESPONSABLE', 'ADMIN') THEN
        RETURN;
    END IF;
    IF current_setting('app.claims.etablissement_id', true) IS DISTINCT FROM p_etablissement_id THEN
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

        -- Thèmes des référentiels officiels alignés — périmètre
        -- SECT-BIBLIO-6 : ouvrages PUBLIÉS disponibles pour l'étab
        -- sondé (les siens OU PLATEFORME — un référentiel national
        -- déposé par l'admin plateforme compte dans la couverture).
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
            AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
            AND o."statut" = 'VALIDE'
            AND (o."etablissementId" = p_etablissement_id OR o."visibility" = 'PLATEFORME');

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

        -- Comptage des alignements — même périmètre SECT-BIBLIO-6 :
        -- ouvrages publiés de l'étab sondé + ouvrages PLATEFORME
        -- (les BROUILLON et les ouvrages d'un autre établissement
        -- ne comptent pas dans l'audit de direction).
        SELECT count(*),
               count(*) FILTER (WHERE o."categorie" = 'REFERENTIEL_OFFICIEL'),
               max(a."createdAt")
          INTO v_nb_alignements, v_nb_align_ref, v_dernier
          FROM "AlignementOuvrage" a
          JOIN "Ouvrage" o ON o."id" = a."ouvrageId"
          WHERE a."documentId" = v_doc.id
            AND o."deletedAt" IS NULL
            AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
            AND o."statut" = 'VALIDE'
            AND (o."etablissementId" = p_etablissement_id OR o."visibility" = 'PLATEFORME');

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
-- pattern 000122/000130)
-- ============================================================
DO $$
DECLARE
  v_conf text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_conf
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'conformite_referentiels_etablissement';

  ASSERT v_conf IS NOT NULL,
         'conformite_referentiels_etablissement doit exister';

  -- SECURITY DEFINER préservé par le CREATE OR REPLACE
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'conformite_referentiels_etablissement'
            AND p.prosecdef) = 1,
         'conformite_referentiels_etablissement doit rester SECURITY DEFINER';

  -- Le périmètre SECT-BIBLIO-6 est bien dans le corps
  ASSERT position('''PLATEFORME''' in v_conf) > 0,
         'conformite : la branche ouvrages PLATEFORME doit exister';
  ASSERT position('''VALIDE''' in v_conf) > 0,
         'conformite : le filtre statut VALIDE doit exister';
  ASSERT position('p_etablissement_id OR' in v_conf) > 0,
         'conformite : le perimetre etab OU PLATEFORME doit exister';
END $$;
