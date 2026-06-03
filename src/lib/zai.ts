/**
 * ZAI SDK wrapper for both sandbox and Vercel production.
 *
 * In development (sandbox): the SDK reads /etc/.z-ai-config automatically via ZAI.create().
 * In production (Vercel): we construct a ZAI instance with env vars and the PUBLIC API URL.
 *
 * IMPORTANT: We MUST use the ZAI SDK (not raw fetch) because the SDK handles
 * authentication correctly for both the internal and public API endpoints.
 * The internal-api.z.ai is only reachable from the Z.ai sandbox network,
 * but z.ai/api/v1 is publicly accessible and the SDK knows how to auth with it.
 *
 * Required env vars for Vercel production:
 * - ZAI_BASE_URL: Public API URL (https://z.ai/api/v1)
 * - ZAI_API_KEY: API key (default: "Z.ai")
 * - ZAI_CHAT_ID: Chat ID
 * - ZAI_USER_ID: User ID
 * - ZAI_TOKEN: Auth JWT token
 */

import ZAI from 'z-ai-web-dev-sdk'

export interface ZAIChatCompletionResult {
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  id: string
  model: string
  object: string
  created: number
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface ZAIErrorResponse {
  code: number
  msg: string
  success: false
}

export interface ZAIClient {
  chat: {
    completions: {
      create: (body: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
        model?: string
        stream?: boolean
        thinking?: { type: 'enabled' | 'disabled' }
        [key: string]: unknown
      }) => Promise<ZAIChatCompletionResult>
    }
  }
}

/**
 * Check if a ZAI response is an error response (auth failure, rate limit, etc.)
 * The ZAI API sometimes returns HTTP 200 with an error JSON body like:
 * { code: 1000, msg: "身份验证失败。", success: false }
 */
function isZAIErrorResponse(response: unknown): response is ZAIErrorResponse {
  if (!response || typeof response !== 'object') return false
  const obj = response as Record<string, unknown>
  return typeof obj.code === 'number' && typeof obj.success === 'boolean' && obj.success === false
}

/**
 * Get a configured ZAI client instance.
 * Uses environment variables in production, SDK config file in development.
 */
export async function getZAI(): Promise<ZAIClient> {
  const envBaseUrl = process.env.ZAI_BASE_URL
  const envApiKey = process.env.ZAI_API_KEY
  const envChatId = process.env.ZAI_CHAT_ID
  const envUserId = process.env.ZAI_USER_ID
  const envToken = process.env.ZAI_TOKEN

  if (envBaseUrl && envApiKey) {
    console.log('[ZAI] Using SDK with env vars, baseUrl:', envBaseUrl)

    // Validate the baseUrl - it must be the PUBLIC API URL, not the internal one
    // The internal URL (internal-api.z.ai) is only accessible from the Z.ai sandbox
    if (envBaseUrl.includes('internal-api')) {
      console.error('[ZAI] WARNING: ZAI_BASE_URL contains "internal-api" which is NOT accessible from Vercel!')
      console.error('[ZAI] ZAI_BASE_URL must be the public API URL (https://z.ai/api/v1)')
      console.error('[ZAI] Falling back to SDK config file')
      return ZAI.create() as Promise<ZAIClient>
    }

    const client = new ZAI({
      baseUrl: envBaseUrl,
      apiKey: envApiKey,
      chatId: envChatId || '',
      userId: envUserId || '',
      token: envToken || '',
    }) as unknown as ZAIClient

    // Wrap the client to validate responses for auth errors
    const originalCreate = client.chat.completions.create.bind(client.chat.completions)
    client.chat.completions.create = async (body) => {
      const response = await originalCreate(body)

      // Check if the response is an auth error
      if (isZAIErrorResponse(response)) {
        const errorMsg = response.msg || 'Authentication failed'
        console.error('[ZAI] API returned error response:', JSON.stringify(response))
        throw new Error(`ZAI API Error (code ${response.code}): ${errorMsg}. Check ZAI_BASE_URL and ZAI_API_KEY env vars.`)
      }

      // Validate the response has the expected structure
      if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
        console.error('[ZAI] API returned unexpected response structure:', JSON.stringify(response).slice(0, 500))
        throw new Error('ZAI API returned an invalid response structure. The API might be unavailable.')
      }

      return response
    }

    return client
  }

  // Fallback: Use SDK with config file (development/sandbox)
  console.log('[ZAI] Using SDK with config file')
  return ZAI.create() as Promise<ZAIClient>
}

/**
 * Diagnostic function to test the ZAI connection.
 * Returns detailed information about the connection status.
 */
export async function testZAIConnection(): Promise<{
  status: 'ok' | 'error'
  baseUrl: string | null
  hasApiKey: boolean
  hasChatId: boolean
  hasUserId: boolean
  hasToken: boolean
  testResult?: string
  error?: string
}> {
  const envBaseUrl = process.env.ZAI_BASE_URL
  const envApiKey = process.env.ZAI_API_KEY
  const envChatId = process.env.ZAI_CHAT_ID
  const envUserId = process.env.ZAI_USER_ID
  const envToken = process.env.ZAI_TOKEN

  const result = {
    status: 'error' as 'ok' | 'error',
    baseUrl: envBaseUrl || null,
    hasApiKey: !!envApiKey,
    hasChatId: !!envChatId,
    hasUserId: !!envUserId,
    hasToken: !!envToken,
  }

  try {
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'Test assistant. Reply with JSON only.' },
        { role: 'user', content: 'Reply with: {"status": "ok"}' },
      ],
      thinking: { type: 'disabled' },
    })

    const content = completion.choices?.[0]?.message?.content || ''
    result.status = 'ok'
    result.testResult = content.slice(0, 200)
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }

  return result
}
