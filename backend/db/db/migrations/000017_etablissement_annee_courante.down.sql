-- ============================================================
-- Migration 000017 (DOWN) — Rollback
-- ============================================================

DROP INDEX IF EXISTS "Etablissement_anneeAcademiqueCouranteId_idx";
ALTER TABLE "Etablissement" DROP COLUMN IF EXISTS "anneeAcademiqueCouranteId";
