-- ════════════════════════════════════════════════════════════════════════════
-- 000080 — Phase 2 : restriction domaine email + audit RegistrationEvent
-- (SECT-REG-LINK-PHASE2-BACKEND-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Ajout colonne "emailDomainRestriction" (NULL = pas de restriction)
-- 2. Table "RegistrationEvent" (audit des tentatives d'inscription)
-- 3. Fonction find_student_signup_link_by_token étendue (retourne emailDomainRestriction)
-- 4. Fonction accept_student_signup étendue (vérifie domaine → code DOMAIN_NOT_ALLOWED)
-- 5. Fonction log_registration_event (SECURITY DEFINER, bypass RLS pour INSERT audit)
--
-- SÉCURITÉ :
--   - emailDomainRestriction est optionnel (NULL/'' = pas de restriction).
--     Comparaison case-insensitive côté SQL (lower() des deux côtés).
--   - La table RegistrationEvent est RLS-ON pour SELECT (owner/admin/responsable
--     du même étab via le linkId) mais INSERT/UPDATE/DELETE réservés à la
--     fonction SECURITY DEFINER log_registration_event (les clients n'écrivent
--     jamais directement dans cette table).
--   - Defense in depth : le domaine est vérifié côté usecase (avant bcrypt) ET
--     côté SQL (atomique, race-free). Le SQL est authoritative.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonne emailDomainRestriction sur StudentSignupLink ───
ALTER TABLE "StudentSignupLink"
    ADD COLUMN IF NOT EXISTS "emailDomainRestriction" text;

-- Index pour lister les liens par établissement (filter admin/responsable)
CREATE INDEX IF NOT EXISTS "idx_student_signup_link_etab"
    ON "StudentSignupLink"("etablissementId") WHERE "deletedAt" IS NULL;

-- ─── 2. Table RegistrationEvent (audit) ───
CREATE TABLE IF NOT EXISTS "RegistrationEvent" (
    "id" text PRIMARY KEY,
    "linkId" text NOT NULL REFERENCES "StudentSignupLink"("id") ON DELETE CASCADE,
    "userId" text REFERENCES "User"("id") ON DELETE SET NULL,
    "email" text NOT NULL,
    "ip" text,
    "userAgent" text,
    "success" boolean NOT NULL,
    "code" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_registration_event_link"
    ON "RegistrationEvent"("linkId");
CREATE INDEX IF NOT EXISTS "idx_registration_event_created"
    ON "RegistrationEvent"("createdAt" DESC);

-- RLS : SELECT ouvert au owner du link / admin / responsable du même étab.
-- INSERT/UPDATE/DELETE uniquement via log_registration_event (SECURITY DEFINER).
ALTER TABLE "RegistrationEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RegistrationEvent_select" ON "RegistrationEvent";
CREATE POLICY "RegistrationEvent_select" ON "RegistrationEvent" FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM "StudentSignupLink" s
            WHERE s."id" = "RegistrationEvent"."linkId"
              AND (
                s."createdById" = current_user_id()
                OR is_admin()
                OR (is_responsable() AND s."etablissementId" = current_etablissement_id())
              )
        )
    );

GRANT SELECT ON "RegistrationEvent" TO PUBLIC;
-- Insert/Update/Delete uniquement via SECURITY DEFINER (log_registration_event).

-- ════════════════════════════════════════════════════════════════════════════
-- 3. find_student_signup_link_by_token — version étendue (+ emailDomainRestriction)
-- ════════════════════════════════════════════════════════════════════════════
-- NOTE : Postgres interdit CREATE OR REPLACE quand la signature de retour change
-- (le nombre/type de colonnes OUT change). On DROP d'abord puis CREATE.
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
-- 4. accept_student_signup — version étendue (vérifie emailDomainRestriction)
-- ════════════════════════════════════════════════════════════════════════════
-- Ajout : si emailDomainRestriction IS NOT NULL AND <> '', l'email doit matcher
-- '%' || '@' || lower(emailDomainRestriction). Sinon code DOMAIN_NOT_ALLOWED.
-- Nouveau code de retour : 'DOMAIN_NOT_ALLOWED'.
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
    v_email_lower text := lower(p_email);
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

    -- Générer le matricule si filière set.
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

-- ════════════════════════════════════════════════════════════════════════════
-- 5. log_registration_event — audit (SECURITY DEFINER, bypass RLS pour INSERT)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.log_registration_event(
    p_link_id text,
    p_user_id text,
    p_email text,
    p_ip text,
    p_user_agent text,
    p_success boolean,
    p_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO "RegistrationEvent" ("id", "linkId", "userId", "email", "ip", "userAgent", "success", "code", "createdAt")
    VALUES (gen_random_uuid()::text, p_link_id, p_user_id, lower(p_email), p_ip, p_user_agent, p_success, p_code, CURRENT_TIMESTAMP);
END;
$$;

-- ─── 6. Grants EXECUTE sur les fonctions publiques ───
GRANT EXECUTE ON FUNCTION public.find_student_signup_link_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_student_signup(text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_registration_event(text, text, text, text, text, boolean, text) TO PUBLIC;
