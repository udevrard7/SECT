-- ============================================================
-- Migration 000007 — Policies RLS par table (Option A)
-- ============================================================
--
-- Policies organisées par groupe d'accès. Chaque policy utilise les
-- fonctions helper définies dans 000006 :
--   current_user_id(), current_role_claim(), current_etablissement_id()
--   is_admin(), is_responsable(), is_enseignant(), is_etudiant()
--   belongs_to_etablissement(eta_id), admin_has_etablissement_access(eta_id)
--
-- Rappel PostgreSQL : pour une même commande (SELECT/INSERT/...), les
-- policies multiples sont combinées par OR. Entre commandes différentes
-- (ex: SELECT vs INSERT), elles sont indépendantes.
--
-- Convention de nommage : "{Table}_{operation}" (ex: "User_select")
-- ============================================================


-- ============================================================
-- GROUPE 1 — Tables plateforme (ADMIN uniquement)
-- ============================================================
-- L'ADMIN est propriétaire PaaS. Ces tables ne contiennent aucune
-- donnée établissement. Seul l'ADMIN peut y accéder.
-- (Pas de policy = deny all pour les autres rôles, car RLS est activé.)

-- Plan (plans tarifaires SaaS)
CREATE POLICY "Plan_all_admin" ON "Plan"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- PlatformSettings (paramètres globaux de la plateforme)
CREATE POLICY "PlatformSettings_all_admin" ON "PlatformSettings"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- AIProviderConfig (configuration des providers IA — clé API, etc.)
CREATE POLICY "AIProviderConfig_all_admin" ON "AIProviderConfig"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- AIFailoverEvent (événements de bascule IA — écriture système, lecture ADMIN)
CREATE POLICY "AIFailoverEvent_select_admin" ON "AIFailoverEvent"
  FOR SELECT TO neondb_owner
  USING (is_admin());
CREATE POLICY "AIFailoverEvent_insert_system" ON "AIFailoverEvent"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);  -- écriture par le backend (système)

-- MonitoringEvent (événements de monitoring — écriture système, lecture ADMIN)
CREATE POLICY "MonitoringEvent_select_admin" ON "MonitoringEvent"
  FOR SELECT TO neondb_owner
  USING (is_admin());
CREATE POLICY "MonitoringEvent_insert_system" ON "MonitoringEvent"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);

-- NotificationAdmin (notifications destinées aux ADMIN)
CREATE POLICY "NotificationAdmin_all_admin" ON "NotificationAdmin"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());


-- ============================================================
-- GROUPE 2 — Tables plateforme avec scoping établissement
-- ============================================================

-- IpWhitelist (liste blanche IP — par établissement)
CREATE POLICY "IpWhitelist_select" ON "IpWhitelist"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "IpWhitelist_modify" ON "IpWhitelist"
  FOR ALL TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );

-- Facture (factures par établissement)
CREATE POLICY "Facture_select" ON "Facture"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Facture_modify_admin" ON "Facture"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- Abonnement (abonnements par établissement)
CREATE POLICY "Abonnement_select" ON "Abonnement"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Abonnement_modify_admin" ON "Abonnement"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- BadgeDefinition (définitions de badges — lisibles par tous, gérées par ADMIN/RESPONSABLE)
CREATE POLICY "BadgeDefinition_select_all" ON "BadgeDefinition"
  FOR SELECT TO neondb_owner
  USING (true);
CREATE POLICY "BadgeDefinition_modify_admin" ON "BadgeDefinition"
  FOR ALL TO neondb_owner
  USING (is_admin() OR is_responsable())
  WITH CHECK (is_admin() OR is_responsable());


-- ============================================================
-- GROUPE 3 — Tables établissement core
-- ============================================================

