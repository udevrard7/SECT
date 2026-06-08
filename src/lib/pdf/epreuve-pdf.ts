import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ───

export interface PDFQuestion {
  id: string
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION' | 'CODE'
  enonce: string
  propositions: Array<{ id: string; text: string }> | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: string
  bareme: number
  // CODE-specific fields
  langage?: string
  codeInitial?: string
  fonctionSignature?: string
  testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
  testsPrives?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
}

export interface PDFEtablissement {
  nom: string
  logo: string | null
  ville: string | null
  pays: string | null
}

export interface EpreuvePDFData {
  id: string
  titre: string
  description: string | null
  duree: number
  dateDebut: Date | string
  dateFin: Date | string
  noteTotal: number
  etablissement: PDFEtablissement
  filiere: { nom: string; code: string | null } | null
  uniteEnseignement: { nom: string; code: string | null } | null
  questions: PDFQuestion[]
  consignes: string | null
  baremeTotal: number
}

// ─── Constants ───

const PAGE_WIDTH = 210   // A4 width in mm
const PAGE_HEIGHT = 297  // A4 height in mm
const MARGIN_LEFT = 20
const MARGIN_RIGHT = 20
const MARGIN_TOP = 10
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT  // 170mm
const HEADER_BOTTOM = 38   // Y position where header ends
const FOOTER_TOP = 282     // Y position where footer begins
const CONTENT_TOP = HEADER_BOTTOM + 8  // First usable Y after header
const CONTENT_BOTTOM = FOOTER_TOP - 5  // Last usable Y before footer

const FONT_TITLE = 16
const FONT_SUBTITLE = 13
const FONT_HEADING = 11
const FONT_BODY = 10
const FONT_SMALL = 8
const FONT_TINY = 7

const LINE_HEIGHT_BODY = 5    // mm per line of body text
const ANSWER_LINE_SPACING = 8 // mm between response lines
const QUESTION_GAP = 6        // mm gap between questions

// ─── Helpers ───

function getAcademicYear(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

function formatDateFR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'QCU': return 'QCU (Choix unique)'
    case 'QCM': return 'QCM (Choix multiples)'
    case 'QRC': return 'QRC (Réponse courte)'
    case 'REFLEXION': return 'Réflexion'
    case 'CODE': return 'Code (Programmation)'
    default: return type
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
}

/**
 * Wrap text to fit within a given width. Returns array of lines.
 */
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return []
  return doc.splitTextToSize(text, maxWidth) as string[]
}

/**
 * Get the height needed to render a block of text.
 */
function getTextHeight(doc: jsPDF, text: string, maxWidth: number, fontSize: number = FONT_BODY): number {
  doc.setFontSize(fontSize)
  const lines = wrapText(doc, text, maxWidth)
  return lines.length * (fontSize * 0.3528 * 1.4) + 2
}

// ─── Header & Footer ───

