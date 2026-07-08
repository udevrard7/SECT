/**
 * fiche-notes-pdf-react.tsx — Fiche de notes collective enseignant (refonte)
 *
 * Design institutionnel cohérent avec le certificat + le relevé individuel
 * (même charte navy/gold, mêmes polices PlayfairDisplay/Inter, même bordure).
 *
 * Remplace l'ancienne version jsPDF brute (tableau basique sans en-tête
 * institutionnel, sans logo, sans signature).
 *
 * Layout A4 Paysage (842×595pt), multi-pages si beaucoup d'étudiants/épreuves.
 *
 * Structure :
 *   - En-tête : logo + nom établissement + ville/pays
 *   - Titre "FICHE DE NOTES" + période (année + semestre + niveau)
 *   - Infos contexte (filière, enseignant, date émission)
 *   - Tableau : 1 ligne par étudiant, 1 colonne par épreuve + moyenne
 *   - Notes colorées (rouge < 10, vert ≥ 10)
 *   - Footer : nom enseignant + date + signatures
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
  family: 'Inter',
  fonts: [
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'bold' },
    { src: path.join(FONTS_DIR, 'Inter-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

// ═══ Types ═══

export interface EpreuveCol {
  id: string
  titre: string
  noteMax: number
  ueCode: string
  ueNom: string
  semestre?: number
}

export interface EtudiantRow {
  id: string
  name: string
  matricule: string
  email: string
  filiere: string
  notes: Record<string, number | null>
  moyenne?: number | null
}

export interface FicheNotesPDFData {
  epreuves: EpreuveCol[]
  etudiants: EtudiantRow[]
  filiereId: string
  niveau: string
  semestre: string
  anneeUniversitaire: string
  total: number

  // Établissement (institutionnel)
  etablissementNom: string
  etablissementLogo: string | null
  etablissementVille: string | null
  etablissementPays: string | null

  // Enseignant (signataire)
  enseignantNom: string

  // Date d'émission
  dateEmission: Date | string
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
const RED = '#DC2626'
const GREEN = '#166534'
const SIG_LINE = '#CBD5E0'

// ═══ Helpers ═══

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

function getNoteColor(note: number | null, noteMax: number): string {
  if (note === null) return TEXT_GRAY
  const sur20 = (note / noteMax) * 20
  return sur20 >= 10 ? GREEN : RED
}

const PdfImage = Image as unknown as React.FC<React.ComponentProps<typeof Image> & { alt?: string }>

// ═══ Document principal ═══

function FicheNotesDocument({ data }: { data: FicheNotesPDFData }) {
  const etabLocation = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const periode = [
    data.anneeUniversitaire && `Année ${data.anneeUniversitaire}`,
    data.semestre && `Semestre ${data.semestre}`,
    `Niveau ${data.niveau}`,
  ].filter(Boolean).join(' — ')

  // Largeurs de colonnes : Matricule (70) + Nom (140) + [épreuves auto] + Moyenne (55)
  const fixedColsWidth = 70 + 140 + 55
  const pageWidth = 842
  const padding = 80
  const availableWidth = pageWidth - padding * 2 - fixedColsWidth
  const epreuveColWidth = data.epreuves.length > 0
    ? Math.max(45, Math.min(85, availableWidth / data.epreuves.length))
    : 85

  return (
    <Document>
      <Page size={[842, 595]} style={{ fontFamily: 'Inter', backgroundColor: WHITE, color: TEXT_DARK, position: 'relative', paddingTop: 35, paddingBottom: 45, paddingHorizontal: 50 }}>
        {/* Bordure double */}
        <View style={{ position: 'absolute', top: 25, left: 25, right: 25, bottom: 25, borderWidth: 2.5, borderColor: GOLD }} />
        <View style={{ position: 'absolute', top: 33, left: 33, right: 33, bottom: 33, borderWidth: 0.5, borderColor: NAVY }} />

        {/* En-tête établissement */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10, gap: 10 }}>
          {data.etablissementLogo && (
            <PdfImage src={data.etablissementLogo} style={{ width: 50, height: 50, objectFit: 'contain' as const }} alt="" />
          )}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'PlayfairDisplay', color: NAVY }}>{data.etablissementNom}</Text>
            {etabLocation && <Text style={{ fontSize: 8, color: TEXT_GRAY, letterSpacing: 1 }}>{etabLocation}</Text>}
          </View>
        </View>

        {/* Titre */}
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 22, fontFamily: 'PlayfairDisplay', color: NAVY, letterSpacing: 4 }}>FICHE DE NOTES</Text>
          <View style={{ width: 50, height: 1.5, backgroundColor: GOLD, marginVertical: 3 }} />
          {periode && <Text style={{ fontSize: 9, color: GOLD, letterSpacing: 2, fontWeight: 'bold' }}>{periode.toUpperCase()}</Text>}
        </View>

        {/* Infos contexte */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 8, color: TEXT_GRAY }}>
            Enseignant : <Text style={{ color: TEXT_DARK, fontWeight: 'bold' }}>{data.enseignantNom}</Text>
          </Text>
          <Text style={{ fontSize: 8, color: TEXT_GRAY }}>
            {data.total} étudiant(s) · Édité le {formatDate(data.dateEmission)}
          </Text>
        </View>

        {/* Tableau */}
        <View style={{ borderWidth: 1, borderColor: GOLD_BORDER, borderRadius: 2, overflow: 'hidden' }}>
          {/* En-tête tableau */}
          <View style={{ flexDirection: 'row', backgroundColor: NAVY }}>
            <Text style={{ width: 70, fontSize: 8, color: WHITE, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 6, letterSpacing: 0.5 }}>MATRICULE</Text>
            <Text style={{ width: 140, fontSize: 8, color: WHITE, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 6, letterSpacing: 0.5 }}>NOM</Text>
            {data.epreuves.map((ep) => {
              const titre = ep.titre.length > 18 ? ep.titre.slice(0, 16) + '…' : ep.titre
              return (
                <Text key={ep.id} style={{ width: epreuveColWidth, fontSize: 7.5, color: WHITE, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 3, textAlign: 'center' }}>
                  {titre}
                  {'\n'}
                  <Text style={{ fontSize: 6.5, color: GOLD }}>({ep.ueCode || '—'})</Text>
                </Text>
              )
            })}
            <Text style={{ width: 55, fontSize: 8, color: GOLD, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 6, textAlign: 'center', letterSpacing: 0.5 }}>MOY.</Text>
          </View>

          {/* Lignes étudiants */}
          {data.etudiants.map((etu, idx) => {
            const bgColor = idx % 2 === 0 ? WHITE : CELL_BG_ALT
            return (
              <View key={etu.id} style={{ flexDirection: 'row', backgroundColor: bgColor, borderBottomWidth: idx === data.etudiants.length - 1 ? 0 : 0.3, borderColor: GOLD_BORDER }}>
                <Text style={{ width: 70, fontSize: 8, color: TEXT_DARK, paddingVertical: 5, paddingHorizontal: 6, fontFamily: 'Inter' }}>{etu.matricule || '—'}</Text>
                <Text style={{ width: 140, fontSize: 8.5, color: TEXT_DARK, paddingVertical: 5, paddingHorizontal: 6, fontWeight: 'bold' }}>
                  {etu.name.length > 28 ? etu.name.slice(0, 26) + '…' : etu.name}
                </Text>
                {data.epreuves.map((ep) => {
                  const note = etu.notes?.[ep.id]
                  const noteColor = getNoteColor(note ?? null, ep.noteMax)
                  return (
                    <Text key={ep.id} style={{ width: epreuveColWidth, fontSize: 8.5, color: noteColor, fontWeight: 'bold', paddingVertical: 5, paddingHorizontal: 3, textAlign: 'center' }}>
                      {note !== null && note !== undefined ? formatNote(note) : '—'}
                    </Text>
                  )
                })}
                <Text style={{ width: 55, fontSize: 9, color: NAVY, fontWeight: 'bold', paddingVertical: 5, paddingHorizontal: 6, textAlign: 'center' }}>
                  {etu.moyenne != null ? formatNote(etu.moyenne) : '—'}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Légende */}
        <View style={{ flexDirection: 'row', gap: 15, marginTop: 6, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 7, color: GREEN }}>● Note ≥ 10/20 (réussite)</Text>
          <Text style={{ fontSize: 7, color: RED }}>● Note &lt; 10/20 (échec)</Text>
          <Text style={{ fontSize: 7, color: TEXT_GRAY }}>— = non évalué</Text>
        </View>

        {/* Signatures */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 }}>
          <View style={{ alignItems: 'center', width: 250 }}>
            <View style={{ width: 160, height: 1, backgroundColor: SIG_LINE, marginBottom: 3 }} />
            <Text style={{ fontSize: 9, color: TEXT_DARK, fontWeight: 'bold' }}>{data.enseignantNom}</Text>
            <Text style={{ fontSize: 7, color: TEXT_GRAY }}>Enseignant</Text>
          </View>
          <View style={{ alignItems: 'center', width: 250 }}>
            <View style={{ width: 160, height: 1, backgroundColor: SIG_LINE, marginBottom: 3 }} />
            <Text style={{ fontSize: 9, color: TEXT_DARK, fontWeight: 'bold' }}>Le Responsable</Text>
            <Text style={{ fontSize: 7, color: TEXT_GRAY }}>Responsable de l'établissement</Text>
          </View>
        </View>

        {/* Footer établissement */}
        <View style={{ position: 'absolute', bottom: 38, left: 50, right: 50, alignItems: 'center' }}>
          <View style={{ width: '100%', height: 0.5, backgroundColor: GOLD, marginBottom: 4 }} />
          <Text style={{ fontSize: 7, color: TEXT_FOOTER, textAlign: 'center' }}>
            {data.etablissementNom} · Fiche de notes générée par SECT — Système d'Évaluation Casse-Tête
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Exports ═══

export async function renderFicheNotesPDF(data: FicheNotesPDFData): Promise<Buffer> {
  return await renderToBuffer(<FicheNotesDocument data={data} />)
}
