-- ============================================================
-- Migration 000054 — Table PasswordResetToken
-- ============================================================
-- Self-service password reset ("mot de passe oublié").
--
-- Flux :
-- - POST /api/auth/password-reset { email }
--     → find_user_for_auth(email) ; si trouvé, génère un token aléatoire
--       (32 octets, base64url), stocke uniquement le HASH SHA-256 en DB,
--       envoie un email avec un lien {APP_BASE_URL}/reset-password?token=...
-- - POST /api/auth/password-reset/confirm { token, newPassword }
--     → hash le token, récupère la ligne (non expirée, non utilisée),
--       update_password(user, hash), marque le token utilisé (usedAt=now),
--       révoque tous les refresh tokens de l'utilisateur, audit log.
--
-- Sécurité :
-- - Token = 32 octets crypto/rand → base64url (43 chars), ~256 bits d'entropie.
-- - Seul le HASH SHA-256 est stocké (jamais le token en clair).
-- - Expiration : 30 minutes (PasswordResetTokenTTL côté Go).
-- - Usage unique : usedAt NOT NULL après consommation.
-- - Accès via fonctions SECURITY DEFINER (bypass RLS) car l'utilisateur
--   n'est pas authentifié lors du reset (analogie avec RefreshToken).
-- ============================================================

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Index unique sur le hash (lookup lors du confirm)
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- Index pour lister/invalider les tokens d'un user
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- Index pour le nettoyage périodique des tokens expirés
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- FK vers User
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- RLS pour PasswordResetToken (défense en profondeur)
-- ============================================================
-- La table est manipulée via fonctions SECURITY DEFINER (cf. ci-dessous),
-- mais on active RLS par cohérence avec RefreshToken.

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PasswordResetToken_select_self" ON "PasswordResetToken"
    FOR SELECT TO neondb_owner
    USING ("userId" = current_user_id());

CREATE POLICY "PasswordResetToken_modify_self" ON "PasswordResetToken"
    FOR ALL TO neondb_owner
    USING ("userId" = current_user_id())
    WITH CHECK ("userId" = current_user_id());

-- ============================================================
-- Fonctions SECURITY DEFINER (bypass RLS — utilisateur non authentifié)
-- ============================================================

-- 1. create_password_reset_token : insère un nouveau token.
CREATE OR REPLACE FUNCTION public.create_password_reset_token(
    p_id text,
    p_user_id text,
    p_token_hash text,
    p_expires_at timestamp without time zone,
    p_ip text,
    p_user_agent text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt", "ip", "userAgent", "createdAt")
    VALUES (p_id, p_user_id, p_token_hash, p_expires_at, p_ip, p_user_agent, CURRENT_TIMESTAMP);
$$;

-- 2. find_password_reset_token_by_hash : retourne un token non utilisé par son hash.
--    Retourne uniquement les colonnes nécessaires (id, userId, expiresAt, usedAt, createdAt).
--    Si le token n'existe pas ou est déjà utilisé → aucune ligne.
CREATE OR REPLACE FUNCTION public.find_password_reset_token_by_hash(p_token_hash text)
RETURNS TABLE (
    t_id text,
    t_user_id text,
    t_token_hash text,
    t_expires_at timestamp without time zone,
    t_used_at timestamp without time zone,
    t_created_at timestamp without time zone
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "id", "userId", "tokenHash", "expiresAt", "usedAt", "createdAt"
    FROM "PasswordResetToken"
    WHERE "tokenHash" = p_token_hash
      AND "usedAt" IS NULL;
$$;

-- 3. mark_password_reset_token_used : marque un token comme utilisé (usedAt = now).
CREATE OR REPLACE FUNCTION public.mark_password_reset_token_used(p_token_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "PasswordResetToken" SET "usedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_token_id AND "usedAt" IS NULL;
$$;

-- 4. invalidate_user_password_reset_tokens : marque tous les tokens non utilisés
--    d'un utilisateur comme utilisés (defense-in-depth : un token consommé
--    invalide les autres tokens en attente du même utilisateur).
CREATE OR REPLACE FUNCTION public.invalidate_user_password_reset_tokens(p_user_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE "PasswordResetToken" SET "usedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = p_user_id AND "usedAt" IS NULL;
$$;
