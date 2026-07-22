-- Rollback migration 000027
DROP POLICY IF EXISTS "EtablissementAccess_select" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_select" ON "EtablissementAccess"
    FOR SELECT TO neondb_owner
    USING (
        is_admin()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    );
