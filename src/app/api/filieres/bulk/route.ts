import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

// PATCH /api/filieres/bulk — Bulk update (activate/deactivate/delete multiple filières)
async function _PATCH(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const body = await request.json()
    const { ids, action } = body as {
      ids: string[]
      action: 'activate' | 'deactivate' | 'delete'
    }

    // Validate required fields
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'La liste des identifiants est requise et ne peut pas être vide' },
        { status: 400 }
      )
    }

    if (!action || !['activate', 'deactivate', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: "L'action doit être 'activate', 'deactivate' ou 'delete'" },
        { status: 400 }
      )
    }

    // Build where clause — RESPONSABLE can only bulk-update filières in their establishment
    const where: Record<string, unknown> = {
      id: { in: ids },
    }

    if (context.user.role === 'RESPONSABLE' && context.user.etablissementId) {
      where.etablissementId = context.user.etablissementId
    }

    // Determine the actif value based on action
    let actifValue: boolean
    let auditAction: string

    switch (action) {
      case 'activate':
        actifValue = true
        auditAction = 'BULK_ACTIVATE'
        break
      case 'deactivate':
        actifValue = false
        auditAction = 'BULK_DEACTIVATE'
        break
      case 'delete':
        actifValue = false
        auditAction = 'BULK_DELETE'
        break
    }

    // Perform the bulk update
    const updated = await db.filiere.updateMany({
      where,
      data: { actif: actifValue },
    })

    // Fetch the updated filières for the response
    const filieres = await db.filiere.findMany({
      where: { id: { in: ids } },
      include: {
        etablissement: { select: { id: true, nom: true } },
        responsable: { select: { id: true, name: true, email: true } },
        _count: { select: { etudiants: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Create audit log entry
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        userEmail: context.user.email,
        action: auditAction,
        entite: 'Filiere',
        details: JSON.stringify({
          action,
          ids,
          count: updated.count,
          performedBy: context.user.role,
        }),
      },
    })

    return NextResponse.json({
      updated: updated.count,
      filieres,
    })
  } catch (error) {
    console.error('Error bulk updating filieres:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour en masse des filières' },
      { status: 500 }
    )
  }
}

export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE'])
