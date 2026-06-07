import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// GET /api/notifications/admin — List notifications with RBAC filtering
// Protected by withAuth: requires authenticated user.
// RBAC: Users see notifications where destinataireId === user.id OR destinataireRole === user.role
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const lu = searchParams.get('lu') || ''
    const destinataireRole = searchParams.get('destinataireRole') || ''
    const categorie = searchParams.get('categorie') || ''
    const destinataireId = searchParams.get('destinataireId') || ''
    const markAllRead = searchParams.get('markAllRead') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // --- RBAC scoping ---
    // Admin can see all notifications (for the admin page management)
    // Other roles see only their own: destinataireId === user.id OR destinataireRole === user.role
    const rbacConditions: Record<string, unknown>[] = []

    if (user.role === 'ADMIN') {
      // Admin sees everything (they manage notifications from the admin page)
      // No RBAC filtering needed
    } else {
      // Non-admin: only see notifications destined for them
      rbacConditions.push({ destinataireId: user.id }) // Direct recipient
      rbacConditions.push({ destinataireRole: user.role }) // Role-based group
      rbacConditions.push({ destinataireId: null, destinataireRole: null }) // Broadcast
    }

    const where: Record<string, unknown> = {}

    // Apply RBAC conditions
    if (rbacConditions.length > 0) {
      where.OR = rbacConditions
    }

    // Apply additional filters on top of RBAC
    if (type) where.type = type
    if (lu === 'true') where.lu = true
    else if (lu === 'false') where.lu = false
    if (destinataireRole && user.role === 'ADMIN') where.destinataireRole = destinataireRole
    if (categorie) where.categorie = categorie
    if (destinataireId && user.role === 'ADMIN') where.destinataireId = destinataireId

    // If markAllRead is requested, update all matching notifications
    if (markAllRead) {
      await db.notificationAdmin.updateMany({
        where: { ...where, lu: false },
        data: { lu: true },
      })
    }

    const [notifications, total] = await Promise.all([
      db.notificationAdmin.findMany({
        where,
        include: {
          destinataire: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.notificationAdmin.count({ where }),
    ])

    const unreadCount = await db.notificationAdmin.count({
      where: { ...where, lu: false },
    })

    return NextResponse.json({ notifications, total, unreadCount })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des notifications' },
      { status: 500 }
    )
  }
}

// POST /api/notifications/admin — Create a notification (broadcast or targeted)
// Protected by withAuth: requires ADMIN role.
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const {
      type,
      titre,
      message,
      destinataireId,
      destinataireRole,
      actionUrl,
      actionLabel,
      priorite,
      categorie,
      icone,
      expireLe,
    } = body

    // Validate required fields
    if (!titre || !message) {
      return NextResponse.json(
        { error: 'Les champs titre et message sont obligatoires' },
        { status: 400 }
      )
    }

    // Validate type if provided
    if (type) {
      const validTypes = ['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'BROADCAST']
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate priorite if provided
    if (priorite) {
      const validPriorites = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']
      if (!validPriorites.includes(priorite)) {
        return NextResponse.json(
          { error: `Priorité invalide. Valeurs acceptées: ${validPriorites.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate categorie if provided
    if (categorie) {
      const validCategories = ['SYSTEME', 'ABONNEMENT', 'SECURITE', 'EVALUATION', 'COMPTE']
      if (!validCategories.includes(categorie)) {
        return NextResponse.json(
          { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate destinataireRole if provided
    if (destinataireRole) {
      const validRoles = ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT']
      if (!validRoles.includes(destinataireRole)) {
        return NextResponse.json(
          { error: `Rôle destinataire invalide. Valeurs acceptées: ${validRoles.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // If destinataireId is provided, verify user exists
    if (destinataireId) {
      const targetUser = await db.user.findUnique({ where: { id: destinataireId } })
      if (!targetUser) {
        return NextResponse.json(
          { error: 'Utilisateur destinataire non trouvé' },
          { status: 404 }
        )
      }
    }

    // Determine if this is a broadcast (no destinataireId) or targeted notification
    const isBroadcast = !destinataireId
    const notificationType = type || (isBroadcast ? 'BROADCAST' : 'INFO')

    const notification = await db.notificationAdmin.create({
      data: {
        type: notificationType,
        titre,
        message,
        destinataireId: destinataireId || null,
        destinataireRole: destinataireRole || null,
        actionUrl: actionUrl || null,
        actionLabel: actionLabel || null,
        priorite: priorite || 'NORMALE',
        categorie: categorie || 'SYSTEME',
        icone: icone || null,
        expireLe: expireLe ? new Date(expireLe) : null,
      },
      include: {
        destinataire: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CREATE_NOTIFICATION',
        entite: 'NotificationAdmin',
        entiteId: notification.id,
        details: JSON.stringify({
          titre,
          type: notificationType,
          isBroadcast,
          destinataireId: destinataireId || null,
          destinataireRole: destinataireRole || null,
          categorie: categorie || 'SYSTEME',
        }),
      },
    })

    return NextResponse.json({ notification }, { status: 201 })
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la notification' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const POST = withAuth(_POST, ['ADMIN'])
