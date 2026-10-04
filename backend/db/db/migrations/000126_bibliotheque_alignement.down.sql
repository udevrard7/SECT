-- ============================================================
-- Migration 000126 (DOWN) — retire le paquet enseignant P3.
-- Ordre inverse : fonction d'abord, puis policies, puis tables.
-- ============================================================

DROP FUNCTION IF EXISTS public.conformite_referentiels_etablissement(text);

DROP POLICY IF EXISTS "AlignementOuvrage_delete" ON "AlignementOuvrage";
DROP POLICY IF EXISTS "AlignementOuvrage_update" ON "AlignementOuvrage";
DROP POLICY IF EXISTS "AlignementOuvrage_insert" ON "AlignementOuvrage";
DROP POLICY IF EXISTS "AlignementOuvrage_select" ON "AlignementOuvrage";
DROP TABLE IF EXISTS "AlignementOuvrage";

DROP POLICY IF EXISTS "OuvrageSection_delete" ON "OuvrageSection";
DROP POLICY IF EXISTS "OuvrageSection_update" ON "OuvrageSection";
DROP POLICY IF EXISTS "OuvrageSection_insert" ON "OuvrageSection";
DROP POLICY IF EXISTS "OuvrageSection_select" ON "OuvrageSection";
DROP TABLE IF EXISTS "OuvrageSection";
