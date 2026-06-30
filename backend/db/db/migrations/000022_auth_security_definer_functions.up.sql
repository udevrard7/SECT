-- 000022: Fonctions SECURITY DEFINER pour AuthRepository (login/refresh/logout/password)
--
-- CONTEXTE : la migration 000020 a créé sect_app (NOBYPASSRLS). Les méthodes
-- de AuthRepository utilisaient `SET LOCAL row_security = off` — refusé pour sect_app.
--
-- FIX : créer des fonctions SECURITY DEFINER pour chaque opération d'auth.
-- Ces fonctions s'exécutent en tant que neondb_owner (bypass RLS interne).
--
-- Sécurité :
-- - SECURITY DEFINER + SET search_path = public.
-- - Paramètres bindés ($1, $2, ...) → pas d'injection SQL.
-- - Les opérations de login/refresh sont légitimement sans RLS (l'utilisateur
--   n'est pas encore authentifié, ou le refresh token EST l'auth).

-- ═══════════════════════════════════════════════════════════════
-- 1. find_user_for_auth(p_identifier text)
-- ═══════════════════════════════════════════════════════════════
-- Login : cherche par email (si contient '@') ou par matricule.
-- Retourne les champs auth (14 colonnes, ordre = scanAuthUser).

CREATE OR REPLACE FUNCTION public.find_user_for_auth(p_identifier text)
RETURNS TABLE (
    u_id text,
    u_email text,
    u_name text,
    u_password text,
    u_role text,
    u_etablissement_id text,
    u_filiere_id text,
    u_image text,
    u_actif boolean,
    u_must_change_pwd boolean,
    u_niveau text,
    u_login_attempts int,
    u_locked_until timestamp without time zone,
    u_derniere_connexion timestamp without time zone
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF position('@' in p_identifier) > 0 THEN
        RETURN QUERY
            SELECT "id", "email", "name", "password", "role"::text,
                   "etablissementId", "filiereId", "image", "actif",
                   "mustChangePwd", "niveau"::text, "loginAttempts", "lockedUntil",
                   "derniereConnexion"
            FROM "User" WHERE "email" = lower(p_identifier);
    ELSE
        RETURN QUERY
            SELECT "id", "email", "name", "password", "role"::text,
                   "etablissementId", "filiereId", "image", "actif",
                   "mustChangePwd", "niveau"::text, "loginAttempts", "lockedUntil",
                   "derniereConnexion"
            FROM "User" WHERE "matricule" = p_identifier;
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. get_user_by_id_auth(p_user_id text) — même retour que find_user_for_auth
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_by_id_auth(p_user_id text)
RETURNS TABLE (
    u_id text,
    u_email text,
    u_name text,
    u_password text,
    u_role text,
    u_etablissement_id text,
    u_filiere_id text,
    u_image text,
    u_actif boolean,
    u_must_change_pwd boolean,
    u_niveau text,
    u_login_attempts int,
    u_locked_until timestamp without time zone,
    u_derniere_connexion timestamp without time zone
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "id", "email", "name", "password", "role"::text,
           "etablissementId", "filiereId", "image", "actif",
           "mustChangePwd", "niveau"::text, "loginAttempts", "lockedUntil",
           "derniereConnexion"
    FROM "User" WHERE "id" = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. update_login_success(p_user_id text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_login_success(p_user_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "User"
    SET "loginAttempts" = 0, "lockedUntil" = NULL, "derniereConnexion" = CURRENT_TIMESTAMP
    WHERE "id" = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4. increment_login_attempts(p_user_id text, p_max_attempts int, p_lock_seconds int) RETURNS int
-- ═══════════════════════════════════════════════════════════════
-- Incrémente loginAttempts. Si >= max, pose lockedUntil = now + lock_seconds.
-- Retourne le nouveau count.
CREATE OR REPLACE FUNCTION public.increment_login_attempts(p_user_id text, p_max_attempts int, p_lock_seconds int)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts int;
BEGIN
    UPDATE "User" SET "loginAttempts" = "loginAttempts" + 1 WHERE "id" = p_user_id
    RETURNING "loginAttempts" INTO v_attempts;

    IF v_attempts IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: user % introuvable', p_user_id;
    END IF;

    IF v_attempts >= p_max_attempts THEN
        UPDATE "User"
        SET "lockedUntil" = CURRENT_TIMESTAMP + make_interval(secs => p_lock_seconds)
        WHERE "id" = p_user_id;
    END IF;

    RETURN v_attempts;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. create_refresh_token(p_id, p_user_id, p_token_hash, p_expires_at, p_user_agent, p_ip) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_refresh_token(
    p_id text, p_user_id text, p_token_hash text,
    p_expires_at timestamp without time zone,
    p_user_agent text, p_ip text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO "RefreshToken" ("id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "userAgent", "ip")
    VALUES (p_id, p_user_id, p_token_hash, p_expires_at, NULL, CURRENT_TIMESTAMP, p_user_agent, p_ip);
$$;

-- ═══════════════════════════════════════════════════════════════
-- 6. find_refresh_token_by_hash(p_hash text)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_refresh_token_by_hash(p_hash text)
RETURNS TABLE (
    rt_id text,
    rt_user_id text,
    rt_token_hash text,
    rt_expires_at timestamp without time zone,
    rt_revoked_at timestamp without time zone,
    rt_created_at timestamp without time zone,
    rt_user_agent text,
    rt_ip text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "userAgent", "ip"
    FROM "RefreshToken" WHERE "tokenHash" = p_hash;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 7. revoke_refresh_token(p_token_id text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_refresh_token(p_token_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "id" = p_token_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 8. revoke_refresh_token_by_hash_if_active(p_hash text)
-- ═══════════════════════════════════════════════════════════════
-- UPDATE atomique : révoque + retourne le token SEULEMENT s'il était actif.
CREATE OR REPLACE FUNCTION public.revoke_refresh_token_by_hash_if_active(p_hash text)
RETURNS TABLE (
    rt_id text,
    rt_user_id text,
    rt_token_hash text,
    rt_expires_at timestamp without time zone,
    rt_revoked_at timestamp without time zone,
    rt_created_at timestamp without time zone,
    rt_user_agent text,
    rt_ip text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "RefreshToken"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "tokenHash" = p_hash AND "revokedAt" IS NULL
    RETURNING "id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "userAgent", "ip";
$$;

-- ═══════════════════════════════════════════════════════════════
-- 9. revoke_all_user_refresh_tokens(p_user_id text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_all_user_refresh_tokens(p_user_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = p_user_id AND "revokedAt" IS NULL;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 10. update_password(p_user_id text, p_password_hash text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_password(p_user_id text, p_password_hash text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "User"
    SET "password" = p_password_hash, "mustChangePwd" = false,
        "loginAttempts" = 0, "lockedUntil" = NULL
    WHERE "id" = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 11. reset_password(p_user_id text, p_password_hash text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reset_password(p_user_id text, p_password_hash text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "User"
    SET "password" = p_password_hash, "mustChangePwd" = true,
        "loginAttempts" = 0, "lockedUntil" = NULL
    WHERE "id" = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 12. unlock_account(p_user_id text) RETURNS void
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unlock_account(p_user_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "User" SET "loginAttempts" = 0, "lockedUntil" = NULL WHERE "id" = p_user_id;
$$;

-- Grant EXECUTE à PUBLIC sur toutes les fonctions.
GRANT EXECUTE ON FUNCTION public.find_user_for_auth(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_by_id_auth(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_login_success(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_login_attempts(text, int, int) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_refresh_token(text, text, text, timestamp without time zone, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_refresh_token_by_hash(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_refresh_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_refresh_token_by_hash_if_active(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_all_user_refresh_tokens(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_password(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_account(text) TO PUBLIC;
