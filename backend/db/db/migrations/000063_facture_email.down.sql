-- Rollback migration 000063
DROP FUNCTION IF EXISTS public.create_b2c_facture(text);
DROP INDEX IF EXISTS "Abonnement_factureId_idx";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "factureId";
