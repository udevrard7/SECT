-- ============================================================
-- Migration 000127 DOWN — Bibliothèque P4 : dimension sociale (1/2)
-- Inverse exact de l'up : 3 tables + 2 enums. Les policies et indexes
-- tombent avec les tables (DROP TABLE les emporte).
-- ============================================================

DROP TABLE IF EXISTS "OuvrageVeille";
DROP TABLE IF EXISTS "OuvrageProposition";
DROP TABLE IF EXISTS "OuvrageAnnotation";
DROP TYPE IF EXISTS "StatutProposition";
DROP TYPE IF EXISTS "VisibiliteAnnotation";
