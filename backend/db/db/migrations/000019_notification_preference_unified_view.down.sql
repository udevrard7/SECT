-- ============================================================
-- Migration 000019 (DOWN) — Rollback
-- ============================================================

DROP VIEW IF EXISTS "NotificationUnified";
DROP TRIGGER IF EXISTS "NotificationPreference_set_updated_at" ON "NotificationPreference";
DROP TABLE IF EXISTS "NotificationPreference";
