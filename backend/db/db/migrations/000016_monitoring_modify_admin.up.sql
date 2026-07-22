-- ============================================================
-- Migration 000016 — Policy RLS MonitoringEvent_modify_admin (M3 CRITICAL)
-- ============================================================
--
-- Bug M3 (CRITICAL) : aucune policy MODIFY existante sur MonitoringEvent.
-- Les policies actuelles ne couvrent que SELECT (is_admin) et INSERT (system).
-- Un ADMIN ne pouvait pas UPDATE/DELETE un événement (résoudre/ignorer) car
-- la RLS bloquait silencieusement (0 ligne affectée).
--
-- Fix : ajouter MonitoringEvent_modify_admin (FOR ALL, is_admin()).
-- ============================================================

CREATE POLICY "MonitoringEvent_modify_admin" ON "MonitoringEvent"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());
