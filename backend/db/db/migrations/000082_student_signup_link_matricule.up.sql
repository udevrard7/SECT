-- ════════════════════════════════════════════════════════════════════════════
-- 000082 — Matricule B2B optionnel sur StudentSignupLink
-- (SECT-STUDENT-SIGNUP-MATRICULE-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Ajout colonne "requireMatricule" boolean DEFAULT false sur StudentSignupLink.
--    Si true, l'étudiant DOIT saisir un matricule à l'inscription. La validation
--    utilise Etablissement.regexMatricule (si non vide) ou accepte tout non-vide.
--    Le matricule saisi est stocké dans User.matricule (override de l'auto-généré).
--
-- 2. Étendre find_student_signup_link_by_token : retourne link_require_matricule +
--    etab_matricule_regex + etab_matricule_format + etab_matricule_example
--    (4 nouvelles colonnes OUT, AVANT etab_nom). L'étudiant a besoin de cette
--    config pour valider son input côté frontend (regex + placeholder + helper).
--
-- 3. Étendre accept_student_signup : ajoute 5e paramètre p_matricule text.
--    Si link.requireMatricule = true :
--      - p_matricule doit être non-vide (sinon code MATRICULE_REQUIRED)
--      - si etab.regexMatricule non vide ET p_matricule ne match pas → code MATRICULE_INVALID
--      - stocke p_matricule dans User.matricule (au lieu du matricule auto-généré FIL/LJ/YY/NNN)
--    Si link.requireMatricule = false :
--      - p_matricule est ignoré (comportement inchangé : auto-génération FIL/LJ/YY/NNN)
--
-- SÉCURITÉ :
--   - DROP + CREATE nécessaire car Postgres interdit CREATE OR REPLACE quand la
--     signature RETURNS TABLE change (ajout colonnes OUT) ou quand on ajoute un
--     paramètre IN. Les grants EXECUTE doivent être re-posés.
--   - La validation regex utilise ~ (Postgres regex match operator). Si la regex
--     est invalide (syntax error), on catche l'exception et on accepte le matricule
--     (fail-open côté validation regex — le matricule est non-vide, c'est l'essentiel).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Nouvelle colonne requireMatricule sur StudentSignupLink ───
ALTER TABLE "StudentSignupLink"
    ADD COLUMN IF NOT EXISTS "requireMatricule" boolean NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Étendre find_student_signup_link_by_token (+ 4 colonnes OUT)
-- ════════════════════════════════════════════════════════════════════════════
-- Ajout de 4 colonnes OUT (link_require_matricule + etab_matricule_regex +
-- etab_matricule_format + etab_matricule_example) placées APRÈS
-- link_expiry_reminder_sent (15e) et AVANT etab_nom (qui devient 20e).
--
-- NOTE : Postgres interdit CREATE OR REPLACE quand la signature RETURNS TABLE
-- change (nombre/type de colonnes OUT). On DROP d'abord puis CREATE.
DROP FUNCTION IF EXISTS public.find_student_signup_link_by_token(text);
CREATE FUNCTION public.find_student_signup_link_by_token(p_token text)
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
    link_email_domain_restriction text,
    link_custom_welcome_message text,
    link_expiry_reminder_sent boolean,
    link_require_matricule boolean,
    etab_matricule_regex text,
    etab_matricule_format text,
    etab_matricule_example text,
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
               s."label", s."createdAt", s."emailDomainRestriction",
               s."customWelcomeMessage", s."expiryReminderSent",
               s."requireMatricule",
               e."regexMatricule", e."formatMatricule", e."exempleMatricule",
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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Étendre accept_student_signup (+ 5e paramètre p_matricule text)
-- ════════════════════════════════════════════════════════════════════════════
-- Ajout : si v_link."requireMatricule" = true :
--   - p_matricule doit être non-vide (sinon code MATRICULE_REQUIRED)
--   - si etab.regexMatricule non vide ET p_matricule ne match pas → code MATRICULE_INVALID
--   - stocke trim(p_matricule) dans User.matricule (override auto-généré)
-- Si requireMatricule = false : p_matricule est ignoré (comportement Phase 1/2/3).
--
-- Nouveaux codes de retour : 'MATRICULE_REQUIRED' + 'MATRICULE_INVALID'.
DROP FUNCTION IF EXISTS public.accept_student_signup(text, text, text, text);
CREATE FUNCTION public.accept_student_signup(
    p_token text,
    p_email text,
    p_password text,
    p_name text,
    p_matricule text
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
    v_email_lower text := lower(p_email);
    v_etab_regex_matricule text;
    v_etab_format_matricule text;
    v_etab_example_matricule text;
    v_input_matricule text;
    v_regex_ok boolean := true;
BEGIN
    SELECT * INTO v_link FROM "StudentSignupLink" WHERE "token" = p_token AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, NULL, NULL, NULL, NULL, NULL, NULL, 'Lien introuvable ou supprimé'::text;
        RETURN;
    END IF;

    IF v_link."actif" = false THEN
        RETURN QUERY SELECT 'INACTIVE'::text, NULL, NULL, NULL, NULL, NULL, NULL, 'Ce lien d''inscription a été révoqué'::text;
        RETURN;
    END IF;
    IF v_link."expiresAt" < now() THEN
        RETURN QUERY SELECT 'EXPIRED'::text, NULL, NULL, NULL, NULL, NULL, NULL, 'Ce lien d''inscription a expiré'::text;
        RETURN;
    END IF;
    IF v_link."maxUses" IS NOT NULL AND v_link."useCount" >= v_link."maxUses" THEN
        RETURN QUERY SELECT 'QUOTA_EXCEEDED'::text, NULL, NULL, NULL, NULL, NULL, NULL, 'Le nombre maximum d''inscriptions pour ce lien a été atteint'::text;
        RETURN;
    END IF;

    -- Phase 2 : restriction domaine email (si emailDomainRestriction IS NOT NULL AND <> '')
    IF v_link."emailDomainRestriction" IS NOT NULL AND v_link."emailDomainRestriction" <> '' THEN
        IF v_email_lower NOT LIKE '%@' || lower(v_link."emailDomainRestriction") THEN
            RETURN QUERY SELECT 'DOMAIN_NOT_ALLOWED'::text, NULL, NULL, NULL, NULL, NULL, NULL,
                'Cet email n''appartient pas au domaine autorisé : @' || v_link."emailDomainRestriction"::text;
            RETURN;
        END IF;
    END IF;

    -- ─── 000082 : Matricule B2B optionnel (requireMatricule) ───
    -- Si requireMatricule = true, l'étudiant doit saisir un matricule valide selon
    -- la regex de l'établissement (regexMatricule). Le matricule saisi override
    -- l'auto-génération FIL/LJ/YY/NNN. Fail-open sur regex invalide (syntax error)
    -- pour éviter de bloquer l'inscription si l'étab a mal configuré sa regex.
    IF v_link."requireMatricule" = true THEN
        -- Charger la config matricule de l'établissement (séparément car v_link
        -- ne contient que les colonnes de StudentSignupLink via SELECT *).
        SELECT e."regexMatricule", e."formatMatricule", e."exempleMatricule"
          INTO v_etab_regex_matricule, v_etab_format_matricule, v_etab_example_matricule
          FROM "Etablissement" e
         WHERE e."id" = v_link."etablissementId";

        v_input_matricule := trim(p_matricule);
        IF v_input_matricule IS NULL OR v_input_matricule = '' THEN
            RETURN QUERY SELECT 'MATRICULE_REQUIRED'::text, NULL, NULL, NULL, NULL, NULL, NULL,
                'Un matricule est requis pour cette inscription'::text;
            RETURN;
        END IF;

        -- Validation regex uniquement si l'étab a défini une regexMatricule non vide.
        IF v_etab_regex_matricule IS NOT NULL AND v_etab_regex_matricule <> '' THEN
            BEGIN
                IF v_input_matricule !~ v_etab_regex_matricule THEN
                    v_regex_ok := false;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Regex invalide (syntax error) : on fail-open (accepte le matricule).
                -- Le matricule est non-vide, c'est l'essentiel. L'admin corrigera la regex.
                v_regex_ok := true;
            END;

            IF v_regex_ok = false THEN
                RETURN QUERY SELECT 'MATRICULE_INVALID'::text, NULL, NULL, NULL, NULL, NULL, NULL,
                    'Le format du matricule est invalide'::text;
                RETURN;
            END IF;
        END IF;

        -- Override : on utilise le matricule saisi par l'étudiant (au lieu de FIL/LJ/YY/NNN).
        v_matricule := v_input_matricule;
    ELSE
        -- requireMatricule = false : comportement inchangé (auto-génération FIL/LJ/YY/NNN).
        IF v_link."filiereId" IS NOT NULL AND v_link."filiereId" <> '' THEN
            SELECT "code" INTO v_fil_code FROM "Filiere" WHERE "id" = v_link."filiereId";
            IF v_fil_code IS NULL OR v_fil_code = '' THEN
                v_fil_code := 'ETU';
            END IF;
            SELECT count(*)::int INTO v_count FROM "User" WHERE "role" = 'ETUDIANT' AND "filiereId" = v_link."filiereId";
            v_year2 := to_char(now(), 'YY');
            v_matricule := v_fil_code || '/LJ/' || v_year2 || '/' || lpad((v_count + 1)::text, 3, '0');
        END IF;
    END IF;

    BEGIN
        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                            "image", "actif", "mustChangePwd", "matricule", "niveau",
                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
        VALUES (v_user_id, v_email_lower, p_name, p_password, 'ETUDIANT'::"Role",
                v_link."etablissementId", v_link."filiereId",
                NULL, true, false, v_matricule, v_link."niveau",
                0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT 'USER_EXISTS'::text, NULL, NULL, NULL, NULL, NULL, NULL, 'Un compte existe déjà avec cet email'::text;
        RETURN;
    END;

    UPDATE "StudentSignupLink"
        SET "useCount" = "useCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = v_link."id";

    RETURN QUERY
        SELECT 'OK'::text,
               u."id", u."email", u."name", u."matricule",
               e."nom", f."nom",
               'Inscription réussie. Vous pouvez vous connecter.'::text
        FROM "User" u
        LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
        WHERE u."id" = v_user_id;
END;
$$;

-- ─── 4. Grants EXECUTE sur les fonctions publiques (re-posés après DROP+CREATE) ───
GRANT EXECUTE ON FUNCTION public.find_student_signup_link_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_student_signup(text, text, text, text, text) TO PUBLIC;
