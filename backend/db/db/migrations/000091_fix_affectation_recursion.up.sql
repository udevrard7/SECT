-- ════════════════════════════════════════════════════════════════════════════
-- 000091 — Fix infinite recursion Affectation_select ↔ UniteEnseignement_select
--          (SECT-AFFECTATION-RECURSION-FIX-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG introduit par la migration 000090 : la nouvelle branche étudiant de
-- Affectation_select faisait :
--   EXISTS (SELECT 1 FROM "UniteEnseignement" ue WHERE ue."id" = ... AND
--           ue."filiereId" IS NOT DISTINCT FROM current_user_filiere_id())
--
-- Or la policy UniteEnseignement_select (migration 000024) a une branche
-- enseignant qui fait :
--   EXISTS (SELECT 1 FROM "Affectation" a WHERE a."uniteEnseignementId" = ... )
--
-- → RÉCURSION INFINITE : Affectation_select → EXISTS UniteEnseignement →
--   UniteEnseignement_select → EXISTS Affectation → Affectation_select → ...
--   Erreur PostgreSQL : "infinite recursion detected in policy for relation
--   UniteEnseignement" (SQLSTATE 42P17) → HTTP 500 sur /api/affectations ET
--   /api/unites-enseignement (les 2 endpoints cassés).
--
-- FIX : remplacer le EXISTS sur UniteEnseignement par une fonction SECURITY
-- DEFINER `affectation_visible_by_student(p_affectation_id)` qui lit l'UE
-- bypass RLS (row_security = off). La fonction ne déclenche PAS la policy
-- UniteEnseignement_select → pas de récursion.
--
-- La fonction vérifie :
--   1. L'affectation est PUBLIEE.
--   2. L'UE de l'affectation a filiereId = current_user_filiere_id() (étudiant
--      de la même filière).
-- NB : on ne couvre pas les UE multi-filières (N:N via UniteEnseignementFiliere)
-- pour éviter une nouvelle récursion (cette table a aussi une policy qui
-- référence UE). Si besoin, une future fonction dédiée pourra étendre.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Fonction SECURITY DEFINER : vérifie si un étudiant peut voir une affectation.
--    Bypass RLS (row_security = off) pour éviter la récursion.
CREATE OR REPLACE FUNCTION public.affectation_visible_by_student(p_affectation_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_statut text;
    v_ue_filiere_id text;
    v_student_filiere_id text;
BEGIN
    -- Récupérer le statut + filiereId de l'UE de l'affectation (bypass RLS).
    SELECT a."statut", ue."filiereId"
    INTO v_statut, v_ue_filiere_id
    FROM "Affectation" a
    JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
    WHERE a."id" = p_affectation_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Doit être PUBLIEE.
    IF v_statut <> 'PUBLIEE' THEN
        RETURN false;
    END IF;

    -- L'étudiant doit être de la même filière que l'UE.
    v_student_filiere_id := current_user_filiere_id();
    IF v_student_filiere_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_ue_filiere_id IS NOT DISTINCT FROM v_student_filiere_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.affectation_visible_by_student(text) TO PUBLIC;

-- 2. Remplacer la branche étudiant de Affectation_select par la fonction.
--    Avant (récursif) :
--      OR (is_etudiant() AND "statut" = 'PUBLIEE' AND EXISTS (SELECT 1 FROM "UniteEnseignement" ue WHERE ...))
--    Après (non-récursif via SECURITY DEFINER) :
--      OR (is_etudiant() AND affectation_visible_by_student(id))
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
  OR (is_etudiant() AND affectation_visible_by_student(id))
);
