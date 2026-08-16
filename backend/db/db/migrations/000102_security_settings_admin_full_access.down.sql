-- Rollback migration 000102 — Restore original SecuritySettings RLS policies

-- 1. Restore original SecuritySettings_select (with admin_has_etablissement_access)
DROP POLICY IF EXISTS "SecuritySettings_select" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_select" ON "SecuritySettings"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );

-- 2. Restore original SecuritySettings_modify_admin (with admin_has_etablissement_access)
DROP POLICY IF EXISTS "SecuritySettings_modify_admin" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_modify_admin" ON "SecuritySettings"
  FOR ALL TO neondb_owner
  USING (is_admin() AND admin_has_etablissement_access("etablissementId"))
  WITH CHECK (is_admin() AND admin_has_etablissement_access("etablissementId"));
