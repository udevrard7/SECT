import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'

// ─── GET /api/certificats/verify/[code] ───
// PUBLIC endpoint — no authentication required
// Verifies a certificate by its verification code
export async function GET(
  request: NextRequest,
  context: { params: any }
) {
  try {
    const { code } = await context.params

    if (!code) {
      return NextResponse.json(
        { valid: false, error: 'Code de vérification requis.' },
        { status: 400 }
      )
    }

    // Find certificate by verification code
    const certificat = await withRetry(() =>
      db.certificat.findUnique({
        where: { codeVerification: code },
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
            },
          },
        },
      })
    )

    // Not found or revoked → invalid
    if (!certificat || certificat.statut === 'REVOQUE') {
      return NextResponse.json({
        valid: false,
        error: certificat ? 'Ce certificat a été révoqué.' : 'Certificat non trouvé.',
      })
    }

    // Valid certificate — return public info
    return NextResponse.json({
      valid: true,
      certificat: {
        type: certificat.type,
        intitule: certificat.intitule,
        etudiantNom: certificat.etudiantNom,
        ueCode: certificat.ueCode,
        ueNom: certificat.ueNom,
        noteFinale: certificat.noteFinale,
        mention: certificat.mention,
        dateEmission: certificat.dateEmission,
        etablissementNom: certificat.etablissementNom,
        statut: certificat.statut,
      },
    })
  } catch (error) {
    console.error('Verify certificat error:', error)
    return NextResponse.json(
      { valid: false, error: 'Erreur lors de la vérification du certificat.' },
      { status: 500 }
    )
  }
}
