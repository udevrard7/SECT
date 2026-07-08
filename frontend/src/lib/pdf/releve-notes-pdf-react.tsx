/**
 * releve-notes-pdf-react.tsx — Relevé de notes individuel institutionnel
 *
 * Design cohérent avec le certificat refondu (même charte navy/gold, mêmes
 * polices PlayfairDisplay/GreatVibes/Inter, même bordure double).
 *
 * Layout A4 Portrait (595×842pt), multi-pages si l'étudiant a beaucoup d'UE.
 *
 * Structure :
 *   - En-tête : logo + nom établissement + ville/pays
 *   - Titre "RELEVÉ DE NOTES" + année académique
 *   - Carte étudiant (nom, matricule, filière, niveau)
 *   - Sections par UE (titre UE + tableau épreuves + moyenne UE)
 *   - Synthèse globale (moyenne générale + mention + crédits ECTS)
 *   - Date + lieu
 *   - Signatures (enseignant + responsable)
 *   - Footer établissement
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, Font, StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import path from 'path'

// ═══ Fonts (même config que le certificat) ═══

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'PlayfairDisplay',
  fonts: [{ src: path.join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'), fontWeight: 'normal' }],
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

export interface EpreuveNote {
  epreuveId: string
  epreuveTitre: string
  noteTotal: number
  note: number | null
  sessionType: string
  dateFin: string | null
}

export interface UERelevé {
  ueId: string
  ueCode: string
  ueNom: string
  creditsECTS: number | null
  epreuves: EpreuveNote[]
}

export interface ReleveNotesPDFData {
  // Étudiant
  etudiantNom: string
  etudiantMatricule: string | null
  etudiantNiveau: string | null
  filiereNom: string
  filiereCode: string | null

  // Établissement
  etablissementNom: string
  etablissementLogo: string | null
  etablissementVille: string | null
  etablissementPays: string | null

  // Enseignant (signataire)
  enseignantNom: string

  // Académique
  anneeAcademique: string | null
  dateEmission: Date | string

  // Notes groupées par UE
  ues: UERelevé[]
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
const CELL_BG_ALT = '#FFF8E7'
const SIG_LINE = '#CBD5E0'
const RED = '#DC2626'
const GREEN = '#166534'

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
  if (sessionType === 'RATTRAPAGE') return 'Rattrapage'
  return 'Normale'
}

/** Calcule la moyenne d'une UE (moyenne arithmétique des notes non-null) */
function computeMoyenneUE(epreuves: EpreuveNote[]): number | null {
  const notes = epreuves.filter((e) => e.note !== null).map((e) => e.note!)
  if (notes.length === 0) return null
  return notes.reduce((a, b) => a + b, 0) / notes.length
}

/** Calcule la moyenne générale (moyenne arithmétique des moyennes d'UE non-null) */
function computeMoyenneGenerale(ues: UERelevé[]): number | null {
  const moyennes = ues.map((u) => computeMoyenneUE(u.epreuves)).filter((m): m is number => m !== null)
  if (moyennes.length === 0) return null
  return moyennes.reduce((a, b) => a + b, 0) / moyennes.length
}

/** Mention selon l'échelle française officielle */
function getMention(moyenne: number): string {
  if (moyenne >= 16) return 'Très Bien'
  if (moyenne >= 14) return 'Bien'
  if (moyenne >= 12) return 'Assez Bien'
  if (moyenne >= 10) return 'Passable'
  return 'Insuffisant'
}

const PdfImage = Image as unknown as React.FC<React.ComponentProps<typeof Image> & { alt?: string }>

// ═══ Composants ═══

function Logo({ logo, nom }: { logo: string | null; nom: string }) {
  if (!logo) {
    return <Text style={{ fontSize: 14, fontFamily: 'PlayfairDisplay', color: NAVY }}>{nom}</Text>
  }
  return <PdfImage src={logo} style={{ width: 120, height: 45, objectFit: 'contain' as const }} alt="" />
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6, paddingHorizontal: 12, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GOLD_BORDER, backgroundColor: CELL_BG }}>
      <Text style={{ fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>{value}</Text>
    </View>
  )
}

function InfoCellLast({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: GOLD_BORDER, backgroundColor: CELL_BG }}>
      <Text style={{ fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>{value}</Text>
    </View>
  )
}

// ═══ Section UE ═══

