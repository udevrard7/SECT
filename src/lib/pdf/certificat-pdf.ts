/**
 * Certificate PDF Generator — Modern Elegant Design
 *
 * Inspired by modern certificate templates: clean white background,
 * diagonal corner bands in template colors, double thin border,
 * diamond separators, two-column signature with centered seal.
 * Minimalist but dynamic, professional and elegant.
 *
 * Uses jsPDF for vector PDF generation (A4 portrait).
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
  responsableNom?: string | null
  template?: CertificatTemplateData | null
}

export interface CertificatTemplateData {
  backgroundImage: string | null
  primaryColor: string | null
  accentColor: string | null
  themeIcon: string | null
  fontFamily: string | null
}

// ─── Page Constants ───

const PAGE_WIDTH = 210   // A4 width in mm
const PAGE_HEIGHT = 297  // A4 height in mm
const MARGIN = 20

// ─── Color helpers ───

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ]
}

function mixWithWhite(color: [number, number, number], ratio: number): [number, number, number] {
  return [
    Math.round(color[0] * ratio + 255 * (1 - ratio)),
    Math.round(color[1] * ratio + 255 * (1 - ratio)),
    Math.round(color[2] * ratio + 255 * (1 - ratio)),
  ]
}

function resolveColors(template: CertificatTemplateData | null | undefined) {
  const primary = (template?.primaryColor && hexToRgb(template.primaryColor)) || [13, 71, 161] as [number, number, number] // default blue
  const accent = (template?.accentColor && hexToRgb(template.accentColor)) || [255, 193, 7] as [number, number, number] // default amber
  const font = template?.fontFamily?.toLowerCase() === 'times' ? 'times'
    : template?.fontFamily?.toLowerCase() === 'courier' ? 'courier'
    : 'helvetica'
  return { primary, accent, font }
}

// ─── Image dimension decoder (for logo auto-fit) ───

function decodeImageDimensions(base64Data: string): { width: number; height: number } | null {
  try {
    const buf = Buffer.from(base64Data, 'base64')
    if (buf.length < 24) return null
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        if (marker === 0xc0 || marker === 0xc2) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        if (marker >= 0xd0 && marker <= 0xd9) { i += 2; continue }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }
  } catch { /* ignore */ }
  return null
}

// ─── Logo renderer (auto-fit, preserve aspect ratio) ───

function renderLogo(
  doc: jsPDF,
  logo: string | null | undefined,
  centerX: number,
  y: number,
  maxWidthMm = 45,
  maxHeightMm = 22
): number {
  if (!logo || typeof logo !== 'string' || logo.trim().length === 0) return y

  try {
    let format: 'PNG' | 'JPEG' = 'PNG'
    let imageData = logo
    let base64Data: string | null = null

    if (logo.startsWith('data:')) {
      const match = logo.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
      if (!match) return y
      const fmt = match[1].toLowerCase()
      if (fmt === 'png') format = 'PNG'
      else if (fmt === 'jpeg' || fmt === 'jpg') format = 'JPEG'
      else return y
      imageData = `data:image/${fmt};base64,${match[2]}`
      base64Data = match[2]
    } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
      const lower = logo.toLowerCase().split('?')[0]
      format = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'JPEG' : 'PNG'
      imageData = logo
    } else {
      imageData = `data:image/png;base64,${logo}`
      base64Data = logo
      format = 'PNG'
    }

    let dispW = maxWidthMm
    let dispH = maxHeightMm
    const dims = base64Data ? decodeImageDimensions(base64Data) : null
    if (dims) {
      const ar = dims.width / dims.height
      dispW = maxWidthMm
      dispH = dispW / ar
      if (dispH > maxHeightMm) {
        dispH = maxHeightMm
        dispW = dispH * ar
      }
    } else {
      dispH = Math.min(maxHeightMm, maxWidthMm * 0.6)
    }

    doc.addImage(imageData, format, centerX - dispW / 2, y, dispW, dispH, undefined, 'FAST')
    return y + dispH
  } catch (err) {
    console.error('[certificat-pdf] Logo render failed:', err instanceof Error ? err.message : err)
    return y
  }
}

