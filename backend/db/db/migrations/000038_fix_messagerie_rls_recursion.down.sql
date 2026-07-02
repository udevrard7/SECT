-- Rollback : restaurer la policy Participant_select originale (avec récursion)
DROP POLICY IF EXISTS "Participant_select" ON "ConversationParticipant";

CREATE POLICY "Participant_select" ON "ConversationParticipant" FOR SELECT
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR EXISTS (
            SELECT 1 FROM "Conversation" c
            WHERE c."id" = "ConversationParticipant"."conversationId"
        )
    );
