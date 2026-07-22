-- 000034_document_student_rls.up.sql
-- ============================================================================
-- Fix EXAM-PREP-STUDENT-DOCS-RLS : les étudiants ne voient aucun document sur
-- /exam-prep, même quand leur enseignant en a uploadé.
--
-- Cause racine (couche DB) :
-- La policy Document_select (migration 000024) ne contenait QUE 3 branches
-- (owner, responsable, admin) — AUCUNE branche is_etudiant(). Or les étudiants
-- ne sont jamais ownerId (ce sont les enseignants qui uploadent), ni responsables,
-- ni admin → RLS bloquait 100% des documents pour les étudiants.
-- Idem pour Chapter_select qui s'appuie sur document_owned_by_me() (étudiant ≠ owner).
--
-- Fix :
-- On ajoute une branche is_etudiant() symétrique à Epreuve_select, Question_select,
-- UniteEnseignement_select : un étudiant peut SELECT les Document/Chapter dont
-- l'UE appartient à sa filière (current_user_filiere_id() lit User.filiereId en DB).
--
-- Le scoping strict filière + niveau reste assuré EN OUTRE par la clause WHERE
-- du repository Go (ListStudentDocuments) — défense en profondeur.
--
-- Compatibilité : la fonction current_user_filiere_id() existe depuis 000020
-- (SECURITY DEFINER, lit User.filiereId). Aucune nouvelle fonction nécessaire.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Document_select : ajout branche is_etudiant()
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Document_select" ON "Document";
CREATE POLICY "Document_select" ON "Document" FOR SELECT TO PUBLIC USING (
  ("ownerId" = current_user_id())
  OR (is_responsable() AND user_in_my_etab("ownerId"))
  OR (is_admin() AND admin_has_etablissement_access(user_etab_id("ownerId")))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      WHERE ue."id" = "Document"."uniteEnseignementId"
        AND ue."filiereId" = current_user_filiere_id()
  ))
);

-- ----------------------------------------------------------------------------
-- Chapter_select : ajout branche is_etudiant()
-- Un chapitre est visible par un étudiant si le document parent est dans une UE
-- de sa filière. On ne peut pas réutiliser document_owned_by_me() (étudiant ≠ owner).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Chapter_select" ON "Chapter";
CREATE POLICY "Chapter_select" ON "Chapter" FOR SELECT TO PUBLIC USING (
  document_owned_by_me("documentId")
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Document" d
      JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
      WHERE d."id" = "Chapter"."documentId"
        AND ue."filiereId" = current_user_filiere_id()
  ))
);
