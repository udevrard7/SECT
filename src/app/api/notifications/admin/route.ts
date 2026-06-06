import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/notifications/admin — List notifications with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const lu = searchParams.get('lu') || ''
    const destinataireRole = searchParams.get('destinataireRole') || ''
    const categorie = searchParams.get('categorie') || ''
    const destinataireId = searchParams.get('destinataireId') || ''
    const markAllRead = searchParams.get('markAllRead') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (type) where.type = type
    if (lu === 'true') where.lu = true
    else if (lu === 'false') where.lu = false
    if (destinataireRole) where.destinataireRole = destinataireRole
    if (categorie) where.categorie = categorie
    if (destinataireId) where.destinataireId = destinataireId

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
export async function POST(request: NextRequest) {
  try {
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
      const user = await db.user.findUnique({ where: { id: destinataireId } })
      if (!user) {
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
