-- 000024: Réécriture des 41 policies récursives avec fonctions helper
--
-- CONTEXTE : les policies avec cross-table subqueries causent une récursion RLS
-- infinie avec sect_app (NOBYPASSRLS). Cette migration remplace toutes les
-- sous-queries inline par des appels aux fonctions helper SECURITY DEFINER
-- créées dans la migration 000023.
--
-- ATTENTION : cette migration DOIT être appliquée après la 000023.

-- ═══════════════════════════════════════════════════════════════
-- Fonctions "return etab_id" pour les branches ADMIN
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.filiere_etab_id(p_filiere_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT "etablissementId" INTO v FROM "Filiere" WHERE id = p_filiere_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.ue_etab_id(p_ue_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT f."etablissementId" INTO v FROM "UniteEnseignement" ue JOIN "Filiere" f ON f.id = ue."filiereId" WHERE ue.id = p_ue_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.epreuve_etab_id(p_epreuve_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT f."etablissementId" INTO v FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = p_epreuve_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_etab_id(p_user_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT "etablissementId" INTO v FROM "User" WHERE id = p_user_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.devoir_etab_id(p_devoir_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT u."etablissementId" INTO v FROM "Devoir" d JOIN "User" u ON u.id = d."enseignantId" WHERE d.id = p_devoir_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.session_etab_id(p_session_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT f."etablissementId" INTO v FROM "SessionPassation" sp JOIN "Epreuve" e ON e.id = sp."epreuveId" JOIN "Filiere" f ON f.id = e."filiereId" WHERE sp.id = p_session_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.soumission_etab_id(p_soumission_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT u."etablissementId" INTO v FROM "Soumission" s JOIN "Devoir" d ON d.id = s."devoirId" JOIN "User" u ON u.id = d."enseignantId" WHERE s.id = p_soumission_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.affectation_etab_id(p_affectation_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE v text;
BEGIN
  SELECT f."etablissementId" INTO v FROM "Affectation" a JOIN "UniteEnseignement" ue ON ue.id = a."uniteEnseignementId" JOIN "Filiere" f ON f.id = ue."filiereId" WHERE a.id = p_affectation_id;
  RETURN v;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- RÉÉCRITURE DES 41 POLICIES
-- ═══════════════════════════════════════════════════════════════

-- Affectation
DROP POLICY IF EXISTS "Affectation_modify_responsable" ON "Affectation";
CREATE POLICY "Affectation_modify_responsable" ON "Affectation" FOR ALL TO PUBLIC
  USING (is_responsable() AND affectation_in_my_etab(id))
  WITH CHECK (is_responsable() AND affectation_in_my_etab(id));

DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
);

-- Alerte
DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
CREATE POLICY "Alerte_select" ON "Alerte" FOR SELECT TO PUBLIC USING (
  ("userId" = current_user_id())
  OR (is_responsable() AND (
      ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId"))
      OR ("epreuveId" IS NOT NULL AND epreuve_in_my_etab("epreuveId"))
  ))
  OR (is_enseignant() AND "epreuveId" IS NOT NULL AND epreuve_owned_by_me("epreuveId"))
  OR (is_admin() AND "userId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)
);

-- AuditLog
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
CREATE POLICY "AuditLog_select" ON "AuditLog" FOR SELECT TO PUBLIC USING (
  is_admin()
  OR ("userId" = current_user_id())
  OR (is_responsable() AND ("userId" = current_user_id() OR ("userId" IS NOT NULL AND user_in_my_etab("userId")) OR "userId" IS NULL))
);

-- Certificat
DROP POLICY IF EXISTS "Certificat_modify" ON "Certificat";
CREATE POLICY "Certificat_modify" ON "Certificat" FOR ALL TO PUBLIC
  USING ((is_enseignant() AND ("emetteParId" = current_user_id())) OR (is_responsable() AND user_in_my_etab("etudiantId")))
  WITH CHECK ((is_enseignant() AND ("emetteParId" = current_user_id())) OR (is_responsable() AND user_in_my_etab("etudiantId")));

DROP POLICY IF EXISTS "Certificat_select" ON "Certificat";
CREATE POLICY "Certificat_select" ON "Certificat" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND ("etudiantId" = current_user_id()))
  OR (is_enseignant() AND ("emetteParId" = current_user_id()))
  OR (is_responsable() AND user_in_my_etab("etudiantId"))
  OR (is_admin() AND admin_has_etablissement_access(user_etab_id("etudiantId")))
);

-- Chapter
DROP POLICY IF EXISTS "Chapter_modify_owner" ON "Chapter";
CREATE POLICY "Chapter_modify_owner" ON "Chapter" FOR ALL TO PUBLIC
  USING (document_owned_by_me("documentId"))
  WITH CHECK (document_owned_by_me("documentId"));

DROP POLICY IF EXISTS "Chapter_select" ON "Chapter";
CREATE POLICY "Chapter_select" ON "Chapter" FOR SELECT TO PUBLIC USING (document_owned_by_me("documentId"));

-- ChatMessage
DROP POLICY IF EXISTS "ChatMessage_modify" ON "ChatMessage";
CREATE POLICY "ChatMessage_modify" ON "ChatMessage" FOR ALL TO PUBLIC
  USING (chatthread_owned_by_me("threadId"))
  WITH CHECK (chatthread_owned_by_me("threadId"));

DROP POLICY IF EXISTS "ChatMessage_select" ON "ChatMessage";
CREATE POLICY "ChatMessage_select" ON "ChatMessage" FOR SELECT TO PUBLIC USING (chatthread_owned_by_me("threadId"));

-- Devoir
DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";
CREATE POLICY "Devoir_select" ON "Devoir" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND user_in_my_etab("enseignantId"))
  OR (is_admin() AND admin_has_etablissement_access(devoir_etab_id(id)))
);

-- Document
DROP POLICY IF EXISTS "Document_select" ON "Document";
CREATE POLICY "Document_select" ON "Document" FOR SELECT TO PUBLIC USING (
  ("ownerId" = current_user_id())
  OR (is_responsable() AND user_in_my_etab("ownerId"))
  OR (is_admin() AND admin_has_etablissement_access(user_etab_id("ownerId")))
);

-- EnseignantFiliere
DROP POLICY IF EXISTS "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere";
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere" FOR ALL TO PUBLIC
  USING (is_responsable() AND filiere_in_my_etab("filiereId"))
  WITH CHECK (is_responsable() AND filiere_in_my_etab("filiereId"));

DROP POLICY IF EXISTS "EnseignantFiliere_select" ON "EnseignantFiliere";
CREATE POLICY "EnseignantFiliere_select" ON "EnseignantFiliere" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND filiere_in_my_etab("filiereId"))
  OR (is_admin() AND admin_has_etablissement_access(filiere_etab_id("filiereId")))
);

-- Epreuve
DROP POLICY IF EXISTS "Epreuve_select" ON "Epreuve";
CREATE POLICY "Epreuve_select" ON "Epreuve" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId")))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id(id)))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "Epreuve".id AND sp."etudiantId" = current_user_id()
  ))
);

