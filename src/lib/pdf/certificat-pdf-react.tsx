/**
 * Certificate PDF Document — Modern Elegant Design (Landscape A4)
 *
 * Built with @react-pdf/renderer for React-based PDF generation.
 * Inspired by the user's reference template: diagonal corner bands,
 * navy + gold palette, mixed typography (serif title + script name +
 * sans-serif body), central seal, two-column signature.
 *
 * Font registration happens at module load. The component is rendered
 * server-side via renderToBuffer in the API route.
 */

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
  Svg,
  Polygon,
  renderToBuffer,
  type Styles,
} from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'

// ─── Font Registration (server-side, reads bundled TTF files) ───

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

function registerFonts() {
  try {
    // Playfair Display — elegant serif for the certificate title
    Font.register({
      family: 'PlayfairDisplay',
      fonts: [
        { src: path.join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'), fontWeight: 'normal' },
      ],
    })
    // Great Vibes — script/cursive for the student name (handwriting style)
    Font.register({
      family: 'GreatVibes',
      fonts: [
        { src: path.join(FONTS_DIR, 'GreatVibes-Regular.ttf'), fontWeight: 'normal' },
      ],
    })
    // Inter — modern sans-serif for body text (Regular + Italic variable fonts
    // cover all weights via the variable font axes)
    Font.register({
      family: 'Inter',
      fonts: [
        { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'normal' },
        { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'bold' },
        { src: path.join(FONTS_DIR, 'Inter-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
      ],
    })
  } catch (err) {
    console.error('[certificat-pdf-react] Font registration failed:', err)
  }
}

registerFonts()

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

// ─── Color helpers ───

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, '').trim()
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ]
}

function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function mixWithWhite(c: [number, number, number], ratio: number): string {
  return `rgb(${Math.round(c[0] * ratio + 255 * (1 - ratio))},${Math.round(c[1] * ratio + 255 * (1 - ratio))},${Math.round(c[2] * ratio + 255 * (1 - ratio))})`
}

