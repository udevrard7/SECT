-- Migration 000050 : Resultat_modify_etudiant — autorise l'étudiant à créer
-- son propre Resultat au submit (UpsertResultat dans Submit).
--
-- BUG E2E-EVAL-RESULTAT : la policy Resultat_modify existante exige
-- is_enseignant() → l'étudiant ne peut pas insérer son Resultat au submit →
-- POST /api/sessions/{id}/submit retourne 500 "erreur interne" (l'UpsertResultat
-- échoue silencieusement, la session reste SOUMISE sans Resultat).
--
-- Fix : ajouter une policy Resultat_modify_etudiant qui autorise l'étudiant
-- à INSERT/UPDATE son propre Resultat (basé sur session_owned_by_me).

DROP POLICY IF EXISTS "Resultat_modify_etudiant" ON "Resultat";

CREATE POLICY "Resultat_modify_etudiant" ON "Resultat"
FOR ALL
TO public
USING (is_etudiant() AND session_owned_by_me("sessionId"))
WITH CHECK (is_etudiant() AND session_owned_by_me("sessionId"));
