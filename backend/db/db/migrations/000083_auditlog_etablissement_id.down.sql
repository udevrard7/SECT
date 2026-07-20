-- ════════════════════════════════════════════════════════════════════════════
-- 000083 — DOWN : revert AuditLog etablissementId + reason + RLS tightening
-- (SECT-ETABLISSEMENT-AUDIT-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Drop l'index idx_auditlog_etab_created
-- 2. Drop + recréer la policy AuditLog_select (version 000024 originale avec le
--    leak "userId IS NULL" — restauré pour backward compat du rollback).
-- 3. Drop les 2 colonnes etablissementId + reason (cascade sur l'index déjà droppé).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Drop l'index partiel
DROP INDEX IF EXISTS "idx_auditlog_etab_created";

-- 2. Restaurer la policy AuditLog_select (version 000024 — avec le leak)
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
CREATE POLICY "AuditLog_select" ON "AuditLog" FOR SELECT TO PUBLIC USING (
  is_admin()
  OR ("userId" = current_user_id())
  OR (is_responsable() AND ("userId" = current_user_id() OR ("userId" IS NOT NULL AND user_in_my_etab("userId")) OR "userId" IS NULL))
);

-- 3. Drop les 2 colonnes (cascade implicite sur les contraintes FK + index restants)
ALTER TABLE "AuditLog"
    DROP COLUMN IF EXISTS "etablissementId",
    DROP COLUMN IF EXISTS "reason";

-- Note : aucun GRANT à reverting — les grants de table héritent des defaults
-- (sect_app + neondb_owner) et ne dépendent pas des colonnes.