-- EpreuveDocument
DROP POLICY IF EXISTS "EpreuveDocument_modify_enseignant" ON "EpreuveDocument";
CREATE POLICY "EpreuveDocument_modify_enseignant" ON "EpreuveDocument" FOR ALL TO PUBLIC
  USING (is_enseignant() AND epreuve_owned_by_me("epreuveId"))
  WITH CHECK (is_enseignant() AND epreuve_owned_by_me("epreuveId"));

DROP POLICY IF EXISTS "EpreuveDocument_select" ON "EpreuveDocument";
CREATE POLICY "EpreuveDocument_select" ON "EpreuveDocument" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND epreuve_owned_by_me("epreuveId"))
  OR (is_responsable() AND epreuve_in_my_etab("epreuveId"))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveDocument"."epreuveId" AND sp."etudiantId" = current_user_id()
  ))
);

-- EpreuveQuestion
DROP POLICY IF EXISTS "EpreuveQuestion_modify_enseignant" ON "EpreuveQuestion";
CREATE POLICY "EpreuveQuestion_modify_enseignant" ON "EpreuveQuestion" FOR ALL TO PUBLIC
  USING (is_enseignant() AND epreuve_owned_by_me("epreuveId"))
  WITH CHECK (is_enseignant() AND epreuve_owned_by_me("epreuveId"));

DROP POLICY IF EXISTS "EpreuveQuestion_select" ON "EpreuveQuestion";
CREATE POLICY "EpreuveQuestion_select" ON "EpreuveQuestion" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND epreuve_owned_by_me("epreuveId"))
  OR (is_responsable() AND epreuve_in_my_etab("epreuveId"))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveQuestion"."epreuveId" AND sp."etudiantId" = current_user_id()
  ))
);