function addHeader(doc: jsPDF, data: EpreuvePDFData, isCorrige: boolean = false): void {
  const y = MARGIN_TOP

  // Logo (if available)
  let textOffsetX = MARGIN_LEFT
  if (data.etablissement.logo) {
    try {
      const logoData = data.etablissement.logo
      // SVG is not supported by jsPDF - skip it
      if (logoData.includes('image/svg+xml')) {
        console.warn('[PDF] SVG logos are not supported in PDF generation, skipping')
      } else {
        // Detect format from data URL
        let format = 'PNG'
        if (logoData.includes('image/jpeg') || logoData.includes('image/jpg')) {
          format = 'JPEG'
        } else if (logoData.includes('image/webp')) {
          format = 'PNG' // jsPDF may not support WEBP; will try as PNG fallback
        }
        const logoWidth = 18  // mm
        const logoHeight = 18 // mm
        doc.addImage(logoData, format, MARGIN_LEFT, y, logoWidth, logoHeight)
        textOffsetX = MARGIN_LEFT + logoWidth + 4
      }
    } catch (e) {
      // If logo fails to render, just skip it
      console.warn('[PDF] Failed to render logo:', e)
    }
  }

  // Left side: Etablissement info
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(data.etablissement.nom, textOffsetX, y + 5)

  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'normal')
  let infoY = y + 10
  if (data.etablissement.ville) {
    doc.text(`${data.etablissement.ville}${data.etablissement.pays ? `, ${data.etablissement.pays}` : ''}`, textOffsetX, infoY)
    infoY += 4
  }

  // Academic year
  doc.text(`Année universitaire : ${getAcademicYear()}`, textOffsetX, infoY)

  // Right side: UE & Filière info
  const rightX = PAGE_WIDTH - MARGIN_RIGHT
  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'normal')

  let rightY = y + 5
  if (data.uniteEnseignement) {
    doc.setFont('helvetica', 'bold')
    const ueText = `UE : ${data.uniteEnseignement.code} - ${data.uniteEnseignement.nom}`
    const ueLines = wrapText(doc, ueText, 90)
    for (const line of ueLines) {
      doc.text(line, rightX, rightY, { align: 'right' })
      rightY += 4
    }
    doc.setFont('helvetica', 'normal')
  }
  if (data.filiere) {
    doc.text(`Filière : ${data.filiere.nom}${data.filiere.code ? ` (${data.filiere.code})` : ''}`, rightX, rightY, { align: 'right' })
    rightY += 4
  }

  // Separator line
  const sepY = HEADER_BOTTOM - 4
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, sepY, PAGE_WIDTH - MARGIN_RIGHT, sepY)

  // Watermark for Corrigé
  if (isCorrige) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(220, 50, 50)
    doc.text('CORRIGÉ TYPE — CONFIDENTIEL', PAGE_WIDTH / 2, sepY - 2, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }
}

