-- Drop IdentityPhoto table and related policies

DROP POLICY IF EXISTS "IdentityPhoto_modify_system" ON "IdentityPhoto";
DROP POLICY IF EXISTS "IdentityPhoto_select" ON "IdentityPhoto";
ALTER TABLE "IdentityPhoto" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "IdentityPhoto" DROP CONSTRAINT IF EXISTS "IdentityPhoto_epreuveId_fkey";
ALTER TABLE "IdentityPhoto" DROP CONSTRAINT IF EXISTS "IdentityPhoto_etudiantId_fkey";

DROP INDEX IF EXISTS "IdentityPhoto_sessionId_idx";
DROP INDEX IF EXISTS "IdentityPhoto_epreuveId_idx";
DROP INDEX IF EXISTS "IdentityPhoto_etudiantId_idx";

DROP TABLE IF EXISTS "IdentityPhoto";