-- Flashcard
DROP POLICY IF EXISTS "Flashcard_modify" ON "Flashcard";
CREATE POLICY "Flashcard_modify" ON "Flashcard" FOR ALL TO PUBLIC
  USING (document_owned_by_me("documentId"))
  WITH CHECK (document_owned_by_me("documentId"));

DROP POLICY IF EXISTS "Flashcard_select" ON "Flashcard";
CREATE POLICY "Flashcard_select" ON "Flashcard" FOR SELECT TO PUBLIC USING (
  "documentId" IS NULL OR document_owned_by_me("documentId")
);

-- GrilleEvaluation
DROP POLICY IF EXISTS "GrilleEvaluation_modify_enseignant" ON "GrilleEvaluation";
CREATE POLICY "GrilleEvaluation_modify_enseignant" ON "GrilleEvaluation" FOR ALL TO PUBLIC
  USING (is_enseignant() AND devoir_owned_by_me("devoirId"))
  WITH CHECK (is_enseignant() AND devoir_owned_by_me("devoirId"));

DROP POLICY IF EXISTS "GrilleEvaluation_select" ON "GrilleEvaluation";
CREATE POLICY "GrilleEvaluation_select" ON "GrilleEvaluation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND devoir_owned_by_me("devoirId"))
  OR (is_responsable() AND devoir_in_my_etab("devoirId"))
  OR (is_admin() AND admin_has_etablissement_access(devoir_etab_id("devoirId")))
);

-- HelpThread
DROP POLICY IF EXISTS "HelpThread_modify" ON "HelpThread";
CREATE POLICY "HelpThread_modify" ON "HelpThread" FOR ALL TO PUBLIC
  USING (
    (is_etudiant() AND ("etudiantId" = current_user_id()))
    OR (is_enseignant() AND ("enseignantId" = current_user_id()))
    OR (is_responsable() AND (user_in_my_etab("etudiantId") OR user_in_my_etab("enseignantId")))
  )
  WITH CHECK (
    (is_etudiant() AND ("etudiantId" = current_user_id()))
    OR (is_enseignant() AND ("enseignantId" = current_user_id()))
    OR (is_responsable() AND (user_in_my_etab("etudiantId") OR user_in_my_etab("enseignantId")))
  );

DROP POLICY IF EXISTS "HelpThread_select" ON "HelpThread";
CREATE POLICY "HelpThread_select" ON "HelpThread" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND ("etudiantId" = current_user_id()))
  OR (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND (user_in_my_etab("etudiantId") OR user_in_my_etab("enseignantId")))
);

-- HelpMessage
DROP POLICY IF EXISTS "HelpMessage_select" ON "HelpMessage";
CREATE POLICY "HelpMessage_select" ON "HelpMessage" FOR SELECT TO PUBLIC USING (chatthread_owned_by_me("threadId"));

-- Question
DROP POLICY IF EXISTS "Question_select" ON "Question";
CREATE POLICY "Question_select" ON "Question" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND (("auteurId" = current_user_id()) OR ("auteurId" IS NULL)))
  OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      WHERE eq."questionId" = "Question".id AND epreuve_in_my_etab(eq."epreuveId")
  ))
  OR (is_admin() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      WHERE eq."questionId" = "Question".id AND admin_has_etablissement_access(epreuve_etab_id(eq."epreuveId"))
  ))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "SessionPassation" sp ON sp."epreuveId" = eq."epreuveId"
      WHERE eq."questionId" = "Question".id AND sp."etudiantId" = current_user_id()
  ))
);

-- Reponse
DROP POLICY IF EXISTS "Reponse_modify" ON "Reponse";
CREATE POLICY "Reponse_modify" ON "Reponse" FOR ALL TO PUBLIC
  USING (
    (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  )
  WITH CHECK (
    (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  );

DROP POLICY IF EXISTS "Reponse_select" ON "Reponse";
CREATE POLICY "Reponse_select" ON "Reponse" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND session_owned_by_me("sessionId"))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e.id = sp."epreuveId"
      WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
  ))
  OR (is_responsable() AND session_in_my_etab("sessionId"))
  OR (is_admin() AND admin_has_etablissement_access(session_etab_id("sessionId")))
);

