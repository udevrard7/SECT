-- Rollback migration 000029
DROP POLICY IF EXISTS "EtablissementAccess_modify_admin" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_modify_admin" ON "EtablissementAccess"
    FOR ALL TO neondb_owner
    USING (is_admin())
    WITH CHECK (is_admin());
