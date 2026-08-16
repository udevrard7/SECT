-- Migration 000029 — Fix mutations EtablissementAccess : modify_admin accepte is_system()
--
-- CONTEXTE : repo.Create/Update/Delete utilisent r.pool.BeginTx SANS poser de claims.
-- Avec sect_app (NOBYPASSRLS, RLS forced), is_admin() retourne NULL → les mutations
-- sont bloquées → 409 ConflictError "la demande a été modifiée par un autre utilisateur"
-- (en réalité, le UPDATE ne matche aucune ligne à cause de RLS).
--
-- FIX : la policy EtablissementAccess_modify_admin accepte désormais is_system() pour
-- permettre au backend de muter les lignes en posant les claims system-worker (comme
-- getActiveProvider dans ai/service.go). Le code Go posera ces claims via
-- SELECT set_config('app.claims.user_id','system-worker',true) au début de la transaction.
--
-- Sécurité : system-worker n'est posé que par le backend (jamais par un utilisateur HTTP).
-- Le filtrage métier reste assuré par le usecase (FindByID + checks ownership + transitions).

DROP POLICY IF EXISTS "EtablissementAccess_modify_admin" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_modify_admin" ON "EtablissementAccess"
    FOR ALL TO public
    USING (is_admin() OR is_system())
    WITH CHECK (is_admin() OR is_system());
