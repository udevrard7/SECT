-- ============================================================
-- Migration 000008 — Table RefreshToken
-- ============================================================
-- Refresh tokens pour le backend Go (auth native JWT).
-- Access token = 15 min (stateless, JWT HMAC-SHA256)
-- Refresh token = 7 jours (stateful, stocké hashé en DB)
--
-- Stratégie :
-- - Le refresh token est un CUID aléatoire de 64 chars (crypto/rand)
-- - On stocke uniquement le HASH SHA-256 du token en DB (jamais le token en clair)
-- - À chaque /refresh, on vérifie le hash + expiration + non-révoqué
-- - /logout révoque le refresh token (revokedAt = now)
-- - Nettoyage périodique possible via cron (delete expiresAt < now)
-- ============================================================

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- Index pour la recherche par hash (login du refresh)
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- Index pour lister/cleaner les tokens d'un user
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- Index pour le nettoyage périodique des tokens expirés
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- FK vers User
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- RLS pour RefreshToken (l'utilisateur ne voit que ses propres tokens)
-- ============================================================
-- Note : la table est surtout manipulée par le backend (set_config row_security = off
-- pendant les opérations d'auth), mais on active RLS pour la défense en profondeur.

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;

CREATE POLICY "RefreshToken_select_self" ON "RefreshToken"
    FOR SELECT TO neondb_owner
    USING ("userId" = current_user_id());

CREATE POLICY "RefreshToken_modify_self" ON "RefreshToken"
    FOR ALL TO neondb_owner
    USING ("userId" = current_user_id())
    WITH CHECK ("userId" = current_user_id());
