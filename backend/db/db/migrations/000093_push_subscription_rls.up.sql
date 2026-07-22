-- ════════════════════════════════════════════════════════════════════════════
-- 000093 — PushSubscription : unique constraint + RLS policies (SECT-NOTIF-VAPID-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. UNIQUE constraint (userId, endpoint) pour l'upsert ON CONFLICT.
--    Sans ça, l'INSERT duplique les subscriptions à chaque re-abonnement.
--
-- 2. RLS policies : user voit/modifie SES subscriptions uniquement.
--    Avant : RLS pas activée sur PushSubscription → tout le monde pouvait
--    lire toutes les subscriptions (fuite de données).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Unique constraint pour l'upsert
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_userId_endpoint_key"
  ON "PushSubscription" ("userId", "endpoint");

-- 2. RLS policies
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PushSubscription_select" ON "PushSubscription";
CREATE POLICY "PushSubscription_select" ON "PushSubscription"
  FOR SELECT TO PUBLIC USING ("userId" = current_user_id());

DROP POLICY IF EXISTS "PushSubscription_modify" ON "PushSubscription";
CREATE POLICY "PushSubscription_modify" ON "PushSubscription"
  FOR ALL TO PUBLIC
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- 3. Bypass system pour le dispatcher (sendPush lit les subs via le pool
-- sans claims RLS — le dispatcher utilise SystemClaims qui a is_system()).
-- Le dispatcher ne fait pas de SELECT via RLS (il utilise d.pool.Query
-- directement), donc on a aussi besoin d'une policy is_system().
DROP POLICY IF EXISTS "PushSubscription_select_system" ON "PushSubscription";
CREATE POLICY "PushSubscription_select_system" ON "PushSubscription"
  FOR SELECT TO PUBLIC USING (is_system());
