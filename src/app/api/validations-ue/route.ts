import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { computeAndGenerateForStudent } from '@/lib/validation-ue-engine'

// ─── GET /api/validations-ue ───
// Get validation UE for the authenticated user
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const uniteEnseignementId = searchParams.get('uniteEnseignementId')
    const statut = searchParams.get('statut')

    // Build where clause based on role
    const where: Record<string, unknown> = {}

    if (user.role === 'ETUDIANT') {
      // ETUDIANT: can only see their own validations
      where.etudiantId = user.id
    } else {
      // RESPONSABLE, ENSEIGNANT, ADMIN: can query by etudiantId or uniteEnseignementId
      if (etudiantId) {
        where.etudiantId = etudiantId
      }
      if (uniteEnseignementId) {
        where.uniteEnseignementId = uniteEnseignementId
      }
    }

    if (statut) {
      where.statut = statut
    }

    const validations = await withRetry(() =>
      db.validationUE.findMany({
        where,
        include: {
          uniteEnseignement: {
            select: {
              id: true,
              code: true,
              nom: true,
              creditsECTS: true,
              filiere: {
                select: {
                  id: true,
                  nom: true,
                  code: true,
                },
              },
            },
          },
          anneeAcademique: {
            select: {
              id: true,
              libelle: true,
            },
          },
          certificats: {
            select: {
              id: true,
              type: true,
              intitule: true,
              codeVerification: true,
              statut: true,
              dateEmission: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
    )

    return NextResponse.json({ validations })
  } catch (error) {
    console.error('Get validations-ue error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des validations UE' },
      { status: 500 }
    )
  }
}

// ─── POST /api/validations-ue ───
// Force recomputation of validations for a student
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    let body: { etudiantId?: string } = {}

    try {
      body = await request.json()
    } catch {
      // Empty body is fine — will default to current user
    }

    // Determine target student
    const targetEtudiantId = body.etudiantId || user.id

    // ETUDIANT can only compute for themselves
    if (user.role === 'ETUDIANT' && body.etudiantId && body.etudiantId !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez calculer que vos propres validations.' },
        { status: 403 }
      )
    }

    // Compute validations and generate certificates
    const results = await computeAndGenerateForStudent(targetEtudiantId)

    // Collect all created certificates
    const certificatsCrees = results.flatMap((r) => r.certificatsCrees)

    return NextResponse.json({
      message: 'Calcul des validations terminé avec succès.',
      validations: results.map((r) => r.validationUE),
      certificatsCrees,
    })
  } catch (error) {
    console.error('Compute validations-ue error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du calcul des validations UE' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'RESPONSABLE', 'ENSEIGNANT', 'ADMIN'])
export const POST = withAuth(_POST, ['ETUDIANT', 'RESPONSABLE', 'ENSEIGNANT', 'ADMIN'])
