import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { configToProviderInfo } from '@/lib/ai-providers'
import { withAuth } from '@/lib/auth-session'

// GET /api/ai-providers — List all AI provider configurations
// 🔒 ADMIN only
const _getHandler = async () => {
  try {
    const providers = await db.aIProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({
      providers: providers.map((p) => ({
        ...configToProviderInfo(p),
        priority: p.priority ?? 99,
      })),
    })
  } catch (error) {
    console.error('[AI Providers] Error listing providers:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des fournisseurs IA' },
      { status: 500 }
    )
  }
}

// POST /api/ai-providers — Create a new AI provider configuration
// 🔒 ADMIN only
const _postHandler = async (request: NextRequest) => {
  try {
    const body = await request.json()

    const {
      name,
      provider,
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      extraConfig,
    } = body

    // Validate required fields
    if (!name || !provider) {
      return NextResponse.json(
        { error: 'Nom et type de fournisseur requis' },
        { status: 400 }
      )
    }

    const validProviders = ['ZAI', 'OPENAI', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE']
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Type de fournisseur invalide. Types supportés: ${validProviders.join(', ')}` },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const existing = await db.aIProviderConfig.findFirst({
      where: { name },
    })
    if (existing) {
      return NextResponse.json(
        { error: `Un fournisseur avec le nom "${name}" existe déjà` },
        { status: 409 }
      )
    }

    const newProvider = await db.aIProviderConfig.create({
      data: {
        name,
        provider,
        baseUrl: baseUrl || null,
        apiKey: apiKey || null,
        model: model || null,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        isActive: false,
        extraConfig: extraConfig ? JSON.stringify(extraConfig) : null,
      },
    })

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          entite: 'AIProviderConfig',
          entiteId: newProvider.id,
          details: `Fournisseur IA créé: ${name} (${provider})`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      provider: configToProviderInfo(newProvider),
    }, { status: 201 })
  } catch (error) {
    console.error('[AI Providers] Error creating provider:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du fournisseur IA' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_getHandler, ['ADMIN'])
export const POST = withAuth(_postHandler, ['ADMIN'])
