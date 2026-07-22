-- ============================================================
-- Migration 000015 (DOWN) — Rollback policy SecuritySettings_modify_admin
-- ============================================================

DROP POLICY IF EXISTS "SecuritySettings_modify_admin" ON "SecuritySettings";