// ─── Decorative elements ───

/**
 * Draw diagonal corner bands — the signature element of the modern design.
 * Each corner has a triangle in primary color and a smaller triangle in accent.
 */
function drawCornerBands(
  doc: jsPDF,
  primary: [number, number, number],
  accent: [number, number, number]
) {
  const cornerSize = 45 // mm — size of the diagonal band
  const accentSize = 25  // mm — smaller accent band

  // Top-left corner: primary triangle + accent triangle
  doc.setFillColor(...primary)
  doc.triangle(0, 0, cornerSize, 0, 0, cornerSize, 'F')
  doc.setFillColor(...accent)
  doc.triangle(0, 0, accentSize, 0, 0, accentSize, 'F')

  // Top-right corner
  doc.setFillColor(...primary)
  doc.triangle(PAGE_WIDTH, 0, PAGE_WIDTH - cornerSize, 0, PAGE_WIDTH, cornerSize, 'F')
  doc.setFillColor(...accent)
  doc.triangle(PAGE_WIDTH, 0, PAGE_WIDTH - accentSize, 0, PAGE_WIDTH, accentSize, 'F')

  // Bottom-left corner
  doc.setFillColor(...primary)
  doc.triangle(0, PAGE_HEIGHT, cornerSize, PAGE_HEIGHT, 0, PAGE_HEIGHT - cornerSize, 'F')
  doc.setFillColor(...accent)
  doc.triangle(0, PAGE_HEIGHT, accentSize, PAGE_HEIGHT, 0, PAGE_HEIGHT - accentSize, 'F')

  // Bottom-right corner
  doc.setFillColor(...primary)
  doc.triangle(PAGE_WIDTH, PAGE_HEIGHT, PAGE_WIDTH - cornerSize, PAGE_HEIGHT, PAGE_WIDTH, PAGE_HEIGHT - cornerSize, 'F')
  doc.setFillColor(...accent)
  doc.triangle(PAGE_WIDTH, PAGE_HEIGHT, PAGE_WIDTH - accentSize, PAGE_HEIGHT, PAGE_WIDTH, PAGE_HEIGHT - accentSize, 'F')
}

/**
 * Draw a double thin border — clean, modern, not heavy.
 */
function drawBorder(doc: jsPDF, color: [number, number, number]) {
  // Outer border (thin, 0.8mm)
  doc.setDrawColor(...color)
  doc.setLineWidth(0.8)
  doc.rect(MARGIN, MARGIN, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN)
  // Inner border (thinner, 0.3mm, 3mm inset)
  doc.setLineWidth(0.3)
  doc.rect(MARGIN + 3, MARGIN + 3, PAGE_WIDTH - 2 * MARGIN - 6, PAGE_HEIGHT - 2 * MARGIN - 6)
}

/**
 * Draw 3 small diamonds as a separator between two text sections.
 */
function drawDiamondSeparator(
  doc: jsPDF,
  centerX: number,
  y: number,
  primary: [number, number, number],
  accent: [number, number, number]
) {
  const dSize = 1.8 // mm — half-diagonal of each diamond
  const spacing = 8  // mm between diamonds

  // Left diamond (primary)
  doc.setFillColor(...primary)
  doc.triangle(centerX - spacing, y - dSize, centerX - spacing + dSize, y, centerX - spacing, y + dSize, 'F')
  doc.triangle(centerX - spacing, y - dSize, centerX - spacing - dSize, y, centerX - spacing, y + dSize, 'F')
  // Center diamond (accent — bigger)
  const cdSize = dSize * 1.3
  doc.setFillColor(...accent)
  doc.triangle(centerX, y - cdSize, centerX + cdSize, y, centerX, y + cdSize, 'F')
  doc.triangle(centerX, y - cdSize, centerX - cdSize, y, centerX, y + cdSize, 'F')
  // Right diamond (primary)
  doc.setFillColor(...primary)
  doc.triangle(centerX + spacing, y - dSize, centerX + spacing + dSize, y, centerX + spacing, y + dSize, 'F')
  doc.triangle(centerX + spacing, y - dSize, centerX + spacing - dSize, y, centerX + spacing, y + dSize, 'F')
}

