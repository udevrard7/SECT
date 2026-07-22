-- 000035_ai_provider_capability.down.sql
-- Rollback : revenir à l'état antérieur (pas de colonne capability, index unique global).

DROP INDEX IF EXISTS "AIProviderConfig_single_active_per_capability";

-- Restaurer l'index "1 seul provider actif global"
CREATE UNIQUE INDEX IF NOT EXISTS "AIProviderConfig_single_active"
  ON "AIProviderConfig" ((1)) WHERE "isActive" = true;

-- Supprimer la colonne capability
ALTER TABLE "AIProviderConfig" DROP COLUMN IF EXISTS "capability";
