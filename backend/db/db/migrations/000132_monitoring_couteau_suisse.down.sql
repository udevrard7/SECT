-- ============================================================
-- Migration 000132 DOWN — rollback ADR-0011.
-- ATTENTION (pattern 000131) : le rollback de la fonction exige de
-- REVERTER LE CODE D'ABORD (les handlers Go qui l'appellent), sinon
-- 500 sur /api/stats/admin et /api/monitoring/overview.
-- ============================================================

-- 1. Helper counts : on ne recrée PAS les « hardcodé 0 » (le code
--    reverté n'appelle plus la fonction) — simple DROP.
DROP FUNCTION IF EXISTS public.admin_securite_etablissements_counts();

-- 2. Retour aux policies historiques TO neondb_owner (état repo
--    pré-000132 ; la prod était déjà TO PUBLIC — voir 000132 up).
DROP POLICY IF EXISTS "MonitoringEvent_select_admin" ON "MonitoringEvent";
DROP POLICY IF EXISTS "MonitoringEvent_insert_system" ON "MonitoringEvent";
DROP POLICY IF EXISTS "MonitoringEvent_modify_admin" ON "MonitoringEvent";

CREATE POLICY "MonitoringEvent_select_admin"
    ON "MonitoringEvent" FOR SELECT
    TO neondb_owner
    USING (is_admin());

CREATE POLICY "MonitoringEvent_insert_system"
    ON "MonitoringEvent" FOR INSERT
    TO neondb_owner
    WITH CHECK (true);

CREATE POLICY "MonitoringEvent_modify_admin"
    ON "MonitoringEvent" FOR ALL
    TO neondb_owner
    USING (is_admin())
    WITH CHECK (is_admin());

-- 3. Index (bénin : on peut le laisser, mais rollback propre = drop)
DROP INDEX IF EXISTS "MonitoringEvent_actif_created_idx";
