/**
 * OpenAI-Compatible Provider implementation.
 * Supports any API that follows the OpenAI chat completions format:
 * POST {baseUrl}/chat/completions with Authorization: Bearer {apiKey}
 *
 * This covers: OpenAI, Groq, Together AI, Ollama, Mistral, Fireworks, etc.
 */

import type { AIProvider, ChatMessage, ChatCompletionResult, AIProviderConfig } from './types'

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string
  readonly name: string
  readonly providerType: 'OPENAI' | 'OPENAI_COMPATIBLE' | 'GOOGLE'

  private baseUrl: string
  private apiKey: string
  private model: string
  private defaultTemperature: number
  private defaultMaxTokens: number

  constructor(config: AIProviderConfig) {
    this.id = config.id
    this.name = config.name
    this.providerType = config.provider as 'OPENAI' | 'OPENAI_COMPATIBLE' | 'GOOGLE'

    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    this.apiKey = config.apiKey || ''
    this.model = config.model || 'gpt-4o'
    this.defaultTemperature = config.temperature ?? 0.7
    this.defaultMaxTokens = config.maxTokens ?? 4096
  }

  async chatCompletion(params: {
    messages: ChatMessage[]
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: unknown
  }): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/chat/completions`

    const body = {
      model: params.model || this.model,
      messages: params.messages,
      temperature: params.temperature ?? this.defaultTemperature,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000), // 3 min timeout (was 2 min, increased for large exam generation batches)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      let errorMessage = `API Error ${response.status}: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage)
    }

    const result = await response.json()
    return result as ChatCompletionResult
  }

  async testConnection(): Promise<{ success: boolean; message: string; responseTime?: number }> {
    const start = Date.now()
    try {
      const result = await this.chatCompletion({
        messages: [
          { role: 'system', content: 'Test assistant. Reply with JSON only.' },
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
