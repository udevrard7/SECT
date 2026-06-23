'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  List,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import type {
  CorrectionSession,
  GradingMode,
  RubricCriterion,
} from '@/types/correction'
import {
  getQuestionTypeLabel,
  getStudentStatusDot,
  generateRubricCriteria,
} from '@/lib/correction-utils'
import { CorrectionToolbar } from '@/components/correction/correction-toolbar'
import { StudentSidebar } from '@/components/correction/student-sidebar'
import { QuestionSidebar } from '@/components/correction/question-sidebar'
import { CorrectionLoadingSkeleton, CorrectionEmptyState } from '@/components/correction/correction-skeletons'
import { ParCopieView } from '@/components/correction/par-copie-view'
import { ParQuestionView } from '@/components/correction/par-question-view'
import {
  useEpreuvesForCorrection,
  useCorrectionSessions,
  useAiGrade,
  useSaveGrade,
  useFinalizeSession,
  useBatchAiGrade,
  useBatchReturn,
} from '@/hooks/use-correction'

// ─── Main Component ───

export function CorrectionPage() {
  const user = useAuthStore((s) => s.user)
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
  const questions = selectedSession?.epreuve.questions
    ? [...selectedSession.epreuve.questions].sort((a, b) => a.ordre - b.ordre)
    : []

  // ─── Horizontal grading: all questions from first session ───
  const horizontalQuestions = useMemo(() => {
    if (sessions.length === 0) return []
    const first = sessions[0]
    if (!first?.epreuve.questions) return []
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
    return generateRubricCriteria(currentQuestion.question.type, currentQuestion.bareme)
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
        const criteria = generateRubricCriteria(currentQuestion.question.type, currentQuestion.bareme)
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
      s.etudiant.name.toLowerCase().includes(q) ||
      s.etudiant.email.toLowerCase().includes(q)
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
      const qCount = s.epreuve.questions?.length ?? 0
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
    try {
      const data = await aiGradeMutation.mutateAsync({ sessionId: sid, questionId: qid })
      if (!sessionId && data.noteIA !== undefined && data.noteIA !== null) {
        setNoteFinale(String(data.noteIA))
      }
      toast.success('Évaluation IA terminée', {
        description: 'La proposition de note a été générée.',
      })
    } catch (err) {
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
      const current = prev[sessionId] ?? new Set()
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
      setHorizontalScores((prev2) => ({ ...prev2, [sessionId]: String(Math.round(capped * 10) / 10) }))
      return { ...prev, [sessionId]: next }
    })
  }

  // ─── Horizontal grading: save for one session ───
  const handleHorizontalSave = async (sessionId: string) => {
    if (!horizontalCurrentQuestion) return
    const score = horizontalScores[sessionId]
    const comment = horizontalComments[sessionId] ?? null
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

  // ─── RENDER: Loading state ───
  if (isLoadingEpreuves) {
    return <CorrectionLoadingSkeleton />
  }

  // ─── RENDER: No epreuves ───
  if (epreuves.length === 0) {
    return <CorrectionEmptyState />
  }

  // ─── Sidebar content (variable réutilisée desktop + mobile) ───
  const sidebarContent = gradingMode === 'par-question' ? (
    <QuestionSidebar
      horizontalQuestions={horizontalQuestions}
      horizontalQuestionIndex={horizontalQuestionIndex}
      sessions={sessions}
      onSelectQuestion={setHorizontalQuestionIndex}
      isLoadingSessions={isLoadingSessions}
    />
  ) : (
    <StudentSidebar
      filteredSessions={filteredSessions}
      selectedSessionId={selectedSessionId}
      onSelectSession={selectSession}
      isLoadingSessions={isLoadingSessions}
    />
  )

  // ─── Main render ───
  const mainContent = gradingMode === 'par-copie' ? (
    <ParCopieView
      selectedSession={selectedSession}
      selectedSessionId={selectedSessionId}
      questions={questions}
      currentQuestion={currentQuestion}
      currentQuestionIndex={currentQuestionIndex}
      currentReponse={currentReponse}
      totalQuestions={totalQuestions}
      manualCorrectedCount={manualCorrectedCount}
      noteFinale={noteFinale}
      commentaire={commentaire}
      selectedCriteria={selectedCriteria}
      currentRubricCriteria={currentRubricCriteria}
      computedScore={computedScore}
      showAiSuggestion={showAiSuggestion}
      aiSuggestionOpen={aiSuggestionOpen}
      expectedAnswerOpen={expectedAnswerOpen}
      isAiLoading={isAiLoading}
      isSaving={isSaving}
      isApplyingAi={isApplyingAi}
      isFinalizing={isFinalizing}
      mainContentRef={mainContentRef}
      setNoteFinale={setNoteFinale}
      setCommentaire={setCommentaire}
      setAiSuggestionOpen={setAiSuggestionOpen}
      setExpectedAnswerOpen={setExpectedAnswerOpen}
      handleToggleCriterion={handleToggleCriterion}
      handleAiGrade={handleAiGrade}
      handleSave={handleSave}
      handleApplyAi={handleApplyAi}
      handleDismissAi={handleDismissAi}
      handleFinalize={handleFinalize}
      goToQuestion={goToQuestion}
    />
  ) : (
    <ParQuestionView
      sessions={sessions}
      horizontalQuestions={horizontalQuestions}
      horizontalCurrentQuestion={horizontalCurrentQuestion}
      horizontalQuestionIndex={horizontalQuestionIndex}
      setHorizontalQuestionIndex={setHorizontalQuestionIndex}
      horizontalGradedCount={horizontalGradedCount}
      horizontalScores={horizontalScores}
      setHorizontalScores={setHorizontalScores}
      horizontalComments={horizontalComments}
      setHorizontalComments={setHorizontalComments}
      horizontalCriteria={horizontalCriteria}
      expectedAnswerOpen={expectedAnswerOpen}
      setExpectedAnswerOpen={setExpectedAnswerOpen}
      isAiLoading={isAiLoading}
      isBatchAiLoading={isBatchAiLoading}
      savingSessionId={savingSessionId}
      setIsBatchAiLoading={setIsBatchAiLoading}
      handleHorizontalToggleCriterion={handleHorizontalToggleCriterion}
      handleHorizontalSave={handleHorizontalSave}
      handleAiGrade={handleAiGrade}
      getReponseForSession={getReponseForSession}
      aiGradeMutation={aiGradeMutation}
    />
  )

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background overflow-hidden h-[calc(100vh-10rem)]">
      {/* Toolbar */}
      <CorrectionToolbar
        selectedEpreuveId={selectedEpreuveId}
        setSelectedEpreuveId={setSelectedEpreuveId}
        epreuves={epreuves}
        gradingMode={gradingMode}
        setGradingMode={setGradingMode}
        sessions={sessions}
        globalProgress={globalProgress}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        selectedSessionId={selectedSessionId}
        needsCorrectionCount={needsCorrectionCount}
        isLoadingSessions={isLoadingSessions}
        onBatchAiGrade={handleBatchAiGrade}
        isBatchAiLoading={isBatchAiLoading}
        onBatchReturn={handleBatchReturn}
        isBatchReturning={isBatchReturning}
      />

      {/* Body: Sidebar + Main */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <div className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-[280px]'}`}>
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            {!sidebarCollapsed && (
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {gradingMode === 'par-copie' ? 'Étudiants' : 'Questions'}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-6 w-6 p-0"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Sidebar content */}
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center py-2 gap-1">
              {gradingMode === 'par-copie' ? (
                filteredSessions.slice(0, 20).map((session) => {
                  const status = getStudentStatusDot(session)
                  const isSelected = session.id === selectedSessionId
                  return (
                    <TooltipProvider key={session.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => selectSession(session.id)}
                            className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-950/30 dark:ring-emerald-700'
                                : 'hover:bg-muted/60'
                            }`}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{session.etudiant.name}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                })
              ) : (
                horizontalQuestions.slice(0, 20).map((q, idx) => (
                  <TooltipProvider key={q.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setHorizontalQuestionIndex(idx)}
                          className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                            idx === horizontalQuestionIndex
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'hover:bg-muted/60 text-muted-foreground'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Q{idx + 1} — {getQuestionTypeLabel(q.question.type)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))
              )}
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="py-1">
                {isLoadingSessions ? (
                  <div className="space-y-2 px-2 py-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-md border p-2.5 space-y-1.5">
                        <div className="h-3 w-24 rounded bg-muted" />
                        <div className="h-2 w-16 rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : (
                  sidebarContent
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Mobile sidebar trigger */}
        <div className="md:hidden">
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="fixed bottom-4 left-4 z-40 h-9 w-9 p-0 rounded-full shadow-lg bg-card"
              >
                <List className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetTitle className="px-4 pt-4 text-sm">
                {gradingMode === 'par-copie' ? 'Étudiants' : 'Questions'}
              </SheetTitle>
              <ScrollArea className="flex-1 h-[calc(100vh-6rem)]">
                <div className="py-2">
                  {sidebarContent}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {mainContent}
        </div>
      </div>
    </div>
  )
}
