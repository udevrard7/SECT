-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 000051 — Module Messagerie Niveau 2 : Réactions aux messages (émojis)
--
-- CONTEXTE :
-- Suite à la demande utilisateur d'ajouter des émojis pour "faire vivre les
-- conversations", le Niveau 1 (sélecteur d'émojis dans la zone de saisie) a été
-- livré côté frontend uniquement (aucune migration nécessaire — les émojis sont
-- stockés en UTF-8 dans le champ Message.contenu).
--
-- Le Niveau 2 concerne les RÉACTIONS aux messages (style Slack/Discord) : un
-- utilisateur clique sur un émoji flottant sous un message pour réagir. La
-- réaction est agrégée (compteur par émoji) et visible par tous les
-- participants. L'utilisateur peut retirer sa réaction (toggle).
--
-- ARCHITECTURE :
-- 1 table : MessageReaction(messageId, userId, emoji) avec contrainte unique
-- anti-doublon. RLS hérite de la visibilité du Message parent.
--
-- RLS :
-- - SELECT : visible si on voit le message parent (policy Message_select).
-- - INSERT : seulement si on voit le message parent ET userId = moi.
-- - DELETE : seulement si la réaction est à moi (userId = moi).
--
-- Note : les émojis sont stockés en UTF-8 (caractère natif ex: 👍 ❤️ 🎉).
-- Pas d'enum : on accepte n'importe quel émoji (flexibilité maximale côté UX).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. TABLE "MessageReaction"
-- ============================================================

CREATE TABLE "MessageReaction" (
    "id" TEXT PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,                   -- caractère émoji UTF-8 (ex: '👍')
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "fk_reaction_msg" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_reaction_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    -- Un user ne peut réagir qu'une fois avec le même émoji sur un message donné.
    -- (toggle : re-cliquer retire la réaction au lieu d'en créer une 2e).
    CONSTRAINT "uk_reaction_msg_user_emoji" UNIQUE ("messageId", "userId", "emoji")
);

-- Index pour le listage groupé par message (le repo agrège les réactions).
CREATE INDEX "idx_reaction_msg" ON "MessageReaction"("messageId");
CREATE INDEX "idx_reaction_user" ON "MessageReaction"("userId") WHERE "emoji" IS NOT NULL;

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================

ALTER TABLE "MessageReaction" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES — MessageReaction
-- ============================================================
-- Hérite de la visibilité du message parent : si on voit le message, on voit
-- ses réactions. L'insertion/delete exige en plus userId = moi.

-- SELECT : visible si on voit le message parent (policy Message_select).
CREATE POLICY "Reaction_select" ON "MessageReaction" FOR SELECT
    USING (
        is_system()
        OR EXISTS (
            SELECT 1 FROM "Message" m
            WHERE m."id" = "MessageReaction"."messageId"
            -- (la policy Message_select s'applique)
        )
    );

-- INSERT : seulement si on voit le message parent ET userId = moi.
CREATE POLICY "Reaction_insert" ON "MessageReaction" FOR INSERT
    WITH CHECK (
        is_system()
        OR (
            "userId" = current_user_id()
            AND EXISTS (
                SELECT 1 FROM "Message" m
                WHERE m."id" = "MessageReaction"."messageId"
            )
        )
    );

-- DELETE : seulement si la réaction est à moi (userId = moi).
CREATE POLICY "Reaction_delete" ON "MessageReaction" FOR DELETE
    USING (
        is_system()
        OR "userId" = current_user_id()
    );

-- ============================================================
-- 4. VÉRIFICATION FINALE
-- ============================================================
SELECT 'Migration 000051 — MessageReaction créée' AS status,
       (SELECT count(*) FROM pg_policy WHERE polrelid = '"MessageReaction"'::regclass) AS total_policies;
