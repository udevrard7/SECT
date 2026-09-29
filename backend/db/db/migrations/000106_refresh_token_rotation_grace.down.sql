-- ============================================================
-- Migration 000106 (DOWN) — annule la rotation avec grâce
-- ============================================================
-- Retour au schéma 000105 : supprime la fonction, l'index et la colonne
-- rotatedAt. ATTENTION : les tokens déjà « tournés » (rotatedAt posé) perdent
-- leur marque de consommation — ils redeviennent « actifs » au sens de
-- revoke_refresh_token_by_hash_if_active (revokedAt IS NULL). Rollback à ne
-- jouer que conscient de cet effet.
-- ============================================================

DROP INDEX IF EXISTS "RefreshToken_rotatedAt_idx";
DROP FUNCTION IF EXISTS public.rotate_refresh_token(text, int);
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "rotatedAt";