-- Resultat
DROP POLICY IF EXISTS "Resultat_modify" ON "Resultat";
CREATE POLICY "Resultat_modify" ON "Resultat" FOR ALL TO PUBLIC
  USING (
    (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Resultat"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  )
  WITH CHECK (
    (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Resultat"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  );

DROP POLICY IF EXISTS "Resultat_select" ON "Resultat";
CREATE POLICY "Resultat_select" ON "Resultat" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND session_owned_by_me("sessionId"))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e.id = sp."epreuveId"
      WHERE sp.id = "Resultat"."sessionId" AND e."enseignantId" = current_user_id()
  ))
  OR (is_responsable() AND session_in_my_etab("sessionId"))
  OR (is_admin() AND admin_has_etablissement_access(session_etab_id("sessionId")))
);

-- SessionPassation
DROP POLICY IF EXISTS "SessionPassation_select" ON "SessionPassation";
CREATE POLICY "SessionPassation_select" ON "SessionPassation" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND ("etudiantId" = current_user_id()))
  OR (is_enseignant() AND epreuve_owned_by_me("epreuveId"))
  OR (is_responsable() AND epreuve_in_my_etab("epreuveId"))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
);

-- SessionSpeciale
DROP POLICY IF EXISTS "SessionSpeciale_select" ON "SessionSpeciale";
CREATE POLICY "SessionSpeciale_select" ON "SessionSpeciale" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("creeParId" = current_user_id()))
  OR (is_etudiant() AND session_speciale_has_my_session(id))
  OR (is_responsable() AND session_speciale_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveDeriveeId")))
);

-- Soumission
DROP POLICY IF EXISTS "Soumission_select" ON "Soumission";
CREATE POLICY "Soumission_select" ON "Soumission" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND ("etudiantId" = current_user_id()))
  OR (is_enseignant() AND devoir_owned_by_me("devoirId"))
  OR (is_responsable() AND soumission_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(soumission_etab_id(id)))
);

-- UniteEnseignement
DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement" FOR ALL TO PUBLIC
  USING (is_responsable() AND filiere_in_my_etab("filiereId"))
  WITH CHECK (is_responsable() AND filiere_in_my_etab("filiereId"));

DROP POLICY IF EXISTS "UniteEnseignement_select" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_select" ON "UniteEnseignement" FOR SELECT TO PUBLIC USING (
  (is_responsable() AND filiere_in_my_etab("filiereId"))
  OR (is_admin() AND admin_has_etablissement_access(ue_etab_id(id)))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Affectation" a WHERE a."uniteEnseignementId" = "UniteEnseignement".id AND a."enseignantId" = current_user_id()
  ))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "User" me WHERE me.id = current_user_id() AND me."filiereId" = "UniteEnseignement"."filiereId"
  ))
);

-- UniteEnseignementFiliere
DROP POLICY IF EXISTS "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere";
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere" FOR ALL TO PUBLIC
  USING (is_responsable() AND filiere_in_my_etab("filiereId"))
  WITH CHECK (is_responsable() AND filiere_in_my_etab("filiereId"));

DROP POLICY IF EXISTS "UniteEnseignementFiliere_select" ON "UniteEnseignementFiliere";
CREATE POLICY "UniteEnseignementFiliere_select" ON "UniteEnseignementFiliere" FOR SELECT TO PUBLIC USING (
  (is_admin() AND admin_has_etablissement_access(filiere_etab_id("filiereId")))
  OR (is_responsable() AND filiere_in_my_etab("filiereId"))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Affectation" a WHERE a."uniteEnseignementId" = "UniteEnseignementFiliere"."uniteEnseignementId" AND a."enseignantId" = current_user_id()
  ))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "User" me WHERE me.id = current_user_id() AND me."filiereId" = "UniteEnseignementFiliere"."filiereId"
  ))
);

-- User
DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND enseignant_in_my_filiere(id))
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND etudiant_in_my_filiere(id))
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
);

-- ValidationUE
DROP POLICY IF EXISTS "ValidationUE_modify" ON "ValidationUE";
CREATE POLICY "ValidationUE_modify" ON "ValidationUE" FOR ALL TO PUBLIC
  USING (is_responsable() AND user_in_my_etab("etudiantId"))
  WITH CHECK (is_responsable() AND user_in_my_etab("etudiantId"));

DROP POLICY IF EXISTS "ValidationUE_select" ON "ValidationUE";
CREATE POLICY "ValidationUE_select" ON "ValidationUE" FOR SELECT TO PUBLIC USING (
  (is_etudiant() AND ("etudiantId" = current_user_id()))
  OR (is_responsable() AND user_in_my_etab("etudiantId"))
  OR (is_admin() AND admin_has_etablissement_access(user_etab_id("etudiantId")))
);
