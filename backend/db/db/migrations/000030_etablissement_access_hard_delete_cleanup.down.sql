-- Rollback migration 000030
-- Attention : les lignes ANNULE/REFUSE supprimées ne peuvent pas être restaurées
-- (hard-delete). Ce rollback ne fait rien par conception.
SELECT 'Migration 000030 is destructive (hard-delete), no rollback possible'::text;
