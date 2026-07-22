-- ============================================================
-- Migration 000013 (DOWN) — Rollback : restore la fonction bugée d'origine
-- ============================================================
-- ATTENTION : ce rollback réintroduit le bug E2 (CRITICAL). À n'utiliser
-- qu'en cas de régression avérée nécessitant un retour arrière immédiat.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_has_etablissement_access(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EtablissementAccess"
    WHERE "adminId" = current_user_id()
      AND "etablissementId" = p_etablissement_id
  );
$$;

COMMENT ON FUNCTION public.admin_has_etablissement_access(TEXT) IS
  'Vrai si l''ADMIN courant a une autorisation d''accès explicite à l''établissement donné.';
