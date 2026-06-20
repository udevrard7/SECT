import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/ai-providers/models?providerId=xxx
 * Fetch available models from a provider's API (OpenAI-compatible /models endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('providerId')

    if (!providerId) {
      return NextResponse.json(
        { error: 'ID du fournisseur requis' },
        { status: 400 }
      )
    }

    const provider = await db.aIProviderConfig.findUnique({
      where: { id: providerId },
    })

    if (!provider) {
      return NextResponse.json(
        { error: 'Fournisseur IA non trouvé' },
        { status: 404 }
      )
    }

    // Only OpenAI-compatible providers support the /models endpoint
    if (provider.provider !== 'OPENAI_COMPATIBLE' && provider.provider !== 'OPENAI') {
      // Return static models for other types
      const staticModels: Record<string, string[]> = {
        GOOGLE: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'],
        ANTHROPIC: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022'],
        ZAI: ['default'],
      }
      const models = staticModels[provider.provider] || []
      return NextResponse.json({ models, source: 'static' })
    }

    if (!provider.baseUrl) {
      return NextResponse.json(
        { error: 'URL de base non configurée pour ce fournisseur' },
        { status: 400 }
      )
    }

    // Call the /models endpoint
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const modelsUrl = `${baseUrl}/models`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000), // 15s timeout
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[AI Providers Models] API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Erreur API (${response.status}): impossible de récupérer les modèles` },
        { status: 502 }
      )
    }

    const data = await response.json()

    // Parse models from OpenAI-compatible response format
    let models: string[] = []
    if (Array.isArray(data.data)) {
      models = data.data
        .map((m: any) => m.id || m.name || m)
        .filter(Boolean)
        .sort()
    } else if (Array.isArray(data.models)) {
      models = data.models
        .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
        .filter(Boolean)
        .sort()
    }

    return NextResponse.json({ models, source: 'api', total: models.length })
  } catch (error) {
    console.error('[AI Providers Models] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des modèles' },
      { status: 500 }
    )
  }
}