function addFooter(doc: jsPDF, data: EpreuvePDFData, pageNum: number, totalPages: number, isCorrige: boolean = false): void {
  const y = FOOTER_TOP

  // Separator line
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)

  doc.setFontSize(FONT_TINY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)

  // Left: Confidential
  const label = isCorrige ? 'Corrigé confidentiel' : 'Confidentiel'
  doc.text(label, MARGIN_LEFT, y + 4)

  // Center: Epreuve title (truncated)
  const maxTitleLen = 60
  const title = data.titre.length > maxTitleLen ? data.titre.slice(0, maxTitleLen) + '…' : data.titre
  doc.text(title, PAGE_WIDTH / 2, y + 4, { align: 'center' })

  // Right: Page number
  doc.text(`Page ${pageNum} / ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, y + 4, { align: 'right' })

  doc.setTextColor(0, 0, 0)
}

// ─── Page Management ───

function addNewPage(doc: jsPDF, data: EpreuvePDFData, isCorrige: boolean = false): void {
  doc.addPage()
  addHeader(doc, data, isCorrige)
}

/**
 * Check if we need a new page. If so, add one and return the new Y position.
 * Returns the Y position to continue from (either current or top of new page).
 */
function ensureSpace(
  doc: jsPDF,
  data: EpreuvePDFData,
  currentY: number,
  requiredHeight: number,
  isCorrige: boolean = false
): number {
  if (currentY + requiredHeight > CONTENT_BOTTOM) {
    addNewPage(doc, data, isCorrige)
    return CONTENT_TOP
  }
  return currentY
}

// ─── Question Rendering (Sujet) ───

/**
 * Estimate the height needed for a question in Sujet mode.
 */
function estimateQuestionHeightSujet(doc: jsPDF, q: PDFQuestion): number {
  let height = 0

  // Question header line
  height += 8

  // Question text
  height += getTextHeight(doc, q.enonce, CONTENT_WIDTH - 5, FONT_BODY)

  // Propositions for QCU/QCM
  if ((q.type === 'QCU' || q.type === 'QCM') && q.propositions && q.propositions.length > 0) {
    height += 3 // gap
    for (const prop of q.propositions) {
      height += getTextHeight(doc, prop.text, CONTENT_WIDTH - 15, FONT_BODY) + 4
    }
  }

  // Response lines for QRC
  if (q.type === 'QRC') {
    height += 3 + 5 * ANSWER_LINE_SPACING
  }

  // Response lines for REFLEXION
  if (q.type === 'REFLEXION') {
    height += 3 + 8 * ANSWER_LINE_SPACING
  }

  // Code section for CODE type
  if (q.type === 'CODE') {
    height += 3
    // Language badge + signature
    height += 8
    // Starter code box
    if (q.codeInitial) {
      const codeLines = q.codeInitial.split('\n').length
      height += Math.max(codeLines * 4 + 10, 40) // 4mm per code line, min 40mm
    } else {
      height += 40 // Empty code area
    }
    // Public tests table
    if (q.testsPublics && q.testsPublics.length > 0) {
      height += 8 + q.testsPublics.length * 8
    }
  }

  // Bottom gap + separator
  height += QUESTION_GAP + 3

  return height
}

/**
 * Render a single question in Sujet mode.
 * Returns the Y position after rendering.
 */
function renderQuestionSujet(doc: jsPDF, q: PDFQuestion, index: number, startY: number): number {
  let y = startY

  // Question header
  doc.setFontSize(FONT_HEADING)
  doc.setFont('helvetica', 'bold')
  doc.text(`Question ${index + 1}`, MARGIN_LEFT, y)

  // Type and bareme
  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'normal')
  const typeLabel = getTypeLabel(q.type)
  doc.text(typeLabel, MARGIN_LEFT + doc.getTextWidth(`Question ${index + 1}  `), y)

  // Bareme on the right
  doc.setFont('helvetica', 'bold')
  const baremeText = `${q.bareme} pt${q.bareme > 1 ? 's' : ''}`
  doc.text(baremeText, PAGE_WIDTH - MARGIN_RIGHT, y, { align: 'right' })

  y += 6

  // Question text
  doc.setFontSize(FONT_BODY)
  doc.setFont('helvetica', 'normal')
  const lines = wrapText(doc, q.enonce, CONTENT_WIDTH - 5)
  for (const line of lines) {
    doc.text(line, MARGIN_LEFT, y)
    y += LINE_HEIGHT_BODY
  }

  y += 2

  // Propositions for QCU/QCM
  if ((q.type === 'QCU' || q.type === 'QCM') && q.propositions && q.propositions.length > 0) {
    for (let pi = 0; pi < q.propositions.length; pi++) {
      const prop = q.propositions[pi]
      const letter = String.fromCharCode(65 + pi)

      if (q.type === 'QCU') {
        // Draw circle for QCU
        doc.setDrawColor(80, 80, 80)
        doc.setLineWidth(0.4)
        doc.circle(MARGIN_LEFT + 3, y - 1, 2.5)
        doc.setFontSize(FONT_SMALL)
        doc.setFont('helvetica', 'bold')
        doc.text(letter, MARGIN_LEFT + 3, y - 0.5, { align: 'center' })
      } else {
        // Draw square for QCM
        doc.setDrawColor(80, 80, 80)
        doc.setLineWidth(0.4)
        doc.rect(MARGIN_LEFT + 0.5, y - 3.5, 5, 5)
        doc.setFontSize(FONT_SMALL)
        doc.setFont('helvetica', 'bold')
        doc.text(letter, MARGIN_LEFT + 3, y - 0.5, { align: 'center' })
      }

      // Proposition text
      doc.setFontSize(FONT_BODY)
      doc.setFont('helvetica', 'normal')
      const propLines = wrapText(doc, prop.text, CONTENT_WIDTH - 15)
      for (const line of propLines) {
        doc.text(line, MARGIN_LEFT + 10, y)
        y += LINE_HEIGHT_BODY
      }
      y += 1
    }
  }

  // Response lines for QRC
  if (q.type === 'QRC') {
    y += 2
    const numLines = 5
    for (let i = 0; i < numLines; i++) {
      doc.setDrawColor(190, 190, 190)
      doc.setLineWidth(0.3)
      doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
      y += ANSWER_LINE_SPACING
    }
  }

  // Response lines for REFLEXION
  if (q.type === 'REFLEXION') {
    y += 2
    const numLines = 8
    for (let i = 0; i < numLines; i++) {
      doc.setDrawColor(190, 190, 190)
      doc.setLineWidth(0.3)
      doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
      y += ANSWER_LINE_SPACING
    }
  }

  // Code section for CODE type
  if (q.type === 'CODE') {
    y += 2

    // Language + signature info
    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 60, 160)
    const langLabel = q.langage ? q.langage.toUpperCase() : 'CODE'
    doc.text(`Langage : ${langLabel}`, MARGIN_LEFT, y)
    if (q.fonctionSignature) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(`Signature : ${q.fonctionSignature}`, MARGIN_LEFT + 50, y)
    }
    doc.setTextColor(0, 0, 0)
    y += 6

    // Starter code box
    doc.setFillColor(245, 245, 250)
    doc.setDrawColor(180, 170, 210)
    doc.setLineWidth(0.4)
    const codeText = q.codeInitial || '// Écrire votre code ici'
    const codeLines = codeText.split('\n')
    const codeBoxHeight = Math.max(codeLines.length * 4 + 10, 35)
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, codeBoxHeight, 2, 2, 'FD')

    // Code text
    doc.setFontSize(9)
    doc.setFont('courier', 'normal')
    doc.setTextColor(40, 40, 60)
    let codeY = y + 2
    for (const line of codeLines.slice(0, 20)) { // Max 20 lines to prevent overflow
      if (codeY > y + codeBoxHeight - 5) break
      doc.text(line.substring(0, 80), MARGIN_LEFT + 4, codeY) // Truncate long lines
      codeY += 4
    }
    doc.setTextColor(0, 0, 0)
    y += codeBoxHeight + 4

    // Public tests table
    if (q.testsPublics && q.testsPublics.length > 0) {
      doc.setFontSize(FONT_SMALL)
      doc.setFont('helvetica', 'bold')
      doc.text('Tests publics :', MARGIN_LEFT, y)
      y += 5

      const testHead = [['N°', 'Entrée', 'Sortie attendue']]
      const testBody = q.testsPublics.map((t, i) => [
        `${i + 1}`,
        t.entree.substring(0, 40),
        t.sortieAttendue.substring(0, 40),
      ])

      autoTable(doc, {
        head: testHead,
        body: testBody,
        startY: y,
        margin: { left: MARGIN_LEFT + 5, right: MARGIN_RIGHT },
        styles: {
          fontSize: FONT_TINY,
          cellPadding: 2,
          lineColor: [180, 170, 210],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [100, 60, 160],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 60 },
          2: { cellWidth: 60 },
        },
      })

      y = (doc as any).lastAutoTable?.finalY ?? y + 20
      y += 3
    }
  }

  // Separator line between questions
  y += 3
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.2)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += QUESTION_GAP

  return y
}

// ─── Question Rendering (Corrigé) ───

/**
 * Estimate the height needed for a question in Corrigé mode.
 */
function estimateQuestionHeightCorrige(doc: jsPDF, q: PDFQuestion): number {
  let height = estimateQuestionHeightSujet(doc, q)

  // Additional height for correct answers / model response
  if ((q.type === 'QCU' || q.type === 'QCM') && q.reponseCorrecte) {
    height += 12
  }

  if ((q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte) {
    const text = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte
    height += getTextHeight(doc, text, CONTENT_WIDTH - 15, FONT_BODY) + 10
  }

  if (q.explication) {
    height += getTextHeight(doc, q.explication, CONTENT_WIDTH - 15, FONT_BODY) + 10
  }

  return height
}

/**
 * Render a single question in Corrigé mode.
 * Returns the Y position after rendering.
 */
function renderQuestionCorrige(doc: jsPDF, q: PDFQuestion, index: number, startY: number): number {
  let y = startY

  // First render the question like Sujet
  y = renderQuestionSujet(doc, q, index, y)

  // Correct answers for QCU/QCM
  if ((q.type === 'QCU' || q.type === 'QCM') && q.propositions && q.reponseCorrecte) {
    const correctIds = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte : [q.reponseCorrecte]

    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 130, 60)
    doc.text('Réponse correcte :', MARGIN_LEFT, y)

    const correctLabels = q.propositions
      .filter((p) => correctIds.includes(p.id))
      .map((p) => {
        const idx = q.propositions!.indexOf(p)
        return `${String.fromCharCode(65 + idx)}. ${p.text}`
      })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT_BODY)
    for (const label of correctLabels) {
      const lines = wrapText(doc, label, CONTENT_WIDTH - 20)
      for (const line of lines) {
        doc.text(line, MARGIN_LEFT + 10, y)
        y += LINE_HEIGHT_BODY
      }
    }
    doc.setTextColor(0, 0, 0)
    y += 3
  }

  // Model response for QRC / REFLEXION
  if ((q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte) {
    const text = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte
    const label = q.type === 'QRC' ? 'Réponse modèle :' : 'Guide de correction :'

    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 100, 50)
    doc.text(label, MARGIN_LEFT, y)
    doc.setTextColor(0, 0, 0)
    y += 5

    doc.setFontSize(FONT_BODY)
    doc.setFont('helvetica', 'normal')
    const lines = wrapText(doc, text, CONTENT_WIDTH - 15)
    const boxHeight = lines.length * LINE_HEIGHT_BODY + 6

    doc.setFillColor(245, 250, 245)
    doc.setDrawColor(0, 160, 80)
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, boxHeight, 2, 2, 'FD')

    doc.setTextColor(0, 80, 40)
    for (const line of lines) {
      doc.text(line, MARGIN_LEFT + 5, y)
      y += LINE_HEIGHT_BODY
    }
    doc.setTextColor(0, 0, 0)
    y += 5
  }

  // Explanation
  if (q.explication) {
    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 140)
    doc.text('Explication :', MARGIN_LEFT, y)
    doc.setTextColor(0, 0, 0)
    y += 4

    doc.setFontSize(FONT_BODY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const lines = wrapText(doc, q.explication, CONTENT_WIDTH - 10)
    for (const line of lines) {
      doc.text(line, MARGIN_LEFT + 5, y)
      y += LINE_HEIGHT_BODY
    }
    doc.setTextColor(0, 0, 0)
    y += 3
  }

  return y
}

// ─── Main PDF Generators ───

/**
 * Generate the Sujet PDF (student exam paper).
 */
export function generateSujetPDF(data: EpreuvePDFData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  doc.setProperties({
    title: `Sujet - ${data.titre}`,
    author: data.etablissement.nom,
    subject: data.titre,
  })

  // First page header
  addHeader(doc, data, false)

  let y = CONTENT_TOP

  // ─── Title Section ───
  doc.setFontSize(FONT_TITLE)
  doc.setFont('helvetica', 'bold')
  doc.text('ÉPREUVE', MARGIN_LEFT, y)
  y += 8

  doc.setFontSize(FONT_SUBTITLE)
  doc.text(data.titre, MARGIN_LEFT, y)
  y += 8

  // Metadata line
  doc.setFontSize(FONT_BODY)
  doc.setFont('helvetica', 'normal')
  const metaLine = `Durée : ${data.duree} minutes  |  Note totale : ${data.noteTotal} pts  |  Date : ${formatDateFR(data.dateDebut)}`
  doc.text(metaLine, MARGIN_LEFT, y)
  y += 8

  // Instructions
  if (data.consignes) {
    const consignesH = getTextHeight(doc, data.consignes, CONTENT_WIDTH - 10, FONT_BODY)
    doc.setFillColor(255, 248, 230)
    doc.setDrawColor(200, 180, 100)
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 12 + consignesH, 2, 2, 'FD')

    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(150, 120, 0)
    doc.text('CONSIGNES', MARGIN_LEFT + 4, y + 2)
    doc.setTextColor(0, 0, 0)

    doc.setFontSize(FONT_BODY)
    doc.setFont('helvetica', 'normal')
    const consignesLines = wrapText(doc, data.consignes, CONTENT_WIDTH - 10)
    for (const line of consignesLines) {
      doc.text(line, MARGIN_LEFT + 4, y + 7)
      y += LINE_HEIGHT_BODY
    }
    y += 8
  }

  // Separator
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 6

  // Summary line
  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'italic')
  doc.text(`${data.questions.length} question${data.questions.length > 1 ? 's' : ''} — Barème total : ${data.baremeTotal} pts`, MARGIN_LEFT, y)
  y += 8

  // ─── Questions ───
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i]
    const estimatedHeight = estimateQuestionHeightSujet(doc, q)

    // Ensure we have enough space for the entire question
    y = ensureSpace(doc, data, y, estimatedHeight, false)
    y = renderQuestionSujet(doc, q, i, y)
  }

  // ─── Add footers to all pages ───
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    addFooter(doc, data, p, totalPages, false)
  }

  return doc
}

/**
 * Generate the Corrigé PDF (answer key for teachers).
 */
export function generateCorrigePDF(data: EpreuvePDFData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  doc.setProperties({
    title: `Corrigé - ${data.titre}`,
    author: data.etablissement.nom,
    subject: `Corrigé - ${data.titre}`,
  })

  // First page header
  addHeader(doc, data, true)

  let y = CONTENT_TOP

  // ─── Title Section ───
  doc.setFontSize(FONT_TITLE)
  doc.setFont('helvetica', 'bold')
  doc.text('CORRIGÉ TYPE', MARGIN_LEFT, y)
  y += 8

  doc.setFontSize(FONT_SUBTITLE)
  doc.text(data.titre, MARGIN_LEFT, y)
  y += 8

  // Metadata
  doc.setFontSize(FONT_BODY)
  doc.setFont('helvetica', 'normal')
  const metaLine = `Durée : ${data.duree} minutes  |  Note totale : ${data.noteTotal} pts  |  Date : ${formatDateFR(data.dateDebut)}`
  doc.text(metaLine, MARGIN_LEFT, y)
  y += 10

  // Instructions
  if (data.consignes) {
    const consignesH = getTextHeight(doc, data.consignes, CONTENT_WIDTH - 10, FONT_BODY)
    doc.setFillColor(255, 248, 230)
    doc.setDrawColor(200, 180, 100)
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 12 + consignesH, 2, 2, 'FD')

    doc.setFontSize(FONT_SMALL)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(150, 120, 0)
    doc.text('CONSIGNES', MARGIN_LEFT + 4, y + 2)
    doc.setTextColor(0, 0, 0)

    doc.setFontSize(FONT_BODY)
    doc.setFont('helvetica', 'normal')
    const consignesLines = wrapText(doc, data.consignes, CONTENT_WIDTH - 10)
    for (const line of consignesLines) {
      doc.text(line, MARGIN_LEFT + 4, y + 7)
      y += LINE_HEIGHT_BODY
    }
    y += 8
  }

  // Separator
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 6

  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'italic')
  doc.text(`${data.questions.length} question${data.questions.length > 1 ? 's' : ''} — Barème total : ${data.baremeTotal} pts`, MARGIN_LEFT, y)
  y += 8

  // ─── Questions with answers ───
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i]
    const estimatedHeight = estimateQuestionHeightCorrige(doc, q)

    y = ensureSpace(doc, data, y, estimatedHeight, true)
    y = renderQuestionCorrige(doc, q, i, y)
  }

  // ─── Add footers to all pages ───
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    addFooter(doc, data, p, totalPages, true)
  }

  return doc
}

/**
 * Generate the Feuille de Réponses PDF (answer sheet for QCM/QCU).
 */
export function generateFeuilleReponsesPDF(data: EpreuvePDFData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  doc.setProperties({
    title: `Feuille de réponses - ${data.titre}`,
    author: data.etablissement.nom,
    subject: `Feuille de réponses - ${data.titre}`,
  })

  addHeader(doc, data, false)

  let y = CONTENT_TOP

  // Title
  doc.setFontSize(FONT_TITLE)
  doc.setFont('helvetica', 'bold')
  doc.text('FEUILLE DE RÉPONSES', MARGIN_LEFT, y)
  y += 8

  doc.setFontSize(FONT_SUBTITLE)
  doc.text(data.titre, MARGIN_LEFT, y)
  y += 8

  // Student info fields
  doc.setFontSize(FONT_BODY)
  doc.setFont('helvetica', 'normal')
  doc.text('Nom : ', MARGIN_LEFT, y)
  doc.setDrawColor(150, 150, 150)
  doc.line(MARGIN_LEFT + 15, y, MARGIN_LEFT + 80, y)
  doc.text('Prénom : ', MARGIN_LEFT + 85, y)
  doc.line(MARGIN_LEFT + 102, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  doc.text('Matricule : ', MARGIN_LEFT, y)
  doc.line(MARGIN_LEFT + 25, y, MARGIN_LEFT + 80, y)
  doc.text('Filière : ', MARGIN_LEFT + 85, y)
  doc.line(MARGIN_LEFT + 105, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 12

  // Separator
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  // Filter QCU and QCM questions
  const mcqQuestions = data.questions.filter((q) => q.type === 'QCU' || q.type === 'QCM')

  if (mcqQuestions.length === 0) {
    doc.setFontSize(FONT_BODY)
    doc.setFont('helvetica', 'italic')
    doc.text('Aucune question QCM/QCU dans cette épreuve.', MARGIN_LEFT, y)
  } else {
    // Build the answer grid using autoTable
    const maxProps = Math.max(
      ...mcqQuestions.map((q) => q.propositions?.length || 0),
      4
    )
    const letterCols = Array.from({ length: maxProps }, (_, i) =>
      String.fromCharCode(65 + i)
    )

    // Table header
    const head = [['N°', 'Type', ...letterCols]]

    // Table body
    const body = mcqQuestions.map((q) => {
      const originalIdx = data.questions.indexOf(q)
      const cells: string[] = [
        `${originalIdx + 1}`,
        q.type,
      ]
      for (let c = 0; c < maxProps; c++) {
        cells.push(q.propositions && c < q.propositions.length ? '__CIRCLE__' : '')
      }
      return cells
    })

    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
      styles: {
        fontSize: FONT_BODY,
        cellPadding: 3,
        halign: 'center',
        valign: 'middle',
        lineColor: [180, 180, 180],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [35, 120, 75],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: FONT_SMALL,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 20 },
      },
      alternateRowStyles: {
        fillColor: [245, 250, 248],
      },
      didParseCell: (hookData) => {
        // Replace __CIRCLE__ with empty string so it doesn't render as text
        if (hookData.cell.raw === '__CIRCLE__') {
          hookData.cell.raw = ''
          hookData.cell.text = ''  // Clear text content to prevent any rendering
          ;(hookData.cell as any)._isCircle = true
        }
      },
      didDrawCell: (hookData) => {
        // Draw a circle in cells that had __CIRCLE__
        if ((hookData.cell as any)._isCircle) {
          const { x, y: cellY, width, height } = hookData.cell
          const cx = x + width / 2
          const cy = cellY + height / 2
          const radius = Math.min(width, height) / 2 - 1.5
          doc.setDrawColor(60, 60, 60)
          doc.setLineWidth(0.5)
          doc.circle(cx, cy, radius)
        }
      },
    })

    // Get the Y position after the table
    y = (doc as any).lastAutoTable?.finalY ?? y + 20
    y += 10
  }

  // Open-ended questions section
  const openQuestions = data.questions.filter((q) => q.type === 'QRC' || q.type === 'REFLEXION')

  if (openQuestions.length > 0) {
    y = ensureSpace(doc, data, y, 20, false)

    doc.setFontSize(FONT_HEADING)
    doc.setFont('helvetica', 'bold')
    doc.text('Questions ouvertes', MARGIN_LEFT, y)
    y += 8

    for (const q of openQuestions) {
      const originalIdx = data.questions.indexOf(q)
      const numLines = q.type === 'QRC' ? 5 : 8
      const neededHeight = numLines * ANSWER_LINE_SPACING + 20

      y = ensureSpace(doc, data, y, neededHeight, false)

      doc.setFontSize(FONT_BODY)
      doc.setFont('helvetica', 'bold')
      doc.text(`Question ${originalIdx + 1} (${q.type} - ${q.bareme} pts)`, MARGIN_LEFT, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      const lines = wrapText(doc, q.enonce, CONTENT_WIDTH - 5)
      for (const line of lines) {
        doc.text(line, MARGIN_LEFT, y)
        y += LINE_HEIGHT_BODY
      }
      y += 3

      // Response lines
      for (let i = 0; i < numLines; i++) {
        doc.setDrawColor(190, 190, 190)
        doc.setLineWidth(0.3)
        doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
        y += ANSWER_LINE_SPACING
      }
      y += 5
    }
  }

  // Add footers
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    addFooter(doc, data, p, totalPages, false)
  }

  return doc
}

/**
 * Get a sanitized filename for the PDF download.
 */
export function getPDFFilename(titre: string, type: 'sujet' | 'corrige' | 'feuille-reponses'): string {
  const prefix = {
    sujet: 'Sujet',
    corrige: 'Corrige',
    'feuille-reponses': 'Feuille_reponses',
  }[type]
  return `${prefix}_${sanitizeFilename(titre)}.pdf`
}
