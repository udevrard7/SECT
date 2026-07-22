-- Rollback migration 000064
DROP INDEX IF EXISTS "Abonnement_relance_check_idx";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "relanceEnvoyee";
