-- ════════════════════════════════════════════════════════════════════════════
-- 000111 — Sync Inscription lors d'un changement de filière d'un étudiant
--          (SECT-ETUDIANTS-NULL-FIX-2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   Depuis le fix SECT-ETUDIANTS-NULL-FIX-1, le retrait d'un étudiant de sa
--   filière (PATCH /api/users/{id} avec filiereId=null explicite) s'applique
--   bien en base (User.filiereId → NULL). Mais son Inscription EN_COURS de
--   l'année courante restait figée sur l'ancienne filière : incohérence dans
--   l'historique (dialog détail étudiant) et pour la clôture d'année.
--
--   Cette fonction synchronise l'Inscription de l'année courante
--   (Etablissement.anneeAcademiqueCouranteId) à CHAQUE changement de filière
--   via le PATCH :
--     - RETRAIT (p_nouvelle_filiere_id IS NULL) :
--         Inscription EN_COURS → REORIENTE (décision manuelle), avec
--         raisonDecision (nom de l'ancienne filière), decideParId,
--         dateCloture. L'étudiant reste dans l'établissement — ce n'est PAS
--         QUITTE. Il sera ré-incluse dans la clôture s'il est réaffecté.
--     - AFFECTATION / CHANGEMENT (p_nouvelle_filiere_id NOT NULL) :
--         Inscription EN_COURS ou REORIENTE → EN_COURS avec la nouvelle
--         filière (champs de décision nettoyés). Ne ressuscite JAMAIS une
--         inscription PROMU/REDOUBLANT/DIPLOME/EXCLU/QUITTE (décisions de
--         clôture définitives).
--
-- NON-BLOQUANT : codes de retour, jamais d'exception propagée (pattern
--   create_inscription_for_signup 000088). Si la cible n'est pas un ETUDIANT,
--   que l'établissement n'a pas d'année courante, ou qu'aucune inscription
--   ne correspond, la fonction retourne un code informatif et le PATCH
--   utilisateur réussit normalement.
--
-- SECURITY DEFINER : appelée depuis la transaction RLS du PATCH user
--   (claims RESPONSABLE ou ADMIN). La policy Inscription_modify n'autorise
--   que is_responsable — sans ce bypass, la suppression faite par un ADMIN
--   (utilisateurs-page envoie aussi filiereId) serait silencieusement
--   ignorée par la RLS (0 ligne, pas d'erreur). search_path = public.
--
-- APPELANT : repository/user.go UserRepository.Update (dans db.WithTx, juste
--   après le UPDATE "User" — atomique avec le changement de filière).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_inscription_filiere_change(
    p_etudiant_id text,
    p_nouvelle_filiere_id text,
    p_decide_par_id text
)
RETURNS TABLE(
    o_code text,
    o_message text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_etab_id text;
    v_annee_id text;
    v_count int;
BEGIN
    -- ── 1. La cible doit être un ETUDIANT existant ──
    SELECT u."etablissementId" INTO v_etab_id
    FROM "User" u
    WHERE u."id" = p_etudiant_id
      AND u."role" = 'ETUDIANT'::"Role";

    IF v_etab_id IS NULL THEN
        RETURN QUERY SELECT 'NOT_STUDENT'::text,
            'cible non étudiant ou introuvable — aucune synchronisation'::text;
        RETURN;
    END IF;

    -- ── 2. Année académique courante de l'établissement ──
    SELECT e."anneeAcademiqueCouranteId" INTO v_annee_id
    FROM "Etablissement" e
    WHERE e."id" = v_etab_id;

    IF v_annee_id IS NULL THEN
        RETURN QUERY SELECT 'NO_CURRENT_YEAR'::text,
            'établissement sans année académique courante — aucune synchronisation'::text;
        RETURN;
    END IF;

    -- ── 3a. RETRAIT : clôturer l'Inscription EN_COURS en REORIENTE ──
    IF p_nouvelle_filiere_id IS NULL THEN
        UPDATE "Inscription" AS i SET
            "statut" = 'REORIENTE',
            "decisionManuelle" = true,
            "raisonDecision" = 'Retiré de la filière « ' ||
                COALESCE((SELECT f."nom" FROM "Filiere" f WHERE f."id" = i."filiereId"), 'sans filière') ||
                ' » — l''étudiant reste dans l''établissement (réaffectation possible)',
            "decideParId" = p_decide_par_id,
            "dateCloture" = NOW(),
            "updatedAt" = NOW()
        WHERE i."etudiantId" = p_etudiant_id
          AND i."anneeAcademiqueId" = v_annee_id
          AND i."statut" = 'EN_COURS';

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'CLOSED'::text,
            format('inscription de l''année courante clôturée REORIENTE (%s ligne)', v_count);
        RETURN;
    END IF;

    -- ── 3b. AFFECTATION / CHANGEMENT : (ré)ouvrir en EN_COURS ──
    UPDATE "Inscription" AS i SET
        "filiereId" = p_nouvelle_filiere_id,
        "statut" = 'EN_COURS',
        "decisionManuelle" = false,
        "raisonDecision" = NULL,
        "decideParId" = NULL,
        "dateCloture" = NULL,
        "updatedAt" = NOW()
    WHERE i."etudiantId" = p_etudiant_id
      AND i."anneeAcademiqueId" = v_annee_id
      AND i."statut" IN ('EN_COURS', 'REORIENTE');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT 'SYNCED'::text,
        format('inscription de l''année courante synchronisée sur la nouvelle filière (%s ligne)', v_count);
    RETURN;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 'ERROR'::text, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_inscription_filiere_change(text, text, text) TO PUBLIC;
