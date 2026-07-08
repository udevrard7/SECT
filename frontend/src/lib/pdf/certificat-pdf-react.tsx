/**
 * certificat-pdf-react.tsx — Certificat académique institutionnel (refonte 2025)
 *
 * Design épuré et lisible, inspiré des certificats des grandes institutions
 * universitaires (Sorbonne, Harvard, MIT).
 *
 * IMPORTANT : @react-pdf/renderer a un modèle de layout différent du CSS web.
 * - marginTop: 'auto' ne pousse PAS en bas (contrairement au flexbox web)
 * - flexWrap avec width: '%' peut échouer silencieusement
 * → Utilisation de hauteurs fixes et flexDirection: 'row' explicites.
 *
 * Layout A4 Paysage (842×595pt) :
 *   ┌─────────────────────────────────────┐
 *   │ ╔═════════════════════════════════╗ │  ← bordure gold + navy
 *   │ ║  [Logo / Nom établissement]     ║ │  ~55pt
 *   │ ║  [Ville, Pays]                  ║ │
 *   │ ║                                 ║ │
 *   │ ║      CERTIFICAT                 ║ │  ~130pt (PlayfairDisplay 42pt)
 *   │ ║      DE RÉUSSITE                ║ │  (gold, espacé)
 *   │ ║          ◆                      ║ │  (losange gold)
 *   │ ║      Décerné à                  ║ │  (italique, gris)
 *   │ ║   ASSANI Emile Junior           ║ │  (GreatVibes 36pt, élégant script)
 *   │ ║      ───────────                ║ │  (ligne gold)
 *   │ ║  a réussi l'évaluation          ║ │
 *   │ ║   Programmation Système         ║ │  (PlayfairDisplay bold)
 *   │ ║  avec la note de 18.17/20       ║ │
 *   │ ║   MENTION : Très Bien           ║ │  (gold, si présente)
 *   │ ║                                 ║ │
 *   │ ║  ┌──────────┬──────────┐        ║ │  ~370pt (grille 3×2)
 *   │ ║  │ Filière  │ UE       │        ║ │
 *   │ ║  ├──────────┼──────────┤        ║ │
 *   │ ║  │ Niveau   │ Session  │        ║ │
 *   │ ║  ├──────────┼──────────┤        ║ │
 *   │ ║  │ Année    │ Matricule│        ║ │
 *   │ ║  └──────────┴──────────┘        ║ │
 *   │ ║                                 ║ │
 *   │ ║  Date    [QR]    Signature      ║ │  ~500pt (footer 3 colonnes)
 *   │ ║  ───────────────────────────    ║ │  (ligne gold)
 *   │ ║  Établissement · SECT           ║ │  ~555pt
 *   │ ╚═════════════════════════════════╝ │
 *   └─────────────────────────────────────┘
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

function getSessionLabel(sessionType: string): string {
  return sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
}

const PdfImage = Image as unknown as React.FC<React.ComponentProps<typeof Image> & { alt?: string }>

// ═══ Composant : grille d'infos (3 rangées × 2 colonnes, layout explicite) ═══

function InfoRow({ left, right, isLast = false }: { left: { label: string; value: string }; right: { label: string; value: string }; isLast?: boolean }) {
  const cellStyle = {
    width: '50%' as const,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: CELL_BG,
    borderRightWidth: 1,
    borderBottomWidth: isLast ? 0 : 1,
    borderColor: GOLD_BORDER,
  }
  const cellStyleLast = {
    ...cellStyle,
    borderRightWidth: 0,
  }
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={cellStyle}>
        <Text style={{ fontSize: 7.5, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase' }}>{left.label}</Text>
        <Text style={{ fontSize: 10.5, color: TEXT_DARK, fontWeight: 'bold' }}>{left.value}</Text>
      </View>
      <View style={cellStyleLast}>
        <Text style={{ fontSize: 7.5, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase' }}>{right.label}</Text>
        <Text style={{ fontSize: 10.5, color: TEXT_DARK, fontWeight: 'bold' }}>{right.value}</Text>
      </View>
    </View>
  )
}

// ═══ Composant : QR code ═══

function QRCodeBox({ dataUri, code }: { dataUri: string | null | undefined; code: string }) {
  if (!dataUri) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 7, color: TEXT_GRAY, marginBottom: 3 }}>Code de vérification</Text>
        <Text style={{ fontSize: 8, color: NAVY, fontWeight: 'bold' }}>{code}</Text>
      </View>
    )
  }
  return (
    <View style={{ alignItems: 'center' }}>
      <PdfImage src={dataUri} style={{ width: 65, height: 65, marginBottom: 3 }} alt="QR code" />
      <Text style={{ fontSize: 7, color: NAVY, fontWeight: 'bold' }}>{code}</Text>
      <Text style={{ fontSize: 5.5, color: TEXT_GRAY }}>Scannez pour vérifier</Text>
    </View>
  )
}

// ═══ Document principal (Paysage) ═══

function CertificateLandscape({ data }: { data: CertificatPDFData }) {
  const etabLocation = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const intituleText = data.intitule || `${data.ueNom} (${data.ueCode})`

  return (
    <Document>
      <Page size={[842, 595]} style={{ fontFamily: 'Inter', backgroundColor: WHITE, color: TEXT_DARK, position: 'relative' }}>
        {/* Bordure double (position absolue) */}
        <View style={{ position: 'absolute', top: 30, left: 30, right: 30, bottom: 30, borderWidth: 2.5, borderColor: GOLD }} />
        <View style={{ position: 'absolute', top: 38, left: 38, right: 38, bottom: 38, borderWidth: 0.5, borderColor: NAVY }} />

        {/* Contenu principal — layout en colonne avec espacements explicites */}
        <View style={{ paddingHorizontal: 70, paddingVertical: 50, flexDirection: 'column' }}>

          {/* En-tête établissement */}
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            {data.etablissementLogo ? (
              <PdfImage src={data.etablissementLogo} style={{ width: 140, height: 50, objectFit: 'contain' as const, marginBottom: 4 }} alt="" />
            ) : (
              <Text style={{ fontSize: 15, fontFamily: 'PlayfairDisplay', color: NAVY, marginBottom: 2 }}>{data.etablissementNom}</Text>
            )}
            {etabLocation && <Text style={{ fontSize: 9.5, color: TEXT_GRAY, letterSpacing: 1 }}>{etabLocation}</Text>}
          </View>

          {/* Titre "CERTIFICAT" */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 42, fontFamily: 'PlayfairDisplay', color: NAVY, letterSpacing: 6 }}>CERTIFICAT</Text>
            <Text style={{ fontSize: 12, color: GOLD, letterSpacing: 7, marginTop: 3, fontWeight: 'bold' }}>DE RÉUSSITE</Text>
          </View>

          {/* Losange décoratif */}
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 7, height: 7, backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
          </View>

          {/* "Décerné à" + nom */}
          <View style={{ alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: TEXT_GRAY, fontStyle: 'italic', marginBottom: 6 }}>Décerné à</Text>
            <Text style={{ fontSize: 34, fontFamily: 'GreatVibes', color: NAVY, marginBottom: 8 }}>{capitalizeName(data.etudiantNom)}</Text>
            <View style={{ width: 180, height: 1, backgroundColor: GOLD, marginBottom: 10 }} />
          </View>

          {/* Description */}
          <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: TEXT_DARK, marginBottom: 4 }}>a réussi l'évaluation</Text>
            <Text style={{ fontSize: 14, fontFamily: 'PlayfairDisplay', color: NAVY, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>{intituleText}</Text>
            <Text style={{ fontSize: 12, color: TEXT_DARK }}>
              avec la note de <Text style={{ fontWeight: 'bold', color: NAVY }}>{formatNote(data.noteFinale)}/20</Text>
              {data.creditsECTS ? <Text> · {data.creditsECTS} crédits ECTS</Text> : null}
            </Text>
          </View>

          {/* Mention */}
          {data.mention && (
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: GOLD, fontWeight: 'bold', letterSpacing: 2 }}>MENTION : {data.mention}</Text>
            </View>
          )}

          {/* Grille d'informations (3 rangées × 2 colonnes) */}
          <View style={{ borderWidth: 1, borderColor: GOLD_BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
            <InfoRow left={{ label: 'Filière', value: data.filiereCode ? `${data.filiereNom} (${data.filiereCode})` : data.filiereNom }} right={{ label: 'Unité d\'enseignement', value: `${data.ueCode} — ${data.ueNom}` }} />
            <InfoRow left={{ label: 'Niveau', value: data.etudiantNiveau || '—' }} right={{ label: 'Session', value: getSessionLabel(data.sessionType) }} />
            <InfoRow left={{ label: 'Année académique', value: data.anneeAcademique || '—' }} right={{ label: 'Matricule', value: data.etudiantMatricule || '—' }} isLast />
          </View>

          {/* Pied de page : 3 colonnes (Date | QR code | Signature) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20 }}>
            {/* Date */}
            <View style={{ width: 200, alignItems: 'center' }}>
              <Text style={{ fontSize: 7.5, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 3, textTransform: 'uppercase' }}>Date d'émission</Text>
              <Text style={{ fontSize: 10.5, color: TEXT_DARK, fontWeight: 'bold' }}>{formatDate(data.dateEmission)}</Text>
            </View>

            {/* QR code */}
            <View style={{ width: 200, alignItems: 'center' }}>
              <QRCodeBox dataUri={data.qrCodeDataUri} code={data.codeVerification} />
            </View>

            {/* Signature */}
            <View style={{ width: 200, alignItems: 'center' }}>
              <View style={{ width: 120, height: 1, backgroundColor: SIG_LINE, marginBottom: 4 }} />
              <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold', marginBottom: 1 }}>{data.responsableNom || 'Le Responsable'}</Text>
              <Text style={{ fontSize: 8, color: TEXT_GRAY }}>Responsable de l'établissement</Text>
            </View>
          </View>
        </View>

        {/* Footer établissement (position absolue, à l'intérieur de la bordure) */}
        <View style={{ position: 'absolute', bottom: 45, left: 70, right: 70, alignItems: 'center' }}>
          <View style={{ width: '100%', height: 0.5, backgroundColor: GOLD, marginBottom: 5 }} />
          <Text style={{ fontSize: 7.5, color: TEXT_FOOTER, textAlign: 'center' }}>
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
      <Page size={[595, 842]} style={{ fontFamily: 'Inter', backgroundColor: WHITE, color: TEXT_DARK, position: 'relative' }}>
        {/* Bordure double */}
        <View style={{ position: 'absolute', top: 30, left: 30, right: 30, bottom: 30, borderWidth: 2.5, borderColor: GOLD }} />
        <View style={{ position: 'absolute', top: 38, left: 38, right: 38, bottom: 38, borderWidth: 0.5, borderColor: NAVY }} />

        {/* Contenu */}
        <View style={{ paddingHorizontal: 55, paddingVertical: 55, flexDirection: 'column' }}>

          {/* En-tête */}
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            {data.etablissementLogo ? (
              <PdfImage src={data.etablissementLogo} style={{ width: 130, height: 45, objectFit: 'contain' as const, marginBottom: 4 }} alt="" />
            ) : (
              <Text style={{ fontSize: 14, fontFamily: 'PlayfairDisplay', color: NAVY, marginBottom: 2 }}>{data.etablissementNom}</Text>
            )}
            {etabLocation && <Text style={{ fontSize: 9, color: TEXT_GRAY, letterSpacing: 1 }}>{etabLocation}</Text>}
          </View>

          {/* Titre */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 36, fontFamily: 'PlayfairDisplay', color: NAVY, letterSpacing: 5 }}>CERTIFICAT</Text>
            <Text style={{ fontSize: 11, color: GOLD, letterSpacing: 6, marginTop: 3, fontWeight: 'bold' }}>DE RÉUSSITE</Text>
          </View>

          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 7, height: 7, backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
          </View>

          {/* Nom */}
          <View style={{ alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: TEXT_GRAY, fontStyle: 'italic', marginBottom: 6 }}>Décerné à</Text>
            <Text style={{ fontSize: 30, fontFamily: 'GreatVibes', color: NAVY, marginBottom: 8 }}>{capitalizeName(data.etudiantNom)}</Text>
            <View style={{ width: 160, height: 1, backgroundColor: GOLD, marginBottom: 10 }} />
          </View>

          {/* Description */}
          <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 11, color: TEXT_DARK, marginBottom: 4 }}>a réussi l'évaluation</Text>
            <Text style={{ fontSize: 13, fontFamily: 'PlayfairDisplay', color: NAVY, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>{intituleText}</Text>
            <Text style={{ fontSize: 11, color: TEXT_DARK }}>
              avec la note de <Text style={{ fontWeight: 'bold', color: NAVY }}>{formatNote(data.noteFinale)}/20</Text>
              {data.creditsECTS ? <Text> · {data.creditsECTS} crédits ECTS</Text> : null}
            </Text>
          </View>

          {/* Mention */}
          {data.mention && (
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: GOLD, fontWeight: 'bold', letterSpacing: 2 }}>MENTION : {data.mention}</Text>
            </View>
          )}

          {/* Grille */}
          <View style={{ borderWidth: 1, borderColor: GOLD_BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 20 }}>
            <InfoRow left={{ label: 'Filière', value: data.filiereCode ? `${data.filiereNom} (${data.filiereCode})` : data.filiereNom }} right={{ label: 'Unité d\'enseignement', value: `${data.ueCode} — ${data.ueNom}` }} />
            <InfoRow left={{ label: 'Niveau', value: data.etudiantNiveau || '—' }} right={{ label: 'Session', value: getSessionLabel(data.sessionType) }} />
            <InfoRow left={{ label: 'Année académique', value: data.anneeAcademique || '—' }} right={{ label: 'Matricule', value: data.etudiantMatricule || '—' }} isLast />
          </View>

          {/* Pied de page */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 10 }}>
            <View style={{ width: 150, alignItems: 'center' }}>
              <Text style={{ fontSize: 7.5, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 3, textTransform: 'uppercase' }}>Date d'émission</Text>
              <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>{formatDate(data.dateEmission)}</Text>
            </View>
            <View style={{ width: 150, alignItems: 'center' }}>
              <QRCodeBox dataUri={data.qrCodeDataUri} code={data.codeVerification} />
            </View>
            <View style={{ width: 150, alignItems: 'center' }}>
              <View style={{ width: 100, height: 1, backgroundColor: SIG_LINE, marginBottom: 4 }} />
              <Text style={{ fontSize: 9, color: TEXT_DARK, fontWeight: 'bold', marginBottom: 1 }}>{data.responsableNom || 'Le Responsable'}</Text>
              <Text style={{ fontSize: 7.5, color: TEXT_GRAY }}>Responsable</Text>
            </View>
          </View>
        </View>

        {/* Footer établissement */}
        <View style={{ position: 'absolute', bottom: 45, left: 55, right: 55, alignItems: 'center' }}>
          <View style={{ width: '100%', height: 0.5, backgroundColor: GOLD, marginBottom: 5 }} />
          <Text style={{ fontSize: 7, color: TEXT_FOOTER, textAlign: 'center' }}>
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
