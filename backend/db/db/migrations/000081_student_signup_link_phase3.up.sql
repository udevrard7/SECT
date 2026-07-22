-- ════════════════════════════════════════════════════════════════════════════
-- 000081 — Phase 3 : expiration auto + reminder 24h + custom welcome message
-- (SECT-REG-LINK-PHASE3-BACKEND-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Ajout colonnes "expiryReminderSent" (anti-spam reminder 24h) +
--    "customWelcomeMessage" (message personnalisé du créateur dans welcome email)
-- 2. Index partiel pour le worker de reminder (liens actifs, expirant dans 24h,
--    reminder pas envoyé) — accélère la query du worker.
-- 3. Fonction expire_student_signup_links() — appelée par ExpireWorker.
--    Marque actif=false les liens expirés. Retourne les détails (optionnel —
--    pour envoi email ultérieur si besoin).
-- 4. Étendre find_student_signup_link_by_token : retourne customWelcomeMessage
--    + expiryReminderSent (2 nouvelles colonnes OUT, avant etab_nom).
--
-- SÉCURITÉ :
--   - expire_student_signup_links est SECURITY DEFINER car le worker tourne avec
--     un pool connection sans claims RLS (les workers utilisent SystemClaims).
--   - La fonction effectue un UPDATE atomique + retourne les lignes affectées
--     via CTE (SELECT array_agg + UPDATE WHERE id = ANY + SELECT final).
--   - expiryReminderSent est un simple flag boolean, jamais exposé en clair aux
--     étudiants (uniquement utilisé par le worker).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Nouvelles colonnes sur StudentSignupLink ───
ALTER TABLE "StudentSignupLink"
    ADD COLUMN IF NOT EXISTS "expiryReminderSent" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "customWelcomeMessage" text;

-- Index partiel pour le worker de reminder (liens actifs, reminder pas envoyé).
-- Le worker scanne cette table toutes les 1h — l'accélération est utile si la
-- table grossit (1000+ liens).
CREATE INDEX IF NOT EXISTS "idx_student_signup_link_reminder"
    ON "StudentSignupLink"("expiresAt")
    WHERE "actif" = true AND "deletedAt" IS NULL AND "expiryReminderSent" = false;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Fonction expire_student_signup_links()
-- ════════════════════════════════════════════════════════════════════════════
-- Marque actif=false les liens dont expiresAt < NOW(). Retourne les liens
-- nouvellement expirés (token + label + creator email + etab nom) pour
-- permettre au worker d'envoyer un email optionnel (non utilisé actuellement).
--
-- Implémentation en 3 étapes (CTE-style via variable PL/pgSQL) :
--   1. SELECT array_agg des IDs à expirer (évite un UPDATE RETURNING + JOIN).
--   2. UPDATE actif=false WHERE id = ANY(v_expired_ids).
--   3. SELECT final avec JOINs User + Etablissement pour les détails email.
CREATE OR REPLACE FUNCTION public.expire_student_signup_links()
RETURNS TABLE (
    o_id text,
    o_token text,
    o_label text,
    o_creator_email text,
    o_creator_name text,
    o_etab_nom text,
    o_expires_at timestamp without time zone
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_ids text[];
BEGIN
    -- 1. Récupérer les IDs à expirer (actif=true, expiresAt<now, pas deleted).
    SELECT array_agg("id") INTO v_expired_ids
    FROM "StudentSignupLink"
    WHERE "expiresAt" < NOW()
      AND "actif" = true
      AND "deletedAt" IS NULL;

    -- Si rien à expirer → retourne un result set vide.
    IF v_expired_ids IS NULL OR array_length(v_expired_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    -- 2. Marquer actif=false (UPDATE atomique).
    UPDATE "StudentSignupLink"
    SET "actif" = false, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ANY(v_expired_ids);

    -- 3. Retourner les détails pour email (optionnel — pas utilisé par le worker
    --    actuellement, mais utile pour debug ou future feature).
    RETURN QUERY
        SELECT s."id", s."token", s."label",
               u."email", u."name",
               e."nom", s."expiresAt"
        FROM "StudentSignupLink" s
        LEFT JOIN "User" u ON u."id" = s."createdById"
        LEFT JOIN "Etablissement" e ON e."id" = s."etablissementId"
        WHERE s."id" = ANY(v_expired_ids);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Étendre find_student_signup_link_by_token
-- ════════════════════════════════════════════════════════════════════════════
-- Ajout de 2 colonnes OUT (link_custom_welcome_message + link_expiry_reminder_sent)
-- placées APRÈS link_email_domain_restriction (13e) et AVANT etab_nom (16e).
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

-- ─── 4. Grants EXECUTE sur les nouvelles fonctions publiques ───
GRANT EXECUTE ON FUNCTION public.find_student_signup_link_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_student_signup_links() TO PUBLIC;

-- Note: accept_student_signup signature unchanged (4 IN, 8 OUT) — pas besoin
-- d'étendre. Le usecase récupère customWelcomeMessage via FindByToken séparément
-- (déjà appelé pour le check quota capitation Phase 2).
