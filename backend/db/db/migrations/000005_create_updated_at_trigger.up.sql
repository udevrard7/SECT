-- ============================================================
-- Migration 000005 — Fonction + triggers updated_at
-- ============================================================
-- Prisma gère @updatedAt côté client (JS). Le backend Go n'utilisera
-- pas Prisma : on délègue donc la mise à jour de "updatedAt" à un
-- trigger PostgreSQL qui s'exécute automatiquement sur chaque UPDATE.
--
-- La fonction est idempotent (CREATE OR REPLACE) et safe à ré-exécuter.
-- Les triggers utilisent `FOR EACH STATEMENT` (et non ROW) pour rester
-- performants même sur les updates bulk ; la colonne updatedAt est
-- juste mise à CURRENT_TIMESTAMP.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- For statement-level trigger, update the NEW row's updatedAt
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Création des triggers FOR EACH ROW sur toutes les tables ayant
-- une colonne "updatedAt" (31 tables identifiées dans le schéma)
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
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t
    );
    -- Drop & recreate pour idempotence (si le trigger existe déjà)
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I; CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END
$$;