-- Etablissement (l'établissement lui-même)
CREATE POLICY "Etablissement_select" ON "Etablissement"
  FOR SELECT TO neondb_owner
  USING (
    -- ADMIN : uniquement les établissements autorisés via EtablissementAccess
    (is_admin() AND admin_has_etablissement_access("id"))
    -- RESPONSABLE / ENSEIGNANT / ETUDIANT : leur propre établissement
    OR (NOT is_admin() AND "id" = current_etablissement_id())
  );
CREATE POLICY "Etablissement_modify_responsable" ON "Etablissement"
  FOR UPDATE TO neondb_owner
  USING (is_responsable() AND "id" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "id" = current_etablissement_id());

-- EtablissementAccess (autorisations d'accès ADMIN → établissement)
CREATE POLICY "EtablissementAccess_select" ON "EtablissementAccess"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()  -- ADMIN voit ses propres autorisations
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "EtablissementAccess_modify_admin" ON "EtablissementAccess"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- SecuritySettings (paramètres de sécurité par établissement)
CREATE POLICY "SecuritySettings_select" ON "SecuritySettings"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "SecuritySettings_modify_responsable" ON "SecuritySettings"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

-- AnneeAcademique (années académiques par établissement)
CREATE POLICY "AnneeAcademique_select" ON "AnneeAcademique"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "AnneeAcademique_modify_responsable" ON "AnneeAcademique"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());


-- ============================================================
-- GROUPE 4 — Structure académique (étab-scoped + enseignant)
-- ============================================================

-- Filiere
CREATE POLICY "Filiere_select" ON "Filiere"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

-- UniteEnseignement (scopée par filière → établissement)
CREATE POLICY "UniteEnseignement_select" ON "UniteEnseignement"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access(
      (SELECT "etablissementId" FROM "Filiere" WHERE "id" = "UniteEnseignement"."filiereId")
    ))
    OR (NOT is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- UniteEnseignementFiliere (table de liaison)
CREATE POLICY "UniteEnseignementFiliere_select" ON "UniteEnseignementFiliere"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access(
      (SELECT f."etablissementId" FROM "Filiere" f WHERE f."id" = "UniteEnseignementFiliere"."filiereId")
    ))
    OR (NOT is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- EnseignantFiliere (assignations enseignant ↔ filière)
CREATE POLICY "EnseignantFiliere_select" ON "EnseignantFiliere"
  FOR SELECT TO neondb_owner
  USING (
    -- ENSEIGNANT : ses propres assignations
    (is_enseignant() AND "enseignantId" = current_user_id())
    -- RESPONSABLE : assignations de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès autorisé
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
    -- ETUDIANT : filières de son établissement
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "EnseignantFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "EnseignantFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- Affectation (affectations enseignant ↔ UE)
CREATE POLICY "Affectation_select" ON "Affectation"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (NOT is_admin() AND current_etablissement_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      JOIN "Filiere" f ON f."id" = ue."filiereId"
      WHERE ue."id" = "Affectation"."uniteEnseignementId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      JOIN "Filiere" f ON f."id" = ue."filiereId"
      WHERE ue."id" = "Affectation"."uniteEnseignementId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Affectation_modify_responsable" ON "Affectation"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "UniteEnseignement" ue
    JOIN "Filiere" f ON f."id" = ue."filiereId"
    WHERE ue."id" = "Affectation"."uniteEnseignementId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "UniteEnseignement" ue
    JOIN "Filiere" f ON f."id" = ue."filiereId"
    WHERE ue."id" = "Affectation"."uniteEnseignementId"
      AND f."etablissementId" = current_etablissement_id()
  ));


-- ============================================================
-- GROUPE 5 — Contenu pédagogique (ENSEIGNANT crée, ETUDIANT lit via épreuve)
-- ============================================================

-- Question (créée par un enseignant — auteurId)
CREATE POLICY "Question_select" ON "Question"
  FOR SELECT TO neondb_owner
  USING (
    -- ENSEIGNANT : ses questions (auteurId) + questions partagées (auteurId IS NULL)
    (is_enseignant() AND ("auteurId" = current_user_id() OR "auteurId" IS NULL))
    -- RESPONSABLE : questions de son établissement (via filière de l'épreuve)
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "Epreuve" e ON e."id" = eq."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE eq."questionId" = "Question"."id"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ETUDIANT : questions des épreuves où il a une session
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "SessionPassation" sp ON sp."epreuveId" = eq."epreuveId"
      WHERE eq."questionId" = "Question"."id"
        AND sp."etudiantId" = current_user_id()
    ))
    -- ADMIN : via accès établissement
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "Epreuve" e ON e."id" = eq."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE eq."questionId" = "Question"."id"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Question_modify_enseignant" ON "Question"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND ("auteurId" = current_user_id() OR "auteurId" IS NULL))
  WITH CHECK (is_enseignant() AND "auteurId" = current_user_id());

