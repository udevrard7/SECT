/**
 * CertificatePDF.tsx — Modern Geometric Certificate (A4 Landscape)
 *
 * @react-pdf/renderer component reproducing the modern elegant design:
 * - Diagonal navy/gold corner bands (SVG polygons)
 * - Mixed typography: Playfair Display (serif) + Great Vibes (script) + Inter (sans)
 * - Central seal with TWO gold ribbons descending below
 * - 3 decorative diamonds (gold-navy-gold) under the title
 * - Thematic grid watermark (opacity 0.05)
 * - Justified body paragraph (unified, not separate fields)
 * - Two-column signature: left (teacher) + center (seal) + right (responsable)
 *
 * Colors: navy #1B3A5C, gold #F4B942, text #2C3E50, textLight #7F8C8D
 */

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  StyleSheet,
  Svg,
  Polygon,
  Circle,
  Rect,
  Line,
  G,
  renderToBuffer,
  type Styles,
} from '@react-pdf/renderer'
import path from 'path'

// ─── Font Registration ───

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'PlayfairDisplay',
  fonts: [{ src: path.join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'), fontWeight: 'normal' }],
})
Font.register({
  family: 'GreatVibes',
  fonts: [{ src: path.join(FONTS_DIR, 'GreatVibes-Regular.ttf'), fontWeight: 'normal' }],
})
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'bold' },
    { src: path.join(FONTS_DIR, 'Inter-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

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

// ─── Color constants (exact palette) ───

const NAVY = '#1B3A5C'
const GOLD = '#F4B942'
const TEXT_DARK = '#2C3E50'
const TEXT_LIGHT = '#7F8C8D'
const BG_LIGHT = '#F8F9FA'
const WHITE = '#FFFFFF'

// ─── Helpers ───

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

// ─── Styles ───

const styles = StyleSheet.create({
  page: {
    width: '297mm',
    height: '210mm',
    backgroundColor: BG_LIGHT,
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'Inter',
  },

  // Corner containers
  corner: { position: 'absolute' },

  // Watermark grid wrapper (View with absolute positioning, contains the SVG)
  watermarkWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 842,
    height: 595,
    opacity: 0.05,
  },

  // Borders
  borderOuter: {
    position: 'absolute',
    top: '8mm',
    left: '8mm',
    right: '8mm',
    bottom: '8mm',
    borderWidth: 1.5,
    borderColor: NAVY,
    borderStyle: 'solid',
  },
  borderInner: {
    position: 'absolute',
    top: '11mm',
    left: '11mm',
    right: '11mm',
    bottom: '11mm',
    borderWidth: 0.5,
    borderColor: GOLD,
    borderStyle: 'solid',
  },

  // Content
  content: {
    position: 'absolute',
    top: '14mm',
    left: '25mm',
    right: '25mm',
    bottom: '14mm',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Logo
  logo: {
    marginBottom: 4,
  },

  // Establishment header
  establishment: {
    fontSize: 10,
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 2,
  },

  // Diamonds
  diamonds: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 8,
  },
  diamondGold: {
    width: 6,
    height: 6,
    backgroundColor: GOLD,
    transform: 'rotate(45deg)',
  },
  diamondNavy: {
    width: 8,
    height: 8,
    backgroundColor: NAVY,
    transform: 'rotate(45deg)',
  },

  // Title
  title: {
    fontSize: 42,
    fontFamily: 'PlayfairDisplay',
    color: TEXT_DARK,
    textAlign: 'center',
    lineHeight: 1,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay',
    color: TEXT_DARK,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },

  // Intro
  intro: {
    fontSize: 11,
    color: TEXT_LIGHT,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 4,
  },

  // Student name (script)
  studentName: {
    fontSize: 42,
    fontFamily: 'GreatVibes',
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 2,
  },
  studentInfo: {
    fontSize: 9,
    color: TEXT_LIGHT,
    marginBottom: 8,
  },

  // Body paragraph (justified)
  body: {
    fontSize: 10,
    color: TEXT_DARK,
    textAlign: 'justify',
    lineHeight: 1.6,
    maxWidth: '80%',
    marginBottom: 6,
  },

  // Signature row
  signatureRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '90%',
    marginTop: 'auto',
    marginBottom: 8,
  },
  sigCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '30%',
  },
  sigName: {
    fontSize: 10,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    color: NAVY,
    marginBottom: 3,
  },
  sigLine: {
    width: '100%',
    borderBottomWidth: 0.6,
    borderBottomColor: NAVY,
    borderBottomStyle: 'solid',
    marginBottom: 3,
  },
  sigLabel: {
    fontSize: 8,
    color: TEXT_LIGHT,
    textAlign: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: '5mm',
    left: '25mm',
    right: '25mm',
    textAlign: 'center',
    fontSize: 7,
    color: TEXT_LIGHT,
  },
})

