-- ============================================================
-- Migration 000134 (DOWN) — rollback du canal Discord.
-- Revert du code d'abord (worker/handlers/frontend), puis :
-- réactivation du canal email (état antérieur 000133 : email actif
-- par défaut) + suppression de la colonne notifyDiscord.
-- ============================================================

DO $$
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000134-down', true);
    UPDATE "AlertingRule" SET "notifyEmail" = true, "updatedAt" = now();
END $$;

ALTER TABLE "AlertingRule" DROP COLUMN IF EXISTS "notifyDiscord";
