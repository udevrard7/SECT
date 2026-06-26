/**
 * Test du système de failover IA.
 *
 * Simule une panne du fournisseur principal (corruption temporaire de
 * l'apiKey) et observe la bascule vers le fournisseur de secours.
 *
 * Sécurité : l'opération est strictement réversible.
 *   1. Sauvegarde l'apiKey original du provider actif (priorité la plus
 *      basse parmi les `isActive`).
 *   2. Corrompt l'apiKey (ajoute un suffixe `_FAILTEST_<timestamp>`).
 *   3. Invalide les caches (factory + failover) pour forcer le rechargement.
 *   4. Réinitialise la santé in-memory (repars d'un état propre).
 *   5. Effectue un appel chatCompletion minimal.
 *   6. Lit les événements failover créés en DB + la santé post-test.
 *   7. **Restaure** l'apiKey original quoi qu'il arrive (try/finally).
 *   8. Invalide à nouveau les caches pour revenir à l'état nominal.
 *
 * Aucune modification permanente de la DB : l'apiKey est restauré même en
 * cas d'erreur pendant l'appel IA. Les événements failover (FAIL_OVER)
 * restent en DB comme trace du test — c'est volontaire, ils documentent
 * l'essai.
 */

import { db } from '@/lib/db'
import { getAIProvider, invalidateProviderCache } from '@/lib/ai-providers/factory'
import { getFailoverProvider } from '@/lib/ai-providers/failover-provider'
import type { AIProviderConfig } from '@/lib/ai-providers/types'

export interface FailoverTestResult {
  /** Horodatage du test */
  timestamp: string
  /** Succès global (un provider de secours a répondu) */
  success: boolean
  /** Provider principal testé (celui dont on a simulé la panne) */
  primaryProvider: {
    id: string
    name: string
    provider: string
    model: string | null
    priority: number
  }
  /** Provider de secours qui a répondu (identifié via le `model` retourné) */
  fallbackProvider: {
    name: string | null
    model: string
  } | null
  /** Réponse IA reçue (extrait) */
  responseExcerpt: string | null
  /** Erreur finale si tous les providers ont échoué */
  error: string | null
  /** Événements failover créés pendant le test */
  eventsCreated: Array<{
    eventType: string
    fromProvider: string | null
    toProvider: string | null
    reason: string
    createdAt: string
  }>
  /** Santé des providers après le test */
  healthAfter: Array<{
    providerId: string
    providerName: string
    consecutiveFailures: number
    totalCalls: number
    totalFailovers: number
    isCoolingDown: boolean
  }>
  /** L'apiKey a-t-il bien été restauré */
  apiKeyRestored: boolean
  /** Durée totale du test en ms */
  durationMs: number
}

/**
 * Exécute un test de failover en simulant la panne du provider principal.
 *
 * @returns un rapport détaillé du test.
 */
