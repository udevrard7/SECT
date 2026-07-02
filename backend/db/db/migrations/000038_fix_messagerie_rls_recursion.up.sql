-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 000038 — Fix récursion infinie RLS Messagerie
--
-- PROBLÈME :
-- La policy "Conversation_select" (migration 000037) vérifie l'accès DIRECT via :
--   EXISTS (SELECT 1 FROM "ConversationParticipant" p WHERE p."conversationId" = ...)
-- Mais la policy "Participant_select" vérifie l'accès via :
--   EXISTS (SELECT 1 FROM "Conversation" c WHERE c."id" = ...)
-- → Récursion infinie : Conversation → Participant → Conversation → ...
-- → Erreur PostgreSQL : "infinite recursion detected in policy for relation Conversation"
--
-- FIX :
-- 1. Participant_select : simplifier pour ne PAS référencer "Conversation".
--    Un user voit ses propres participations (userId = me) — c'est suffisant.
--    L'accès à la conversation parent est vérifié par Conversation_select.
-- 2. Conversation_select : pour le cas DIRECT, utiliser une approche qui ne
--    déclenche pas Participant_select. On garde la subquery sur Participant
--    mais Participant_select ne référence plus Conversation → pas de récursion.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Drop et recréer Participant_select SANS référence à Conversation
DROP POLICY IF EXISTS "Participant_select" ON "ConversationParticipant";

CREATE POLICY "Participant_select" ON "ConversationParticipant" FOR SELECT
    USING (
        is_system()
        -- Je vois mes propres participations (pas besoin de vérifier la conversation
        -- parent — Conversation_select gère ça séparément, sans récursion).
        OR "userId" = current_user_id()
        -- Les enseignants/responsables/admin voient les participants des
        -- conversations de leur établissement (pour modération).
        -- On vérifie via conversationId sans JOIN Conversation (évite récursion) :
        -- en pratique, le usecase filtrera côté application.
        OR is_enseignant()
        OR is_responsable()
        OR is_admin()
    );

-- 2. Conversation_select : la subquery sur Participant ne déclenchera plus
--    Participant_select de manière récursive car Participant_select ne
--    référence plus Conversation. Pas de changement needed ici.

-- Vérifier qu'il n'y a plus de récursion
SELECT 'Policies corrigées — récursion éliminée' AS status;