-- Epreuve (créée par un enseignant — enseignantId)
CREATE POLICY "Epreuve_select" ON "Epreuve"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f WHERE f."id" = "Epreuve"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "Epreuve"."id"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f WHERE f."id" = "Epreuve"."filiereId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Epreuve_modify_enseignant" ON "Epreuve"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "enseignantId" = current_user_id())
  WITH CHECK (is_enseignant() AND "enseignantId" = current_user_id());

-- EpreuveQuestion (liaison épreuve ↔ question — via ownership épreuve)
CREATE POLICY "EpreuveQuestion_select" ON "EpreuveQuestion"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveQuestion"."epreuveId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "EpreuveQuestion_modify_enseignant" ON "EpreuveQuestion"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ));

-- EpreuveDocument (liaison épreuve ↔ document — via ownership épreuve)
CREATE POLICY "EpreuveDocument_select" ON "EpreuveDocument"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveDocument"."epreuveId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "EpreuveDocument_modify_enseignant" ON "EpreuveDocument"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ));

-- Document (possédé par ownerId — tout rôle peut posséder des documents)
CREATE POLICY "Document_select" ON "Document"
  FOR SELECT TO neondb_owner
  USING (
    "ownerId" = current_user_id()
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Document"."ownerId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Document"."ownerId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Document_modify_owner" ON "Document"
  FOR ALL TO neondb_owner
  USING ("ownerId" = current_user_id())
  WITH CHECK ("ownerId" = current_user_id());

-- Chapter (via document ownership)
CREATE POLICY "Chapter_select" ON "Chapter"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
      AND d."ownerId" = current_user_id()
  ));
CREATE POLICY "Chapter_modify_owner" ON "Chapter"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
      AND d."ownerId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
      AND d."ownerId" = current_user_id()
  ));

-- Devoir (créé par un enseignant — enseignantId)
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
CREATE POLICY "Devoir_modify_enseignant" ON "Devoir"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "enseignantId" = current_user_id())
  WITH CHECK (is_enseignant() AND "enseignantId" = current_user_id());

-- GrilleEvaluation (via devoir ownership)
CREATE POLICY "GrilleEvaluation_select" ON "GrilleEvaluation"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND (
        (is_enseignant() AND d."enseignantId" = current_user_id())
        OR (is_responsable() AND EXISTS (
          SELECT 1 FROM "User" u WHERE u."id" = d."enseignantId"
            AND u."etablissementId" = current_etablissement_id()
        ))
      )
  ));
CREATE POLICY "GrilleEvaluation_modify_enseignant" ON "GrilleEvaluation"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND d."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND d."enseignantId" = current_user_id()
  ));


-- ============================================================
-- GROUPE 6 — Utilisateurs & comptes
-- ============================================================

-- User (table centrale — accès complexes par rôle)
CREATE POLICY "User_select" ON "User"
  FOR SELECT TO neondb_owner
  USING (
    -- Tout utilisateur se voit lui-même
    "id" = current_user_id()
    -- ETUDIANT : voit aussi les enseignants de ses filières (pour aide)
    OR (is_etudiant() AND is_enseignant() AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      JOIN "User" me ON me."id" = current_user_id()
      WHERE ef."enseignantId" = "User"."id"
        AND ef."filiereId" = me."filiereId"
    ))
    -- ENSEIGNANT : voit les étudiants de ses filières
    OR (is_enseignant() AND "role" = 'ETUDIANT' AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = current_user_id()
        AND ef."filiereId" = "User"."filiereId"
    ))
    -- RESPONSABLE : voit tous les utilisateurs de son établissement
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    -- ADMIN : pas d'accès direct aux utilisateurs d'établissement (sauf via EtablissementAccess)
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
    OR (is_admin() AND "etablissementId" IS NULL AND "role" = 'ADMIN')
  );
