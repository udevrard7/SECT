/**
 * CertificatePDF.tsx — Premium Modern Certificate (A4 Landscape)
 *
 * @react-pdf/renderer component implementing the full design spec:
 * - A4 landscape with diagonal navy/gold corner bands
 * - Playfair Display 48pt "CERTIFICAT" (letter-spaced)
 * - Great Vibes 48pt student name (cursive)
 * - Inter for body text (11-12pt)
 * - 3 decorative diamonds (gold-navy-gold)
 * - Central badge: navy circle + gold border + "SECT CERTIFIÉ" + gold ribbons
 * - Thematic watermark (code/UML icons, opacity 0.08)
 * - Logo top-center, establishment + city
 * - UE name prominent, details in framed box
 * - Signatures: teacher (left) + responsable (right), seal centered
 *
 * Palette: navy #1B3A5C, gold #F4B942, text #2C3E50, textLight #7F8C8D
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
  Ellipse,
  Path,
  G,
  renderToBuffer,
} from '@react-pdf/renderer'
import path from 'path'

// ═══ Font Registration ═══

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

// ═══ Types ═══

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
}

// ═══ Color Constants ═══

const NAVY = '#1B3A5C'
const GOLD = '#F4B942'
const GOLD_DARK = '#D4A017'
const TEXT_DARK = '#2C3E50'
const TEXT_LIGHT = '#7F8C8D'
const BG_LIGHT = '#F8F9FA'
const WHITE = '#FFFFFF'
const BOX_BG = '#EEF2F7'
const NOTE_HIGHLIGHT = '#EBF4FF'  // Bleu très pâle pour cellules NOTE/MENTION
const GRAY_LABEL = '#718096'       // Gris pour labels du data grid
const FOOTER_GRAY = '#4A5568'       // Gris foncé pour le footer

// ═══ Helpers ═══

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

// ═══ Styles ═══

const styles = StyleSheet.create({
  // Page (A4 landscape)
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

  // Watermark wrapper (opacité réduite à 0.06 pour lisibilité)
  watermarkWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 842,
    height: 595,
    opacity: 0.06,
  },

  // Overlay blanc pour garantir la lisibilité du texte central
  // (entre le titre et les signatures, opacité 92%)
  textOverlay: {
    position: 'absolute',
    top: '42mm',
    left: '18mm',
    right: '18mm',
    bottom: '42mm',
    backgroundColor: WHITE,
    opacity: 0.92,
    borderRadius: 4,
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

  // Content container
  content: {
    position: 'absolute',
    top: '14mm',
    left: '22mm',
    right: '22mm',
    bottom: '14mm',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Logo
  logoWrap: {
    marginBottom: 4,
    alignItems: 'center',
  },

  // Establishment
  establishment: {
    fontSize: 10,
    color: TEXT_LIGHT,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 1,
  },
  establishmentCity: {
    fontSize: 8,
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 6,
  },

  // Diamonds
  diamonds: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 6,
  },
  diamondGold: {
    width: 7,
    height: 7,
    backgroundColor: GOLD,
    transform: 'rotate(45deg)',
  },
  diamondNavy: {
    width: 9,
    height: 9,
    backgroundColor: NAVY,
    transform: 'rotate(45deg)',
  },

  // Title
  title: {
    fontSize: 48,
    fontFamily: 'PlayfairDisplay',
    color: TEXT_DARK,
    textAlign: 'center',
    letterSpacing: 6,
    lineHeight: 1,
  },
  subtitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },

  // Intro
  intro: {
    fontSize: 11,
    color: TEXT_LIGHT,
    fontStyle: 'italic',
    marginTop: 6,
    marginBottom: 2,
  },

  // Student name (Great Vibes, 48pt, capitalize — pas tout en majuscules)
  studentName: {
    fontSize: 48,
    fontFamily: 'GreatVibes',
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 0,
    textTransform: 'capitalize',
  },
  studentInfo: {
    fontSize: 9,
    color: TEXT_LIGHT,
    marginBottom: 6,
  },

  // UE name
  ueName: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },

  // Data Grid moderne (3 colonnes × 2 lignes)
  detailsGrid: {
    width: '78%',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  detailCell: {
    width: '32%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '6px 4px',
    borderRadius: 4,
    backgroundColor: BOX_BG,
  },
  // Cellules NOTE et MENTION mises en valeur (fond bleu pâle #EBF4FF)
  detailCellHighlight: {
    width: '32%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '6px 4px',
    borderRadius: 4,
    backgroundColor: NOTE_HIGHLIGHT,
  },
  detailLabel: {
    fontSize: 8,
    color: GRAY_LABEL,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 12,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Signature row — flexbox équilibrée
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    marginTop: 40,
    paddingHorizontal: 40,
  },
  sigCol: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '28%',
  },
  sigName: {
    fontSize: 10,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    color: NAVY,
    marginBottom: 4,
  },
  // Espace de signature optimisé pour l'impression (60px + ligne fine)
  signatureSpace: {
    height: 60,
    borderBottom: '1pt solid #CBD5E0',
    marginBottom: 8,
    width: '100%',
  },
  sigLabel: {
    fontSize: 9,
    color: TEXT_LIGHT,
    textAlign: 'center',
  },

  // Footer — remonté (15mm), ligne dorée au-dessus, 9pt gris foncé
  footerSeparator: {
    position: 'absolute',
    bottom: '18mm',
    left: '25mm',
    right: '25mm',
    borderBottomWidth: 0.5,
    borderBottomColor: GOLD,
    borderBottomStyle: 'solid',
  },
  footer: {
    position: 'absolute',
    bottom: '15mm',
    left: '25mm',
    right: '25mm',
    textAlign: 'center',
    fontSize: 9,
    color: FOOTER_GRAY,
  },
})

// ═══ Grid Watermark (thematic for all UE types) ═══

function CodeWatermark() {
  // Repeating pattern of code brackets </> and UML class boxes
  // Rendered as a subtle SVG covering the page at 0.08 opacity
  return (
    <View style={styles.watermarkWrapper} fixed>
      <Svg width={842} height={595} viewBox="0 0 842 595">
        {/* Repeating </> chevrons in a loose grid */}
        {Array.from({ length: 6 }).map((_, row) =>
          Array.from({ length: 9 }).map((_, col) => {
            const cx = 50 + col * 90
            const cy = 50 + row * 95
            return (
              <G key={`${row}-${col}`}>
                {/* Left chevron < */}
                <Line x1={cx - 8} y1={cy - 6} x2={cx - 3} y2={cy} stroke={NAVY} strokeWidth="1.2" />
                <Line x1={cx - 3} y1={cy} x2={cx - 8} y2={cy + 6} stroke={NAVY} strokeWidth="1.2" />
                {/* Right chevron > */}
                <Line x1={cx + 3} y1={cy - 6} x2={cx + 8} y2={cy} stroke={NAVY} strokeWidth="1.2" />
                <Line x1={cx + 8} y1={cy} x2={cx + 3} y2={cy + 6} stroke={NAVY} strokeWidth="1.2" />
                {/* Center slash */}
                <Line x1={cx - 1} y1={cy + 4} x2={cx + 1} y2={cy - 4} stroke={NAVY} strokeWidth="0.8" />
              </G>
            )
          })
        )}
        {/* A few UML class box outlines scattered */}
        {[
          { x: 120, y: 120 }, { x: 600, y: 80 }, { x: 300, y: 420 }, { x: 700, y: 380 },
        ].map((pos, i) => (
          <G key={`uml-${i}`}>
            <Rect x={pos.x} y={pos.y} width={60} height={35} fill="none" stroke={NAVY} strokeWidth="0.8" />
            <Line x1={pos.x} y1={pos.y + 12} x2={pos.x + 60} y2={pos.y + 12} stroke={NAVY} strokeWidth="0.5" />
            <Line x1={pos.x} y1={pos.y + 23} x2={pos.x + 60} y2={pos.y + 23} stroke={NAVY} strokeWidth="0.5" />
          </G>
        ))}
      </Svg>
    </View>
  )
}