/**
 * Draw a subtle theme watermark in the center background.
 */
function drawWatermark(
  doc: jsPDF,
  themeIcon: string | null | undefined,
  centerX: number,
  centerY: number,
  color: [number, number, number]
) {
  const icon = themeIcon?.toLowerCase() ?? 'default'
  if (icon === 'default' || !icon) return

  // Light tint of the primary color (subtle, visible but not distracting)
  const tint = mixWithWhite(color, 0.12)
  doc.setDrawColor(...tint)
  doc.setFillColor(...tint)
  doc.setLineWidth(2.5)
  const s = 70 // mm half-extent

  if (icon === 'code') {
    // </> chevrons
    const cs = s * 0.35
    doc.line(centerX - cs * 1.5, centerY - cs, centerX - cs * 0.5, centerY)
    doc.line(centerX - cs * 0.5, centerY, centerX - cs * 1.5, centerY + cs)
    doc.line(centerX + cs * 0.5, centerY - cs, centerX + cs * 1.5, centerY)
    doc.line(centerX + cs * 1.5, centerY, centerX + cs * 0.5, centerY + cs)
    doc.setLineWidth(1.2)
    doc.line(centerX - cs * 0.15, centerY + cs * 0.6, centerX + cs * 0.15, centerY - cs * 0.6)
  } else if (icon === 'science') {
    doc.circle(centerX, centerY, 6, 'F')
    doc.ellipse(centerX, centerY, s * 0.6, s * 0.25, 'S')
    doc.ellipse(centerX, centerY, s * 0.6, s * 0.25, 'S', 60)
    doc.ellipse(centerX, centerY, s * 0.6, s * 0.25, 'S', 120)
  } else if (icon === 'business') {
    const bw = 10
    const heights = [20, 35, 28, 48]
    for (let i = 0; i < 4; i++) {
      doc.rect(centerX - 25 + i * 14, centerY + 25 - heights[i], bw, heights[i], 'S')
    }
  }
}

/**
 * Draw the official SECT seal — a circular medallion centered between
 * the two signature columns.
 */
function drawSeal(
  doc: jsPDF,
  cx: number,
  cy: number,
  primary: [number, number, number],
  accent: [number, number, number],
  font: string
) {
  const r = 14 // mm
  // Tinted fill
  doc.setFillColor(...mixWithWhite(primary, 0.08))
  doc.circle(cx, cy, r, 'F')
  // Outer ring (accent, thick)
  doc.setDrawColor(...accent)
  doc.setLineWidth(1.5)
  doc.circle(cx, cy, r, 'S')
  // Inner ring (primary, thin)
  doc.setLineWidth(0.5)
  doc.setDrawColor(...primary)
  doc.circle(cx, cy, r - 3, 'S')
  // Dotted decorative ring
  doc.setFillColor(...accent)
  for (let a = 0; a < 360; a += 10) {
    const rad = (a * Math.PI) / 180
    doc.circle(cx + (r - 1.5) * Math.cos(rad), cy + (r - 1.5) * Math.sin(rad), 0.3, 'F')
  }
  // Center star (5-pointed)
  const starR = 2.5
  for (let i = 0; i < 10; i++) {
    const ri = i % 2 === 0 ? starR : starR * 0.42
    const a1 = (Math.PI / 5) * i - Math.PI / 2
    const a2 = (Math.PI / 5) * (i + 1) - Math.PI / 2
    doc.triangle(cx, cy - 3, cx + ri * Math.cos(a1), cy - 3 + ri * Math.sin(a1), cx + ri * Math.cos(a2), cy - 3 + ri * Math.sin(a2), 'F')
  }
  // Text
  doc.setFontSize(11)
  doc.setTextColor(...primary)
  doc.setFont(font, 'bold')
  doc.text('SECT', cx, cy + 3, { align: 'center' })
  doc.setFontSize(6)
  doc.setTextColor(...accent)
  doc.text('CERTIFIÉ', cx, cy + 7, { align: 'center' })
}

