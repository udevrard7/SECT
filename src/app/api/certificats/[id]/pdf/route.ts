import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { generateCertificatPDF } from '@/lib/pdf/certificat-pdf'

// ─── GET /api/certificats/[id]/pdf ───
// Generate and download PDF certificate
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const { user } = context

    // Fetch the certificate + the UE's certificate template (if any) + issuer name
    const certificat = await withRetry(() =>
      db.certificat.findUnique({
        where: { id },
        include: {
          validationUE: {
            select: {
              id: true,
              statut: true,
              uniteEnseignementId: true,
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

    // Load the UE's certificate template (if any) for thematic rendering
    const ueId = certificat.validationUE?.uniteEnseignementId
    let templateData = null
    if (ueId) {
      const tpl = await withRetry(() =>
        db.certificateTemplate.findUnique({
          where: { uniteEnseignementId: ueId },
          select: {
            backgroundImage: true,
            primaryColor: true,
            accentColor: true,
            themeIcon: true,
            fontFamily: true,
          },
        })
      )
      if (tpl) {
        templateData = {
          backgroundImage: tpl.backgroundImage,
          primaryColor: tpl.primaryColor,
          accentColor: tpl.accentColor,
          themeIcon: tpl.themeIcon,
          fontFamily: tpl.fontFamily,
        }
      }
    }

    // Generate PDF
    const pdf = generateCertificatPDF({
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
      emetteParNom: certificat.emettePar?.name ?? null,
      template: templateData,
    })

    // Convert to buffer and return
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificat-${certificat.codeVerification}.pdf"`,
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
