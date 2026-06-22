/**
 * CertificatePDF.tsx — Certificat académique professionnel
 *
 * Design épuré, académique, inspiré des certificats universitaires classiques:
 * - Bordure triple fine (or + navy + or)
 * - Typographie cohérente: Playfair Display pour les titres, Great Vibes
 *   pour le nom, Inter pour le corps
 * - Layout vertical centré avec espacement aéré
 * - Grille d'infos 3×2 propre et alignée
 * - Badge SECT CERTIFIÉ centré
 * - Signatures espacées et lisibles
 * - Footer avec ligne dorée
 *
 * Palette: navy #1B3A5C, gold #C5A044, text #2C3E50
 * A4 Landscape (842×595pt) et Portrait (595×842pt)
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, Font, StyleSheet,
  Svg, Polygon, Circle, Path, renderToBuffer,
} from '@react-pdf/renderer'
import path from 'path'

// ═══ Fonts ═══

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
const GOLD = '#C5A044'
const GOLD_LIGHT = '#FFF8E7'
const GOLD_BORDER = '#E8D09A'
const TEXT_DARK = '#2C3E50'
const TEXT_GRAY = '#718096'
const TEXT_FOOTER = '#4A5568'
const WHITE = '#FFFFFF'
const CELL_BG = '#F7FAFC'
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
  return name.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function getSubtitle(type: string): string {
  if (type === 'EXPERT') return "Niveau Expert"
  if (type === 'AVANCE') return "Niveau Avancé"
  return "Niveau Standard"
}

function getSessionLabel(sessionType: string): string {
  return sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
}

// ═══ Shared Components ═══

function CornerOrnaments() {
  return (
    <>
      <View style={{ position: 'absolute', top: '5mm', left: '5mm' }} fixed>
        <Svg width="50" height="50" viewBox="0 0 50 50">
          <Path d="M0,0 L50,0 L50,3 L3,3 L3,50 L0,50 Z" fill={GOLD} />
          <Path d="M6,6 L40,6 L40,8 L8,8 L8,40 L6,40 Z" fill={NAVY} />
          <Circle cx="12" cy="12" r="2" fill={GOLD} />
        </Svg>
      </View>
      <View style={{ position: 'absolute', top: '5mm', right: '5mm' }} fixed>
        <Svg width="50" height="50" viewBox="0 0 50 50">
          <Path d="M50,0 L0,0 L0,3 L47,3 L47,50 L50,50 Z" fill={GOLD} />
          <Path d="M44,6 L10,6 L10,8 L42,8 L42,40 L44,40 Z" fill={NAVY} />
          <Circle cx="38" cy="12" r="2" fill={GOLD} />
        </Svg>
      </View>
      <View style={{ position: 'absolute', bottom: '5mm', left: '5mm' }} fixed>
        <Svg width="50" height="50" viewBox="0 0 50 50">
          <Path d="M0,50 L50,50 L50,47 L3,47 L3,0 L0,0 Z" fill={GOLD} />
          <Path d="M6,44 L40,44 L40,42 L8,42 L8,10 L6,10 Z" fill={NAVY} />
          <Circle cx="12" cy="38" r="2" fill={GOLD} />
        </Svg>
      </View>
      <View style={{ position: 'absolute', bottom: '5mm', right: '5mm' }} fixed>
        <Svg width="50" height="50" viewBox="0 0 50 50">
          <Path d="M50,50 L0,50 L0,47 L47,47 L47,0 L50,0 Z" fill={GOLD} />
          <Path d="M44,44 L10,44 L10,42 L42,42 L42,10 L44,10 Z" fill={NAVY} />
          <Circle cx="38" cy="38" r="2" fill={GOLD} />
        </Svg>
      </View>
    </>
  )
}

function TripleBorder() {
  return (
    <>
      <View style={{ position: 'absolute', top: '8mm', left: '8mm', right: '8mm', bottom: '8mm', borderWidth: 2, borderColor: GOLD, borderStyle: 'solid' }} />
      <View style={{ position: 'absolute', top: '11mm', left: '11mm', right: '11mm', bottom: '11mm', borderWidth: 0.5, borderColor: NAVY, borderStyle: 'solid' }} />
      <View style={{ position: 'absolute', top: '13mm', left: '13mm', right: '13mm', bottom: '13mm', borderWidth: 0.3, borderColor: GOLD, borderStyle: 'solid' }} />
    </>
  )
}

function Diamonds() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <View style={{ width: 7, height: 7, backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
      <View style={{ width: 9, height: 9, backgroundColor: NAVY, transform: 'rotate(45deg)' }} />
      <View style={{ width: 7, height: 7, backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
    </View>
  )
}

function Seal() {
  const cx = 40, cy = 40, r = 32
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <Svg width={90} height={90} viewBox="0 0 80 80">
        {/* Outer gold ring (double line) */}
        <Circle cx={cx} cy={cy} r={r} fill={NAVY} />
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="2.5" />
        <Circle cx={cx} cy={cy} r={r - 3} fill="none" stroke={GOLD} strokeWidth="1" />
        {/* Inner ring */}
        <Circle cx={cx} cy={cy} r={r - 7} fill="none" stroke={GOLD} strokeWidth="0.6" />
        
        {/* Decorative dots ring (between outer and inner) */}
        {Array.from({ length: 32 }).map((_, i) => {
          const a = (i * 360) / 32
          const rad = (a * Math.PI) / 180
          const dr = r - 5
          return <Circle key={i} cx={cx + dr * Math.cos(rad)} cy={cy + dr * Math.sin(rad)} r="0.5" fill={GOLD} />
        })}

        {/* Top arc text "CERTIFICAT" (simulated with dots above star) */}
        {Array.from({ length: 7 }).map((_, i) => {
          const angle = -90 + (i - 3) * 8
          const rad = (angle * Math.PI) / 180
          const dr = r - 10
          return <Circle key={`t${i}`} cx={cx + dr * Math.cos(rad)} cy={cy + dr * Math.sin(rad)} r="0.8" fill={GOLD} />
        })}

        {/* Center star (5-pointed, larger) */}
        {Array.from({ length: 10 }).map((_, i) => {
          const outerR = 8
          const innerR = 3.2
          const ri = i % 2 === 0 ? outerR : innerR
          const a1 = (Math.PI / 5) * i - Math.PI / 2
          const a2 = (Math.PI / 5) * (i + 1) - Math.PI / 2
          return <Polygon key={`s${i}`} points={`${cx},${cy - 10} ${cx + ri * Math.cos(a1)},${cy - 10 + ri * Math.sin(a1)} ${cx + ri * Math.cos(a2)},${cy - 10 + ri * Math.sin(a2)}`} fill={GOLD} />
        })}

        {/* SECT text */}
        <Text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fontFamily="Inter" fontWeight="bold" fill={WHITE}>SECT</Text>
        {/* CERTIFIÉ text */}
        <Text x={cx} y={cy + 13} textAnchor="middle" fontSize="5.5" fontFamily="Inter" fontWeight="bold" fill={GOLD} letterSpacing="1">CERTIFIÉ</Text>
        
        {/* Bottom decorative line */}
        <Path d={`M ${cx - 12} ${cy + 18} L ${cx + 12} ${cy + 18}`} stroke={GOLD} strokeWidth="0.5" />
        {/* Small dots on each side of the line */}
        <Circle cx={cx - 15} cy={cy + 18} r="0.8" fill={GOLD} />
        <Circle cx={cx + 15} cy={cy + 18} r="0.8" fill={GOLD} />
      </Svg>
    </View>
  )
}

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    return <View style={{ alignItems: 'center', marginBottom: 3 }}><Text style={{ fontSize: 14, fontFamily: 'PlayfairDisplay', color: NAVY }}>{nom}</Text></View>
  }
  return <View style={{ alignItems: 'center', marginBottom: 3 }}><Image src={logo} style={{ width: 120, height: 50, objectFit: 'contain' as const }} alt="" /></View>
}

