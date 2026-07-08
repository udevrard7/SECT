/**
 * certificat-pdf-react.tsx — Certificat académique institutionnel (refonte 2025)
 *
 * Design épuré et lisible, inspiré des certificats des grandes institutions
 * universitaires (Sorbonne, Harvard, MIT). Remplace l'ancien modèle qui était
 * illisible (trop d'éléments SVG complexes : Seal, CornerOrnaments, GradeBar,
 * WatermarkBackground, etc. qui ne se rendaient pas correctement dans
 * @react-pdf/renderer).
 *
 * Principes de design :
 * - Layout paysage A4 (842×595pt) centré et aéré
 * - Bordure double simple (gold + navy) — pas de SVG, juste des bordures CSS
 * - Typographie claire : PlayfairDisplay (titres), GreatVibes (nom), Inter (corps)
 * - Aucun SVG complexe — uniquement Views/Texts/Images
 * - QR code de vérification généré côté route API (qrcode.toDataURL)
 * - Grille d'infos 2×3 propre et alignée
 * - Signatures espacées et lisibles
 *
 * Palette : navy #1B3A5C, gold #C5A044, text #2C3E50, gray #718096
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, Font, StyleSheet,
  renderToBuffer,
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
  qrCodeDataUri?: string | null
  watermarkConfig?: {
    text: string
    enabled: boolean
    opacity: number
    color: string
    pattern: string
  } | null
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

/**
 * Type alias for @react-pdf/renderer's `Image` that also accepts an `alt` prop.
 * (Voir commentaire dans l'ancien fichier — conservé pour compat ESLint.)
 */
const PdfImage = Image as unknown as React.FC<React.ComponentProps<typeof Image> & { alt?: string }>

// ═══ Styles ═══

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    backgroundColor: WHITE,
    color: TEXT_DARK,
    position: 'relative',
  },
  // Bordure double simple (gold + navy) — pas de SVG
  borderOuter: {
    position: 'absolute',
    top: 30,
    left: 30,
    right: 30,
    bottom: 30,
    borderWidth: 2.5,
    borderColor: GOLD,
    borderStyle: 'solid',
  },
  borderInner: {
    position: 'absolute',
    top: 38,
    left: 38,
    right: 38,
    bottom: 38,
    borderWidth: 0.5,
    borderColor: NAVY,
    borderStyle: 'solid',
  },
  // Contenu principal avec padding
  content: {
    flex: 1,
    paddingHorizontal: 70,
    paddingVertical: 55,
    flexDirection: 'column',
  },
  // En-tête établissement
  header: {
    alignItems: 'center',
    marginBottom: 25,
  },
  etabLogo: {
    width: 140,
    height: 55,
    objectFit: 'contain',
    marginBottom: 6,
  },
  etabName: {
    fontSize: 15,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 2,
  },
  etabLocation: {
    fontSize: 10,
    color: TEXT_GRAY,
    textAlign: 'center',
    letterSpacing: 1,
  },
  // Titre "CERTIFICAT"
  titleSection: {
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 42,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    textAlign: 'center',
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 13,
    color: GOLD,
    textAlign: 'center',
    letterSpacing: 8,
    marginTop: 4,
    fontWeight: 'bold',
  },
  // Losange décoratif central
  diamond: {
    width: 8,
    height: 8,
    backgroundColor: GOLD,
    transform: 'rotate(45deg)',
    marginVertical: 12,
  },
  // "Décerné à"
  awardedTo: {
    fontSize: 11,
    color: TEXT_GRAY,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  // Nom de l'étudiant (GreatVibes — élégant script)
  studentName: {
    fontSize: 36,
    fontFamily: 'GreatVibes',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 12,
  },
  // Ligne décorative sous le nom
  nameUnderline: {
    width: 200,
    height: 1,
    backgroundColor: GOLD,
    marginBottom: 12,
  },
  // Description
  description: {
    fontSize: 12,
    color: TEXT_DARK,
    textAlign: 'center',
    lineHeight: 1.6,
    marginBottom: 8,
  },
  intitule: {
    fontSize: 14,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  // Mention (si présente)
  mention: {
    fontSize: 13,
    color: GOLD,
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 2,
  },
  // Grille d'informations
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 4,
    overflow: 'hidden',
  },
  infoCell: {
    width: '50%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: CELL_BG,
  },
  infoCellLastRow: {
    borderBottomWidth: 0,
  },
  infoCellLastCol: {
    borderRightWidth: 0,
  },
  infoLabel: {
    fontSize: 8,
    color: TEXT_GRAY,
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 11,
    color: TEXT_DARK,
    fontWeight: 'bold',
  },
  // Pied de page : 3 colonnes
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginTop: 'auto',
  },
  footerLeft: {
    width: '30%',
    alignItems: 'center',
  },
  footerCenter: {
    width: '30%',
    alignItems: 'center',
  },
  footerRight: {
    width: '30%',
    alignItems: 'center',
  },
  // Date
  dateLabel: {
    fontSize: 8,
    color: TEXT_GRAY,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dateValue: {
    fontSize: 11,
    color: TEXT_DARK,
    fontWeight: 'bold',
  },
  signatureLine: {
    width: 120,
    height: 1,
    backgroundColor: SIG_LINE,
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 10,
    color: TEXT_DARK,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 1,
  },
  signatureRole: {
    fontSize: 8,
    color: TEXT_GRAY,
    textAlign: 'center',
  },
  // QR code
  qrCode: {
    width: 70,
    height: 70,
    marginBottom: 4,
  },
  qrCodeText: {
    fontSize: 7,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  qrCodeLabel: {
    fontSize: 6,
    color: TEXT_GRAY,
    textAlign: 'center',
  },
  // Footer établissement (tout en bas)
  etabFooter: {
    position: 'absolute',
    bottom: 20,
    left: 70,
    right: 70,
    alignItems: 'center',
  },
  etabFooterLine: {
    width: '100%',
    height: 0.5,
    backgroundColor: GOLD,
    marginBottom: 6,
  },
  etabFooterText: {
    fontSize: 8,
    color: TEXT_FOOTER,
    textAlign: 'center',
  },
})

