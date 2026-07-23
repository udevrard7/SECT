/**
 * epreuve-pdf-react.tsx — Épreuve PDF "Savane EdTech" (A4 portrait)
 *
 * SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : refonte identité "Savane EdTech".
 * Nouvelle palette africaine alignée sur /facturation et /abonnements :
 *   - Vert lime #84CC16 (primary), Terre cuite #C2724E (accent chaud)
 *   - Bleu nuit #1E3A5F (profondeur), Or #D4A843 (luxe africain)
 *   - Motif kente subtil en header + footer (3 couleurs alternées)
 * Suppression des redondances signalées par Ulrich :
 *   - metadataRow (DURÉE/NOTE TOTAL/DATE/NIVEAU) retiré du Sujet ET du Corrigé
 *     → ces infos sont déjà dans la ligne métadonnées du header
 *   - sessionExamen retirée du header (colonne enseignant) → reste UNIQUEMENT
 *     dans le titleSection (badge session), plus de doublon
 *
 * Évolutions précédentes conservées :
 *   - SECT-EPREUVE-PDF-STYLE-V3 : style universitaire épuré SANS BORDURE de page
 *   - SECT-EPREUVE-PDF-HEADER-V5 : header 3 colonnes (logo | institution | enseignant)
 *   - SECT-EPREUVE-PDF-ANONYME-2 : feuille de réponses anonymisée (Matricule/Filière/Date/Salle)
 *   - SECT-EPREUVE-PDF-FONT-FIX-1 : Inter (pas de PlayfairDisplay italic)
 *
 * Refonte structure (conservée) :
 *   - MULTI-PAGE : les questions s'étendent sur plusieurs pages automatiquement
 *   - HEADER (1ère page) : logo + nom établissement + enseignant + métadonnées
 *   - FOOTER FIXÉ : confidentiel | titre | page N/M sur chaque page
 *   - FILIGRANE (watermark) B2B : texte diagonal configurable (certWatermarkText)
 *   - B2B branding : logo + nom + ville/pays + filière + niveau + session
 *   - B2C (Prof Solo) : branding SECT si pas de logo établissement
 *   - Barème récapitulatif : tableau de synthèse des questions en fin de corrige
 *   - Session d'examen : NORMALE / RATTRAPAGE / SPECIALE affichée (titleSection)
 *
 * Design system "Savane EdTech" :
 *   - AUCUNE bordure de page (page blanche, style universitaire classique)
 *   - Fonts : Inter (titres ET corps, sans-serif)
 *   - Palette : BLEU NUIT #1E3A5F (primary text), OR #D4A843 (accent),
 *     LIME #84CC16 + TERRE CUITÉ #C2724E (kente motif)
 *   - Séparateurs : fines lignes horizontales (goldLine) entre sections
 *   - Motif kente : bande tricolore subtile en haut du header et au-dessus du footer
 *   - Header : Logo établissement + nom + ville/pays | UE + filière + niveau + durée + date
 *   - Footer : "Confidentiel" | titre épreuve | page N/M + ligne fine
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, Font, StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import path from 'path'

// SECT-EPREUVE-PDF-HEADER-V5 : logo SECT pour B2C (Prof Solo sans établissement).
// Chemin absolu vers public/sect-logo.png — @react-pdf/renderer支持 les file paths.
const SECT_LOGO_PATH = path.join(process.cwd(), 'public', 'sect-logo.png')

// ═══ Fonts ═══

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'PlayfairDisplay',
  fonts: [
    { src: path.join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'), fontWeight: 'normal' },
  ],
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
  niveau: string | null          // L1/L2/L3/M1/M2/DOCTORAT
  sessionExamen: string | null   // NORMALE/RATTRAPAGE/SPECIALE/EXCEPTIONNELLE/DIFFERE
  etablissement: {
    nom: string
    logo: string | null
    ville: string | null
    pays: string | null
    type: string | null           // PERSONNEL (B2C) vs institution (B2B)
    watermarkText: string | null
    watermarkEnabled: boolean
    watermarkOpacity: number
    watermarkColor: string | null
    watermarkPattern: string | null
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

// ═══ Constants — Palette "Savane EdTech" (SECT-EPREUVE-PDF-SAVANE-EDTECH-1) ═══
// Palette africaine alignée sur l'identité SECT des pages /facturation et
// /abonnements. Les valeurs exactes proviennent du SAVANE_COLORS du frontend :
//   vertLime #84CC16, terreCuite #C2724E, bleuNuit #1E3A5F, or #D4A843.
//
// Mapping des constantes (noms conservés pour ne pas casser les 100+ références) :
//   - NAVY        → bleuNuit #1E3A5F (texte profond, titres, bordures primaires)
//   - GOLD        → or #D4A843 (accent chaud luxe africain)
//   - GOLD_BORDER → or clair #E5C97A (bordures légères or)
//   - EMERALD     → emerald Savane #10B981 (header MCQ, distinct du lime)
//   - CELL_BG     → lime très clair #F0FBE5 (fonds alternés tableaux)
//   - GREEN_*     → lime clair/foncé (boîte corrigé)
//   - CONSIGNE_*  → or clair/foncé (boîte consignes)
//   - RED         → red Savane #EF4444
// Nouvelles constantes :
//   - LIME        = #84CC16 (vert lime Savane, primary brand)
//   - TERRE_CUITE = #C2724E (terre cuite Savane, accent chaud)
//   - KENTE_COLORS = [LIME, TERRE_CUITE, GOLD] (motif kente tricolore)

const NAVY = '#1E3A5F'           // was #065F46 — Bleu nuit Savane (primary text)
const GOLD = '#D4A843'           // was #D97706 — Or africain Savane (accent)
const GOLD_BORDER = '#E5C97A'    // was #FCD34D — Or clair (borders légers)
const TEXT_DARK = '#1F2937'
const TEXT_GRAY = '#6B7280'
const TEXT_FOOTER = '#4B5563'
const WHITE = '#FFFFFF'
const CELL_BG = '#F0FBE5'        // was #ECFDF5 — Vert lime très clair (fonds alternés)
const EMERALD = '#10B981'        // was #0D9488 — Emerald Savane (MCQ header)
const RED = '#EF4444'            // was #DC2626 — Red Savane
const GREEN_BG = '#F0FBE5'       // was #ECFDF5 — Lime clair (boîte corrigé)
const GREEN_BORDER = '#65A30D'   // was #059669 — Lime foncé (border corrigé)
const CONSIGNE_BG = '#FEF7E6'    // was #FFFBEB — Or très clair (boîte consignes)
const CONSIGNE_BORDER = '#D4A843'// was #D97706 — Or (border consignes)
const CODE_BG = '#F5F5FA'
const CODE_BORDER = '#A78BFA'
const LIGHT_GOLD_BG = '#FEF3C7'  // was #FEF9E7 — Or clair pour fonds

// SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : nouvelles constantes Savane pour le motif kente.
const LIME = '#84CC16'           // Vert lime Savane (primary brand)
const TERRE_CUITE = '#C2724E'    // Terre cuite Savane (accent chaud)
const KENTE_COLORS = [LIME, TERRE_CUITE, GOLD]  // Tricolore kente (lime/terre/or)

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

function getTypeShort(type: string): string {
  switch (type) {
    case 'QCU': return 'QCU'
    case 'QCM': return 'QCM'
    case 'QRC': return 'QRC'
    case 'REFLEXION': return 'Réfl.'
    case 'CODE': return 'Code'
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

function getSessionLabel(session: string | null): string {
  if (!session) return ''
  switch (session) {
    case 'NORMALE': return 'Session Normale'
    case 'RATTRAPAGE': return 'Session de Rattrapage'
    case 'SPECIALE': return 'Session Spéciale'
    case 'EXCEPTIONNELLE': return 'Session Exceptionnelle'
    case 'DIFFERE': return 'Session Différée'
    default: return session
  }
}

function getNiveauLabel(niveau: string | null): string {
  if (!niveau) return ''
  switch (niveau) {
    case 'L1': return 'Licence 1 (L1)'
    case 'L2': return 'Licence 2 (L2)'
    case 'L3': return 'Licence 3 (L3)'
    case 'M1': return 'Master 1 (M1)'
    case 'M2': return 'Master 2 (M2)'
    case 'DOCTORAT': return 'Doctorat'
    default: return niveau
  }
}

function isB2B(etablissement: EpreuvePDFData['etablissement']): boolean {
  return etablissement.type !== 'PERSONNEL' && etablissement.type !== null
}

// ═══ Styles ═══

const PAGE_MARGIN_TOP = 52
const PAGE_MARGIN_BOTTOM = 48
const PAGE_MARGIN_HORIZONTAL = 50

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: TEXT_DARK,
    paddingTop: PAGE_MARGIN_TOP,
    paddingBottom: PAGE_MARGIN_BOTTOM,
    paddingHorizontal: PAGE_MARGIN_HORIZONTAL,
    backgroundColor: WHITE,
    position: 'relative',
  },
  // SECT-EPREUVE-PDF-STYLE-V3 : pas de bordure (style universitaire épuré).
  // Les styles outerBorder/innerBorder ont été retirés des 3 documents.
  // SECT-EPREUVE-PDF-HEADER-V5 : header 3 colonnes (logo | institution | enseignant)
  // + séparateur épais + métadonnées avec séparateurs verticaux + bande kente.
  // SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : bande kente tricolore (lime/terre/or)
  // remplace l'ancienne déco "ligne + point central + ligne".
  headerContainer: {
    flexDirection: 'column',
    marginBottom: 10,
  },
  // Ligne 1 : 3 colonnes (logo | institution | enseignant)
  headerRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 70,
  },
  headerLogoCol: {
    width: '18%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenterCol: {
    width: '47%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 12,
  },
  headerRightCol: {
    width: '35%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 70,
    height: 70,
    objectFit: 'contain',
  },
  headerInstName: {
    fontSize: 13,
    fontFamily: 'Inter',
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  headerInstLocation: {
    fontSize: 8.5,
    color: TEXT_GRAY,
    marginBottom: 1,
  },
  headerInstYear: {
    fontSize: 8,
    color: TEXT_GRAY,
    fontStyle: 'italic',
  },
  headerTeacherLabel: {
    fontSize: 7,
    color: TEXT_GRAY,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTeacherName: {
    fontSize: 11,
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  // SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : headerTeacherSession supprimé
  // (la session est désormais uniquement dans le titleSection, plus de doublon).
  // Séparateur principal épais (entre ligne 1 et métadonnées)
  headerMainSeparator: {
    width: '100%',
    height: 3,
    backgroundColor: NAVY,
    marginVertical: 8,
  },
  // Ligne 2 : métadonnées (Filière | UE | Niveau | Durée) avec séparateurs verticaux
  headerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerMetaItem: {
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
  },
  headerMetaLabel: {
    fontSize: 6.5,
    color: TEXT_GRAY,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerMetaValue: {
    fontSize: 9,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerMetaSeparator: {
    width: 1,
    height: 22,
    backgroundColor: GOLD,
  },
  // SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : bande kente tricolore (lime/terre/or).
  // Remplace l'ancienne déco "ligne + point central + ligne". Bande horizontale
  // fine (4pt) composée de cellules colorées alternées — référence subtile au
  // tissu kente africain, sans envahir le document.
  kenteBand: {
    flexDirection: 'row',
    width: '100%',
    height: 4,
    marginVertical: 4,
    borderRadius: 1,
    overflow: 'hidden',
  },
  kenteBandCell: {
    flex: 1,
    height: '100%',
  },
  // Gold separator line
  goldLine: {
    width: '100%',
    height: 1.5,
    backgroundColor: GOLD,
    marginBottom: 10,
  },
  thinGoldLine: {
    width: '100%',
    height: 0.5,
    backgroundColor: GOLD_BORDER,
    marginBottom: 6,
  },
  // Title section
  titleSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 24,
    // SECT-EPREUVE-PDF-STYLE-V2 : Inter bold (sans-serif moderne) au lieu de
    // PlayfairDisplay (serif classique des certificats).
    fontFamily: 'Inter',
    color: NAVY,
    letterSpacing: 3,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  subtitleTitle: {
    fontSize: 14,
    color: TEXT_DARK,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: 9,
    color: TEXT_GRAY,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 4,
  },
  // Session badge
  sessionBadge: {
    fontSize: 9,
    color: GOLD,
    fontWeight: 'bold',
    letterSpacing: 1,
    backgroundColor: LIGHT_GOLD_BG,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: GOLD_BORDER,
    marginBottom: 6,
  },
  // SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : styles metadataRow/metaItem/metaLabel/metaValue
  // supprimés — la section metadataRow (DURÉE/NOTE TOTAL/DATE/NIVEAU) du Sujet et du
  // Corrigé a été retirée car ces infos sont déjà dans la ligne métadonnées du header.
  // (Ds tokens de marges pour uniformiser les wrap containers inline.)
  // Consignes box
  consignesBox: {
    borderWidth: 1,
    borderColor: CONSIGNE_BORDER,
    borderRadius: 3,
    backgroundColor: CONSIGNE_BG,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  consignesLabel: {
    fontSize: 8,
    color: CONSIGNE_BORDER,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 3,
  },
  consignesText: {
    fontSize: 9.5,
    color: TEXT_DARK,
    lineHeight: 1.5,
  },
  // Confidentiel label
  confidentielLabel: {
    fontSize: 11,
    color: RED,
    fontWeight: 'bold',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 8,
  },
  // Summary line
  summaryLine: {
    fontSize: 9,
    color: TEXT_GRAY,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  // Question container (wrap enabled for multi-page)
  questionContainer: {
    marginBottom: 12,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    backgroundColor: CELL_BG,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: GOLD_BORDER,
  },
  questionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  questionNumber: {
    fontSize: 12,
    color: NAVY,
    fontWeight: 'bold',
  },
  questionType: {
    fontSize: 8,
    color: TEXT_GRAY,
  },
  questionBareme: {
    fontSize: 10,
    color: GOLD,
    fontWeight: 'bold',
  },
  questionEnonce: {
    fontSize: 10.5,
    color: TEXT_DARK,
    marginBottom: 6,
    lineHeight: 1.6,
  },
  // Propositions
  propositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    paddingLeft: 8,
  },
  propositionCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  propositionSquare: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  propositionLetter: {
    fontSize: 8,
    color: NAVY,
    fontWeight: 'bold',
  },
  propositionText: {
    fontSize: 10,
    color: TEXT_DARK,
    flex: 1,
  },
  // Answer lines
  answerLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#CBD5E0',
    marginBottom: 12,
    height: 24,
  },
  // Code section
  codeSection: {
    borderWidth: 1,
    borderColor: CODE_BORDER,
    borderRadius: 3,
    backgroundColor: CODE_BG,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  codeLanguage: {
    fontSize: 9,
    color: CODE_BORDER,
    fontWeight: 'bold',
  },
  codeSignature: {
    fontSize: 8,
    color: TEXT_GRAY,
  },
  codeBlock: {
    fontSize: 8.5,
    fontFamily: 'Inter',
    color: '#2D3748',
    lineHeight: 1.5,
  },
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
  // Corrigé answer box
  corrigeBox: {
    borderWidth: 1.5,
    borderColor: GREEN_BORDER,
    borderRadius: 3,
    backgroundColor: GREEN_BG,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  corrigeLabel: {
    fontSize: 9,
    color: GREEN_BORDER,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  corrigeText: {
    fontSize: 10,
    color: '#276749',
    lineHeight: 1.5,
  },
  // Explication box
  explicationBox: {
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    borderRadius: 3,
    backgroundColor: '#F5F3FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  explicationLabel: {
    fontSize: 9,
    color: '#7C3AED',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  explicationText: {
    fontSize: 10,
    color: '#4C1D95',
    lineHeight: 1.5,
  },
  // Separator between questions
  questionSeparator: {
    width: '100%',
    height: 0.5,
    backgroundColor: GOLD_BORDER,
    marginBottom: 4,
  },
  // Footer (fixed on every page)
  footerContainer: {
    position: 'absolute',
    bottom: 28,
    left: PAGE_MARGIN_HORIZONTAL,
    right: PAGE_MARGIN_HORIZONTAL,
  },
  footerGoldLine: {
    width: '100%',
    height: 0.5,
    backgroundColor: GOLD,
    marginBottom: 4,
  },
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
    fontSize: 7.5,
    color: NAVY,
    fontWeight: 'bold',
  },
  footerRight: {
    fontSize: 7,
    color: TEXT_GRAY,
  },
  // SECT-EPREUVE-PDF-STYLE-V4 : footerEtabLine supprimé (ligne "SECT · Épreuve
  // générée via SECT" retirée du footer — demande Ulrich).
  // Barème recap table
  recapTitle: {
    fontSize: 12,
    color: NAVY,
    // SECT-EPREUVE-PDF-STYLE-V2 : Inter au lieu de PlayfairDisplay.
    fontFamily: 'Inter',
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  recapHeaderRow: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 2,
  },
  recapHeaderCell: {
    fontSize: 8,
    color: WHITE,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  recapRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: GOLD_BORDER,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  recapCell: {
    fontSize: 9,
    color: TEXT_DARK,
    textAlign: 'center',
  },
  recapAltRow: {
    backgroundColor: CELL_BG,
  },
  recapTotalRow: {
    flexDirection: 'row',
    backgroundColor: LIGHT_GOLD_BG,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 2,
  },
  recapTotalCell: {
    fontSize: 9,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Feuille de réponses — StudentInfoFields (anonymisé, ANONYME-2)
  studentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  studentField: {
    flexDirection: 'column',
    width: '48%',
  },
  studentLabel: {
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  studentLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E0',
    height: 20,
  },
  // MCQ grid
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
    paddingVertical: 4,
  },
  mcqCell: {
    fontSize: 9,
    color: TEXT_DARK,
    textAlign: 'center',
  },
  mcqCircleCell: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mcqNumberCell: {
    fontSize: 10,
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
  // SECT-EPREUVE-PDF-ANONYME-1 : styles signature* (signatureContainer, signatureBlock,
  // signatureLabel, signatureLine, signatureDateLabel) supprimés — SignatureBlock
  // retiré pour préserver l'anonymat des copies.
  //
  // SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : DS tokens unifiés.
  // Les styles ci-dessous extraient les styles inline dispersés dans les composants
  // (BaremeRecap, StudentInfoFields, MCQGrid, OpenQuestionsSection, CodeSection,
  // PropositionList, AnswerLines, FeuilleReponsesDocument). Centralisation pour
  // harmoniser marges / tailles de police / couleurs à travers les 3 documents.
  // Wrap containers (marges verticales standardisées)
  wrapMb4: { marginBottom: 4 },
  wrapMb6: { marginBottom: 6 },
  wrapMb8: { marginBottom: 8 },
  wrapMb12: { marginBottom: 12 },
  wrapMb14: { marginBottom: 14 },
  // Textes standardisés (feuille de réponses + tests publics code)
  sectionTitleLg: {
    fontSize: 12,
    color: NAVY,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  sectionTitleMd: {
    fontSize: 10,
    color: NAVY,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bodyTextItalic: {
    fontSize: 9,
    color: TEXT_GRAY,
    fontStyle: 'italic',
  },
  noMcqMessage: {
    fontSize: 10,
    color: TEXT_GRAY,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  testsPublicLabel: {
    fontSize: 8,
    color: CODE_BORDER,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  openQuestionHeader: {
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  openQuestionEnonce: {
    fontSize: 9.5,
    color: TEXT_DARK,
    marginBottom: 4,
  },
  mcqCircleCellWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Encouragement message
  encouragementText: {
    fontSize: 10,
    color: NAVY,
    // SECT-EPREUVE-PDF-FONT-FIX-1 : Inter (qui a une variante italic) au lieu
    // de PlayfairDisplay (qui n'est enregistrée qu'en normal). Sinon @react-pdf
    // lève "Could not resolve font for PlayfairDisplay italic" → crash du Sujet.
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  // Watermark overlay (B2B)
  watermarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.04,
  },
  watermarkText: {
    fontSize: 60,
    color: NAVY,
    fontWeight: 'bold',
    letterSpacing: 8,
    transform: 'rotate(-45deg)',
  },
})

// ═══ Composant : Watermark (B2B) ═══

function PDFWatermark({ data }: { data: EpreuvePDFData }) {
  const etab = data.etablissement
  if (!etab.watermarkEnabled || !isB2B(etab)) return null
  const watermarkText = etab.watermarkText || 'ORIGINAL'
  const watermarkColor = etab.watermarkColor || NAVY

  return (
    <View style={styles.watermarkOverlay}>
      <Text style={[styles.watermarkText, { color: watermarkColor }]}>{watermarkText}</Text>
    </View>
  )
}

// ═══ Composant : KenteBand — motif kente tricolore subtil (Savane EdTech) ═══

// SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : bande horizontale kente (lime/terre/or).
// Composé de cellules colorées alternées en flex:1 — répartition uniforme quelle
// que soit la largeur du parent. Bande fine (4pt) pour rester subtile et
// professionnelle, pas folklorique. Utilisée en bas du header (remplace l'ancienne
// déco "ligne + point central + ligne") et au-dessus du footer.
function KenteBand({ cellCount = 36 }: { cellCount?: number }) {
  return (
    <View style={styles.kenteBand} wrap={false}>
      {Array.from({ length: cellCount }).map((_, i) => (
        <View
          key={i}
          style={[styles.kenteBandCell, { backgroundColor: KENTE_COLORS[i % KENTE_COLORS.length] }]}
        />
      ))}
    </View>
  )
}

// ═══ Composant : Header (logo + etab info | UE + filière) — fixed ═══

// SECT-EPREUVE-PDF-HEADER-V5 : header 3 colonnes (logo | institution | enseignant)
// + séparateur épais + métadonnées avec séparateurs verticaux + bande kente.
// B2B : logo + nom de l'établissement. B2C : logo SECT + nom de l'application.
// SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : sessionExamen retirée du header (doublon avec
// le titleSection). Bande kente en bas du header (lime/terre/or) — identité africaine.
function PDFHeader({ data, fixed = false }: { data: EpreuvePDFData; fixed?: boolean }) {
  const etabLocation = [data.etablissement.ville, data.etablissement.pays].filter(Boolean).join(', ')
  const b2b = isB2B(data.etablissement)

  // SECT-EPREUVE-PDF-HEADER-V5 : logo B2B = logo établissement, logo B2C = SECT logo.
  const logoSrc = data.etablissement.logo || SECT_LOGO_PATH
  // Nom affiché : B2B = nom établissement, B2C = "SECT — Plateforme d'évaluation IA"
  const instName = b2b
    ? data.etablissement.nom
    : 'SECT — Plateforme d\'évaluation IA'

  return (
    <View style={styles.headerContainer} {...(fixed ? { fixed: true } : {})}>
      {/* ═══ Ligne 1 : 3 colonnes (logo | institution | enseignant) ═══ */}
      <View style={styles.headerRow1}>
        {/* Colonne gauche : Logo */}
        <View style={styles.headerLogoCol}>
          <PdfImage src={logoSrc} style={styles.headerLogo} alt="" />
        </View>

        {/* Colonne centre : Institution + localisation + année */}
        <View style={styles.headerCenterCol}>
          <Text style={styles.headerInstName}>{instName}</Text>
          {etabLocation ? <Text style={styles.headerInstLocation}>{etabLocation}</Text> : null}
          <Text style={styles.headerInstYear}>Année universitaire : {getAcademicYear()}</Text>
        </View>

        {/* Colonne droite : Enseignant */}
        <View style={styles.headerRightCol}>
          {data.enseignant && data.enseignant.name ? (
            <>
              <Text style={styles.headerTeacherLabel}>ENSEIGNANT</Text>
              <Text style={styles.headerTeacherName}>{data.enseignant.name}</Text>
            </>
          ) : null}
          {/* SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : sessionExamen retirée du header —
              elle est désormais UNIQUEMENT dans le titleSection (badge session),
              plus de doublon. */}
        </View>
      </View>

      {/* ═══ Séparateur principal épais ═══ */}
      <View style={styles.headerMainSeparator} />

      {/* ═══ Ligne 2 : Métadonnées (Filière | UE | Niveau | Durée) ═══ */}
      <View style={styles.headerMetaRow}>
        {/* Filière */}
        <View style={styles.headerMetaItem}>
          <Text style={styles.headerMetaLabel}>FILIÈRE</Text>
          <Text style={styles.headerMetaValue}>
            {data.filiere && data.filiere.nom ? data.filiere.nom : '—'}
          </Text>
        </View>
        <View style={styles.headerMetaSeparator} />
        {/* UE */}
        <View style={styles.headerMetaItem}>
          <Text style={styles.headerMetaLabel}>UE</Text>
          <Text style={styles.headerMetaValue}>
            {data.uniteEnseignement && data.uniteEnseignement.code ? data.uniteEnseignement.code : '—'}
          </Text>
        </View>
        <View style={styles.headerMetaSeparator} />
        {/* Niveau */}
        <View style={styles.headerMetaItem}>
          <Text style={styles.headerMetaLabel}>NIVEAU</Text>
          <Text style={styles.headerMetaValue}>
            {data.niveau ? data.niveau : '—'}
          </Text>
        </View>
        <View style={styles.headerMetaSeparator} />
        {/* Durée */}
        <View style={styles.headerMetaItem}>
          <Text style={styles.headerMetaLabel}>DURÉE</Text>
          <Text style={styles.headerMetaValue}>
            {data.duree ? formatDuration(data.duree) : '—'}
          </Text>
        </View>
        <View style={styles.headerMetaSeparator} />
        {/* Date */}
        <View style={styles.headerMetaItem}>
          <Text style={styles.headerMetaLabel}>DATE</Text>
          <Text style={styles.headerMetaValue}>{formatDate(data.dateDebut)}</Text>
        </View>
      </View>

      {/* ═══ Bande kente tricolore (lime/terre/or) — identité Savane EdTech ═══ */}
      <KenteBand />
    </View>
  )
}