// ═══ Shared data builder ═══

function buildSharedData(data: CertificatPDFData) {
  return {
    studentName: capitalizeName(data.etudiantNom),
    subtitle: getSubtitle(data.type),
    sessionLabel: getSessionLabel(data.sessionType),
    location: [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', '),
    footerText: `Émis le ${formatDate(data.dateEmission)}  |  Code: ${data.codeVerification}  |  Vérification: ${data.verificationUrl}`,
    studentParts: [
      data.etudiantMatricule ? `Matricule : ${data.etudiantMatricule}` : null,
      data.etudiantNiveau ? `Niveau : ${data.etudiantNiveau}` : null,
    ].filter(Boolean),
    infos: [
      { label: 'CODE UE', value: data.ueCode, highlight: false },
      { label: 'FILIÈRE', value: data.filiereNom, highlight: false },
      { label: 'NOTE', value: `${formatNote(data.noteFinale)}/20`, highlight: true },
      { label: 'MENTION', value: data.mention || '—', highlight: true },
      { label: 'SESSION', value: getSessionLabel(data.sessionType), highlight: false },
      { label: 'ANNÉE', value: data.anneeAcademique || '—', highlight: false },
    ],
  }
}

// ═══ Landscape (842×595) ═══

const landscapeStyles = StyleSheet.create({
  page: { width: 842, height: 595, backgroundColor: WHITE, position: 'relative' },
  content: { position: 'absolute', top: '42pt', left: '50pt', right: '50pt', bottom: '42pt', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  universityName: { fontSize: 10, color: GOLD, letterSpacing: 3, marginBottom: 1 },
  universityCity: { fontSize: 9, color: TEXT_GRAY, marginBottom: 4 },
  titleMain: { fontFamily: 'PlayfairDisplay', fontSize: 32, color: NAVY, letterSpacing: 4, marginVertical: 3 },
  titleSub: { fontFamily: 'PlayfairDisplay', fontSize: 20, color: TEXT_DARK, letterSpacing: 2, marginBottom: 6 },
  intro: { fontSize: 12, color: TEXT_DARK, fontStyle: 'italic', marginTop: 6, marginBottom: 4 },
  studentName: { fontFamily: 'GreatVibes', fontSize: 48, color: '#1A1A1A', textAlign: 'center', marginBottom: 2 },
  studentInfo: { fontSize: 10, color: TEXT_GRAY, marginBottom: 6 },
  ueIntro: { fontSize: 11, color: TEXT_DARK, marginBottom: 2 },
  ueName: { fontFamily: 'PlayfairDisplay', fontSize: 24, color: GOLD, fontWeight: 'bold', marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 10, width: '78%' },
  infoCell: { width: '30%', padding: 10, marginBottom: 6, borderRadius: 4, backgroundColor: CELL_BG, borderWidth: 0.5, borderColor: '#E2E8F0', borderStyle: 'solid' },
  infoCellHl: { width: '30%', padding: 10, marginBottom: 6, borderRadius: 4, backgroundColor: GOLD_LIGHT, borderWidth: 1, borderColor: GOLD_BORDER, borderStyle: 'solid' },
  cellContent: { alignItems: 'center' },
  label: { fontSize: 7, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, textAlign: 'center' },
  value: { fontSize: 13, color: '#0D1B2A', fontWeight: 'bold', textAlign: 'center' },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', marginTop: 12, paddingHorizontal: 20 },
  sigCol: { width: '28%', alignItems: 'center' },
  sigCenter: { width: '28%', alignItems: 'center', justifyContent: 'center' },
  sigSpace: { height: 45, borderBottom: `1pt solid ${SIG_LINE}`, width: '100%', marginBottom: 6 },
  sigLabel: { fontSize: 9, color: TEXT_GRAY, textAlign: 'center' },
  sigName: { fontSize: 10, color: TEXT_DARK, fontWeight: 'bold', textAlign: 'center', marginTop: 1 },
  footer: { marginTop: 10, paddingTop: 6, borderTop: `1pt solid ${GOLD}`, textAlign: 'center' },
  footerText: { fontSize: 8, color: TEXT_FOOTER, textAlign: 'center' },
})

export function CertificateLandscape({ data }: { data: CertificatPDFData }) {
  const s = buildSharedData(data)
  return (
    <Document>
      <Page size={[842, 595]} style={landscapeStyles.page}>
        <CornerOrnaments />
        <TripleBorder />
        <View style={landscapeStyles.content}>
          <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
          <Text style={landscapeStyles.universityName}>{data.etablissementNom.toUpperCase()}</Text>
          {s.location ? <Text style={landscapeStyles.universityCity}>{s.location}</Text> : null}
          <Text style={landscapeStyles.titleMain}>CERTIFICAT DE RÉUSSITE</Text>
          <Text style={landscapeStyles.titleSub}>{s.subtitle}</Text>
          <Diamonds />
          <Text style={landscapeStyles.intro}>Nous certifions par la présente que</Text>
          <Text style={landscapeStyles.studentName}>{s.studentName}</Text>
          {s.studentParts.length > 0 ? <Text style={landscapeStyles.studentInfo}>{s.studentParts.join('  •  ')}</Text> : null}
          <Text style={landscapeStyles.ueIntro}>a validé avec succès l&apos;unité d&apos;enseignement</Text>
          <Text style={landscapeStyles.ueName}>{data.ueNom}</Text>
          <View style={landscapeStyles.infoGrid}>
            {s.infos.map((info, i) => (
              <View key={i} style={info.highlight ? landscapeStyles.infoCellHl : landscapeStyles.infoCell}>
                <View style={landscapeStyles.cellContent}>
                  <Text style={landscapeStyles.label}>{info.label}</Text>
                  <Text style={landscapeStyles.value}>{info.value}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={landscapeStyles.sigRow}>
            <View style={landscapeStyles.sigCol}>
              <View style={landscapeStyles.sigSpace} />
              <Text style={landscapeStyles.sigLabel}>Signature de l&apos;enseignant</Text>
            </View>
            <View style={landscapeStyles.sigCenter}>
              <Seal />
            </View>
            <View style={landscapeStyles.sigCol}>
              <View style={landscapeStyles.sigSpace} />
              {data.responsableNom ? <Text style={landscapeStyles.sigName}>{data.responsableNom}</Text> : null}
              <Text style={landscapeStyles.sigLabel}>Le Responsable pédagogique</Text>
            </View>
          </View>
          <View style={landscapeStyles.footer}>
            <Text style={landscapeStyles.footerText}>{s.footerText}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Portrait (595×842) ═══

const portraitStyles = StyleSheet.create({
  page: { width: 595, height: 842, backgroundColor: WHITE, position: 'relative' },
  content: { position: 'absolute', top: '50pt', left: '42pt', right: '42pt', bottom: '50pt', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  universityName: { fontSize: 10, color: GOLD, letterSpacing: 3, marginBottom: 1 },
  universityCity: { fontSize: 9, color: TEXT_GRAY, marginBottom: 6 },
  titleMain: { fontFamily: 'PlayfairDisplay', fontSize: 30, color: NAVY, letterSpacing: 4, marginVertical: 4 },
  titleSub: { fontFamily: 'PlayfairDisplay', fontSize: 20, color: TEXT_DARK, letterSpacing: 2, marginBottom: 8 },
  intro: { fontSize: 12, color: TEXT_DARK, fontStyle: 'italic', marginTop: 8, marginBottom: 4 },
  studentName: { fontFamily: 'GreatVibes', fontSize: 48, color: '#1A1A1A', textAlign: 'center', marginBottom: 2 },
  studentInfo: { fontSize: 10, color: TEXT_GRAY, marginBottom: 8 },
  ueIntro: { fontSize: 11, color: TEXT_DARK, marginBottom: 2 },
  ueName: { fontFamily: 'PlayfairDisplay', fontSize: 24, color: GOLD, fontWeight: 'bold', marginBottom: 14 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 14, width: '85%' },
  infoCell: { width: '47%', padding: 10, marginBottom: 8, borderRadius: 4, backgroundColor: CELL_BG, borderWidth: 0.5, borderColor: '#E2E8F0', borderStyle: 'solid' },
  infoCellHl: { width: '47%', padding: 10, marginBottom: 8, borderRadius: 4, backgroundColor: GOLD_LIGHT, borderWidth: 1, borderColor: GOLD_BORDER, borderStyle: 'solid' },
  cellContent: { alignItems: 'center' },
  label: { fontSize: 7, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, textAlign: 'center' },
  value: { fontSize: 13, color: '#0D1B2A', fontWeight: 'bold', textAlign: 'center' },
  sigContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', marginTop: 14, paddingHorizontal: 10 },
  sigBlock: { width: '28%', alignItems: 'center' },
  sigCenter: { width: '28%', alignItems: 'center', justifyContent: 'center' },
  sigSpace: { height: 45, borderBottom: `1pt solid ${SIG_LINE}`, width: '100%', marginBottom: 6 },
  sigLabel: { fontSize: 9, color: TEXT_GRAY, textAlign: 'center' },
  sigName: { fontSize: 10, color: TEXT_DARK, fontWeight: 'bold', textAlign: 'center', marginTop: 1 },
  footer: { marginTop: 16, paddingTop: 8, borderTop: `1pt solid ${GOLD}`, textAlign: 'center' },
  footerText: { fontSize: 8, color: TEXT_FOOTER, textAlign: 'center' },
})

export function CertificatePortrait({ data }: { data: CertificatPDFData }) {
  const s = buildSharedData(data)
  return (
    <Document>
      <Page size={[595, 842]} style={portraitStyles.page}>
        <CornerOrnaments />
        <TripleBorder />
        <View style={portraitStyles.content}>
          <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
          <Text style={portraitStyles.universityName}>{data.etablissementNom.toUpperCase()}</Text>
          {s.location ? <Text style={portraitStyles.universityCity}>{s.location}</Text> : null}
          <Text style={portraitStyles.titleMain}>CERTIFICAT DE RÉUSSITE</Text>
          <Text style={portraitStyles.titleSub}>{s.subtitle}</Text>
          <Diamonds />
          <Text style={portraitStyles.intro}>Nous certifions par la présente que</Text>
          <Text style={portraitStyles.studentName}>{s.studentName}</Text>
          {s.studentParts.length > 0 ? <Text style={portraitStyles.studentInfo}>{s.studentParts.join('  •  ')}</Text> : null}
          <Text style={portraitStyles.ueIntro}>a validé avec succès l&apos;unité d&apos;enseignement</Text>
          <Text style={portraitStyles.ueName}>{data.ueNom}</Text>
          <View style={portraitStyles.infoGrid}>
            {s.infos.map((info, i) => (
              <View key={i} style={info.highlight ? portraitStyles.infoCellHl : portraitStyles.infoCell}>
                <View style={portraitStyles.cellContent}>
                  <Text style={portraitStyles.label}>{info.label}</Text>
                  <Text style={portraitStyles.value}>{info.value}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={portraitStyles.sigContainer}>
            <View style={portraitStyles.sigBlock}>
              <View style={portraitStyles.sigSpace} />
              <Text style={portraitStyles.sigLabel}>Signature de l&apos;enseignant</Text>
            </View>
            <View style={portraitStyles.sigCenter}>
              <Seal />
            </View>
            <View style={portraitStyles.sigBlock}>
              <View style={portraitStyles.sigSpace} />
              {data.responsableNom ? <Text style={portraitStyles.sigName}>{data.responsableNom}</Text> : null}
              <Text style={portraitStyles.sigLabel}>Le Responsable pédagogique</Text>
            </View>
          </View>
          <View style={portraitStyles.footer}>
            <Text style={portraitStyles.footerText}>{s.footerText}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Dispatcher ═══

export function CertificateDocument({ data, orientation = 'landscape' }: { data: CertificatPDFData; orientation?: 'landscape' | 'portrait' }) {
  return orientation === 'portrait' ? <CertificatePortrait data={data} /> : <CertificateLandscape data={data} />
}

export async function renderCertificatPDF(data: CertificatPDFData, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<Buffer> {
  return await renderToBuffer(<CertificateDocument data={data} orientation={orientation} />)
}
