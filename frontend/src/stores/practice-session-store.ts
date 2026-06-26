import { create } from 'zustand'

/**
 * Persistance de la série d'entraînement en cours (module Préparation aux
 * examens, onglet Entraînement).
 *
 * Sans ce store, changer d'onglet démonte le composant ExamPrepPracticeTab
 * (les TabsContent sont rendus conditionnellement) et l'étudiant perd sa
 * série en cours (questions générées + index de progression + résultats).
 *
 * Le store conserve la série liée à un documentId. Si l'étudiant change de
 * document, la série précédente est remplacée (on ne garde qu'une série
 * active à la fois, par simplicité).
 */

export interface PracticeQuestionState {
  id: string
  type: string
  enonce: string
  propositions: Array<{ texte: string }> | null
  difficulte: string
  themes: string[]
}

export interface PracticeAttemptResult {
  questionId: string
  attempt: { id: string; score: number; correct: boolean; feedback: string }
  explication: string | null
  reponseCorrecte: string | null
  srs: { nextReviewAt: string; masteryLevel: number; interval: number } | null
}

interface PracticeSessionState {
  /** documentId sur lequel porte la série en cours (null si aucune) */
  documentId: string | null
  /** Configuration utilisée pour générer la série */
  config: { count: number; type: string; difficulte: string; chapterId: string } | null
  questions: PracticeQuestionState[]
  currentIndex: number
  /** Résultats indexés par questionId (pour ne pas perdre la correction en changeant d'onglet) */
  results: Record<string, PracticeAttemptResult>
  /** Indique si une génération est en cours (pour restaurer le loading state) */
  generating: boolean

  setSession: (documentId: string, config: PracticeSessionState['config']) => void
  setQuestions: (questions: PracticeQuestionState[]) => void
  setCurrentIndex: (index: number) => void
  setResult: (questionId: string, result: PracticeAttemptResult) => void
  setGenerating: (generating: boolean) => void
  clearSession: () => void
}

export const usePracticeSessionStore = create<PracticeSessionState>((set) => ({
  documentId: null,
  config: null,
  questions: [],
  currentIndex: 0,
  results: {},
  generating: false,

  setSession: (documentId, config) =>
    set({
      documentId,
      config,
      questions: [],
      currentIndex: 0,
      results: {},
      generating: false,
    }),

  setQuestions: (questions) => set({ questions, currentIndex: 0, results: {} }),

  setCurrentIndex: (index) => set({ currentIndex: index }),

  setResult: (questionId, result) =>
    set((state) => ({
      results: { ...state.results, [questionId]: result },
    })),

  setGenerating: (generating) => set({ generating }),

  clearSession: () =>
    set({
      documentId: null,
      config: null,
      questions: [],
      currentIndex: 0,
      results: {},
      generating: false,
    }),
}))
