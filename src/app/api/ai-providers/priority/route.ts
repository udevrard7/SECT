import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidateProviderCache } from '@/lib/ai-providers'

// POST /api/ai-providers/priority — Update provider priority order
// Body: { priorities: [{ id: string, priority: number }] }
export async function POST(request: NextRequest) {
  try {
    const { priorities } = await request.json()

    if (!priorities || !Array.isArray(priorities)) {
      return NextResponse.json(
        { error: 'Liste des priorités requise' },
        { status: 400 }
      )
    }

    // Validate and update each priority
    const updates: Record<string, unknown>[] = []
    for (const item of priorities) {
      if (!item.id || typeof item.priority !== 'number') continue

      const provider = await db.aIProviderConfig.findUnique({
        where: { id: item.id },
      })

      if (!provider) continue

      const updated = await db.aIProviderConfig.update({
        where: { id: item.id },
        data: { priority: Math.max(1, Math.min(100, item.priority)) },
      })
      updates.push(updated)
    }

    // Invalidate cache
    invalidateProviderCache()

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'REORDER_AI_PROVIDERS',
          entite: 'AIProviderConfig',
          details: `Ordre de priorité des fournisseurs IA mis à jour (${updates.length} fournisseurs)`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      message: 'Ordre de priorité mis à jour avec succès',
      updatedCount: updates.length,
    })
  } catch (error) {
    console.error('[AI Providers] Error updating priorities:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour des priorités' },
      { status: 500 }
    )
  }
}
