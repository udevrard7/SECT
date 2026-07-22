-- Rollback migration 000028
DROP POLICY IF EXISTS "Etablissement_select" ON "Etablissement";
CREATE POLICY "Etablissement_select" ON "Etablissement"
    FOR SELECT TO neondb_owner
    USING (
        (is_admin() AND admin_has_etablissement_access(id))
        OR ((NOT is_admin()) AND (id = current_etablissement_id()))
    );