function UESection({ ue, isLast }: { ue: UERelevé; isLast: boolean }) {
  const moyenneUE = computeMoyenneUE(ue.epreuves)
  const hasNotes = ue.epreuves.some((e) => e.note !== null)

  return (
    <View style={{ marginBottom: isLast ? 6 : 12 }} break={false}>
      {/* En-tête UE */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 2 }}>
        <Text style={{ fontSize: 10, fontFamily: 'Inter', fontWeight: 'bold', color: WHITE }}>
          {ue.ueCode} — {ue.ueNom}
        </Text>
        {ue.creditsECTS ? (
          <Text style={{ fontSize: 8, color: GOLD, marginLeft: 'auto' }}>
            {ue.creditsECTS} ECTS
          </Text>
        ) : null}
      </View>

      {/* Tableau des épreuves */}
      <View style={{ borderWidth: 1, borderColor: GOLD_BORDER, borderRadius: 2, overflow: 'hidden' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', backgroundColor: CELL_BG, borderBottomWidth: 1, borderColor: GOLD_BORDER }}>
          <Text style={{ width: '50%', fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, paddingVertical: 4, paddingHorizontal: 8, textTransform: 'uppercase', fontWeight: 'bold' }}>Épreuve</Text>
          <Text style={{ width: '18%', fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, paddingVertical: 4, paddingHorizontal: 8, textTransform: 'uppercase', fontWeight: 'bold' }}>Session</Text>
          <Text style={{ width: '16%', fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, paddingVertical: 4, paddingHorizontal: 8, textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>Note</Text>
          <Text style={{ width: '16%', fontSize: 7, color: TEXT_GRAY, letterSpacing: 0.8, paddingVertical: 4, paddingHorizontal: 8, textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>Mention</Text>
        </View>

        {/* Lignes épreuves */}
        {ue.epreuves.length === 0 ? (
          <View style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 8, color: TEXT_GRAY, fontStyle: 'italic' }}>Aucune épreuve évaluée</Text>
          </View>
        ) : (
          ue.epreuves.map((ep, idx) => {
            const note = ep.note
            const mention = note !== null ? getMention((note / ep.noteTotal) * 20) : '—'
            const noteColor = note !== null
              ? ((note / ep.noteTotal) * 20 >= 10 ? GREEN : RED)
              : TEXT_GRAY
            return (
              <View key={ep.epreuveId} style={{ flexDirection: 'row', backgroundColor: idx % 2 === 0 ? WHITE : CELL_BG_ALT, borderBottomWidth: idx === ue.epreuves.length - 1 ? 0 : 0.3, borderColor: GOLD_BORDER }}>
                <Text style={{ width: '50%', fontSize: 8.5, color: TEXT_DARK, paddingVertical: 4, paddingHorizontal: 8 }}>{ep.epreuveTitre}</Text>
                <Text style={{ width: '18%', fontSize: 8, color: TEXT_GRAY, paddingVertical: 4, paddingHorizontal: 8 }}>{getSessionLabel(ep.sessionType)}</Text>
                <Text style={{ width: '16%', fontSize: 9, color: noteColor, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 8, textAlign: 'center' }}>
                  {note !== null ? `${formatNote(note)}/${formatNote(ep.noteTotal)}` : '—'}
                </Text>
                <Text style={{ width: '16%', fontSize: 8, color: TEXT_DARK, paddingVertical: 4, paddingHorizontal: 8, textAlign: 'center' }}>{mention}</Text>
              </View>
            )
          })
        )}
      </View>

      {/* Moyenne UE */}
      {hasNotes && moyenneUE !== null && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 }}>
          <Text style={{ fontSize: 9, color: NAVY, fontWeight: 'bold' }}>
            Moyenne UE : {formatNote(moyenneUE)}/20 — {getMention(moyenneUE)}
          </Text>
        </View>
      )}
    </View>
  )
}

// ═══ Document principal ═══

