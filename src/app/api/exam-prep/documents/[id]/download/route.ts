import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { requireStudentScope, studentUeFilter } from '@/lib/exam-prep/scope'
import jsPDF from 'jspdf'

/**
 * GET /api/exam-prep/documents/[id]/download
 *
 * Télécharge le contenu d'un document. Le fichier original n'étant pas
 * stocké sur disque (seul contenuTexte est persisté), on régénère un
 * fichier lisible :
 *  - format .txt si le contenu est du texte brut
 *  - format .pdf si l'étudiant préfère (query ?format=pdf)
 *
 * Scoping : l'étudiant doit avoir accès au document via ses UE.
 *
 * Réponse : fichier binaire (Content-Disposition: attachment)
 */
export const maxDuration = 30

async function _GET(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'txt'

    const scope = requireStudentScope(user)
    if (scope.response) return scope.response

    const document = await withRetry(() =>
      db.document.findFirst({
        where: {
          id,
          deletedAt: null,
          uniteEnseignement: studentUeFilter(scope.filiereId, scope.niveau),
        },
        select: {
          id: true,
          nomFichier: true,
          contenuTexte: true,
          typeMime: true,
          owner: { select: { name: true } },
          uniteEnseignement: { select: { code: true, nom: true } },
          dateUpload: true,
        },
      })
    )

    if (!document) {
      return NextResponse.json({ error: 'Document introuvable ou non accessible' }, { status: 404 })
    }

    if (!document.contenuTexte) {
      return NextResponse.json({ error: 'Aucun contenu textuel disponible pour ce document' }, { status: 404 })
    }

    const baseName = document.nomFichier.replace(/\.[^/.]+$/, '')

    // ─── Format PDF ───
    if (format === 'pdf') {
      const pdf = new jsPDF()
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20
      let y = 20

      // En-tête
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text(document.nomFichier, pageWidth / 2, y, { align: 'center' })
      y += 8
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      if (document.uniteEnseignement) {
        pdf.text(`${document.uniteEnseignement.code} — ${document.uniteEnseignement.nom}`, pageWidth / 2, y, { align: 'center' })
        y += 5
      }
      pdf.text(`Par ${document.owner.name} — ${new Date(document.dateUpload).toLocaleDateString('fr-FR')}`, pageWidth / 2, y, { align: 'center' })
      y += 8

      // Séparateur
      pdf.setDrawColor(126, 211, 33)
      pdf.setLineWidth(0.8)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // Contenu (découpage par lignes avec wrap)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      const lines = pdf.splitTextToSize(document.contenuTexte, pageWidth - 2 * margin) as string[]
      for (const line of lines) {
        if (y > pageHeight - 20) {
          pdf.addPage()
          y = 20
        }
        pdf.text(line, margin, y)
        y += 5
      }

      const pdfBuffer = pdf.output('arraybuffer') as unknown as ArrayBuffer
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // ─── Format TXT (défaut) ───
    const header = [
      `Document : ${document.nomFichier}`,
      document.uniteEnseignement ? `UE : ${document.uniteEnseignement.code} — ${document.uniteEnseignement.nom}` : '',
      `Auteur : ${document.owner.name}`,
      `Date : ${new Date(document.dateUpload).toLocaleDateString('fr-FR')}`,
      '─'.repeat(60),
      '',
    ].filter(Boolean).join('\n')

    const txtContent = header + document.contenuTexte
    const txtBuffer = new TextEncoder().encode(txtContent)

    return new NextResponse(txtBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.txt"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[exam-prep/documents/download] error:', error)
    return NextResponse.json({ error: 'Erreur lors du téléchargement' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
