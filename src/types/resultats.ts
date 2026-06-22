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
  moyenne: number
  mediane: number
  min: number
  max: number
  tauxReussite: number
  noteTotal?: number
  moyennePct?: number
  medianePct?: number
}

/** Détail par question stocké dans Resultat.detailParQuestion */
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
    detailParQuestion: QuestionDetail[] | null
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
