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
  /** Optional per-UE template (colors, watermark, icon). */
  template?: CertificatTemplateData | null
}

export interface CertificatTemplateData {
  /** base64 data URI for the background watermark image */
  backgroundImage: string | null
  /** hex without #, e.g. "1A4D2E" */
  primaryColor: string | null
  /** hex without #, e.g. "DAA520" */
  accentColor: string | null
  /** theme icon category: "default" | "code" | "science" | "law" | "business" | "math" | "language" | "art" */
  themeIcon: string | null
  /** font family: "helvetica" | "times" | "courier" */
  fontFamily: string | null
}

// ─── Constants ───

const PAGE_WIDTH = 210   // A4 width in mm
const PAGE_HEIGHT = 297  // A4 height in mm
const MARGIN_LEFT = 25
const MARGIN_RIGHT = 25
const MARGIN_TOP = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT // 160mm

// Default colors (used when no template is provided)
const COLOR_PRIMARY: [number, number, number] = [26, 77, 46]     // Dark green
const COLOR_SECONDARY: [number, number, number] = [139, 69, 19]  // Brown/gold
const COLOR_ACCENT: [number, number, number] = [218, 165, 32]    // Gold
const COLOR_TEXT: [number, number, number] = [51, 51, 51]        // Dark gray
const COLOR_LIGHT: [number, number, number] = [245, 245, 240]    // Light cream
const COLOR_BORDER: [number, number, number] = [200, 180, 140]   // Tan border

// ─── Template helpers ───

/** Convert a hex color string (with or without #) to an RGB tuple. */
function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return [r, g, b]
}

/** Resolve template colors, falling back to defaults. */
function resolveTemplateColors(template: CertificatTemplateData | null | undefined) {
  const primary = (template?.primaryColor && hexToRgb(template.primaryColor)) || COLOR_PRIMARY
  const accent = (template?.accentColor && hexToRgb(template.accentColor)) || COLOR_ACCENT
  // Derive a border color from the accent (slightly darker)
  const border: [number, number, number] = [
    Math.round(accent[0] * 0.78),
    Math.round(accent[1] * 0.70),
    Math.round(accent[2] * 0.55),
  ]
  // Derive a light tint of primary for box backgrounds
  const light: [number, number, number] = [
    Math.min(255, Math.round(primary[0] * 0.12 + 245)),
    Math.min(255, Math.round(primary[1] * 0.12 + 245)),
    Math.min(255, Math.round(primary[2] * 0.12 + 240)),
  ]
  return { primary, accent, border, light }
}

/** Resolve the font family from the template, with fallback. */
function resolveFontFamily(template: CertificatTemplateData | null | undefined): string {
  const f = template?.fontFamily?.toLowerCase()
  if (f === 'times' || f === 'courier') return f
  return 'helvetica'
}

/**
 * Draw a thematic watermark icon in the center of the page (filigrane).
 * Uses jsPDF primitives (no SVG needed). Opacity is set to ~8% so the
 * watermark is subtle and doesn't interfere with text readability.
 */