function resolveColors(template: CertificatTemplateData | null | undefined) {
  const primary = (template?.primaryColor && /^#?[0-9a-fA-F]{6}$/.test(template.primaryColor))
    ? hexToRgb(template.primaryColor)
    : [27, 58, 92] as [number, number, number] // navy #1B3A5C
  const accent = (template?.accentColor && /^#?[0-9a-fA-F]{6}$/.test(template.accentColor))
    ? hexToRgb(template.accentColor)
    : [244, 185, 66] as [number, number, number] // gold #F4B942
  return { primary, accent }
}

// ─── Styles ───

function buildStyles(primary: [number, number, number], accent: [number, number, number]): Styles {
  const primaryStr = rgbStr(primary)
  const accentStr = rgbStr(accent)

  return StyleSheet.create({
    // Page (A4 landscape)
    page: {
      width: '297mm',
      height: '210mm',
      backgroundColor: '#F8F9FA', // Fond très léger
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter',
    },

    // Corner SVG containers (positioned at each corner)
    cornerTL: { position: 'absolute', top: 0, left: 0 },
    cornerTR: { position: 'absolute', top: 0, right: 0 },
    cornerBL: { position: 'absolute', bottom: 0, left: 0 },
    cornerBR: { position: 'absolute', bottom: 0, right: 0 },

    // Borders (double frame)
    borderOuter: {
      position: 'absolute',
      top: '8mm',
      left: '8mm',
      right: '8mm',
      bottom: '8mm',
      borderWidth: 1.2,
      borderColor: primaryStr,
      borderStyle: 'solid',
    },
    borderInner: {
      position: 'absolute',
      top: '12mm',
      left: '12mm',
      right: '12mm',
      bottom: '12mm',
      borderWidth: 0.4,
      borderColor: accentStr,
      borderStyle: 'solid',
    },

    // Content container (inside borders)
    content: {
      position: 'absolute',
      top: '18mm',
      left: '20mm',
      right: '20mm',
      bottom: '18mm',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },

    // Establishment name
    establishment: {
      fontSize: 13,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      color: primaryStr,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginBottom: 2,
    },
    location: {
      fontSize: 9,
      color: '#7F8C8D',
      marginBottom: 8,
    },

    // Diamond separator
    diamonds: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    diamond: {
      width: 5,
      height: 5,
      transform: 'rotate(45deg)',
    },
    diamondPrimary: { backgroundColor: primaryStr },
    diamondAccent: { backgroundColor: accentStr, width: 7, height: 7 },

    // Title
    title: {
      fontSize: 38,
      fontFamily: 'PlayfairDisplay',
      color: '#2C3E50',
      textAlign: 'center',
      lineHeight: 1,
    },
    subtitle: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay',
      color: '#2C3E50',
      textAlign: 'center',
      marginTop: 2,
      marginBottom: 6,
    },
    typeLabel: {
      fontSize: 11,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      color: accentStr,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 10,
    },

    // Intro text
    intro: {
      fontSize: 11,
      color: '#7F8C8D',
      fontStyle: 'italic',
      marginBottom: 6,
    },

    // Student name (script font!)
    studentName: {
      fontSize: 36,
      fontFamily: 'GreatVibes',
      color: '#2C3E50',
      textAlign: 'center',
      marginBottom: 4,
    },
    studentInfo: {
      fontSize: 9,
      color: '#7F8C8D',
      marginBottom: 8,
    },

    // UE section
    ueIntro: {
      fontSize: 10,
      color: '#7F8C8D',
      fontStyle: 'italic',
      marginBottom: 4,
    },
    ueName: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay',
      color: primaryStr,
      textAlign: 'center',
      marginBottom: 2,
    },
    ueCode: {
      fontSize: 9,
      color: '#7F8C8D',
      marginBottom: 8,
    },

    // Details box
    detailsBox: {
      width: '70%',
      backgroundColor: mixWithWhite(primary, 0.05),
      borderWidth: 0.5,
      borderColor: '#7F8C8D',
      borderRadius: 3,
      padding: '8px 12px',
      marginBottom: 8,
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    detailItem: {
      width: '50%',
      display: 'flex',
      flexDirection: 'row',
      marginBottom: 3,
    },
    detailLabel: {
      fontSize: 8,
      color: accentStr,
      fontWeight: 'bold',
      marginRight: 4,
    },
    detailValue: {
      fontSize: 8,
      color: '#2C3E50',
    },

    // Date
    date: {
      fontSize: 9,
      color: '#7F8C8D',
      marginBottom: 8,
    },

    // Signature row
    signatureRow: {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      width: '80%',
      marginTop: 'auto',
    },
    signatureCol: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '35%',
    },
    signatureName: {
      fontSize: 10,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      color: primaryStr,
      marginBottom: 2,
    },
    signatureLine: {
      width: '100%',
      borderWidth: 0,
      borderBottomWidth: 0.6,
      borderBottomColor: primaryStr,
      borderBottomStyle: 'solid',
      marginBottom: 2,
    },
    signatureLabel: {
      fontSize: 7,
      color: '#7F8C8D',
    },

    // Seal (center, between signatures)
    seal: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 1.5,
      borderColor: accentStr,
      backgroundColor: mixWithWhite(primary, 0.08),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    sealInner: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 0.5,
      borderColor: primaryStr,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sealStar: {
      fontSize: 10,
      color: accentStr,
      marginBottom: 0,
    },
    sealText: {
      fontSize: 9,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      color: primaryStr,
    },
    sealSubtext: {
      fontSize: 5,
      color: accentStr,
      fontWeight: 'bold',
    },

    // Verification (bottom)
    verification: {
      position: 'absolute',
      bottom: '6mm',
      left: '20mm',
      right: '20mm',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      fontSize: 7,
      color: '#7F8C8D',
    },
    verificationItem: {
      display: 'flex',
      flexDirection: 'row',
      gap: 3,
    },
    verificationLabel: { color: '#7F8C8D' },
    verificationValue: { color: primaryStr, fontWeight: 'bold' },

    // Footer
    footer: {
      position: 'absolute',
      bottom: '3mm',
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 5,
      color: '#7F8C8D',
    },
  })
}

// ─── Date format helper ───

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

// ─── Certificate Document Component ───