-- UPDATE : un utilisateur modifie son propre profil ; RESPONSABLE gère son établissement
CREATE POLICY "User_update" ON "User"
  FOR UPDATE TO neondb_owner
  USING (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  )
  WITH CHECK (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  );
-- INSERT : RESPONSABLE crée des utilisateurs dans son établissement ; ADMIN crée des ADMIN
CREATE POLICY "User_insert" ON "User"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("role" = 'ADMIN' OR ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))))
  );
-- DELETE : RESPONSABLE supprime dans son établissement ; ADMIN avec accès
CREATE POLICY "User_delete" ON "User"
  FOR DELETE TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  );

-- Invitation (gérée par RESPONSABLE de l'établissement)
CREATE POLICY "Invitation_select" ON "Invitation"
  FOR SELECT TO neondb_owner
  USING (
    "createdById" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  );
CREATE POLICY "Invitation_modify" ON "Invitation"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  );

-- PasswordReset (self-service — l'utilisateur réinitialise son propre mot de passe)
CREATE POLICY "PasswordReset_select_self" ON "PasswordReset"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id() OR is_admin());
CREATE POLICY "PasswordReset_modify_self" ON "PasswordReset"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id() OR is_admin())
  WITH CHECK (true);  -- INSERT par le backend (système d'auth)

-- PushSubscription (notifications push — par utilisateur)
CREATE POLICY "PushSubscription_all_self" ON "PushSubscription"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());


-- ============================================================
-- GROUPE 7 — Évaluation & résultats
-- ============================================================

-- SessionPassation (session d'examen d'un étudiant pour une épreuve)
CREATE POLICY "SessionPassation_select" ON "SessionPassation"
  FOR SELECT TO neondb_owner
  USING (
    -- ETUDIANT : ses propres sessions
    (is_etudiant() AND "etudiantId" = current_user_id())
    -- ENSEIGNANT : sessions pour ses épreuves
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    -- RESPONSABLE : sessions de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès autorisé
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
-- INSERT : ETUDIANT crée sa propre session ; ENSEIGNANT crée pour ses épreuves
CREATE POLICY "SessionPassation_insert" ON "SessionPassation"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
-- UPDATE : ETUDIANT modifie sa session ; ENSEIGNANT modifie pour ses épreuves
CREATE POLICY "SessionPassation_update" ON "SessionPassation"
  FOR UPDATE TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
  );
