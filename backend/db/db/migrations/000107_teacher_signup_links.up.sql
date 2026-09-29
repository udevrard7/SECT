-- ════════════════════════════════════════════════════════════════════════════
-- 000107 — TeacherSignupLink : lien d'inscription direct enseignant
-- (SECT-TEACHER-REG-LINK-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE : réplication du pattern « Créer un lien d'inscription » de la page
-- /etudiants (StudentSignupLink, migrations 000079/000080/000081) pour la page
-- /enseignants. Un RESPONSABLE génère un lien d'inscription enseignant, le
-- partage (WhatsApp, email, QR code), les enseignants s'auto-onboardent via
-- /inscription-enseignant?token=xxx.
--
-- DIFFÉRENCES vs StudentSignupLink :
--   - Rôle forcé ENSEIGNANT (créé via accept_teacher_signup)
--   - PAS de filiereId/niveau pré-assignés (les affectations filières des
--     enseignants se gèrent APRÈS embauche via /api/affectations — une filière
--     n'a pas de sens au moment de l'inscription, contrairement aux étudiants)
--   - PAS de requireMatricule (les enseignants n'ont pas de matricule)
--   - Création réservée RESPONSABLE/ADMIN (un ENSEIGNANT ne peut pas inviter
--     d'autres enseignants — cohérent avec POST /api/invitations qui exige
--     RequireRole("RESPONSABLE", "ADMIN"))
--   - Gardé : emailDomainRestriction (B2B), customWelcomeMessage (email),
--     maxUses, TTL 30j personnalisable, expiryReminderSent (worker), stats
--
-- SÉCURITÉ (clone de 000079/000080/000081) :
--   - Token 32 chars hex (16 octets crypto/rand côté Go usecase)
--   - 3 fonctions SECURITY DEFINER (verify + complete + expire) → bypass RLS
--     car le token EST l'authentification
--   - accept_teacher_signup atomique : crée User ENSEIGNANT + incrémente useCount
--   - TeacherRegistrationEvent : audit des tentatives (INSERT via fonction
--     SECURITY DEFINER uniquement — même design que RegistrationEvent)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Table TeacherSignupLink ───
CREATE TABLE IF NOT EXISTS "TeacherSignupLink" (
    "id" text PRIMARY KEY,
    "token" text UNIQUE NOT NULL,
    "etablissementId" text NOT NULL REFERENCES "Etablissement"("id") ON DELETE CASCADE,
    "createdById" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "expiresAt" timestamp NOT NULL,
    "maxUses" int,  -- NULL = illimité
    "useCount" int NOT NULL DEFAULT 0,
    "actif" boolean NOT NULL DEFAULT true,
    "label" text,  -- libellé optionnel (ex: "Vacataires Maths 2026")
    "emailDomainRestriction" text,  -- B2B — ex: "univ-ci.edu" (NULL = tous)
    "customWelcomeMessage" text,    -- message perso injecté dans l'email de bienvenue
    "expiryReminderSent" boolean NOT NULL DEFAULT false,  -- worker reminder 24h (anti-spam)
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" timestamp
);

-- Index pour lookup par token (endpoint public, haute fréquence)
CREATE INDEX IF NOT EXISTS "idx_teacher_signup_link_token" ON "TeacherSignupLink"("token") WHERE "deletedAt" IS NULL;
-- Index pour lister les liens d'un créateur (endpoint auth, dashboard)
CREATE INDEX IF NOT EXISTS "idx_teacher_signup_link_created_by" ON "TeacherSignupLink"("createdById") WHERE "deletedAt" IS NULL;
-- Index partiel pour le worker de reminder (liens actifs, reminder pas envoyé)
CREATE INDEX IF NOT EXISTS "idx_teacher_signup_link_reminder"
    ON "TeacherSignupLink"("expiresAt")
    WHERE "actif" = true AND "deletedAt" IS NULL AND "expiryReminderSent" = false;

-- ─── 2. Activer RLS ───
ALTER TABLE "TeacherSignupLink" ENABLE ROW LEVEL SECURITY;

-- ─── 3. Policies RLS ───
-- select : owner OR RESPONSABLE de l'étab OR admin (l'ADMIN voit tout pour
-- support/debug ; le RESPONSABLE voit les liens de son étab — y compris ceux
-- créés par d'autres responsables du même étab)
DROP POLICY IF EXISTS "TeacherSignupLink_select" ON "TeacherSignupLink";
CREATE POLICY "TeacherSignupLink_select" ON "TeacherSignupLink" FOR SELECT TO PUBLIC
    USING (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- insert : RESPONSABLE dans son étab OR ADMIN (PAS les ENSEIGNANT — cohérent
-- avec POST /api/invitations ; le usecase force etablissementId = celui du
-- créateur et createdById = currentUser, defense in depth côté SQL aussi)
DROP POLICY IF EXISTS "TeacherSignupLink_insert" ON "TeacherSignupLink";
CREATE POLICY "TeacherSignupLink_insert" ON "TeacherSignupLink" FOR INSERT TO PUBLIC
    WITH CHECK (
        ("createdById" = current_user_id())
        AND (
            (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            OR is_admin()
        )
    );

-- update : owner OR RESPONSABLE de l'étab OR ADMIN
DROP POLICY IF EXISTS "TeacherSignupLink_update" ON "TeacherSignupLink";
CREATE POLICY "TeacherSignupLink_update" ON "TeacherSignupLink" FOR UPDATE TO PUBLIC
    USING (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- delete : owner OR RESPONSABLE de l'étab OR ADMIN
DROP POLICY IF EXISTS "TeacherSignupLink_delete" ON "TeacherSignupLink";
CREATE POLICY "TeacherSignupLink_delete" ON "TeacherSignupLink" FOR DELETE TO PUBLIC
    USING (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- ─── 4. Grants ───
GRANT SELECT, INSERT, UPDATE, DELETE ON "TeacherSignupLink" TO PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Fonction find_teacher_signup_link_by_token(p_token text)
-- ════════════════════════════════════════════════════════════════════════════
-- Endpoint public /verify : valide un token + retourne le contexte (étab,
-- créateur) pour pré-remplir le formulaire public d'inscription enseignant.
-- Bypass RLS car le token EST l'authentification.
--
-- 15 colonnes retournées (ordre figé — le repo Go scanne par position) :
--  1. link_id, 2. link_token, 3. link_etablissement_id, 4. link_created_by_id,
--  5. link_expires_at, 6. link_max_uses, 7. link_use_count, 8. link_actif,
--  9. link_label, 10. link_created_at, 11. link_email_domain_restriction,
-- 12. link_custom_welcome_message, 13. link_expiry_reminder_sent,
-- 14. etab_nom / 15. etab_type / 16. etab_ville / 17. creator_name
CREATE OR REPLACE FUNCTION public.find_teacher_signup_link_by_token(p_token text)
RETURNS TABLE (
    link_id text,
    link_token text,
    link_etablissement_id text,
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
    creator_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
        SELECT s."id", s."token", s."etablissementId", s."createdById",
               s."expiresAt", s."maxUses", s."useCount", s."actif",
               s."label", s."createdAt",
               s."emailDomainRestriction", s."customWelcomeMessage",
               s."expiryReminderSent",
               e."nom", e."type"::text, e."ville",
               u."name"
        FROM "TeacherSignupLink" s
        LEFT JOIN "Etablissement" e ON e."id" = s."etablissementId"
        LEFT JOIN "User" u ON u."id" = s."createdById"
        WHERE s."token" = p_token
          AND s."deletedAt" IS NULL;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Fonction accept_teacher_signup(p_token, p_email, p_password, p_name)
-- ════════════════════════════════════════════════════════════════════════════
-- Endpoint public /complete : crée le User ENSEIGNANT + incrémente useCount
-- atomiquement. Retourne le User créé + un code de succès/erreur métier.
--
-- RÈGLES vérifiées côté SQL (defense in depth, le usecase vérifie aussi) :
--   - Token existe + non supprimé
--   - link.actif = true
--   - link.expiresAt > now()
--   - link.maxUses IS NULL OR link.useCount < link.maxUses
--   - link.emailDomainRestriction IS NULL OR email ~*@domaine
--   - email non déjà utilisé (unique_violation catch)
--
-- Codes de retour (o_code) :
--   'OK'              — inscription réussie
--   'NOT_FOUND'       — token inconnu
--   'INACTIVE'        — lien révoqué (actif=false)
--   'EXPIRED'         — lien expiré
--   'QUOTA_EXCEEDED'  — maxUses atteint
--   'DOMAIN_NOT_ALLOWED' — email hors du domaine autorisé
--   'USER_EXISTS'     — email déjà utilisé
--
-- NB : PAS de matricule ni filière/niveau pour les enseignants (rattachement
-- filières via /api/affectations APRÈS l'embauche par le RESPONSABLE).
CREATE OR REPLACE FUNCTION public.accept_teacher_signup(
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
    o_etablissement_nom text,
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
BEGIN
    -- 1. Charger le lien par token.
    SELECT * INTO v_link FROM "TeacherSignupLink" WHERE "token" = p_token AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Lien introuvable ou supprimé'::text;
        RETURN;
    END IF;

    -- 2. Vérifier état.
    IF v_link."actif" = false THEN
        RETURN QUERY SELECT 'INACTIVE'::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Ce lien d''inscription a été révoqué'::text;
        RETURN;
    END IF;
    IF v_link."expiresAt" < now() THEN
        RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Ce lien d''inscription a expiré'::text;
        RETURN;
    END IF;
    IF v_link."maxUses" IS NOT NULL AND v_link."useCount" >= v_link."maxUses" THEN
        RETURN QUERY SELECT 'QUOTA_EXCEEDED'::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Le nombre maximum d''inscriptions pour ce lien a été atteint'::text;
        RETURN;
    END IF;

    -- 3. Vérifier la restriction de domaine email (B2B — defense in depth,
    --    le usecase Go vérifie aussi avant l'appel SQL).
    IF v_link."emailDomainRestriction" IS NOT NULL AND v_link."emailDomainRestriction" <> '' THEN
        IF lower(p_email) NOT LIKE '%@' || lower(v_link."emailDomainRestriction") THEN
            RETURN QUERY SELECT 'DOMAIN_NOT_ALLOWED'::text, NULL::text, NULL::text, NULL::text, NULL::text,
                           'Cet email n''appartient pas au domaine autorisé : @' || v_link."emailDomainRestriction"::text;
            RETURN;
        END IF;
    END IF;

    -- 4. Créer le User ENSEIGNANT (sans filière/niveau/matricule).
    BEGIN
        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId",
                            "image", "actif", "mustChangePwd",
                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
        VALUES (v_user_id, lower(p_email), p_name, p_password, 'ENSEIGNANT'::"Role",
                v_link."etablissementId",
                NULL, true, false,
                0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT 'USER_EXISTS'::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Un compte existe déjà avec cet email'::text;
        RETURN;
    END;

    -- 5. Incrémenter useCount atomiquement.
    UPDATE "TeacherSignupLink"
        SET "useCount" = "useCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = v_link."id";

    -- 6. Retourner succès + contexte pour email de bienvenue.
    RETURN QUERY
        SELECT 'OK'::text,
               u."id", u."email", u."name",
               e."nom",
               'Inscription réussie. Vous pouvez vous connecter.'::text
        FROM "User" u
        LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
        WHERE u."id" = v_user_id;
END;
$$;

-- ─── 7. Grants EXECUTE sur les fonctions publiques ───
GRANT EXECUTE ON FUNCTION public.find_teacher_signup_link_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_teacher_signup(text, text, text, text) TO PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Table TeacherRegistrationEvent + log_teacher_registration_event
--    (clone de RegistrationEvent / log_registration_event — migration 000080)
-- ════════════════════════════════════════════════════════════════════════════
-- Audit des tentatives d'inscription via lien enseignant (succès + échec).
-- Consommé par GET /api/teacher-signup-links/stats (taux succès, échecs par code).
CREATE TABLE IF NOT EXISTS "TeacherRegistrationEvent" (
    "id" text PRIMARY KEY,
    "linkId" text NOT NULL REFERENCES "TeacherSignupLink"("id") ON DELETE CASCADE,
    "userId" text REFERENCES "User"("id") ON DELETE SET NULL,
    "email" text NOT NULL,
    "ip" text,
    "userAgent" text,
    "success" boolean NOT NULL,
    "code" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_teacher_registration_event_link"
    ON "TeacherRegistrationEvent"("linkId");
CREATE INDEX IF NOT EXISTS "idx_teacher_registration_event_created"
    ON "TeacherRegistrationEvent"("createdAt" DESC);

-- RLS : SELECT ouvert au owner du link / admin / responsable du même étab.
-- INSERT/UPDATE/DELETE uniquement via log_teacher_registration_event
-- (SECURITY DEFINER — les clients ne peuvent pas écrire directement).
ALTER TABLE "TeacherRegistrationEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TeacherRegistrationEvent_select" ON "TeacherRegistrationEvent";
CREATE POLICY "TeacherRegistrationEvent_select" ON "TeacherRegistrationEvent" FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM "TeacherSignupLink" s
            WHERE s."id" = "TeacherRegistrationEvent"."linkId"
              AND (
                s."createdById" = current_user_id()
                OR is_admin()
                OR (is_responsable() AND s."etablissementId" = current_etablissement_id())
              )
        )
    );

GRANT SELECT ON "TeacherRegistrationEvent" TO PUBLIC;

-- log_teacher_registration_event — INSERT d'audit depuis les endpoints publics
-- (bypass RLS — SECURITY DEFINER). Non bloquant côté usecase.
CREATE OR REPLACE FUNCTION public.log_teacher_registration_event(
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
    INSERT INTO "TeacherRegistrationEvent" ("id", "linkId", "userId", "email", "ip", "userAgent", "success", "code")
    VALUES (gen_random_uuid()::text, p_link_id, p_user_id, lower(p_email), p_ip, p_user_agent, p_success, p_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_teacher_registration_event(text, text, text, text, text, boolean, text) TO PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Fonction expire_teacher_signup_links() — appelée par ExpireWorker
--    (clone de expire_student_signup_links — migration 000081)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.expire_teacher_signup_links()
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
    FROM "TeacherSignupLink"
    WHERE "expiresAt" < NOW()
      AND "actif" = true
      AND "deletedAt" IS NULL;

    -- Si rien à expirer → retourne un result set vide.
    IF v_expired_ids IS NULL OR array_length(v_expired_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    -- 2. Marquer actif=false (UPDATE atomique).
    UPDATE "TeacherSignupLink"
    SET "actif" = false, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ANY(v_expired_ids);

    -- 3. Retourner les détails pour email (optionnel — debug).
    RETURN QUERY
        SELECT s."id", s."token", s."label",
               u."email", u."name",
               e."nom", s."expiresAt"
        FROM "TeacherSignupLink" s
        LEFT JOIN "User" u ON u."id" = s."createdById"
        LEFT JOIN "Etablissement" e ON e."id" = s."etablissementId"
        WHERE s."id" = ANY(v_expired_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_teacher_signup_links() TO PUBLIC;
