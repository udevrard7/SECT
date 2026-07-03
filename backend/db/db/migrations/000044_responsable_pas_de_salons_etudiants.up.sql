-- Migration 000044 : responsable ne voit pas les salons CLASSE/PROMO des étudiants
--
-- CHANGEMENT : le responsable garde ses fonctions de modération (Message_delete,
-- Message_update) mais n'a plus accès aux salons collectifs étudiants (CLASSE,
-- PROMO). Il ne voit que EQUIPE + STAFF + ses DM.
--
-- Raison : le responsable gère l'établissement (inscriptions, filières, etc.)
-- mais n'a pas vocation à participer aux discussions étudiants. Les salons
-- CLASSE/PROMO sont réservés aux étudiants (et enseignants pour CLASSE/PROMO
-- de leur filière — inchangé).
--
-- Modération préservée : Message_delete et Message_update autorisent toujours
-- is_responsable() pour toutes les conversations de son établissement. Le
-- responsable peut donc toujours modérer via le panneau de modération
-- (signalements) et via le soft-delete, même s'il ne voit pas les salons
-- étudiants dans sa liste de conversations.

DROP POLICY IF EXISTS "Conversation_select" ON "Conversation";

CREATE POLICY "Conversation_select" ON "Conversation" FOR SELECT
    USING (
        is_system()
        -- Conversation IA privée : seulement si c'est la mienne
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        -- Salons auto par établissement (non-IA)
        OR (
            "etablissementId" = current_etablissement_id()
            AND "deletedAt" IS NULL
            AND (
                -- CLASSE : étudiant de cette filière + ce niveau, OU enseignant de l'étab
                -- (PAS responsable — il n'a pas accès aux salons étudiants)
                ("type" = 'CLASSE' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL AND "niveau" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant()
                ))
                -- PROMO : étudiant de cette filière, OU enseignant de l'étab
                -- (PAS responsable)
                OR ("type" = 'PROMO' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant()
                ))
                -- EQUIPE : enseignant/responsable/admin de l'établissement
                OR ("type" = 'EQUIPE' AND (is_enseignant() OR is_responsable() OR is_admin()))
                -- STAFF : responsable/admin seulement
                OR ("type" = 'STAFF' AND (is_responsable() OR is_admin()))
                -- DIRECT : seulement si je suis participant actif
                OR ("type" = 'DIRECT' AND EXISTS (
                    SELECT 1 FROM "ConversationParticipant" p
                    WHERE p."conversationId" = "Conversation"."id"
                      AND p."userId" = current_user_id()
                      AND p."leftAt" IS NULL
                ))
            )
        )
    );
