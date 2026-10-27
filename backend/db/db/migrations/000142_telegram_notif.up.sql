-- ============================================================
-- Migration 000142 — Canal Telegram (SECT-NOTIF-TELEGRAM-1)
-- ============================================================
-- Contexte : le canal 7 des notifications étudiantes devait passer par
-- l'API Instagram Messaging (000141) : compte BUSINESS relié à une page
-- Facebook + token Meta longue durée + possible app review — coût et
-- complexité rédhibitoires. DÉCISION EXPLOITANT : retirer Instagram,
-- le remplacer par un BOT TELEGRAM PARTAGÉ (Bot API gratuite, sans
-- revue, un seul bot pour tous les étudiants).
--
-- Différence de modèle (d'où le schéma) : un bot Telegram ne peut écrire
-- qu'aux chats qui l'ont DÉMARRÉ → l'étudiant ne « déclare » plus un
-- handle (User.instagram) ; il clique un deep-link
-- t.me/<bot>?start=<code HMAC> depuis /profil, appuie Démarrer, et le
-- webhook POST /api/telegram/webhook stocke le chat_id du message.
--
-- PARTIE A — retrait du canal Instagram :
--   DROP User.instagram, NotificationPreference.instagramEnabled (000141 B).
--   Les handles déjà saisis par les étudiants sont perdus — le canal
--   n'a JAMAIS été actif en production (aucun INSTAGRAM_USER_ID posé),
--   la perte est nulle.
--
-- PARTIE B — canal Telegram :
--   User.telegramChatId   TEXT     — cible d'envoi (sendMessage), lié par
--                                    le webhook ; NULL = non lié.
--   User.telegramUsername TEXT     — handle d'affichage (@pseudo au
--                                    moment de la liaison ; cosmétique).
--   Index unique partiel sur telegramChatId : un chat Telegram = un
--                                    compte SECT au plus (message d'erreur
--                                    actionnable côté webhook, 23505).
--   NotificationPreference.telegramEnabled BOOLEAN NOT NULL DEFAULT true
--                                    — opt-out par catégorie, même
--                                    sémantique que push/email.
--
-- PARTIE C — RLS : le webhook (claims système) UPDATE User pour lier/
-- délier le chat_id. User_select avait déjà is_system() (000097) et
-- User_delete aussi (000084) — User_update PAS : on ajoute la policy
-- User_update_system (même pattern que les *_all_system de 000117, mais
-- bornée à UPDATE). Elle ne s'ouvre QUE pour is_system() : les requêtes
-- utilisateur ne peuvent pas l'utiliser (les claims système ne sont
-- posés que par le backend Go — SystemClaims).
--
-- L'auto-déconnexion du dispatcher (clearStaleTelegramChatID : utilisateur
-- a bloqué le bot) et le /stop du webhook passent aussi par cette policy.
--
-- ORDRE DE DÉPLOIEMENT (le déploiement NE déclenche PAS les migrations —
-- leçon 000141) : déployer le code D'ABORD, appliquer la migration
-- ENSUITE. Le nouveau code est tolérant aux colonnes absentes
-- (fetchPreferences → défauts, /api/telegram/link → connected=false,
-- /api/me ne référence plus instagram) ; l'ANCIEN code cassait dès que
-- User.instagram disparaissait (scanUser SELECT u."instagram" → 42703
-- sur /api/me) — d'où cet ordre et non l'inverse.
--
-- Leçons répercutées : ASSERTs post-migration (000122) ; down intégral.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- PARTIE A — Retrait du canal Instagram
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "User" DROP COLUMN IF EXISTS "instagram";

ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "instagramEnabled";

-- ═══════════════════════════════════════════════════════════════
-- PARTIE B — Canal Telegram
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;

-- Un chat Telegram appartient à un compte SECT au plus (le webhook
-- répond un message actionnable sur 23505 : « envoyez /stop d'abord »).
-- Index partiel : NULL (non lié) n'occupe pas d'entrée.
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key"
        ON "User" ("telegramChatId")
        WHERE "telegramChatId" IS NOT NULL;

ALTER TABLE "NotificationPreference"
        ADD COLUMN IF NOT EXISTS "telegramEnabled" BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- PARTIE C — RLS : UPDATE système sur User (webhook Telegram)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "User_update_system" ON "User";
CREATE POLICY "User_update_system" ON "User"
        FOR UPDATE TO PUBLIC
        USING (is_system())
        WITH CHECK (is_system());

-- ═══════════════════════════════════════════════════════════════
-- ASSERTs post-migration (l'échec d'un ASSERT fait échouer la
-- migration — défense contre un apply partiel, pattern 000122).
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- A : instagram retiré.
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'User'
            AND column_name = 'instagram'),
         'User.instagram doit avoir été retiré (canal Instagram supprimé)';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'NotificationPreference'
            AND column_name = 'instagramEnabled'),
         'NotificationPreference.instagramEnabled doit avoir été retiré';
  -- B : colonnes Telegram présentes avec le bon type.
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'User'
            AND column_name = 'telegramChatId' AND data_type = 'text'),
         'User.telegramChatId doit exister en TEXT';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'User'
            AND column_name = 'telegramUsername' AND data_type = 'text'),
         'User.telegramUsername doit exister en TEXT';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'NotificationPreference'
            AND column_name = 'telegramEnabled' AND data_type = 'boolean'),
         'NotificationPreference.telegramEnabled doit exister en BOOLEAN';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'User'
            AND indexname = 'User_telegramChatId_key'),
         'l''index unique User_telegramChatId_key doit exister';
  -- C : policy User_update_system active.
  ASSERT EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'User'
            AND policyname = 'User_update_system'),
         'la policy User_update_system doit exister';
END $$;
