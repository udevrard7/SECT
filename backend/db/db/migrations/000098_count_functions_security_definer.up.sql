-- ════════════════════════════════════════════════════════════════════════════
-- 000098 — Fonctions SECURITY DEFINER pour counts agrégés (SECT-MULTITENANT-AUDIT-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : après la migration 000097 (User_select restreint pour admin PaaS),
-- les sous-requêtes count dans EtablissementRepository.List retournaient 0
-- car RLS filtrait les Users/Filieres. SET LOCAL row_security = off ne
-- fonctionne pas pour sect_app (BYPASSRLS=false).
--
-- Fix : 2 fonctions SECURITY DEFINER qui retournent des COUNT agrégés
-- (pas de données individuelles). L'admin PaaS voit le NOMBRE de
-- users/filières par établissement (informatif) mais ne peut PAS accéder
-- aux données individuelles (toujours protégé par RLS User_select).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.count_filieres_for_etab(p_etablissement_id text)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*) FROM "Filiere" f WHERE f."etablissementId" = p_etablissement_id
$$;
GRANT EXECUTE ON FUNCTION public.count_filieres_for_etab(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.count_users_for_etab(p_etablissement_id text)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*) FROM "User" u
  WHERE u."etablissementId" = p_etablissement_id
    AND u."deletedAt" IS NULL
$$;
GRANT EXECUTE ON FUNCTION public.count_users_for_etab(text) TO PUBLIC;
