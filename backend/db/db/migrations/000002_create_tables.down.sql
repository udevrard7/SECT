-- ============================================================
-- Rollback 000002 — Suppression de toutes les tables
-- ============================================================
-- CASCADE supprime aussi les contraintes, index et triggers.
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE;', t);
  END LOOP;
END
$$;
