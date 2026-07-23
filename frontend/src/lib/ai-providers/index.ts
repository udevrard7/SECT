/**
 * AI Providers - Public API
 *
 * This is the main entry point for AI functionality.
 * Import getAIProvider() and use it to make chat completions.
 *
 * Bug #1 (CRITICAL, audit ai-providers 2025) : failover-provider.ts supprimé
 * (code Prisma résiduel cassé `const db = null`). Le failover est maintenant
 * géré côté backend Go (internal/ai/failover.go) — transparent pour le frontend.
 */

export { getAIProvider, getFailoverProviderForAdmin, createProviderFromConfig, invalidateProviderCache, configToProviderInfo, configToProviderInfoWithPriority } from './factory'
export type { AIProvider, AIProviderType, AIProviderConfig, AIProviderInfo, ChatMessage, ChatCompletionResult, FailoverEventType, ProviderHealthStatus, FailoverConfigType } from './types'
export { PROVIDER_TYPES } from './types'
export { ZAIProvider } from './zai-provider'
export { OpenAICompatibleProvider } from './openai-compatible-provider'
export { AnthropicProvider } from './anthropic-provider'
