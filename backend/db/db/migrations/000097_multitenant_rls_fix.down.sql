-- Rollback 000097

-- User_select : restaure 000084 (is_admin() sans restriction)
DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
    is_system()
    OR (
        ("deletedAt" IS NULL)
        AND (
            (id = current_user_id())
            OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND enseignant_in_my_filiere(id))
            OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND etudiant_in_my_filiere(id))
            OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            OR is_admin()
        )
    )
);

-- AuditLog_select : restaure 000024 (is_admin() sans restriction)
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
CREATE POLICY "AuditLog_select" ON "AuditLog" FOR SELECT TO PUBLIC USING (
  is_admin()
  OR ("userId" = current_user_id())
  OR (is_responsable() AND ("userId" = current_user_id() OR ("userId" IS NOT NULL AND user_in_my_etab("userId")) OR "userId" IS NULL))
);

-- Abonnement : restaure 000007 (TO neondb_owner)
DROP POLICY IF EXISTS "Abonnement_select" ON "Abonnement";
CREATE POLICY "Abonnement_select" ON "Abonnement"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
DROP POLICY IF EXISTS "Abonnement_modify_admin" ON "Abonnement";
CREATE POLICY "Abonnement_modify_admin" ON "Abonnement"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- Facture : restaure 000007 (TO neondb_owner)
DROP POLICY IF EXISTS "Facture_select" ON "Facture";
CREATE POLICY "Facture_select" ON "Facture"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
DROP POLICY IF EXISTS "Facture_modify_admin" ON "Facture";
CREATE POLICY "Facture_modify_admin" ON "Facture"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());
