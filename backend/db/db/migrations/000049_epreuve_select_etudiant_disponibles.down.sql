-- Rollback migration 000049 : restaurer la policy Epreuve_select originale
-- (étudiant = EXISTS SessionPassation seulement) + drop fonction current_user_niveau.

DROP POLICY IF EXISTS "Epreuve_select" ON "Epreuve";

CREATE POLICY "Epreuve_select" ON "Epreuve"
FOR SELECT
TO public
USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId")))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id(id)))
  OR (is_etudiant() AND (EXISTS (SELECT 1 FROM "SessionPassation" sp WHERE sp."epreuveId" = "Epreuve".id AND sp."etudiantId" = current_user_id())))
);

DROP FUNCTION IF EXISTS public.current_user_niveau();