// ─── Helpers ───

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

// ════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ════════════════════════════════════════════════════════════════════════

export function generateCertificatPDF(data: CertificatPDFData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const { primary: C_PRIMARY, accent: C_ACCENT, font } = resolveColors(data.template ?? null)
  const BLACK: [number, number, number] = [33, 33, 33]
  const GRAY: [number, number, number] = [66, 66, 66]
  const LIGHT_GRAY: [number, number, number] = [200, 200, 200]

  // ─── 1. Diagonal corner bands (drawn first, background layer) ───
  drawCornerBands(doc, C_PRIMARY, C_ACCENT)

  // ─── 2. Double thin border ───
  drawBorder(doc, C_PRIMARY)

  // ─── 3. Theme watermark (center, subtle) ───
  drawWatermark(doc, data.template?.themeIcon ?? null, PAGE_WIDTH / 2, PAGE_HEIGHT / 2, C_PRIMARY)

  // ═══ CONTENT AREA (inside borders) ═══
  let y = 35

  // ─── 4. Logo (centered, auto-fit) ───
  const afterLogoY = renderLogo(doc, data.etablissementLogo, PAGE_WIDTH / 2, y, 45, 22)
  if (afterLogoY > y) {
    y = afterLogoY + 3
  } else {
    y = 40
  }

  // ─── 5. Establishment name ───
  doc.setFontSize(13)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.etablissementNom.toUpperCase(), PAGE_WIDTH / 2, y, { align: 'center' })

  if (data.etablissementVille || data.etablissementPays) {
    y += 5
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.setFont(font, 'normal')
    const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
    doc.text(location, PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── 6. Diamond separator ───
  y += 10
  drawDiamondSeparator(doc, PAGE_WIDTH / 2, y, C_PRIMARY, C_ACCENT)

  // ─── 7. Certificate title ───
  y += 14
  doc.setFontSize(28)
  doc.setTextColor(...BLACK)
  doc.setFont(font, 'bold')
  doc.text(data.intitule, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 8. Type label (subtitle, accent color) ───
  y += 8
  doc.setFontSize(12)
  doc.setTextColor(...C_ACCENT)
  doc.setFont(font, 'bolditalic')
  const typeLabel = data.type === 'EXCELLENCE' ? 'Excellence'
    : data.type === 'ACCOMPLISSEMENT' ? 'Accomplissement'
    : 'Participation'
  doc.text(typeLabel, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 9. "Nous certifions par la présente que" ───
  y += 14
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'italic')
  doc.text('Nous certifions par la présente que', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 10. Student name (large, primary color) ───
  y += 12
  doc.setFontSize(24)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.etudiantNom, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 11. Student info (matricule, niveau) ───
  const matriculeOk = !!data.etudiantMatricule && data.etudiantMatricule.trim() !== ''
  const niveauOk = !!data.etudiantNiveau && data.etudiantNiveau.trim() !== ''
  if (matriculeOk || niveauOk) {
    y += 7
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.setFont(font, 'normal')
    const parts: string[] = []
    if (matriculeOk) parts.push(`Matricule: ${data.etudiantMatricule}`)
    if (niveauOk) parts.push(`Niveau: ${data.etudiantNiveau}`)
    doc.text(parts.join('  •  '), PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── 12. "a validé avec succès l'unité d'enseignement" ───
  y += 12
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'italic')
  doc.text('a validé avec succès l\'unité d\'enseignement', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 13. UE name (large, primary color) ───
  y += 10
  doc.setFontSize(18)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.ueNom, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text(`Code: ${data.ueCode}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── 14. Details box (clean, with colored left bar) ───
  y += 12
  const boxX = MARGIN + 12
  const boxW = PAGE_WIDTH - 2 * MARGIN - 24
  const boxH = 36
  // Light background
  doc.setFillColor(...mixWithWhite(C_PRIMARY, 0.05))
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.2)
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD')
  // Colored left bar
  doc.setFillColor(...C_PRIMARY)
  doc.rect(boxX, y, 2.5, boxH, 'F')

  // Details content (2 columns)
  const labelX = boxX + 8
  const valX = boxX + boxW / 2
  let detailY = y + 8
  doc.setFontSize(8)

  const details = [
    { label: 'Filière', value: `${data.filiereNom}${data.filiereCode ? ` (${data.filiereCode})` : ''}` },
    { label: 'Note finale', value: `${formatNote(data.noteFinale)}/20${data.mention ? ` — ${data.mention}` : ''}` },
    { label: 'Session', value: data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale' },
    { label: 'Crédits ECTS', value: data.creditsECTS ? `${data.creditsECTS} crédits` : 'N/A' },
  ]
  if (data.anneeAcademique) details.push({ label: 'Année académique', value: data.anneeAcademique })

  for (let i = 0; i < details.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const lx = col === 0 ? labelX : valX
    const dy = detailY + row * 10
    doc.setTextColor(...C_ACCENT)
    doc.setFont(font, 'bold')
    doc.text(`${details[i].label}:`, lx, dy)
    doc.setTextColor(...BLACK)
    doc.setFont(font, 'normal')
    doc.text(details[i].value, lx + 28, dy)
  }

  y += boxH + 8

  // ─── 15. Date ───
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text(`Émis le ${formatDate(data.dateEmission)}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ═══ 16. SIGNATURE SECTION (2 columns + centered seal) ═══
  y += 14
  const sigLineY = y
  const sigLineW = 55 // mm — signature line half-width
  const leftSigX = MARGIN + 35
  const rightSigX = PAGE_WIDTH - MARGIN - 35
  const sealCx = PAGE_WIDTH / 2
  const sealCy = sigLineY - 3

  // Signature lines
  doc.setDrawColor(...C_PRIMARY)
  doc.setLineWidth(0.5)
  doc.line(leftSigX - sigLineW / 2, sigLineY, leftSigX + sigLineW / 2, sigLineY)
  doc.line(rightSigX - sigLineW / 2, sigLineY, rightSigX + sigLineW / 2, sigLineY)

  // Left: Responsable name above line + label below
  if (data.responsableNom && data.responsableNom.trim() !== '') {
    doc.setFontSize(10)
    doc.setTextColor(...C_PRIMARY)
    doc.setFont(font, 'bolditalic')
    doc.text(data.responsableNom, leftSigX, sigLineY - 3, { align: 'center' })
  }
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text('Le Responsable pédagogique', leftSigX, sigLineY + 4, { align: 'center' })

  // Right: Date label above line + "Date" below
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text(formatDate(data.dateEmission), rightSigX, sigLineY - 3, { align: 'center' })
  doc.text('Date', rightSigX, sigLineY + 4, { align: 'center' })

  // Center: Official SECT seal
  drawSeal(doc, sealCx, sealCy, C_PRIMARY, C_ACCENT, font)

  // ─── 17. Verification block (compact, 2 lines) ───
  y = sigLineY + 14
  doc.setDrawColor(...C_ACCENT)
  doc.setLineWidth(0.3)
  doc.line(MARGIN + 30, y, PAGE_WIDTH - MARGIN - 30, y)

  y += 5
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text('Vérification en ligne :', PAGE_WIDTH / 2 - 20, y, { align: 'right' })
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.verificationUrl, PAGE_WIDTH / 2 - 18, y, { align: 'left' })

  y += 4
  doc.setTextColor(...GRAY)
  doc.setFont(font, 'normal')
  doc.text('Code :', PAGE_WIDTH / 2 - 20, y, { align: 'right' })
  doc.setFont(font, 'bold')
  doc.text(data.codeVerification, PAGE_WIDTH / 2 - 18, y, { align: 'left' })

  // ─── 18. Minimal footer ───
  doc.setFontSize(6)
  doc.setTextColor(160, 160, 160)
  doc.setFont(font, 'normal')
  doc.text(
    `SECT — Système d\u2019Évaluation Casse-Tête · ${data.statut === 'EMIS' ? 'Certificat valide' : 'Certificat révoqué'}`,
    PAGE_WIDTH / 2,
    PAGE_HEIGHT - 12,
    { align: 'center' }
  )

  return doc
}