-- DELETE : ENSEIGNANT/RESPONSABLE
CREATE POLICY "SessionPassation_delete" ON "SessionPassation"
  FOR DELETE TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- Reponse (réponse d'un étudiant à une question dans une session)
CREATE POLICY "Reponse_select" ON "Reponse"
  FOR SELECT TO neondb_owner
  USING (
    -- ETUDIANT : ses réponses (via sa session)
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    -- ENSEIGNANT : réponses pour ses épreuves (correction)
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    -- RESPONSABLE : réponses de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
-- INSERT/UPDATE : ETUDIANT pendant sa session ; ENSEIGNANT pendant la correction
CREATE POLICY "Reponse_modify" ON "Reponse"
  FOR ALL TO neondb_owner
  USING (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
  );

-- Resultat (résultat d'une session — lié à sessionId)
CREATE POLICY "Resultat_select" ON "Resultat"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Resultat"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Resultat_modify" ON "Resultat"
  FOR ALL TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- Soumission (devoir étudiant)
CREATE POLICY "Soumission_select" ON "Soumission"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Soumission_insert_etudiant" ON "Soumission"
  FOR INSERT TO neondb_owner
  WITH CHECK (is_etudiant() AND "etudiantId" = current_user_id());
CREATE POLICY "Soumission_update" ON "Soumission"
  FOR UPDATE TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- Certificat (émis pour un étudiant)
CREATE POLICY "Certificat_select" ON "Certificat"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Certificat_modify" ON "Certificat"
  FOR ALL TO neondb_owner
  USING (
    (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- ValidationUE (validation d'unité d'enseignement pour un étudiant)
CREATE POLICY "ValidationUE_select" ON "ValidationUE"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (NOT is_admin() AND current_etablissement_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "ValidationUE_modify" ON "ValidationUE"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
      AND u."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
      AND u."etablissementId" = current_etablissement_id()
  ));

-- SessionSpeciale (sessions d'examen spéciales — créées par creeParId, liées à une épreuve)
CREATE POLICY "SessionSpeciale_select" ON "SessionSpeciale"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "creeParId" = current_user_id())
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "SessionSpeciale"."epreuveDeriveeId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionSpeciale"."epreuveDeriveeId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionSpeciale"."epreuveDeriveeId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "SessionSpeciale_modify" ON "SessionSpeciale"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "creeParId" = current_user_id())
  WITH CHECK (is_enseignant() AND "creeParId" = current_user_id());


-- ============================================================
-- GROUPE 8 — Outils d'apprentissage (owner = userId)
-- ============================================================

-- ChatThread (fil de discussion sur un document)
CREATE POLICY "ChatThread_all_owner" ON "ChatThread"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- ChatMessage (via thread ownership)
CREATE POLICY "ChatMessage_select" ON "ChatMessage"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ));
CREATE POLICY "ChatMessage_modify" ON "ChatMessage"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ));

-- ReviewItem (items de révision — owner userId)
CREATE POLICY "ReviewItem_all_owner" ON "ReviewItem"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- Flashcard (flashcards — via document ownership)
CREATE POLICY "Flashcard_select" ON "Flashcard"
  FOR SELECT TO neondb_owner
  USING (
    "documentId" IS NULL  -- flashcards orphelines (système)
    OR EXISTS (
      SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
        AND d."ownerId" = current_user_id()
    )
  );
CREATE POLICY "Flashcard_modify" ON "Flashcard"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
      AND d."ownerId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
      AND d."ownerId" = current_user_id()
  ));

-- StudySession (sessions d'étude — owner userId)
CREATE POLICY "StudySession_all_owner" ON "StudySession"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- PracticeAttempt (tentatives d'exercice — owner userId)
CREATE POLICY "PracticeAttempt_select" ON "PracticeAttempt"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());
-- INSERT seulement (tentatives immuables après création)
CREATE POLICY "PracticeAttempt_insert" ON "PracticeAttempt"
  FOR INSERT TO neondb_owner
  WITH CHECK ("userId" = current_user_id());

-- HelpThread (fil d'aide — ETUDIANT propriétaire, ENSEIGNANT assigné)
CREATE POLICY "HelpThread_select" ON "HelpThread"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "HelpThread_modify" ON "HelpThread"
  FOR ALL TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND ("enseignantId" = current_user_id() OR "enseignantId" IS NULL))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- HelpMessage (messages d'aide — via thread)
CREATE POLICY "HelpMessage_select" ON "HelpMessage"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "HelpThread" ht WHERE ht."id" = "HelpMessage"."threadId"
      AND (
        (ht."etudiantId" = current_user_id())
        OR (ht."enseignantId" = current_user_id())
        OR (is_responsable() AND EXISTS (
          SELECT 1 FROM "User" u WHERE u."id" = ht."etudiantId"
            AND u."etablissementId" = current_etablissement_id()
        ))
      )
  ));
CREATE POLICY "HelpMessage_insert" ON "HelpMessage"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    "auteurId" = current_user_id()
    AND EXISTS (
      SELECT 1 FROM "HelpThread" ht WHERE ht."id" = "HelpMessage"."threadId"
        AND (
          (ht."etudiantId" = current_user_id())
          OR (ht."enseignantId" = current_user_id())
        )
    )
  );


-- ============================================================
-- GROUPE 9 — Système & audit
-- ============================================================

