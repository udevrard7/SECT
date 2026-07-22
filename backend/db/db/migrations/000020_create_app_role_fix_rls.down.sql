-- 000020 down: restaure l'ancienne policy User_select (avec récursion) + revert SECURITY DEFINER
-- ATTENTION : ce down réintroduit la vulnérabilité de récursion RLS. À n'utiliser
-- qu'en cas de rollback complet du rôle sect_app vers neondb_owner (BYPASSRLS).

-- Restaurer l'ancienne policy User_select (avec JOIN "User" me — récursif)
DROP POLICY IF EXISTS "User_select" ON "User";

CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND (EXISTS (
      SELECT 1
      FROM ("EnseignantFiliere" ef
        JOIN "User" me ON ((me.id = current_user_id())))
      WHERE ((ef."enseignantId" = "User".id) AND (ef."filiereId" = me."filiereId")))))
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND (EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ((ef."enseignantId" = current_user_id()) AND (ef."filiereId" = "User"."filiereId")))))
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
);

-- Supprimer la fonction current_user_filiere_id
DROP FUNCTION IF EXISTS public.current_user_filiere_id();

-- Revert SECURITY DEFINER → SECURITY INVOKER (état d'origine)
ALTER FUNCTION public.current_user_id() SECURITY INVOKER;
ALTER FUNCTION public.current_role_claim() SECURITY INVOKER;
ALTER FUNCTION public.current_etablissement_id() SECURITY INVOKER;
ALTER FUNCTION public.is_admin() SECURITY INVOKER;
ALTER FUNCTION public.is_responsable() SECURITY INVOKER;
ALTER FUNCTION public.is_enseignant() SECURITY INVOKER;
ALTER FUNCTION public.is_etudiant() SECURITY INVOKER;
ALTER FUNCTION public.admin_has_etablissement_access(p_etablissement_id text) SECURITY INVOKER;
ALTER FUNCTION public.belongs_to_etablissement(p_etablissement_id text) SECURITY INVOKER;
