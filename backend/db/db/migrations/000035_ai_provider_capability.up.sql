-- 000035_ai_provider_capability.up.sql
-- ============================================================================
-- Fix DASHSCOPE-AUDIO-1 : support des providers IA spécialisés par capacité
-- (chat vs tts vs audio).
--
-- Contexte :
-- Avant, AIProviderConfig n'avait aucune notion de "capacité" — un provider
-- était soit "chat" (OpenAI-compatible /chat/completions) soit rien. Le worker
-- audio réutilisait le MÊME provider actif pour le script (chat) ET le TTS
-- (audio), en hardcodedant l'endpoint OpenAI /audio/speech.
--
-- Problème :
-- - DashScope (Alibaba Bailian) expose les modèles TTS (qwen3-tts-flash, etc.)
--   via l'API native /api/v1/services/audio/tts, PAS via /audio/speech.
-- - Impossible de configurer un provider TTS dédié sans casser le provider
--   chat (la contrainte AIProviderConfig_single_active limitait à 1 actif).
--
-- Fix :
-- 1. Ajouter la colonne "capability" (TEXT, nullable pour rétrocompatibilité).
--    Valeurs : 'chat' (défaut implicite si NULL), 'tts', 'audio', 'transcription'.
--    NULL est traité comme 'chat' côté Go (réto-compatible avec les providers
--    existants qui n'ont pas cette colonne renseignée).
-- 2. Remplacer l'index partiel unique "1 seul provider actif" par
--    "1 seul provider actif PAR capability" — ce qui permet d'avoir
--    simultanément un provider chat actif ET un provider tts actif.
--
-- Impact :
-- - Les providers existants (NULL capability) restent valides et sont traités
--   comme capability='chat'.
-- - Le worker audio peut maintenant chercher un provider capability='tts'
--   dédié pour la synthèse, et un provider capability='chat' pour le script.
-- ============================================================================

-- 1. Ajouter la colonne capability (nullable pour rétrocompatibilité)
ALTER TABLE "AIProviderConfig" ADD COLUMN IF NOT EXISTS "capability" TEXT;

-- 2. Backfill : tous les providers existants deviennent capability='chat'
--    (valeur par défaut implicite côté Go, mais on l'écrit explicitement
--    pour la clarté des requêtes SQL et l'index partiel ci-dessous).
UPDATE "AIProviderConfig" SET "capability" = 'chat' WHERE "capability" IS NULL;

-- 3. Remplacer l'index "1 seul actif global" par "1 seul actif par capability"
DROP INDEX IF EXISTS "AIProviderConfig_single_active";

-- Index partiel : pour chaque capability, au plus 1 provider actif.
-- Les providers avec capability IS NULL sont traités comme 'chat' via COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS "AIProviderConfig_single_active_per_capability"
  ON "AIProviderConfig" (COALESCE("capability", 'chat')) WHERE "isActive" = true;