// ═══ Composants ═══

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    return <Text style={styles.etabName}>{nom}</Text>
  }
  return <PdfImage src={logo} style={styles.etabLogo} alt="" />
}

function InfoCell({
  label,
  value,
  isLastRow = false,
  isLastCol = false,
}: {
  label: string
  value: string
  isLastRow?: boolean
  isLastCol?: boolean
}) {
  // Spread conditionnel (compatible avec le typing strict de @react-pdf/renderer)
  const cellStyle = {
    ...styles.infoCell,
    ...(isLastRow ? { borderBottomWidth: 0 } : {}),
    ...(isLastCol ? { borderRightWidth: 0 } : {}),
  }
  return (
    <View style={cellStyle}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function QRCodeBox({ dataUri, code }: { dataUri: string | null | undefined; code: string }) {
  if (!dataUri) {
    return (
      <View style={styles.footerCenter}>
        <Text style={styles.dateLabel}>Code de vérification</Text>
        <Text style={styles.qrCodeText}>{code}</Text>
        <Text style={styles.qrCodeLabel}>Scannez ou visitez l'URL de vérification</Text>
      </View>
    )
  }
  return (
    <View style={styles.footerCenter}>
      <PdfImage src={dataUri} style={styles.qrCode} alt="QR code de vérification" />
      <Text style={styles.qrCodeText}>{code}</Text>
      <Text style={styles.qrCodeLabel}>Scannez pour vérifier</Text>
    </View>
  )
}

// ═══ Document principal (Paysage) ═══

function CertificateLandscape({ data }: { data: CertificatPDFData }) {
  const etabLocation = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const intituleText = data.intitule || `${data.ueNom} (${data.ueCode})`

  return (
    <Document>
      <Page size={[842, 595]} style={styles.page}>
        {/* Bordure double */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* Contenu */}
        <View style={styles.content}>
          {/* En-tête établissement */}
          <View style={styles.header}>
            <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
            {etabLocation && <Text style={styles.etabLocation}>{etabLocation}</Text>}
          </View>

          {/* Titre */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>CERTIFICAT</Text>
            <Text style={styles.subtitle}>DE RÉUSSITE</Text>
          </View>

          {/* Losange décoratif */}
          <View style={{ alignItems: 'center' }}>
            <View style={styles.diamond} />
          </View>

          {/* "Décerné à" + nom */}
          <Text style={styles.awardedTo}>Décerné à</Text>
          <Text style={styles.studentName}>{capitalizeName(data.etudiantNom)}</Text>
          <View style={{ alignItems: 'center' }}>
            <View style={styles.nameUnderline} />
          </View>

          {/* Description */}
          <Text style={styles.description}>
            a réussi l'évaluation
          </Text>
          <Text style={styles.intitule}>{intituleText}</Text>
          <Text style={styles.description}>
            avec la note de <Text style={{ fontWeight: 'bold', color: NAVY }}>{formatNote(data.noteFinale)}/20</Text>
            {data.creditsECTS && (
              <Text> · {data.creditsECTS} crédits ECTS</Text>
            )}
          </Text>

          {/* Mention */}
          {data.mention && (
            <Text style={styles.mention}>MENTION : {data.mention}</Text>
          )}

          {/* Grille d'informations */}
          <View style={styles.infoGrid}>
            <InfoCell label="Filière" value={data.filiereCode ? `${data.filiereNom} (${data.filiereCode})` : data.filiereNom} />
            <InfoCell label="Unité d'enseignement" value={`${data.ueCode} — ${data.ueNom}`} isLastCol />
            <InfoCell label="Niveau" value={data.etudiantNiveau || '—'} />
            <InfoCell label="Session" value={getSessionLabel(data.sessionType)} isLastCol />
            <InfoCell label="Année académique" value={data.anneeAcademique || '—'} isLastRow />
            <InfoCell label="Matricule" value={data.etudiantMatricule || '—'} isLastRow isLastCol />
          </View>

          {/* Pied de page : date | QR code | signature */}
          <View style={styles.footer}>
            {/* Date */}
            <View style={styles.footerLeft}>
              <Text style={styles.dateLabel}>Date d'émission</Text>
              <Text style={styles.dateValue}>{formatDate(data.dateEmission)}</Text>
            </View>

            {/* QR code de vérification */}
            <QRCodeBox dataUri={data.qrCodeDataUri} code={data.codeVerification} />

            {/* Signature */}
            <View style={styles.footerRight}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{data.responsableNom || 'Le Responsable'}</Text>
              <Text style={styles.signatureRole}>Responsable de l'établissement</Text>
            </View>
          </View>
        </View>

        {/* Footer établissement */}
        <View style={styles.etabFooter}>
          <View style={styles.etabFooterLine} />
          <Text style={styles.etabFooterText}>
            {data.etablissementNom} · Certificat émis via SECT — Plateforme d'évaluation IA
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Document (Portrait) ═══

function CertificatePortrait({ data }: { data: CertificatPDFData }) {
  const etabLocation = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const intituleText = data.intitule || `${data.ueNom} (${data.ueCode})`

  return (
    <Document>
      <Page size={[595, 842]} style={styles.page}>
        {/* Bordure double */}
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />

        {/* Contenu */}
        <View style={[styles.content, { paddingHorizontal: 55, paddingVertical: 60 }]}>
          {/* En-tête établissement */}
          <View style={styles.header}>
            <Logo logo={data.etablissementLogo} nom={data.etablissementNom} />
            {etabLocation && <Text style={styles.etabLocation}>{etabLocation}</Text>}
          </View>

          {/* Titre */}
          <View style={styles.titleSection}>
            <Text style={[styles.title, { fontSize: 36 }]}>CERTIFICAT</Text>
            <Text style={styles.subtitle}>DE RÉUSSITE</Text>
          </View>

          {/* Losange décoratif */}
          <View style={{ alignItems: 'center' }}>
            <View style={styles.diamond} />
          </View>

          {/* "Décerné à" + nom */}
          <Text style={styles.awardedTo}>Décerné à</Text>
          <Text style={[styles.studentName, { fontSize: 32 }]}>{capitalizeName(data.etudiantNom)}</Text>
          <View style={{ alignItems: 'center' }}>
            <View style={styles.nameUnderline} />
          </View>

          {/* Description */}
          <Text style={styles.description}>
            a réussi l'évaluation
          </Text>
          <Text style={styles.intitule}>{intituleText}</Text>
          <Text style={styles.description}>
            avec la note de <Text style={{ fontWeight: 'bold', color: NAVY }}>{formatNote(data.noteFinale)}/20</Text>
            {data.creditsECTS && (
              <Text> · {data.creditsECTS} crédits ECTS</Text>
            )}
          </Text>

          {/* Mention */}
          {data.mention && (
            <Text style={styles.mention}>MENTION : {data.mention}</Text>
          )}

          {/* Grille d'informations */}
          <View style={[styles.infoGrid, { marginHorizontal: 0 }]}>
            <InfoCell label="Filière" value={data.filiereCode ? `${data.filiereNom} (${data.filiereCode})` : data.filiereNom} />
            <InfoCell label="Unité d'enseignement" value={`${data.ueCode} — ${data.ueNom}`} isLastCol />
            <InfoCell label="Niveau" value={data.etudiantNiveau || '—'} />
            <InfoCell label="Session" value={getSessionLabel(data.sessionType)} isLastCol />
            <InfoCell label="Année académique" value={data.anneeAcademique || '—'} isLastRow />
            <InfoCell label="Matricule" value={data.etudiantMatricule || '—'} isLastRow isLastCol />
          </View>

          {/* Pied de page */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.dateLabel}>Date d'émission</Text>
              <Text style={styles.dateValue}>{formatDate(data.dateEmission)}</Text>
            </View>
            <QRCodeBox dataUri={data.qrCodeDataUri} code={data.codeVerification} />
            <View style={styles.footerRight}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{data.responsableNom || 'Le Responsable'}</Text>
              <Text style={styles.signatureRole}>Responsable</Text>
            </View>
          </View>
        </View>

        {/* Footer établissement */}
        <View style={[styles.etabFooter, { left: 55, right: 55 }]}>
          <View style={styles.etabFooterLine} />
          <Text style={styles.etabFooterText}>
            {data.etablissementNom} · Certificat émis via SECT
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Exports ═══

export function CertificateDocument({ data, orientation = 'landscape' }: { data: CertificatPDFData; orientation?: 'landscape' | 'portrait' }) {
  return orientation === 'portrait' ? <CertificatePortrait data={data} /> : <CertificateLandscape data={data} />
}

export async function renderCertificatPDF(data: CertificatPDFData, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<Buffer> {
  return await renderToBuffer(<CertificateDocument data={data} orientation={orientation} />)
}
