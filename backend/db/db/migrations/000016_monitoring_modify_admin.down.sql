-- ============================================================
-- Migration 000016 (DOWN) — Rollback policy MonitoringEvent_modify_admin
-- ============================================================

DROP POLICY IF EXISTS "MonitoringEvent_modify_admin" ON "MonitoringEvent";
