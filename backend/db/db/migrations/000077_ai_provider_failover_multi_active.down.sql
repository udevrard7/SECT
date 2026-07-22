-- 000077_ai_provider_failover_multi_active.down.sql
-- Rollback : recréer la contrainte single_active_per_capability
-- ATTENTION : ne recréer que si aucun doublon (1 seul actif par capability)

-- D'abord s'assurer qu'il n'y a qu'1 provider actif par capability
-- (sinon le CREATE UNIQUE INDEX échouera)
DELETE FROM "AIProviderConfig" a USING "AIProviderConfig" b
WHERE a.id <> b.id
  AND COALESCE(a.capability, 'chat') = COALESCE(b.capability, 'chat')
  AND a."isActive" = true AND b."isActive" = true
  AND a.priority > b.priority;

-- Recréer l'index partiel unique
CREATE UNIQUE INDEX IF NOT EXISTS "AIProviderConfig_single_active_per_capability"
  ON "AIProviderConfig" (COALESCE("capability", 'chat')) WHERE "isActive" = true;
