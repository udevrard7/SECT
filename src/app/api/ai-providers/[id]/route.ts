import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { configToProviderInfo, invalidateProviderCache } from '@/lib/ai-providers'
import { withAuth } from '@/lib/auth-session'

// GET /api/ai-providers/[id] — Get a single AI provider configuration
// 🔒 ADMIN only
const _getHandler = async (
  request: NextRequest,
  context: { params: any; user: any }
) => {
  try {
    const { id } = await context.params
    const provider = await db.aIProviderConfig.findUnique({
      where: { id },
    })

    if (!provider) {
      return NextResponse.json(
        { error: 'Fournisseur IA non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      provider: configToProviderInfo(provider),
    })
  } catch (error) {
    console.error('[AI Providers] Error getting provider:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du fournisseur IA' },
      { status: 500 }
    )
  }
}

// PATCH /api/ai-providers/[id] — Update an AI provider configuration
// 🔒 ADMIN only
const _patchHandler = async (
  request: NextRequest,
  context: { params: any; user: any }
) => {
  try {
    const { id } = await context.params
    const body = await request.json()

    const existing = await db.aIProviderConfig.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Fournisseur IA non trouvé' },
        { status: 404 }
      )
    }

    // If setting isActive=true, deactivate all others first
    if (body.isActive === true) {
      await db.aIProviderConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
      invalidateProviderCache()
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    const allowedFields = ['name', 'provider', 'baseUrl', 'apiKey', 'model', 'temperature', 'maxTokens', 'isActive']
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Handle extraConfig
    if (body.extraConfig !== undefined) {
      updateData.extraConfig = typeof body.extraConfig === 'string'
        ? body.extraConfig
        : JSON.stringify(body.extraConfig)
    }

    const updated = await db.aIProviderConfig.update({
      where: { id },
      data: updateData,
    })

    // Invalidate cache if anything changed
    invalidateProviderCache()

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entite: 'AIProviderConfig',
          entiteId: id,
          details: `Fournisseur IA modifié: ${updated.name} (${updated.provider})`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      provider: configToProviderInfo(updated),
    })
  } catch (error) {
    console.error('[AI Providers] Error updating provider:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du fournisseur IA' },
      { status: 500 }
    )
  }
}

// DELETE /api/ai-providers/[id] — Delete an AI provider configuration
// 🔒 ADMIN only
const _deleteHandler = async (
  _request: NextRequest,
  context: { params: any; user: any }
) => {
  try {
    const { id } = await context.params

    const existing = await db.aIProviderConfig.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Fournisseur IA non trouvé' },
        { status: 404 }
      )
    }

    await db.aIProviderConfig.delete({
      where: { id },
    })

    invalidateProviderCache()

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'DELETE',
          entite: 'AIProviderConfig',
          entiteId: id,
          details: `Fournisseur IA supprimé: ${existing.name} (${existing.provider})`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[AI Providers] Error deleting provider:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du fournisseur IA' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_getHandler, ['ADMIN'])
export const PATCH = withAuth(_patchHandler, ['ADMIN'])
export const DELETE = withAuth(_deleteHandler, ['ADMIN'])
