-- Rollback 000094
DROP POLICY IF EXISTS "NotificationAdmin_update_self" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_modify_system" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_select" ON "NotificationAdmin";
