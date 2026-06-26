-- ============================================================
-- Rollback 000006 — Désactivation RLS + suppression fonctions helper
-- ============================================================

-- Désactiver + retirer FORCE RLS sur toutes les tables
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I NO FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I DISABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$;

-- Supprimer les fonctions helper (ordre : dépendantes d'abord)
DROP FUNCTION IF EXISTS public.belongs_to_etablissement(text);
DROP FUNCTION IF EXISTS public.admin_has_etablissement_access(text);
DROP FUNCTION IF EXISTS public.is_etudiant();
DROP FUNCTION IF EXISTS public.is_enseignant();
DROP FUNCTION IF EXISTS public.is_responsable();
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.current_etablissement_id();
DROP FUNCTION IF EXISTS public.current_role_claim();
DROP FUNCTION IF EXISTS public.current_user_id();