// ─── Grid Watermark SVG ───

function GridWatermark() {
  const cellSize = 15 // mm
  const cols = Math.ceil(297 / cellSize)
  const rows = Math.ceil(210 / cellSize)
  const lines: React.ReactElement[] = []

  // Vertical lines
  for (let i = 0; i <= cols; i++) {
    const x = i * cellSize
    lines.push(
      <Line key={`v${i}`} x1={x} y1={0} x2={x} y2={210} stroke={NAVY} strokeWidth="0.3" />
    )
  }
  // Horizontal lines
  for (let i = 0; i <= rows; i++) {
    const y = i * cellSize
    lines.push(
      <Line key={`h${i}`} x1={0} y1={y} x2={297} y2={y} stroke={NAVY} strokeWidth="0.3" />
    )
  }

  // Wrap SVG in a View with position:absolute (SVGs don't honor position in their own style)
  return (
    <View style={styles.watermarkWrapper} fixed>
      <Svg width={842} height={595} viewBox="0 0 297 210">
        {lines}
      </Svg>
    </View>
  )
}

// ─── Corner Bands SVG ───

function CornerBands() {
  return (
    <>
      {/* Top-left */}
      <View style={[styles.corner, { top: 0, left: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="0,0 60,0 0,60" fill={NAVY} />
          <Polygon points="0,0 38,0 0,38" fill={GOLD} />
        </Svg>
      </View>
      {/* Top-right */}
      <View style={[styles.corner, { top: 0, right: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="60,0 60,60 0,0" fill={NAVY} />
          <Polygon points="60,0 60,38 22,0" fill={GOLD} />
        </Svg>
      </View>
      {/* Bottom-left */}
      <View style={[styles.corner, { bottom: 0, left: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="0,60 60,60 0,0" fill={NAVY} />
          <Polygon points="0,60 38,60 0,22" fill={GOLD} />
        </Svg>
      </View>
      {/* Bottom-right */}
      <View style={[styles.corner, { bottom: 0, right: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="60,60 0,60 60,0" fill={NAVY} />
          <Polygon points="60,60 22,60 60,22" fill={GOLD} />
        </Svg>
      </View>
    </>
  )
}

// ─── Central Seal with Ribbons ───

function CentralSeal() {
  // The seal is a navy circle with gold border, "SECT CERTIFIÉ" inside,
  // and TWO gold ribbons descending below (award-ribbon style).
  const sealSize = 55 // pt diameter
  const ribbonW = 18 // pt ribbon width
  const ribbonH = 25 // pt ribbon length below seal

  return (
    <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '30%' }}>
      {/* Seal circle + ribbons in one SVG */}
      <Svg width={sealSize + 10} height={sealSize + ribbonH + 10} viewBox={`0 0 ${sealSize + 10} ${sealSize + ribbonH + 10}`}>
        {/* Ribbons (drawn FIRST, behind the circle) */}
        {/* Left ribbon */}
        <Polygon
          points={`${sealSize / 2 + 5 - ribbonW / 2 - 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 - ribbonW / 2 + 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 - ribbonW / 2 + 3},${sealSize / 2 + 5 + ribbonH - 5} ${sealSize / 2 + 5 - ribbonW / 2 - 3},${sealSize / 2 + 5 + ribbonH} ${sealSize / 2 + 5 - ribbonW / 2},${sealSize / 2 + 5 + ribbonH - 3}`}
          fill={GOLD}
        />
        {/* Right ribbon */}
        <Polygon
          points={`${sealSize / 2 + 5 + ribbonW / 2 - 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 + ribbonW / 2 + 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 + ribbonW / 2},${sealSize / 2 + 5 + ribbonH - 3} ${sealSize / 2 + 5 + ribbonW / 2 + 3},${sealSize / 2 + 5 + ribbonH} ${sealSize / 2 + 5 + ribbonW / 2 - 3},${sealSize / 2 + 5 + ribbonH - 5}`}
          fill={GOLD}
        />
        {/* Ribbon shadows (darker gold for depth) */}
        <Polygon
          points={`${sealSize / 2 + 5 - ribbonW / 2},${sealSize / 2 + 5} ${sealSize / 2 + 5 - ribbonW / 2 + 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 - ribbonW / 2 + 3},${sealSize / 2 + 5 + ribbonH - 5} ${sealSize / 2 + 5 - ribbonW / 2},${sealSize / 2 + 5 + ribbonH - 3}`}
          fill="#D4A017"
        />
        <Polygon
          points={`${sealSize / 2 + 5 + ribbonW / 2 - 3},${sealSize / 2 + 5} ${sealSize / 2 + 5 + ribbonW / 2},${sealSize / 2 + 5} ${sealSize / 2 + 5 + ribbonW / 2},${sealSize / 2 + 5 + ribbonH - 3} ${sealSize / 2 + 5 + ribbonW / 2 - 3},${sealSize / 2 + 5 + ribbonH - 5}`}
          fill="#D4A017"
        />

        {/* Outer circle (gold border) */}
        <Circle cx={sealSize / 2 + 5} cy={sealSize / 2 + 5} r={sealSize / 2} fill={NAVY} stroke={GOLD} strokeWidth="2.5" />
        {/* Inner circle (thin gold ring) */}
        <Circle cx={sealSize / 2 + 5} cy={sealSize / 2 + 5} r={sealSize / 2 - 4} fill="none" stroke={GOLD} strokeWidth="0.8" />

        {/* Decorative dots around inner ring */}
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * 360) / 16
          const rad = (angle * Math.PI) / 180
          const dotR = sealSize / 2 - 2
          return (
            <Circle
              key={i}
              cx={sealSize / 2 + 5 + dotR * Math.cos(rad)}
              cy={sealSize / 2 + 5 + dotR * Math.sin(rad)}
              r="0.8"
              fill={GOLD}
            />
          )
        })}

        {/* Center star (5-pointed) */}
        {Array.from({ length: 10 }).map((_, i) => {
          const outerR = 5
          const innerR = 2.1
          const r = i % 2 === 0 ? outerR : innerR
          const a1 = (Math.PI / 5) * i - Math.PI / 2
          const a2 = (Math.PI / 5) * (i + 1) - Math.PI / 2
          const cx = sealSize / 2 + 5
          const cy = sealSize / 2 + 5 - 7
          return (
            <Polygon
              key={`star${i}`}
              points={`${cx},${cy} ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} ${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)}`}
              fill={GOLD}
            />
          )
        })}
      </Svg>

      {/* Text below the seal (overlapping the ribbons area) */}
      <View style={{ marginTop: -18 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Inter', fontWeight: 'bold', color: WHITE, textAlign: 'center' }}>SECT</Text>
        <Text style={{ fontSize: 6, fontFamily: 'Inter', fontWeight: 'bold', color: GOLD, textAlign: 'center' }}>CERTIFIÉ</Text>
      </View>
    </View>
  )
}

// ─── Logo Component (auto-fit, preserve aspect ratio) ───

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    // Fallback: text-only establishment name as "logo"
    return (
      <View style={styles.logo}>
        <Text style={{ fontSize: 16, fontFamily: 'PlayfairDisplay', color: NAVY, textAlign: 'center' }}>
          {nom}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.logo}>
      <Image src={logo} style={{ width: 120, height: 50, objectFit: 'contain' as const }} alt="" />
    </View>
  )
}

// ─── Main Certificate Document ───

export function CertificateDocument({ data }: { data: CertificatPDFData }) {
  // Determine subtitle based on type
  const subtitle = data.type === 'EXCELLENCE'
    ? "D'EXCELLENCE"
    : data.type === 'ACCOMPLISSEMENT'
      ? "D'ACCOMPLISSEMENT"
      : 'DE PARTICIPATION'

  // Build the body paragraph (unified, justified)
  const sessionLabel = data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
  const bodyText = `a validé avec succès l'unité d'enseignement ${data.ueNom} (Code : ${data.ueCode}, Filière : ${data.filiereNom}) avec la note finale de ${formatNote(data.noteFinale)}/20 (Mention : ${data.mention || '—'}) lors de la Session ${sessionLabel}${data.anneeAcademique ? ` de l'année ${data.anneeAcademique}` : ''}.`

  // Student info line
  const studentParts: string[] = []
  if (data.etudiantMatricule) studentParts.push(`Matricule : ${data.etudiantMatricule}`)
  if (data.etudiantNiveau) studentParts.push(`Niveau : ${data.etudiantNiveau}`)
  const studentInfo = studentParts.join('  •  ')

  // Establishment header
  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const establishmentHeader = location ? `${data.etablissementNom} — ${location}` : data.etablissementNom

  // Footer
  const footerText = `Émis le ${formatDate(data.dateEmission)}  |  Code : ${data.codeVerification}  |  Vérification : ${data.verificationUrl}`

  return (
    <Document>
      <Page size={[842, 595]} style={styles.page}>
        {/* ── Layer 1: Corner bands ── */}
        <CornerBands />

        {/* ── Layer 2: Grid watermark (opacity 0.05) ── */}
        <GridWatermark />

        {/* ── Layer 3: Double border ── */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* ── Layer 4: Content ── */}
        <View style={styles.content}>
          {/* Logo */}
          <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />

          {/* Establishment header (small, centered) */}
          <Text style={styles.establishment}>{establishmentHeader}</Text>

          {/* 3 Diamonds: gold-navy-gold */}
          <View style={styles.diamonds}>
            <View style={styles.diamondGold} />
            <View style={styles.diamondNavy} />
            <View style={styles.diamondGold} />
          </View>

          {/* Title */}
          <Text style={styles.title}>CERTIFICAT</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Intro */}
          <Text style={styles.intro}>Nous certifions par la présente que</Text>

          {/* Student name (Great Vibes script) */}
          <Text style={styles.studentName}>{data.etudiantNom}</Text>
          {studentInfo ? <Text style={styles.studentInfo}>{studentInfo}</Text> : null}

          {/* Body paragraph (justified) */}
          <Text style={styles.body}>{bodyText}</Text>

          {/* ── Signature row: left (teacher) + center (seal) + right (responsable) ── */}
          <View style={styles.signatureRow}>
            {/* Left: empty line for teacher signature */}
            <View style={styles.sigCol}>
              <View style={{ height: 12 }} />
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>Signature de l'enseignant</Text>
            </View>

            {/* Center: Seal with ribbons */}
            <CentralSeal />

            {/* Right: Responsable name + line + label */}
            <View style={styles.sigCol}>
              {data.responsableNom ? (
                <Text style={styles.sigName}>{data.responsableNom}</Text>
              ) : (
                <View style={{ height: 12 }} />
              )}
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>Le Responsable pédagogique</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <Text style={styles.footer}>{footerText}</Text>
      </Page>
    </Document>
  )
}

/**
 * Render the certificate PDF to a Node.js Buffer.
 */
export async function renderCertificatPDF(data: CertificatPDFData): Promise<Buffer> {
  return await renderToBuffer(<CertificateDocument data={data} />)
}
