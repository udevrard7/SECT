import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// Helper: check if user can access a notification (RBAC)
async function canUserAccessNotification(
  user: AuthenticatedUser,
  notification: { destinataireId: string | null; destinataireRole: string | null }
): Promise<boolean> {
  // Admin can access everything
  if (user.role === 'ADMIN') return true
  // Direct recipient
  if (notification.destinataireId === user.id) return true
  // Role-based group
  if (notification.destinataireRole === user.role) return true
  // Broadcast (no specific recipient)
  if (!notification.destinataireId && !notification.destinataireRole) return true
  return false
}

// PATCH /api/notifications/admin/[id] — Mark as read/unread, update statut
async function _PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }>; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
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

    // --- RBAC Check ---
    const hasAccess = await canUserAccessNotification(context.user, existing)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous n\'avez pas la permission de modifier cette notification.' },
        { status: 403 }
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
          userId: context.user.id,
          userEmail: context.user.email,
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
          userId: context.user.id,
          userEmail: context.user.email,
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

    // General update (admin only for non-action updates)
    if (context.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Accès refusé. Seul un administrateur peut modifier les notifications.' },
        { status: 403 }
      )
    }

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
        userId: context.user.id,
        userEmail: context.user.email,
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
async function _DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }>; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params

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
        userId: context.user.id,
        userEmail: context.user.email,
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

export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const DELETE = withAuth(_DELETE, ['ADMIN'])