// ═══ Corner Bands ═══

function CornerBands() {
  return (
    <>
      <View style={[styles.corner, { top: 0, left: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="0,0 60,0 0,60" fill={NAVY} />
          <Polygon points="0,0 38,0 0,38" fill={GOLD} />
        </Svg>
      </View>
      <View style={[styles.corner, { top: 0, right: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="60,0 60,60 0,0" fill={NAVY} />
          <Polygon points="60,0 60,38 22,0" fill={GOLD} />
        </Svg>
      </View>
      <View style={[styles.corner, { bottom: 0, left: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="0,60 60,60 0,0" fill={NAVY} />
          <Polygon points="0,60 38,60 0,22" fill={GOLD} />
        </Svg>
      </View>
      <View style={[styles.corner, { bottom: 0, right: 0 }]} fixed>
        <Svg width="170" height="170" viewBox="0 0 60 60">
          <Polygon points="60,60 0,60 60,0" fill={NAVY} />
          <Polygon points="60,60 22,60 60,22" fill={GOLD} />
        </Svg>
      </View>
    </>
  )
}

// ═══ Central Seal with Gold Ribbons ═══

function CentralSeal() {
  const cx = 35 // center x in SVG viewport
  const cy = 32 // center y
  const r = 26 // seal radius

  return (
    <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '28%' }}>
      <Svg width={80} height={75} viewBox="0 0 70 70">
        {/* ── Ribbons (behind circle, drawn first) ── */}
        {/* Left ribbon */}
        <Polygon
          points={`${cx - 8},${cy + 18} ${cx - 2},${cy + 18} ${cx - 2},${cy + 40} ${cx - 5},${cy + 36} ${cx - 8},${cy + 40}`}
          fill={GOLD}
        />
        <Polygon points={`${cx - 8},${cy + 18} ${cx - 5},${cy + 18} ${cx - 5},${cy + 40} ${cx - 8},${cy + 40}`} fill={GOLD_DARK} />
        {/* Right ribbon */}
        <Polygon
          points={`${cx + 2},${cy + 18} ${cx + 8},${cy + 18} ${cx + 8},${cy + 40} ${cx + 5},${cy + 36} ${cx + 2},${cy + 40}`}
          fill={GOLD}
        />
        <Polygon points={`${cx + 5},${cy + 18} ${cx + 8},${cy + 18} ${cx + 8},${cy + 40} ${cx + 5},${cy + 40}`} fill={GOLD_DARK} />

        {/* ── Seal circle ── */}
        {/* Navy fill */}
        <Circle cx={cx} cy={cy} r={r} fill={NAVY} />
        {/* Gold outer border (thick) */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="2.5" />
        {/* Gold inner ring (thin) */}
        <Circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={GOLD} strokeWidth="0.8" />

        {/* Decorative dots ring */}
        {Array.from({ length: 20 }).map((_, i) => {
          const angle = (i * 360) / 20
          const rad = (angle * Math.PI) / 180
          const dr = r - 2
          return (
            <Circle key={i} cx={cx + dr * Math.cos(rad)} cy={cy + dr * Math.sin(rad)} r="0.7" fill={GOLD} />
          )
        })}

        {/* Center star (5-pointed) */}
        {Array.from({ length: 10 }).map((_, i) => {
          const outerR = 6
          const innerR = 2.5
          const ri = i % 2 === 0 ? outerR : innerR
          const a1 = (Math.PI / 5) * i - Math.PI / 2
          const a2 = (Math.PI / 5) * (i + 1) - Math.PI / 2
          return (
            <Polygon
              key={`s${i}`}
              points={`${cx},${cy - 6} ${cx + ri * Math.cos(a1)},${cy - 6 + ri * Math.sin(a1)} ${cx + ri * Math.cos(a2)},${cy - 6 + ri * Math.sin(a2)}`}
              fill={GOLD}
            />
          )
        })}

        {/* Text "SECT" */}
        <Text x={cx} y={cy + 5} textAnchor="middle" fontSize="9" fontFamily="Inter" fontWeight="bold" fill={WHITE}>SECT</Text>
        {/* Text "CERTIFIÉ" */}
        <Text x={cx} y={cy + 11} textAnchor="middle" fontSize="4.5" fontFamily="Inter" fontWeight="bold" fill={GOLD}>CERTIFIÉ</Text>
      </Svg>
    </View>
  )
}

// ═══ Logo Component ═══

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    return (
      <View style={styles.logoWrap}>
        <Text style={{ fontSize: 16, fontFamily: 'PlayfairDisplay', color: NAVY, textAlign: 'center' }}>
          {nom}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.logoWrap}>
      <Image src={logo} style={{ width: 130, height: 55, objectFit: 'contain' as const }} alt="" />
    </View>
  )
}

// ═══ Main Certificate Document ═══

export function CertificateDocument({ data }: { data: CertificatPDFData }) {
  // Subtitle based on type
  const subtitle = data.type === 'EXCELLENCE'
    ? "d'Excellence"
    : data.type === 'ACCOMPLISSEMENT'
      ? "d'Accomplissement"
      : 'de Participation'

  // Student info
  const studentParts: string[] = []
  if (data.etudiantMatricule) studentParts.push(`Matricule : ${data.etudiantMatricule}`)
  if (data.etudiantNiveau) studentParts.push(`Niveau : ${data.etudiantNiveau}`)
  const studentInfo = studentParts.join('  •  ')

  // Session label
  const sessionLabel = data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'

  // Establishment
  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')

  // Footer
  const footerText = `Émis le ${formatDate(data.dateEmission)}  |  Code : ${data.codeVerification}  |  Vérification : ${data.verificationUrl}`

  // Details array
  const details = [
    { label: 'Code UE', value: data.ueCode },
    { label: 'Filière', value: data.filiereNom },
    { label: 'Note', value: `${formatNote(data.noteFinale)}/20` },
    { label: 'Mention', value: data.mention || '—' },
    { label: 'Session', value: sessionLabel },
    { label: 'Année', value: data.anneeAcademique || '—' },
  ]

  return (
    <Document>
      <Page size={[842, 595]} style={styles.page}>
        {/* Layer 1: Corner bands */}
        <CornerBands />

        {/* Layer 2: Code/UML watermark (opacity 0.06) */}
        <CodeWatermark />

        {/* Layer 3: Double border */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* Layer 3b: White overlay for text readability (opacity 0.92) */}
        <View style={styles.textOverlay} />

        {/* Layer 4: Content */}
        <View style={styles.content}>
          {/* Logo + establishment */}
          <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
          <Text style={styles.establishment}>{data.etablissementNom.toUpperCase()}</Text>
          {location ? <Text style={styles.establishmentCity}>{location}</Text> : null}

          {/* Diamonds: gold - navy - gold */}
          <View style={styles.diamonds}>
            <View style={styles.diamondGold} />
            <View style={styles.diamondNavy} />
            <View style={styles.diamondGold} />
          </View>

          {/* Title + subtitle */}
          <Text style={styles.title}>CERTIFICAT</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Intro */}
          <Text style={styles.intro}>Nous certifions par la présente que</Text>

          {/* Student name (Great Vibes, 48pt) */}
          <Text style={styles.studentName}>{data.etudiantNom}</Text>
          {studentInfo ? <Text style={styles.studentInfo}>{studentInfo}</Text> : null}

          {/* "a validé avec succès l'unité d'enseignement" */}
          <Text style={styles.intro}>a validé avec succès l&apos;unité d&apos;enseignement</Text>

          {/* UE name (prominent) */}
          <Text style={styles.ueName}>{data.ueNom}</Text>

          {/* Data Grid moderne (3 colonnes × 2 lignes) avec cellules NOTE/MENTION mises en valeur */}
          <View style={styles.detailsGrid}>
            {details.map((d, i) => {
              const isHighlight = d.label === 'Note' || d.label === 'Mention'
              return (
                <View key={i} style={isHighlight ? styles.detailCellHighlight : styles.detailCell}>
                  <Text style={styles.detailLabel}>{d.label}</Text>
                  <Text style={styles.detailValue}>{d.value}</Text>
                </View>
              )
            })}
          </View>

          {/* Signature row: teacher (left) + seal (center) + responsable (right) */}
          <View style={styles.signatureRow}>
            {/* Left: teacher signature (empty space for handwriting) */}
            <View style={styles.sigCol}>
              <View style={styles.signatureSpace} />
              <Text style={styles.sigLabel}>Signature de l&apos;enseignant</Text>
            </View>

            {/* Center: Seal with ribbons */}
            <CentralSeal />

            {/* Right: Responsable */}
            <View style={styles.sigCol}>
              {data.responsableNom ? (
                <Text style={styles.sigName}>{data.responsableNom}</Text>
              ) : null}
              <View style={styles.signatureSpace} />
              <Text style={styles.sigLabel}>Le Responsable pédagogique</Text>
            </View>
          </View>
        </View>

        {/* Footer separator (fine ligne dorée) */}
        <View style={styles.footerSeparator} />

        {/* Footer (remonté, 9pt gris foncé) */}
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
