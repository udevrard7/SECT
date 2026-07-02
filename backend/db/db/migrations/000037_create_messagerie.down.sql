-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 000037 (DOWN) — Rollback du module Messagerie
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop dans l'ordre inverse des dépendances
DROP TABLE IF EXISTS "MessageSignalement" CASCADE;
DROP TABLE IF EXISTS "MessageAttachment" CASCADE;
DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "ConversationParticipant" CASCADE;
DROP TABLE IF EXISTS "Conversation" CASCADE;

-- Drop du trigger
DROP TRIGGER IF EXISTS "tr_conv_updated_at" ON "Conversation";

-- Drop des enums
DROP TYPE IF EXISTS "ConversationType";
DROP TYPE IF EXISTS "MessageAttachmentType";
DROP TYPE IF EXISTS "SignalementRaison";
DROP TYPE IF EXISTS "SignalementStatut";
