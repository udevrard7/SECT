-- ============================================================
-- Migration 000117 — policies system-worker (reconstruction)
-- ============================================================
-- CONTEXTE (SECT-ANNEE-SURVEILLANCE) : ces policies ont été appliquées
-- à la main sur la base Neon de production (HORS table schema_migrations)
-- lors d'une session de travail dont le contexte a été perdu — jamais
-- commitées dans le repo. Le numéro 000116 étant pris par
-- 000116_admin_etablissements_activite_annee (SECT-ANNEE-DETTES-5),
-- cette reconstruction prend le numéro suivant libre (000117). Le présent fichier est
-- une RECONSTRUCTION exacte de l'état live (expressions dumpées
-- via pg_policies le 2026-10-14) pour refermer le drift
-- repo ↔ production : une base reconstruite depuis les
-- migrations du repo retrouve désormais les mêmes policies.
--
-- Sur la base actuelle de production, ces policies existent DÉJÀ
-- (appliquées à la main) : si cette migration y est exécutée, elle est
-- un no-op sémantique (DROP IF EXISTS + CREATE à l'identique).
--
-- CONTENU : branches is_system() (workers Go : auto-close,
-- flush sessions, similarité, devoirs/documents) + modification
-- Filière par ADMIN — sous le rôle sect_app (NOBYPASSRLS,
-- policies TO neondb_owner inopérantes), ces chemins système
-- étaient deny-all sans ces policies.
--
-- Aucun changement de comportement pour les rôles applicatifs
-- (etudiant/enseignant/responsable/admin) : les policies
-- ajoutées ne s'ouvrent QUE pour is_system(), à l'exception de
-- Filiere_modify_admin réservée à l'ADMIN avec accès étab.
-- ============================================================

-- A. Branches is_system() pour les tables écrites/lu par les
--    workers Go (pattern déjà établi par 000108/000109).

DROP POLICY IF EXISTS "Epreuve_all_system" ON "Epreuve";
CREATE POLICY "Epreuve_all_system" ON "Epreuve"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "EpreuveQuestion_all_system" ON "EpreuveQuestion";
CREATE POLICY "EpreuveQuestion_all_system" ON "EpreuveQuestion"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "SessionPassation_all_system" ON "SessionPassation";
CREATE POLICY "SessionPassation_all_system" ON "SessionPassation"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Reponse_all_system" ON "Reponse";
CREATE POLICY "Reponse_all_system" ON "Reponse"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Soumission_all_system" ON "Soumission";
CREATE POLICY "Soumission_all_system" ON "Soumission"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Question_all_system" ON "Question";
CREATE POLICY "Question_all_system" ON "Question"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "GrilleEvaluation_all_system" ON "GrilleEvaluation";
CREATE POLICY "GrilleEvaluation_all_system" ON "GrilleEvaluation"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Devoir_all_system" ON "Devoir";
CREATE POLICY "Devoir_all_system" ON "Devoir"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Document_all_system" ON "Document";
CREATE POLICY "Document_all_system" ON "Document"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "DocumentAudio_all_system" ON "DocumentAudio";
CREATE POLICY "DocumentAudio_all_system" ON "DocumentAudio"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "Chapter_all_system" ON "Chapter";
CREATE POLICY "Chapter_all_system" ON "Chapter"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "AIProviderConfig_all_system" ON "AIProviderConfig";
CREATE POLICY "AIProviderConfig_all_system" ON "AIProviderConfig"
    FOR ALL TO PUBLIC
    USING (is_system())
    WITH CHECK (is_system());

-- B. Filiere : modification par ADMIN (avec accès établissement
--    valide) — sinon deny-all sous sect_app (l'ancienne policy
--    était TO neondb_owner uniquement).

DROP POLICY IF EXISTS "Filiere_modify_admin" ON "Filiere";
CREATE POLICY "Filiere_modify_admin" ON "Filiere"
    FOR ALL TO PUBLIC
    USING (is_admin() AND admin_has_etablissement_access("etablissementId"))
    WITH CHECK (is_admin() AND admin_has_etablissement_access("etablissementId"));
