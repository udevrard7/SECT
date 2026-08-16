-- ============================================================
-- Migration 000014 — Fix policy RLS User_select (U4 CRITICAL)
-- ============================================================
--
-- Bug U4 (CRITICAL) : la policy User_select contenait un dead code
-- `is_etudiant() AND is_enseignant()` qui est toujours FALSE (un user ne peut
-- pas avoir deux rôles simultanés). La feature "ETUDIANT voit les enseignants
-- de ses filières" (pour la page aide-etudiants) était donc cassée — un étudiant
-- ne voyait que lui-même via User_select.
--
-- Fix : remplacer `is_etudiant() AND is_enseignant()` par
-- `is_etudiant() AND "User"."role" = 'ENSEIGNANT'` (la cible doit être enseignant,
-- pas le current user).
--
-- Impact : les ETUDIANTS peuvent maintenant voir les ENSEIGNANTS de leurs filières
-- (via EnseignantFiliere JOIN User.me). Nécessaire pour la page aide-etudiants.
-- ============================================================

DROP POLICY IF EXISTS "User_select" ON "User";

CREATE POLICY "User_select" ON "User"
  FOR SELECT TO neondb_owner
  USING (
    -- Tout utilisateur se voit lui-même
    "id" = current_user_id()
    -- ETUDIANT : voit aussi les enseignants de ses filières (pour aide)
    -- U4 fix : la cible doit être ENSEIGNANT (pas le current user).
    OR (is_etudiant() AND "role" = 'ENSEIGNANT' AND EXISTS (
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
