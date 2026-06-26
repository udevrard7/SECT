import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// ─── GET /api/certificats ───
// Get certificates for the authenticated user
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const type = searchParams.get('type')
    const statut = searchParams.get('statut')

    // Build where clause based on role
    const where: Record<string, unknown> = {}

    if (user.role === 'ETUDIANT') {
      // ETUDIANT: can only see their own certificates
      where.etudiantId = user.id
    } else if (user.role === 'ENSEIGNANT' || user.role === 'RESPONSABLE') {
      // ENSEIGNANT/RESPONSABLE: can query by etudiantId, or see all in their scope
      if (etudiantId) {
        where.etudiantId = etudiantId
      }
    }
    // ADMIN: can see all (no filter)

    if (type) {
      where.type = type
    }

    if (statut) {
      where.statut = statut
    }

    const certificats = await withRetry(() =>
      db.certificat.findMany({
        where,
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
              moyenneUE: true,
              noteFinale: true,
              uniteEnseignementId: true,
              uniteEnseignement: {
                select: {
                  id: true,
                  code: true,
                  nom: true,
                  creditsECTS: true,
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
            },
          },
          emettePar: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { dateEmission: 'desc' },
      })
    )

    return NextResponse.json({ certificats })
  } catch (error) {
    console.error('Get certificats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des certificats' },
      { status: 500 }
    )
  }
}

// ─── POST /api/certificats ───
// Manually emit a certificate (ENSEIGNANT/RESPONSABLE/ADMIN only)
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { validationUEId, type: requestedType } = body

    if (!validationUEId) {
      return NextResponse.json(
        { error: 'validationUEId est requis.' },
        { status: 400 }
      )
    }

    // Fetch the validation UE with all related data for snapshots
    const validationUE = await withRetry(() =>
      db.validationUE.findUnique({
        where: { id: validationUEId },
        include: {
          uniteEnseignement: {
            select: {
              id: true,
              code: true,
              nom: true,
              creditsECTS: true,
            },
          },
          anneeAcademique: {
            select: { id: true, libelle: true },
          },
          etudiant: {
            select: {
              id: true,
              name: true,
              matricule: true,
              niveau: true,
              filiere: {
                select: {
                  id: true,
                  nom: true,
                  code: true,
                  etablissement: {
                    select: {
                      id: true,
                      nom: true,
                      ville: true,
                      pays: true,
                      logo: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    )

    if (!validationUE) {
      return NextResponse.json(
        { error: 'Validation UE non trouvée.' },
        { status: 404 }
      )
    }

    if (validationUE.statut !== 'VALIDEE') {
      return NextResponse.json(
        { error: 'La validation UE n\'est pas validée. Impossible d\'émettre un certificat.' },
        { status: 400 }
      )
    }

    // Check if an active certificate already exists for this validation
    const existingCert = await withRetry(() =>
      db.certificat.findFirst({
        where: {
          validationUEId,
          statut: 'EMIS',
        },
      })
    )

    if (existingCert) {
      return NextResponse.json(
        { error: 'Un certificat actif existe déjà pour cette validation.', certificat: existingCert },
        { status: 409 }
      )
    }

    // Determine certificate type (Standard / Avancé / Expert)
    let type = requestedType
    if (!type) {
      if (validationUE.noteFinale >= 16) {
        type = 'EXPERT'
      } else if (validationUE.noteFinale >= 12) {
        type = 'AVANCE'
      } else if (validationUE.noteFinale >= 10) {
        type = 'STANDARD'
      } else {
        type = 'STANDARD' // Participation — below 10, manual emission only
      }
    }

    // Get intitulé
    const intituleMap: Record<string, string> = {
      'EXPERT': 'Certificat de Réussite – Niveau Expert',
      'AVANCE': 'Certificat de Réussite – Niveau Avancé',
      'STANDARD': 'Certificat de Réussite – Niveau Standard',
    }
    const intitule = intituleMap[type] || 'Certificat'

    // Get mention
    const mention =
      validationUE.noteFinale >= 16 ? 'Très Bien' :
      validationUE.noteFinale >= 14 ? 'Bien' :
      validationUE.noteFinale >= 12 ? 'Assez Bien' :
      validationUE.noteFinale >= 10 ? 'Passable' : null

    const etudiant = validationUE.etudiant
    const etablissement = etudiant.filiere?.etablissement
    const ue = validationUE.uniteEnseignement

    // Generate verification code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const segment = () =>
      Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const codeVerification = `SECT-${segment()}-${segment()}`

    // Create certificate with snapshot data
    const certificat = await withRetry(() =>
      db.certificat.create({
        data: {
          codeVerification,
          etudiantId: validationUE.etudiantId,
          validationUEId,
          type,
          intitule,
          mention,
          noteFinale: validationUE.noteFinale,
          etablissementNom: etablissement?.nom ?? 'Établissement',
          etablissementLogo: etablissement?.logo ?? null,
          etablissementVille: etablissement?.ville ?? null,
          etablissementPays: etablissement?.pays ?? null,
          filiereNom: etudiant.filiere?.nom ?? '',
          filiereCode: etudiant.filiere?.code ?? null,
          ueCode: ue.code,
          ueNom: ue.nom,
          creditsECTS: ue.creditsECTS ?? null,
          etudiantNom: etudiant.name,
          etudiantMatricule: etudiant.matricule ?? null,
          etudiantNiveau: etudiant.niveau ?? null,
          sessionType: validationUE.noteRattrapage !== null ? 'RATTRAPAGE' : 'NORMALE',
          anneeAcademique: validationUE.anneeAcademique?.libelle ?? null,
          dateEmission: new Date(),
          emetteParId: user.id,
        },
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
              moyenneUE: true,
              noteFinale: true,
            },
          },
        },
      })
    )

    return NextResponse.json({
      message: 'Certificat émis avec succès.',
      certificat,
    }, { status: 201 })
  } catch (error) {
    console.error('Create certificat error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'émission du certificat' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
export const POST = withAuth(_POST, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
