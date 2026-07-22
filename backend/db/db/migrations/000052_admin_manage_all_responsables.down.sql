-- ============================================================
-- Migration 000052 DOWN — Rollback B-complète
-- ============================================================
-- Restaure les 4 policies User à leur état pré-000052 (équivalent Neon
-- au moment du commit : select=000041, insert/update/delete=000007/000024).
-- ============================================================

DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = "User".id
        AND ef."filiereId" = current_user_filiere_id()
  ))
  OR (is_etudiant() AND (role = 'ETUDIANT'::"Role") AND "etablissementId" = current_etablissement_id())
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = current_user_id()
        AND ef."filiereId" = "User"."filiereId"
  ))
  OR (is_enseignant() AND (role IN ('ENSEIGNANT'::"Role", 'RESPONSABLE'::"Role")) AND "etablissementId" = current_etablissement_id())
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
);

DROP POLICY IF EXISTS "User_insert" ON "User";
CREATE POLICY "User_insert" ON "User" FOR INSERT TO PUBLIC WITH CHECK (
  (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ((role = 'ADMIN'::"Role") OR (("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))))
);

DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User" FOR UPDATE TO PUBLIC
  USING (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  )
  WITH CHECK (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  );

DROP POLICY IF EXISTS "User_delete" ON "User";
CREATE POLICY "User_delete" ON "User" FOR DELETE TO PUBLIC
  USING (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  );
