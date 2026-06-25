import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * GET /api/etudiants/[id]/releve-notes
 *
 * Génère un relevé de notes détaillé au format PDF pour un étudiant.
 * Le PDF regroupe les notes par SEMESTRE (basé sur UE.semestre) et par
 * année académique, avec pour chaque UE :
 *  - Code UE, nom, crédits ECTS
 *  - Note finale (normalisée /20)
 *  - Session (Normale / Rattrapage)
 *  - Mention
 *
 * Accessible à :
 *  - ENSEIGNANT : uniquement pour ses étudiants (scoping Affectation + EnseignantFiliere)
 *  - RESPONSABLE : étudiants de son établissement
 *  - ADMIN : tous
 *  - ETUDIANT : son propre relevé
 *
 * Query params :
 *  - ?annee=2025-2026 (filtre par année académique, optionnel)
 *
 * Réponse : PDF binaire (Content-Type: application/pdf)
 */
export const maxDuration = 60

const MENTIONS = [
  { min: 16, label: 'Très Bien' },
  { min: 14, label: 'Bien' },
  { min: 12, label: 'Assez Bien' },
  { min: 10, label: 'Passable' },
  { min: 0, label: 'Insuffisant' },
]

function getMention(note: number): string {
  return MENTIONS.find((m) => note >= m.min)?.label ?? 'Insuffisant'
}

async function _GET(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id: etudiantId } = await context.params
    const { searchParams } = new URL(request.url)
    const anneeFilter = searchParams.get('annee')

    // ─── Charge l'étudiant ───
    const etudiant = await withRetry(() =>
      db.user.findUnique({
        where: { id: etudiantId },
        select: {
          id: true, name: true, email: true, matricule: true, niveau: true, role: true,
          filiere: {
            select: {
              id: true, nom: true, code: true,
              etablissement: { select: { nom: true, ville: true, pays: true } },
            },
          },
        },
      })
    )

    if (!etudiant || etudiant.role !== 'ETUDIANT') {
      return NextResponse.json({ error: 'Étudiant introuvable' }, { status: 404 })
    }

    // ─── Vérifie l'accès ───
    if (user.role === 'ETUDIANT' && user.id !== etudiantId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    if (user.role === 'ENSEIGNANT') {
      // Vérifie que l'enseignant a accès à cet étudiant (via EnseignantFiliere ou Affectation)
      const hasAccess = await checkEnseignantAccess(user.id, etudiant)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé à cet étudiant' }, { status: 403 })
      }
    }

    if (user.role === 'RESPONSABLE') {
      // Vérifie même établissement
      const respEtab = user.etablissementId
      const etuEtab = etudiant.filiere?.etablissement?.nom // pas d'id ici, on compare via filiere.etablissement
      if (respEtab) {
        const etab = await withRetry(() =>
          db.etablissement.findFirst({
            where: { filieres: { some: { id: etudiant.filiere?.id } } },
            select: { id: true },
          })
        )
        if (!etab || etab.id !== respEtab) {
          return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
        }
      }
    }

    // ─── Charge les sessions de l'étudiant (épreuves terminées avec score) ───
    const sessions = await withRetry(() =>
      db.sessionPassation.findMany({
        where: {
          etudiantId,
          statut: { in: ['CORRIGEE', 'RETOURNEE'] },
          score: { not: null },
        },
        include: {
          epreuve: {
            select: {
              id: true, titre: true, noteTotal: true, sessionExamen: true,
              uniteEnseignement: {
                select: { id: true, code: true, nom: true, semestre: true, creditsECTS: true },
              },
              anneeAcademique: { select: { id: true, libelle: true } },
            },
          },
          resultat: { select: { scoreFinal: true, totalPossible: true } },
        },
        orderBy: { dateFin: 'asc' },
      })
    )

    // ─── Groupe par (année académique, semestre) ───
    interface NoteEntry {
      ueCode: string
      ueNom: string
      ects: number | null
      epreuveTitre: string
      note: number // normalisée /20
      session: string
      mention: string
    }

    const grouped = new Map<string, { annee: string; semestre: number; notes: NoteEntry[] }>()

    for (const s of sessions) {
      const ue = s.epreuve.uniteEnseignement
      const annee = s.epreuve.anneeAcademique?.libelle ?? 'Année non spécifiée'
      const semestre = ue?.semestre ?? 0 // 0 = non spécifié

      if (anneeFilter && annee !== anneeFilter) continue

      const totalPossible = s.resultat?.totalPossible ?? s.epreuve.noteTotal ?? 20
      const scoreFinal = s.resultat?.scoreFinal ?? s.score ?? 0
      const noteSur20 = totalPossible > 0 ? (scoreFinal / totalPossible) * 20 : 0

      const key = `${annee}|${semestre}`
      if (!grouped.has(key)) {
        grouped.set(key, { annee, semestre, notes: [] })
      }
      grouped.get(key)!.notes.push({
        ueCode: ue?.code ?? '—',
        ueNom: ue?.nom ?? 'UE non spécifiée',
        ects: ue?.creditsECTS ?? null,
        epreuveTitre: s.epreuve.titre,
        note: Math.round(noteSur20 * 100) / 100,
        session: s.epreuve.sessionExamen === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale',
        mention: getMention(noteSur20),
      })
    }

    // ─── Génère le PDF ───
    const pdf = generateRelevePDF(etudiant, Array.from(grouped.values()))

    const filename = `releve_notes_${etudiant.name.replace(/\s+/g, '_')}_${etudiant.matricule ?? etudiant.id.slice(-6)}.pdf`

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[etudiants/releve-notes] error:', error)
    return NextResponse.json({ error: 'Erreur lors de la génération du relevé' }, { status: 500 })
  }
}

