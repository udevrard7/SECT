-- 000039_document_audio_delete_student.down.sql
-- Rollback : restaurer la policy admin-only d'origine.

DROP POLICY IF EXISTS "DocumentAudio_delete" ON "DocumentAudio";

CREATE POLICY "DocumentAudio_delete"
  ON "DocumentAudio"
  FOR DELETE
  USING (is_admin());
