-- ═══════════════════════════════════════════════════════════════
-- Migration 000090 (DOWN) — Affectation publish enrichments
-- Task ID: SECT-AFFECTATION-PUBLISH-ENRICH-1
-- ═══════════════════════════════════════════════════════════════
--
-- Rollback :
--   1. Restaurer la policy Affectation_select d'origine (sans la branche
--      étudiant) — identique à la migration 000024.
--   2. DROP COLUMN publishedAt + publishedById.
-- ═══════════════════════════════════════════════════════════════

-- 1. Restaurer l'ancienne policy Affectation_select (sans la branche étudiant)
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
);

-- 2. DROP COLUMN publishedAt + publishedById
ALTER TABLE "Affectation" DROP COLUMN IF EXISTS "publishedAt";
ALTER TABLE "Affectation" DROP COLUMN IF EXISTS "publishedById";
