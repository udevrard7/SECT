-- Migration 000028 — Fix Etablissement_select : is_system() + ADMIN voit tout
--
-- CONTEXTE : après la bascule sect_app (NOBYPASSRLS), la policy Etablissement_select
-- exigeait (is_admin() AND admin_has_etablissement_access(id)). Or admin_has_etablissement_access
-- vérifie un accès APPROUVE valide. Un ADMIN sans accès APPROUVE ne voyait AUCUN établissement
-- → impossible de lister les établissements pour en demander l'accès (bug E2E découvert
-- sur /acces-etablissements → "Aucun établissement disponible").
--
-- FIX :
-- 1. Un ADMIN (propriétaire PaaS) voit TOUS les établissements (is_admin() sans condition
--    d'accès). La restriction d'accès aux DONNÉES reste assurée par les policies RLS des
--    tables métier (User, Filiere, Epreuve…) via admin_has_etablissement_access().
-- 2. is_system() permet au backend de lire les établissements pour les vérifications
--    système (ListAuthorizedEtablissements, etc.).
-- 3. (NOT is_admin()) AND own etab : un RESPONSABLE/ENSEIGNANT/ÉTUDIANT voit son établissement.
-- 4. TO public : la policy s'applique à sect_app (pas seulement neondb_owner).

DROP POLICY IF EXISTS "Etablissement_select" ON "Etablissement";
CREATE POLICY "Etablissement_select" ON "Etablissement"
    FOR SELECT TO public
    USING (
        is_system()
        OR is_admin()
        OR ((NOT is_admin()) AND (id = current_etablissement_id()))
    );
