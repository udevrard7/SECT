-- 000057 down: inverse le soft delete Abonnement (supprime colonne deletedAt + index).

-- 1. Supprimer l'index partiel sur deletedAt
DROP INDEX IF EXISTS "Abonnement_deletedAt_idx";

-- 2. Supprimer la colonne deletedAt
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "deletedAt";
