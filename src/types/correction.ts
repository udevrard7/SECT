/**
 * Types partagés pour la page Correction.
 *
 * Extraits de src/components/correction/correction-page.tsx (phase 1 de
 * modularisation — voir worklog T2).
 */

export interface CorrectionSession {
  id: string
  statut: string
  score: number | null
  alertes: number
  needsCorrectionCount: number
  allCorrected: boolean
  autoGradedScore: number
  autoGradedTotal: number
  etudiant: { id: string; name: string; email: string }
  epreuve: {
    id: string
    titre: string
    questions: Array<{
      id: string
      questionId: string
      bareme: number
      ordre: number
      question: {
        id: string
        type: string
        enonce: string
        propositions: string[] | null
        reponseCorrecte: string | string[] | null
        difficulte: string
        // CODE-specific fields (extracted from reponseCorrecte JSON)
        langage?: string
        codeInitial?: string
        fonctionSignature?: string
        testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
        testsPrives?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
      }
    }>
  }
  reponses: Array<{
    id: string
    questionId: string
    contenu: string | null
    score: number | null
    noteIA: number | null
    justificationIA: string | null
    commentaire: string | null
  }>
  resultat: {
    id: string
    scoreFinal: number
    detailParQuestion: unknown
    dateCorrection: string | null
  } | null
}

export interface EpreuveOption {
  id: string
  titre: string
  statut: string
  dateDebut: string
  dateFin: string
}

export type GradingMode = 'par-copie' | 'par-question'

export interface RubricCriterion {
  id: string
  label: string
  points: number
}
