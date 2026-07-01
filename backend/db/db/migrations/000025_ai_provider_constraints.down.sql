-- 000025 (down) : rollback de l'index partial unique sur AIProviderConfig.

DROP INDEX IF EXISTS "AIProviderConfig_single_active";