-- AuditLog (journal d'audit — ADMIN plateforme + RESPONSABLE établissement)
CREATE POLICY "AuditLog_select" ON "AuditLog"
  FOR SELECT TO neondb_owner
  USING (
    -- ADMIN : voit tout (journal plateforme)
    is_admin()
    -- RESPONSABLE : logs de son établissement (via userId)
    OR (is_responsable() AND (
      "userId" = current_user_id()
      OR EXISTS (
        SELECT 1 FROM "User" u WHERE u."id" = "AuditLog"."userId"
          AND u."etablissementId" = current_etablissement_id()
      )
      OR "userId" IS NULL
    ))
    -- ENSEIGNANT/ETUDIANT : ses propres logs
    OR ("userId" = current_user_id())
  );
-- INSERT par le backend (système) — pas de restriction sur le user_id
CREATE POLICY "AuditLog_insert_system" ON "AuditLog"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);

-- Alerte (alertes — par scope : userId, filiereId, epreuveId)
CREATE POLICY "Alerte_select" ON "Alerte"
  FOR SELECT TO neondb_owner
  USING (
    -- Alerte adressée à l'utilisateur courant
    "userId" = current_user_id()
    -- RESPONSABLE : alertes de son établissement (filiereId/epreuveId scopés)
    OR (is_responsable() AND (
      EXISTS (
        SELECT 1 FROM "Filiere" f WHERE f."id" = "Alerte"."filiereId"
          AND f."etablissementId" = current_etablissement_id()
      )
      OR EXISTS (
        SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
        WHERE e."id" = "Alerte"."epreuveId"
          AND f."etablissementId" = current_etablissement_id()
      )
    ))
    -- ENSEIGNANT : alertes sur ses épreuves
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "Alerte"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    -- ADMIN : alertes plateforme (pas scopées à un établissement)
    OR (is_admin() AND "userId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)
  );
-- INSERT/UPDATE par le backend (système de surveillance)
CREATE POLICY "Alerte_insert_system" ON "Alerte"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);
CREATE POLICY "Alerte_update" ON "Alerte"
  FOR UPDATE TO neondb_owner
  USING (
    "userId" = current_user_id()
    OR is_responsable()
    OR is_admin()
  )
  WITH CHECK (true);


-- ============================================================
-- FIN — Toutes les policies RLS sont en place.
-- ============================================================
-- Récapitulatif :
--   Groupe 1 (ADMIN only)     : 6 tables  (Plan, PlatformSettings, AIProviderConfig, AIFailoverEvent, MonitoringEvent, NotificationAdmin)
--   Groupe 2 (plateforme+étab) : 4 tables  (IpWhitelist, Facture, Abonnement, BadgeDefinition)
--   Groupe 3 (étab core)       : 4 tables  (Etablissement, EtablissementAccess, SecuritySettings, AnneeAcademique)
--   Groupe 4 (structure acad)  : 5 tables  (Filiere, UniteEnseignement, UniteEnseignementFiliere, EnseignantFiliere, Affectation)
--   Groupe 5 (contenu)         : 8 tables  (Question, Epreuve, EpreuveQuestion, EpreuveDocument, Document, Chapter, Devoir, GrilleEvaluation)
--   Groupe 6 (utilisateurs)    : 4 tables  (User, Invitation, PasswordReset, PushSubscription)
--   Groupe 7 (évaluation)      : 7 tables  (SessionPassation, Reponse, Resultat, Soumission, Certificat, ValidationUE, SessionSpeciale)
--   Groupe 8 (apprentissage)   : 8 tables  (ChatThread, ChatMessage, ReviewItem, Flashcard, StudySession, PracticeAttempt, HelpThread, HelpMessage)
--   Groupe 9 (système)         : 2 tables  (AuditLog, Alerte)
--   -------------------------
--   TOTAL                      : 48 tables (BadgeProgression = owner userId, voir ci-dessous)
-- ============================================================

-- BadgeProgression (progression de badges — owner userId, oubliée plus haut)
CREATE POLICY "BadgeProgression_select_self" ON "BadgeProgression"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());
CREATE POLICY "BadgeProgression_modify_system" ON "BadgeProgression"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());
