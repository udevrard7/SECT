-- ============================================================
-- Migration 000108 — Préparation bascule runtime vers sect_app
-- (RLS-ACTUAL-SWITCH-1 / suite de 000020)
-- ============================================================
-- CONTEXTE : le backend Render se connecte toujours en tant que
-- neondb_owner (BYPASSRLS=true) → toutes les policies RLS sont
-- contournées en prod. La migration 000020 avait préparé la bascule
-- vers le rôle sect_app (NOBYPASSRLS) sans jamais l'exécuter.
--
-- Cette migration comble les derniers trous détectés par l'audit
-- exhaustif des 180 policies live vs le code Go :
--
--   A. 13 policies étaient `TO neondb_owner` uniquement → elles ne
--      s'appliquent PAS à sect_app (une policy ne s'applique qu'aux
--      rôles listés). Conséquence : modification Filière/UE/
--      EnseignantFiliere par un RESPONSABLE, IdentityPhoto,
--      SessionCapture, SimilarityReport, SecuritySettings —
--      tout serait deny-all sous sect_app. Les expressions sont
--      conservées à l'identique, seul le rôle cible passe à PUBLIC
--      (l'expression filtre déjà par claims app.claims.*).
--
--   B. Filiere_select n'a pas de branche is_system() : les chemins
--      système (comptage quota CheckFilieresQuota, subqueries des
--      notifications surveillance) reçoivent 0 ligne même avec les
--      claims system-worker.
--
--   C. NotificationPreference n'a pas de policy select_system :
--      le dispatcher de notifications (lecture des préférences de
--      l'utilisateur destinataire) recevrait 0 ligne en claims
--      système. PushSubscription a déjà son select_system — on
--      aligne NotificationPreference.
--
--   D. QuestionVote n'a AUCUNE policy (RLS activé sans policy =
--      deny-all) : la banque de questions (upvotes/downvotes)
--      casserait (INSERT/UPDATE/DELETE directs + agrégats publics).
--
-- NB : ces changements sont inertes tant que la connexion se fait
-- en neondb_owner (BYPASSRLS) — ils ne deviennent actifs qu'après
-- la bascule NEON_DATABASE_URL vers sect_app. Rollback de la
-- bascule = redeployer avec l'ancienne URL, SANS régresser cette
-- migration.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- A. Conversion des 13 policies TO neondb_owner → TO PUBLIC
--    (expressions inchangées, issues de pg_get_expr sur la prod)
-- ═══════════════════════════════════════════════════════════════

-- A1. EnseignantFiliere (affectation enseignant ↔ filière par responsable)
DROP POLICY IF EXISTS "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere";
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere"
    FOR ALL TO PUBLIC
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

-- A2. Filiere (création/modification par responsable — cœur du workflow)
DROP POLICY IF EXISTS "Filiere_modify_responsable" ON "Filiere";
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
    FOR ALL TO PUBLIC
    USING (
      (is_responsable() AND ("etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND ("etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
      (is_responsable() AND ("etablissementId" = current_etablissement_id()))
      OR (is_enseignant_in_personal_etab() AND ("etablissementId" = current_etablissement_id()))
    );

-- A3. IdentityPhoto (photos d'identité — insert via system claims côté handler)
DROP POLICY IF EXISTS "IdentityPhoto_modify_system" ON "IdentityPhoto";
CREATE POLICY "IdentityPhoto_modify_system" ON "IdentityPhoto"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "IdentityPhoto_select" ON "IdentityPhoto";
CREATE POLICY "IdentityPhoto_select" ON "IdentityPhoto"
    FOR SELECT TO PUBLIC
    USING (
      ("etudiantId" = current_user_id())
      OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
      OR epreuve_owned_by_me("epreuveId")
      OR epreuve_in_my_etab("epreuveId")
    );

-- A4. PasswordResetToken (accès direct nul côté Go — tout passe par les
--     fonctions SECURITY DEFINER — conversion pour cohérence sémantique)
DROP POLICY IF EXISTS "PasswordResetToken_modify_self" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_modify_self" ON "PasswordResetToken"
    FOR ALL TO PUBLIC
    USING ("userId" = current_user_id())
    WITH CHECK ("userId" = current_user_id());

DROP POLICY IF EXISTS "PasswordResetToken_select_self" ON "PasswordResetToken";
CREATE POLICY "PasswordResetToken_select_self" ON "PasswordResetToken"
    FOR SELECT TO PUBLIC
    USING ("userId" = current_user_id());

-- A5. SecuritySettings (modification par ADMIN)
DROP POLICY IF EXISTS "SecuritySettings_modify_admin" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_modify_admin" ON "SecuritySettings"
    FOR ALL TO PUBLIC
    USING (is_admin())
    WITH CHECK (is_admin());

-- A6. SessionCapture (captures anti-fraud pendant les épreuves — insert
--     avec claims ETUDIANT, CHECK etudiantId = current_user_id())
DROP POLICY IF EXISTS "SessionCapture_insert" ON "SessionCapture";
CREATE POLICY "SessionCapture_insert" ON "SessionCapture"
    FOR INSERT TO PUBLIC
    WITH CHECK ("etudiantId" = current_user_id());

DROP POLICY IF EXISTS "SessionCapture_select" ON "SessionCapture";
CREATE POLICY "SessionCapture_select" ON "SessionCapture"
    FOR SELECT TO PUBLIC
    USING (
      (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
      OR epreuve_owned_by_me("epreuveId")
      OR epreuve_in_my_etab("epreuveId")
      OR ("etudiantId" = current_user_id())
    );

-- A7. SimilarityReport (anti-plagiat — worker en claims system)
DROP POLICY IF EXISTS "SimilarityReport_modify_system" ON "SimilarityReport";
CREATE POLICY "SimilarityReport_modify_system" ON "SimilarityReport"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "SimilarityReport_select" ON "SimilarityReport";
CREATE POLICY "SimilarityReport_select" ON "SimilarityReport"
    FOR SELECT TO PUBLIC
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

-- A8. UniteEnseignement + UniteEnseignementFiliere (création UE par responsable)
DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
    FOR ALL TO PUBLIC
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

DROP POLICY IF EXISTS "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere";
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere"
    FOR ALL TO PUBLIC
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

-- ═══════════════════════════════════════════════════════════════
-- B. Filiere_select : ajout branche is_system()
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Filiere_select" ON "Filiere";
CREATE POLICY "Filiere_select" ON "Filiere"
    FOR SELECT TO PUBLIC
    USING (
      is_system()
      OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
      OR ((NOT is_admin()) AND ("etablissementId" = current_etablissement_id()))
    );

-- ═══════════════════════════════════════════════════════════════
-- C. NotificationPreference : lecture par le dispatcher (claims système)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "NotificationPreference_select_system" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_select_system" ON "NotificationPreference"
    FOR SELECT TO PUBLIC
    USING (is_system());

-- ═══════════════════════════════════════════════════════════════
-- D. QuestionVote : policies complètes
--    - SELECT public : les agrégats up/down sont affichés dans la
--      banque de questions (comportement inchangé vs bypass actuel)
--    - INSERT/UPDATE/DELETE : uniquement son propre vote
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "QuestionVote_select_public" ON "QuestionVote";
CREATE POLICY "QuestionVote_select_public" ON "QuestionVote"
    FOR SELECT TO PUBLIC
    USING (true);

DROP POLICY IF EXISTS "QuestionVote_insert_own" ON "QuestionVote";
CREATE POLICY "QuestionVote_insert_own" ON "QuestionVote"
    FOR INSERT TO PUBLIC
    WITH CHECK ("userId" = current_user_id());

DROP POLICY IF EXISTS "QuestionVote_modify_own" ON "QuestionVote";
CREATE POLICY "QuestionVote_modify_own" ON "QuestionVote"
    FOR ALL TO PUBLIC
    USING ("userId" = current_user_id())
    WITH CHECK ("userId" = current_user_id());
