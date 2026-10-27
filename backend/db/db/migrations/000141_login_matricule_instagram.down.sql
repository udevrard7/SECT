-- ============================================================
-- Migration 000141 (DOWN) — rollback intégral
-- ============================================================

-- Partie B — colonnes notifications instagram.
ALTER TABLE "NotificationPreference"
        DROP COLUMN IF EXISTS "instagramEnabled";
ALTER TABLE "User"
        DROP COLUMN IF EXISTS "instagram";

-- Partie A — fonctions v1 strictes (état migration 000072) + drop index.
CREATE OR REPLACE FUNCTION public.find_users_for_auth(p_identifier text)
RETURNS TABLE(
    u_id text,
    u_email text,
    u_name text,
    u_role text,
    u_etablissement_id text,
    u_etablissement_nom text,
    u_actif boolean,
    u_must_change_pwd boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF position('@' in p_identifier) > 0 THEN
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE u."email" = lower(p_identifier)
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    ELSE
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE u."matricule" = p_identifier
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    END IF;
END;
$function$;

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

DROP INDEX IF EXISTS "User_email_lower_btrim_idx";
DROP INDEX IF EXISTS "User_matricule_lower_btrim_idx";
