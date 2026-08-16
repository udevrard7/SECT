-- Rollback Migration 000051 — MessageReaction (réactions émojis aux messages)

DROP POLICY IF EXISTS "Reaction_delete" ON "MessageReaction";
DROP POLICY IF EXISTS "Reaction_insert" ON "MessageReaction";
DROP POLICY IF EXISTS "Reaction_select" ON "MessageReaction";

DROP INDEX IF EXISTS "idx_reaction_user";
DROP INDEX IF EXISTS "idx_reaction_msg";

DROP TABLE IF EXISTS "MessageReaction";
