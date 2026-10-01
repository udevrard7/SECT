-- ============================================================
-- Migration 000115 (DOWN) — retour à l'état 000024
-- ============================================================
-- Restaure Devoir_select sans branche étudiant (branches
-- 000024 exactes) et supprime le helper.
-- ============================================================

DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";
CREATE POLICY "Devoir_select" ON "Devoir" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND user_in_my_etab("enseignantId"))
  OR (is_admin() AND admin_has_etablissement_access(devoir_etab_id(id)))
);

DROP FUNCTION IF EXISTS public.devoir_ue_matches_my_filiere_niveau(text);
