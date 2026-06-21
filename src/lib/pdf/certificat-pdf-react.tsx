/**
 * CertificatePDF.tsx — Professional Certificate (A4 Landscape)
 *
 * @react-pdf/renderer component with exact design spec:
 * - Diagonal navy/gold corner bands (SVG)
 * - Playfair Display titles + Great Vibes student name + Inter body
 * - 3×2 info grid with highlighted NOTE/MENTION cells
 * - Central badge "SECT CERTIFIÉ" with gold border
 * - Two-column signatures (70px space each)
 * - Footer with gold separator
 * - Watermark at 0.05 opacity + white overlay 0.95
 *
 * Palette: navy #1B3A5C, gold #F4B942
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

// ═══ Constants ═══

const NAVY = '#1B3A5C'
const GOLD = '#F4B942'
const TEXT_DARK = '#2D3748'
const TEXT_GRAY = '#718096'
const TEXT_FOOTER = '#4A5568'
const WHITE = '#FFFFFF'
const HIGHLIGHT_BG = '#EBF4FF'
const HIGHLIGHT_BORDER = '#BEE3F8'
const SIG_LINE = '#CBD5E0'

// ═══ Helpers ═══

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

function capitalizeName(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// ═══ Styles (exact spec) ═══

const styles = StyleSheet.create({
  page: {
    width: 842,
    height: 595,
    backgroundColor: WHITE,
    position: 'relative',
  },

  // Corner bands
  corner: { position: 'absolute' },

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

  // Content (absolute positioned, fixed dimensions = no page overflow)
  content: {
    position: 'absolute',
    top: '42pt',
    left: '42pt',
    right: '42pt',
    bottom: '42pt',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Header
  header: {
    textAlign: 'center',
    marginBottom: 10,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  universityName: {
    fontSize: 10,
    color: TEXT_GRAY,
    letterSpacing: 2,
    marginBottom: 2,
  },
  universityCity: {
    fontSize: 8,
    color: TEXT_GRAY,
  },

  // Title
  titleMain: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 42,
    color: NAVY,
    letterSpacing: 6,
    marginVertical: 5,
  },
  titleSub: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 22,
    color: TEXT_DARK,
    letterSpacing: 2,
    marginBottom: 15,
  },

  // Divider (3 diamonds)
  divider: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  diamondGold: {
    width: 8,
    height: 8,
    backgroundColor: GOLD,
    transform: 'rotate(45deg)',
  },
  diamondNavy: {
    width: 10,
    height: 10,
    backgroundColor: NAVY,
    transform: 'rotate(45deg)',
  },

  // Intro
  introText: {
    fontSize: 12,
    color: TEXT_FOOTER,
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },

  // Student name
  studentName: {
    fontFamily: 'GreatVibes',
    fontSize: 48,
    color: NAVY,
    textAlign: 'center',
    marginVertical: 10,
  },
  studentInfo: {
    fontSize: 10,
    color: TEXT_GRAY,
    textAlign: 'center',
    marginBottom: 10,
  },

  // UE name
  ueName: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 24,
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 15,
  },

  // Info grid (3 cols × 2 rows)
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  infoCell: {
    width: '30%',
    padding: 10,
    marginBottom: 10,
    borderRadius: 4,
    textAlign: 'center',
    backgroundColor: '#F7FAFC',
    alignItems: 'center',
  },
  infoCellHighlighted: {
    width: '30%',
    padding: 10,
    marginBottom: 10,
    borderRadius: 4,
    textAlign: 'center',
    backgroundColor: HIGHLIGHT_BG,
    borderWidth: 1,
    borderColor: HIGHLIGHT_BORDER,
    borderStyle: 'solid',
    alignItems: 'center',
  },
  label: {
    fontSize: 8,
    color: TEXT_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 11,
    color: NAVY,
    fontWeight: 'bold',
  },

  // Badge (centered)
  badgeWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },

  // Signatures
  signaturesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
    paddingHorizontal: 30,
  },
  signatureBlock: {
    width: '30%',
    alignItems: 'center',
  },
  signatureSpace: {
    height: 50,
    borderBottom: `1pt solid ${SIG_LINE}`,
    width: '100%',
    marginBottom: 8,
  },
  signatureLabel: {
    fontSize: 9,
    color: TEXT_GRAY,
    textAlign: 'center',
  },
  signatureName: {
    fontSize: 10,
    color: TEXT_DARK,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },

  // Footer
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTop: `1pt solid ${GOLD}`,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 9,
    color: TEXT_FOOTER,
    textAlign: 'center',
  },
})

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

// ═══ Central Badge ═══

function CentralBadge() {
  const cx = 35
  const cy = 35
  const r = 28

  return (
    <View style={styles.badgeWrap}>
      <Svg width={80} height={80} viewBox="0 0 70 70">
        {/* Navy circle */}
        <Circle cx={cx} cy={cy} r={r} fill={NAVY} />
        {/* Gold border (thick) */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="3" />
        {/* Gold inner ring */}
        <Circle cx={cx} cy={cy} r={r - 5} fill="none" stroke={GOLD} strokeWidth="0.8" />

        {/* Decorative dots */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 360) / 24
          const rad = (angle * Math.PI) / 180
          const dr = r - 2.5
          return (
            <Circle key={i} cx={cx + dr * Math.cos(rad)} cy={cy + dr * Math.sin(rad)} r="0.6" fill={GOLD} />
          )
        })}

        {/* Center star */}
        {Array.from({ length: 10 }).map((_, i) => {
          const outerR = 6
          const innerR = 2.5
          const ri = i % 2 === 0 ? outerR : innerR
          const a1 = (Math.PI / 5) * i - Math.PI / 2
          const a2 = (Math.PI / 5) * (i + 1) - Math.PI / 2
          return (
            <Polygon
              key={`s${i}`}
              points={`${cx},${cy - 8} ${cx + ri * Math.cos(a1)},${cy - 8 + ri * Math.sin(a1)} ${cx + ri * Math.cos(a2)},${cy - 8 + ri * Math.sin(a2)}`}
              fill={GOLD}
            />
          )
        })}

        {/* Text */}
        <Text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontFamily="Inter" fontWeight="bold" fill={WHITE}>SECT</Text>
        <Text x={cx} y={cy + 11} textAnchor="middle" fontSize="5" fontFamily="Inter" fontWeight="bold" fill={GOLD}>CERTIFIÉ</Text>
      </Svg>
    </View>
  )
}

