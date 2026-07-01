-- 000034_document_student_rls.down.sql
-- Rollback : revenir aux policies Document_select / Chapter_select SANS branche
-- is_etudiant() (état migration 000024).
-- ⚠️ Attention : ce rollback réintroduit le bug EXAM-PREP-STUDENT-DOCS-RLS
-- (les étudiants ne verront plus leurs documents de cours).

DROP POLICY IF EXISTS "Document_select" ON "Document";
CREATE POLICY "Document_select" ON "Document" FOR SELECT TO PUBLIC USING (
  ("ownerId" = current_user_id())
  OR (is_responsable() AND user_in_my_etab("ownerId"))
  OR (is_admin() AND admin_has_etablissement_access(user_etab_id("ownerId")))
);

DROP POLICY IF EXISTS "Chapter_select" ON "Chapter";
CREATE POLICY "Chapter_select" ON "Chapter" FOR SELECT TO PUBLIC USING (document_owned_by_me("documentId"));
