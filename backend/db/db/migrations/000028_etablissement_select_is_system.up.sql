-- Migration 000028 — Fix ListAuthorizedEtablissements : Etablissement_select accepte is_system()
--
-- CONTEXTE : suite au fix 000027, EtablissementAccess_select accepte is_system(), mais
-- ListAuthorizedEtablissements fait un JOIN sur Etablissement qui a sa propre policy
-- Etablissement_select. Cette policy n'accepte que is_admin() (avec admin_has_etablissement_access)
-- ou (NOT is_admin() AND own etab). Avec claims system-worker, is_admin() retourne NULL →
-- le JOIN retourne 0 ligne.
--
-- FIX : ajouter OR is_system() à Etablissement_select pour permettre au backend de
-- lire les établissements lors des vérifications système (ListAuthorizedEtablissements,
-- et tout autre JOIN futur sur Etablissement depuis un contexte system-worker).

DROP POLICY IF EXISTS "Etablissement_select" ON "Etablissement";
CREATE POLICY "Etablissement_select" ON "Etablissement"
    FOR SELECT TO public
    USING (
        is_system()
        OR (is_admin() AND admin_has_etablissement_access(id))
        OR ((NOT is_admin()) AND (id = current_etablissement_id()))
    );
