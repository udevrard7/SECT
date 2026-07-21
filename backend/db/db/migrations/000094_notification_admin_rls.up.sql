-- ════════════════════════════════════════════════════════════════════════════
-- 000094 — RLS policies NotificationAdmin (SECT-NOTIF-DISPATCHER-1 fix)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : RLS activée sur NotificationAdmin (migration 000018/000019) mais
-- AUCUNE policy créée → deny-by-default → le dispatcher INSERT échoue
-- silencieusement (SystemClaims devrait bypass via is_system(), mais sans
-- policy is_system(), même le system est bloqué).
--
-- Conséquence : 0 ligne en NotificationAdmin → la cloche n'affiche rien,
-- le SSE ne pousse rien, le push ne se déclenche pas.
--
-- Fix : 3 policies :
--   1. select : user voit SES notifs (destinataireId = current_user_id()
--      OR destinataireRole = current_role_claim() OR broadcast NULL/NULL).
--   2. modify_system : is_system() peut INSERT/UPDATE/DELETE (dispatcher).
--   3. update_self : user peut marquer SES notifs comme lues (PATCH /me/{id}).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "NotificationAdmin" ENABLE ROW LEVEL SECURITY;

-- 1. SELECT : user voit ses notifs + broadcasts + notifs pour son rôle
DROP POLICY IF EXISTS "NotificationAdmin_select" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select" ON "NotificationAdmin"
  FOR SELECT TO PUBLIC USING (
    "destinataireId" = current_user_id()
    OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
    OR ("destinataireRole" IS NOT NULL AND "destinataireRole" = current_role_claim())
  );

-- 2. INSERT/UPDATE/DELETE pour le dispatcher (SystemClaims = is_system())
DROP POLICY IF EXISTS "NotificationAdmin_modify_system" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_modify_system" ON "NotificationAdmin"
  FOR ALL TO PUBLIC
  USING (is_system())
  WITH CHECK (is_system());

-- 3. UPDATE pour l'utilisateur (marquer comme lu via PATCH /me/{id})
DROP POLICY IF EXISTS "NotificationAdmin_update_self" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_update_self" ON "NotificationAdmin"
  FOR UPDATE TO PUBLIC
  USING ("destinataireId" = current_user_id());
