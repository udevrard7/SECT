-- Rollback: supprimer les colonnes GeniusPay et l'index
DROP INDEX IF EXISTS "Abonnement_geniuspayReference_idx";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "geniuspayPaymentUrl";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "geniuspayReference";
