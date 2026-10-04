-- ============================================================
-- Migration 000121 (DOWN) — RLS sur IAUsage
-- SECT-DETTES-AUDIT-2
-- ============================================================
-- Retire les policies + désactive RLS sur IAUsage. Réversible
-- intégralement (aucune donnée touchée) — retour à l'état 000059/000059+.
-- ⚠️ Ne ré-appliquer ce down QUE si le code backend (quota.go via
-- WithSystemTx) est redevenu compatible pool-direct, ou simultanément
-- au rollback de ce code.
-- ============================================================

DROP POLICY IF EXISTS "IAUsage_select" ON "IAUsage";
DROP POLICY IF EXISTS "IAUsage_insert" ON "IAUsage";
DROP POLICY IF EXISTS "IAUsage_update" ON "IAUsage";

ALTER TABLE "IAUsage" DISABLE ROW LEVEL SECURITY;
