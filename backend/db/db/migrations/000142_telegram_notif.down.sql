-- ============================================================
-- Migration 000142 (DOWN) — retour au canal Instagram (annulation)
-- ============================================================
-- Restaure l'état 000141 : colonnes instagram + préférence, retire les
-- colonnes/policy Telegram. Le code correspondant (tag Git) est celui
-- d'avant SECT-NOTIF-TELEGRAM-1.
-- ============================================================

-- Retrait du canal Telegram
DROP POLICY IF EXISTS "User_update_system" ON "User";

ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "telegramEnabled";

-- L'index partiel disparaît avec la colonne, on le nomme pour être
-- explicite sur l'intention (idempotent).
DROP INDEX IF EXISTS "User_telegramChatId_key";

ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramChatId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramUsername";

-- Restauration du canal Instagram (état 000141 partie B)
ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "instagram" TEXT;

ALTER TABLE "NotificationPreference"
        ADD COLUMN IF NOT EXISTS "instagramEnabled" BOOLEAN NOT NULL DEFAULT true;
