-- ============================================================
-- Migration 000053 DOWN — Rollback B-complète invitations
-- ============================================================
-- Restaure les 2 policies Invitation à leur état pré-000053.
-- ============================================================

DROP POLICY IF EXISTS "Invitation_select" ON "Invitation";
CREATE POLICY "Invitation_select" ON "Invitation" FOR SELECT TO PUBLIC USING (
  ("createdById" = current_user_id())
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
);

DROP POLICY IF EXISTS "Invitation_modify" ON "Invitation";
CREATE POLICY "Invitation_modify" ON "Invitation" FOR ALL TO PUBLIC
  USING (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
  )
  WITH CHECK (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
  );
