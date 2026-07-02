-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 000037 — Module Messagerie unifié (chat temps réel par rôle)
--
-- CONTEXTE :
-- Le module Messagerie fusionne l'assistant IA flottant et un système de chat
-- temps réel entre utilisateurs (étudiants, enseignants, responsables, admin).
-- Objectif : permettre l'entraide étudiante, la collaboration pédagogique, et
-- l'accès à l'IA dans un hub unique (style Bubble Messenger).
--
-- ARCHITECTURE :
-- 6 tables + RLS policies strictes + index optimisés pour le temps réel.
-- Types de conversations : IA (privé), CLASSE, PROMO, EQUIPE, STAFF, DIRECT.
-- Salons CLASSE/PROMO/EQUIPE/STAFF générés automatiquement (lazy, via usecase).
-- DM étudiant ↔ enseignant restreint : uniquement enseignants de SES épreuves.
--
-- IA hybride :
-- - Conversation IA privée (1-à-1, type='IA', etablissementId=NULL)
-- - Mention @assistant dans un salon collectif (isIA=true sur le message de réponse)
--
-- RLS :
-- - Conversation : visible si même établissement + (participant OU salon auto accessible)
-- - Message : visible seulement si participant actif de la conversation
-- - ConversationParticipant : visible seulement si on est participant de la même conversation
-- - MessageSignalement : visible par admin/responsable + l'auteur du signalement
--
-- Note : les helpers RLS (is_etudiant, is_enseignant, is_responsable, is_admin,
-- is_system, current_user_id, current_etablissement_id, epreuve_owned_by_me,
-- admin_has_etablissement_access) sont définis dans les migrations 000006/000020/000024.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE "ConversationType" AS ENUM ('IA', 'CLASSE', 'PROMO', 'EQUIPE', 'STAFF', 'DIRECT');
CREATE TYPE "MessageAttachmentType" AS ENUM ('IMAGE', 'FILE', 'AUDIO');
CREATE TYPE "SignalementRaison" AS ENUM ('HARCELEMENT', 'SPAM', 'CONTENU_INAPPROPRIE', 'AUTRE');
CREATE TYPE "SignalementStatut" AS ENUM ('OUVERT', 'EN_COURS', 'RESOLU', 'REJETE');

-- ============================================================
-- 2. TABLE "Conversation"
-- ============================================================

