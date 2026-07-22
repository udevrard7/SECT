-- Rollback 000093
DROP POLICY IF EXISTS "PushSubscription_select_system" ON "PushSubscription";
DROP POLICY IF EXISTS "PushSubscription_modify" ON "PushSubscription";
DROP POLICY IF EXISTS "PushSubscription_select" ON "PushSubscription";
ALTER TABLE "PushSubscription" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "PushSubscription_userId_endpoint_key";
