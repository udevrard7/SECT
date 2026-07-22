-- 000074_reponse_is_system.down.sql
-- Rollback : restaurer les policies Reponse sans is_system().

-- Reponse_select : sans is_system()
DROP POLICY IF EXISTS "Reponse_select" ON "Reponse";
CREATE POLICY "Reponse_select" ON "Reponse" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND session_owned_by_me("sessionId"))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e.id = sp."epreuveId"
      WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
  ))
  OR (is_responsable() AND session_in_my_etab("sessionId"))
  OR (is_admin() AND admin_has_etablissement_access(session_etab_id("sessionId")))
);

-- Reponse_modify : sans is_system()
DROP POLICY IF EXISTS "Reponse_modify" ON "Reponse";
CREATE POLICY "Reponse_modify" ON "Reponse" FOR ALL TO PUBLIC
  USING (
    (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  )
  WITH CHECK (
    (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  );
