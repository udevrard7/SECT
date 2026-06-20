/**
 * AI Providers - Public API
 *
 * This is the main entry point for AI functionality.
 * Import getAIProvider() and use it to make chat completions.
 * Failover is transparent — no code changes needed in consuming routes.
 */

export { getAIProvider, getFailoverProviderForAdmin, createProviderFromConfig, invalidateProviderCache, configToProviderInfo, configToProviderInfoWithPriority } from './factory'
export type { AIProvider, AIProviderType, AIProviderConfig, AIProviderInfo, ChatMessage, ChatCompletionResult, FailoverEventType, ProviderHealthStatus, FailoverConfigType } from './types'
export { PROVIDER_TYPES } from './types'
export { ZAIProvider } from './zai-provider'
export { OpenAICompatibleProvider } from './openai-compatible-provider'
export { AnthropicProvider } from './anthropic-provider'
export { FailoverProvider, getFailoverProvider } from './failover-provider'
export type { FailoverConfig } from './failover-provider'
