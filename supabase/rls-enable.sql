-- ============================================================
-- SECT — Activation Row Level Security (RLS) sur toutes les tables
-- ============================================================
--
-- Stratégie : "deny all by default" (défense en profondeur).
--
-- Contexte :
--   - L'application SECT utilise NextAuth (pas Supabase Auth) et Prisma
--     (pas le client JS Supabase) pour l'accès données.
--   - L'API REST Supabase (PostgREST) n'est PAS utilisée côté client.
--   - Prisma se connecte via le pooler avec le rôle `postgres` (superuser
--     du projet) qui BYPASS RLS → l'application continue de fonctionner
--     normalement après activation de RLS.
--
-- Effet de ce script :
--   - `ENABLE ROW LEVEL SECURITY` sur toutes les tables du schéma `public`.
--   - Aucune policy n'est créée → tout accès via l'API REST avec l'`anon key`
--     (ou un rôle non-superuser sans BYPASSRLS) est REFUSÉ (deny all).
--   - Une deuxième couche de protection s'ajoute au grant `USAGE ON SCHEMA`
--     déjà révoqué pour `anon` par Supabase.
--
-- Pourquoi pas `FORCE ROW LEVEL SECURITY` ?
--   - `FORCE` soumet même le propriétaire de la table aux policies. Mais le
--     rôle `postgres` (superuser) bypass TOUJOURS RLS, même avec FORCE.
--   - Donc FORCE n'apporterait rien de plus ici et compliquerait une future
--     migration vers des policies fines basées sur `current_setting('app.*')`.
--
-- Maintenance :
--   - Les nouvelles tables créées par `prisma db push` n'auront PAS RLS
--     automatiquement. Ré-exécuter ce script après tout changement de
--     schéma. Le script est idempotent (safe à ré-exécuter).
--
-- Vérification :
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public' ORDER BY tablename;
--   → rowsecurity = t pour toutes les tables.
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tableowner = current_user
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$;
