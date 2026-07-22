-- Migration 000100 (down) — Drop SimilarityReport table

DROP POLICY IF EXISTS "SimilarityReport_modify_system" ON "SimilarityReport";
DROP POLICY IF EXISTS "SimilarityReport_select" ON "SimilarityReport";
ALTER TABLE "SimilarityReport" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "SimilarityReport" DROP CONSTRAINT IF EXISTS "SimilarityReport_sessionB_fkey";
ALTER TABLE "SimilarityReport" DROP CONSTRAINT IF EXISTS "SimilarityReport_sessionA_fkey";
ALTER TABLE "SimilarityReport" DROP CONSTRAINT IF EXISTS "SimilarityReport_epreuveId_fkey";
DROP INDEX IF EXISTS "SimilarityReport_pair_unique";
DROP INDEX IF EXISTS "SimilarityReport_etudiantAId_idx";
DROP INDEX IF EXISTS "SimilarityReport_flagged_idx";
DROP INDEX IF EXISTS "SimilarityReport_epreuveId_idx";
DROP TABLE IF EXISTS "SimilarityReport";
