-- ============================================================
-- Migration 000120 (DOWN) — rollback
-- ============================================================

ALTER TABLE "NotificationAdmin" DROP CONSTRAINT "NotificationAdmin_destinataireId_fkey";
ALTER TABLE "NotificationAdmin"
    ADD CONSTRAINT "NotificationAdmin_destinataireId_fkey"
    FOREIGN KEY ("destinataireId") REFERENCES "User"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;
