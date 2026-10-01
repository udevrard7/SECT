-- ============================================================
-- Migration 000114 (DOWN) — Branches is_system() Affectation + UE
-- SECT-ANNEE-DETTES-3 (complément de 000113)
-- ============================================================
-- Restaure les 3 policies à leur état 000091/000024/000024
-- (sans les branches système). Les affectations éventuellement
-- recréées par le bouton « Recréer » ne sont PAS touchées.
-- ============================================================

-- 1. Affectation — lecture (état 000091).
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
  OR (is_etudiant() AND affectation_visible_by_student(id))
);

-- 2. Affectation — écriture (état 000024).
DROP POLICY IF EXISTS "Affectation_modify_responsable" ON "Affectation";
CREATE POLICY "Affectation_modify_responsable" ON "Affectation" FOR ALL TO PUBLIC
  USING (is_responsable() AND affectation_in_my_etab(id))
  WITH CHECK (is_responsable() AND affectation_in_my_etab(id));

-- 3. UniteEnseignement — lecture (état 000024).
DROP POLICY IF EXISTS "UniteEnseignement_select" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_select" ON "UniteEnseignement" FOR SELECT TO PUBLIC USING (
  (is_responsable() AND filiere_in_my_etab("filiereId"))
  OR (is_admin() AND admin_has_etablissement_access(ue_etab_id(id)))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Affectation" a WHERE a."uniteEnseignementId" = "UniteEnseignement".id AND a."enseignantId" = current_user_id()
  ))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "User" me WHERE me.id = current_user_id() AND me."filiereId" = "UniteEnseignement"."filiereId"
  ))
);
