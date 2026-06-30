-- 000021: Fonctions SECURITY DEFINER pour endpoints publics d'invitation
--
-- CONTEXTE : la migration 000020 a créé le rôle sect_app (NOBYPASSRLS). Les 4
-- méthodes du InvitationRepository qui gèrent les endpoints publics (/verify,
-- /accept) utilisaient `SET LOCAL row_security = off` — cette commande est
-- refusée pour sect_app (pas de BYPASSRLS).
--
-- FIX : créer 4 fonctions SECURITY DEFINER qui s'exécutent en tant que
-- neondb_owner (bypass RLS interne). sect_app les appelle sans avoir besoin
-- de BYPASSRLS. Chaque fonction encapsule une opération publique complète.
--
-- Sécurité :
-- - SECURITY DEFINER : la fonction s'exécute avec les privilèges du owner (neondb_owner).
-- - SET search_path = public : empêche le search_path hijacking.
-- - Les paramètres sont passés en $1, $2, etc. (pas de concaténation SQL) → pas d'injection.

-- ═══════════════════════════════════════════════════════════════
-- 1. find_invitation_by_token(p_token text)
-- ═══════════════════════════════════════════════════════════════
-- Utilisée par : GET /api/invitations/verify (endpoint public).
-- Retourne l'invitation + relations (etablissement, filiere, creator).
-- Bypass RLS car le token EST l'authentification (pas de claims JWT).

CREATE OR REPLACE FUNCTION public.find_invitation_by_token(p_token text)
RETURNS TABLE (
    inv_id text,
    inv_token text,
    inv_email text,
    inv_role text,
    inv_name text,
    inv_etablissement_id text,
    inv_filiere_id text,
    inv_expires_at timestamp without time zone,
    inv_used boolean,
    inv_used_at timestamp without time zone,
    inv_created_by_id text,
    inv_created_at timestamp without time zone,
    etab_nom text,
    etab_ville text,
    fil_nom text,
    fil_code text,
    creator_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
        SELECT i."id", i."token", i."email", i."role"::text, i."name",
               i."etablissementId", i."filiereId",
               i."expiresAt", i."used", i."usedAt",
               i."createdById", i."createdAt",
               e."nom", e."ville",
               f."nom", f."code",
               u."name"
        FROM "Invitation" i
        LEFT JOIN "Etablissement" e ON e."id" = i."etablissementId"
        LEFT JOIN "Filiere" f ON f."id" = i."filiereId"
        LEFT JOIN "User" u ON u."id" = i."createdById"
        WHERE i."token" = p_token;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. user_exists_by_email(p_email text) RETURNS boolean
-- ═══════════════════════════════════════════════════════════════
-- Utilisée par : GET /api/invitations/verify (endpoint public).
-- Vérifie si un User avec cet email existe déjà (empêche la double inscription).

CREATE OR REPLACE FUNCTION public.user_exists_by_email(p_email text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS(SELECT 1 FROM "User" WHERE "email" = lower(p_email));
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. mark_invitation_used(p_id text, p_used_at timestamptz) RETURNS boolean
-- ═══════════════════════════════════════════════════════════════
-- Utilisée par : POST /api/invitations/accept (étape de marquage).
-- Marque une invitation comme utilisée. Retourne true si au moins 1 ligne affectée.

CREATE OR REPLACE FUNCTION public.mark_invitation_used(p_id text, p_used_at timestamp without time zone)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows int;
BEGIN
    UPDATE "Invitation" SET "used" = true, "usedAt" = p_used_at WHERE "id" = p_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4. accept_invitation(...) — création User + marquage invitation (atomique)
-- ═══════════════════════════════════════════════════════════════
-- Utilisée par : POST /api/invitations/accept (endpoint public).
-- Crée le User + marque l'invitation comme utilisée en une seule opération atomique.
-- Si role=ETUDIANT et filiereId set, génère un matricule FIL/LJ/YY/NNN.
--
-- Paramètres :
--   p_invitation_id      — ID de l'invitation
--   p_email              — email de l'invitation (sera normalisé en minuscules)
--   p_role               — rôle de l'invitation ('ETUDIANT', 'ENSEIGNANT', etc.)
--   p_etablissement_id   — ID établissement (nullable)
--   p_filiere_id         — ID filière (nullable, requis pour matricule ETUDIANT)
--   p_password           — mot de passe DÉJÀ hashé (bcrypt) par le usecase
--   p_name               — nom choisi par l'utilisateur
--
-- Retourne : le User créé (14 colonnes, ordre = scanUser).

CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_invitation_id text,
    p_email text,
    p_role text,
    p_etablissement_id text,
    p_filiere_id text,
    p_password text,
    p_name text
)
RETURNS TABLE (
    user_id text,
    user_email text,
    user_name text,
    user_role text,
    user_etablissement_id text,
    user_filiere_id text,
    user_image text,
    user_actif boolean,
    user_must_change_pwd boolean,
    user_matricule text,
    user_niveau text,
    user_derniere_connexion timestamp without time zone,
    user_created_at timestamp without time zone,
    user_updated_at timestamp without time zone
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id text := gen_random_uuid()::text;
    v_matricule text;
    v_fil_code text;
    v_count int;
    v_year2 text;
    v_rows int;
BEGIN
    -- 1. Générer le matricule si ETUDIANT + filière set.
    IF p_role = 'ETUDIANT' AND p_filiere_id IS NOT NULL AND p_filiere_id <> '' THEN
        SELECT "code" INTO v_fil_code FROM "Filiere" WHERE "id" = p_filiere_id;
        IF v_fil_code IS NULL OR v_fil_code = '' THEN
            v_fil_code := 'ETU';
        END IF;
        SELECT count(*)::int INTO v_count FROM "User" WHERE "role" = 'ETUDIANT' AND "filiereId" = p_filiere_id;
        v_year2 := to_char(now(), 'YY');
        v_matricule := v_fil_code || '/LJ/' || v_year2 || '/' || lpad((v_count + 1)::text, 3, '0');
    END IF;

    -- 2. Créer le User.
    BEGIN
        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                            "image", "actif", "mustChangePwd", "matricule", "niveau",
                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
        VALUES (v_user_id, lower(p_email), p_name, p_password, p_role::"Role",
                NULLIF(p_etablissement_id, ''), NULLIF(p_filiere_id, ''),
                NULL, true, false, v_matricule, NULL,
                0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'INVITATION_CONFLICT: email ou matricule déjà utilisé' USING ERRCODE = 'unique_violation';
    END;

    -- 3. Marquer l'invitation comme utilisée.
    UPDATE "Invitation" SET "used" = true, "usedAt" = CURRENT_TIMESTAMP WHERE "id" = p_invitation_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RAISE EXCEPTION 'INVITATION_NOT_FOUND: invitation % introuvable', p_invitation_id;
    END IF;

    -- 4. Retourner le User créé (ordres des colonnes = scanUser).
    RETURN QUERY
        SELECT u."id", u."email", u."name", u."role"::text,
               u."etablissementId", u."filiereId", u."image",
               u."actif", u."mustChangePwd", u."matricule", u."niveau"::text,
               u."derniereConnexion", u."createdAt", u."updatedAt"
        FROM "User" u WHERE u."id" = v_user_id;
END;
$$;

-- Grant EXECUTE à PUBLIC (sect_app inclus) sur les 4 fonctions.
GRANT EXECUTE ON FUNCTION public.find_invitation_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_exists_by_email(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invitation_used(text, timestamp without time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, text, text, text, text, text, text) TO PUBLIC;
