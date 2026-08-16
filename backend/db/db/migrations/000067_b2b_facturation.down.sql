-- Rollback migration 000067
DROP FUNCTION IF EXISTS public.create_b2b_facture(text);
DROP FUNCTION IF EXISTS public.calculate_b2b_capitation(text);
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "nbrEtudiantsPayes";
