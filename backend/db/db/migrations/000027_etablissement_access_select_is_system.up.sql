-- Migration 000027 — Fix régression ListAuthorizedEtablissements/CheckAccess après bascule sect_app
--
-- CONTEXTE : après la bascule du rôle production vers sect_app (NOBYPASSRLS, RLS forced),
-- les méthodes repo.CheckAccess et repo.ListAuthorizedEtablissements utilisaient
-- r.pool.BeginTx SANS poser de claims → RLS bloquait (is_admin() retournait NULL) →
-- les endpoints retournaient 0 / 403 alors que l'accès APPROUVE existait bien en DB.
--
-- FIX : la policy EtablissementAccess_select accepte désormais is_system() pour permettre
-- aux méthodes système (CheckAccess, ListAuthorizedEtablissements) de lire les lignes
-- en posant les claims system-worker (comme getActiveProvider dans ai/service.go).
-- Le code Go pose ces claims via SELECT set_config('app.claims.user_id','system-worker',true)
-- au début de la transaction.
--
-- Impact : la policy reste restrictive (ADMIN voit tout, RESPONSABLE voit son étab,
-- system-worker voit tout pour les vérifications système). Pas de regression de sécurité
-- car system-worker n'est posé que par le backend (jamais par un utilisateur HTTP).

DROP POLICY IF EXISTS "EtablissementAccess_select" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_select" ON "EtablissementAccess"
    FOR SELECT TO neondb_owner
    USING (
        is_admin()
        OR is_system()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    );
