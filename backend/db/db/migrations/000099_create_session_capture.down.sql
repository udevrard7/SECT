-- Rollback SessionCapture table

DROP POLICY IF EXISTS "SessionCapture_insert" ON "SessionCapture";
DROP POLICY IF EXISTS "SessionCapture_select" ON "SessionCapture";
ALTER TABLE "SessionCapture" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "SessionCapture" DROP CONSTRAINT IF EXISTS "SessionCapture_sessionId_fkey";
DROP INDEX IF EXISTS "SessionCapture_etudiantId_idx";
DROP INDEX IF EXISTS "SessionCapture_epreuveId_idx";
DROP INDEX IF EXISTS "SessionCapture_sessionId_idx";
DROP TABLE IF EXISTS "SessionCapture";
