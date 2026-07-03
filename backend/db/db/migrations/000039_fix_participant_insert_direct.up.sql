-- Migration 000039 : fix Participant_insert policy for DIRECT conversations
--
-- BUG (MESSAGERIE-DM-RLS) : CreateDirect insère 2 participants (creator + target)
-- dans ConversationParticipant, mais la policy Participant_insert n'autorisait
-- que "userId" = current_user_id(). L'insertion du participant target échouait
-- silencieusement → "erreur interne" (HTTP 500) côté frontend quand on essayait
-- de démarrer un DM.
--
-- Fix : autoriser l'insertion d'un participant si la conversation est de type
-- DIRECT et que l'inseruteur en est le creator (createdBy = current_user_id()).
-- Cela permet au créateur d'un DM d'inscrire les 2 participants (lui + le target).
-- Les autres types de conversations (CLASSE, PROMO, EQUIPE, STAFF) continuent
-- d'utiliser EnsureParticipant qui n'inscrit que soi-même (userId = me).

DROP POLICY IF EXISTS "Participant_insert" ON "ConversationParticipant";

CREATE POLICY "Participant_insert" ON "ConversationParticipant" FOR INSERT
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
        OR EXISTS (
            SELECT 1 FROM "Conversation" c
            WHERE c."id" = "conversationId"
              AND c."type" = 'DIRECT'
              AND c."createdBy" = current_user_id()
              AND c."deletedAt" IS NULL
        )
    );
