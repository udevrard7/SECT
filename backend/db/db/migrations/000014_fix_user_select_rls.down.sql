-- ============================================================
-- Migration 000014 (DOWN) — Rollback : restore la policy bugée d'origine
-- ============================================================
-- ATTENTION : ce rollback réintroduit le bug U4 (CRITICAL). À n'utiliser
-- qu'en cas de régression avérée nécessitant un retour arrière immédiat.
-- ============================================================

DROP POLICY IF EXISTS "User_select" ON "User";

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
