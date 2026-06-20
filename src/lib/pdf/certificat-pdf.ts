/**
 * Certificate PDF Generator
 *
 * Generates professional PDF certificates for validated UEs.
 * Uses jsPDF for PDF generation with a formal certificate layout.
 */

import { jsPDF } from 'jspdf'

// ─── Types ───

export interface CertificatPDFData {
  codeVerification: string
  type: string
  intitule: string
  mention: string | null
  noteFinale: number
  etablissementNom: string
  etablissementLogo: string | null
  etablissementVille: string | null
  etablissementPays: string | null
  filiereNom: string
  filiereCode: string | null
  ueCode: string
  ueNom: string
  creditsECTS: number | null
  etudiantNom: string
  etudiantMatricule: string | null
  etudiantNiveau: string | null
  sessionType: string
  anneeAcademique: string | null
  dateEmission: Date | string
  verificationUrl: string
  statut: string
}

// ─── Constants ───

const PAGE_WIDTH = 210   // A4 width in mm
const PAGE_HEIGHT = 297  // A4 height in mm
const MARGIN_LEFT = 25
const MARGIN_RIGHT = 25
const MARGIN_TOP = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT // 160mm

// Colors
const COLOR_PRIMARY: [number, number, number] = [26, 77, 46]     // Dark green
const COLOR_SECONDARY: [number, number, number] = [139, 69, 19]  // Brown/gold
const COLOR_ACCENT: [number, number, number] = [218, 165, 32]    // Gold
const COLOR_TEXT: [number, number, number] = [51, 51, 51]        // Dark gray
const COLOR_LIGHT: [number, number, number] = [245, 245, 240]    // Light cream
const COLOR_BORDER: [number, number, number] = [200, 180, 140]   // Tan border

// ─── Helper ───

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

// ─── Main Generator ───

/**
 * Generate a PDF certificate document.
 *
 * @param data - Certificate data to render on the PDF
 * @returns jsPDF instance with the certificate rendered
 */
