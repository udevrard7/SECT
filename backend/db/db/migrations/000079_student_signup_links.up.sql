-- ════════════════════════════════════════════════════════════════════════════
-- 000079 — StudentSignupLink : lien d'inscription direct étudiant (SECT-REG-LINK-B2C-MVP-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE : Phase 1 MVP B2C — un prof Solo/Premium ou un RESPONSABLE génère
-- un lien d'inscription direct, le partage (WhatsApp, email, QR code projeté),
-- les étudiants s'auto-onboardent via /inscription?token=xxx. La DB se remplit
-- automatiquement, sans saisie manuelle ni import CSV.
--
-- DIFFÉRENCES vs Invitation (000020/000021) :
--   - Pas d'email requis à la génération (l'étudiant saisit son email à l'inscription)
--   - Rôle forcé ETUDIANT
--   - Étab/filière/niveau pré-assignés (du créateur)
--   - TTL 30 jours (vs 7j pour invitation — pas d'email, partage manuel)
--   - maxUses NULL = illimité (MVP Phase 1 ; quota check via plan en Phase 2)
--   - useCount pour stats
--
-- SÉCURITÉ :
--   - Token 32 chars hex (16 octets crypto/rand côté Go usecase)
--   - 2 fonctions SECURITY DEFINER pour endpoints publics (verify + complete)
--     → bypass RLS car le token EST l'authentification
--   - accept_student_signup atomique : crée User + incrémente useCount
--   - Réutilise user_exists_by_email (000021) pour anti-double-inscription
--   - Réutilise la logique matricule FIL/LJ/YY/NNN (clone de accept_invitation)
--
-- RLS :
--   - select : owner (createdById) OR is_admin()
--   - insert/update/delete : RESPONSABLE dans son étab OR ENSEIGNANT dans étab
--     PERSONNEL OR is_admin() (réutilise is_enseignant_in_personal_etab)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Table StudentSignupLink ───
CREATE TABLE IF NOT EXISTS "StudentSignupLink" (
    "id" text PRIMARY KEY,
    "token" text UNIQUE NOT NULL,
    "etablissementId" text NOT NULL REFERENCES "Etablissement"("id") ON DELETE CASCADE,
    "filiereId" text REFERENCES "Filiere"("id") ON DELETE SET NULL,
    "niveau" "NiveauEtude",
    "createdById" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "expiresAt" timestamp NOT NULL,
    "maxUses" int,  -- NULL = illimité (MVP Phase 1)
    "useCount" int NOT NULL DEFAULT 0,
    "actif" boolean NOT NULL DEFAULT true,
    "label" text,  -- libellé optionnel (ex: "Promo L1 2026")
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" timestamp
);

-- Index pour lookup par token (endpoint public, haute fréquence)
CREATE INDEX IF NOT EXISTS "idx_student_signup_link_token" ON "StudentSignupLink"("token") WHERE "deletedAt" IS NULL;
-- Index pour lister les liens d'un créateur (endpoint auth, dashboard)
CREATE INDEX IF NOT EXISTS "idx_student_signup_link_created_by" ON "StudentSignupLink"("createdById") WHERE "deletedAt" IS NULL;

-- ─── 2. Activer RLS ───
ALTER TABLE "StudentSignupLink" ENABLE ROW LEVEL SECURITY;

-- ─── 3. Policies RLS ───
-- select : owner OR admin (les RESPONSABLE/ENSEIGNANT voient leurs propres liens ;
-- l'ADMIN voit tout pour support/debug)
DROP POLICY IF EXISTS "StudentSignupLink_select" ON "StudentSignupLink";
CREATE POLICY "StudentSignupLink_select" ON "StudentSignupLink" FOR SELECT TO PUBLIC
    USING (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- insert : RESPONSABLE dans son étab OR ENSEIGNANT dans étab PERSONNEL OR ADMIN
-- (le usecase force etablissementId = celui du créateur, et createdById = currentUser)
DROP POLICY IF EXISTS "StudentSignupLink_insert" ON "StudentSignupLink";
CREATE POLICY "StudentSignupLink_insert" ON "StudentSignupLink" FOR INSERT TO PUBLIC
    WITH CHECK (
        ("createdById" = current_user_id())
        AND (
            (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            OR (is_enseignant_in_personal_etab() AND ("etablissementId" = current_etablissement_id()))
            OR is_admin()
        )
    );

-- update : owner OR RESPONSABLE de l'étab OR ADMIN
DROP POLICY IF EXISTS "StudentSignupLink_update" ON "StudentSignupLink";
CREATE POLICY "StudentSignupLink_update" ON "StudentSignupLink" FOR UPDATE TO PUBLIC
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
DROP POLICY IF EXISTS "StudentSignupLink_delete" ON "StudentSignupLink";
CREATE POLICY "StudentSignupLink_delete" ON "StudentSignupLink" FOR DELETE TO PUBLIC
    USING (
        ("createdById" = current_user_id())
        OR is_admin()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- ─── 4. Grants ───
GRANT SELECT, INSERT, UPDATE, DELETE ON "StudentSignupLink" TO PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Fonction find_student_signup_link_by_token(p_token text)
-- ════════════════════════════════════════════════════════════════════════════
-- Endpoint public /verify : valide un token + retourne le contexte (étab, filière,
-- créateur) pour pré-remplir le formulaire public d'inscription.
-- Bypass RLS car le token EST l'authentification.
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

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Fonction accept_student_signup(p_token, p_email, p_password, p_name)
-- ════════════════════════════════════════════════════════════════════════════
-- Endpoint public /complete : crée le User ETUDIANT + incrémente useCount
-- atomiquement. Retourne le User créé + un code de succès/erreur métier.
--
-- RÈGLES vérifiées côté SQL (defense in depth, le usecase vérifie aussi) :
--   - Token existe + non supprimé
--   - link.actif = true
--   - link.expiresAt > now()
--   - link.maxUses IS NULL OR link.useCount < link.maxUses
--   - email non déjà utilisé (unique_violation catch)
--
-- Codes de retour (o_code) :
--   'OK'              — inscription réussie
--   'NOT_FOUND'       — token inconnu
--   'INACTIVE'        — lien révoqué (actif=false)
--   'EXPIRED'         — lien expiré
--   'QUOTA_EXCEEDED'  — maxUses atteint
--
-- Si role=ETUDIANT + filiereId set, génère un matricule FIL/LJ/YY/NNN
-- (clone de accept_invitation, migration 000021).
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
    -- 1. Charger le lien par token.
    SELECT * INTO v_link FROM "StudentSignupLink" WHERE "token" = p_token AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Lien introuvable ou supprimé'::text;
        RETURN;
    END IF;

    -- 2. Vérifier état.
    IF v_link."actif" = false THEN
        RETURN QUERY SELECT 'INACTIVE'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Ce lien d''inscription a été révoqué'::text;
        RETURN;
    END IF;
    IF v_link."expiresAt" < now() THEN
        RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Ce lien d''inscription a expiré'::text;
        RETURN;
    END IF;
    IF v_link."maxUses" IS NOT NULL AND v_link."useCount" >= v_link."maxUses" THEN
        RETURN QUERY SELECT 'QUOTA_EXCEEDED'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Le nombre maximum d''inscriptions pour ce lien a été atteint'::text;
        RETURN;
    END IF;

    -- 3. Générer le matricule si filière set.
    IF v_link."filiereId" IS NOT NULL AND v_link."filiereId" <> '' THEN
        SELECT "code" INTO v_fil_code FROM "Filiere" WHERE "id" = v_link."filiereId";
        IF v_fil_code IS NULL OR v_fil_code = '' THEN
            v_fil_code := 'ETU';
        END IF;
        SELECT count(*)::int INTO v_count FROM "User" WHERE "role" = 'ETUDIANT' AND "filiereId" = v_link."filiereId";
        v_year2 := to_char(now(), 'YY');
        v_matricule := v_fil_code || '/LJ/' || v_year2 || '/' || lpad((v_count + 1)::text, 3, '0');
    END IF;

    -- 4. Créer le User ETUDIANT.
    BEGIN
        INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId", "filiereId",
                            "image", "actif", "mustChangePwd", "matricule", "niveau",
                            "loginAttempts", "lockedUntil", "createdAt", "updatedAt")
        VALUES (v_user_id, lower(p_email), p_name, p_password, 'ETUDIANT'::"Role",
                v_link."etablissementId", v_link."filiereId",
                NULL, true, false, v_matricule, v_link."niveau",
                0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT 'USER_EXISTS'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'Un compte existe déjà avec cet email'::text;
        RETURN;
    END;

    -- 5. Incrémenter useCount atomiquement.
    UPDATE "StudentSignupLink"
        SET "useCount" = "useCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = v_link."id";

    -- 6. Retourner succès + contexte pour email de bienvenue.
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

-- ─── 7. Grants EXECUTE sur les fonctions publiques ───
GRANT EXECUTE ON FUNCTION public.find_student_signup_link_by_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_student_signup(text, text, text, text) TO PUBLIC;
