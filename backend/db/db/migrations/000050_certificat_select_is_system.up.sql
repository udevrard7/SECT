-- 000050_certificat_select_is_system.up.sql
-- ============================================================================
-- AUDIT-RLS-REPOS-001 : ajouter OR is_system() à la policy Certificat_select.
--
-- Contexte :
-- L'endpoint PUBLIC /api/certificats/verify/{code} ne reçoit pas de JWT (pas
-- de claims utilisateur). Il doit pourtant lire un certificat par son code
-- de vérification. La policy Certificat_select actuelle dépend de
-- current_user_id()/is_etudiant()/is_enseignant()/is_responsable()/is_admin()
-- → sans claims, toutes ces fonctions retournent NULL → 0 rows → l'endpoint
-- retournait 404 pour des codes existants (confirmé en production : 14
-- certificats en DB, tous introuvables via l'API).
--
-- Fix :
-- Ajouter `OR is_system()` à la policy Certificat_select. Le repository
-- FindByCode utilise db.WithTx(ctx, pool, db.SystemClaims()) pour poser des
-- claims system-worker (is_system()=true). Cohérent avec Document, Epreuve,
-- Question, SessionPassation qui ont tous une policy *_all_system.
--
-- Sécurité :
-- is_system() n'est vrai QUE si les claims app.claims.user_id = 'system-worker'
-- ET app.claims.role = 'ADMIN' sont posés via SetClaimsTx. Seul le backend Go
-- (avec db.SystemClaims()) peut poser ces claims. Un utilisateur JWT normal
-- n'aura jamais is_system()=true. Le bypass est donc strictement limité au
-- backend, pour les endpoints publics (verify) ou les workers.
-- ============================================================================

DROP POLICY IF EXISTS "Certificat_select" ON "Certificat";

CREATE POLICY "Certificat_select" ON "Certificat" FOR SELECT
    TO PUBLIC USING (
        is_system()
        OR (is_etudiant() AND ("etudiantId" = current_user_id()))
        OR (is_enseignant() AND ("emetteParId" = current_user_id()))
        OR (is_responsable() AND user_in_my_etab("etudiantId"))
        OR (is_admin() AND admin_has_etablissement_access(user_etab_id("etudiantId")))
    );
