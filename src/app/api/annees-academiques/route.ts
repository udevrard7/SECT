import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

/**
 * GET /api/annees-academiques
 * 
 * Récupère les années académiques d'un établissement.
 * Query params: etablissementId (required), actif (optional filter)
 */
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId')

    if (!etablissementId) {
      return NextResponse.json(
        { error: 'etablissementId requis' },
        { status: 400 }
      )
    }

    // Tenant check
    if (user.role === 'ADMIN') {
      const accessError = await requireAdminEtablissementAccess(user, etablissementId)
      if (accessError) return accessError
    } else if (user.role === 'RESPONSABLE' || user.role === 'ENSEIGNANT') {
      if (user.etablissementId !== etablissementId) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    }

    const where: Record<string, unknown> = { etablissementId }
    if (searchParams.get('actif') === 'true') {
      where.actif = true
    }

    const annees = await db.anneeAcademique.findMany({
      where,
      orderBy: { dateDebut: 'desc' },
      include: {
        _count: { select: { epreuves: true } },
      },
    })

    return NextResponse.json(annees)
  } catch (error) {
    console.error('Get annees academiques error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des années académiques' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/annees-academiques
 * 
 * Crée une nouvelle année académique.
 * Body: { libelle, dateDebut, dateFin, etablissementId }
 */
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { libelle, dateDebut, dateFin, etablissementId } = body

    if (!libelle || !dateDebut || !dateFin || !etablissementId) {
      return NextResponse.json(
        { error: 'libelle, dateDebut, dateFin et etablissementId requis' },
        { status: 400 }
      )
    }

    // Only ADMIN and RESPONSABLE can create
    if (!['ADMIN', 'RESPONSABLE'].includes(user.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Tenant check
    if (user.role === 'ADMIN') {
      const accessError = await requireAdminEtablissementAccess(user, etablissementId)
      if (accessError) return accessError
    } else if (user.etablissementId !== etablissementId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const annee = await db.anneeAcademique.create({
      data: {
        libelle,
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        etablissementId,
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CREATE_ANNEE_ACADEMIQUE',
        entite: 'AnneeAcademique',
        entiteId: annee.id,
        details: `Année académique créée: ${libelle}`,
      },
    })

    return NextResponse.json(annee, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Cette année académique existe déjà pour cet établissement' },
        { status: 409 }
      )
    }
    console.error('Create annee academique error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'année académique' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE'])