export function generateCertificatPDF(data: CertificatPDFData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  let y = MARGIN_TOP

  // ─── Outer decorative border ───
  doc.setDrawColor(...COLOR_BORDER)
  doc.setLineWidth(2)
  doc.rect(10, 10, PAGE_WIDTH - 20, PAGE_HEIGHT - 20)
  doc.setLineWidth(0.5)
  doc.setDrawColor(...COLOR_ACCENT)
  doc.rect(12, 12, PAGE_WIDTH - 24, PAGE_HEIGHT - 24)

  // ─── Header: Establishment ───
  y = 25
  doc.setFontSize(14)
  doc.setTextColor(...COLOR_PRIMARY)
  doc.setFont('helvetica', 'bold')
  doc.text(data.etablissementNom.toUpperCase(), PAGE_WIDTH / 2, y, { align: 'center' })

  if (data.etablissementVille || data.etablissementPays) {
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont('helvetica', 'normal')
    const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
    doc.text(location, PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── Separator line ───
  y += 10
  doc.setDrawColor(...COLOR_ACCENT)
  doc.setLineWidth(0.8)
  doc.line(MARGIN_LEFT + 20, y, PAGE_WIDTH - MARGIN_RIGHT - 20, y)

  // ─── Certificate Title ───
  y += 18
  doc.setFontSize(24)
  doc.setTextColor(...COLOR_SECONDARY)
  doc.setFont('helvetica', 'bold')
  doc.text(data.intitule, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Certificate Type Badge ───
  y += 10
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_PRIMARY)
  doc.setFont('helvetica', 'bolditalic')

  const typeLabel = data.type === 'EXCELLENCE'
    ? '★ Excellence ★'
    : data.type === 'ACCOMPLISSEMENT'
      ? '◆ Accomplissement ◆'
      : '● Participation ●'

  doc.text(typeLabel, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Separator ───
  y += 8
  doc.setDrawColor(...COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 30, y, PAGE_WIDTH - MARGIN_RIGHT - 30, y)

  // ─── Body: This certifies that ───
  y += 15
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'italic')
  doc.text('Nous certifions par la présente que', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Student Name ───
  y += 12
  doc.setFontSize(22)
  doc.setTextColor(...COLOR_PRIMARY)
  doc.setFont('helvetica', 'bold')
  doc.text(data.etudiantNom, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Student Info ───
  if (data.etudiantMatricule || data.etudiantNiveau) {
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont('helvetica', 'normal')
    const infoParts: string[] = []
    if (data.etudiantMatricule) infoParts.push(`Matricule: ${data.etudiantMatricule}`)
    if (data.etudiantNiveau) infoParts.push(`Niveau: ${data.etudiantNiveau}`)
    doc.text(infoParts.join('  •  '), PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── Body: Has successfully ───
  y += 14
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'italic')
  doc.text('a validé avec succès l\'unité d\'enseignement', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── UE Name ───
  y += 12
  doc.setFontSize(18)
  doc.setTextColor(...COLOR_PRIMARY)
  doc.setFont('helvetica', 'bold')
  doc.text(data.ueNom, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── UE Code ───
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'normal')
  doc.text(`Code: ${data.ueCode}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Details Box ───
  y += 14
  const boxX = MARGIN_LEFT + 15
  const boxWidth = CONTENT_WIDTH - 30
  const boxHeight = 42
  const boxY = y

  // Draw box background
  doc.setFillColor(...COLOR_LIGHT)
  doc.setDrawColor(...COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'FD')

  // Box content
  const labelX = boxX + 10
  const valueX = boxX + boxWidth / 2 + 5
  let boxContentY = boxY + 9

  const details = [
    { label: 'Filière', value: `${data.filiereNom}${data.filiereCode ? ` (${data.filiereCode})` : ''}` },
    { label: 'Note finale', value: `${formatNote(data.noteFinale)}/20${data.mention ? ` — Mention: ${data.mention}` : ''}` },
    { label: 'Session', value: data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale' },
    { label: 'Crédits ECTS', value: data.creditsECTS ? `${data.creditsECTS} crédits` : 'N/A' },
  ]

  if (data.anneeAcademique) {
    details.push({ label: 'Année académique', value: data.anneeAcademique })
  }

  for (const detail of details) {
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_SECONDARY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${detail.label}:`, labelX, boxContentY)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(detail.value, valueX, boxContentY)
    boxContentY += 7
  }

  y = boxY + boxHeight + 10

  // ─── Date ───
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'normal')
  doc.text(`Émis le ${formatDate(data.dateEmission)}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Verification Section ───
  y += 18
  doc.setDrawColor(...COLOR_ACCENT)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 20, y, PAGE_WIDTH - MARGIN_RIGHT - 20, y)

  y += 8
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.text('VÉRIFICATION', PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('Ce certificat peut être vérifié en ligne à l\'adresse suivante:', PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setTextColor(...COLOR_PRIMARY)
  doc.setFont('helvetica', 'bold')
  doc.text(data.verificationUrl, PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont('helvetica', 'normal')
  doc.text(`Code de vérification: ${data.codeVerification}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Footer ───
  const footerY = PAGE_HEIGHT - 25
  doc.setDrawColor(...COLOR_BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 20, footerY, PAGE_WIDTH - MARGIN_RIGHT - 20, footerY)

  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.setFont('helvetica', 'italic')
  doc.text(
    `Document généré par SECT — Système d'Évaluation et de Certification en Ligne`,
    PAGE_WIDTH / 2,
    footerY + 5,
    { align: 'center' }
  )
  doc.text(
    `Réf: ${data.codeVerification} — ${data.statut === 'EMIS' ? 'Certificat valide' : 'Certificat révoqué'}`,
    PAGE_WIDTH / 2,
    footerY + 9,
    { align: 'center' }
  )

  return doc
}
