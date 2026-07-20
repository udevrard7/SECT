-- Rollback 000086 : restaure anneeAcademiqueId nullable + FK ON DELETE SET NULL.
-- ATTENTION : les lignes purgées à l'étape 3 (orphelins résiduels) et les
-- doublons dédupliqués à l'étape 1 NE SONT PAS restaurés. Le rollback ne fait
-- que relâcher la contrainte NOT NULL et revenir à la FK SET NULL.

-- ─── 5. DROP NOT NULL ───
ALTER TABLE "ValidationUE" ALTER COLUMN "anneeAcademiqueId" DROP NOT NULL;

-- ─── 4. Restauration FK ON DELETE SET NULL ───
ALTER TABLE "ValidationUE" DROP CONSTRAINT IF EXISTS "ValidationUE_anneeAcademiqueId_fkey";
ALTER TABLE "ValidationUE" ADD CONSTRAINT "ValidationUE_anneeAcademiqueId_fkey"
  FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- NB : étapes 1 (déduplication), 2 (backfill), 3 (purge orphelins) ne sont pas
-- réversibles — les données modifiées/supprimées ne peuvent être restaurées.
