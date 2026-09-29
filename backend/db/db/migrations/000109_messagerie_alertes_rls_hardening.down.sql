-- Migration 000109 (down) : retour à l'état antérieur (policies 000037/000038/
-- 000048 + Alerte_insert_system TO PUBLIC WITH CHECK(true) observées en prod).
--
-- ATTENTION : ce retour arrière ré-ouvre les failles comblées par le up
-- (Message_insert isIA inconditionnel, Participant_insert non contraint,
-- Participant_select global pour le personnel, Alerte_insert_system
-- WITH CHECK(true)). À n'utiliser qu'en cas de régression bloquante.

-- 1. Policies restaurées à l'identique de l'état pré-000109
DROP POLICY IF EXISTS "Message_insert" ON "Message";
CREATE POLICY "Message_insert" ON "Message" FOR INSERT
    WITH CHECK (
        is_system()
        OR (
            "isIA" = false
            AND "userId" = current_user_id()
            AND EXISTS (
                SELECT 1 FROM "Conversation" c
                WHERE c."id" = "Message"."conversationId"
            )
        )
        OR "isIA" = true
    );

DROP POLICY IF EXISTS "Participant_insert" ON "ConversationParticipant";
CREATE POLICY "Participant_insert" ON "ConversationParticipant" FOR INSERT
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
        OR (
            EXISTS (
                SELECT 1 FROM "Conversation" c
                WHERE c."id" = "ConversationParticipant"."conversationId"
                  AND c."type" = 'DIRECT'
                  AND c."createdBy" = current_user_id()
                  AND c."deletedAt" IS NULL
            )
        )
    );

DROP POLICY IF EXISTS "Participant_select" ON "ConversationParticipant";
CREATE POLICY "Participant_select" ON "ConversationParticipant" FOR SELECT
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR is_enseignant()
        OR is_responsable()
        OR is_admin()
    );

DROP POLICY IF EXISTS "Conversation_update" ON "Conversation";
CREATE POLICY "Conversation_update" ON "Conversation" FOR UPDATE
    USING (
        is_system()
        OR "createdBy" = current_user_id()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

DROP POLICY IF EXISTS "Alerte_insert_system" ON "Alerte";
CREATE POLICY "Alerte_insert_system" ON "Alerte" FOR INSERT
    WITH CHECK (true);

-- 2. Default updatedAt retiré (état d'origine)
ALTER TABLE "Alerte" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 3. Helpers supprimés (plus aucune policy ne les référence à ce point)
DROP FUNCTION IF EXISTS public.conversation_in_my_etab(text);
DROP FUNCTION IF EXISTS public.conversation_admin_accessible(text);
DROP FUNCTION IF EXISTS public.conversation_created_by_me_direct(text);
DROP FUNCTION IF EXISTS public.conversation_scope_unchanged(text, "ConversationType", text, text, text);
