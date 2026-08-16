-- Rollback : restaurer les policies Message_update et Message_delete précédentes
-- (avec EXISTS direct sur Conversation, qui déclenche RLS).

DROP POLICY IF EXISTS "Message_update" ON "Message";
DROP POLICY IF EXISTS "Message_delete" ON "Message";
DROP FUNCTION IF EXISTS public.message_belongs_to_my_etab(text);

-- Message_update (migration 000042)
CREATE POLICY "Message_update" ON "Message" FOR UPDATE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()
            AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')))
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND admin_has_etablissement_access(c."etablissementId")))
    )
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()
            AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')))
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );

-- Message_delete (migration 000037 original)
CREATE POLICY "Message_delete" ON "Message" FOR DELETE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()
            AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')))
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );
