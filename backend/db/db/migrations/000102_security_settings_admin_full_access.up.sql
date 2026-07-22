-- ============================================================
-- Migration 000102 — SecuritySettings ADMIN full access (SECU-SYNC-FIX)
-- ============================================================
--
-- Bug SECU-SYNC-FIX (CRITICAL) : la page Admin /securite est bloquée :
--   - SecuritySettings_select exige admin_has_etablissement_access() → ADMIN
--     sans EtablissementAccess APPROUVE ne peut PAS LIRE les settings
--   - SecuritySettings_modify_admin exige admin_has_etablissement_access() →
--     ADMIN ne peut PAS MODIFIER (UPDATE/INSERT) les settings → 403
--   - Le handler PATCH vérifie aussi admin_has_etablissement_access → 403
--
-- Incohérence avec Etablissement_select (migration 000028) où ADMIN voit
-- TOUS les établissements sans restriction. L'ADMIN PaaS/SaaS est propriétaire
-- de la plateforme et doit pouvoir configurer les paramètres de sécurité de
-- TOUT établissement via la page /securite.
--
-- Fix : aligner les policies SecuritySettings sur le modèle Etablissement :
--   - SELECT : is_admin() (sans condition d'accès) + non-admin = propre étab
--   - modify : is_admin() (sans condition d'accès) + RESPONSABLE = propre étab
--
-- Cohérent avec la page /securite (ADMIN-only, PaaS/SaaS owner) qui gère
-- TOUS les établissements.
-- ============================================================

-- 1. Sélection : ADMIN voit tout, non-ADMIN voit son établissement
DROP POLICY IF EXISTS "SecuritySettings_select" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_select" ON "SecuritySettings"
  FOR SELECT TO public
  USING (
    is_system()
    OR is_admin()
    OR ((NOT is_admin()) AND ("etablissementId" = current_etablissement_id()))
  );

-- 2. Modification : ADMIN peut tout modifier, RESPONSABLE = propre étab
DROP POLICY IF EXISTS "SecuritySettings_modify_admin" ON "SecuritySettings";
CREATE POLICY "SecuritySettings_modify_admin" ON "SecuritySettings"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- La policy SecuritySettings_modify_responsable est conservée (OR cumulatif).
