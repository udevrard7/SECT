/**
 * GET /api/etudiants/[id]/releve-notes
 *
 * P2-M1 : génère un relevé de notes PDF pour un étudiant.
 * Fetch les sessions + résultats depuis le backend Go, génère un PDF
 * côté serveur Next.js via jsPDF, retourne le blob.
 *
 * Sécurité : le token JWT (cookie httpOnly) est passé au backend Go
 * qui vérifie l'ownership (EnseignantFiliere).
 */
import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-s1pb.onrender.com'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // 1. Fetch les résultats de l'étudiant depuis le backend Go
    const res = await fetch(`${BACKEND_URL}/api/resultats?etudiantId=${id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `backend error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const resultats = data.resultats || data.sessions || []
    if (resultats.length === 0) {
      return NextResponse.json(
        { error: 'Aucun résultat trouvé pour cet étudiant' },
        { status: 404 }
      )
    }

    // 2. Extraire les infos étudiant du premier résultat
    const firstResult = resultats[0]
    const etudiantNom = firstResult.etudiant?.name || firstResult.User?.name || 'Étudiant'
    const etudiantMatricule = firstResult.etudiant?.matricule || firstResult.User?.matricule || ''

    // 3. Générer le PDF avec jsPDF
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let y = 20

    // Header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('RELEVÉ DE NOTES', pageWidth / 2, y, { align: 'center' })
    y += 10

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Étudiant : ${etudiantNom}`, 20, y)
    y += 6
    if (etudiantMatricule) {
      doc.text(`Matricule : ${etudiantMatricule}`, 20, y)
      y += 6
    }
    doc.text(`Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`, 20, y)
    y += 10

    // Table header
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setFillColor(240, 240, 240)
    doc.rect(15, y - 4, pageWidth - 30, 7, 'F')
    doc.text('Épreuve', 17, y)
    doc.text('Note', pageWidth - 60, y)
    doc.text('Sur', pageWidth - 45, y)
    doc.text('%', pageWidth - 30, y)
    doc.text('Statut', pageWidth - 22, y)
    y += 8

    // Rows
    doc.setFont('helvetica', 'normal')
    let totalScore = 0
    let totalPossible = 0
    let count = 0

    for (const r of resultats) {
      if (y > pageHeight - 30) {
        doc.addPage()
        y = 20
      }

      const titre = (r.epreuve?.titre || r.Epreuve?.titre || 'N/A').substring(0, 50)
      const score = r.resultat?.scoreFinal ?? r.score ?? 0
      const total = r.resultat?.totalPossible || r.epreuve?.noteTotal || r.Epreuve?.noteTotal || 20
      const pct = total > 0 ? Math.round((score / total) * 100) : 0
      const statut = r.statut || r.Resultat?.statut || ''

      doc.text(titre, 17, y)
      doc.text(score.toFixed(2), pageWidth - 60, y)
      doc.text(total.toFixed(0), pageWidth - 45, y)
      doc.text(`${pct}%`, pageWidth - 30, y)
      doc.text(statut, pageWidth - 22, y)
      y += 6

      totalScore += score
      totalPossible += total
      count++
    }

    // Summary
    y += 5
    doc.setLineWidth(0.3)
    doc.line(15, y, pageWidth - 15, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.text('MOYENNE GÉNÉRALE', 17, y)
    const moyPct = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0
    const moySur20 = totalPossible > 0 ? ((totalScore / totalPossible) * 20).toFixed(2) : '0'
    doc.text(`${moySur20}/20`, pageWidth - 60, y)
    doc.text(`${moyPct}%`, pageWidth - 30, y)
    y += 10

    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text('Document généré automatiquement par SECT — Système d\'Évaluation Casse-Tête', pageWidth / 2, pageHeight - 10, { align: 'center' })

    // 4. Retourner le PDF
    const pdfBuffer = doc.output('arraybuffer')

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="releve_notes_${etudiantNom.replace(/\s+/g, '_')}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[etudiants/releve-notes] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
