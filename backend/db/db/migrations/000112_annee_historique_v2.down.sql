-- ============================================================
-- Migration 000112 (DOWN) — Historique par année académique, phase 2
-- SECT-ANNEE-HISTOIRE-2
-- ============================================================
-- Le down retire les structures ajoutées (colonnes FK, index, helpers,
-- fonction checklist) et restaure les policies messagerie à leur état
-- 000109/000048. Les BACKFILLS ne sont PAS réversibles (les NULL d'origine
-- des colonnes Epreuve/Affectation/Conversation.anneeAcademiqueId sont
-- perdus) — documenté : restaurer une sauvegarde Neon si nécessaire.
-- ============================================================

-- 1. Checklist d'activation.
DROP FUNCTION IF EXISTS public.get_annee_activation_checklist(text, text);

-- 2. Messagerie : restauration des policies à l'état 000109/000048
--    (conversation_scope_unchanged à 5 paramètres, sans gel d'année ;
--    Conversation_insert sans contrainte d'année).
DROP POLICY IF EXISTS "Conversation_update" ON "Conversation";
CREATE POLICY "Conversation_update" ON "Conversation" FOR UPDATE
    USING (
        is_system()
        OR "createdBy" = current_user_id()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    )
    WITH CHECK (
        is_system()
        OR (
            "createdBy" = current_user_id()
            AND conversation_scope_unchanged(
                "Conversation"."id", "Conversation"."type",
                "Conversation"."etablissementId", "Conversation"."filiereId",
                "Conversation"."niveau"
            )
        )
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

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

-- conversation_scope_unchanged v1 (5 paramètres, état 000109).
DROP FUNCTION IF EXISTS public.conversation_scope_unchanged(text, "ConversationType", text, text, text, text);
CREATE OR REPLACE FUNCTION public.conversation_scope_unchanged(
    p_conversation_id text,
    p_type "ConversationType",
    p_etablissement_id text,
    p_filiere_id text,
    p_niveau text
)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c."id" = p_conversation_id
      AND c."type" = p_type
      AND c."etablissementId" IS NOT DISTINCT FROM p_etablissement_id
      AND c."filiereId" IS NOT DISTINCT FROM p_filiere_id
      AND c."niveau" IS NOT DISTINCT FROM p_niveau
  )
$$;

DROP FUNCTION IF EXISTS public.etab_current_annee_id(text);

-- 3. Conversation : colonne + FK + index.
DROP INDEX IF EXISTS "idx_conv_filiere_annee";
DROP INDEX IF EXISTS "idx_conv_filiere_niveau_annee";
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_anneeAcademiqueId_fkey";
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "anneeAcademiqueId";

-- 4. Affectation : colonne + FK + index.
DROP INDEX IF EXISTS "Affectation_anneeAcademiqueId_idx";
ALTER TABLE "Affectation" DROP CONSTRAINT IF EXISTS "Affectation_anneeAcademiqueId_fkey";
ALTER TABLE "Affectation" DROP COLUMN IF EXISTS "anneeAcademiqueId";

-- 5. Epreuve : backfill non réversible — les valeurs anneeAcademiqueId
--    historiquement NULL ne peuvent pas être reconstituées. On laisse les
--    données en l'état (la colonne existait déjà avant 000111).
