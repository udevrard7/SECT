-- 000040_etablissement_access_roles_public.down.sql
-- Rollback : restaurer les policies avec roles={neondb_owner}.

DROP POLICY IF EXISTS "EtablissementAccess_select" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_select"
  ON "EtablissementAccess"
  FOR SELECT
  TO neondb_owner
  USING (is_admin() OR is_system() OR (is_responsable() AND ("etablissementId" = current_etablissement_id())));

DROP POLICY IF EXISTS "EtablissementAccess_modify_responsable" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_modify_responsable"
  ON "EtablissementAccess"
  FOR UPDATE
  TO neondb_owner
  USING (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  WITH CHECK (is_responsable() AND ("etablissementId" = current_etablissement_id()));
