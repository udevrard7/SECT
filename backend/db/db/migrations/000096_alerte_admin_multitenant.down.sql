-- Rollback 000096 : restaure la policy de 000095 (is_admin() voit tout).
DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
CREATE POLICY "Alerte_select" ON "Alerte" FOR SELECT TO PUBLIC USING (
  "userId" = current_user_id()
  OR ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId"))
  OR ("epreuveId" IS NOT NULL AND epreuve_in_my_etab("epreuveId"))
  OR is_admin()
  OR is_system()
);
