-- ============================================================
-- Migration 000106 — Rotation de refresh token avec grâce (SESSION-TIMEOUT-1)
-- ============================================================
-- PROBLÈME : « Timeout de session » — déconnexion d'utilisateurs ACTIFS.
--
-- Le refresh token était à rotation STRICTE single-use
-- (revoke_refresh_token_by_hash_if_active) : dès qu'un POST /api/auth/refresh
-- était traité, l'ancien token était révoqué. Si la réponse HTTP était perdue
-- (timeout client 12s pendant un cold start Render de 30-50s, 502 passager,
-- coupure réseau) OU si deux onglets rafraîchissaient simultanément le même
-- token, le navigateur conservait un token déjà consommé → au check suivant :
-- 401 « déjà utilisé » → suppression des cookies → DÉCONNEXION en pleine
-- utilisation.
--
-- FIX : distinguer la CONSOMMATION par rotation (rotatedAt) de la RÉVOCATION
-- administrative (revokedAt : logout, change-password). Un token déjà « tourné »
-- reste acceptable pendant une fenêtre de grâce (60 s par défaut) :
--   - replay multi-onglets quasi-simultané → accepté
--   - retry réseau après réponse perdue → accepté
--   - replay au-delà de la grâce → refusé (protection replay)
--   - revokedAt (logout / change-password) → refusé immédiatement, sans grâce
--
-- La fonction rotate_refresh_token(p_hash, p_grace_seconds) fait tout en un
-- seul UPDATE atomique (CTE verrouillante FOR UPDATE) et retourne
-- prev_rotated_at : NULL = première rotation (flux normal), non-NULL = replay
-- dans la grâce (journalisé côté Go comme TOKEN_REFRESH_GRACE pour détection
-- d'anomalie).
--
-- NB : revoke_refresh_token_by_hash_if_active est conservée (aucun appelant Go
-- après ce changement, mais préservée pour tout outil externe / rollback simple).
-- ============================================================

-- 1. Colonne rotatedAt (NULL = jamais consommé par rotation)
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);

-- 2. Fonction atomique de rotation avec grâce
CREATE OR REPLACE FUNCTION public.rotate_refresh_token(p_hash text, p_grace_seconds int)
RETURNS TABLE (
    rt_id text,
    rt_user_id text,
    rt_token_hash text,
    rt_expires_at timestamp without time zone,
    rt_revoked_at timestamp without time zone,
    rt_rotated_at timestamp without time zone,
    rt_prev_rotated_at timestamp without time zone,
    rt_created_at timestamp without time zone,
    rt_user_agent text,
    rt_ip text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- CTE target : verrouille la row (FOR UPDATE) pour sérialiser les appels
    -- concurrents (multi-onglets). En READ COMMITTED, un 2e appelant bloqué
    -- relit l'état COMMITTÉ après déverrouillage → la grâce s'applique sur le
    -- rotatedAt posé par le 1er appelant.
    RETURN QUERY
    WITH target AS (
        SELECT "id", "rotatedAt"
        FROM "RefreshToken"
        WHERE "tokenHash" = p_hash
        FOR UPDATE
    ),
    updated AS (
        UPDATE "RefreshToken" rt
        SET "rotatedAt" = CURRENT_TIMESTAMP
        FROM target
        WHERE rt."id" = target."id"
          AND rt."revokedAt" IS NULL
          AND (
                target."rotatedAt" IS NULL
                OR target."rotatedAt" > CURRENT_TIMESTAMP - make_interval(secs => p_grace_seconds)
          )
        RETURNING rt."id", rt."userId", rt."tokenHash", rt."expiresAt", rt."revokedAt",
                  rt."rotatedAt", target."rotatedAt" AS prev_rotated,
                  rt."createdAt", rt."userAgent", rt."ip"
    )
    SELECT * FROM updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rotate_refresh_token(text, int) TO PUBLIC;

-- 3. Index pour le nettoyage périodique des tokens tournés hors grâce
--    (les rows rotatedAt < now - 7j ne servent plus jamais).
CREATE INDEX "RefreshToken_rotatedAt_idx" ON "RefreshToken"("rotatedAt");
