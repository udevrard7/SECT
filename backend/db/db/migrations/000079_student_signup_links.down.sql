-- 000079 down — Rollback StudentSignupLink
-- Réinverse l'ordre de création : fonctions d'abord, puis policies, puis table.

-- 1. Drop fonctions SECURITY DEFINER
DROP FUNCTION IF EXISTS public.accept_student_signup(text, text, text, text);
DROP FUNCTION IF EXISTS public.find_student_signup_link_by_token(text);

-- 2. Drop policies RLS
DROP POLICY IF EXISTS "StudentSignupLink_select" ON "StudentSignupLink";
DROP POLICY IF EXISTS "StudentSignupLink_insert" ON "StudentSignupLink";
DROP POLICY IF EXISTS "StudentSignupLink_update" ON "StudentSignupLink";
DROP POLICY IF EXISTS "StudentSignupLink_delete" ON "StudentSignupLink";

-- 3. Drop index
DROP INDEX IF EXISTS "idx_student_signup_link_token";
DROP INDEX IF EXISTS "idx_student_signup_link_created_by";

-- 4. Drop table
DROP TABLE IF EXISTS "StudentSignupLink";
