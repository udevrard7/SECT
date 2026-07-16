-- Rollback
DROP FUNCTION IF EXISTS public.find_users_for_auth(text);
DROP INDEX IF EXISTS "User_email_etablissementId_key";
