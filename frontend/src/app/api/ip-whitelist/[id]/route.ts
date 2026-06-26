import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth-session'

// PATCH /api/ip-whitelist/[id] — Toggle active status
// ADMIN: Can update any entry
// RESPONSABLE: Can only update entries for their own establishment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthenticatedUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const { actif, description } = body

    // Verify entry exists
    const existing = await db.ipWhitelist.findUnique({
      where: { id },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Entrée de liste blanche non trouvée' },
        { status: 404 }
      )
    }

    // RESPONSABLE: can only update entries for their own establishment
    if (authUser.role === 'RESPONSABLE' && authUser.etablissementId !== existing.etablissementId) {
      return NextResponse.json({ error: 'Vous ne pouvez modifier que les entrées de votre établissement' }, { status: 403 })
    }

    if (authUser.role !== 'ADMIN' && authUser.role !== 'RESPONSABLE') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}

    if (actif !== undefined) updateData.actif = actif
    if (description !== undefined) updateData.description = description || null

    const entry = await db.ipWhitelist.update({
      where: { id },
      data: updateData,
      include: {
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE_IP_WHITELIST',
        entite: 'IpWhitelist',
        entiteId: id,
        details: JSON.stringify({
          adresseIp: existing.adresseIp,
          champsModifies: Object.keys(updateData),
          ancienActif: existing.actif,
          nouveauActif: actif !== undefined ? actif : existing.actif,
        }),
      },
    })

    const actionMessage = actif === true
      ? 'Adresse IP activée'
      : actif === false
        ? 'Adresse IP désactivée'
        : 'Entrée mise à jour'

    return NextResponse.json({
      entry,
      message: actionMessage,
    })
  } catch (error) {
    console.error('Error updating IP whitelist entry:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'entrée de liste blanche' },
      { status: 500 }
    )
  }
}

// DELETE /api/ip-whitelist/[id] — Remove IP from whitelist
// ADMIN: Can delete any entry
// RESPONSABLE: Can only delete entries for their own establishment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthenticatedUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Verify entry exists
    const existing = await db.ipWhitelist.findUnique({
      where: { id },
      include: {
        etablissement: {
          select: { id: true, nom: true },
        },
      },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Entrée de liste blanche non trouvée' },
        { status: 404 }
      )
    }

    // RESPONSABLE: can only delete entries for their own establishment
    if (authUser.role === 'RESPONSABLE' && authUser.etablissementId !== existing.etablissementId) {
      return NextResponse.json({ error: 'Vous ne pouvez supprimer que les entrées de votre établissement' }, { status: 403 })
    }

    if (authUser.role !== 'ADMIN' && authUser.role !== 'RESPONSABLE') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 })
    }

    // Delete the entry
    await db.ipWhitelist.delete({
      where: { id },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE_IP_WHITELIST',
        entite: 'IpWhitelist',
        entiteId: id,
        details: JSON.stringify({
          adresseIp: existing.adresseIp,
          etablissementId: existing.etablissementId,
          description: existing.description,
        }),
      },
    })

    return NextResponse.json({
      message: 'Adresse IP retirée de la liste blanche',
      entreeSupprimee: {
        id: existing.id,
        adresseIp: existing.adresseIp,
      },
    })
  } catch (error) {
    console.error('Error deleting IP whitelist entry:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'entrée de liste blanche' },
      { status: 500 }
    )
  }
}
