-- Migration 000041 : User_select autorise l'étudiant à voir les autres étudiants
-- de son établissement (pour la recherche DM dans la messagerie).
--
-- BUG (MESSAGERIE-DM-ETUDIANT-ETUDIANT) : la policy User_select ne permettait
-- à un étudiant de voir que sa propre ligne + les enseignants de sa filière.
-- L'étudiant ne pouvait pas rechercher d'autres étudiants pour créer un DM
-- (la recherche /api/users?search= retournait 0 résultat pour les étudiants).
--
-- Fix : autoriser is_etudiant() à SELECT les autres étudiants du même étab.
-- Cela permet au frontend (NewMessageDialog) de proposer des suggestions
-- d'étudiants pour les DM. La policy CreateDirect (usecase) valide ensuite
-- que le target est bien un étudiant du même étab (IsUserStudentInSameEtablissement).
--
-- Sécurité : l'étudiant ne voit que les étudiants de SON établissement (pas
-- les étudiants d'autres étab, ni les responsables, ni les admin).

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
