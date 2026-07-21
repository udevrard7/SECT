-- Rollback 000091 : restaure la policy récursive de 000090 (réintroduit le bug).
-- ATTENTION : ce rollback réintroduit l'erreur "infinite recursion detected".
-- À utiliser seulement pour annuler 000091 + 000090 ensemble.

DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
  OR (is_etudiant() AND "statut" = 'PUBLIEE' AND (
    EXISTS (SELECT 1 FROM "UniteEnseignement" ue WHERE ue."id" = "Affectation"."uniteEnseignementId"
     AND ue."filiereId" IS NOT DISTINCT FROM current_user_filiere_id())
  ))
);

DROP FUNCTION IF EXISTS public.affectation_visible_by_student(text);
