-- ════════════════════════════════════════════════════════════════════════════
-- 000080 — DOWN : revert Phase 2 (SECT-REG-LINK-PHASE2-BACKEND-1)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Drop log_registration_event (fonction Phase 2)
-- 2. Restaurer accept_student_signup sans check domaine (version 000079)
-- 3. Restaurer find_student_signup_link_by_token sans emailDomainRestriction
-- 4. Drop table RegistrationEvent
-- 5. Drop colonne emailDomainRestriction
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.log_registration_event(text, text, text, text, text, boolean, text);

-- Restaurer l'ancienne version de accept_student_signup (sans check domaine)
CREATE OR REPLACE FUNCTION public.accept_student_signup(
    p_token text,
    p_email text,
    p_password text,
    p_name text
)
RETURNS TABLE (
    o_code text,
    o_user_id text,
    o_user_email text,
    o_user_name text,
    o_user_matricule text,
    o_etablissement_nom text,
    o_filiere_nom text,
    o_message text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link RECORD;
    v_user_id text := gen_random_uuid()::text;
    v_matricule text;
    v_fil_code text;
    v_count int;
    v_year2 text;
BEGIN
    SELECT * INTO v_link FROM "StudentSignupLink" WHERE "token" = p_token AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Lien introuvable'::text;
        RETURN;
    END IF;
    IF v_link."actif" = false THEN
        RETURN QUERY SELECT 'INACTIVE'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Révoqué'::text;
        RETURN;
    END IF;
    IF v_link."expiresAt" < now() THEN
        RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Expiré'::text;
        RETURN;
    END IF;
    IF v_link."maxUses" IS NOT NULL AND v_link."useCount" >= v_link."maxUses" THEN
        RETURN QUERY SELECT 'QUOTA_EXCEEDED'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Quota atteint'::text;
        RETURN;
    END IF;
    IF v_link."filiereId" IS NOT NULL AND v_link."filiereId" <> '' THEN
        SELECT "code" INTO v_fil_code FROM "Filiere" WHERE "id" = v_link."filiereId";
        IF v_fil_code IS NULL OR v_fil_code = '' THEN
            v_fil_code := 'ETU';
        END IF;
        SELECT count(*)::int INTO v_count FROM "User" WHERE "role" = 'ETUDIANT' AND "filiereId" = v_link."filiereId";
        v_year2 := to_char(now(), 'YY');
        v_matricule := v_fil_code || '/LJ/' || v_year2 || '/' || lpad((v_count + 1)::text, 3, '0');
    END IF;
    BEGIN
        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                            "image", "actif", "mustChangePwd", "matricule", "niveau",
                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
        VALUES (v_user_id, lower(p_email), p_name, p_password, 'ETUDIANT'::"Role",
                v_link."etablissementId", v_link."filiereId",
                NULL, true, false, v_matricule, v_link."niveau",
                0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT 'USER_EXISTS'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Compte existant'::text;
        RETURN;
    END;
    UPDATE "StudentSignupLink"
        SET "useCount" = "useCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = v_link."id";
    RETURN QUERY
        SELECT 'OK'::text,
               u."id", u."email", u."name", u."matricule",
               e."nom", f."nom",
               'Inscription réussie'::text
        FROM "User" u
        LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
        WHERE u."id" = v_user_id;
END;
$$;

-- Restaurer l'ancienne version de find_student_signup_link_by_token (sans emailDomainRestriction)
CREATE OR REPLACE FUNCTION public.find_student_signup_link_by_token(p_token text)
RETURNS TABLE (
    link_id text,
    link_token text,
    link_etablissement_id text,
    link_filiere_id text,
    link_niveau text,
    link_created_by_id text,
    link_expires_at timestamp without time zone,
    link_max_uses int,
    link_use_count int,
    link_actif boolean,
    link_label text,
    link_created_at timestamp without time zone,
    etab_nom text,
    etab_type text,
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
        SELECT s."id", s."token", s."etablissementId", s."filiereId", s."niveau"::text,
               s."createdById", s."expiresAt", s."maxUses", s."useCount", s."actif",
               s."label", s."createdAt",
               e."nom", e."type"::text, e."ville",
               f."nom", f."code",
               u."name"
        FROM "StudentSignupLink" s
        LEFT JOIN "Etablissement" e ON e."id" = s."etablissementId"
        LEFT JOIN "Filiere" f ON f."id" = s."filiereId"
        LEFT JOIN "User" u ON u."id" = s."createdById"
        WHERE s."token" = p_token
          AND s."deletedAt" IS NULL;
END;
$$;

DROP INDEX IF EXISTS "idx_registration_event_link";
DROP INDEX IF EXISTS "idx_registration_event_created";
DROP INDEX IF EXISTS "idx_student_signup_link_etab";
DROP TABLE IF EXISTS "RegistrationEvent";
ALTER TABLE "StudentSignupLink" DROP COLUMN IF EXISTS "emailDomainRestriction";