// ═══ Logo ═══

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    return (
      <View style={styles.logoWrap}>
        <Text style={{ fontSize: 14, fontFamily: 'PlayfairDisplay', color: NAVY }}>{nom}</Text>
      </View>
    )
  }
  return (
    <View style={styles.logoWrap}>
      <Image src={logo} style={{ width: 120, height: 50, objectFit: 'contain' as const }} alt="" />
    </View>
  )
}

// ═══ Main Component ═══

export function CertificateDocument({ data }: { data: CertificatPDFData }) {
  const subtitle = data.type === 'EXCELLENCE'
    ? "d'Excellence"
    : data.type === 'ACCOMPLISSEMENT'
      ? "d'Accomplissement"
      : 'de Participation'

  const studentName = capitalizeName(data.etudiantNom)

  const studentParts: string[] = []
  if (data.etudiantMatricule) studentParts.push(`Matricule: ${data.etudiantMatricule}`)
  if (data.etudiantNiveau) studentParts.push(`Niveau: ${data.etudiantNiveau}`)

  const sessionLabel = data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')

  const footerText = `Émis le ${formatDate(data.dateEmission)}  |  Code: ${data.codeVerification}  |  Vérification: ${data.verificationUrl}`

  // Info grid data
  const infos = [
    { label: 'CODE UE', value: data.ueCode, highlight: false },
    { label: 'FILIÈRE', value: data.filiereNom, highlight: false },
    { label: 'NOTE', value: `${formatNote(data.noteFinale)}/20`, highlight: true },
    { label: 'MENTION', value: data.mention || '—', highlight: true },
    { label: 'SESSION', value: sessionLabel, highlight: false },
    { label: 'ANNÉE', value: data.anneeAcademique || '—', highlight: false },
  ]

  return (
    <Document>
      <Page size={[842, 595]} style={styles.page}>
        {/* Layer 1: Corner bands */}
        <CornerBands />

        {/* Layer 2: Double border */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* Layer 3: Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
            <Text style={styles.universityName}>{data.etablissementNom.toUpperCase()}</Text>
            {location ? <Text style={styles.universityCity}>{location}</Text> : null}
          </View>

          {/* Title */}
          <Text style={styles.titleMain}>CERTIFICAT</Text>
          <Text style={styles.titleSub}>{subtitle}</Text>

          {/* Divider (3 diamonds: gold-navy-gold) */}
          <View style={styles.divider}>
            <View style={styles.diamondGold} />
            <View style={styles.diamondNavy} />
            <View style={styles.diamondGold} />
          </View>

          {/* Intro */}
          <Text style={styles.introText}>Nous certifions par la présente que</Text>

          {/* Student name (Great Vibes, 48pt) */}
          <Text style={styles.studentName}>{studentName}</Text>
          {studentParts.length > 0 ? <Text style={styles.studentInfo}>{studentParts.join('  •  ')}</Text> : null}

          {/* UE name */}
          <Text style={styles.ueName}>{data.ueNom}</Text>

          {/* Info grid (3 cols × 2 rows) */}
          <View style={styles.infoGrid}>
            {infos.map((info, i) => (
              <View key={i} style={info.highlight ? styles.infoCellHighlighted : styles.infoCell}>
                <Text style={styles.label}>{info.label}</Text>
                <Text style={styles.value}>{info.value}</Text>
              </View>
            ))}
          </View>

          {/* Central badge */}
          <CentralBadge />

          {/* Signatures */}
          <View style={styles.signaturesContainer}>
            {/* Left: teacher */}
            <View style={styles.signatureBlock}>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLabel}>Signature de l'enseignant</Text>
            </View>

            {/* Center: badge is already above, space here for layout balance */}
            <View style={{ width: '20%' }} />

            {/* Right: responsable */}
            <View style={styles.signatureBlock}>
              <View style={styles.signatureSpace} />
              {data.responsableNom ? (
                <Text style={styles.signatureName}>{data.responsableNom}</Text>
              ) : null}
              <Text style={styles.signatureLabel}>Le Responsable pédagogique</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{footerText}</Text>
          </View>
        </View>
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
