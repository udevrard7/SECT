-- Rollback migration 000033
-- Réactive les anciens badges ADMIN et supprime les nouveaux.
UPDATE "BadgeDefinition" SET "actif" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "roleCible" = 'ADMIN' AND "cle" IN ('gardien_plateforme', 'strategiste', 'pilote_ia', 'sensei');

DELETE FROM "BadgeDefinition" WHERE "id" IN (
  'badge-paas-pionnier', 'badge-paas-croissance', 'badge-paas-revenus',
  'badge-paas-securite', 'badge-paas-scale', 'badge-paas-ops'
);
