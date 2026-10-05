-- ============================================================
-- Migration 000133 (DOWN) — Monitoring P5 (ADR-0012).
-- Rollback = revert du code d'abord (handlers/worker/sampler),
-- puis DROP des 2 tables (les données RequestLog sont de la
-- télémétrie jetable ; les règles custom seront perdues —
-- documenté ADR-0012).
-- ============================================================
DROP POLICY IF EXISTS "AlertingRule_select" ON "AlertingRule";
DROP POLICY IF EXISTS "AlertingRule_insert" ON "AlertingRule";
DROP POLICY IF EXISTS "AlertingRule_update" ON "AlertingRule";
DROP POLICY IF EXISTS "AlertingRule_delete" ON "AlertingRule";
DROP POLICY IF EXISTS "RequestLog_insert" ON "RequestLog";
DROP POLICY IF EXISTS "RequestLog_select" ON "RequestLog";
DROP POLICY IF EXISTS "RequestLog_delete" ON "RequestLog";
DROP TABLE IF EXISTS "AlertingRule";
DROP TABLE IF EXISTS "RequestLog";
