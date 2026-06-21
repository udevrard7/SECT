/**
 * CertificatePDF.tsx — Premium Certificate with Ornamental Design
 *
 * Inspired by the vecteezy SVG certificate template.
 * Reproduces the essence: ornamental borders, gold (#C5A044) accents,
 * elegant typography (Playfair + Great Vibes + Inter).
 *
 * A4 Landscape (842×595pt) — single page, no overflow.
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

// ═══ Constants ═══

const GOLD = '#C5A044'
const GOLD_LIGHT = '#FFF8E7'
const GOLD_BORDER = '#E8D09A'
const NAVY = '#1B3A5C'
const TEXT_DARK = '#4A4A4A'
const TEXT_GRAY = '#718096'
const TEXT_FOOTER = '#4A5568'
const WHITE = '#FFFFFF'
const CELL_BG = '#F7FAFC'
const SIG_LINE = '#C5A044'

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

// ═══ Styles ═══

const styles = StyleSheet.create({
  page: {
    width: 842,
    height: 595,
    backgroundColor: WHITE,
    position: 'relative',
  },

  corner: { position: 'absolute' },

  // Triple border (ornamental frame)
  borderOuter: {
    position: 'absolute',
    top: '6mm',
    left: '6mm',
    right: '6mm',
    bottom: '6mm',
    borderWidth: 2,
    borderColor: GOLD,
    borderStyle: 'solid',
  },
  borderMiddle: {
    position: 'absolute',
    top: '9mm',
    left: '9mm',
    right: '9mm',
    bottom: '9mm',
    borderWidth: 0.5,
    borderColor: NAVY,
    borderStyle: 'solid',
  },
  borderInner: {
    position: 'absolute',
    top: '12mm',
    left: '12mm',
    right: '12mm',
    bottom: '12mm',
    borderWidth: 0.3,
    borderColor: GOLD,
    borderStyle: 'solid',
  },

  // Content
  content: {
    position: 'absolute',
    top: '42pt',
    left: '50pt',
    right: '50pt',
    bottom: '42pt',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Header
  logoWrap: { alignItems: 'center', marginBottom: 3 },
  universityName: {
    fontSize: 10,
    color: GOLD,
    letterSpacing: 3,
    marginBottom: 1,
  },
  universityCity: {
    fontSize: 9,
    color: TEXT_GRAY,
    marginBottom: 4,
  },

  // Title
  titleMain: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 36,
    color: GOLD,
    letterSpacing: 4,
    marginVertical: 3,
  },
  titleSub: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 24,
    color: TEXT_DARK,
    letterSpacing: 2,
    marginBottom: 8,
  },

  // Divider (3 diamonds)
  divider: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  diamondGold: { width: 7, height: 7, backgroundColor: GOLD, transform: 'rotate(45deg)' },
  diamondNavy: { width: 9, height: 9, backgroundColor: NAVY, transform: 'rotate(45deg)' },

  // Intro
  introText: {
    fontSize: 13,
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 6,
    fontStyle: 'italic',
  },

  // Student name
  studentName: {
    fontFamily: 'GreatVibes',
    fontSize: 52,
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 2,
  },
  studentInfo: {
    fontSize: 10,
    color: TEXT_GRAY,
    textAlign: 'center',
    marginBottom: 8,
  },

  // UE
  ueIntro: {
    fontSize: 12,
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 3,
  },
  ueName: {
    fontFamily: 'PlayfairDisplay',
    fontSize: 28,
    color: GOLD,
    textAlign: 'center',
    marginBottom: 12,
  },

  // Info grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    marginBottom: 12,
  },
  infoCell: {
    width: '30%',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
    backgroundColor: CELL_BG,
    alignItems: 'center',
  },
  infoCellHighlighted: {
    width: '30%',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
    backgroundColor: GOLD_LIGHT,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderStyle: 'solid',
    alignItems: 'center',
  },
  label: {
    fontSize: 8,
    color: TEXT_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  value: {
    fontSize: 12,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Badge
  badgeWrap: { alignItems: 'center', marginVertical: 6 },

  // Signatures
  signaturesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  signatureBlock: { width: '30%', alignItems: 'center' },
  signatureSpace: {
    height: 50,
    borderBottom: `1pt solid ${SIG_LINE}`,
    width: '100%',
    marginBottom: 6,
  },
  signatureLabel: { fontSize: 9, color: TEXT_GRAY, textAlign: 'center' },
  signatureName: {
    fontSize: 10,
    color: '#2D3748',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 1,
  },

  // Footer
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTop: `1pt solid ${GOLD}`,
    textAlign: 'center',
  },
  footerText: { fontSize: 9, color: TEXT_FOOTER, textAlign: 'center' },
})

// ═══ Ornamental Corner Decorations ═══

function OrnamentalCorners() {
  // Simplified ornamental corners inspired by the SVG:
  // Gold L-shaped flourishes + small decorative circles
  const s = 50 // size
  return (
    <>
      {/* Top-left */}
      <View style={[styles.corner, { top: '5mm', left: '5mm' }]} fixed>
        <Svg width={s} height={s} viewBox="0 0 50 50">
          {/* L-shaped gold flourish */}
          <Path d="M0,0 L50,0 L50,3 L3,3 L3,50 L0,50 Z" fill={GOLD} />
          {/* Inner navy accent */}
          <Path d="M6,6 L40,6 L40,8 L8,8 L8,40 L6,40 Z" fill={NAVY} />
          {/* Decorative dot */}
          <Circle cx="12" cy="12" r="2" fill={GOLD} />
        </Svg>
      </View>
      {/* Top-right */}
      <View style={[styles.corner, { top: '5mm', right: '5mm' }]} fixed>
        <Svg width={s} height={s} viewBox="0 0 50 50">
          <Path d="M50,0 L0,0 L0,3 L47,3 L47,50 L50,50 Z" fill={GOLD} />
          <Path d="M44,6 L10,6 L10,8 L42,8 L42,40 L44,40 Z" fill={NAVY} />
          <Circle cx="38" cy="12" r="2" fill={GOLD} />
        </Svg>
      </View>
      {/* Bottom-left */}
      <View style={[styles.corner, { bottom: '5mm', left: '5mm' }]} fixed>
        <Svg width={s} height={s} viewBox="0 0 50 50">
          <Path d="M0,50 L50,50 L50,47 L3,47 L3,0 L0,0 Z" fill={GOLD} />
          <Path d="M6,44 L40,44 L40,42 L8,42 L8,10 L6,10 Z" fill={NAVY} />
          <Circle cx="12" cy="38" r="2" fill={GOLD} />
        </Svg>
      </View>
      {/* Bottom-right */}
      <View style={[styles.corner, { bottom: '5mm', right: '5mm' }]} fixed>
        <Svg width={s} height={s} viewBox="0 0 50 50">
          <Path d="M50,50 L0,50 L0,47 L47,47 L47,0 L50,0 Z" fill={GOLD} />
          <Path d="M44,44 L10,44 L10,42 L42,42 L42,10 L44,10 Z" fill={NAVY} />
          <Circle cx="38" cy="38" r="2" fill={GOLD} />
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
        <Circle cx={cx} cy={cy} r={r} fill={NAVY} />
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="3" />
        <Circle cx={cx} cy={cy} r={r - 5} fill="none" stroke={GOLD} strokeWidth="0.8" />
        {/* Decorative dots */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i * 360) / 24
          const rad = (a * Math.PI) / 180
          const dr = r - 2.5
          return <Circle key={i} cx={cx + dr * Math.cos(rad)} cy={cy + dr * Math.sin(rad)} r="0.6" fill={GOLD} />
        })}
        {/* Center star */}
        {Array.from({ length: 10 }).map((_, i) => {
          const ri = i % 2 === 0 ? 6 : 2.5
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
  const subtitle = data.type === 'EXPERT'
    ? 'Niveau Expert'
    : data.type === 'AVANCE'
      ? 'Niveau Avancé'
      : 'Niveau Standard'

  const studentName = capitalizeName(data.etudiantNom)

  const studentParts: string[] = []
  if (data.etudiantMatricule) studentParts.push(`Matricule : ${data.etudiantMatricule}`)
  if (data.etudiantNiveau) studentParts.push(`Niveau : ${data.etudiantNiveau}`)

  const sessionLabel = data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const footerText = `Émis le ${formatDate(data.dateEmission)}  |  Code: ${data.codeVerification}  |  Vérification: ${data.verificationUrl}`

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
        {/* Layer 1: Ornamental corners */}
        <OrnamentalCorners />

        {/* Layer 2: Triple border (gold + navy + gold) */}
        <View style={styles.borderOuter} />
        <View style={styles.borderMiddle} />
        <View style={styles.borderInner} />

        {/* Layer 3: Content */}
        <View style={styles.content}>
          {/* Header */}
          <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
          <Text style={styles.universityName}>{data.etablissementNom.toUpperCase()}</Text>
          {location ? <Text style={styles.universityCity}>{location}</Text> : null}

          {/* Title */}
          <Text style={styles.titleMain}>CERTIFICAT DE RÉUSSITE</Text>
          <Text style={styles.titleSub}>{subtitle}</Text>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.diamondGold} />
            <View style={styles.diamondNavy} />
            <View style={styles.diamondGold} />
          </View>

          {/* Intro */}
          <Text style={styles.introText}>Nous certifions par la présente que</Text>

          {/* Student name (Great Vibes, 52pt) */}
          <Text style={styles.studentName}>{studentName}</Text>
          {studentParts.length > 0 ? <Text style={styles.studentInfo}>{studentParts.join('  •  ')}</Text> : null}

          {/* UE */}
          <Text style={styles.ueIntro}>a validé avec succès l&apos;unité d&apos;enseignement</Text>
          <Text style={styles.ueName}>{data.ueNom}</Text>

          {/* Info grid */}
          <View style={styles.infoGrid}>
            {infos.map((info, i) => (
              <View key={i} style={info.highlight ? styles.infoCellHighlighted : styles.infoCell}>
                <Text style={styles.label}>{info.label}</Text>
                <Text style={styles.value}>{info.value}</Text>
              </View>
            ))}
          </View>

          {/* Badge */}
          <CentralBadge />

          {/* Signatures */}
          <View style={styles.signaturesContainer}>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLabel}>Signature de l&apos;enseignant</Text>
            </View>
            <View style={{ width: '20%' }} />
            <View style={styles.signatureBlock}>
              <View style={styles.signatureSpace} />
              {data.responsableNom ? <Text style={styles.signatureName}>{data.responsableNom}</Text> : null}
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

export async function renderCertificatPDF(data: CertificatPDFData): Promise<Buffer> {
  return await renderToBuffer(<CertificateDocument data={data} />)
}
