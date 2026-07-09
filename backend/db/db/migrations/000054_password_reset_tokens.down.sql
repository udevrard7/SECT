-- 000054 down — inverse de 000054_password_reset_tokens.up.sql

DROP FUNCTION IF EXISTS public.invalidate_user_password_reset_tokens(text);
DROP FUNCTION IF EXISTS public.mark_password_reset_token_used(text);
DROP FUNCTION IF EXISTS public.find_password_reset_token_by_hash(text);
DROP FUNCTION IF EXISTS public.create_password_reset_token(text, text, text, timestamp without time zone, text, text);

DROP POLICY IF EXISTS "PasswordResetToken_modify_self" ON "PasswordResetToken";
DROP POLICY IF EXISTS "PasswordResetToken_select_self" ON "PasswordResetToken";

ALTER TABLE "PasswordResetToken" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS "PasswordResetToken";
