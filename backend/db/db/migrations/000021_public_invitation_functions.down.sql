-- 000021 down: supprime les 4 fonctions SECURITY DEFINER

DROP FUNCTION IF EXISTS public.find_invitation_by_token(text);
DROP FUNCTION IF EXISTS public.user_exists_by_email(text);
DROP FUNCTION IF EXISTS public.mark_invitation_used(text, timestamp without time zone);
DROP FUNCTION IF EXISTS public.accept_invitation(text, text, text, text, text, text, text);
