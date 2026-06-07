
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// GET /api/alertes — List alertes with filters
// Protected by withAuth: requires ADMIN, RESPONSABLE, or ENSEIGNANT role.
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId') || ''
    const severity = searchParams.get('severity') || ''
    const type = searchParams.get('type') || ''
    const lue = searchParams.get('lue') || ''
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // --- Authorization Logic ---
    // Base filters from query params
    const baseFilters: Record<string, unknown>[] = []
    if (filiereId) baseFilters.push({ filiereId })
    if (severity) baseFilters.push({ severity })
    if (type) baseFilters.push({ type })
    if (lue === 'true') baseFilters.push({ lue: true })
    else if (lue === 'false') baseFilters.push({ lue: false })
    if (search) {
      baseFilters.push({
        OR: [
          { titre: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    // ─── RBAC scoping: user sees only their own notifications or role-group ones ───
    // Rule: userId === user.id (direct recipient) OR userId is null + establishment scoping (broadcast)
    const rbacConditions: Record<string, unknown>[] = [
      { userId: user.id }, // Direct recipient always sees the alerte
    ]

    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: broadcast alertes for filieres in their establishment + own epreuves
      const enseignantConditions: Record<string, unknown>[] = [
        { userId: null, filiere: { etablissementId: user.etablissementId } },
      ]
      // Also include alertes for epreuves created by this enseignant
      const ownEpreuveIds = await db.epreuve.findMany({
        where: { enseignantId: user.id },
        select: { id: true },
      })
      if (ownEpreuveIds.length > 0) {
        enseignantConditions.push({
          userId: null,
          epreuveId: { in: ownEpreuveIds.map((e) => e.id) },
        })
      }
      rbacConditions.push(...enseignantConditions)
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: broadcast alertes for filieres in their establishment
      rbacConditions.push({
        userId: null,
        filiere: { etablissementId: user.etablissementId },
      })
      // Also include broadcast alertes without filiere (global alerts for the establishment)
      rbacConditions.push({
        userId: null,
        filiereId: null,
        epreuveId: null,
      })
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the filiere's establishment
      if (filiereId) {
        // Specific filiere requested — verify access
        const filiere = await db.filiere.findUnique({
          where: { id: filiereId },
          select: { etablissementId: true },
        })
        if (filiere?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, filiere.etablissementId)
          if (accessError) return accessError
        }
      }
      // Admin-specific broadcast conditions
      const tenantFilter = await resolveTenantFilter(user)
      if ('error' in tenantFilter) return tenantFilter.error
      if ('etablissementIds' in tenantFilter) {
        rbacConditions.push({
          userId: null,
          filiere: { etablissementId: { in: tenantFilter.etablissementIds } },
        })
      } else if ('etablissementId' in tenantFilter) {
        rbacConditions.push({
          userId: null,
          filiere: { etablissementId: tenantFilter.etablissementId },
        })
      }
      // Also include broadcast alertes without filiere for admin
      rbacConditions.push({
        userId: null,
        filiereId: null,
        epreuveId: null,
      })
    }

    // Build final where clause: RBAC OR conditions combined with base filters
    const where: Record<string, unknown> = {}
    if (baseFilters.length > 0) {
      where.AND = [
        { OR: rbacConditions },
        ...baseFilters,
      ]
    } else {
      where.OR = rbacConditions
    }

    const [alertes, total] = await Promise.all([
      db.alerte.findMany({
        where,
        include: {
          filiere: { select: { id: true, nom: true } },
          epreuve: { select: { id: true, titre: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.alerte.count({ where }),
    ])

    return NextResponse.json({ alertes, total })
  } catch (error) {
    console.error('Error fetching alertes:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des alertes' },
      { status: 500 }
    )
  }
}

// POST /api/alertes — Create a new alerte
// Protected by withAuth: requires ADMIN or RESPONSABLE role.
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { titre, description, severity, type, filiereId, epreuveId, userId: targetUserId } = body

    if (!titre || !description) {
      return NextResponse.json(
        { error: 'Le titre et la description sont obligatoires' },
        { status: 400 }
      )
    }

    // --- Authorization & Validation ---
    if (user.role === 'RESPONSABLE') {
        if (filiereId) {
            const filiere = await db.filiere.findUnique({ where: { id: filiereId } });
            if (!filiere || filiere.etablissementId !== user.etablissementId) {
                return NextResponse.json({ error: 'Vous pouvez uniquement créer des alertes pour les filières de votre établissement.' }, { status: 403 });
            }
        }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the filiere's establishment
      if (filiereId) {
        const filiere = await db.filiere.findUnique({
          where: { id: filiereId },
          select: { etablissementId: true },
        })
        if (filiere?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, filiere.etablissementId)
          if (accessError) return accessError
        }
      }
    }

    const alerte = await db.alerte.create({
      data: {
        titre,
        description,
        severity: severity || 'INFO',
        type: type || 'CUSTOM',
        filiereId: filiereId || null,
        epreuveId: epreuveId || null,
        userId: targetUserId || null, 
      },
      include: {
        filiere: { select: { id: true, nom: true } },
        epreuve: { select: { id: true, titre: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    
    // Audit Log
    await db.auditLog.create({
        data: {
          userId: user.id,
          userEmail: user.email,
          action: 'CREATE',
          entite: 'Alerte',
          entiteId: alerte.id,
          details: JSON.stringify(alerte),
        },
    });

    return NextResponse.json({ alerte }, { status: 201 })
  } catch (error) {
    console.error('Error creating alerte:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'alerte' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE'])
