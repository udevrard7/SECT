-- Rollback 000009 — restaure l'ancienne policy Devoir_select (buggy)
-- ⚠️ Ne pas exécuter en production : réintroduit le bug étudiant.

DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";

CREATE POLICY "Devoir_select" ON "Devoir"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Devoir"."enseignantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Soumission" s WHERE s."devoirId" = "Devoir"."id"
        AND s."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Devoir"."enseignantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
