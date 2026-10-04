-- ============================================================
-- Migration 000125 (DOWN) — retire la traçabilité chapitre.
-- L'index puis la colonne (la FK disparaît avec la colonne).
-- ============================================================

DROP INDEX IF EXISTS "Question_chapter_idx";

ALTER TABLE "Question" DROP COLUMN IF EXISTS "chapterId";
