/**
 * Anthropic Provider implementation.
 * Uses Anthropic's Messages API format.
 * Can also be accessed via OpenAI-compatible proxies.
 */

import type { AIProvider, ChatMessage, ChatCompletionResult, AIProviderConfig } from './types'

export class AnthropicProvider implements AIProvider {
  readonly id: string
  readonly name: string
  readonly providerType = 'ANTHROPIC' as const

  private baseUrl: string
  private apiKey: string
  private model: string
  private defaultTemperature: number
  private defaultMaxTokens: number

  constructor(config: AIProviderConfig) {
    this.id = config.id
    this.name = config.name
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '')
    this.apiKey = config.apiKey || ''
    this.model = config.model || 'claude-3-5-sonnet-20241022'
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
    // Anthropic uses a different API format - Messages API
    // Separate system message from conversation messages
    const systemMessage = params.messages.find(m => m.role === 'system')?.content || ''
    const conversationMessages = params.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    const url = `${this.baseUrl}/messages`

    const body = {
      model: params.model || this.model,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
      temperature: params.temperature ?? this.defaultTemperature,
      system: systemMessage || undefined,
      messages: conversationMessages,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      let errorMessage = `Anthropic API Error ${response.status}: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        // Use default
      }
      throw new Error(errorMessage)
    }

    const result = await response.json()

    // Convert Anthropic response format to OpenAI-compatible format
    const content = result.content?.[0]?.text || ''
    return {
      id: result.id || 'anthropic-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: result.model || this.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: result.stop_reason || 'stop',
      }],
      usage: result.usage ? {
        prompt_tokens: result.usage.input_tokens,
        completion_tokens: result.usage.output_tokens,
        total_tokens: result.usage.input_tokens + result.usage.output_tokens,
      } : undefined,
    }
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
