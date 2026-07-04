'use client'

// ─────────────────────────────────────────────────────────────
// Hook contrôleur pour la page Correction.
//
// Encapsule TOUTE la logique métier de la page Correction :
//   - état UI (épreuve/session sélectionnées, mode de correction…)
//   - données (TanStack Query : épreuves, sessions)
//   - mutations (AI grade, save, finalize, batch…)
//   - valeurs calculées (questions, réponse courante, barème, stats…)
//   - effets (reset des champs quand on change de question/session)
//   - handlers (save, AI grade, apply AI, finalize, batch, navigation…)
//   - raccourcis clavier (flèches, Ctrl+S) avec refs anti-stale-closure
//
// L'orchestrateur `CorrectionPage` devient purement présentationnel :
// il appelle ce hook et passe les valeurs/handlers aux composants
// (Toolbar, Sidebar, ParCopieView, ParQuestionView).
//
// Extrait de correction-page.tsx (phase 3, finalisation — voir worklog T3).
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { CorrectionSession, GradingMode, RubricCriterion } from '@/types/correction'
import { generateRubricCriteria } from '@/lib/correction-utils'
import {
  useEpreuvesForCorrection,
  useCorrectionSessions,
  useAiGrade,
  useSaveGrade,
  useFinalizeSession,
  useBatchAiGrade,
  useBatchReturn,
} from '@/hooks/use-correction'

// ─── Type du user (minimal, évite l'import circulaire avec le store) ───
interface CurrentUser {
  id: string
}

/**
 * Conteneur d'état et de logique pour la page Correction.
 *
 * @param user l'utilisateur courant (depuis useAuthStore) — doit être un
 *             enseignant ; son `id` sert à filtrer les épreuves/sessions.
 */
