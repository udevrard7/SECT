/**
 * GET /api/enseignant/fiche-notes-pdf
 *
 * MES-ETUDIANTS-REFOUND-1 : génère un PDF "fiche de notes" tableau
 * (1 ligne par étudiant, 1 colonne par épreuve) pour l'enseignant.
 *
 * Flow :
 *   1. Fetch les données structurées depuis le backend Go
 *      GET /api/enseignant/fiche-notes?format=json&filiereId=...&niveau=...
 *   2. Génère le PDF avec jsPDF + jspdf-autotable (paysage A4 pour largeur)
 *   3. Retourne le blob PDF
 *
 * Sécurité : le token JWT (cookie httpOnly) est forwardé au backend Go
 * qui vérifie l'auth + le rôle (RequireRole ENSEIGNANT/ADMIN) + la RLS
 * (SessionPassation_select filtre par enseignant via Epreuve).
 *
 * Query params (tous forwardés au backend) :
 *   filiereId (requis), niveau (requis), semestre (optionnel),
 *   anneeUniversitaire (optionnel, ex. "2024-2025")
 */
import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-s1pb.onrender.com'

interface EpreuveCol {
  id: string
  titre: string
  noteMax: number
  ueCode: string
  ueNom: string
  semestre?: number
}

interface EtudiantRow {
  id: string
  name: string
  matricule: string
  email: string
  filiere: string
  notes: Record<string, number | null>
  moyenne?: number | null
}

interface FicheNotesData {
  epreuves: EpreuveCol[]
  etudiants: EtudiantRow[]
  filiereId: string
  niveau: string
  semestre: string
  anneeUniversitaire: string
  total: number
}

export async function GET(req: NextRequest) {
  try {
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // Forward tous les query params au backend Go
    const qs = req.nextUrl.searchParams.toString()
    const res = await fetch(`${BACKEND_URL}/api/enseignant/fiche-notes?format=json&${qs}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: errBody?.error ?? `backend error: ${res.status}` },
        { status: res.status },
      )
    }

    const data: FicheNotesData = await res.json()

    if (!data.etudiants || data.etudiants.length === 0) {
      return NextResponse.json(
        { error: 'Aucun étudiant à inclure dans la fiche de notes' },
        { status: 404 },
      )
    }

    // ─── Génération du PDF (paysage A4 pour largeur tableau) ───
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // ─── Header ───
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('FICHE DE NOTES', pageWidth / 2, 16, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const periode = [
      data.anneeUniversitaire && `Année ${data.anneeUniversitaire}`,
      data.semestre && `Semestre ${data.semestre}`,
      `Niveau ${data.niveau}`,
    ].filter(Boolean).join(' — ')
    doc.text(periode, pageWidth / 2, 22, { align: 'center' })

    doc.setFontSize(8)
    doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} — ${data.total} étudiant(s)`, pageWidth / 2, 27, { align: 'center' })

    // ─── Tableau ───
    // En-têtes : Matricule | Nom | [épreuves...] | Moyenne
    const head: string[][] = [[
      'Matricule',
      'Nom',
      ...data.epreuves.map((ep) => {
        const titre = ep.titre.length > 20 ? ep.titre.slice(0, 18) + '…' : ep.titre
        return `${titre}\n(${ep.ueCode || '—'})`
      }),
      'Moyenne',
    ]]

    // Lignes
    const body: (string | number)[][] = data.etudiants.map((etu) => {
      const nom = etu.name.length > 25 ? etu.name.slice(0, 23) + '…' : etu.name
      const row: (string | number)[] = [etu.matricule || '—', nom]
      for (const ep of data.epreuves) {
        const note = etu.notes?.[ep.id]
        if (note !== null && note !== undefined) {
          row.push(note.toFixed(2))
        } else {
          row.push('—')
        }
      }
      row.push(etu.moyenne != null ? etu.moyenne.toFixed(2) : '—')
      return row
    })

    autoTable(doc, {
      head,
      body,
      startY: 32,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [26, 60, 52], // vert savane (primary)
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'left' },  // Matricule
        1: { cellWidth: 35, halign: 'left' },   // Nom
        // colonnes épreuves : auto, centrées
        // dernière colonne (Moyenne) : centrée
      },
      // La dernière colonne (Moyenne) est centrée
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === head[0].length - 1) {
          hookData.cell.styles.halign = 'center'
          hookData.cell.styles.fontStyle = 'bold'
        }
        if (hookData.section === 'body' && hookData.column.index >= 2 && hookData.column.index < head[0].length - 1) {
          hookData.cell.styles.halign = 'center'
        }
      },
      // Colorer les notes < 10 en rouge, >= 10 en vert (uniquement body)
      willDrawCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index >= 2 && hookData.column.index < head[0].length - 1) {
          const cellText = hookData.cell.text[0]
          if (cellText && cellText !== '—') {
            const note = parseFloat(cellText)
            if (!isNaN(note)) {
              if (note < 10) {
                doc.setTextColor(220, 38, 38) // rouge
              } else {
                doc.setTextColor(22, 101, 52) // vert
              }
            } else {
              doc.setTextColor(100, 100, 100)
            }
          } else {
            doc.setTextColor(150, 150, 150)
          }
        }
      },
      margin: { left: 10, right: 10 },
    })

    // ─── Footer sur chaque page ───
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 120)
      doc.setFont('helvetica', 'italic')
      doc.text(
        'Document généré automatiquement par SECT — Système d\'Évaluation Casse-Tête',
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' },
      )
      doc.text(`Page ${i}/${pageCount}`, pageWidth - 15, pageHeight - 6, { align: 'right' })
    }

    // ─── Retourner le PDF ───
    const pdfBuffer = doc.output('arraybuffer')
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fiche_notes.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[enseignant/fiche-notes-pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
