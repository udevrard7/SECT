-- ============================================================
-- Rollback 000004 — Suppression des clés étrangères
-- ============================================================
-- Ordre : on drop toutes les FK. Les contraintes sont nommées
-- selon la convention Prisma : "{Table}_{colonne}_fkey".
-- ============================================================

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_constraint.contype = 'f'
      AND conname LIKE '%_fkey'
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I DROP CONSTRAINT IF EXISTS %I CASCADE;',
      (SELECT relname FROM pg_constraint JOIN pg_class ON pg_class.oid = pg_constraint.conrelid WHERE conname = c), c);
  END LOOP;
END
$$;
