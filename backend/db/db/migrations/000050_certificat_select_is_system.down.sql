-- 000050_certificat_select_is_system.down.sql
-- Rollback : restaurer la policy Certificat_select sans is_system().
-- Attention : le endpoint public /api/certificats/verify/{code} redeviendra
-- cassé (404 pour codes existants) après ce rollback.

DROP POLICY IF EXISTS "Certificat_select" ON "Certificat";

CREATE POLICY "Certificat_select" ON "Certificat" FOR SELECT
    TO PUBLIC USING (
        (is_etudiant() AND ("etudiantId" = current_user_id()))
        OR (is_enseignant() AND ("emetteParId" = current_user_id()))
        OR (is_responsable() AND user_in_my_etab("etudiantId"))
        OR (is_admin() AND admin_has_etablissement_access(user_etab_id("etudiantId")))
    );
