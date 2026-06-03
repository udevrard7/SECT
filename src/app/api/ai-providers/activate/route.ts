import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { configToProviderInfo, invalidateProviderCache } from '@/lib/ai-providers'

// POST /api/ai-providers/activate — Activate a specific AI provider
export async function POST(request: NextRequest) {
  try {
    const { providerId } = await request.json()

    if (!providerId) {
      return NextResponse.json(
        { error: 'ID du fournisseur requis' },
        { status: 400 }
      )
    }

    const target = await db.aIProviderConfig.findUnique({
      where: { id: providerId },
    })

    if (!target) {
      return NextResponse.json(
        { error: 'Fournisseur IA non trouvé' },
        { status: 404 }
      )
    }

    // Deactivate all providers
    await db.aIProviderConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Activate the target and set it as highest priority
    const activated = await db.aIProviderConfig.update({
      where: { id: providerId },
      data: { isActive: true, priority: 1 },
    })

    // Re-number other providers' priorities
    const allProviders = await db.aIProviderConfig.findMany({
      where: { id: { not: providerId } },
      orderBy: [{ priority: 'asc' }],
    })
    for (let i = 0; i < allProviders.length; i++) {
      await db.aIProviderConfig.update({
        where: { id: allProviders[i].id },
        data: { priority: i + 2 }, // Start from 2 since activated is 1
      })
    }

    // Invalidate cache
    invalidateProviderCache()

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'ACTIVATE_AI_PROVIDER',
          entite: 'AIProviderConfig',
          entiteId: providerId,
          details: `Fournisseur IA activé: ${activated.name} (${activated.provider})`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      provider: configToProviderInfo(activated),
      message: `Fournisseur "${activated.name}" activé avec succès`,
    })
  } catch (error) {
    console.error('[AI Providers] Error activating provider:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'activation du fournisseur IA' },
      { status: 500 }
    )
  }
}
