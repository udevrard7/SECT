/**
 * AI Failover Provider.
 *
 * Transparently wraps multiple AI providers and automatically switches
 * to the next available provider when the current one fails.
 *
 * Key features:
 * - Priority-based provider ordering
 * - Automatic failover on error
 * - Cooldown periods for failed providers
 * - Health tracking (consecutive failures, last success/failure)
 * - Recovery detection (retry providers after cooldown expires)
 * - Event logging for monitoring
 */

import type { AIProvider, AIProviderConfig, ChatMessage, ChatCompletionResult } from './types'
import { createProviderFromConfig } from './factory'

/** Health status of a single provider (in-memory only) */
interface ProviderHealth {
  providerId: string
  providerName: string
  consecutiveFailures: number
  lastFailureAt: number | null // timestamp
  lastSuccessAt: number | null
  totalCalls: number
  totalFailures: number
  totalFailovers: number
  isCoolingDown: boolean
}

/** Configuration for the failover system */
export interface FailoverConfig {
  enabled: boolean
  maxConsecutiveFailures: number // before provider is marked unhealthy (default: 3)
  cooldownDurationMs: number // how long to wait before retrying a failed provider (default: 5 min)
  retryAllProviders: boolean // after cooldown, retry providers in original priority order
}

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  enabled: true,
  maxConsecutiveFailures: 3,
  cooldownDurationMs: 5 * 60 * 1000, // 5 minutes
  retryAllProviders: true,
}

/** In-memory health tracking */
const healthMap = new Map<string, ProviderHealth>()

/** In-memory failover config */
let failoverConfig: FailoverConfig = { ...DEFAULT_FAILOVER_CONFIG }

/** Cache of provider instances */
const providerInstanceCache = new Map<string, AIProvider>()

/** Provider configs sorted by priority */
let cachedConfigs: AIProviderConfig[] = []
let configCacheExpiry = 0
const CONFIG_CACHE_TTL = 30_000 // 30 seconds

/**
 * FailoverProvider wraps multiple AI providers and provides automatic failover.
 * It implements the AIProvider interface, making it a drop-in replacement.
 */
export class FailoverProvider implements AIProvider {
  readonly id = 'failover-wrapper'
  readonly name = 'AI Failover (auto-switch)'
  readonly providerType = 'ZAI' as const // placeholder type

  /**
   * Execute a chat completion with automatic failover.
   * Tries each provider in priority order until one succeeds.
   */
  async chatCompletion(params: {
    messages: ChatMessage[]
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: unknown
  }): Promise<ChatCompletionResult> {
    const config = failoverConfig

    // If failover is disabled, just use the primary provider
    if (!config.enabled) {
      const primary = await this.getPrimaryProvider()
      if (!primary) {
        throw new Error('Aucun fournisseur IA disponible')
      }
      const provider = this.getOrCreateProvider(primary)
      return provider.chatCompletion(params)
    }

    // Get all providers sorted by priority
    const configs = await this.getSortedConfigs()
    if (configs.length === 0) {
      throw new Error('Aucun fournisseur IA configuré')
    }

    // Filter out providers that are cooling down
    const availableProviders = configs.filter(c => {
      const health = healthMap.get(c.id)
      if (!health || !health.isCoolingDown) return true
      // Check if cooldown has expired
      if (health.lastFailureAt && Date.now() - health.lastFailureAt > config.cooldownDurationMs) {
        // Cooldown expired — mark as available and log recovery
        this.markProviderRecovered(c.id, c.name)
        return true
      }
      return false
    })

    if (availableProviders.length === 0) {
      throw new Error(
        `Tous les fournisseurs IA sont en cooldown. Prochain essai dans ${Math.ceil(config.cooldownDurationMs / 1000)}s.`
      )
    }

    // Try each provider in order
    let lastError: Error | null = null

    for (let i = 0; i < availableProviders.length; i++) {
      const providerConfig = availableProviders[i]
      const provider = this.getOrCreateProvider(providerConfig)

      try {
        // Record the call
        this.recordCallStart(providerConfig.id, providerConfig.name)

        const result = await provider.chatCompletion(params)

        // Success!
        this.recordSuccess(providerConfig.id, providerConfig.name)

        // If this wasn't the primary provider, log a failover recovery
        if (i > 0) {
          const health = healthMap.get(providerConfig.id)
          if (health) {
            health.totalFailovers++
          }
        }

        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Record the failure
        this.recordFailure(providerConfig.id, providerConfig.name, lastError.message)

        // Log if we're about to failover
        if (i < availableProviders.length - 1) {
          const nextProvider = availableProviders[i + 1]
          console.warn(
            `[AI Failover] "${providerConfig.name}" a échoué: ${lastError.message}. ` +
            `Basculement vers "${nextProvider.name}" (priorité ${nextProvider.priority || 99})...`
          )
        }

        // Log failover event to DB (async, non-blocking)
        this.logFailoverEvent(
          'FAIL_OVER',
          providerConfig.name,
          i < availableProviders.length - 1 ? availableProviders[i + 1].name : null,
          `Échec: ${lastError.message}`,
          lastError.message
        ).catch(() => {})
      }
    }

    // All providers failed
    throw new Error(
      `Tous les fournisseurs IA ont échoué. Dernière erreur (${availableProviders[availableProviders.length - 1].name}): ${lastError?.message || 'Erreur inconnue'}`
    )
  }

