-- ============================================================
-- Migration 000018 (DOWN) — Rollback
-- ============================================================

DROP POLICY IF EXISTS "NotificationAdmin_update_destinataire" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_select_destinataire" ON "NotificationAdmin";
