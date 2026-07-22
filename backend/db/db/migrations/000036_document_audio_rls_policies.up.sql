-- 000036_document_audio_rls_policies.up.sql
-- ============================================================================
-- Fix DASHSCOPE-AUDIO-1 (suite) : policies RLS manquantes sur DocumentAudio.
--
-- Contexte :
-- La table DocumentAudio (migration 000011) a été créée SANS policies RLS,
-- alors que RLS était activé et forcé dessus (FORCE ROW LEVEL SECURITY).
-- Conséquence : toutes les opérations (SELECT/INSERT/UPDATE) étaient
-- silencieusement bloquées pour sect_app (NOBYPASSRLS). Le podcast n'a
-- jamais réellement fonctionné en production depuis la bascule sect_app.
--
-- Le fix EXAM-PREP-STUDENT-DOCS-RLS (db.WithTx + claims) a rendu l'échec
-- explicite (erreur 500 au lieu de silent failure), révélant ce bug latent.
--
-- Policies ajoutées :
-- - SELECT : owner (userId) OU is_enseignant/responsable/admin (supervision)
-- - INSERT : l'utilisateur crée pour lui-même (userId = current_user_id())
--            OU is_admin (worker peut créer au nom d'un user)
-- - UPDATE : is_admin (worker pose role=ADMIN pour update status/script)
--            OU owner
-- ============================================================================

-- DocumentAudio — SELECT
DROP POLICY IF EXISTS "DocumentAudio_select" ON "DocumentAudio";
CREATE POLICY "DocumentAudio_select" ON "DocumentAudio" FOR SELECT TO PUBLIC USING (
  ("userId" = current_user_id())
  OR is_enseignant()
  OR is_responsable()
  OR is_admin()
);

-- DocumentAudio — INSERT
DROP POLICY IF EXISTS "DocumentAudio_insert" ON "DocumentAudio";
CREATE POLICY "DocumentAudio_insert" ON "DocumentAudio" FOR INSERT TO PUBLIC WITH CHECK (
  ("userId" = current_user_id())
  OR is_admin()
  OR is_enseignant()
);

-- DocumentAudio — UPDATE (le worker pose role=ADMIN pour updateStatus/updateScript)
DROP POLICY IF EXISTS "DocumentAudio_update" ON "DocumentAudio";
CREATE POLICY "DocumentAudio_update" ON "DocumentAudio" FOR UPDATE TO PUBLIC
  USING (is_admin() OR ("userId" = current_user_id()))
  WITH CHECK (is_admin() OR ("userId" = current_user_id()));

-- DocumentAudio — DELETE (admin only, pour cleanup éventuel)
DROP POLICY IF EXISTS "DocumentAudio_delete" ON "DocumentAudio";
CREATE POLICY "DocumentAudio_delete" ON "DocumentAudio" FOR DELETE TO PUBLIC
  USING (is_admin());
