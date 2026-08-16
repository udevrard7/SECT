// ─────────────────────────────────────────────────────────────
// Types partagés pour les Résultats & Analyses
// ─────────────────────────────────────────────────────────────

/** Épreuve allégée pour les sélecteurs / listes */
export interface EpreuveSummary {
  id: string
  titre: string
  dateDebut: string
  dateFin: string
  statut: string
  noteTotal?: number
  filiere?: { nom: string } | null
}

/** Statistiques d'une épreuve (réponse de /api/resultats?epreuveId=) */
export interface ExamStats {
  totalSessions: number
  soumis: number
  corriges: number
  /** Moyenne normalisée sur /20 (pour comparaison cross-exam) */
  moyenne: number
  /** Médiane normalisée sur /20 */
  mediane: number
  min: number
  max: number
  tauxReussite: number
  noteTotal?: number
  moyennePct?: number
  medianePct?: number
  /** Moyenne brute (sur le barème d'origine, ex: /60) — pour affichage contextuel */
  moyenneBrute?: number
  /** Médiane brute (sur le barème d'origine) */
  medianeBrute?: number
}

/** Détail par question stocké dans Resultat.detailParQuestion (format normalisé frontend) */
export interface QuestionDetail {
  index: number
  type: string
  enonce: string
  pointsMax: number
  pointsObtenus: number | null
  correct: boolean | null
  reponseEtudiant: string | null
  reponseAttendue: string | null
  commentaire?: string | null
  noteIA?: number | null
}

/**
 * Format BRUT tel que stocké en DB (schéma A) — résultat de correction IA.
 * Le backend renvoie detailParQuestion en JSON brut sans normalisation.
 * Voir lib/resultats-utils.ts:normalizeQuestionDetails() pour la conversion.
 */
export interface RawQuestionDetail {
  questionId?: string
  type?: string
  bareme?: number
  score?: number | null
  repondu?: boolean
  noteIA?: number | null
  // Champs potentiellement présents si detailParQuestion déjà au format frontend (schéma B)
  index?: number
  enonce?: string
  pointsMax?: number
  pointsObtenus?: number | null
  correct?: boolean | null
  reponseEtudiant?: string | null
  reponseAttendue?: string | null
  commentaire?: string | null
}

/** Session de passation avec son résultat (vue enseignant) */
export interface SessionResult {
  id: string
  etudiantId: string
  etudiant: {
    id: string
    name: string
    email: string
    filiere?: string | null
  }
  statut: string
  score: number | null
  alertes: number
  dateDebut: string | null
  dateFin: string | null
  penalite?: number
  resultat: {
    id: string
    scoreFinal: number
    detailParQuestion: RawQuestionDetail[] | null
    dateCorrection: string | null
    dateRetour?: string | null
    commentaires?: string | null
  } | null
}

/** Réponse paginée de /api/resultats?epreuveId= */
export interface ExamResultsResponse {
  sessions: SessionResult[]
  stats: ExamStats
  noteTotal?: number
  /** Map {questionId → enonce} depuis Epreuve.contenu.questions (RESULTATS-ENONCE-1).
   *  Permet au frontend d'afficher l'énoncé réel dans SessionDetailDialog. */
  enonceMap?: Record<string, string>
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ─── Overview (cross-exam analytics) ───

export interface OverviewEpreuve {
  id: string
  titre: string
  dateDebut: string
  dateFin: string
  statut: string
  noteTotal: number
  nbSessions: number
  nbCorrigees: number
  moyenne: number // /20
  tauxReussite: number // %
  mediane: number // /20
}

export interface EvolutionPoint {
  mois: string // "YYYY-MM"
  moyenne: number // /20
  count: number
}

export interface StudentAtRisk {
  etudiantId: string
  etudiantName: string
  etudiantEmail: string
  nbExamens: number
  moyenne: number // /20
  derniereNote: number // /20
}

export interface TopQuestion {
  epreuveId: string
  epreuveTitre: string
  questionIndex: number
  enonce: string
  type: string
  tauxReussite: number // %
  count: number
}

export interface OverviewResponse {
  totalEpreuves: number
  totalSessions: number
  totalCorrigees: number
  globalMoyenne: number // /20
  globalTauxReussite: number // %
  epreuves: OverviewEpreuve[]
  evolution: EvolutionPoint[]
  studentsAtRisk: StudentAtRisk[]
  topQuestions: TopQuestion[]
}

// ─── UI types ───

export type SortOrder = 'asc' | 'desc'

export interface ResultatFilters {
  search: string
  statut: 'all' | 'CORRIGEE' | 'SOUMISE' | 'RETOURNEE'
  scoreRange: 'all' | 'success' | 'fail' | 'at-risk'
  filiereId: string
}

export interface ScoreBin {
  name: string
  count: number
  midpoint: number
  min: number
  max: number
}

export interface QuestionSuccess {
  name: string
  taux: number
  type: string
  enonce: string
  index: number
}

// ─── Étudiant : session de résultat ───

export interface EpreuveQuestionInfo {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: string
    enonce: string
    difficulte?: string
  }
}

export interface ReponseInfo {
  id: string
  questionId: string
  contenu: string | null
  score: number | null
  commentaire: string | null
  noteIA: number | null
  justificationIA: string | null
  question?: {
    id: string
    type: string
    enonce: string
  }
}

export interface StudentSessionResultat {
  id: string
  scoreFinal: number
  totalPossible: number
  detailParQuestion: Array<Record<string, unknown>> | null
  dateCorrection: string | null
  dateRetour?: string | null
  commentaires: string | null
}

export interface StudentSession {
  id: string
  etudiantId: string
  epreuveId: string
  statut: string
  score: number | null
  alertes: number
  penalite?: number
  dateDebut: string | null
  dateFin: string | null
  epreuve: {
    id: string
    titre: string
    description: string | null
    duree: number
    noteTotal?: number
    dateFin?: string | null
    contenu?: unknown
    enseignant: { name: string }
    questions: EpreuveQuestionInfo[]
  }
  reponses: ReponseInfo[]
  resultat: StudentSessionResultat | null
}

// ─── Étudiant : overview cross-exam ───

export interface EtudiantOverviewResponse {
  totalEpreuves: number
  totalCorrigees: number
  moyenneGenerale: number // /20
  meilleureNote: number // /20
  moinsBonneNote: number // /20
  tauxReussite: number // %
  tendance: number // /20, positif = progression
  evolution: EvolutionPoint[]
  performanceParType: Array<{ type: string; moyenne: number; count: number }>
  distribution: Array<{ label: string; count: number }>
  recentResults: Array<{
    id: string
    epreuveId: string
    titre: string
    enseignant: string
    statut: string
    score: number
    noteTotal: number
    scoreOn20: number
    percentage: number
    dateFin: string | null
    dateDebut: string | null
    isCorrected: boolean
    isReturned: boolean
  }>
}
