-- 000108 down : restaure les 13 policies TO neondb_owner, retire
-- is_system() de Filiere_select, supprime NotificationPreference_select_system
-- et les policies QuestionVote. NB : les changements 000108 sont inertes
-- tant que la connexion se fait en neondb_owner (BYPASSRLS) — le down
-- ne sert qu'au rollback complet de la migration elle-même.

DROP POLICY IF EXISTS "QuestionVote_modify_own" ON "QuestionVote";
DROP POLICY IF EXISTS "QuestionVote_insert_own" ON "QuestionVote";
DROP POLICY IF EXISTS "QuestionVote_select_public" ON "QuestionVote";

DROP POLICY IF EXISTS "NotificationPreference_select_system" ON "NotificationPreference";

DROP POLICY IF EXISTS "Filiere_select" ON "Filiere";
CREATE POLICY "Filiere_select" ON "Filiere"
    FOR SELECT TO PUBLIC
    USING (
      (is_admin() AND admin_has_etablissement_access("etablissementId"))
      OR ((NOT is_admin()) AND ("etablissementId" = current_etablissement_id()))
    );

DROP POLICY IF EXISTS "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere";
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere"
    FOR ALL TO neondb_owner
    USING (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignementFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignementFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignementFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignementFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    );

DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
    FOR ALL TO neondb_owner
    USING (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignement"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignement"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignement"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "UniteEnseignement"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    );

DROP POLICY IF EXISTS "SimilarityReport_select" ON "SimilarityReport";
CREATE POLICY "SimilarityReport_select" ON "SimilarityReport"
    FOR SELECT TO neondb_owner
    USING (
      (is_enseignant() AND EXISTS (
        SELECT 1 FROM "Epreuve" e
        WHERE e.id = "SimilarityReport"."epreuveId"
          AND e."enseignantId" = current_user_id()))
      OR (is_responsable() AND EXISTS (
        SELECT 1 FROM "Epreuve" e
          JOIN "Filiere" f ON f.id = e."filiereId"
        WHERE e.id = "SimilarityReport"."epreuveId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_admin() AND EXISTS (
        SELECT 1 FROM "Epreuve" e
          JOIN "Filiere" f ON f.id = e."filiereId"
        WHERE e.id = "SimilarityReport"."epreuveId"
          AND admin_has_etablissement_access(f."etablissementId")))
      OR ("etudiantAId" = current_user_id())
      OR ("etudiantBId" = current_user_id())
    );

DROP POLICY IF EXISTS "SimilarityReport_modify_system" ON "SimilarityReport";
CREATE POLICY "SimilarityReport_modify_system" ON "SimilarityReport"
    FOR ALL TO neondb_owner
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "SessionCapture_select" ON "SessionCapture";
CREATE POLICY "SessionCapture_select" ON "SessionCapture"
    FOR SELECT TO neondb_owner
    USING (
      (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
      OR epreuve_owned_by_me("epreuveId")
      OR epreuve_in_my_etab("epreuveId")
      OR ("etudiantId" = current_user_id())
    );

DROP POLICY IF EXISTS "SessionCapture_insert" ON "SessionCapture";
CREATE POLICY "SessionCapture_insert" ON "SessionCapture"
    FOR INSERT TO neondb_owner
    WITH CHECK ("etudiantId" = current_user_id());

DROP POLICY IF EXISTS "SecuritySettings_modify_admin" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_modify_admin" ON "SecuritySettings"
    FOR ALL TO neondb_owner
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "PasswordResetToken_select_self" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_select_self" ON "PasswordResetToken"
    FOR SELECT TO neondb_owner
    USING ("userId" = current_user_id());

DROP POLICY IF EXISTS "PasswordResetToken_modify_self" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_modify_self" ON "PasswordResetToken"
    FOR ALL TO neondb_owner
    USING ("userId" = current_user_id())
    WITH CHECK ("userId" = current_user_id());

DROP POLICY IF EXISTS "IdentityPhoto_select" ON "IdentityPhoto";
CREATE POLICY "IdentityPhoto_select" ON "IdentityPhoto"
    FOR SELECT TO neondb_owner
    USING (
      ("etudiantId" = current_user_id())
      OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
      OR epreuve_owned_by_me("epreuveId")
      OR epreuve_in_my_etab("epreuveId")
    );

DROP POLICY IF EXISTS "IdentityPhoto_modify_system" ON "IdentityPhoto";
CREATE POLICY "IdentityPhoto_modify_system" ON "IdentityPhoto"
    FOR ALL TO neondb_owner
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Filiere_modify_responsable" ON "Filiere";
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
    FOR ALL TO neondb_owner
    USING (
      (is_responsable() AND ("etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND ("etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
      (is_responsable() AND ("etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND ("etablissementId" = current_etablissement_id()))
    );

DROP POLICY IF EXISTS "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere";
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere"
    FOR ALL TO neondb_owner
    USING (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "EnseignantFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "EnseignantFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
      (is_responsable() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "EnseignantFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND EXISTS (
        SELECT 1 FROM "Filiere" f
        WHERE f.id = "EnseignantFiliere"."filiereId"
          AND f."etablissementId" = current_etablissement_id()))
    );
