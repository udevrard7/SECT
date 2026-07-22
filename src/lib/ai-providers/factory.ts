/**
 * AI Provider Factory — AI-CONNECT-1
 *
 * Cette factory est le SEUL point d'entrée utilisé par le frontend pour obtenir
 * un `AIProvider`. Conformément à la règle du projet (z-ai-web-dev-sdk en
 * backend only, jamais d'appel IA direct côté client), `getAIProvider()`
 * retourne un provider « BackendAIProvider » qui délègue tout au backend Go
 * via l'endpoint `/api/ai-assistant`.
 *
 * Le backend Go lit le provider actif dans la table `AIProviderConfig`
 * (WHERE "isActive" = true), fait l'appel chat completion vers le `baseUrl`
 * du provider (Mistral, Groq, OpenRouter, ZAI, etc.) au format OpenAI-
 * compatible, et retourne la réponse texte au frontend.
 *
 * Avantages :
 * - La clé API n'est JAMAIS exposée au client (jamais fetch direct vers le LLM).
 * - Le failover / changement de provider est géré côté backend (une seule
 *   source de vérité : la table AIProviderConfig).
 * - Le frontend n'a pas besoin de connaître le provider actif ni ses params.
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderInfo,
  AIProviderType,
  ChatCompletionResult,
  ChatMessage,
} from './types'

// ──────────────────────────────────────────────────────────────────────────
// BackendAIProvider — délègue tout au backend Go via /api/ai-assistant
// ──────────────────────────────────────────────────────────────────────────

/**
 * BackendAIProvider implémente l'interface AIProvider en passant tous les
 * appels au backend Go. Aucune clé API n'est lue côté client.
 *
 * Le flux :
 *   client.chatCompletion({ messages }) → POST /api/ai-assistant
 *     body : { message: <dernier message utilisateur>, context: { page: 'ai-analyzer' } }
 *     réponse backend : { response: string, model?: string }
 *   → reformaté en ChatCompletionResult OpenAI-compatible pour les
 *     consommateurs existants (ai-analyzer.ts, failover-provider.ts, etc.).
 */
class BackendAIProvider implements AIProvider {
  readonly id = 'backend'
  readonly name = 'Backend AI Service'
  readonly providerType: AIProviderType = 'OPENAI_COMPATIBLE'

  async chatCompletion(params: {
    messages: ChatMessage[]
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: unknown
  }): Promise<ChatCompletionResult> {
    const messages = params.messages ?? []

    // Le backend /api/ai-assistant attend un message utilisateur unique +
    // un contexte optionnel { page, role }. On extrait le dernier message
    // utilisateur (le reste de l'historique est géré côté backend via le
    // system prompt construit par le handler aiAssistant).
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const message = lastUser?.content ?? ''

    // Si un system message est présent, on le prépend au message utilisateur
    // pour ne pas perdre l'instruction (le backend construit son propre system
    // prompt pédagogique, mais on préserve les directives additionnelles).
    const systemMsg = messages.find(m => m.role === 'system')
    const finalMessage = systemMsg && systemMsg.content
      ? `${systemMsg.content}\n\n${message}`
      : message

    const res = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: finalMessage,
        context: { page: 'ai-analyzer' },
      }),
    })

    if (!res.ok) {
      let errorMessage = `AI request failed (HTTP ${res.status})`
      try {
        const err = await res.json()
        if (err?.error) errorMessage = err.error
      } catch {
        // Ignore JSON parse errors — keep default message
      }
      throw new Error(errorMessage)
    }

    const data = (await res.json()) as { response?: string; model?: string }
    const content = data.response ?? ''

    return {
      id: 'backend',
      model: data.model ?? 'unknown',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; responseTime?: number }> {
    const start = Date.now()
    try {
      const result = await this.chatCompletion({
        messages: [
          { role: 'system', content: 'Test assistant.' },
          { role: 'user', content: 'Reply with: {"status":"ok"}' },
        ],
        maxTokens: 50,
      })
      const elapsed = Date.now() - start
      const content = result.choices?.[0]?.message?.content || ''
      if (content.length > 0) {
        return { success: true, message: `Connexion réussie (${elapsed}ms)`, responseTime: elapsed }
      }
      return { success: false, message: 'Réponse vide du service', responseTime: elapsed }
    } catch (err) {
      const elapsed = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: `Erreur: ${msg}`, responseTime: elapsed }
    }
  }
}

// Singleton — évite de recréer une instance à chaque appel.
let backendProviderInstance: BackendAIProvider | null = null

/**
 * getAIProvider retourne le provider IA actif.
 *
 * Dans l'architecture cible (AI-CONNECT-1), tout passe par le backend Go :
 * la factory retourne donc un BackendAIProvider unique qui délègue à
 * `/api/ai-assistant`. La sélection du provider concret (Mistral, Groq, ...)
 * se fait côté backend via la table `AIProviderConfig`.
 */
export function getAIProvider(): AIProvider {
  if (!backendProviderInstance) {
    backendProviderInstance = new BackendAIProvider()
  }
  return backendProviderInstance
}

// ──────────────────────────────────────────────────────────────────────────
// Fonctions utilitaires re-exportées par index.ts
// (compatibilité avec les consumers existants — failover-provider.ts, etc.)
// ──────────────────────────────────────────────────────────────────────────

/**
 * getFailoverProviderForAdmin retourne le provider à utiliser dans l'UI admin
 * pour tester le failover. Comme tout passe par le backend, on retourne le
 * même BackendAIProvider — le vrai failover est géré côté backend.
 */
export function getFailoverProviderForAdmin(): AIProvider {
  return getAIProvider()
}

/**
 * createProviderFromConfig instancie un provider depuis une config DB.
 * Dans l'architecture backend-only, on ignore la config côté client et on
 * retourne le BackendAIProvider (le backend lira la même config en DB).
 */
export function createProviderFromConfig(_config: AIProviderConfig): AIProvider {
  return getAIProvider()
}

/**
 * invalidateProviderCache invalide le cache de providers côté client.
 * No-op dans l'architecture backend-only : le backend lit la config à chaque
 * appel (pas de cache côté client).
 */
export function invalidateProviderCache(): void {
  backendProviderInstance = null
}

/**
 * configToProviderInfo convertit une AIProviderConfig en AIProviderInfo
 * (sans données sensibles) pour l'UI. Retourne null si la config est invalide.
 *
 * NOTE : dans l'architecture backend-only, cette fonction n'est plus utilisée
 * pour la sélection du provider actif (géré côté backend). Elle reste pour
 * les composants UI qui veulent afficher des infos sur une config.
 */
export function configToProviderInfo(config: AIProviderConfig): AIProviderInfo | null {
  if (!config || !config.id) return null
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    baseUrl: config.baseUrl ?? null,
    model: config.model ?? null,
    temperature: config.temperature ?? null,
    maxTokens: config.maxTokens ?? null,
    isActive: config.isActive,
    hasApiKey: !!(config.apiKey && config.apiKey.length > 0),
    lastTestAt: config.lastTestAt ? config.lastTestAt.toISOString() : null,
    lastTestOk: config.lastTestOk ?? null,
    priority: config.priority ?? 99,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * configToProviderInfoWithPriority — variante qui préserve explicitement
 * la priorité. Retourne null si la config est invalide.
 */
export function configToProviderInfoWithPriority(config: AIProviderConfig): AIProviderInfo | null {
  const info = configToProviderInfo(config)
  if (!info) return null
  info.priority = config.priority ?? 99
  return info
}