export async function runFailoverTest(): Promise<FailoverTestResult> {
  const start = Date.now()
  const timestamp = new Date().toISOString()

  // ─── 1. Identifier le provider principal (priorité la plus basse, actif) ───
  const providers = await db.aIProviderConfig.findMany({
    orderBy: [{ priority: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
  })

  if (providers.length === 0) {
    return {
      timestamp,
      success: false,
      primaryProvider: { id: '', name: 'N/A', provider: 'N/A', model: null, priority: 99 },
      fallbackProvider: null,
      responseExcerpt: null,
      error: 'Aucun fournisseur IA configuré en base',
      eventsCreated: [],
      healthAfter: [],
      apiKeyRestored: true,
      durationMs: Date.now() - start,
    }
  }

  const primary = providers[0] as AIProviderConfig
  const originalApiKey: string | null = primary.apiKey ?? null
  const brokenApiKey = `${originalApiKey ?? ''}_FAILTEST_${Date.now()}`

  // Snapshot des événements avant le test (pour isoler ceux créés par le test)
  const eventsBefore = await db.aIFailoverEvent.findMany({
    where: { createdAt: { gte: new Date(start - 1000) } },
    select: { id: true },
  })
  const eventIdsBefore = new Set(eventsBefore.map((e) => e.id))

  let apiKeyRestored = false
  let result: FailoverTestResult | undefined

  try {
    // ─── 2. Corrompre l'apiKey du provider principal ───
    await db.aIProviderConfig.update({
      where: { id: primary.id },
      data: { apiKey: brokenApiKey },
    })

    // ─── 3. Invalider les caches (factory + failover interne) ───
    invalidateProviderCache()

    // ─── 4. Réinitialiser la santé in-memory ───
    const failover = getFailoverProvider()
    failover.resetAllHealth()

    // ─── 5. Effectuer un appel chatCompletion minimal ───
    const aiProvider = await getAIProvider()
    let responseExcerpt: string | null = null
    let usedModel: string | null = null
    let callError: string | null = null

    try {
      const result_call = await aiProvider.chatCompletion({
        messages: [
          { role: 'system', content: 'Tu es un assistant de test. Réponds uniquement "OK".' },
          { role: 'user', content: 'Test de disponibilité. Réponds OK.' },
        ],
        maxTokens: 16,
        temperature: 0,
      })
      responseExcerpt = result_call.choices[0]?.message?.content?.slice(0, 200) ?? null
      usedModel = result_call.model
    } catch (err) {
      callError = err instanceof Error ? err.message : String(err)
    }

    // ─── 6. Identifier le provider de secours via le model retourné ───
    let fallbackName: string | null = null
    if (usedModel) {
      const match = providers.find((p) => p.model === usedModel)
      if (match) fallbackName = match.name
    }

    // ─── 7. Lire les événements failover créés pendant le test ───
    const allEventsAfter = await db.aIFailoverEvent.findMany({
      where: { createdAt: { gte: new Date(start - 1000) } },
      orderBy: { createdAt: 'asc' },
    })
    const newEvents = allEventsAfter.filter((e) => !eventIdsBefore.has(e.id))

    // ─── 8. Santé des providers après le test ───
    const healthStatus = failover.getHealthStatus()

    result = {
      timestamp,
      success: callError === null && !!usedModel,
      primaryProvider: {
        id: primary.id,
        name: primary.name,
        provider: primary.provider,
        model: primary.model ?? null,
        priority: primary.priority ?? 99,
      },
      fallbackProvider: usedModel
        ? { name: fallbackName, model: usedModel }
        : null,
      responseExcerpt,
      error: callError,
      eventsCreated: newEvents.map((e) => ({
        eventType: e.eventType,
        fromProvider: e.fromProvider,
        toProvider: e.toProvider,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
      healthAfter: healthStatus.map((h) => ({
        providerId: h.id,
        providerName: h.health?.providerName ?? h.name,
        consecutiveFailures: h.health?.consecutiveFailures ?? 0,
        totalCalls: h.health?.totalCalls ?? 0,
        totalFailovers: h.health?.totalFailovers ?? 0,
        isCoolingDown: h.health?.isCoolingDown ?? false,
      })),
      apiKeyRestored: false, // mis à jour après restauration
      durationMs: Date.now() - start,
    }
  } finally {
    // ─── 9. RESTAURER l'apiKey original (quoi qu'il arrive) ───
    try {
      await db.aIProviderConfig.update({
        where: { id: primary.id },
        data: { apiKey: originalApiKey },
      })
      apiKeyRestored = true
    } catch (restoreErr) {
      console.error('[Failover Test] ERREUR CRITIQUE: impossible de restaurer l\'apiKey:', restoreErr)
      apiKeyRestored = false
    }

    // ─── 10. Invalider les caches pour revenir à l'état nominal ───
    invalidateProviderCache()
    try {
      getFailoverProvider().resetAllHealth()
    } catch {
      // non critique
    }

    if (result) {
      result.apiKeyRestored = apiKeyRestored
    }
  }

  // Si result est undefined ici, c'est qu'une erreur est survenue avant
  // l'assignation (improbable car le try commence juste après, mais TS
  // exige une garantie). On renvoie un rapport d'erreur défensif.
  if (!result) {
    return {
      timestamp,
      success: false,
      primaryProvider: {
        id: primary.id,
        name: primary.name,
        provider: primary.provider,
        model: primary.model ?? null,
        priority: primary.priority ?? 99,
      },
      fallbackProvider: null,
      responseExcerpt: null,
      error: 'Erreur inattendue pendant le test (result non assigné)',
      eventsCreated: [],
      healthAfter: [],
      apiKeyRestored,
      durationMs: Date.now() - start,
    }
  }

  return result
}
