-- Rollback
DROP FUNCTION IF EXISTS public.validate_b2b_establishment(text);
DROP FUNCTION IF EXISTS public.verify_b2b_email(text);
DROP FUNCTION IF EXISTS public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer);
DROP INDEX IF EXISTS "Etablissement_telephone_idx";
ALTER TABLE "Etablissement" DROP COLUMN IF EXISTS "emailVerifiedAt";
ALTER TABLE "Etablissement" DROP COLUMN IF EXISTS "emailVerificationToken";
ALTER TABLE "Etablissement" DROP COLUMN IF EXISTS "adminValidated";
ALTER TABLE "Etablissement" DROP COLUMN IF EXISTS "emailVerified";
-- Note: ALTER TYPE ... ADD VALUE ne peut pas être rollbacké en Postgres.
