-- 000022 down: supprime les 12 fonctions SECURITY DEFINER d'auth

DROP FUNCTION IF EXISTS public.find_user_for_auth(text);
DROP FUNCTION IF EXISTS public.get_user_by_id_auth(text);
DROP FUNCTION IF EXISTS public.update_login_success(text);
DROP FUNCTION IF EXISTS public.increment_login_attempts(text, int, int);
DROP FUNCTION IF EXISTS public.create_refresh_token(text, text, text, timestamp without time zone, text, text);
DROP FUNCTION IF EXISTS public.find_refresh_token_by_hash(text);
DROP FUNCTION IF EXISTS public.revoke_refresh_token(text);
DROP FUNCTION IF EXISTS public.revoke_refresh_token_by_hash_if_active(text);
DROP FUNCTION IF EXISTS public.revoke_all_user_refresh_tokens(text);
DROP FUNCTION IF EXISTS public.update_password(text, text);
DROP FUNCTION IF EXISTS public.reset_password(text, text);
DROP FUNCTION IF EXISTS public.unlock_account(text);
