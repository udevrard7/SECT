-- Migration 000109 : durcissement RLS messagerie + alertes (SECT-DEBTS-FIX-1)
--
-- Dettes réglées (notées dans SECT-RLS-SECT-APP-SWITCH-1) :
--   1. Message_insert : la branche OR "isIA" = true était INCONDITIONNELLE —
--      n'importe quel user (claims étudiant) pouvait insérer un message
--      isIA=true dans N'IMPORTE QUELLE conversation. Réservée désormais à
--      is_system() (le backend insère les réponses IA avec des claims
--      système — cf. MessagerieRepository.CreateMessage).
--   2. Participant_insert : la branche OR "userId" = current_user_id()
--      n'était PAS contrainte sur la conversation — n'importe quel user
--      pouvait s'auto-inscrire comme participant d'une conversation privée
--      (DM d'autrui, STAFF...) puis la lire via la branche DIRECT de
--      Conversation_select. Désormais : conversation visible (la policy
--      Conversation_select s'applique au EXISTS) OU créateur d'un DM
--      (il inscrit la cible).
--   3. Participant_select : les branches is_enseignant()/is_responsable()/
--      is_admin() étaient GLOBALES (héritage 000038, anti-récursion de
--      l'époque) — un enseignant voyait les participants de TOUTES les
--      conversations de TOUS les établissements. Désormais scopées à
--      l'établissement via des helpers SECURITY DEFINER (pas de récursion
--      RLS Conversation <-> ConversationParticipant, cf. 000038/000045).
--   4. Alerte_insert_system : était TO PUBLIC WITH CHECK(true) — n'importe
--      quelle connexion pouvait insérer une alerte arbitraire. Réservée
--      désormais à is_system() (le worker auto-close utilise WithSystemTx).
--   5. Alerte.updatedAt : colonne NOT NULL SANS default — tout INSERT
--      l'omettant échouait silencieusement (bug historique du worker
--      auto-close). Default CURRENT_TIMESTAMP ajouté en ceinture de
--      sécurité (le code Go fournit aussi la valeur explicitement).
--   6. Conversation_update : sans WITH CHECK, le créateur pouvait muter
--      type/etablissementId/filiereId/niveau (déplacer un DM vers un autre
--      établissement). Le WITH CHECK gèle ces champs via le helper
--      conversation_scope_unchanged (l'app ne fait que des UPDATE
--      "updatedAt" — bump de tri des conversations).

-- ============================================================
-- 1. Helpers SECURITY DEFINER (anti-récursion RLS, cf. 000020/000045)
-- ============================================================

-- conversation_in_my_etab : la conversation (non supprimée) appartient à
-- l'établissement courant. SECURITY DEFINER -> s'exécute en tant que owner
-- (ne déclenche PAS la policy Conversation_select -> pas de récursion avec
-- la branche DIRECT de Conversation_select qui référence
-- ConversationParticipant).
CREATE OR REPLACE FUNCTION public.conversation_in_my_etab(p_conversation_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c."id" = p_conversation_id
      AND c."deletedAt" IS NULL
      AND c."etablissementId" = current_etablissement_id()
  )
$$;

-- conversation_admin_accessible : la conversation (non supprimée) appartient à
-- un établissement administré par l'admin courant (EtablissementAccess APPROUVE).
CREATE OR REPLACE FUNCTION public.conversation_admin_accessible(p_conversation_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c."id" = p_conversation_id
      AND c."deletedAt" IS NULL
      AND c."etablissementId" IS NOT NULL
      AND admin_has_etablissement_access(c."etablissementId")
  )
$$;

-- conversation_created_by_me_direct : la conversation est un DM (DIRECT, non
-- supprimé) créé par l'utilisateur courant. SECURITY DEFINER -> SANS la
-- policy Conversation_select : indispensable au flux CreateDIRECT, où le
-- créateur insère les participants AVANT d'avoir lui-même une ligne
-- ConversationParticipant (la branche DIRECT de Conversation_select exige
-- un participant actif -> un EXISTS simple renverrait false -> création de
-- DM bloquée). Couvre aussi l'inscription de la cible du DM par le créateur.
CREATE OR REPLACE FUNCTION public.conversation_created_by_me_direct(p_conversation_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c."id" = p_conversation_id
      AND c."type" = 'DIRECT'
      AND c."createdBy" = current_user_id()
      AND c."deletedAt" IS NULL
  )
$$;

-- conversation_scope_unchanged : les champs de scope (type, établissement,
-- filière, niveau) de la conversation en base sont identiques aux valeurs
-- passées (celles de la ligne NEW d'un UPDATE). Utilisé par le WITH CHECK de
-- Conversation_update pour geler le scope — une policy UPDATE ne peut pas
-- comparer NEW aux valeurs courantes autrement (pas d'accès à la ligne OLD
-- dans WITH CHECK).
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

-- ============================================================
-- 2. Message_insert : messages IA réservés au backend (claims système)
-- ============================================================
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
    );

-- ============================================================
-- 3. Participant_insert : auto-inscription limitée aux conversations visibles
-- ============================================================
DROP POLICY IF EXISTS "Participant_insert" ON "ConversationParticipant";
CREATE POLICY "Participant_insert" ON "ConversationParticipant" FOR INSERT
    WITH CHECK (
        is_system()
        -- Je m'inscris moi-même (salons auto / IA / DM) : la conversation doit
        -- m'être visible — la policy Conversation_select s'applique au EXISTS
        -- (étudiant de la filière pour CLASSE/PROMO, enseignant pour CLASSE/
        -- PROMO/EQUIPE, responsable/admin pour EQUIPE/STAFF, créateur pour IA).
        OR (
            "userId" = current_user_id()
            AND EXISTS (
                SELECT 1 FROM "Conversation" c
                WHERE c."id" = "ConversationParticipant"."conversationId"
                  AND c."deletedAt" IS NULL
            )
        )
        -- Créateur d'un DM : il inscrit les participants (lui-même + la cible).
        -- Helper SECURITY DEFINER (pas de RLS Conversation) : au moment du
        -- CreateDIRECT, le créateur n'a pas encore de ligne participant -> un
        -- EXISTS simple serait filtré par Conversation_select (branche DIRECT)
        -- et bloquerait la création du DM.
        OR conversation_created_by_me_direct("ConversationParticipant"."conversationId")
    );

-- ============================================================
-- 4. Participant_select : personnel scopé à son établissement
-- ============================================================
DROP POLICY IF EXISTS "Participant_select" ON "ConversationParticipant";
CREATE POLICY "Participant_select" ON "ConversationParticipant" FOR SELECT
    USING (
        is_system()
        OR "userId" = current_user_id()
        -- Enseignant/responsable : uniquement les conversations de LEUR
        -- établissement (helpers SECURITY DEFINER -> pas de récursion RLS).
        OR (is_enseignant() AND conversation_in_my_etab("ConversationParticipant"."conversationId"))
        OR (is_responsable() AND conversation_in_my_etab("ConversationParticipant"."conversationId"))
        -- Admin PaaS : uniquement les conversations des établissements qu'il
        -- administre (EtablissementAccess APPROUVE). Les conversations IA
        -- (etablissementId NULL, privées) restent invisibles.
        OR (is_admin() AND conversation_admin_accessible("ConversationParticipant"."conversationId"))
    );

-- ============================================================
-- 5. Conversation_update : geler le scope (type/etab/filière/niveau)
-- ============================================================
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

-- ============================================================
-- 6. Alerte_insert_system : réservé aux claims système
-- ============================================================
DROP POLICY IF EXISTS "Alerte_insert_system" ON "Alerte";
CREATE POLICY "Alerte_insert_system" ON "Alerte" FOR INSERT
    WITH CHECK (is_system());

-- ============================================================
-- 7. Ceinture : default CURRENT_TIMESTAMP sur Alerte.updatedAt
-- ============================================================
ALTER TABLE "Alerte" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- 8. Vérifications post-migration (échouent le migrate si incomplet)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='Message' AND policyname='Message_insert') = 1, 'Message_insert manquante';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='ConversationParticipant' AND policyname='Participant_insert') = 1, 'Participant_insert manquante';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='ConversationParticipant' AND policyname='Participant_select') = 1, 'Participant_select manquante';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='Conversation' AND policyname='Conversation_update') = 1, 'Conversation_update manquante';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='Alerte' AND policyname='Alerte_insert_system') = 1, 'Alerte_insert_system manquante';
  ASSERT (SELECT pg_get_expr(adbin, adrelid) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE c.relname='Alerte' AND a.attname='updatedAt') IS NOT NULL, 'default updatedAt manquant';
END $$;
