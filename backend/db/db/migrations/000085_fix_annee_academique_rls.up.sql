-- ════════════════════════════════════════════════════════════════════════════
-- 000085 — Fix AnneeAcademique RLS policies for sect_app role (SECT-ANNEE-RLS-FIX-2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : en production, les RESPONSABLE (et ENSEIGNANT B2C) ne peuvent PAS créer
--       ni modifier une année académique via l'API. Le backend retourne 200/201
--       mais l'écriture affecte 0 ligne (silent RLS failure), identique au bug
--       RESPONSABLE-DELETE-BUG corrigé par 000078 sur la table User.
--
-- CAUSE RACINE :
--   Les policies AnneeAcademique_select (000007) et AnneeAcademique_modify_responsable
--   (recréée par 000062_b2c_self_service) sont `TO neondb_owner`. En production,
--   le backend Render se connecte en tant que rôle `sect_app` (NON membre de
--   `neondb_owner` — vérifié pg_auth_members).
--   → Aucune policy ne s'applique à `sect_app` → RLS deny by default
--   → INSERT/UPDATE/DELETE FROM "AnneeAcademique" affecte 0 rows sans erreur.
--
--   Le self-service B2C fonctionne uniquement parce que create_b2c_subscription()
--   est SECURITY DEFINER (bypass RLS, exécuté en tant que neondb_owner).
--   Toute écriture "normale" (depuis le frontend RESPONSABLE) est silencieusement
--   perdue.
--
-- FIX : passer les 2 policies à `TO PUBLIC` (clone du pattern 000078 pour User).
--       Les clauses USING/WITH CHECK sont inchangées (mêmes droits métier).
--
-- PRÉREQUIS déjà satisfait :
--   - is_enseignant_in_personal_etab() a déjà GRANT EXECUTE TO PUBLIC (000078
--     lignes 37-38). Sans cela, sect_app évaluerait la fonction → permission denied.
--
-- IMPACT :
--   - Les RESPONSABLE peuvent créer/modifier/supprimer les années de leur étab.
--   - Les ENSEIGNANT B2C (étab personnel) peuvent idem sur leur étab.
--   - Les ADMIN voient toutes les années (clause admin_has_etablissement_access).
--   - Les ETUDIANT ne sont pas affectés (pas de policy MODIFY pour eux).
--
-- RÉGRESSION : aucune. Les clauses métier sont identiques, seul le `TO` change.
--   Test : un RESPONSABLE créant une année via POST /api/annees-academiques doit
--   maintenant voir la ligne persistée (vérifiable via GET /api/annees-academiques).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. AnneeAcademique_select : TO PUBLIC (inchangée côté clauses) ───
DROP POLICY IF EXISTS "AnneeAcademique_select" ON "AnneeAcademique";
CREATE POLICY "AnneeAcademique_select" ON "AnneeAcademique"
  FOR SELECT TO PUBLIC
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );

-- ─── 2. AnneeAcademique_modify_responsable : TO PUBLIC (clauses 000062 conservées) ───
DROP POLICY IF EXISTS "AnneeAcademique_modify_responsable" ON "AnneeAcademique";
CREATE POLICY "AnneeAcademique_modify_responsable" ON "AnneeAcademique"
  FOR ALL TO PUBLIC
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  );

-- ─── 3. Grants (inchangés — documenté pour traçabilité) ───
-- AnneeAcademique est déjà couvert par :
--   - GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sect_app
--     (migration 000020)
--   - ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
--     DELETE ON TABLES TO sect_app (migration 000020)
-- Les policies passent à TO PUBLIC → sect_app peut maintenant évaluer les clauses
-- (is_responsable, is_enseignant_in_personal_etab, admin_has_etablissement_access
-- ont toutes GRANT EXECUTE TO PUBLIC).
