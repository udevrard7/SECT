-- ============================================================
-- Migration 000117 (rollback) — policies system-worker
-- ============================================================
-- Supprime les 13 policies créées par 000117 (branches
-- is_system() + Filiere_modify_admin).
-- ============================================================

DROP POLICY IF EXISTS "Epreuve_all_system" ON "Epreuve";
DROP POLICY IF EXISTS "EpreuveQuestion_all_system" ON "EpreuveQuestion";
DROP POLICY IF EXISTS "SessionPassation_all_system" ON "SessionPassation";
DROP POLICY IF EXISTS "Reponse_all_system" ON "Reponse";
DROP POLICY IF EXISTS "Soumission_all_system" ON "Soumission";
DROP POLICY IF EXISTS "Question_all_system" ON "Question";
DROP POLICY IF EXISTS "GrilleEvaluation_all_system" ON "GrilleEvaluation";
DROP POLICY IF EXISTS "Devoir_all_system" ON "Devoir";
DROP POLICY IF EXISTS "Document_all_system" ON "Document";
DROP POLICY IF EXISTS "DocumentAudio_all_system" ON "DocumentAudio";
DROP POLICY IF EXISTS "Chapter_all_system" ON "Chapter";
DROP POLICY IF EXISTS "AIProviderConfig_all_system" ON "AIProviderConfig";
DROP POLICY IF EXISTS "Filiere_modify_admin" ON "Filiere";
