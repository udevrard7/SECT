-- 000040_etablissement_access_roles_public.up.sql
-- ============================================================================
-- RLS-ROLES-FIX : changer roles={neondb_owner} en roles={public} sur les
-- policies EtablissementAccess_select et EtablissementAccess_modify_responsable.
--
-- Contexte :
-- Les policies EtablissementAccess avec roles={neondb_owner} (spécifique à
-- l'utilisateur propriétaire de la DB) ne sont PAS correctement appliquées par
-- pgx + PgBouncer (mode transaction pooling). Les claims RLS (set_config/
-- SET LOCAL) sont bien posés (current_etablissement_id() et is_responsable()
-- retournent les bonnes valeurs), MAIS RLS filtre quand même toutes les rows.
--
-- Les autres tables (User, Epreuve, etc.) ont des policies roles={public} qui
-- fonctionnent correctement avec pgx + PgBouncer.
--
-- Fix :
-- Recréer les 2 policies en changeant uniquement TO PUBLIC (au lieu de TO
-- neondb_owner). La définition USING/WITH CHECK reste identique — seul le
-- rôle cible change. Cela aligne EtablissementAccess sur les autres tables.
--
-- Après cette migration, le repository List peut revenir à RLS natif
-- (db.WithTx + claims user) sans bypass system-worker.
-- ============================================================================

-- 1. Policy SELECT : roles={neondb_owner} → TO PUBLIC
DROP POLICY IF EXISTS "EtablissementAccess_select" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_select"
  ON "EtablissementAccess"
  FOR SELECT
  TO PUBLIC
  USING (is_admin() OR is_system() OR (is_responsable() AND ("etablissementId" = current_etablissement_id())));

-- 2. Policy UPDATE (modify_responsable) : roles={neondb_owner} → TO PUBLIC
DROP POLICY IF EXISTS "EtablissementAccess_modify_responsable" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_modify_responsable"
  ON "EtablissementAccess"
  FOR UPDATE
  TO PUBLIC
  USING (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  WITH CHECK (is_responsable() AND ("etablissementId" = current_etablissement_id()));
