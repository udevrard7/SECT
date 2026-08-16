-- Rollback 000095
DROP POLICY IF EXISTS "Alerte_update" ON "Alerte";
DROP POLICY IF EXISTS "Alerte_insert" ON "Alerte";
DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
ALTER TABLE "Alerte" DROP COLUMN IF EXISTS "resolvedById";
ALTER TABLE "Alerte" DROP COLUMN IF EXISTS "resolvedAt";
