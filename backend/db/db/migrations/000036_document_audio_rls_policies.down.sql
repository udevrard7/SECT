-- 000036_document_audio_rls_policies.down.sql
-- Rollback : supprime les policies DocumentAudio (retour à 0 policy = tout bloqué).

DROP POLICY IF EXISTS "DocumentAudio_select" ON "DocumentAudio";
DROP POLICY IF EXISTS "DocumentAudio_insert" ON "DocumentAudio";
DROP POLICY IF EXISTS "DocumentAudio_update" ON "DocumentAudio";
DROP POLICY IF EXISTS "DocumentAudio_delete" ON "DocumentAudio";
