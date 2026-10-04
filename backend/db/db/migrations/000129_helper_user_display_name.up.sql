-- ============================================================
-- Migration 000129 — Bibliothèque P4 : helper user_display_name
-- ADR-0008 (correctif post-E2E).
-- ============================================================
-- CONTEXTE : l'E2E P4 a révélé que l'hydratation des noms d'auteurs
-- par JOIN "User" / subquery (annotations, propositions) hérite de la
-- RLS User_select — un ENSEIGNANT sans EnseignerFiliere ne voit pas
-- les étudiants, un ADMIN global ne voit que les users de ses etabs
-- (EtablissementAccess) et les ADMIN : les lignes sont DROPPÉES par le
-- JOIN (liste vide) ou le nom arrive NULL (scan string → 500).
--
-- La leçon 000126 (un JOIN dans une POLICY hérite de la RLS de la
-- table jointe → helpers SECURITY DEFINER) s'applique AUSSI aux
-- queries des repos : toute lecture croisée de "User" passe désormais
-- par ce helper, pattern current_user_filiere_id / user_etab_id
-- (000020/000024).
--
-- Sécurité : ne divulgue QUE le nom d'affichage (jamais email/mot de
-- passe/role) d'un user du même tenant public — les noms sont déjà
-- exposés par les features existantes (messagerie, correction, etc.).
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_display_name(p_user_id text)
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT "name" FROM "User" WHERE "id" = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.user_display_name(text) TO PUBLIC;

-- ============================================================
-- Vérifications post-migration (pattern 000122)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'user_display_name' AND p.prosecdef) = 1,
         'user_display_name doit exister en SECURITY DEFINER';
  ASSERT (SELECT count(*) FROM information_schema.routine_privileges
          WHERE routine_name = 'user_display_name' AND grantee = 'PUBLIC') = 1,
         'user_display_name doit etre executable par PUBLIC';
END $$;