function ReleveNotesDocument({ data }: { data: ReleveNotesPDFData }) {
  const etabLocation = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const moyenneGenerale = computeMoyenneGenerale(data.ues)
  const totalECTS = data.ues.reduce((sum, ue) => sum + (ue.creditsECTS ?? 0), 0)
  const validatedECTS = data.ues.filter((ue) => {
    const m = computeMoyenneUE(ue.epreuves)
    return m !== null && m >= 10
  }).reduce((sum, ue) => sum + (ue.creditsECTS ?? 0), 0)

  return (
    <Document>
      <Page size={[595, 842]} style={{ fontFamily: 'Inter', backgroundColor: WHITE, color: TEXT_DARK, position: 'relative', paddingTop: 40, paddingBottom: 50, paddingHorizontal: 50 }}>
        {/* Bordure double (position absolue) */}
        <View style={{ position: 'absolute', top: 25, left: 25, right: 25, bottom: 25, borderWidth: 2.5, borderColor: GOLD }} />
        <View style={{ position: 'absolute', top: 33, left: 33, right: 33, bottom: 33, borderWidth: 0.5, borderColor: NAVY }} />

        {/* En-tête établissement */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15, gap: 12 }}>
          {data.etablissementLogo && (
            <PdfImage src={data.etablissementLogo} style={{ width: 70, height: 70, objectFit: 'contain' as const }} alt="" />
          )}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: 'PlayfairDisplay', color: NAVY }}>{data.etablissementNom}</Text>
            {etabLocation && <Text style={{ fontSize: 9, color: TEXT_GRAY, letterSpacing: 1 }}>{etabLocation}</Text>}
          </View>
        </View>

        {/* Titre */}
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 26, fontFamily: 'PlayfairDisplay', color: NAVY, letterSpacing: 4 }}>RELEVÉ DE NOTES</Text>
          <View style={{ width: 60, height: 2, backgroundColor: GOLD, marginVertical: 4 }} />
          {data.anneeAcademique && (
            <Text style={{ fontSize: 11, color: GOLD, letterSpacing: 3, fontWeight: 'bold' }}>ANNÉE ACADÉMIQUE {data.anneeAcademique}</Text>
          )}
        </View>

        {/* Carte étudiant */}
        <View style={{ borderWidth: 1, borderColor: GOLD_BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 14, marginTop: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            <InfoCell label="Étudiant(e)" value={capitalizeName(data.etudiantNom)} />
            <InfoCellLast label="Matricule" value={data.etudiantMatricule || '—'} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            <InfoCell label="Filière" value={data.filiereCode ? `${data.filiereNom} (${data.filiereCode})` : data.filiereNom} />
            <InfoCellLast label="Niveau" value={data.etudiantNiveau || '—'} />
          </View>
        </View>

        {/* Sections par UE */}
        {data.ues.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <Text style={{ fontSize: 11, color: TEXT_GRAY, fontStyle: 'italic' }}>Aucune note disponible pour cet étudiant</Text>
          </View>
        ) : (
          data.ues.map((ue, idx) => (
            <UESection key={ue.ueId} ue={ue} isLast={idx === data.ues.length - 1} />
          ))
        )}

        {/* Synthèse globale */}
        {moyenneGenerale !== null && (
          <View style={{ marginTop: 10, borderWidth: 2, borderColor: GOLD, borderRadius: 4, backgroundColor: CELL_BG_ALT, paddingVertical: 10, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: 'bold', color: NAVY }}>MOYENNE GÉNÉRALE</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter', fontWeight: 'bold', color: NAVY }}>
                {formatNote(moyenneGenerale)}/20
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 10, color: TEXT_DARK }}>Mention</Text>
              <Text style={{ fontSize: 10, color: GOLD, fontWeight: 'bold' }}>{getMention(moyenneGenerale)}</Text>
            </View>
            {totalECTS > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, color: TEXT_DARK }}>Crédits ECTS validés</Text>
                <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>{validatedECTS}/{totalECTS}</Text>
              </View>
            )}
          </View>
        )}

        {/* Date + lieu */}
        <View style={{ marginTop: 18, marginBottom: 8 }}>
          <Text style={{ fontSize: 10, color: TEXT_DARK, fontStyle: 'italic' }}>
            Fait à {data.etablissementVille || '—'}, le {formatDate(data.dateEmission)}
          </Text>
        </View>

        {/* Signatures */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, marginBottom: 8 }}>
          <View style={{ alignItems: 'center', width: 200 }}>
            <View style={{ width: 140, height: 1, backgroundColor: SIG_LINE, marginBottom: 4 }} />
            <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>{capitalizeName(data.enseignantNom)}</Text>
            <Text style={{ fontSize: 8, color: TEXT_GRAY }}>Enseignant</Text>
          </View>
          <View style={{ alignItems: 'center', width: 200 }}>
            <View style={{ width: 140, height: 1, backgroundColor: SIG_LINE, marginBottom: 4 }} />
            <Text style={{ fontSize: 10, color: TEXT_DARK, fontWeight: 'bold' }}>Le Responsable</Text>
            <Text style={{ fontSize: 8, color: TEXT_GRAY }}>Responsable de l'établissement</Text>
          </View>
        </View>

        {/* Footer établissement (position absolue) */}
        <View style={{ position: 'absolute', bottom: 40, left: 50, right: 50, alignItems: 'center' }}>
          <View style={{ width: '100%', height: 0.5, backgroundColor: GOLD, marginBottom: 4 }} />
          <Text style={{ fontSize: 7, color: TEXT_FOOTER, textAlign: 'center' }}>
            {data.etablissementNom} · Relevé de notes généré par SECT — Système d'Évaluation Casse-Tête
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Exports ═══

export function ReleveNotesDocumentExport({ data }: { data: ReleveNotesPDFData }) {
  return <ReleveNotesDocument data={data} />
}

export async function renderReleveNotesPDF(data: ReleveNotesPDFData): Promise<Buffer> {
  return await renderToBuffer(<ReleveNotesDocument data={data} />)
}
