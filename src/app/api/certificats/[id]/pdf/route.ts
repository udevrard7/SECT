import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { renderCertificatPDF, type CertificatPDFData } from '@/lib/pdf/certificat-pdf-react'

// ─── GET /api/certificats/[id]/pdf ───
// Generate and download PDF certificate using @react-pdf/renderer
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const { user } = context

    // Fetch the certificate + UE template + filière responsable
    const certificat = await withRetry(() =>
      db.certificat.findUnique({
        where: { id },
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
              uniteEnseignementId: true,
              uniteEnseignement: {
                select: {
                  filiere: {
                    select: {
                      responsable: {
                        select: { id: true, name: true },
                      },
                    },
                  },
                },
              },
            },
          },
          emettePar: {
            select: { id: true, name: true },
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

    // ETUDIANT can only download their own certificates
    if (user.role === 'ETUDIANT' && certificat.etudiantId !== user.id) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous ne pouvez télécharger que vos propres certificats.' },
        { status: 403 }
      )
    }

    // Build verification URL
    const verificationUrl = `https://sect-app.vercel.app/verify/${certificat.codeVerification}`

    // Build the data object for the React component
    const pdfData: CertificatPDFData = {
      codeVerification: certificat.codeVerification,
      type: certificat.type,
      intitule: certificat.intitule,
      mention: certificat.mention,
      noteFinale: certificat.noteFinale,
      etablissementNom: certificat.etablissementNom,
      etablissementLogo: certificat.etablissementLogo,
      etablissementVille: certificat.etablissementVille,
      etablissementPays: certificat.etablissementPays,
      filiereNom: certificat.filiereNom,
      filiereCode: certificat.filiereCode,
      ueCode: certificat.ueCode,
      ueNom: certificat.ueNom,
      creditsECTS: certificat.creditsECTS,
      etudiantNom: certificat.etudiantNom,
      etudiantMatricule: certificat.etudiantMatricule,
      etudiantNiveau: certificat.etudiantNiveau,
      sessionType: certificat.sessionType,
      anneeAcademique: certificat.anneeAcademique,
      dateEmission: certificat.dateEmission,
      verificationUrl,
      statut: certificat.statut,
      responsableNom:
        certificat.validationUE?.uniteEnseignement?.filiere?.responsable?.name ??
        (certificat.emettePar?.name && certificat.emetteParId !== certificat.etudiantId
          ? certificat.emettePar.name
          : null),
    }

    // Render the React component to a PDF buffer (via @react-pdf/renderer)
    const pdfBuffer = await renderCertificatPDF(pdfData)

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificat-${certificat.codeVerification}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Generate certificat PDF error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération du PDF du certificat' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
