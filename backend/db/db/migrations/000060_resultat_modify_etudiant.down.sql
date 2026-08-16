-- Rollback: supprimer la policy Resultat_modify_etudiant
DROP POLICY IF EXISTS "Resultat_modify_etudiant" ON "Resultat";
