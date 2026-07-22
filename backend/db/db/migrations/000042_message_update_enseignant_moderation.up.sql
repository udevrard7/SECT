-- Migration 000042 : étendre Message_update aux enseignants (soft-delete modération)
--
-- BUG (MESSAGERIE-MODERATION) : SoftDeleteMessage fait un UPDATE (SET deletedAt),
-- pas un DELETE. La policy Message_update n'autorisait que l'auteur, le responsable
-- et l'admin. Les enseignants ne pouvaient pas modérer (soft-delete) les messages
-- des salons CLASSE/PROMO/EQUIPE de leur établissement, bien que Message_delete
-- les y autorise. Incohérence corrigée.
--
-- Fix : aligner Message_update sur Message_delete pour les enseignants.
-- Un enseignant peut UPDATE (soft-delete) les messages des conversations
-- CLASSE/PROMO/EQUIPE de son établissement (modération pédagogique).

DROP POLICY IF EXISTS "Message_update" ON "Message";

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
        -- WITH CHECK : l'UPDATE ne doit pas violer les contraintes (ex: changer
        -- le contenu d'un message modéré). On garde la même logique que USING.
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
