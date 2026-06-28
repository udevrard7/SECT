-- ============================================================
-- Rollback — Migration 000010 (AUDIO-LEARNING-1)
-- ============================================================
-- Supprime la table DocumentAudio + ses indexes + ses FK + son trigger
-- (le trigger est supprimé automatiquement via ON DROP de la table).
-- ============================================================

DROP TABLE IF EXISTS "DocumentAudio";
