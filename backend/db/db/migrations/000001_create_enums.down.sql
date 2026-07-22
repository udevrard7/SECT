-- ============================================================
-- Rollback 000001 — Suppression des enums et du schéma public
-- ============================================================
-- ATTENTION : ne supprime pas le schéma "public" lui-même car
-- il peut contenir d'autres objets (extensions, etc.). On drop
-- uniquement les types ENUM créés par la migration 000001.
-- ============================================================

DO $$
DECLARE
  e text;
BEGIN
  FOR e IN
    SELECT typname
    FROM pg_type
    JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_type.typtype = 'e'  -- enum
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I;', e);
  END LOOP;
END
$$;
