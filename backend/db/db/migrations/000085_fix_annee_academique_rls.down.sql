-- Rollback 000085 : restaure l'état cassé de 000007/000062 (TO neondb_owner).
-- ATTENTION : ce rollback réintroduit le bug SECT-ANNEE-RLS-FIX-2 (écritures
-- AnneeAcademique silencieusement perdues en production par sect_app).

-- AnneeAcademique_modify_responsable : revient à l'état 000062 (TO neondb_owner)
DROP POLICY IF EXISTS "AnneeAcademique_modify_responsable" ON "AnneeAcademique";
CREATE POLICY "AnneeAcademique_modify_responsable" ON "AnneeAcademique"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  );

-- AnneeAcademique_select : revient à l'état 000007 (TO neondb_owner)
DROP POLICY IF EXISTS "AnneeAcademique_select" ON "AnneeAcademique";
CREATE POLICY "AnneeAcademique_select" ON "AnneeAcademique"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
