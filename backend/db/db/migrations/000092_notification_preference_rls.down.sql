-- Rollback 000092 : supprime les policies (réintroduit le bug deny-by-default).
DROP POLICY IF EXISTS "NotificationPreference_select" ON "NotificationPreference";
DROP POLICY IF EXISTS "NotificationPreference_modify" ON "NotificationPreference";
