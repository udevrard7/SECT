-- Rollback de la migration 000076 : réactive les RESPONSABLES orphelins
-- ATTENTION : ce rollback ne restaure PAS les établissements supprimés.
-- Il ne fait que réactiver les utilisateurs qui étaient orphelins.

BEGIN;

-- On ne peut pas restaurer le rôle RESPONSABLE sans établissement associé.
-- Le rollback réactive simplement les comptes désactivés par la migration.
-- L'admin devra recréer les établissements et réaffecter les rôles manuellement.

UPDATE "User"
SET "actif" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "etablissementId" IS NULL
  AND "actif" = false;

COMMIT;