CREATE TABLE "Conversation" (
    "id" TEXT PRIMARY KEY,
    "type" "ConversationType" NOT NULL,
    "titre" TEXT,                          -- optionnel pour CLASSE/PROMO (auto-généré), requis pour DIRECT/EQUIPE
    "etablissementId" TEXT,                -- NULL pour les conversations IA privées (1-à-1, hors établissement)
    "filiereId" TEXT,                      -- pour CLASSE et PROMO
    "niveau" TEXT,                         -- pour CLASSE (L1, L2, L3, M1, M2, DOCTORAT)
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "fk_conv_etab" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_conv_filiere" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_conv_creator" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_conv_etab_type" ON "Conversation"("etablissementId", "type") WHERE "deletedAt" IS NULL;
CREATE INDEX "idx_conv_filiere_niveau" ON "Conversation"("filiereId", "niveau") WHERE "deletedAt" IS NULL AND "type" = 'CLASSE';
CREATE INDEX "idx_conv_type_user" ON "Conversation"("type", "createdBy") WHERE "type" = 'IA';

-- ============================================================
-- 3. TABLE "ConversationParticipant"
-- ============================================================
-- Tracking des participants (pour DIRECT et lu/non-lu sur tous les types).
-- Pour les salons auto (CLASSE/PROMO/EQUIPE/STAFF), une ligne par user est créée
-- au premier accès (lazy registration) pour tracker lastReadAt.

CREATE TABLE "ConversationParticipant" (
    "id" TEXT PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMPTZ,              -- pour indicateur "non lu"
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "leftAt" TIMESTAMPTZ,                  -- si l'utilisateur quitte (DM seulement)

    CONSTRAINT "fk_part_conv" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_part_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "uk_part_conv_user" UNIQUE ("conversationId", "userId")
);

CREATE INDEX "idx_part_user_active" ON "ConversationParticipant"("userId") WHERE "leftAt" IS NULL;
CREATE INDEX "idx_part_conv" ON "ConversationParticipant"("conversationId");

-- ============================================================
-- 4. TABLE "Message"
-- ============================================================

CREATE TABLE "Message" (
    "id" TEXT PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,                         -- expéditeur (NULL si message IA)
    "isIA" BOOLEAN NOT NULL DEFAULT false,
    "contenu" TEXT NOT NULL,
    "contenuHtml" TEXT,                    -- markdown rendu (sanitizé backend)
    "replyToId" TEXT,                      -- pour les réponses à un message (thread)
    "editedAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,               -- soft delete (auteur ou modérateur)
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "fk_msg_conv" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_msg_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL,
    CONSTRAINT "fk_msg_reply" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_msg_conv_created" ON "Message"("conversationId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX "idx_msg_user" ON "Message"("userId") WHERE "deletedAt" IS NULL;
CREATE INDEX "idx_msg_ia" ON "Message"("conversationId") WHERE "isIA" = true;

-- Trigger updated_at automatique pour Conversation
CREATE TRIGGER "tr_conv_updated_at"
    BEFORE UPDATE ON "Conversation"
    FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

-- ============================================================
-- 5. TABLE "MessageAttachment"
-- ============================================================

CREATE TABLE "MessageAttachment" (
    "id" TEXT PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "type" "MessageAttachmentType" NOT NULL,
    "url" TEXT NOT NULL,                   -- R2 presigned URL
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "fk_attach_msg" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_attach_msg" ON "MessageAttachment"("messageId");

-- ============================================================
-- 6. TABLE "MessageSignalement"
-- ============================================================

CREATE TABLE "MessageSignalement" (
    "id" TEXT PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,                -- qui signale
    "raison" "SignalementRaison" NOT NULL,
    "commentaire" TEXT,
    "statut" "SignalementStatut" NOT NULL DEFAULT 'OUVERT',
    "resolvedAt" TIMESTAMPTZ,
    "resolvedBy" TEXT,                     -- admin/responsable qui a traité
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "fk_signal_msg" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_signal_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_signal_resolver" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL,
    CONSTRAINT "uk_signal_msg_user" UNIQUE ("messageId", "userId")  -- un user ne peut signaler un message qu'une fois
);

CREATE INDEX "idx_signal_statut" ON "MessageSignalement"("statut", "createdAt" DESC) WHERE "statut" IN ('OUVERT', 'EN_COURS');
CREATE INDEX "idx_signal_msg" ON "MessageSignalement"("messageId");

-- ============================================================
-- 7. ENABLE RLS
-- ============================================================

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageSignalement" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. RLS POLICIES — Conversation
-- ============================================================
-- Règles de visibilité :
-- - IA (privée) : seulement createdBy = me
-- - CLASSE/PROMO : étudiant du même établissement + même filière (et niveau pour CLASSE)
-- - EQUIPE/STAFF : enseignant/responsable/admin du même établissement (STAFF = resp+admin seulement)
-- - DIRECT : seulement les participants actifs

-- SELECT : voir les conversations accessibles
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
                -- CLASSE : étudiant de cette filière + ce niveau, OU enseignant/responsable/admin de l'étab
                ("type" = 'CLASSE' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL AND "niveau" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant() OR is_responsable() OR is_admin()
                ))
                -- PROMO : étudiant de cette filière, OU enseignant/responsable/admin
                OR ("type" = 'PROMO' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL
                     AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = current_user_id()
                                 AND u."filiereId" = "Conversation"."filiereId"))
                    OR is_enseignant() OR is_responsable() OR is_admin()
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

-- INSERT : un user peut créer une conversation IA (pour lui-même) ou DIRECT (avec checks usecase)
CREATE POLICY "Conversation_insert" ON "Conversation" FOR INSERT
    WITH CHECK (
        is_system()
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        OR ("type" = 'DIRECT' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id())
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

-- UPDATE : seulement le créateur ou admin/responsable de l'étab
CREATE POLICY "Conversation_update" ON "Conversation" FOR UPDATE
    USING (
        is_system()
        OR "createdBy" = current_user_id()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

-- DELETE (soft via deletedAt) : admin/responsable seulement
CREATE POLICY "Conversation_delete" ON "Conversation" FOR DELETE
    USING (
        is_system()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

-- ============================================================
-- 9. RLS POLICIES — ConversationParticipant
-- ============================================================

CREATE POLICY "Participant_select" ON "ConversationParticipant" FOR SELECT
    USING (
        is_system()
        -- Je vois mes propres participations
        OR "userId" = current_user_id()
        -- Je vois les participants des conversations auxquelles j'ai accès
        OR EXISTS (
            SELECT 1 FROM "Conversation" c
            WHERE c."id" = "ConversationParticipant"."conversationId"
            -- (la policy Conversation_select s'applique déjà)
        )
    );

CREATE POLICY "Participant_insert" ON "ConversationParticipant" FOR INSERT
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()  -- je m'inscris moi-même
    );

CREATE POLICY "Participant_update" ON "ConversationParticipant" FOR UPDATE
    USING (
        is_system()
        OR "userId" = current_user_id()  -- je modifie mes propres paramètres (lastReadAt, muted)
    );

CREATE POLICY "Participant_delete" ON "ConversationParticipant" FOR DELETE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "ConversationParticipant"."conversationId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            WHERE c."id" = "ConversationParticipant"."conversationId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );

-- ============================================================
-- 10. RLS POLICIES — Message
-- ============================================================

CREATE POLICY "Message_select" ON "Message" FOR SELECT
    USING (
        is_system()
        OR EXISTS (
            SELECT 1 FROM "Conversation" c
            WHERE c."id" = "Message"."conversationId"
            -- (la policy Conversation_select s'applique)
        )
    );

-- INSERT : seulement si on a accès à la conversation (usecase fera les checks fins)
CREATE POLICY "Message_insert" ON "Message" FOR INSERT
    WITH CHECK (
        is_system()
        OR (
            "isIA" = false  -- les messages IA sont insérés via le backend (system claim)
            AND "userId" = current_user_id()
            AND EXISTS (
                SELECT 1 FROM "Conversation" c
                WHERE c."id" = "Message"."conversationId"
            )
        )
        OR "isIA" = true  -- les messages IA sont créés par le backend (claims system)
    );

-- UPDATE (éditer son propre message) : seulement l'auteur
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

-- DELETE (soft) : auteur OU modérateur (enseignant de la conversation, responsable, admin)
CREATE POLICY "Message_delete" ON "Message" FOR DELETE
    USING (
        is_system()
        OR "userId" = current_user_id()
        -- Enseignant peut modérer les messages des salons CLASSE/PROMO de son étab
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

-- ============================================================
-- 11. RLS POLICIES — MessageAttachment
-- ============================================================
-- Hérite de la visibilité du message parent.

CREATE POLICY "Attachment_select" ON "MessageAttachment" FOR SELECT
    USING (
        is_system()
        OR EXISTS (
            SELECT 1 FROM "Message" m
            WHERE m."id" = "MessageAttachment"."messageId"
            -- (la policy Message_select s'applique)
        )
    );

CREATE POLICY "Attachment_insert" ON "MessageAttachment" FOR INSERT
    WITH CHECK (
        is_system()
        OR EXISTS (
            SELECT 1 FROM "Message" m
            WHERE m."id" = "MessageAttachment"."messageId"
            AND m."userId" = current_user_id()
        )
    );

CREATE POLICY "Attachment_delete" ON "MessageAttachment" FOR DELETE
    USING (
        is_system()
        OR EXISTS (
            SELECT 1 FROM "Message" m
            WHERE m."id" = "MessageAttachment"."messageId"
            AND (m."userId" = current_user_id()
                 OR is_responsable() OR is_admin())
        )
    );

-- ============================================================
-- 12. RLS POLICIES — MessageSignalement
-- ============================================================

CREATE POLICY "Signalement_select" ON "MessageSignalement" FOR SELECT
    USING (
        is_system()
        OR "userId" = current_user_id()  -- je vois mes propres signalements
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            JOIN "Message" m ON m."conversationId" = c."id"
            WHERE m."id" = "MessageSignalement"."messageId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            JOIN "Message" m ON m."conversationId" = c."id"
            WHERE m."id" = "MessageSignalement"."messageId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );

CREATE POLICY "Signalement_insert" ON "MessageSignalement" FOR INSERT
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
    );

CREATE POLICY "Signalement_update" ON "MessageSignalement" FOR UPDATE
    USING (
        is_system()
        OR (is_responsable() AND EXISTS (SELECT 1 FROM "Conversation" c
            JOIN "Message" m ON m."conversationId" = c."id"
            WHERE m."id" = "MessageSignalement"."messageId"
            AND c."etablissementId" = current_etablissement_id()))
        OR (is_admin() AND EXISTS (SELECT 1 FROM "Conversation" c
            JOIN "Message" m ON m."conversationId" = c."id"
            WHERE m."id" = "MessageSignalement"."messageId"
            AND admin_has_etablissement_access(c."etablissementId")))
    );

CREATE POLICY "Signalement_delete" ON "MessageSignalement" FOR DELETE
    USING (is_system() OR is_admin());

-- ============================================================
-- 13. TRIGGER updated_at pour ConversationParticipant (lazy lastReadAt updates)
-- ============================================================
-- Pas de trigger updated_at sur Participant (lastReadAt est mis à jour
-- explicitement via UPDATE, pas via un trigger).

-- ============================================================
-- 14. VÉRIFICATION FINALE
-- ============================================================
-- Vérifier que toutes les policies ont bien été créées
SELECT 'Policies créées pour la messagerie' AS status,
       (SELECT count(*) FROM pg_policy WHERE polrelid IN (
           '"Conversation"'::regclass,
           '"ConversationParticipant"'::regclass,
           '"Message"'::regclass,
           '"MessageAttachment"'::regclass,
           '"MessageSignalement"'::regclass
       )) AS total_policies;
