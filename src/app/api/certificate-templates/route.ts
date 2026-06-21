import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

/**
 * GET /api/certificate-templates?ueId=X
 * List templates. Optional ueId filter. RESPONSABLE sees their establishment's
 * UEs only; ADMIN sees all they have access to; ENSEIGNANT sees UEs they teach.
 */
async function _GET(
  request: NextRequest,
  context: { params: unknown; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const ueId = searchParams.get('ueId')

    const where: Record<string, unknown> = {}
    if (ueId) where.uniteEnseignementId = ueId

    // Scope by role
    if (user.role === 'RESPONSABLE' && user.etablissementId) {
      where.uniteEnseignement = {
        filiere: { etablissementId: user.etablissementId },
      }
    } else if (user.role === 'ENSEIGNANT') {
      where.uniteEnseignement = {
        epreuves: { some: { enseignantId: user.id } },
      }
    }

    const templates = await withRetry(() =>
      db.certificateTemplate.findMany({
        where,
        include: {
          uniteEnseignement: {
            select: { id: true, code: true, nom: true, filiereId: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
    )

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Get certificate templates error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des templates' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/certificate-templates
 * Create or update (upsert) a template for a UE.
 * Body: { ueId, backgroundImage?, primaryColor?, accentColor?, themeIcon?, fontFamily? }
 * RESPONSABLE/ADMIN only.
 */
async function _POST(
  request: NextRequest,
  context: { params: unknown; user: AuthenticatedUser }
) {
  try {
    const body = await request.json()
    const {
      ueId,
      backgroundImage,
      primaryColor,
      accentColor,
      themeIcon,
      fontFamily,
    } = body

    if (!ueId || typeof ueId !== 'string') {
      return NextResponse.json(
        { error: 'ueId est requis.' },
        { status: 400 }
      )
    }

    // Validate themeIcon
    const validIcons = ['default', 'code', 'science', 'law', 'business', 'math', 'language', 'art']
    const validFonts = ['helvetica', 'times', 'courier']

    const data = {
      backgroundImage: typeof backgroundImage === 'string' ? backgroundImage : null,
      primaryColor: typeof primaryColor === 'string' ? primaryColor.replace(/^#/, '') : null,
      accentColor: typeof accentColor === 'string' ? accentColor.replace(/^#/, '') : null,
      themeIcon: validIcons.includes(themeIcon) ? themeIcon : 'default',
      fontFamily: validFonts.includes(fontFamily) ? fontFamily : 'helvetica',
    }

    // Upsert (1:1 relation — at most one template per UE)
    const template = await withRetry(() =>
      db.certificateTemplate.upsert({
        where: { uniteEnseignementId: ueId },
        create: { uniteEnseignementId: ueId, ...data },
        update: data,
        include: {
          uniteEnseignement: {
            select: { id: true, code: true, nom: true },
          },
        },
      })
    )

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Create/update certificate template error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du template' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
export const POST = withAuth(_POST, ['RESPONSABLE', 'ADMIN'])
