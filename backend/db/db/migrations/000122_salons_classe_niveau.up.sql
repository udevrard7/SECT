-- ============================================================
-- Migration 000122 — Salons CLASSE : comparaison du niveau étudiant
-- SECT-PRODUIT-1 (dette notée : « salons CLASSE sans comparaison
-- de niveau »)
-- ============================================================
-- CONTEXTE : la policy Conversation_select (000044) documente
-- « CLASSE : étudiant de cette filière + ce niveau » mais le SQL ne
-- compare QUE la filière — un étudiant L1 voyait donc les salons
-- CLASSE L2/L3 de sa filière (les salons actifs de toutes les
-- générations de niveau). Le commentaire d'intent de 000044 n'a
-- jamais été implémenté.
--
-- DÉCISION PRODUIT (SECT-PRODUIT-1) : un étudiant ne voit que le
-- salon CLASSE de SON niveau (filière + niveau). Les enseignants
-- conservent la vue de TOUS les salons CLASSE de l'établissement
-- (modération / enseignement multi-niveaux). PROMO inchangé :
-- filière entière par design. Un étudiant sans niveau ne voit
-- AUCUN salon CLASSE (cohérent avec EnsureAutoConversations qui
-- skip la création CLASSE dans ce cas).
--
-- CASCADE : Message_select hérite de Conversation_select (EXISTS
-- sur la conversation) → messages, badges unread et listes sont
-- durcis d'un coup. EnsureParticipant reste utilisable (le salon
-- de SON niveau reste visible) ; les anciennes inscriptions à un
-- salon d'un autre niveau deviennent simplement non visibles.
--
-- Implémentation : helper SECURITY DEFINER (pattern 000115
-- devoir_ue_matches_my_filiere_niveau) — évite toute récursion RLS
-- sur User et permet l'ASSERT post-migration par nom de fonction.
-- ============================================================

-- 1. Helper : l'étudiant courant matche-t-il (filière, niveau) ?
-- NB : Conversation.niveau est TEXT (000037) alors que User.niveau est
-- l'enum NiveauEtude — on caste le CÔTÉ ENUM vers text (jamais l'inverse :
-- p_niveau::NiveauEtude échouerait en 22P02 sur un libellé hors enum et
-- casserait la policy pour tous). Leçon SECT-AUTOCLOSE-FIX-1 : comparaison
-- inter-types = 42883 à l'évaluation.
CREATE OR REPLACE FUNCTION public.conversation_classe_matches_my_filiere_niveau(p_filiere_id text, p_niveau text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM "User" me
    WHERE me."id" = current_user_id()
      AND me."filiereId" = p_filiere_id
      AND me."niveau"::text = p_niveau
  );
END;
$$;
REVOKE ALL ON FUNCTION public.conversation_classe_matches_my_filiere_niveau(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversation_classe_matches_my_filiere_niveau(text, text) TO PUBLIC;

-- 2. Conversation_select : recréation de 000044 à l'identique,
--    UNIQUE changement = la branche CLASSE étudiant compare le
--    niveau via le helper (filière + niveau).
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
                -- CLASSE : étudiant de cette filière + ce niveau (SECT-PRODUIT-1 :
                -- la comparaison de niveau est désormais effective), OU enseignant
                -- de l'étab (PAS responsable — il n'a pas accès aux salons étudiants)
                ("type" = 'CLASSE' AND (
                    (is_etudiant() AND "filiereId" IS NOT NULL AND "niveau" IS NOT NULL
                     AND conversation_classe_matches_my_filiere_niveau("filiereId", "niveau"))
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

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polname='Conversation_select'
            AND position('conversation_classe_matches_my_filiere_niveau' in pg_get_expr(polqual, polrelid)) > 0) = 1,
         'Conversation_select doit comparer le niveau via le helper';
  ASSERT (SELECT count(*) FROM pg_proc
          WHERE proname='conversation_classe_matches_my_filiere_niveau'
            AND prosecdef) = 1,
         'conversation_classe_matches_my_filiere_niveau doit etre SECURITY DEFINER';
END $$;
