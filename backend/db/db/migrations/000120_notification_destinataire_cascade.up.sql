-- ============================================================
-- Migration 000120 — NotificationAdmin.destinataireId : ON DELETE CASCADE
-- Task ID: SECT-NOTIF-DIFFUSION-1 (bug bonus découvert au smoke prod)
-- ============================================================
--
-- BUG : le FK destinataireId → User était ON DELETE SET NULL. Supprimer un
-- utilisateur transformait SES notifications personnelles en DIFFUSIONS
-- GLOBALES (destinataireId NULL + destinataireRole NULL = visible par toute
-- la plateforme). Cas réel en prod : « Promotion accordée 🎓 »
-- (CLOTURE_DECISION, 2026-09-29) visible dans la cloche de CHAQUE
-- utilisateur après la suppression de son destinataire.
--
-- FIX :
--   1. FK → ON DELETE CASCADE : une notification personnelle meurt avec son
--      destinataire (jamais transformée en broadcast).
--   2. Purge des lignes déjà orphelines (types personnels du dispatcher
--      devenus globaux).
-- ============================================================

-- 1. Purge des orphelins AVANT de changer le FK (les NotificationRead
--    suivent via leur propre ON DELETE CASCADE).
DELETE FROM "NotificationAdmin"
WHERE "destinataireId" IS NULL
  AND "destinataireRole" IS NULL
  AND "destinataireSegment" IS NULL
  AND "type" IN ('CLOTURE_DECISION', 'AFFECTATION_PUBLISHED', 'DEVOIR_CORRIGE',
                 'RESULTAT_PUBLIE', 'ALERTE_FRAUDE');

-- 2. FK : SET NULL → CASCADE (les notifications personnelles appartiennent
--    à leur destinataire).
ALTER TABLE "NotificationAdmin" DROP CONSTRAINT "NotificationAdmin_destinataireId_fkey";
ALTER TABLE "NotificationAdmin"
    ADD CONSTRAINT "NotificationAdmin_destinataireId_fkey"
    FOREIGN KEY ("destinataireId") REFERENCES "User"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
