-- ============================================================
-- Migration 000123 (DOWN) — rollback de la bibliothèque numérique P1
-- Ordre inverse de l'up : policies, table, enum.
-- NB : le soft delete n'existe plus après DROP TABLE (les octets R2
-- restent — la purge du stockage est un job séparé, cf. ADR-0007 §R2).
-- ============================================================

DROP POLICY IF EXISTS "Ouvrage_update" ON "Ouvrage";
DROP POLICY IF EXISTS "Ouvrage_insert" ON "Ouvrage";
DROP POLICY IF EXISTS "Ouvrage_select" ON "Ouvrage";

DROP TABLE IF EXISTS "Ouvrage";

DROP TYPE IF EXISTS "CategorieOuvrage";
