-- ════════════════════════════════════════════════════════════════════════════
-- 000081 — DOWN : revert Phase 3 (SECT-REG-LINK-PHASE3-BACKEND-1)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Drop expire_student_signup_links (fonction Phase 3)
-- 2. Restaurer find_student_signup_link_by_token sans les 2 nouvelles colonnes
--    (signature 19 colonnes, version Phase 2)
-- 3. Drop index partiel idx_student_signup_link_reminder
-- 4. Drop colonnes expiryReminderSent + customWelcomeMessage
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Drop fonction expire_student_signup_links
DROP FUNCTION IF EXISTS public.expire_student_signup_links();

-- 2. Restaurer find_student_signup_link_by_token (signature Phase 2 — 19 colonnes)
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
GRANT EXECUTE ON FUNCTION public.find_student_signup_link_by_token(text) TO PUBLIC;

-- 3. Drop index partiel
DROP INDEX IF EXISTS "idx_student_signup_link_reminder";

-- 4. Drop colonnes Phase 3
ALTER TABLE "StudentSignupLink"
    DROP COLUMN IF EXISTS "expiryReminderSent",
    DROP COLUMN IF EXISTS "customWelcomeMessage";
