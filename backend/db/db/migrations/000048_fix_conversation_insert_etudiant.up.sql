-- Migration 000048 : fix Conversation_insert pour autoriser les étudiants à
-- (renumérotée depuis 000040 le 2025-01 — voir MIGRATIONS_RECONCILIATION.md)
-- créer les salons CLASSE/PROMO de leur filière (via EnsureAutoConversations).
--
-- BUG (MESSAGERIE-AUTO-SALONS-ETUDIANT) : la policy Conversation_insert
-- n'autorisait l'insertion que pour is_responsable()/is_admin(). Les étudiants
-- ne pouvaient pas créer les salons CLASSE/PROMO via EnsureAutoConversations
-- → les salons collectifs n'étaient jamais créés pour les étudiants.
--
-- Fix : autoriser l'étudiant à créer une conversation CLASSE/PROMO si :
--   - etablissementId = son établissement
--   - filiereId = sa filière (current_user_filiere_id())
--   - pour CLASSE : niveau = son niveau (récupéré via sous-requête sur User)
--
-- Cela permet à EnsureAutoConversations de fonctionner pour les étudiants.
-- Le usecase garantit que l'étudiant ne crée que pour sa propre filière/niveau
-- (GetUserFiliereAndNiveau lit depuis la DB avec claims).

DROP POLICY IF EXISTS "Conversation_insert" ON "Conversation";

CREATE POLICY "Conversation_insert" ON "Conversation" FOR INSERT
    WITH CHECK (
        is_system()
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        OR ("type" = 'DIRECT' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id())
        OR ("type" = 'CLASSE' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND "filiereId" IS NOT NULL
            AND "filiereId" = current_user_filiere_id()
            AND "niveau" IS NOT NULL
            AND EXISTS (SELECT 1 FROM "User" u
                        WHERE u."id" = current_user_id()
                          AND u."filiereId" = "Conversation"."filiereId"
                          AND u."niveau"::text = "Conversation"."niveau"::text))
        OR ("type" = 'PROMO' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND "filiereId" IS NOT NULL
            AND "filiereId" = current_user_filiere_id())
        OR ("type" IN ('EQUIPE', 'STAFF') AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND (is_enseignant() OR is_responsable() OR is_admin()))
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );
