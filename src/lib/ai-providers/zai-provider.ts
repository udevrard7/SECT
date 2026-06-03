/**
 * Z-AI Provider implementation.
 * Uses the z-ai-web-dev-sdk for native Z-AI integration.
 * Falls back to env vars if no DB config exists.
 */

import ZAI from 'z-ai-web-dev-sdk'
import type { AIProvider, ChatMessage, ChatCompletionResult, AIProviderConfig } from './types'
import { getZAI } from '@/lib/zai'

export class ZAIProvider implements AIProvider {
  readonly id: string
  readonly name: string
  readonly providerType = 'ZAI' as const

  private config: AIProviderConfig | null

  constructor(config?: AIProviderConfig) {
    this.id = config?.id || 'zai-default'
    this.name = config?.name || 'Z-AI (par défaut)'
    this.config = config || null
  }

  async chatCompletion(params: {
    messages: ChatMessage[]
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: unknown
  }): Promise<ChatCompletionResult> {
    const zai = await this.getClient()

    const completion = await zai.chat.completions.create({
      messages: params.messages,
      model: params.model || this.config?.model || undefined,
      thinking: { type: 'disabled' },
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.maxTokens !== undefined && { max_tokens: params.maxTokens }),
    })

    return completion as ChatCompletionResult
  }

  async testConnection(): Promise<{ success: boolean; message: string; responseTime?: number }> {
    const start = Date.now()
    try {
      const zai = await this.getClient()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'Test assistant.' },
          { role: 'user', content: 'Reply with: {"status":"ok"}' },
        ],
        thinking: { type: 'disabled' },
      })

      const content = completion.choices?.[0]?.message?.content || ''
      const elapsed = Date.now() - start

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

  private async getClient() {
    // If we have a DB config with extra fields, construct a custom client
    if (this.config?.extraConfig) {
      try {
        const extra = JSON.parse(this.config.extraConfig)
        if (extra.baseUrl && extra.apiKey) {
          const client = new ZAI({
            baseUrl: extra.baseUrl,
            apiKey: extra.apiKey,
            chatId: extra.chatId || '',
            userId: extra.userId || '',
            token: extra.token || '',
          }) as unknown as { chat: { completions: { create: (body: any) => Promise<any> } } }
          return client
        }
      } catch {
        // Fall through to default
      }
    }

    // Default: use the existing getZAI() which handles env vars / config file
    return getZAI()
  }
}