function drawThemeWatermark(
  doc: jsPDF,
  themeIcon: string | null | undefined,
  centerX: number,
  centerY: number,
  color: [number, number, number]
) {
  const icon = themeIcon?.toLowerCase() ?? 'default'
  if (icon === 'default' || !icon) return // no watermark for default

  // Set low opacity for the watermark
  try {
    const gState = (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState
    doc.setGState(new gState({ opacity: 0.08 }))
  } catch {
    // GState not available — skip watermark (text remains readable)
    return
  }

  doc.setDrawColor(...color)
  doc.setFillColor(...color)
  doc.setLineWidth(1.5)
  const size = 60 // mm, half-extent of the icon

  switch (icon) {
    case 'code': {
      // </>  — two chevrons
      doc.lines([[-8, -10], [16, 16], [-8, 10]], centerX - 18, centerY - 8, [1, 1], 'S')
      doc.lines([[8, -10], [-16, 16], [8, 10]], centerX + 18, centerY - 8, [1, 1], 'S')
      break
    }
    case 'science': {
      // Atom — nucleus + 3 orbital ellipses
      doc.circle(centerX, centerY, 6, 'F')
      doc.ellipse(centerX, centerY, size * 0.6, size * 0.25, 'S')
      doc.ellipse(centerX, centerY, size * 0.6, size * 0.25, 'S', 60)
      doc.ellipse(centerX, centerY, size * 0.6, size * 0.25, 'S', 120)
      break
    }
    case 'law': {
      // Scales of justice — simplified
      doc.line(centerX, centerY - size * 0.5, centerX, centerY + size * 0.4)
      doc.line(centerX - size * 0.5, centerY - size * 0.3, centerX + size * 0.5, centerY - size * 0.3)
      // Left pan
      doc.lines([[ -size * 0.25, size * 0.2], [size * 0.5, 0], [-size * 0.25, -size * 0.2]], centerX - size * 0.5, centerY - size * 0.3, [1, 1], 'S')
      // Right pan
      doc.lines([[ -size * 0.25, size * 0.2], [size * 0.5, 0], [-size * 0.25, -size * 0.2]], centerX + size * 0.5, centerY - size * 0.3, [1, 1], 'S')
      break
    }
    case 'business': {
      // Bar chart — 4 ascending bars
      const barW = 10
      const heights = [20, 35, 28, 48]
      for (let i = 0; i < 4; i++) {
        doc.rect(centerX - 25 + i * 14, centerY + 25 - heights[i], barW, heights[i], 'S')
      }
      break
    }
    case 'math': {
      // π symbol — large faint text
      doc.setFont('times', 'bold')
      doc.setFontSize(120)
      doc.text('π', centerX, centerY + 15, { align: 'center' })
      break
    }
    case 'language': {
      // Globe — circle + meridians
      doc.circle(centerX, centerY, size * 0.55, 'S')
      doc.ellipse(centerX, centerY, size * 0.25, size * 0.55, 'S')
      doc.ellipse(centerX, centerY, size * 0.55, size * 0.25, 'S')
      break
    }
    case 'art': {
      // Palette — circle with dots
      doc.circle(centerX, centerY, size * 0.5, 'S')
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180
        const dx = Math.cos(angle) * size * 0.3
        const dy = Math.sin(angle) * size * 0.3
        doc.circle(centerX + dx, centerY + dy, 4, 'F')
      }
      break
    }
    default:
      break
  }

  // Reset opacity to full
  try {
    const gState = (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState
    doc.setGState(new gState({ opacity: 1 }))
  } catch {
    // noop
  }
}

/**
 * Draw the background image as a faint watermark covering most of the page.
 * Opacity is ~10% so text stays readable.
 */
function drawBackgroundWatermark(
  doc: jsPDF,
  backgroundImage: string | null | undefined
) {
  if (!backgroundImage || typeof backgroundImage !== 'string') return
  try {
    const gState = (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState
    doc.setGState(new gState({ opacity: 0.1 }))
    // Center the image, covering ~80% of the page width
    const w = PAGE_WIDTH * 0.8
    const h = PAGE_HEIGHT * 0.8
    const x = (PAGE_WIDTH - w) / 2
    const y = (PAGE_HEIGHT - h) / 2
    let format: 'PNG' | 'JPEG' = 'PNG'
    let imageData = backgroundImage
    if (backgroundImage.startsWith('data:')) {
      const match = backgroundImage.match(/^data:image\/(png|jpe?g);base64,/i)
      if (!match) return
      format = match[1].toLowerCase().startsWith('jpg') ? 'JPEG' : 'PNG'
    }
    doc.addImage(imageData, format, x, y, w, h, undefined, 'FAST')
    doc.setGState(new gState({ opacity: 1 }))
  } catch (err) {
    console.error('[certificat-pdf] Background watermark failed:', err instanceof Error ? err.message : err)
    // Reset opacity on failure
    try {
      const gState = (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState
      doc.setGState(new gState({ opacity: 1 }))
    } catch {
      // noop
    }
  }
}

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

/**
 * Parse a logo source (data URI or URL) and render it on the PDF.
 * Supports data URIs (base64 PNG/JPEG) and direct image URLs.
 * Returns the Y position after the logo, or the original Y if the logo
 * could not be rendered (graceful fallback — text-only header).
 */
function renderLogo(
  doc: jsPDF,
  logo: string | null | undefined,
  centerX: number,
  y: number,
  maxWidthMm = 30,
  maxHeightMm = 30
): number {
  if (!logo || typeof logo !== 'string' || logo.trim().length === 0) {
    return y
  }

  try {
    let format: 'PNG' | 'JPEG' | 'JPG' = 'PNG'
    let imageData = logo

    if (logo.startsWith('data:')) {
      // Data URI: extract format and raw base64
      const match = logo.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i)
      if (!match) {
        // Unrecognized data URI format — skip
        return y
      }
      const fmtStr = match[1].toLowerCase()
      if (fmtStr === 'png') format = 'PNG'
      else if (fmtStr === 'jpeg' || fmtStr === 'jpg') format = 'JPEG'
      else {
        // webp or other — jsPDF may not support; skip gracefully
        return y
      }
      imageData = `data:image/${fmtStr};base64,${match[2]}`
    } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
      // URL — jsPDF can fetch it at render time. Infer format from extension.
      const lower = logo.toLowerCase().split('?')[0]
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) format = 'JPEG'
      else if (lower.endsWith('.png')) format = 'PNG'
      imageData = logo
    } else {
      // Raw base64 without data URI prefix — assume PNG
      imageData = `data:image/png;base64,${logo}`
      format = 'PNG'
    }

    // Render centered, preserving aspect ratio (assume square-ish logos).
    // jsPDF addImage signature: (imageData, format, x, y, width, height)
    const w = maxWidthMm
    const h = maxHeightMm
    const x = centerX - w / 2
    doc.addImage(imageData, format, x, y, w, h, undefined, 'FAST')
    return y + h
  } catch (err) {
    // If the image fails to load (CORS, corrupt data, unsupported format),
    // silently skip — the text-only header is still valid.
    console.error('[certificat-pdf] Logo render failed:', err instanceof Error ? err.message : err)
    return y
  }
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

  // ─── Resolve template colors and font ───
  const tpl = data.template ?? null
  const colors = resolveTemplateColors(tpl)
  const font = resolveFontFamily(tpl)
  // Use template colors everywhere, falling back to defaults
  const C_PRIMARY = colors.primary
  const C_ACCENT = colors.accent
  const C_BORDER = colors.border
  const C_LIGHT = colors.light

  let y = MARGIN_TOP

  // ─── Background watermark (filigrane image, ~10% opacity) ───
  // Drawn FIRST so all text overlays it.
  drawBackgroundWatermark(doc, tpl?.backgroundImage ?? null)

  // ─── Theme icon watermark (filigrane, ~8% opacity) ───
  // Centered on the page, behind the text zone
  drawThemeWatermark(doc, tpl?.themeIcon ?? null, PAGE_WIDTH / 2, PAGE_HEIGHT / 2, C_PRIMARY)

  // ─── Outer decorative border ───
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(2)
  doc.rect(10, 10, PAGE_WIDTH - 20, PAGE_HEIGHT - 20)
  doc.setLineWidth(0.5)
  doc.setDrawColor(...C_ACCENT)
  doc.rect(12, 12, PAGE_WIDTH - 24, PAGE_HEIGHT - 24)

  // ─── Header: Logo + Establishment ───
  y = 18
  // Render the establishment logo (centered, ~25mm wide) if present.
  // renderLogo returns the updated Y position, or the original Y if no logo.
  const afterLogoY = renderLogo(doc, data.etablissementLogo, PAGE_WIDTH / 2, y, 25, 25)
  if (afterLogoY > y) {
    // Logo was rendered — add a small gap and position the text below it
    y = afterLogoY + 4
  } else {
    // No logo — start text at the original position
    y = 25
  }

  doc.setFontSize(14)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.etablissementNom.toUpperCase(), PAGE_WIDTH / 2, y, { align: 'center' })

  if (data.etablissementVille || data.etablissementPays) {
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont(font, 'normal')
    const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
    doc.text(location, PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── Separator line ───
  y += 10
  doc.setDrawColor(...C_ACCENT)
  doc.setLineWidth(0.8)
  doc.line(MARGIN_LEFT + 20, y, PAGE_WIDTH - MARGIN_RIGHT - 20, y)

  // ─── Certificate Title ───
  y += 18
  doc.setFontSize(24)
  doc.setTextColor(...C_ACCENT)
  doc.setFont(font, 'bold')
  doc.text(data.intitule, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Certificate Type Badge ───
  y += 10
  doc.setFontSize(11)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bolditalic')

  const typeLabel = data.type === 'EXCELLENCE'
    ? '★ Excellence ★'
    : data.type === 'ACCOMPLISSEMENT'
      ? '◆ Accomplissement ◆'
      : '● Participation ●'

  doc.text(typeLabel, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Separator ───
  y += 8
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 30, y, PAGE_WIDTH - MARGIN_RIGHT - 30, y)

  // ─── Body: This certifies that ───
  y += 15
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'italic')
  doc.text('Nous certifions par la présente que', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Student Name ───
  y += 12
  doc.setFontSize(22)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.etudiantNom, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Student Info ───
  if (data.etudiantMatricule || data.etudiantNiveau) {
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont(font, 'normal')
    const infoParts: string[] = []
    if (data.etudiantMatricule) infoParts.push(`Matricule: ${data.etudiantMatricule}`)
    if (data.etudiantNiveau) infoParts.push(`Niveau: ${data.etudiantNiveau}`)
    doc.text(infoParts.join('  •  '), PAGE_WIDTH / 2, y, { align: 'center' })
  }

  // ─── Body: Has successfully ───
  y += 14
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'italic')
  doc.text('a validé avec succès l\'unité d\'enseignement', PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── UE Name ───
  y += 12
  doc.setFontSize(18)
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.ueNom, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── UE Code ───
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'normal')
  doc.text(`Code: ${data.ueCode}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Details Box ───
  y += 14
  const boxX = MARGIN_LEFT + 15
  const boxWidth = CONTENT_WIDTH - 30
  const boxHeight = 42
  const boxY = y

  // Draw box background
  doc.setFillColor(...C_LIGHT)
  doc.setDrawColor(...C_BORDER)
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
    doc.setTextColor(...C_ACCENT)
    doc.setFont(font, 'bold')
    doc.text(`${detail.label}:`, labelX, boxContentY)
    doc.setTextColor(...COLOR_TEXT)
    doc.setFont(font, 'normal')
    doc.text(detail.value, valueX, boxContentY)
    boxContentY += 7
  }

  y = boxY + boxHeight + 10

  // ─── Date ───
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'normal')
  doc.text(`Émis le ${formatDate(data.dateEmission)}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Verification Section ───
  y += 18
  doc.setDrawColor(...C_ACCENT)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 20, y, PAGE_WIDTH - MARGIN_RIGHT - 20, y)

  y += 8
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'bold')
  doc.text('VÉRIFICATION', PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setFont(font, 'normal')
  doc.text('Ce certificat peut être vérifié en ligne à l\'adresse suivante:', PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setTextColor(...C_PRIMARY)
  doc.setFont(font, 'bold')
  doc.text(data.verificationUrl, PAGE_WIDTH / 2, y, { align: 'center' })

  y += 5
  doc.setTextColor(...COLOR_TEXT)
  doc.setFont(font, 'normal')
  doc.text(`Code de vérification: ${data.codeVerification}`, PAGE_WIDTH / 2, y, { align: 'center' })

  // ─── Footer ───
  const footerY = PAGE_HEIGHT - 25
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT + 20, footerY, PAGE_WIDTH - MARGIN_RIGHT - 20, footerY)

  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.setFont(font, 'italic')
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