export function CertificateDocument({ data }: { data: CertificatPDFData }) {
  const { primary, accent } = resolveColors(data.template ?? null)
  const styles = buildStyles(primary, accent)

  const typeLabel = data.type === 'EXCELLENCE' ? 'Excellence'
    : data.type === 'ACCOMPLISSEMENT' ? 'Accomplissement'
    : 'Participation'

  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')

  const details = [
    { label: 'Filière', value: `${data.filiereNom}${data.filiereCode ? ` (${data.filiereCode})` : ''}` },
    { label: 'Note finale', value: `${formatNote(data.noteFinale)}/20${data.mention ? ` — ${data.mention}` : ''}` },
    { label: 'Session', value: data.sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale' },
    { label: 'Crédits ECTS', value: data.creditsECTS ? `${data.creditsECTS} crédits` : 'N/A' },
  ]
  if (data.anneeAcademique) details.push({ label: 'Année', value: data.anneeAcademique })

  const matriculeOk = !!data.etudiantMatricule && data.etudiantMatricule.trim() !== ''
  const niveauOk = !!data.etudiantNiveau && data.etudiantNiveau.trim() !== ''
  const studentParts: string[] = []
  if (matriculeOk) studentParts.push(`Matricule: ${data.etudiantMatricule}`)
  if (niveauOk) studentParts.push(`Niveau: ${data.etudiantNiveau}`)

  return (
    <Document>
      <Page size={[842, 595]} style={styles.page}>
        {/* Corner bands — SVG diagonal triangles (4 corners × 2 layers) */}
        {/* Top-left: primary triangle (60mm) + accent triangle (38mm) */}
        <View style={styles.cornerTL} fixed>
          <Svg width="170" height="170" viewBox="0 0 60 60">
            <Polygon points="0,0 60,0 0,60" fill={rgbStr(primary)} />
            <Polygon points="0,0 38,0 0,38" fill={rgbStr(accent)} />
          </Svg>
        </View>
        {/* Top-right */}
        <View style={styles.cornerTR} fixed>
          <Svg width="170" height="170" viewBox="0 0 60 60">
            <Polygon points="60,0 60,60 0,0" fill={rgbStr(primary)} />
            <Polygon points="60,0 60,38 22,0" fill={rgbStr(accent)} />
          </Svg>
        </View>
        {/* Bottom-left */}
        <View style={styles.cornerBL} fixed>
          <Svg width="170" height="170" viewBox="0 0 60 60">
            <Polygon points="0,60 60,60 0,0" fill={rgbStr(primary)} />
            <Polygon points="0,60 38,60 0,22" fill={rgbStr(accent)} />
          </Svg>
        </View>
        {/* Bottom-right */}
        <View style={styles.cornerBR} fixed>
          <Svg width="170" height="170" viewBox="0 0 60 60">
            <Polygon points="60,60 0,60 60,0" fill={rgbStr(primary)} />
            <Polygon points="60,60 22,60 60,22" fill={rgbStr(accent)} />
          </Svg>
        </View>

        {/* Double border */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* Content */}
        <View style={styles.content}>
          {/* Establishment */}
          <Text style={styles.establishment}>{data.etablissementNom}</Text>
          {location ? <Text style={styles.location}>{location}</Text> : null}

          {/* Diamond separator */}
          <View style={styles.diamonds}>
            <View style={[styles.diamond, styles.diamondPrimary]} />
            <View style={[styles.diamond, styles.diamondAccent]} />
            <View style={[styles.diamond, styles.diamondPrimary]} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Certificat</Text>
          <Text style={styles.subtitle}>d&apos;{data.type === 'EXCELLENCE' ? 'Excellence' : data.type === 'ACCOMPLISSEMENT' ? 'Accomplissement' : 'Participation'}</Text>
          <Text style={styles.typeLabel}>{typeLabel}</Text>

          {/* Intro */}
          <Text style={styles.intro}>Nous certifions par la présente que</Text>

          {/* Student name (SCRIPT FONT) */}
          <Text style={styles.studentName}>{data.etudiantNom}</Text>
          {studentParts.length > 0 ? <Text style={styles.studentInfo}>{studentParts.join('  •  ')}</Text> : null}

          {/* UE */}
          <Text style={styles.ueIntro}>a validé avec succès l&apos;unité d&apos;enseignement</Text>
          <Text style={styles.ueName}>{data.ueNom}</Text>
          <Text style={styles.ueCode}>Code: {data.ueCode}</Text>

          {/* Details box */}
          <View style={styles.detailsBox}>
            {details.map((d, i) => (
              <View key={i} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{d.label}:</Text>
                <Text style={styles.detailValue}>{d.value}</Text>
              </View>
            ))}
          </View>

          {/* Date */}
          <Text style={styles.date}>Émis le {formatDate(data.dateEmission)}</Text>

          {/* Signature row */}
          <View style={styles.signatureRow}>
            <View style={styles.signatureCol}>
              {data.responsableNom ? <Text style={styles.signatureName}>{data.responsableNom}</Text> : null}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Le Responsable pédagogique</Text>
            </View>

            {/* Seal */}
            <View style={styles.seal}>
              <View style={styles.sealInner}>
                <Text style={styles.sealStar}>★</Text>
                <Text style={styles.sealText}>SECT</Text>
                <Text style={styles.sealSubtext}>CERTIFIÉ</Text>
              </View>
            </View>

            <View style={styles.signatureCol}>
              <Text style={styles.signatureName}>{formatDate(data.dateEmission)}</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Date</Text>
            </View>
          </View>
        </View>

        {/* Verification (bottom) */}
        <View style={styles.verification}>
          <View style={styles.verificationItem}>
            <Text style={styles.verificationLabel}>Vérification:</Text>
            <Text style={styles.verificationValue}>{data.verificationUrl}</Text>
          </View>
          <View style={styles.verificationItem}>
            <Text style={styles.verificationLabel}>Code:</Text>
            <Text style={styles.verificationValue}>{data.codeVerification}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          SECT — Système d&apos;Évaluation Casse-Tête · {data.statut === 'EMIS' ? 'Certificat valide' : 'Certificat révoqué'}
        </Text>
      </Page>
    </Document>
  )
}

/**
 * Render the certificate PDF to a Node.js Buffer.
 * This function encapsulates the JSX so the API route (.ts file) can call
 * it without needing a .tsx extension.
 */
export async function renderCertificatPDF(data: CertificatPDFData): Promise<Buffer> {
  return await renderToBuffer(<CertificateDocument data={data} />)
}
