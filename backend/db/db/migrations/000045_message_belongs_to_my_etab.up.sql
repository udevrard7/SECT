-- Migration 000045 : fonction message_belongs_to_my_etab (bypass RLS Conversation)
--
-- BUG (MESSAGERIE-MODERATION-RLS-CASCADE) : les policies Message_update et
-- Message_delete utilisent EXISTS(SELECT 1 FROM "Conversation" c WHERE ...).
-- Ce EXISTS déclenche la policy Conversation_select. Depuis la migration 000044,
-- le responsable ne voit plus les salons CLASSE/PROMO → l'EXISTS retourne false
-- → le soft-delete (UPDATE) n'affecte aucune ligne → "Message introuvable" 404.
--
-- Fix : créer une fonction SECURITY DEFINER qui vérifie si un message appartient
-- à une conversation de l'établissement courant, SANS déclencher RLS sur
-- Conversation. Les policies Message_update et Message_delete l'utilisent
-- au lieu du EXISTS direct.

CREATE OR REPLACE FUNCTION public.message_belongs_to_my_etab(p_message_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    JOIN "Message" m ON m."conversationId" = c."id"
    WHERE m."id" = p_message_id
      AND c."etablissementId" = current_etablissement_id()
  )
$$;

-- Message_update : utiliser la fonction au lieu du EXISTS direct
DROP POLICY IF EXISTS "Message_update" ON "Message";

CREATE POLICY "Message_update" ON "Message" FOR UPDATE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND message_belongs_to_my_etab("Message"."id")
            AND EXISTS (SELECT 1 FROM "Conversation" c
                WHERE c."id" = "Message"."conversationId"
                AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')
                AND c."etablissementId" = current_etablissement_id()))
        OR (is_responsable() AND message_belongs_to_my_etab("Message"."id"))
        OR (is_admin() AND message_belongs_to_my_etab("Message"."id"))
    )
    WITH CHECK (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND message_belongs_to_my_etab("Message"."id")
            AND EXISTS (SELECT 1 FROM "Conversation" c
                WHERE c."id" = "Message"."conversationId"
                AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')
                AND c."etablissementId" = current_etablissement_id()))
        OR (is_responsable() AND message_belongs_to_my_etab("Message"."id"))
        OR (is_admin() AND message_belongs_to_my_etab("Message"."id"))
    );

-- Message_delete : même fix (utilise message_belongs_to_my_etab)
DROP POLICY IF EXISTS "Message_delete" ON "Message";

CREATE POLICY "Message_delete" ON "Message" FOR DELETE
    USING (
        is_system()
        OR "userId" = current_user_id()
        OR (is_enseignant() AND message_belongs_to_my_etab("Message"."id")
            AND EXISTS (SELECT 1 FROM "Conversation" c
                WHERE c."id" = "Message"."conversationId"
                AND c."type" IN ('CLASSE', 'PROMO', 'EQUIPE')
                AND c."etablissementId" = current_etablissement_id()))
        OR (is_responsable() AND message_belongs_to_my_etab("Message"."id"))
        OR (is_admin() AND message_belongs_to_my_etab("Message"."id"))
    );
