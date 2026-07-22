/**
 * epreuve-pdf-react.tsx — Épreuve PDF professionnelle institutionnelle (A4 portrait)
 *
 * Refonte 2025 : passage de jsPDF (client-side, basique) à @react-pdf/renderer
 * (server-side, design institutionnel navy/gold) pour les 3 types de PDF :
 *   - Sujet (épreuve pour l'étudiant)
 *   - Corrigé type (réponses + explications pour l'enseignant)
 *   - Feuille de réponses (grille QCM/QCU + questions ouvertes)
 *
 * Design identique aux certificats/factures/relevés existants :
 *   - Double bordure (gold 2.5pt + navy 0.5pt)
 *   - Fonts : PlayfairDisplay (titres), Inter (corps)
 *   - Palette : NAVY #1B3A5C, GOLD #C5A044, GOLD_BORDER #E8D09A
 *   - Header : Logo établissement + nom + ville/pays | UE + filière
 *   - Footer : "Confidentiel" | titre épreuve | page N/M + ligne gold
 *
 * B2B : logo + nom établissement + filière affichés
 * B2C (Prof Solo) : branding SECT si pas de logo établissement
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

export interface PDFQuestion {
  id: string
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION' | 'CODE'
  enonce: string
  propositions: Array<{ id: string; text: string }> | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: string
  bareme: number
  langage?: string
  codeInitial?: string
  fonctionSignature?: string
  testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
  testsPrives?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
}

export interface EpreuvePDFData {
  id: string
  titre: string
  description: string | null
  duree: number | null
  dateDebut: string | null
  dateFin: string | null
  noteTotal: number | null
  etablissement: {
    nom: string
    logo: string | null
    ville: string | null
    pays: string | null
  }
  filiere: { nom: string; code: string | null } | null
  uniteEnseignement: { code: string; nom: string } | null
  enseignant: { name: string } | null
  contenu: {
    questions: PDFQuestion[]
    consignes: string | null
    baremeTotal: number | null
  }
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
const EMERALD = '#059669'
const RED = '#DC2626'
const GREEN_BG = '#F0FFF4'
const GREEN_BORDER = '#38A169'
const CONSIGNE_BG = '#FFFBEB'
const CONSIGNE_BORDER = '#D97706'
const CODE_BG = '#F5F5FA'
const CODE_BORDER = '#A78BFA'

const PdfImage = Image as unknown as React.FC<React.ComponentProps<typeof Image> & { alt?: string }>

// ═══ Helpers ═══

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDuration(duree: number | null): string {
  if (!duree) return '—'
  if (duree >= 60) {
    const h = Math.floor(duree / 60)
    const m = duree % 60
    return m > 0 ? `${h}h${m}` : `${h}h`
  }
  return `${duree} min`
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'QCU': return 'QCU (Choix unique)'
    case 'QCM': return 'QCM (Choix multiples)'
    case 'QRC': return 'QRC (Réponse courte)'
    case 'REFLEXION': return 'Réflexion'
    case 'CODE': return 'Code (Programmation)'
    default: return type
  }
}

function getAcademicYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
}

// ═══ Styles ═══

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: TEXT_DARK,
    paddingTop: 55,
    paddingBottom: 50,
    paddingHorizontal: 55,
    backgroundColor: WHITE,
    position: 'relative',
  },
  // Double border (absolute positioning)
  outerBorder: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderWidth: 2.5,
    borderColor: GOLD,
  },
  innerBorder: {
    position: 'absolute',
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    borderWidth: 0.5,
    borderColor: NAVY,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    minHeight: 50,
  },
  headerLeft: {
    flexDirection: 'column',
    maxWidth: 280,
  },
  headerRight: {
    flexDirection: 'column',
    maxWidth: 240,
    alignItems: 'flex-end',
  },
  etabName: {
    fontSize: 13,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  etabLocation: {
    fontSize: 9,
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  academicYear: {
    fontSize: 8,
    color: TEXT_GRAY,
  },
  ueLabel: {
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  ueDetail: {
    fontSize: 8.5,
    color: TEXT_GRAY,
    marginBottom: 1,
  },
  filiereLabel: {
    fontSize: 8.5,
    color: TEXT_GRAY,
  },
  // Gold separator line
  goldLine: {
    width: '100%',
    height: 1,
    backgroundColor: GOLD,
    marginBottom: 8,
  },
  // Title section
  titleSection: {
    alignItems: 'center',
    marginBottom: 10,
  },
  mainTitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay',
    color: NAVY,
    letterSpacing: 3,
    marginBottom: 4,
  },
  subtitleTitle: {
    fontSize: 13,
    color: TEXT_DARK,
    marginBottom: 4,
  },
  // Metadata row
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 3,
    backgroundColor: CELL_BG,
  },
  metaItem: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 7,
    color: TEXT_GRAY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
  },
  // Consignes box
  consignesBox: {
    borderWidth: 1,
    borderColor: CONSIGNE_BORDER,
    borderRadius: 3,
    backgroundColor: CONSIGNE_BG,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  consignesLabel: {
    fontSize: 8,
    color: CONSIGNE_BORDER,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  consignesText: {
    fontSize: 9,
    color: TEXT_DARK,
  },
  // Confidentiel label (for corrigé)
  confidentielLabel: {
    fontSize: 10,
    color: RED,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 6,
  },
  // Summary line
  summaryLine: {
    fontSize: 8,
    color: TEXT_GRAY,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  // Question container
  questionContainer: {
    marginBottom: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  questionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  questionNumber: {
    fontSize: 11,
    color: NAVY,
    fontWeight: 'bold',
  },
  questionType: {
    fontSize: 8,
    color: TEXT_GRAY,
  },
  questionBareme: {
    fontSize: 9,
    color: NAVY,
    fontWeight: 'bold',
    backgroundColor: CELL_BG,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: GOLD_BORDER,
  },
  questionEnonce: {
    fontSize: 10,
    color: TEXT_DARK,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  // Propositions for QCU/QCM
  propositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    paddingLeft: 6,
  },
  propositionCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  propositionSquare: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  propositionLetter: {
    fontSize: 7,
    color: NAVY,
    fontWeight: 'bold',
  },
  propositionText: {
    fontSize: 9.5,
    color: TEXT_DARK,
    flex: 1,
  },
  // Answer lines for QRC/REFLEXION
  answerLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#CBD5E0',
    marginBottom: 10,
    height: 22,
  },
  // Code section
  codeSection: {
    borderWidth: 1,
    borderColor: CODE_BORDER,
    borderRadius: 3,
    backgroundColor: CODE_BG,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  codeLanguage: {
    fontSize: 8,
    color: CODE_BORDER,
    fontWeight: 'bold',
  },
  codeSignature: {
    fontSize: 8,
    color: TEXT_GRAY,
  },
  codeBlock: {
    fontSize: 8,
    fontFamily: 'Inter',
    color: '#2D3748',
    lineHeight: 1.5,
  },
  // Tests table header
  testsHeader: {
    flexDirection: 'row',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 2,
  },
  testsHeaderCell: {
    fontSize: 7,
    color: WHITE,
    fontWeight: 'bold',
    flex: 1,
  },
  testsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: CODE_BORDER,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  testsCell: {
    fontSize: 7.5,
    color: TEXT_DARK,
    flex: 1,
  },
  // Corrigé answer box (green)
  corrigeBox: {
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    borderRadius: 3,
    backgroundColor: GREEN_BG,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  corrigeLabel: {
    fontSize: 8,
    color: GREEN_BORDER,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  corrigeText: {
    fontSize: 9.5,
    color: '#276749',
    lineHeight: 1.4,
  },
  // Explication box
  explicationBox: {
    borderWidth: 1,
    borderColor: '#8B5CF6',
    borderRadius: 3,
    backgroundColor: '#F5F3FF',
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  explicationLabel: {
    fontSize: 8,
    color: '#7C3AED',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  explicationText: {
    fontSize: 9.5,
    color: '#4C1D95',
    lineHeight: 1.4,
  },
  // Separator between questions
  questionSeparator: {
    width: '100%',
    height: 0.5,
    backgroundColor: '#E5E7EB',
    marginBottom: 6,
  },
  // Footer (absolute positioning inside border)
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft: {
    fontSize: 7,
    color: TEXT_GRAY,
    fontStyle: 'italic',
  },
  footerCenter: {
    fontSize: 7,
    color: TEXT_GRAY,
  },
  footerRight: {
    fontSize: 7,
    color: TEXT_GRAY,
  },
  footerGoldLine: {
    width: '100%',
    height: 0.5,
    backgroundColor: GOLD,
    marginBottom: 4,
  },
  footerEtabLine: {
    fontSize: 7,
    color: TEXT_FOOTER,
    textAlign: 'center',
    marginTop: 2,
  },
  // Feuille de réponses specific
  studentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  studentField: {
    flexDirection: 'column',
    width: '48%',
  },
  studentLabel: {
    fontSize: 9,
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  studentLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E0',
    height: 18,
  },
  // MCQ grid header
  mcqHeaderRow: {
    flexDirection: 'row',
    backgroundColor: EMERALD,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 2,
  },
  mcqHeaderCell: {
    fontSize: 8,
    color: WHITE,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mcqRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  mcqCell: {
    fontSize: 9,
    color: TEXT_DARK,
    textAlign: 'center',
  },
  mcqCircleCell: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mcqNumberCell: {
    fontSize: 9,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mcqTypeCell: {
    fontSize: 8,
    color: TEXT_GRAY,
    textAlign: 'center',
  },
  mcqAltRow: {
    backgroundColor: CELL_BG,
  },
})

// ═══ Composant : Header (logo + etab info | UE + filière) ═══

function PDFHeader({ data }: { data: EpreuvePDFData }) {
  const etabLocation = [data.etablissement.ville, data.etablissement.pays].filter(Boolean).join(', ')

  return (
    <View style={styles.headerRow}>
      {/* Left: Logo + Etablissement */}
      <View style={styles.headerLeft}>
        {data.etablissement.logo ? (
          <PdfImage src={data.etablissement.logo} style={{ width: 80, height: 40, objectFit: 'contain' as const, marginBottom: 3 }} alt="" />
        ) : (
          <Text style={styles.etabName}>{data.etablissement.nom}</Text>
        )}
        {etabLocation ? <Text style={styles.etabLocation}>{etabLocation}</Text> : null}
        <Text style={styles.academicYear}>Année universitaire : {getAcademicYear()}</Text>
      </View>

      {/* Right: UE + Filière */}
      <View style={styles.headerRight}>
        {data.uniteEnseignement && (data.uniteEnseignement.code || data.uniteEnseignement.nom) ? (
          <React.Fragment>
            <Text style={styles.ueLabel}>
              UE : {data.uniteEnseignement.code}{data.uniteEnseignement.code && data.uniteEnseignement.nom ? ' — ' : ''}{data.uniteEnseignement.nom}
            </Text>
          </React.Fragment>
        ) : null}
        {data.filiere && data.filiere.nom ? (
          <Text style={styles.filiereLabel}>
            Filière : {data.filiere.nom}{data.filiere.code ? ` (${data.filiere.code})` : ''}
          </Text>
        ) : null}
        {data.enseignant && data.enseignant.name ? (
          <Text style={{ fontSize: 8, color: TEXT_GRAY }}>
            Enseignant : {data.enseignant.name}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

// ═══ Composant : Footer ═══

function PDFFooter({ data, pageNum, totalPages, isCorrige }: { data: EpreuvePDFData; pageNum: number; totalPages: number; isCorrige: boolean }) {
  const maxTitleLen = 50
  const title = data.titre.length > maxTitleLen ? data.titre.slice(0, maxTitleLen) + '…' : data.titre
  const label = isCorrige ? 'Corrigé confidentiel' : 'Confidentiel'

  return (
    <View style={{ position: 'absolute', bottom: 30, left: 55, right: 55 }}>
      <View style={styles.footerGoldLine} />
      <View style={styles.footerRow}>
        <Text style={styles.footerLeft}>{label}</Text>
        <Text style={styles.footerCenter}>{title}</Text>
        <Text style={styles.footerRight}>Page {pageNum}/{totalPages}</Text>
      </View>
      <Text style={styles.footerEtabLine}>
        {data.etablissement.nom} · Épreuve générée via SECT — Plateforme d'évaluation IA
      </Text>
    </View>
  )
}

// ═══ Composant : Question rendering ═══

function PropositionList({ question }: { question: PDFQuestion }) {
  if (!question.propositions || question.propositions.length === 0) return null
  const isQCU = question.type === 'QCU'

  return (
    <View style={{ marginBottom: 4 }}>
      {question.propositions.map((prop, i) => {
        const letter = String.fromCharCode(65 + i)
        return (
          <View key={prop.id || i} style={styles.propositionRow}>
            {isQCU ? (
              <View style={styles.propositionCircle}>
                <Text style={styles.propositionLetter}>{letter}</Text>
              </View>
            ) : (
              <View style={styles.propositionSquare}>
                <Text style={styles.propositionLetter}>{letter}</Text>
              </View>
            )}
            <Text style={styles.propositionText}>{prop.text}</Text>
          </View>
        )
      })}
    </View>
  )
}

function AnswerLines({ count }: { count: number }) {
  return (
    <View style={{ marginBottom: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.answerLine} />
      ))}
    </View>
  )
}

