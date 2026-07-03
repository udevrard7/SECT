-- Rollback : revenir à la policy originale (userId = me uniquement).
-- Attention : rollback cassera la création de DM (CreateDirect).

DROP POLICY IF EXISTS "Participant_insert" ON "ConversationParticipant";

CREATE POLICY "Participant_insert" ON "ConversationParticipant" FOR INSERT
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
    );
