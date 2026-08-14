-- 000024 down: supprime les 8 fonctions *_etab_id et DROP les 41 policies recréées.
--
-- ⚠️ LIMITATION : 000024 a fait DROP POLICY IF EXISTS + CREATE POLICY sur chaque policy,
-- écrasant les anciennes versions. Ce down DROP les policies sans restaurer les anciennes
-- (leur code n'est pas disponible dans la migration). Après ce down, les tables concernées
-- n'auront PLUS de policies RLS (accès ouvert jusqu'à restauration manuelle).
-- En pratique, ce down est utilisé en dev/test pour revenir à un état propre avant de
-- ré-appliquer 000023+000024.
--
-- Ce down doit être appliqué AVANT 000023 down (les policies dépendent des fonctions helper).

-- ═══ 1. DROP des 8 fonctions *_etab_id ═══
DROP FUNCTION IF EXISTS public.filiere_etab_id(text);
DROP FUNCTION IF EXISTS public.ue_etab_id(text);
DROP FUNCTION IF EXISTS public.epreuve_etab_id(text);
DROP FUNCTION IF EXISTS public.user_etab_id(text);
DROP FUNCTION IF EXISTS public.devoir_etab_id(text);
DROP FUNCTION IF EXISTS public.session_etab_id(text);
DROP FUNCTION IF EXISTS public.soumission_etab_id(text);
DROP FUNCTION IF EXISTS public.affectation_etab_id(text);

-- ═══ 2. DROP des 41 policies recréées par 000024 ═══
DROP POLICY IF EXISTS "Affectation_modify_responsable" ON "Affectation";
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
DROP POLICY IF EXISTS "Certificat_modify" ON "Certificat";
DROP POLICY IF EXISTS "Certificat_select" ON "Certificat";
DROP POLICY IF EXISTS "Chapter_modify_owner" ON "Chapter";
DROP POLICY IF EXISTS "Chapter_select" ON "Chapter";
DROP POLICY IF EXISTS "ChatMessage_modify" ON "ChatMessage";
DROP POLICY IF EXISTS "ChatMessage_select" ON "ChatMessage";
DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";
DROP POLICY IF EXISTS "Document_select" ON "Document";
DROP POLICY IF EXISTS "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere";
DROP POLICY IF EXISTS "EnseignantFiliere_select" ON "EnseignantFiliere";
DROP POLICY IF EXISTS "Epreuve_select" ON "Epreuve";
DROP POLICY IF EXISTS "EpreuveDocument_modify_enseignant" ON "EpreuveDocument";
DROP POLICY IF EXISTS "EpreuveDocument_select" ON "EpreuveDocument";
DROP POLICY IF EXISTS "EpreuveQuestion_modify_enseignant" ON "EpreuveQuestion";
DROP POLICY IF EXISTS "EpreuveQuestion_select" ON "EpreuveQuestion";
DROP POLICY IF EXISTS "Flashcard_modify" ON "Flashcard";
DROP POLICY IF EXISTS "Flashcard_select" ON "Flashcard";
DROP POLICY IF EXISTS "GrilleEvaluation_modify_enseignant" ON "GrilleEvaluation";
DROP POLICY IF EXISTS "GrilleEvaluation_select" ON "GrilleEvaluation";
DROP POLICY IF EXISTS "HelpThread_modify" ON "HelpThread";
DROP POLICY IF EXISTS "HelpThread_select" ON "HelpThread";
DROP POLICY IF EXISTS "HelpMessage_select" ON "HelpMessage";
DROP POLICY IF EXISTS "Question_select" ON "Question";
DROP POLICY IF EXISTS "Reponse_modify" ON "Reponse";
DROP POLICY IF EXISTS "Reponse_select" ON "Reponse";
DROP POLICY IF EXISTS "Resultat_modify" ON "Resultat";
DROP POLICY IF EXISTS "Resultat_select" ON "Resultat";
DROP POLICY IF EXISTS "SessionPassation_select" ON "SessionPassation";
DROP POLICY IF EXISTS "SessionSpeciale_select" ON "SessionSpeciale";
DROP POLICY IF EXISTS "Soumission_select" ON "Soumission";
DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
DROP POLICY IF EXISTS "UniteEnseignement_select" ON "UniteEnseignement";
DROP POLICY IF EXISTS "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere";
DROP POLICY IF EXISTS "UniteEnseignementFiliere_select" ON "UniteEnseignementFiliere";
DROP POLICY IF EXISTS "User_select" ON "User";
DROP POLICY IF EXISTS "ValidationUE_modify" ON "ValidationUE";
DROP POLICY IF EXISTS "ValidationUE_select" ON "ValidationUE";