function CodeSection({ question }: { question: PDFQuestion }) {
  const codeText = question.codeInitial || '// Écrire votre code ici'

  return (
    <View style={styles.codeSection}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>
          Langage : {question.langage ? question.langage.toUpperCase() : 'CODE'}
        </Text>
        {question.fonctionSignature ? (
          <Text style={styles.codeSignature}>Signature : {question.fonctionSignature}</Text>
        ) : null}
      </View>
      <Text style={styles.codeBlock}>{codeText}</Text>

      {/* Public tests table */}
      {question.testsPublics && question.testsPublics.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 8, color: CODE_BORDER, fontWeight: 'bold', marginBottom: 3 }}>
            Tests publics :
          </Text>
          <View style={styles.testsHeader}>
            <Text style={[styles.testsHeaderCell, { flex: 0.5 }]}>N°</Text>
            <Text style={[styles.testsHeaderCell, { flex: 2 }]}>Entrée</Text>
            <Text style={[styles.testsHeaderCell, { flex: 2 }]}>Sortie attendue</Text>
          </View>
          {question.testsPublics.map((test, i) => (
            <View key={i} style={styles.testsRow}>
              <Text style={[styles.testsCell, { flex: 0.5 }]}>{i + 1}</Text>
              <Text style={[styles.testsCell, { flex: 2 }]}>{test.entree.substring(0, 50)}</Text>
              <Text style={[styles.testsCell, { flex: 2 }]}>{test.sortieAttendue.substring(0, 50)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function QuestionSujet({ question, index }: { question: PDFQuestion; index: number }) {
  return (
    <View style={styles.questionContainer}>
      {/* Header: Question N + type | bareme */}
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleLeft}>
          <Text style={styles.questionNumber}>Question {index + 1}</Text>
          <Text style={styles.questionType}>{getTypeLabel(question.type)}</Text>
        </View>
        <Text style={styles.questionBareme}>{question.bareme} pt{question.bareme > 1 ? 's' : ''}</Text>
      </View>

      {/* Enonce */}
      <Text style={styles.questionEnonce}>{question.enonce}</Text>

      {/* Type-specific rendering */}
      {(question.type === 'QCU' || question.type === 'QCM') ? (
        <PropositionList question={question} />
      ) : null}

      {question.type === 'QRC' ? (
        <AnswerLines count={5} />
      ) : null}

      {question.type === 'REFLEXION' ? (
        <AnswerLines count={8} />
      ) : null}

      {question.type === 'CODE' ? (
        <CodeSection question={question} />
      ) : null}

      <View style={styles.questionSeparator} />
    </View>
  )
}

// ═══ Composant : Question Corrigé ═══

function CorrigeAnswer({ question }: { question: PDFQuestion }) {
  if (!question.reponseCorrecte) return null

  // QCU/QCM correct answers
  if ((question.type === 'QCU' || question.type === 'QCM') && question.propositions) {
    const correctIds = Array.isArray(question.reponseCorrecte) ? question.reponseCorrecte : [question.reponseCorrecte]
    const correctLabels = question.propositions
      .filter((p) => correctIds.includes(p.id))
      .map((p) => {
        const idx = question.propositions!.indexOf(p)
        return `${String.fromCharCode(65 + idx)}. ${p.text}`
      })

    return (
      <View style={styles.corrigeBox}>
        <Text style={styles.corrigeLabel}>Réponse correcte :</Text>
        <Text style={styles.corrigeText}>{correctLabels.join(' ; ')}</Text>
      </View>
    )
  }

  // QRC/REFLEXION model response
  if (question.type === 'QRC' || question.type === 'REFLEXION') {
    const text = Array.isArray(question.reponseCorrecte) ? question.reponseCorrecte.join('\n') : question.reponseCorrecte
    const label = question.type === 'QRC' ? 'Réponse modèle :' : 'Guide de correction :'

    return (
      <View style={styles.corrigeBox}>
        <Text style={styles.corrigeLabel}>{label}</Text>
        <Text style={styles.corrigeText}>{text}</Text>
      </View>
    )
  }

  return null
}

function CorrigeExplanation({ question }: { question: PDFQuestion }) {
  if (!question.explication) return null

  return (
    <View style={styles.explicationBox}>
      <Text style={styles.explicationLabel}>Explication :</Text>
      <Text style={styles.explicationText}>{question.explication}</Text>
    </View>
  )
}

function QuestionCorrige({ question, index }: { question: PDFQuestion; index: number }) {
  return (
    <View style={styles.questionContainer}>
      {/* Header */}
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleLeft}>
          <Text style={styles.questionNumber}>Question {index + 1}</Text>
          <Text style={styles.questionType}>{getTypeLabel(question.type)}</Text>
        </View>
        <Text style={styles.questionBareme}>{question.bareme} pt{question.bareme > 1 ? 's' : ''}</Text>
      </View>

      {/* Enonce */}
      <Text style={styles.questionEnonce}>{question.enonce}</Text>

      {/* Propositions */}
      {(question.type === 'QCU' || question.type === 'QCM') ? (
        <PropositionList question={question} />
      ) : null}

      {question.type === 'QRC' ? (
        <AnswerLines count={3} />
      ) : null}

      {question.type === 'REFLEXION' ? (
        <AnswerLines count={4} />
      ) : null}

      {question.type === 'CODE' ? (
        <CodeSection question={question} />
      ) : null}

      {/* Correct answers */}
      <CorrigeAnswer question={question} />

      {/* Explanation */}
      <CorrigeExplanation question={question} />

      <View style={styles.questionSeparator} />
    </View>
  )
}

// ═══ Composant : Feuille de réponses ═══

function StudentInfoFields() {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.studentInfoRow}>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Nom :</Text>
          <View style={styles.studentLine} />
        </View>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Prénom :</Text>
          <View style={styles.studentLine} />
        </View>
      </View>
      <View style={styles.studentInfoRow}>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Matricule :</Text>
          <View style={styles.studentLine} />
        </View>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Filière / Groupe :</Text>
          <View style={styles.studentLine} />
        </View>
      </View>
    </View>
  )
}

function MCQGrid({ questions, allQuestions }: { questions: PDFQuestion[]; allQuestions: PDFQuestion[] }) {
  if (questions.length === 0) {
    return (
      <Text style={{ fontSize: 10, color: TEXT_GRAY, fontStyle: 'italic', marginBottom: 8 }}>
        Aucune question QCM/QCU dans cette épreuve.
      </Text>
    )
  }

  const maxProps = Math.max(...questions.map((q) => q.propositions?.length || 0), 4)
  const letterCols = Array.from({ length: maxProps }, (_, i) => String.fromCharCode(65 + i))

  // Calculate column widths for the grid
  // N° (30pt) + Type (50pt) + remaining distributed among letter columns
  const letterColWidth = Math.max(Math.floor((485 - 30 - 50) / maxProps), 30)

  return (
    <View style={{ marginBottom: 12 }}>
      {/* Header row */}
      <View style={styles.mcqHeaderRow}>
        <Text style={[styles.mcqHeaderCell, { width: 30 }]}>N°</Text>
        <Text style={[styles.mcqHeaderCell, { width: 50 }]}>Type</Text>
        {letterCols.map((letter) => (
          <Text key={letter} style={[styles.mcqHeaderCell, { width: letterColWidth }]}>{letter}</Text>
        ))}
      </View>

      {/* Body rows */}
      {questions.map((q, qi) => {
        const originalIdx = allQuestions.indexOf(q)
        const isAlt = qi % 2 === 1

        return (
          <View key={q.id || qi} style={[styles.mcqRow, isAlt ? styles.mcqAltRow : {}]}>
            <Text style={[styles.mcqNumberCell, { width: 30 }]}>{originalIdx + 1}</Text>
            <Text style={[styles.mcqTypeCell, { width: 50 }]}>{q.type}</Text>
            {Array.from({ length: maxProps }, (_, ci) => {
              const hasProp = q.propositions && ci < q.propositions.length
              return (
                <View key={ci} style={{ width: letterColWidth, alignItems: 'center', justifyContent: 'center' }}>
                  {hasProp ? (
                    <View style={styles.mcqCircleCell} />
                  ) : null}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

function OpenQuestionsSection({ questions, allQuestions }: { questions: PDFQuestion[]; allQuestions: PDFQuestion[] }) {
  if (questions.length === 0) return null

  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 11, color: NAVY, fontWeight: 'bold', marginBottom: 6 }}>
        Questions ouvertes
      </Text>
      {questions.map((q) => {
        const originalIdx = allQuestions.indexOf(q)
        const numLines = q.type === 'QRC' ? 5 : 8

        return (
          <View key={q.id} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 10, color: NAVY, fontWeight: 'bold', marginBottom: 2 }}>
              Question {originalIdx + 1} ({getTypeLabel(q.type)} — {q.bareme} pts)
            </Text>
            <Text style={{ fontSize: 9, color: TEXT_DARK, marginBottom: 4 }}>{q.enonce}</Text>
            <AnswerLines count={numLines} />
          </View>
        )
      })}
    </View>
  )
}

// ═══ Document : Sujet ═══

function SujetDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const baremeTotal = data.contenu.baremeTotal ?? data.noteTotal ?? 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Double border */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* Header */}
        <PDFHeader data={data} />

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>ÉPREUVE</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
        </View>

        {/* Metadata */}
        <View style={styles.metadataRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Durée</Text>
            <Text style={styles.metaValue}>{formatDuration(data.duree)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Note totale</Text>
            <Text style={styles.metaValue}>{data.noteTotal ?? baremeTotal} pts</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDate(data.dateDebut)}</Text>
          </View>
        </View>

        {/* Consignes */}
        {data.contenu.consignes ? (
          <View style={styles.consignesBox}>
            <Text style={styles.consignesLabel}>CONSIGNES</Text>
            <Text style={styles.consignesText}>{data.contenu.consignes}</Text>
          </View>
        ) : null}

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* Summary */}
        <Text style={styles.summaryLine}>
          {questions.length} question{questions.length > 1 ? 's' : ''} — Barème total : {baremeTotal} pts
        </Text>

        {/* Questions */}
        {questions.map((q, i) => (
          <QuestionSujet key={q.id || i} question={q} index={i} />
        ))}

        {/* Footer */}
        <PDFFooter data={data} pageNum={1} totalPages={1} isCorrige={false} />
      </Page>
    </Document>
  )
}

// ═══ Document : Corrigé ═══

function CorrigeDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const baremeTotal = data.contenu.baremeTotal ?? data.noteTotal ?? 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Double border */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* Header */}
        <PDFHeader data={data} />

        {/* CONFIDENTIEL label */}
        <Text style={styles.confidentielLabel}>CORRIGÉ TYPE — CONFIDENTIEL</Text>

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>CORRIGÉ TYPE</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
        </View>

        {/* Metadata */}
        <View style={styles.metadataRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Durée</Text>
            <Text style={styles.metaValue}>{formatDuration(data.duree)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Note totale</Text>
            <Text style={styles.metaValue}>{data.noteTotal ?? baremeTotal} pts</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDate(data.dateDebut)}</Text>
          </View>
        </View>

        {/* Consignes */}
        {data.contenu.consignes ? (
          <View style={styles.consignesBox}>
            <Text style={styles.consignesLabel}>CONSIGNES</Text>
            <Text style={styles.consignesText}>{data.contenu.consignes}</Text>
          </View>
        ) : null}

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* Summary */}
        <Text style={styles.summaryLine}>
          {questions.length} question{questions.length > 1 ? 's' : ''} — Barème total : {baremeTotal} pts
        </Text>

        {/* Questions with answers */}
        {questions.map((q, i) => (
          <QuestionCorrige key={q.id || i} question={q} index={i} />
        ))}

        {/* Footer */}
        <PDFFooter data={data} pageNum={1} totalPages={1} isCorrige={true} />
      </Page>
    </Document>
  )
}

