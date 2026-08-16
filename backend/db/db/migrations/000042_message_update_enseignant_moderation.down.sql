-- Rollback : revenir à la policy Message_update précédente (sans enseignants).

DROP POLICY IF EXISTS "Message_update" ON "Message";

CREATE POLICY "Message_update" ON "Message" FOR UPDATE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );
