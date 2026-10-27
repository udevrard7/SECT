-- ============================================================
-- Migration 000141 — Login matricule robuste + canal Instagram
-- (SECT-LOGIN-MATRICULE-1 + SECT-NOTIF-STUDENT-1)
-- ============================================================
-- PARTIE A — SECT-LOGIN-MATRICULE-1 (connexion étudiant par matricule) :
--   find_user_for_auth / find_users_for_auth v2 — le lookup matricule est
--   désormais INSENSIBLE À LA CASSE et aux espaces parasites :
--     lower(btrim("matricule")) = lower(btrim(p_identifier))
--   Avant : "matricule" = p_identifier strict → un matricule saisi en
--   minuscules (ou copié-collé avec espace final) échouait alors que la
--   fonction « savait » gérer le matricule. Le lookup email gagne le
--   même btrim (lower était déjà appliqué).
--   + index d'expression lower(btrim(...)) pour matricule ET email :
--   les lookups de login ne seq-scan plus la table User.
--
-- PARTIE B — SECT-NOTIF-STUDENT-1 (notifications étudiantes multi-canaux) :
--   "User"."instagram" TEXT NULL — handle Instagram de l'étudiant
--   (sans @), renseigné en self-service via PATCH /api/users/me.
--   "NotificationPreference"."instagramEnabled" BOOLEAN NOT NULL
--   DEFAULT true — opt-out par catégorie, même sémantique que
--   pushEnabled/emailEnabled.
--
-- Sécurité : les policies User_update (self : id = current_user_id())
-- couvrent la nouvelle colonne automatiquement (policies par ligne).
-- Le handle Instagram est une donnée non sensible fournie volontairement
-- par l'étudiant pour recevoir les annonces pédagogiques.
--
-- Leçons répercutées : ASSERTs post-migration (000122) ; down intégral.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- PARTIE A — Login : fonctions v2 (trim + insensible casse) + index
-- ═══════════════════════════════════════════════════════════════

-- Index d'expression pour les lookups de login (matricule d'abord,
-- email en filet de sécurité — l'index unique partiel email/etab
-- ne couvre pas lower(btrim(email))).
CREATE INDEX IF NOT EXISTS "User_matricule_lower_btrim_idx"
        ON "User" (lower(btrim("matricule")))
        WHERE "matricule" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_email_lower_btrim_idx"
        ON "User" (lower(btrim("email")));

-- find_user_for_auth v2 — même contrat (14 colonnes, ordre = scanAuthUser),
-- matching robuste.
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
    IF position('@' in btrim(p_identifier)) > 0 THEN
        RETURN QUERY
            SELECT "id", "email", "name", "password", "role"::text,
                   "etablissementId", "filiereId", "image", "actif",
                   "mustChangePwd", "niveau"::text, "loginAttempts", "lockedUntil",
                   "derniereConnexion"
            FROM "User" WHERE lower(btrim("email")) = lower(btrim(p_identifier));
    ELSE
        RETURN QUERY
            SELECT "id", "email", "name", "password", "role"::text,
                   "etablissementId", "filiereId", "image", "actif",
                   "mustChangePwd", "niveau"::text, "loginAttempts", "lockedUntil",
                   "derniereConnexion"
            FROM "User" WHERE lower(btrim("matricule")) = lower(btrim(p_identifier));
    END IF;
END;
$$;

-- find_users_for_auth v2 — multi-comptes B2C, même matching robuste.
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
    IF position('@' in btrim(p_identifier)) > 0 THEN
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE lower(btrim(u."email")) = lower(btrim(p_identifier))
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    ELSE
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE lower(btrim(u."matricule")) = lower(btrim(p_identifier))
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    END IF;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- PARTIE B — Notifications étudiantes : colonnes instagram
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "instagram" TEXT;

ALTER TABLE "NotificationPreference"
        ADD COLUMN IF NOT EXISTS "instagramEnabled" BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- ASSERTs post-migration (l'échec d'un ASSERT fait échouer la
-- migration — défense contre un apply partiel, pattern 000122).
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'User'
            AND column_name = 'instagram'
            AND data_type = 'text') = 1,
         'User.instagram doit exister en TEXT';
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'NotificationPreference'
            AND column_name = 'instagramEnabled'
            AND data_type = 'boolean') = 1,
         'NotificationPreference.instagramEnabled doit exister en BOOLEAN';
  -- find_user_for_auth v2 : le matching matricule doit être insensible casse.
  ASSERT position('lower(btrim(' IN (SELECT pg_get_functiondef(oid) FROM pg_proc
          WHERE proname = 'find_user_for_auth' LIMIT 1)) > 0,
         'find_user_for_auth doit matcher via lower(btrim(...))';
END $$;
