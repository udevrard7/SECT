-- ============================================================
-- Migration 000140 (DOWN) — annule les colonnes couverture d'ouvrage.
-- Les PNG de couverture restent dans R2 sous ouvrages/{id}/couverture.png
-- (clés orphelines inoffensives — le worker de purge R2 les ramassera
-- avec le préfixe ouvrages/ à la suppression de l'ouvrage).
-- ============================================================

ALTER TABLE "Ouvrage"
        DROP COLUMN IF EXISTS "cheminCouverture",
        DROP COLUMN IF EXISTS "couvertureEchecAt";

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Ouvrage'
            AND column_name IN ('cheminCouverture', 'couvertureEchecAt')) = 0,
         'Les colonnes couverture doivent être retirées';
END $$;
