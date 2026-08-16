-- ============================================================
-- Rollback 000003 — Suppression des index
-- ============================================================
-- On drop uniquement les index non-uniques créés par Prisma
-- (suffixe _idx), plus les index uniques (suffixe _key).
-- Les index implicites des PK ne sont PAS touchés.
-- ============================================================

DO $$
DECLARE
  i text;
  tbl text;
BEGIN
  FOR i, tbl IN
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND (indexname LIKE '%_idx' OR indexname LIKE '%_key')
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I;', i);
  END LOOP;
END
$$;
