-- ════════════════════════════════════════════════════════════════════════════
-- 000088 — Hook : création automatique d'Inscription à l'inscription étudiante
--          (SECT-INSCRIPTION-SIGNUP-HOOK-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   La table Inscription (000087) est la source de vérité historique pour la
--   feature de clôture d'année (SECT-PROMOTION-*). Sans Inscription, la clôture
--   ne sait pas qui promouvoir. Il faut donc créer une Inscription EN_COURS
--   pour chaque étudiant au moment de son inscription, pour l'année courante
--   de son établissement.
--
--   Le flow d'inscription étudiante se fait via signup-link (endpoint public,
--   pas d'auth → pas de claims RLS). La fonction SQL accept_student_signup
--   (000081) est déjà SECURITY DEFINER pour bypass RLS. On suit le même pattern
--   pour create_inscription_for_signup.
--
-- FONCTION create_inscription_for_signup(p_etudiant_id, p_etablissement_id,
--   p_filiere_id, p_niveau) :
--   1. Récupère l'année courante de l'établissement (Etablissement.anneeAcademiqueCouranteId).
--   2. Si aucune année courante → retourne code "NO_CURRENT_YEAR" (non bloquant —
--      le RESPONSABLE devra définir une année courante, puis lancera un backfill).
--   3. Si une Inscription existe déjà pour (etudiantId, anneeId) → retourne code
--      "EXISTS" (idempotent — safe de retry).
--   4. Si p_niveau est NULL → retourne code "NO_NIVEAU" (l'étudiant n'a pas de
--      niveau renseigné — cas anormal, le link devrait toujours avoir un niveau).
--   5. INSERT dans Inscription avec statut=EN_COURS, niveau, filiereId.
--   6. Retourne code "OK" + inscription_id + annee_id.
--
-- NON-BLOQUANT : le usecase StudentSignupLinkUseCase.Accept appelle cette fonction
--   APRÈS accept_student_signup (qui crée le User). Si create_inscription_for_signup
--   échoue (NO_CURRENT_YEAR, erreur DB), l'inscription étudiante RÉUSSIT quand
--   même (le User est créé, l'étudiant peut se connecter). L'erreur est loggée
--   mais non propagée. Un backfill ultérieur pourra créer les Inscriptions
--   manquantes (task future SECT-INSCRIPTION-BACKFILL-1).
--
-- SECURITY DEFINER : bypass RLS (endpoint public, pas de claims). search_path =
--   public pour éviter les attaques par schéma.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_inscription_for_signup(
    p_etudiant_id text,
    p_etablissement_id text,
    p_filiere_id text,
    p_niveau "NiveauEtude"
)
RETURNS TABLE(
    o_code text,
    o_inscription_id text,
    o_annee_id text,
    o_message text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_annee_id text;
    v_inscription_id text;
    v_existing_id text;
BEGIN
    -- ── 1. Récupérer l'année courante de l'établissement ──
    SELECT e."anneeAcademiqueCouranteId" INTO v_annee_id
    FROM "Etablissement" e
    WHERE e."id" = p_etablissement_id;

    IF v_annee_id IS NULL THEN
        RETURN QUERY SELECT 'NO_CURRENT_YEAR'::text, NULL::text, NULL::text,
            'Aucune année académique courante définie pour cet établissement'::text;
        RETURN;
    END IF;

    -- ── 2. Vérifier que le niveau est renseigné ──
    IF p_niveau IS NULL THEN
        RETURN QUERY SELECT 'NO_NIVEAU'::text, NULL::text, v_annee_id,
            'Aucun niveau renseigné pour cet étudiant'::text;
        RETURN;
    END IF;

    -- ── 3. Idempotence : Inscription déjà existante ? ──
    SELECT "id" INTO v_existing_id
    FROM "Inscription"
    WHERE "etudiantId" = p_etudiant_id AND "anneeAcademiqueId" = v_annee_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN QUERY SELECT 'EXISTS'::text, v_existing_id, v_annee_id,
            'Inscription déjà existante pour cette année'::text;
        RETURN;
    END IF;

    -- ── 4. INSERT Inscription ──
    v_inscription_id := 'ins_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO "Inscription" (
        "id", "etudiantId", "anneeAcademiqueId", "filiereId", "niveau",
        "statut", "createdAt", "updatedAt"
    ) VALUES (
        v_inscription_id, p_etudiant_id, v_annee_id, p_filiere_id, p_niveau,
        'EN_COURS', NOW(), NOW()
    );

    RETURN QUERY SELECT 'OK'::text, v_inscription_id, v_annee_id, NULL::text;
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 'ERROR'::text, NULL::text, v_annee_id, SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_inscription_for_signup(text, text, text, "NiveauEtude") TO PUBLIC;
