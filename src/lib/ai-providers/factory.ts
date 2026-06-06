/**
 * AI Provider Factory.
 *
 * Reads provider configurations from the database and returns
 * a FailoverProvider that automatically switches between providers
 * based on priority when failures occur.
 *
 * Falls back to Z-AI (env vars / SDK config) if no providers are configured.
 */

import { db } from '@/lib/db'
import type { AIProvider, AIProviderConfig, AIProviderInfo, AIProviderType } from './types'
import { ZAIProvider } from './zai-provider'
import { OpenAICompatibleProvider } from './openai-compatible-provider'
import { AnthropicProvider } from './anthropic-provider'
import { getFailoverProvider, FailoverProvider } from './failover-provider'

/** In-memory cache for the active provider (avoids DB hit on every AI call) */
let cachedProvider: AIProvider | null = null
let cachedProviderId: string | null = null
let cacheExpiry = 0
const CACHE_TTL = 60_000 // 1 minute
let migrationAttempted = false

/**
 * Attempt to run the failover migration if needed.
 * This is called once when the first DB query fails with a schema mismatch.
 */
async function tryRunMigration(): Promise<boolean> {
  if (migrationAttempted) return false
  migrationAttempted = true

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXTAUTH_URL || 'http://localhost:3000'

    console.log('[AI Factory] Schema mismatch detected, running failover migration...')
    const res = await fetch(`${baseUrl}/api/migrate/failover`, { cache: 'no-store' })
    const data = await res.json()

    if (res.ok) {
      console.log('[AI Factory] Migration successful:', data.message)
      // Invalidate Prisma client to pick up new schema
      return true
    } else {
      console.error('[AI Factory] Migration failed:', data.error)
      return false
    }
  } catch (err) {
    console.error('[AI Factory] Migration request failed:', err)
    return false
  }
}

/**
 * Get the current AI provider with automatic failover support.
 * Returns a FailoverProvider that transparently switches between
 * configured providers when failures occur.
 *
 * Uses in-memory cache to avoid DB queries on every AI call.
 */
export async function getAIProvider(): Promise<AIProvider> {
  // Check cache
  if (cachedProvider && cachedProviderId && Date.now() < cacheExpiry) {
    return cachedProvider
  }

  try {
    // Check if there are any providers configured in the DB
    const providerCount = await db.aIProviderConfig.count()

    if (providerCount > 0) {
      // Use the FailoverProvider for automatic failover
      const failover = getFailoverProvider()
      cachedProvider = failover
      cachedProviderId = 'failover'
      cacheExpiry = Date.now() + CACHE_TTL
      return failover
    }
  } catch (err) {
    // If the error is a schema mismatch (missing priority column), try migration
    const errStr = err instanceof Error ? err.message : String(err)
    if (errStr.includes('priority') || errStr.includes('does not exist') || errStr.includes('UndefinedTable')) {
      console.warn('[AI Factory] Possible schema mismatch, attempting auto-migration...')
      const migrated = await tryRunMigration()
      if (migrated) {
        // Retry after migration
        try {
          const providerCount = await db.aIProviderConfig.count()
          if (providerCount > 0) {
            const failover = getFailoverProvider()
            cachedProvider = failover
            cachedProviderId = 'failover'
            cacheExpiry = Date.now() + CACHE_TTL
            return failover
          }
        } catch (retryErr) {
          console.error('[AI Factory] Retry after migration failed:', retryErr)
        }
      }
    }
    console.warn('[AI Factory] Failed to query DB for providers:', errStr)
  }

  // Default: use Z-AI (from env vars or SDK config)
  const defaultProvider = new ZAIProvider()
  cachedProvider = defaultProvider
  cachedProviderId = 'zai-default'
  cacheExpiry = Date.now() + CACHE_TTL
  return defaultProvider
}

/**
 * Get the FailoverProvider directly (for admin health checks).
 * Returns null if no providers are configured.
 */
export async function getFailoverProviderForAdmin(): Promise<FailoverProvider | null> {
  try {
    const providerCount = await db.aIProviderConfig.count()
    if (providerCount > 0) {
      return getFailoverProvider()
    }
  } catch {
    // Ignore
  }
  return null
}

/**
 * Create an AIProvider instance from a database config record.
 */
export function createProviderFromConfig(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'ZAI':
      return new ZAIProvider(config)

    case 'OPENAI':
    case 'OPENAI_COMPATIBLE':
    case 'GOOGLE':
      return new OpenAICompatibleProvider(config)

    case 'ANTHROPIC':
      return new AnthropicProvider(config)

    default:
      console.warn(`[AI Factory] Unknown provider type: ${config.provider}, falling back to Z-AI`)
      return new ZAIProvider(config)
  }
}

/**
 * Convert a DB record to a safe provider info object (no API key exposed).
 */
export function configToProviderInfo(config: any): AIProviderInfo {
  return {
    id: config.id,
    name: config.name,
    provider: config.provider as AIProviderType,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    isActive: config.isActive,
    hasApiKey: !!config.apiKey,
    lastTestAt: config.lastTestAt?.toISOString() || null,
    lastTestOk: config.lastTestOk,
    createdAt: config.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: config.updatedAt?.toISOString() || new Date().toISOString(),
  }
}

/**
 * Convert a DB record to a safe provider info object with priority (no API key exposed).
 */
export function configToProviderInfoWithPriority(config: any): AIProviderInfo & { priority: number } {
  return {
    ...configToProviderInfo(config),
    priority: config.priority ?? 99,
  }
}

/**
 * Invalidate the provider cache.
 * Call this after changing any provider configuration.
 */
export function invalidateProviderCache(): void {
  cachedProvider = null
  cachedProviderId = null
  cacheExpiry = 0
  // Also invalidate the failover provider's internal cache
  FailoverProvider.invalidateConfigsCache()
}