export function useCorrectionState(user: CurrentUser | null) {
  const mainContentRef = useRef<HTMLDivElement>(null)

  // ─── Panel state ───
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // ─── Data (TanStack Query) ───
  const epreuvesQuery = useEpreuvesForCorrection(user?.id)
  const epreuves = epreuvesQuery.data ?? []
  const isLoadingEpreuves = epreuvesQuery.isLoading

  const sessionsQuery = useCorrectionSessions(user?.id, selectedEpreuveId || undefined)
  const sessions = sessionsQuery.data ?? []
  const isLoadingSessions = sessionsQuery.isLoading

  // UX-FIX : auto-sélection de l'épreuve si une seule a des soumissions.
  // Avant, l'enseignant devait manuellement sélectionner l'épreuve dans le
  // dropdown même si une seule avait des copies à corriger.
  useEffect(() => {
    if (!selectedEpreuveId && epreuves.length === 1) {
      setSelectedEpreuveId(epreuves[0].id)
    }
  }, [epreuves, selectedEpreuveId])

  // ─── Mutations (TanStack Query) ───
  const aiGradeMutation = useAiGrade()
  const saveGradeMutation = useSaveGrade()
  const finalizeMutation = useFinalizeSession()
  const batchAiGradeMutation = useBatchAiGrade()
  const batchReturnMutation = useBatchReturn()

  // ─── Grading state ───
  const [gradingMode, setGradingMode] = useState<GradingMode>('par-copie')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [horizontalQuestionIndex, setHorizontalQuestionIndex] = useState(0)
  const [noteFinale, setNoteFinale] = useState<string>('')
  const [commentaire, setCommentaire] = useState<string>('')
  const [selectedCriteria, setSelectedCriteria] = useState<Set<string>>(new Set())
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isBatchAiLoading, setIsBatchAiLoading] = useState(false)
  const [isBatchReturning, setIsBatchReturning] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [showAiSuggestion, setShowAiSuggestion] = useState(true)
  const [isApplyingAi, setIsApplyingAi] = useState(false)

  // Horizontal grading per-student state
  const [horizontalScores, setHorizontalScores] = useState<Record<string, string>>({})
  const [horizontalComments, setHorizontalComments] = useState<Record<string, string>>({})
  const [horizontalCriteria, setHorizontalCriteria] = useState<Record<string, Set<string>>>({})
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null)

  // ─── UI state ───
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [expectedAnswerOpen, setExpectedAnswerOpen] = useState(true)
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(true)

  // ─── Reset selected session quand on change d'épreuve ───
  useEffect(() => {
    setSelectedSessionId(null)
  }, [selectedEpreuveId])

  // ─── Selected session ───
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

  // ─── Questions list (sorted by ordre) ───
  // BUGFIX (CORRECTION-FIX-1): epreuve.questions peut être undefined car
  // l'API /api/correction ne retourne pas l'objet epreuve imbriqué.
  const questions = selectedSession?.epreuve?.questions
    ? [...selectedSession.epreuve.questions].sort((a, b) => a.ordre - b.ordre)
    : []

  // ─── Horizontal grading: all questions from first session ───
  const horizontalQuestions = useMemo(() => {
    if (sessions.length === 0) return []
    const first = sessions[0]
    if (!first?.epreuve?.questions) return []
    return [...first.epreuve.questions].sort((a, b) => a.ordre - b.ordre)
  }, [sessions])

  // ─── Current question ───
  const currentQuestion = questions[currentQuestionIndex] ?? null

  // ─── Current response ───
  const currentReponse = currentQuestion
    ? selectedSession?.reponses.find((r) => r.questionId === currentQuestion.questionId || r.questionId === currentQuestion.id) ?? null
    : null

  // ─── Rubric criteria for current question ───
  const currentRubricCriteria = useMemo(() => {
    if (!currentQuestion) return []
    // E2E-CORRECTION-FIX : currentQuestion.type (pas currentQuestion.question.type)
    // car l'API /api/correction retourne type/enonce directement sur l'objet question.
    const qType = (currentQuestion as { type?: string; question?: { type?: string } }).type
      || (currentQuestion as { question?: { type?: string } }).question?.type
      || 'QRC'
    return generateRubricCriteria(qType, currentQuestion.bareme)
  }, [currentQuestion])

  // ─── Computed score from selected criteria ───
  const computedScore = useMemo(() => {
    let total = 0
    selectedCriteria.forEach((id) => {
      const criterion = currentRubricCriteria.find((c) => c.id === id)
      if (criterion) total += criterion.points
    })
    return Math.min(total, currentQuestion?.bareme ?? 0)
  }, [selectedCriteria, currentRubricCriteria, currentQuestion?.bareme])

  // ─── Reset correction fields when question/session changes ───
  useEffect(() => {
    if (currentReponse) {
      setNoteFinale(currentReponse.score !== null ? String(currentReponse.score) : '')
      setCommentaire(currentReponse.commentaire ?? '')
      if (currentReponse.score !== null && currentQuestion) {
        // E2E-CORRECTION-FIX : currentQuestion.type (pas currentQuestion.question.type)
        const qType = (currentQuestion as { type?: string; question?: { type?: string } }).type
          || (currentQuestion as { question?: { type?: string } }).question?.type
          || 'QRC'
        const criteria = generateRubricCriteria(qType, currentQuestion.bareme)
        const newSelected = new Set<string>()
        let remaining = currentReponse.score
        const sortedByPoints = [...criteria].sort((a, b) => b.points - a.points)
        for (const c of sortedByPoints) {
          if (c.points > 0 && remaining >= c.points) {
            newSelected.add(c.id)
            remaining -= c.points
          }
        }
        setSelectedCriteria(newSelected)
      } else {
        setSelectedCriteria(new Set())
      }
    } else {
      setNoteFinale('')
      setCommentaire('')
      setSelectedCriteria(new Set())
    }
    setShowAiSuggestion(true)
    setAiSuggestionOpen(true)
    setExpectedAnswerOpen(false)
  }, [currentQuestionIndex, selectedSessionId])

  // ─── Filtered sessions ───
  const filteredSessions = sessions.filter((s) => {
    if (!searchFilter) return true
    const q = searchFilter.toLowerCase()
    return (
      (s.etudiant?.name ?? s.etudiantNom ?? '').toLowerCase().includes(q) ||
      (s.etudiant?.email ?? s.etudiantEmail ?? '').toLowerCase().includes(q)
    )
  })

  // ─── Stats ───
  const totalQuestions = questions.length
  const manualCorrectedCount = questions.filter((q) => {
    const rep = selectedSession?.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
    return rep?.score !== null && rep?.score !== undefined
  }).length
  const needsCorrectionCount = questions.filter((q) => {
    const rep = selectedSession?.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
    return !rep || rep.score === null
  }).length

  // ─── Horizontal grading stats ───
  const horizontalCurrentQuestion = horizontalQuestions[horizontalQuestionIndex] ?? null
  const horizontalGradedCount = useMemo(() => {
    if (!horizontalCurrentQuestion) return 0
    return sessions.filter((s) => {
      const rep = s.reponses.find(
        (r) => r.questionId === horizontalCurrentQuestion.questionId || r.questionId === horizontalCurrentQuestion.id
      )
      return rep?.score !== null && rep?.score !== undefined
    }).length
  }, [sessions, horizontalCurrentQuestion])

  // ─── Global progress ───
  const globalProgress = useMemo(() => {
    if (sessions.length === 0) return 0
    const totalToCorrect = sessions.reduce((acc, s) => acc + s.needsCorrectionCount + (s.allCorrected ? 0 : 0), 0)
    const totalQuestionsAll = sessions.reduce((acc, s) => {
      const qCount = s.epreuve?.questions?.length ?? 0
      return acc + qCount
    }, 0)
    const corrected = totalQuestionsAll - totalToCorrect
    return totalQuestionsAll > 0 ? (corrected / totalQuestionsAll) * 100 : 0
  }, [sessions])

  // ─── Toggle criterion ───
  const handleToggleCriterion = (id: string) => {
    setSelectedCriteria((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ─── AI Grade handler ───
  const handleAiGrade = async (sessionId?: string, questionId?: string) => {
    const sid = sessionId ?? selectedSessionId
    const qid = questionId ?? currentQuestion?.questionId
    if (!sid || !qid) return
    setIsAiLoading(true)
    // UX-FIX : toast loading persistant pendant que le worker IA tourne.
    // Avant, le toast success disparaissait immédiatement (202 Accepted) et
    // l'utilisateur ne savait pas si l'IA travaillait encore. Le bouton
    // montrait un spinner mais disparaissait dès la réponse 202.
    const loadingToast = toast.loading('Évaluation IA en cours...', {
      description: 'L\'IA analyse la réponse de l\'étudiant. Cela peut prendre 15-30 secondes.',
      duration: Infinity,
    })
    try {
      const data = await aiGradeMutation.mutateAsync({ sessionId: sid, questionId: qid })
      toast.dismiss(loadingToast)
      // P3-CORRECTION : le backend retourne 202 Accepted (async worker).
      // data.noteIA n'existe pas — le worker écrit noteIA sur la Reponse
      // en arrière-plan. Le polling (refetchInterval sur useCorrectionSessions)
      // rafraîchit automatiquement les données quand noteIA est non-null.
      toast.success('Évaluation IA lancée', {
        description: data.message || 'La correction IA est en cours. Les résultats apparaîtront automatiquement dans quelques secondes.',
        duration: 6000,
      })
    } catch (err) {
      toast.dismiss(loadingToast)
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Impossible d\'évaluer avec l\'IA.',
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  // ─── Apply AI suggestion ───
  const handleApplyAi = async () => {
    if (!selectedSessionId || !currentQuestion || !currentReponse) return
    if (currentReponse.noteIA === null) return
    setIsApplyingAi(true)
    setNoteFinale(String(currentReponse.noteIA))
    if (currentReponse.justificationIA) {
      setCommentaire(currentReponse.justificationIA)
    }
    try {
      await saveGradeMutation.mutateAsync({
        sessionId: selectedSessionId,
        questionId: currentQuestion.questionId,
        score: currentReponse.noteIA,
        commentaire: currentReponse.justificationIA || null,
      })
      toast.success('Suggestion IA appliquée', {
        description: `Note ${currentReponse.noteIA}/${currentQuestion.bareme} enregistrée.`,
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'appliquer la suggestion.',
      })
    } finally {
      setIsApplyingAi(false)
      setShowAiSuggestion(false)
    }
  }

  // ─── Dismiss AI suggestion ───
  const handleDismissAi = () => {
    setShowAiSuggestion(false)
  }

  // ─── Save handler ───
  const handleSave = async (sessionId?: string, questionId?: string, score?: number, comment?: string) => {
    const sid = sessionId ?? selectedSessionId
    const qid = questionId ?? currentQuestion?.questionId
    if (!sid || !qid) return
    const finalScore = score ?? (noteFinale !== '' ? parseFloat(noteFinale) : null)
    const finalComment = comment ?? (commentaire || null)
    const bareme = currentQuestion?.bareme ?? 0

    if (finalScore !== null && (isNaN(finalScore) || finalScore < 0 || finalScore > bareme)) {
      toast.error('Note invalide', {
        description: `La note doit être comprise entre 0 et ${bareme}.`,
      })
      return
    }

    if (sessionId) {
      setSavingSessionId(sessionId)
    } else {
      setIsSaving(true)
    }
    try {
      await saveGradeMutation.mutateAsync({
        sessionId: sid,
        questionId: qid,
        score: finalScore,
        commentaire: finalComment,
      })
      toast.success('Note sauvegardée', {
        description: 'La correction a été enregistrée.',
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de sauvegarder.',
      })
    } finally {
      if (sessionId) {
        setSavingSessionId(null)
      } else {
        setIsSaving(false)
      }
    }
  }

  // ─── Finalize handler ───
  const handleFinalize = async (sessionId?: string) => {
    const sid = sessionId ?? selectedSessionId
    if (!sid) return
    setIsFinalizing(true)
    try {
      await finalizeMutation.mutateAsync({ sessionId: sid })
      toast.success('Correction finalisée et copie rendue', {
        description: 'La note finale a été calculée et la copie a été rendue à l\'étudiant.',
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de finaliser la correction.',
      })
    } finally {
      setIsFinalizing(false)
    }
  }

  // ─── Batch AI Grade handler ───
  const handleBatchAiGrade = async () => {
    if (!selectedSessionId) return
    setIsBatchAiLoading(true)
    try {
      const data = await batchAiGradeMutation.mutateAsync({ sessionId: selectedSessionId })
      toast.success('Évaluation IA terminée', {
        description: data.message || `${data.graded} questions évaluées par l'IA`,
      })
    } catch (err) {
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Impossible d\'évaluer avec l\'IA.',
      })
    } finally {
      setIsBatchAiLoading(false)
    }
  }

  // ─── Apply all AI suggestions (E2E-IMPROVE-3) ───
  // Applique les noteIA existantes comme score définitif pour toutes les
  // réponses non encore corrigées (score=null) de la session sélectionnée.
  // L'enseignant garde le contrôle : il peut override individuellement après.
  // Comportement attendu : l'IA suggère, l'humain décide — mais ce bouton
  // évite de devoir cliquer "Appliquer" sur chaque question quand l'enseignant
  // est satisfait des suggestions globales.
  const [isApplyingAllAi, setIsApplyingAllAi] = useState(false)
  const handleApplyAllAiSuggestions = async () => {
    if (!selectedSessionId || !selectedSession) return
    // Collecter les réponses non corrigées avec noteIA
    const toApply = selectedSession.reponses.filter(
      (r) => r.score === null && r.noteIA !== null && r.noteIA !== undefined
    )
    if (toApply.length === 0) {
      toast.info('Aucune suggestion à appliquer', {
        description: 'Toutes les réponses sont déjà corrigées ou sans suggestion IA.',
      })
      return
    }
    setIsApplyingAllAi(true)
    let applied = 0
    let failed = 0
    try {
      for (const r of toApply) {
        try {
          await saveGradeMutation.mutateAsync({
            sessionId: selectedSessionId,
            questionId: r.questionId,
            score: r.noteIA!,
            commentaire: r.justificationIA
              ? `Note IA appliquée : ${r.justificationIA}`
              : 'Note IA appliquée (validation enseignant)',
          })
          applied++
        } catch {
          failed++
        }
      }
      if (applied > 0) {
        toast.success('Suggestions IA appliquées', {
          description: `${applied} réponse(s) corrigée(s) avec les notes IA${failed > 0 ? `, ${failed} échec(s)` : ''}. Vous pouvez ajuster individuellement.`,
        })
      } else {
        toast.error('Échec', {
          description: 'Impossible d\'appliquer les suggestions IA.',
        })
      }
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Erreur lors de l\'application.',
      })
    } finally {
      setIsApplyingAllAi(false)
    }
  }

  // ─── Batch return handler ───
  const handleBatchReturn = async () => {
    if (!selectedEpreuveId) return
    setIsBatchReturning(true)
    try {
      const data = await batchReturnMutation.mutateAsync({ epreuveId: selectedEpreuveId })
      toast.success('Copies retournées', {
        description: data.message || `${data.returned} copies retournées`,
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de retourner les copies.',
      })
    } finally {
      setIsBatchReturning(false)
    }
  }

  // ─── Navigate questions ───
  const goToQuestion = (index: number) => {
    if (index >= 0 && index < totalQuestions) {
      setCurrentQuestionIndex(index)
      // Scroll the Radix ScrollArea viewport to top
      const viewport = mainContentRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      viewport?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // ─── Horizontal grading: toggle criterion for a specific session ───
  const handleHorizontalToggleCriterion = (sessionId: string, criterionId: string, criteria: RubricCriterion[]) => {
    setHorizontalCriteria((prev) => {
      const hKey = `${sessionId}::${horizontalCurrentQuestion?.questionId ?? ""}`
      const current = prev[hKey] ?? new Set()
      const next = new Set(current)
      if (next.has(criterionId)) {
        next.delete(criterionId)
      } else {
        next.add(criterionId)
      }
      let total = 0
      next.forEach((id) => {
        const c = criteria.find((cr) => cr.id === id)
        if (c) total += c.points
      })
      const capped = Math.min(total, horizontalCurrentQuestion?.bareme ?? 0)
      setHorizontalScores((prev2) => ({ ...prev2, [hKey]: String(Math.round(capped * 10) / 10) }))
      return { ...prev, [hKey]: next }
    })
  }

  // ─── Horizontal grading: save for one session ───
  const handleHorizontalSave = async (sessionId: string) => {
    if (!horizontalCurrentQuestion) return
    const hKey = `${sessionId}::${horizontalCurrentQuestion.questionId}`
    const score = horizontalScores[hKey]
    const comment = horizontalComments[hKey] ?? null
    const finalScore = score !== undefined && score !== '' ? parseFloat(score) : null
    if (finalScore !== null && (isNaN(finalScore) || finalScore < 0 || finalScore > horizontalCurrentQuestion.bareme)) {
      toast.error('Note invalide', {
        description: `La note doit être comprise entre 0 et ${horizontalCurrentQuestion.bareme}.`,
      })
      return
    }
    setSavingSessionId(sessionId)
    try {
      await saveGradeMutation.mutateAsync({
        sessionId,
        questionId: horizontalCurrentQuestion.questionId,
        score: finalScore,
        commentaire: comment,
      })
      toast.success('Note sauvegardée', {
        description: 'La correction a été enregistrée.',
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de sauvegarder.',
      })
    } finally {
      setSavingSessionId(null)
    }
  }

  // ─── Get reponse for a session+question ───
  const getReponseForSession = (session: CorrectionSession, questionId: string) => {
    return session.reponses.find((r) => r.questionId === questionId || r.questionId === questionId) ?? null
  }

  // ─── Keyboard shortcuts ───
  // Refs vers les dernières valeurs/handlers pour éviter les stale closures :
  // l'event listener global s'attache une seule fois (deps []) et lit les refs.
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const goToQuestionRef = useRef(goToQuestion)
  goToQuestionRef.current = goToQuestion
  const kbStateRef = useRef({
    gradingMode,
    currentQuestionIndex,
    horizontalQuestionIndex,
    horizontalQuestionsLength: horizontalQuestions.length,
  })
  kbStateRef.current = {
    gradingMode,
    currentQuestionIndex,
    horizontalQuestionIndex,
    horizontalQuestionsLength: horizontalQuestions.length,
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { gradingMode, currentQuestionIndex, horizontalQuestionIndex, horizontalQuestionsLength } = kbStateRef.current
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Ctrl+S even in inputs
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          handleSaveRef.current()
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (gradingMode === 'par-copie') {
          goToQuestionRef.current(currentQuestionIndex - 1)
        } else {
          setHorizontalQuestionIndex(Math.max(0, horizontalQuestionIndex - 1))
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (gradingMode === 'par-copie') {
          goToQuestionRef.current(currentQuestionIndex + 1)
        } else {
          setHorizontalQuestionIndex(Math.min(horizontalQuestionsLength - 1, horizontalQuestionIndex + 1))
        }
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSaveRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ─── Select a session ───
  const selectSession = (id: string) => {
    setSelectedSessionId(id)
    setCurrentQuestionIndex(0)
    setMobileSheetOpen(false)
  }

  return {
    // ─── Data ───
    epreuves,
    sessions,
    isLoadingEpreuves,
    isLoadingSessions,
    filteredSessions,
    selectedEpreuveId,
    selectedSessionId,
    selectedSession,
    questions,
    currentQuestion,
    currentQuestionIndex,
    currentReponse,
    currentRubricCriteria,
    computedScore,
    totalQuestions,
    manualCorrectedCount,
    needsCorrectionCount,
    horizontalQuestions,
    horizontalCurrentQuestion,
    horizontalQuestionIndex,
    horizontalGradedCount,
    globalProgress,
    mainContentRef,

    // ─── Mutations (instances partagées) ───
    aiGradeMutation,

    // ─── Grading state ───
    gradingMode,
    setGradingMode,
    noteFinale,
    setNoteFinale,
    commentaire,
    setCommentaire,
    selectedCriteria,
    isAiLoading,
    isSaving,
    isApplyingAi,
    isFinalizing,
    isBatchAiLoading,
    setIsBatchAiLoading,
    isBatchReturning,
    showAiSuggestion,
    setShowAiSuggestion,
    aiSuggestionOpen,
    setAiSuggestionOpen,
    expectedAnswerOpen,
    setExpectedAnswerOpen,
    horizontalScores,
    setHorizontalScores,
    horizontalComments,
    setHorizontalComments,
    horizontalCriteria,
    savingSessionId,

    // ─── UI state ───
    searchFilter,
    setSearchFilter,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSheetOpen,
    setMobileSheetOpen,

    // ─── Handlers ───
    setSelectedEpreuveId,
    selectSession,
    setHorizontalQuestionIndex,
    setCurrentQuestionIndex,
    handleToggleCriterion,
    handleAiGrade,
    handleApplyAi,
    handleDismissAi,
    handleSave,
    handleFinalize,
    handleBatchAiGrade,
    handleApplyAllAiSuggestions,
    isApplyingAllAi,
    handleBatchReturn,
    goToQuestion,
    handleHorizontalToggleCriterion,
    handleHorizontalSave,
    getReponseForSession,
  }
}