// ═══ Composant : Footer — fixed ═══

function PDFFooter({ data, isCorrige }: { data: EpreuvePDFData; isCorrige: boolean }) {
  const maxTitleLen = 45
  const title = data.titre.length > maxTitleLen ? data.titre.slice(0, maxTitleLen) + '…' : data.titre
  const label = isCorrige ? 'CORRIGÉ CONFIDENTIEL' : 'CONFIDENTIEL'

  return (
    <View fixed style={styles.footerContainer}>
      {/* SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : bande kente au-dessus du footer
          (symétrie avec le header — identité africaine subtile). */}
      <KenteBand />
      <View style={styles.footerGoldLine} />
      <View style={styles.footerRow}>
        <Text style={styles.footerLeft}>{label}</Text>
        <Text style={styles.footerCenter}>{title}</Text>
        <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}`} />
      </View>
      {/* SECT-EPREUVE-PDF-STYLE-V4 : ligne "SECT · Épreuve générée via SECT" retirée (demande Ulrich). */}
    </View>
  )
}

// ═══ Composant : Question rendering ═══

function PropositionList({ question }: { question: PDFQuestion }) {
  if (!question.propositions || question.propositions.length === 0) return null
  const isQCU = question.type === 'QCU'

  return (
    <View style={styles.wrapMb4} wrap={false}>
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
    <View style={styles.wrapMb4} wrap={false}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.answerLine} />
      ))}
    </View>
  )
}

function CodeSection({ question }: { question: PDFQuestion }) {
  const codeText = question.codeInitial || '// Écrire votre code ici'

  return (
    <View style={styles.codeSection} wrap={false}>
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
        <View style={{ marginTop: 6 }} wrap={false}>
          <Text style={styles.testsPublicLabel}>
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
    <View style={styles.questionContainer} wrap>
      {/* Header: Question N + type | bareme */}
      <View style={styles.questionHeader} wrap={false}>
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
      <View style={styles.corrigeBox} wrap={false}>
        <Text style={styles.corrigeLabel}>✓ Réponse correcte :</Text>
        <Text style={styles.corrigeText}>{correctLabels.join(' ; ')}</Text>
      </View>
    )
  }

  // QRC/REFLEXION model response
  if (question.type === 'QRC' || question.type === 'REFLEXION') {
    const text = Array.isArray(question.reponseCorrecte) ? question.reponseCorrecte.join('\n') : question.reponseCorrecte
    const label = question.type === 'QRC' ? '✓ Réponse modèle :' : '✓ Guide de correction :'

    return (
      <View style={styles.corrigeBox} wrap={false}>
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
    <View style={styles.explicationBox} wrap={false}>
      <Text style={styles.explicationLabel}>💡 Explication :</Text>
      <Text style={styles.explicationText}>{question.explication}</Text>
    </View>
  )
}

function QuestionCorrige({ question, index }: { question: PDFQuestion; index: number }) {
  return (
    <View style={styles.questionContainer} wrap>
      {/* Header */}
      <View style={styles.questionHeader} wrap={false}>
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

// ═══ Composant : Barème récapitulatif ═══

function BaremeRecap({ questions }: { questions: PDFQuestion[] }) {
  if (questions.length === 0) return null
  const totalBareme = questions.reduce((sum, q) => sum + q.bareme, 0)

  return (
    <View style={styles.wrapMb12} wrap={false}>
      <Text style={styles.recapTitle}>Récapitulatif du barème</Text>

      {/* Header row */}
      <View style={styles.recapHeaderRow}>
        <Text style={[styles.recapHeaderCell, { flex: 0.5 }]}>N°</Text>
        <Text style={[styles.recapHeaderCell, { flex: 1.5 }]}>Type</Text>
        <Text style={[styles.recapHeaderCell, { flex: 3 }]}>Question</Text>
        <Text style={[styles.recapHeaderCell, { flex: 1 }]}>Barème</Text>
      </View>

      {/* Body rows */}
      {questions.map((q, i) => (
        <View key={q.id || i} style={[styles.recapRow, i % 2 === 1 ? styles.recapAltRow : {}]}>
          <Text style={[styles.recapCell, { flex: 0.5, fontWeight: 'bold' }]}>{i + 1}</Text>
          <Text style={[styles.recapCell, { flex: 1.5 }]}>{getTypeShort(q.type)}</Text>
          <Text style={[styles.recapCell, { flex: 3, fontSize: 8 }]}>{q.enonce.substring(0, 60)}{q.enonce.length > 60 ? '…' : ''}</Text>
          <Text style={[styles.recapCell, { flex: 1, fontWeight: 'bold' }]}>{q.bareme} pts</Text>
        </View>
      ))}

      {/* Total row */}
      <View style={styles.recapTotalRow}>
        <Text style={[styles.recapTotalCell, { flex: 5, textAlign: 'right' }]}>TOTAL</Text>
        <Text style={[styles.recapTotalCell, { flex: 1 }]}>{totalBareme} pts</Text>
      </View>
    </View>
  )
}

// ═══ Composant : Feuille de réponses ═══

// SECT-EPREUVE-PDF-ANONYME-2 : StudentInfoFields restauré en version anonymisée.
// Seuls les champs contextuels (Matricule, Filière, Date, Salle) sont conservés.
// Nom et Prénom sont retirés pour préserver l'anonymat de la copie lors de la
// correction à l'aveugle. Le matricule permet d'identifier la copie après correction.
function StudentInfoFields() {
  return (
    <View style={styles.wrapMb12} wrap={false}>
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
      <View style={styles.studentInfoRow}>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Date :</Text>
          <View style={styles.studentLine} />
        </View>
        <View style={styles.studentField}>
          <Text style={styles.studentLabel}>Salle :</Text>
          <View style={styles.studentLine} />
        </View>
      </View>
    </View>
  )
}

function MCQGrid({ questions, allQuestions }: { questions: PDFQuestion[]; allQuestions: PDFQuestion[] }) {
  if (questions.length === 0) {
    return (
      <Text style={styles.noMcqMessage} wrap={false}>
        Aucune question QCM/QCU dans cette épreuve.
      </Text>
    )
  }

  const maxProps = Math.max(...questions.map((q) => q.propositions?.length || 0), 4)
  const letterCols = Array.from({ length: maxProps }, (_, i) => String.fromCharCode(65 + i))
  const letterColWidth = Math.max(Math.floor((485 - 30 - 50) / maxProps), 30)

  return (
    <View style={styles.wrapMb14} wrap={false}>
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
                <View key={ci} style={[styles.mcqCircleCellWrap, { width: letterColWidth }]}>
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
    <View style={styles.wrapMb8} wrap>
      <Text style={styles.sectionTitleLg}>
        Questions ouvertes
      </Text>
      {questions.map((q) => {
        const originalIdx = allQuestions.indexOf(q)
        const numLines = q.type === 'QRC' ? 5 : 8

        return (
          <View key={q.id} style={styles.wrapMb12} wrap>
            <Text style={styles.openQuestionHeader} wrap={false}>
              Question {originalIdx + 1} ({getTypeLabel(q.type)} — {q.bareme} pts)
            </Text>
            <Text style={styles.openQuestionEnonce}>{q.enonce}</Text>
            <AnswerLines count={numLines} />
          </View>
        )
      })}
    </View>
  )
}

// SECT-EPREUVE-PDF-ANONYME-1 : SignatureBlock supprimé pour préserver
// l'anonymat des copies (blocs "Signature de l'étudiant" + "Visa de l'enseignant" retirés).

// ═══ Document : Sujet (multi-page) ═══

function SujetDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const baremeTotal = data.contenu.baremeTotal ?? data.noteTotal ?? 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark (B2B) */}
        <PDFWatermark data={data} />

        {/* Header (fixed) */}
        <PDFHeader data={data} />

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* Title */}
        <View style={styles.titleSection} wrap={false}>
          <Text style={styles.mainTitle}>ÉPREUVE</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
          {data.description ? (
            <Text style={styles.descriptionText}>{data.description}</Text>
          ) : null}
          {data.sessionExamen ? (
            <Text style={styles.sessionBadge}>{getSessionLabel(data.sessionExamen)}</Text>
          ) : null}
        </View>

        {/* SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : metadataRow supprimé (DURÉE/NOTE TOTAL/DATE/NIVEAU)
            — ces infos sont déjà dans la ligne métadonnées du header, plus de doublon. */}

        {/* Consignes */}
        {data.contenu.consignes ? (
          <View style={styles.consignesBox} wrap={false}>
            <Text style={styles.consignesLabel}>CONSIGNES</Text>
            <Text style={styles.consignesText}>{data.contenu.consignes}</Text>
          </View>
        ) : null}

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* Summary */}
        <Text style={styles.summaryLine} wrap={false}>
          {questions.length} question{questions.length > 1 ? 's' : ''} — Barème total : {baremeTotal} pts
        </Text>

        {/* Questions (wrap across pages) */}
        {questions.map((q, i) => (
          <QuestionSujet key={q.id || i} question={q} index={i} />
        ))}

        {/* SECT-EPREUVE-PDF-STYLE-V4 : Barème récapitulatif retiré du Sujet —
            ne figure que sur le Corrigé (demande Ulrich). */}

        {/* Encouragement */}
        <Text style={styles.encouragementText} wrap={false}>
          Bon courage !
        </Text>

        {/* Footer (fixed) */}
        <PDFFooter data={data} isCorrige={false} />
      </Page>
    </Document>
  )
}

// ═══ Document : Corrigé (multi-page) ═══

function CorrigeDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const baremeTotal = data.contenu.baremeTotal ?? data.noteTotal ?? 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark (B2B — "CONFIDENTIEL" for corrigé) */}
        <PDFWatermark data={data} />

        {/* Header */}
        <PDFHeader data={data} />

        {/* CONFIDENTIEL label */}
        <Text style={styles.confidentielLabel} wrap={false}>CORRIGÉ TYPE — CONFIDENTIEL</Text>

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* Title */}
        <View style={styles.titleSection} wrap={false}>
          <Text style={styles.mainTitle}>CORRIGÉ TYPE</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
          {data.description ? (
            <Text style={styles.descriptionText}>{data.description}</Text>
          ) : null}
          {data.sessionExamen ? (
            <Text style={styles.sessionBadge}>{getSessionLabel(data.sessionExamen)}</Text>
          ) : null}
        </View>

        {/* SECT-EPREUVE-PDF-SAVANE-EDTECH-1 : metadataRow supprimé (DURÉE/NOTE TOTAL/DATE/NIVEAU)
            — ces infos sont déjà dans la ligne métadonnées du header, plus de doublon. */}

        {/* Consignes */}
        {data.contenu.consignes ? (
          <View style={styles.consignesBox} wrap={false}>
            <Text style={styles.consignesLabel}>CONSIGNES</Text>
            <Text style={styles.consignesText}>{data.contenu.consignes}</Text>
          </View>
        ) : null}

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* Summary */}
        <Text style={styles.summaryLine} wrap={false}>
          {questions.length} question{questions.length > 1 ? 's' : ''} — Barème total : {baremeTotal} pts
        </Text>

        {/* Questions with answers (wrap across pages) */}
        {questions.map((q, i) => (
          <QuestionCorrige key={q.id || i} question={q} index={i} />
        ))}

        {/* Barème récapitulatif */}
        <BaremeRecap questions={questions} />

        {/* Footer */}
        <PDFFooter data={data} isCorrige={true} />
      </Page>
    </Document>
  )
}

// ═══ Document : Feuille de réponses (multi-page) ═══

function FeuilleReponsesDocument({ data }: { data: EpreuvePDFData }) {
  const questions = data.contenu.questions || []
  const mcqQuestions = questions.filter((q) => q.type === 'QCU' || q.type === 'QCM')
  const openQuestions = questions.filter((q) => q.type === 'QRC' || q.type === 'REFLEXION')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark (B2B) */}
        <PDFWatermark data={data} />

        {/* Header */}
        <PDFHeader data={data} />

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* Title */}
        <View style={styles.titleSection} wrap={false}>
          <Text style={styles.mainTitle}>FEUILLE DE RÉPONSES</Text>
          <Text style={styles.subtitleTitle}>{data.titre}</Text>
          {data.sessionExamen ? (
            <Text style={styles.sessionBadge}>{getSessionLabel(data.sessionExamen)}</Text>
          ) : null}
        </View>

        {/* SECT-EPREUVE-PDF-ANONYME-2 : StudentInfoFields restauré en version anonymisée.
            Seuls Matricule, Filière, Date, Salle (pas de Nom/Prénom) pour l'anonymat copie. */}
        <StudentInfoFields />

        {/* Gold separator */}
        <View style={styles.goldLine} wrap={false} />

        {/* MCQ Grid */}
        <MCQGrid questions={mcqQuestions} allQuestions={questions} />

        {/* Code questions notice */}
        {questions.some(q => q.type === 'CODE') ? (
          <View style={styles.wrapMb8} wrap={false}>
            <Text style={styles.sectionTitleMd}>
              Questions de code (programmation)
            </Text>
            <Text style={styles.bodyTextItalic}>
              Les questions de type Code seront rédigées directement sur la plateforme SECT.
              L'espace ci-dessous est réservé pour vos brouillons.
            </Text>
            <AnswerLines count={6} />
          </View>
        ) : null}

        {/* Open questions */}
        <OpenQuestionsSection questions={openQuestions} allQuestions={questions} />

        {/* SECT-EPREUVE-PDF-ANONYME-1 : SignatureBlock (étudiant + enseignant)
            retiré pour préserver l'anonymat des copies (demande Ulrich). */}

        {/* Footer */}
        <PDFFooter data={data} isCorrige={false} />
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
