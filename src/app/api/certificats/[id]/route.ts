import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// ─── GET /api/certificats/[id] ───
// Get certificate detail
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const { user } = context

    const certificat = await withRetry(() =>
      db.certificat.findUnique({
        where: { id },
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
              moyenneUE: true,
              noteNormale: true,
              noteRattrapage: true,
              noteFinale: true,
              nbEpreuvesTotal: true,
              nbEpreuvesCompletees: true,
              dateValidation: true,
              uniteEnseignementId: true,
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
            },
          },
          etudiant: {
            select: {
              id: true,
              name: true,
              email: true,
              matricule: true,
              niveau: true,
            },
          },
          emettePar: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    )

    if (!certificat) {
      return NextResponse.json(
        { error: 'Certificat non trouvé.' },
        { status: 404 }
      )
    }

    // ETUDIANT can only see their own certificates
    if (user.role === 'ETUDIANT' && certificat.etudiantId !== user.id) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous ne pouvez consulter que vos propres certificats.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ certificat })
  } catch (error) {
    console.error('Get certificat detail error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du certificat' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
