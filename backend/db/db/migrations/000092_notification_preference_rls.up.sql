-- ════════════════════════════════════════════════════════════════════════════
-- 000092 — RLS policies pour NotificationPreference (SECT-NOTIF-PREFERENCES-UI-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : RLS était activée sur NotificationPreference (migration 000019) MAIS
-- aucune policy n'avait été créée → deny by default → INSERT/SELECT/UPDATE
-- échouaient silencieusement. Le handler notificationsPreferencesUpdate
-- ignore l'erreur (avec `_ = appdb.WithTx(...)`) → la mutation retournait 200
-- "préférence mise à jour" mais rien n'était persisté en DB.
--
-- Fix : créer 2 policies :
--   1. NotificationPreference_select : user voit SES préférences
--      (userId = current_user_id()).
--   2. NotificationPreference_modify : user crée/modifie SES préférences
--      (userId = current_user_id()).
--
-- Pas de policy pour ADMIN cross-etab (les préférences sont personnelles,
-- pas scopées par établissement).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NotificationPreference_select" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_select" ON "NotificationPreference"
  FOR SELECT TO PUBLIC USING ("userId" = current_user_id());

DROP POLICY IF EXISTS "NotificationPreference_modify" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_modify" ON "NotificationPreference"
  FOR ALL TO PUBLIC
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());
