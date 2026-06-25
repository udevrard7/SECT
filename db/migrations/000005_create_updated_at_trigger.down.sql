-- ============================================================
-- Rollback 000005 — Suppression des triggers updated_at
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updatedAt'
    ORDER BY table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;', t);
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS public.set_updated_at();
