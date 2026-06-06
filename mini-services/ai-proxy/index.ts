/**
 * AI Proxy Service
 * 
 * Proxies AI API requests from Vercel (production) to internal-api.z.ai
 * This is needed because internal-api.z.ai uses private IP addresses
 * (172.25.x.x) that are not reachable from Vercel's serverless functions.
 * 
 * The sandbox CAN reach internal-api.z.ai, so we run this proxy here.
 * Vercel calls this proxy, which forwards to the internal API.
 * 
 * Port: 3031
 */

const PORT = 3031

// Read config from /etc/.z-ai-config
const config = await loadConfig()

async function loadConfig() {
  const { readFileSync } = await import('fs')
  const { resolve } = await import('path')
  const { homedir } = await import('os')
  
  const configPaths = [
    resolve(process.cwd(), '.z-ai-config'),
    resolve(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config'
  ]
  
  for (const filePath of configPaths) {
    try {
      const configStr = readFileSync(filePath, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) {
        console.log(`✅ Loaded config from ${filePath}`)
        return config
      }
    } catch {
      // Continue to next path
    }
  }
  
  throw new Error('No .z-ai-config found')
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Z-AI-From, X-Chat-Id, X-User-Id, X-Token',
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Health check
    if (req.url.endsWith('/health')) {
      return Response.json({ status: 'ok', service: 'ai-proxy', port: PORT }, { headers: corsHeaders })
    }

    try {
      const url = new URL(req.url)
      // The path after / is the API path (e.g., /chat/completions)
      const apiPath = url.pathname
      const targetUrl = `${config.baseUrl}${apiPath}`
      
      // Clone headers from the original request
      const headers = new Headers()
      headers.set('Content-Type', req.headers.get('Content-Type') || 'application/json')
      headers.set('Authorization', req.headers.get('Authorization') || `Bearer ${config.apiKey}`)
      headers.set('X-Z-AI-From', 'Z')
      
      // Pass through or use config defaults
      const chatId = req.headers.get('X-Chat-Id') || config.chatId
      const userId = req.headers.get('X-User-Id') || config.userId
      const token = req.headers.get('X-Token') || config.token
      
      if (chatId) headers.set('X-Chat-Id', chatId)
      if (userId) headers.set('X-User-Id', userId)
      if (token) headers.set('X-Token', token)

      // Forward the request
      const body = await req.text()
      
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: body || undefined,
      })

      // Stream the response back
      const responseHeaders = new Headers(corsHeaders)
      const contentType = response.headers.get('content-type')
      if (contentType) responseHeaders.set('Content-Type', contentType)
      
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      })
    } catch (error: any) {
      console.error('Proxy error:', error)
      return Response.json(
        { error: 'Proxy error', message: error.message },
        { status: 502, headers: corsHeaders }
      )
    }
  },
})

console.log(`🚀 AI Proxy running on port ${PORT}`)
console.log(`   Forwarding to: ${config.baseUrl}`)
