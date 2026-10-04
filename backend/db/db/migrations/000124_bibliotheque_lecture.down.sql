-- ============================================================
-- 000124 (down) — retire la lecture mesurée (P2 bibliothèque).
-- Ordre : la fonction d'abord (elle référence OuvrageLecture), puis
-- les policies, puis la table. Tout est IF EXISTS (idempotence,
-- pattern 000123 down).
-- ============================================================

DROP FUNCTION IF EXISTS public.bibliotheque_activite_etablissement(text);

DROP POLICY IF EXISTS "OuvrageLecture_update" ON "OuvrageLecture";
DROP POLICY IF EXISTS "OuvrageLecture_insert" ON "OuvrageLecture";
DROP POLICY IF EXISTS "OuvrageLecture_select" ON "OuvrageLecture";

DROP TABLE IF EXISTS "OuvrageLecture";