// ═══ Document : Feuille de réponses ═══

function FeuilleReponsesDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const mcqQuestions = questions.filter((q) => q.type === 'QCU' || q.type === 'QCM')
  const openQuestions = questions.filter((q) => q.type === 'QRC' || q.type === 'REFLEXION')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Double border */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* Header */}
        <PDFHeader data={data} />

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>FEUILLE DE RÉPONSES</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
        </View>

        {/* Student info */}
        <StudentInfoFields />

        {/* Gold separator */}
        <View style={styles.goldLine} />

        {/* MCQ Grid */}
        <MCQGrid questions={mcqQuestions} allQuestions={questions} />

        {/* Open questions */}
        <OpenQuestionsSection questions={openQuestions} allQuestions={questions} />

        {/* Footer */}
        <PDFFooter data={data} pageNum={1} totalPages={1} isCorrige={false} />
      </Page>
    </Document>
  )
}

// ═══ Exports ═══

export type EpreuvePdfType = 'sujet' | 'corrige' | 'feuille-reponses'

export function EpreuveDocument({ data, type }: { data: EpreuvePDFData; type: EpreuvePdfType }) {
  if (type === 'corrige') return <CorrigeDocument data={data} />
  if (type === 'feuille-reponses') return <FeuilleReponsesDocument data={data} />
  return <SujetDocument data={data} />
}

export async function renderEpreuvePDF(data: EpreuvePDFData, type: EpreuvePdfType = 'sujet'): Promise<Buffer> {
  return await renderToBuffer(<EpreuveDocument data={data} type={type} />)
}

export function getPDFFilename(titre: string, type: EpreuvePdfType): string {
  const prefix = {
    sujet: 'Sujet',
    corrige: 'Corrige',
    'feuille-reponses': 'Feuille_reponses',
  }[type]
  return `${prefix}_${sanitizeFilename(titre)}.pdf`
}
