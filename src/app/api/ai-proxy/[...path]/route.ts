import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-session'

/**
 * AI API Proxy Route
 *
 * Proxies AI requests from Vercel to the Z-AI API.
 * 🔒 ADMIN, ENSEIGNANT, RESPONSABLE only
 * 
 * Architecture for Vercel production:
 * - SDK (on Vercel) → ZAI_BASE_URL=https://sect-app.vercel.app/api/ai-proxy/v1
 *   → This route → Public ZAI API at z.ai/api/v1 (with correct auth headers)
 * 
 * Architecture for development (sandbox):
 * - SDK → ZAI.create() reads /etc/.z-ai-config → internal-api.z.ai/v1
 * 
 * The proxy translates between the SDK's internal API auth format
 * and the public API's auth format.
 */

const PUBLIC_API_URL = 'https://z.ai/api/v1'

const _postHandler = async (
  request: NextRequest,
  context: { params: any; user: any }
) => {
  return proxyRequest(request, context.params)
}

const _getHandler = async (
  request: NextRequest,
  context: { params: any; user: any }
) => {
  return proxyRequest(request, context.params)
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
) {
  try {
    const { path } = await params
    // The SDK sends requests to ZAI_BASE_URL/chat/completions
    // ZAI_BASE_URL = https://sect-app.vercel.app/api/ai-proxy/v1
    // So the catch-all path is ['v1', 'chat', 'completions']
    // We need to strip the 'v1' prefix since PUBLIC_API_URL already includes /v1
    let apiPath = path.join('/')
    if (apiPath.startsWith('v1/')) {
      apiPath = apiPath.slice(3) // Remove 'v1/' prefix to avoid double /v1/v1/
    }
    
    // Get the token from environment variables
    const token = process.env.ZAI_TOKEN
    const chatId = process.env.ZAI_CHAT_ID
    const userId = process.env.ZAI_USER_ID
    const apiKey = process.env.ZAI_API_KEY || 'Z.ai'
    
    if (!token) {
      console.error('[AI Proxy] No ZAI_TOKEN environment variable set')
      return NextResponse.json(
        { error: 'Configuration IA manquante. Veuillez configurer ZAI_TOKEN.' },
        { status: 500 }
      )
    }
    
    // Use the public API URL with JWT token as Bearer auth
    const targetUrl = `${PUBLIC_API_URL}/${apiPath}`
    
    // Build headers for the public API
    // The public API at z.ai/api/v1 accepts:
    // - Authorization: Bearer [apiKey] with X-Token header, OR
    // - Authorization: Bearer [token] (JWT as bearer)
    // We try both approaches to maximize compatibility
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Z-AI-From': 'Z',
      'X-Token': token,
    }
    
    // Include chat context headers if available
    if (chatId) headers['X-Chat-Id'] = chatId
    if (userId) headers['X-User-Id'] = userId

    // Get request body
    let body: string | undefined
    if (request.method === 'POST') {
      body = await request.text()
    }

    console.log(`[AI Proxy] ${request.method} ${apiPath} → ${targetUrl}`)

    // Forward the request with timeout
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(60000), // 60s timeout for AI requests
    })

    // Check if the response is an error from the API
    const contentType = response.headers.get('content-type') || ''
    
    if (response.ok && contentType.includes('application/json')) {
      // Clone the response so we can inspect it
      const responseText = await response.text()
      
      try {
        const responseData = JSON.parse(responseText)
        
        // Check for ZAI error responses (they return HTTP 200 but with error body)
        if (responseData.code && responseData.success === false) {
          console.error('[AI Proxy] API error response:', JSON.stringify(responseData))
          
          if (responseData.code === 1000 || responseData.msg?.includes('身份验证失败')) {
            return NextResponse.json(
              {
                error: 'Erreur d\'authentification du service IA. Vérifiez la configuration ZAI_TOKEN.',
                code: responseData.code,
              },
              { status: 500 }
            )
          }
          
          if (responseData.code === 401 || responseData.msg?.includes('令牌已过期')) {
            return NextResponse.json(
              {
                error: 'Token IA expiré. Veuillez mettre à jour ZAI_TOKEN dans la configuration Vercel.',
                code: responseData.code,
              },
              { status: 500 }
            )
          }
          
          return NextResponse.json(
            { error: `Erreur API IA: ${responseData.msg || 'Unknown error'}`, code: responseData.code },
            { status: 500 }
          )
        }
        
        // Valid response - return it
        const responseHeaders = new Headers()
        responseHeaders.set('Content-Type', 'application/json')
        responseHeaders.set('Access-Control-Allow-Origin', '*')
        
        return new NextResponse(responseText, {
          status: 200,
          headers: responseHeaders,
        })
      } catch {
        // If JSON parsing fails, return the raw text
        const responseHeaders = new Headers()
        responseHeaders.set('Content-Type', contentType)
        responseHeaders.set('Access-Control-Allow-Origin', '*')
        
        return new NextResponse(responseText, {
          status: response.status,
          headers: responseHeaders,
        })
      }
    }
    
    // Stream the response back for non-JSON or error responses
    const responseHeaders = new Headers()
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    if (contentType) responseHeaders.set('Content-Type', contentType)
    
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error('[AI Proxy] Error:', error.message)
    
    // Check if it's a connection error
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || 
        error.message?.includes('fetch failed') ||
        error.message?.includes('ECONNREFUSED') ||
        error.name === 'AbortError' ||
        error.message?.includes('abort')) {
      return NextResponse.json(
        {
          error: 'Service IA temporairement indisponible (timeout). Veuillez réessayer.',
        },
        { status: 504 }
      )
    }
    
    return NextResponse.json(
      { error: 'Erreur proxy IA', details: error.message },
      { status: 502 }
    )
  }
}

// Handle CORS preflight (public — no auth needed for OPTIONS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Headers': 'Content-Type, Authorization, X-Z-AI-From, X-Chat-Id, X-User-Id, X-Token',
    },
  })
}

export const POST = withAuth(_postHandler, ['ADMIN', 'ENSEIGNANT', 'RESPONSABLE'])
export const GET = withAuth(_getHandler, ['ADMIN', 'ENSEIGNANT', 'RESPONSABLE'])