// ─── Vérifie qu'un enseignant a accès à un étudiant ───

async function checkEnseignantAccess(
  enseignantId: string,
  etudiant: { filiere: { id: string } | null; niveau: string | null }
): Promise<boolean> {
  if (!etudiant.filiere || !etudiant.niveau) return false

  // Via EnseignantFiliere
  const ef = await withRetry(() =>
    db.enseignantFiliere.findFirst({
      where: {
        enseignantId,
        filiereId: etudiant.filiere!.id,
        niveau: etudiant.niveau as never,
      },
      select: { id: true },
    })
  )
  if (ef) return true

  // Via Affectation (UE affectée dont la filière+niveau matchent)
  const aff = await withRetry(() =>
    db.affectation.findFirst({
      where: {
        enseignantId,
        uniteEnseignement: {
          filiereId: etudiant.filiere!.id,
          niveau: etudiant.niveau as never,
        },
      },
      select: { id: true },
    })
  )
  return !!aff
}

// ─── Génération PDF (jspdf + jspdf-autotable) ───

interface ReleveGroup {
  annee: string
  semestre: number
  notes: Array<{
    ueCode: string
    ueNom: string
    ects: number | null
    epreuveTitre: string
    note: number
    session: string
    mention: string
  }>
}

interface EtudiantInfo {
  name: string
  email: string
  matricule: string | null
  niveau: string | null
  filiere: { nom: string; code: string | null; etablissement: { nom: string; ville: string | null; pays: string | null } } | null
}

function generateRelevePDF(etudiant: EtudiantInfo, groups: ReleveGroup[]): ArrayBuffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // ─── En-tête établissement ───
  const etab = etudiant.filiere?.etablissement
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(etab?.nom ?? 'Établissement', pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const villePays = [etab?.ville, etab?.pays].filter(Boolean).join(', ')
  doc.text(villePays || '', pageWidth / 2, y, { align: 'center' })
  y += 10

  // ─── Titre ───
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('RELEVÉ DE NOTES DÉTAILLÉ', pageWidth / 2, y, { align: 'center' })
  y += 10

  // ─── Bande kente simulée (3 traits tricolores) ───
  doc.setFillColor(126, 211, 33) // vert lime
  doc.rect(20, y, pageWidth / 3 - 13, 1.5, 'F')
  doc.setFillColor(194, 65, 12) // terre cuite
  doc.rect(pageWidth / 3 + 7, y, pageWidth / 3 - 13, 1.5, 'F')
  doc.setFillColor(212, 160, 23) // gold
  doc.rect(2 * pageWidth / 3 + 7, y, pageWidth / 3 - 13, 1.5, 'F')
  y += 8

  // ─── Infos étudiant ───
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const infos = [
    `Nom : ${etudiant.name}`,
    `Matricule : ${etudiant.matricule ?? '—'}`,
    `Email : ${etudiant.email}`,
    `Filière : ${etudiant.filiere?.code ?? '—'} — ${etudiant.filiere?.nom ?? '—'}`,
    `Niveau : ${etudiant.niveau ?? '—'}`,
  ]
  for (const info of infos) {
    doc.text(info, 20, y)
    y += 5.5
  }
  y += 4

  // ─── Notes par groupe (année + semestre) ───
  if (groups.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.text('Aucune note enregistrée pour le moment.', 20, y)
  } else {
    // Trie les groupes : par année puis semestre
    const sorted = [...groups].sort((a, b) => {
      const anneeComp = b.annee.localeCompare(a.annee) // année la plus récente d'abord
      if (anneeComp !== 0) return anneeComp
      return a.semestre - b.semestre
    })

    for (const group of sorted) {
      // Titre du groupe
      const semestreLabel = group.semestre > 0 ? `Semestre ${group.semestre}` : 'Semestre non spécifié'
      const groupTitle = `${group.annee} — ${semestreLabel}`

      // Vérifie l'espace restant pour le titre + au moins une ligne
      if (y > 250) {
        doc.addPage()
        y = 20
      }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(groupTitle, 20, y)
      y += 5

      // Tableau des notes
      autoTable(doc, {
        startY: y,
        head: [['Code UE', 'Unité d\'enseignement', 'ECTS', 'Épreuve', 'Note /20', 'Session', 'Mention']],
        body: group.notes.map((n) => [
          n.ueCode,
          n.ueNom,
          n.ects?.toString() ?? '—',
          n.epreuveTitre,
          n.note.toFixed(2),
          n.session,
          n.mention,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 45 },
          2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 40 },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 20 },
          6: { cellWidth: 25 },
        },
        margin: { left: 20, right: 20 },
      })

      // Moyenne du groupe
      const moy = group.notes.reduce((s, n) => s + n.note, 0) / group.notes.length
      // @ts-expect-error lastAutoTable est ajouté par jspdf-autotable
      y = (doc.lastAutoTable?.finalY ?? y) + 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`Moyenne du semestre : ${moy.toFixed(2)}/20 — ${getMention(moy)}`, 20, y)
      y += 10
    }
  }

  // ─── Pied de page ───
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(120)
  doc.text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} — SECT Plateforme d'évaluation`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  )
  doc.setTextColor(0)

  return doc.output('arraybuffer') as unknown as ArrayBuffer
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN', 'ETUDIANT'])
