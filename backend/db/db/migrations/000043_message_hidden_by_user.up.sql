-- Migration 000043 : table MessageHiddenByUser (masquer messages pour soi)
--
-- Permet à un utilisateur de :
--   - Cacher des messages individuels pour lui (sélection multiple)
--   - Vider une conversation pour lui (tout cacher)
--
-- Le soft-delete global (Message.deletedAt) reste pour l'auteur/modérateur.
-- MessageHiddenByUser est un masquage per-user (ne impacte pas les autres).

CREATE TABLE IF NOT EXISTS "MessageHiddenByUser" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "MessageHiddenByUser_pkey" PRIMARY KEY ("messageId", "userId"),
    CONSTRAINT "fk_mhbu_message" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_mhbu_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_mhbu_user" ON "MessageHiddenByUser"("userId");

-- RLS : un user ne peut cacher/voir que ses propres masquages.
ALTER TABLE "MessageHiddenByUser" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MessageHiddenByUser_select" ON "MessageHiddenByUser" FOR SELECT
    TO PUBLIC USING (
        is_system()
        OR "userId" = current_user_id()
    );

CREATE POLICY "MessageHiddenByUser_insert" ON "MessageHiddenByUser" FOR INSERT
    TO PUBLIC WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
    );

CREATE POLICY "MessageHiddenByUser_delete" ON "MessageHiddenByUser" FOR DELETE
    TO PUBLIC USING (
        is_system()
        OR "userId" = current_user_id()
    );
