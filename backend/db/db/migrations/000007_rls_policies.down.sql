-- ============================================================
-- Rollback 000007 — Suppression de toutes les policies RLS
-- ============================================================

DO $$
DECLARE
  p text;
  t text;
BEGIN
  -- Drop toutes les policies de toutes les tables du schéma public
  FOR p, t IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p, t);
  END LOOP;
END
$$;
