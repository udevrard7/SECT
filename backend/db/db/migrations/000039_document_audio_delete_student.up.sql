-- 000039_document_audio_delete_student.up.sql
-- ============================================================================
-- AUDIO-DELETE-STUDENT : permettre à un étudiant de supprimer SON podcast.
--
-- Contexte :
-- Avant, la policy DocumentAudio_delete n'autorisait que is_admin(). Un étudiant
-- ne pouvait donc pas supprimer son propre podcast (ni même un en cours de
-- génération ou en erreur). Le frontend n'avait d'ailleurs aucun bouton delete.
--
-- Fix :
-- Remplacer la policy par : ("userId" = current_user_id()) OR is_admin().
-- - L'étudiant ne peut supprimer QUE ses propres lignes (RLS enforce l'ownership).
-- - L'admin conserve le droit de suppression globale.
-- - Les enseignants ne sont pas concernés (les podcasts sont créés par les
--   étudiants ; un enseignant qui veut nettoyer passe par l'admin).
--
-- La policy DocumentAudio_update (déjà permissive : admin OR userId match) reste
-- inchangée — la suppression est un cas distinct (cmd=DELETE).
-- ============================================================================

DROP POLICY IF EXISTS "DocumentAudio_delete" ON "DocumentAudio";

CREATE POLICY "DocumentAudio_delete"
  ON "DocumentAudio"
  FOR DELETE
  USING ("userId" = current_user_id() OR is_admin());
