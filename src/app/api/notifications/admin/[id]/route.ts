import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/notifications/admin/[id] — Mark as read/unread, update statut
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, lu, priorite, categorie, actionUrl, actionLabel, icone, expireLe } = body

    // Verify notification exists
    const existing = await db.notificationAdmin.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Notification non trouvée' },
        { status: 404 }
      )
    }

    // Action-based updates
    if (action === 'marquer_lu') {
      const notification = await db.notificationAdmin.update({
        where: { id },
        data: { lu: true },
        include: {
          destinataire: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE_NOTIFICATION',
          entite: 'NotificationAdmin',
          entiteId: id,
          details: JSON.stringify({ action: 'marquer_lu' }),
        },
      })

      return NextResponse.json({
        notification,
        message: 'Notification marquée comme lue',
      })
    }

    if (action === 'marquer_non_lu') {
      const notification = await db.notificationAdmin.update({
        where: { id },
        data: { lu: false },
        include: {
          destinataire: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE_NOTIFICATION',
          entite: 'NotificationAdmin',
          entiteId: id,
          details: JSON.stringify({ action: 'marquer_non_lu' }),
        },
      })

      return NextResponse.json({
        notification,
        message: 'Notification marquée comme non lue',
      })
    }

    // General update
    const updateData: Record<string, unknown> = {}

    if (lu !== undefined) updateData.lu = lu

    if (priorite !== undefined) {
      const validPriorites = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']
      if (!validPriorites.includes(priorite)) {
        return NextResponse.json(
          { error: `Priorité invalide. Valeurs acceptées: ${validPriorites.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.priorite = priorite
    }

    if (categorie !== undefined) {
      const validCategories = ['SYSTEME', 'ABONNEMENT', 'SECURITE', 'EVALUATION', 'COMPTE']
      if (!validCategories.includes(categorie)) {
        return NextResponse.json(
          { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.categorie = categorie
    }

    if (actionUrl !== undefined) updateData.actionUrl = actionUrl || null
    if (actionLabel !== undefined) updateData.actionLabel = actionLabel || null
    if (icone !== undefined) updateData.icone = icone || null
    if (expireLe !== undefined) updateData.expireLe = expireLe ? new Date(expireLe) : null

    const notification = await db.notificationAdmin.update({
      where: { id },
      data: updateData,
      include: {
        destinataire: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE_NOTIFICATION',
        entite: 'NotificationAdmin',
        entiteId: id,
        details: JSON.stringify({
          champsModifies: Object.keys(updateData),
          titre: existing.titre,
        }),
      },
    })

    return NextResponse.json({
      notification,
      message: 'Notification mise à jour',
    })
  } catch (error) {
    console.error('Error updating notification:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la notification' },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/admin/[id] — Delete a notification
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify notification exists
    const existing = await db.notificationAdmin.findUnique({
      where: { id },
      include: {
        destinataire: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Notification non trouvée' },
        { status: 404 }
      )
    }

    // Delete the notification
    await db.notificationAdmin.delete({
      where: { id },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE_NOTIFICATION',
        entite: 'NotificationAdmin',
        entiteId: id,
        details: JSON.stringify({
          titre: existing.titre,
          type: existing.type,
          categorie: existing.categorie,
          destinataireId: existing.destinataireId,
          destinataireRole: existing.destinataireRole,
        }),
      },
    })

    return NextResponse.json({
      message: 'Notification supprimée avec succès',
      notificationSupprimee: {
        id: existing.id,
        titre: existing.titre,
      },
    })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la notification' },
      { status: 500 }
    )
  }
}