  /**
   * Test the connection to the primary provider.
   * Required by the AIProvider interface.
   */
  async testConnection(): Promise<{ success: boolean; message: string; responseTime?: number }> {
    try {
      const configs = await this.getSortedConfigs()
      if (configs.length === 0) {
        return { success: false, message: 'Aucun fournisseur IA configuré' }
      }
      const primary = configs[0]
      const provider = this.getOrCreateProvider(primary)
      return provider.testConnection()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: `Erreur de test: ${msg}` }
    }
  }

  /**
   * Test connections for all providers (used by admin UI)
   */
  async testAllConnections(): Promise<Array<{
    id: string
    name: string
    provider: string
    priority: number
    health: ProviderHealth | null
    testResult: { success: boolean; message: string; responseTime?: number } | null
    error?: string
  }>> {
    const configs = await this.getSortedConfigs()
    const results: Array<{
      id: string
      name: string
      provider: string
      priority: number
      health: ProviderHealth | null
      testResult: { success: boolean; message: string; responseTime?: number } | null
      error?: string
    }> = []

    for (const config of configs) {
      try {
        const provider = this.getOrCreateProvider(config)
        const testResult = await provider.testConnection()
        results.push({
          id: config.id,
          name: config.name,
          provider: config.provider,
          priority: config.priority || 99,
          health: this.getHealth(config.id),
          testResult,
        })
      } catch (err) {
        results.push({
          id: config.id,
          name: config.name,
          provider: config.provider,
          priority: config.priority || 99,
          health: this.getHealth(config.id),
          testResult: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return results
  }

  /**
   * Get health status for all providers
   */
  getHealthStatus(): Array<{
    id: string
    name: string
    provider: string
    priority: number
    isActive: boolean
    health: ProviderHealth
  }> {
    const results: Array<{
      id: string
      name: string
      provider: string
      priority: number
      isActive: boolean
      health: ProviderHealth
    }> = []

    for (const config of cachedConfigs) {
      results.push({
        id: config.id,
        name: config.name,
        provider: config.provider,
        priority: config.priority || 99,
        isActive: config.isActive,
        health: this.getHealth(config.id),
      })
    }

    return results
  }

  /**
   * Get the current failover configuration
   */
  getConfig(): FailoverConfig {
    return { ...failoverConfig }
  }

  /**
   * Update the failover configuration
   */
  updateConfig(newConfig: Partial<FailoverConfig>): FailoverConfig {
    failoverConfig = { ...failoverConfig, ...newConfig }
    return { ...failoverConfig }
  }

  /**
   * Reset health for a specific provider (used by admin UI after manual test)
   */
  resetProviderHealth(providerId: string): void {
    healthMap.delete(providerId)
  }

  /**
   * Reset all health tracking
   */
  resetAllHealth(): void {
    healthMap.clear()
  }

  // ─── Private Methods ──────────────────────────────────────────

  private async getSortedConfigs(): Promise<AIProviderConfig[]> {
    if (cachedConfigs.length > 0 && Date.now() < configCacheExpiry) {
      return cachedConfigs
    }

    try {
      const db = null // DB déplacée vers Go backend
      const configs = await db.aIProviderConfig.findMany({
        orderBy: [{ priority: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
      })

      // Filter to providers that have an API key or are ZAI
      const validConfigs = configs.filter(c => {
        if (c.provider === 'ZAI') return true
        return !!c.apiKey
      })

      cachedConfigs = validConfigs as AIProviderConfig[]
      configCacheExpiry = Date.now() + CONFIG_CACHE_TTL

      return cachedConfigs
    } catch (err) {
      console.warn('[AI Failover] Failed to fetch provider configs:', err)
      return cachedConfigs
    }
  }

  private async getPrimaryProvider(): Promise<AIProviderConfig | null> {
    const configs = await this.getSortedConfigs()
    return configs.find(c => c.isActive) || configs[0] || null
  }

  private getOrCreateProvider(config: AIProviderConfig): AIProvider {
    let provider = providerInstanceCache.get(config.id)
    if (!provider) {
      provider = createProviderFromConfig(config)
      providerInstanceCache.set(config.id, provider)
    }
    return provider
  }

  private getHealth(providerId: string): ProviderHealth {
    let health = healthMap.get(providerId)
    if (!health) {
      health = {
        providerId,
        providerName: 'Inconnu',
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        totalCalls: 0,
        totalFailures: 0,
        totalFailovers: 0,
        isCoolingDown: false,
      }
      healthMap.set(providerId, health)
    }
    return health
  }

  private recordCallStart(providerId: string, providerName: string): void {
    const health = this.getHealth(providerId)
    health.providerName = providerName
    health.totalCalls++
  }

  private recordSuccess(providerId: string, providerName: string): void {
    const health = this.getHealth(providerId)
    health.providerName = providerName

    const wasCoolingDown = health.isCoolingDown
    const hadFailures = health.consecutiveFailures > 0

    health.consecutiveFailures = 0
    health.lastSuccessAt = Date.now()
    health.isCoolingDown = false

    // If we just recovered from failures, log it
    if (wasCoolingDown || hadFailures) {
      console.log(`[AI Failover] ✅ "${providerName}" est de nouveau opérationnel`)
      this.logFailoverEvent(
        'RECOVERY',
        providerName,
        null,
        'Le fournisseur a répondu avec succès après un échec',
        null
      ).catch(() => {})
    }
  }

  private recordFailure(providerId: string, providerName: string, errorMsg: string): void {
    const health = this.getHealth(providerId)
    health.providerName = providerName
    health.consecutiveFailures++
    health.lastFailureAt = Date.now()
    health.totalFailures++

    // Check if provider should be put in cooldown
    if (health.consecutiveFailures >= failoverConfig.maxConsecutiveFailures) {
      health.isCoolingDown = true
      console.warn(
        `[AI Failover] ⚠️ "${providerName}" mis en cooldown après ${health.consecutiveFailures} échecs consécutifs. ` +
        `Cooldown: ${Math.ceil(failoverConfig.cooldownDurationMs / 1000)}s`
      )
    }
  }

  private markProviderRecovered(providerId: string, providerName: string): void {
    const health = this.getHealth(providerId)
    health.providerName = providerName
    health.isCoolingDown = false
    health.consecutiveFailures = 0 // Reset to allow retries

    console.log(`[AI Failover] 🔄 Cooldown expiré pour "${providerName}" — réessai autorisé`)
    this.logFailoverEvent(
      'COOLDOWN_EXPIRED',
      providerName,
      null,
      'Cooldown expiré, le fournisseur sera de nouveau testé',
      null
    ).catch(() => {})
  }

  /**
   * Log a failover event to the database (async, fire-and-forget)
   */
  private async logFailoverEvent(
    eventType: string,
    fromProvider: string | null,
    toProvider: string | null,
    reason: string,
    errorDetails: string | null
  ): Promise<void> {
    try {
      const db = null // DB déplacée vers Go backend
      await db.aIFailoverEvent.create({
        data: {
          eventType,
          fromProvider,
          toProvider,
          reason,
          errorDetails,
          resolved: eventType === 'RECOVERY',
        },
      })
    } catch (err) {
      // Non-critical — don't let logging failures break the failover
      console.warn('[AI Failover] Failed to log event to DB:', err)
    }
  }

  /**
   * Invalidate provider configs cache (call after any provider change)
   */
  static invalidateConfigsCache(): void {
    cachedConfigs = []
    configCacheExpiry = 0
    providerInstanceCache.clear()
  }
}

/** Singleton failover provider instance */
let failoverInstance: FailoverProvider | null = null

/**
 * Get the singleton FailoverProvider instance.
 * This is the main entry point for all AI operations.
 */
export function getFailoverProvider(): FailoverProvider {
  if (!failoverInstance) {
    failoverInstance = new FailoverProvider()
  }
  return failoverInstance
}
