-- Rollback : restaurer la policy avec responsable voyant CLASSE/PROMO.

DROP POLICY IF EXISTS "Conversation_select" ON "Conversation";

CREATE POLICY "Conversation_select" ON "Conversation" FOR SELECT
    USING (
        is_system()
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        OR (
            "etablissementId" = current_etablissement_id()
            AND "deletedAt" IS NULL
            AND (
                ("type" = 'CLASSE' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL AND "niveau" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant() OR is_responsable() OR is_admin()
                ))
                OR ("type" = 'PROMO' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant() OR is_responsable() OR is_admin()
                ))
                OR ("type" = 'EQUIPE' AND (is_enseignant() OR is_responsable() OR is_admin()))
                OR ("type" = 'STAFF' AND (is_responsable() OR is_admin()))
                OR ("type" = 'DIRECT' AND EXISTS (
                    SELECT 1 FROM "ConversationParticipant" p
                    WHERE p."conversationId" = "Conversation"."id"
                      AND p."userId" = current_user_id()
                      AND p."leftAt" IS NULL
                ))
            )
        )
    );
