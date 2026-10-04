-- ============================================================
-- Migration 000128 DOWN — Badges « lecteur assidu » + purge R2
-- Inverse exact de l'up : retire le seed + la policy Ouvrage_delete,
-- et restaure les policies badges à leur état 000007 (TO neondb_owner,
-- self-only) — l'état antérieur du repo, drift connu documenté dans
-- l'ADR-0008 §3 (la prod les avait déjà TO PUBLIC).
-- ============================================================

-- 1. Retirer le seed (les progressions liées partent en CASCADE)
DELETE FROM "BadgeProgression" WHERE "badgeDefinitionId" = 'badge-lecteur-assidu';
DELETE FROM "BadgeDefinition" WHERE "id" = 'badge-lecteur-assidu';

-- 2. Retirer la porte de hard delete (retour au deny 000123)
DROP POLICY IF EXISTS "Ouvrage_delete" ON "Ouvrage";

-- 3. Restaurer les policies badges à l'état 000007 (drift connu :
-- TO neondb_owner, inopérantes sous sect_app — état AVANT cette
-- migration, fidèle au repo d'origine).
DROP POLICY IF EXISTS "BadgeDefinition_select_all" ON "BadgeDefinition";
CREATE POLICY "BadgeDefinition_select_all" ON "BadgeDefinition"
  FOR SELECT TO neondb_owner
  USING (true);

DROP POLICY IF EXISTS "BadgeDefinition_modify_admin" ON "BadgeDefinition";
CREATE POLICY "BadgeDefinition_modify_admin" ON "BadgeDefinition"
  FOR ALL TO neondb_owner
  USING (is_admin() OR is_responsable())
  WITH CHECK (is_admin() OR is_responsable());

DROP POLICY IF EXISTS "BadgeProgression_select_self" ON "BadgeProgression";
CREATE POLICY "BadgeProgression_select_self" ON "BadgeProgression"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());

DROP POLICY IF EXISTS "BadgeProgression_modify_system" ON "BadgeProgression";
CREATE POLICY "BadgeProgression_modify_system" ON "BadgeProgression"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());
