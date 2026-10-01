-- ============================================================
-- Migration 000115 — Devoir_select : restauration de la branche
-- ÉTUDIANT (perdue par la réécriture 000024)
-- SECT-ANNEE-DETTES-4
-- ============================================================
-- CONTEXTE : la policy Devoir_select live (réécrite par 000024
-- pour la vague TO PUBLIC/sect_app) ne contient QUE les branches
-- enseignant/responsable/admin. La branche ÉTUDIANT — livrée par
-- 000010 (fix ANALYSE-DEVOIRS-1 : filière + niveau de l'étudiant,
-- statut PUBLIE/FERME, datePublication écoulée) — a été PERDUE
-- dans la réécriture. Conséquence en prod (depuis que RLS
-- s'applique réellement via sect_app, NOBYPASSRLS) : « Mes
-- Devoirs » est VIDE pour TOUS les étudiants (0 ligne lue, aucun
-- crash). Découvert au smoke SECT-ANNEE-DETTES-4 : l'étudiant
-- jetable ne voyait aucun des 3 devoirs PUBLIE de sa filière.
--
-- FIX :
--   A. Helper SECURITY DEFINER devoir_ue_matches_my_filiere_niveau(
--      p_ue_id) — pattern 000023 (user_in_my_etab) / 000109 : la
--      policy Devoir_select doit interroger UniteEnseignement +
--      User ; en SECURITY DEFINER on évite toute récursion RLS
--      (Devoir → UE_select → User_select). Retourne un booléen
--      seul, aucune donnée exposée.
--   B. Devoir_select recréée : les 3 branches existantes sont
--      conservées À L'IDENTIQUE (000024) + branche étudiant
--      restaurée aux sémantiques 000010 : UE de SA filière et de
--      SON niveau (ou niveau listé dans le champ JSON-ish
--      "niveaux" de l'UE), devoir PUBLIE/FERME et datePublication
--      écoulée (ou NULL).
--
-- Le statut BROUILLON/ARCHIVE reste invisible étudiant (000010).
-- Aucune écriture ouverte : branche SELECT uniquement.
-- ============================================================

-- 1. Helper filière+niveau (SECURITY DEFINER — anti-récursion).
DROP FUNCTION IF EXISTS public.devoir_ue_matches_my_filiere_niveau(p_ue_id text);
CREATE OR REPLACE FUNCTION public.devoir_ue_matches_my_filiere_niveau(p_ue_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM "UniteEnseignement" ue
    JOIN "User" me ON me."id" = current_user_id()
    WHERE ue."id" = p_ue_id
      AND ue."filiereId" = me."filiereId"
      AND (
        ue."niveau" = me."niveau"
        OR ue."niveaux" LIKE '%"' || me."niveau" || '"%'
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.devoir_ue_matches_my_filiere_niveau(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.devoir_ue_matches_my_filiere_niveau(text) TO PUBLIC;

-- 2. Devoir_select : branches 000024 à l'identique + étudiant (000010).
DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";
CREATE POLICY "Devoir_select" ON "Devoir" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND user_in_my_etab("enseignantId"))
  OR (is_admin() AND admin_has_etablissement_access(devoir_etab_id(id)))
  OR (
    is_etudiant()
    AND "statut" IN ('PUBLIE', 'FERME')
    AND ("datePublication" IS NULL OR "datePublication" <= CURRENT_TIMESTAMP)
    AND devoir_ue_matches_my_filiere_niveau("uniteEnseignementId")
  )
);

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polname='Devoir_select'
            AND position('is_etudiant()' in pg_get_expr(polqual, polrelid)) > 0
            AND position('devoir_ue_matches_my_filiere_niveau' in pg_get_expr(polqual, polrelid)) > 0) = 1,
         'Devoir_select doit contenir la branche etudiant (helper filiere+niveau)';
  ASSERT (SELECT count(*) FROM pg_proc
          WHERE proname='devoir_ue_matches_my_filiere_niveau'
            AND prosecdef) = 1,
         'devoir_ue_matches_my_filiere_niveau doit etre SECURITY DEFINER';
END $$;
