'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PenTool,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Loader2,
  Save,
  User,
  Mail,
  Award,
  MessageSquare,
  FileText,
  Zap,
  LayoutGrid,
  List,
  Wand2,
  ChevronDown,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { CodingCorrection } from '@/components/coding/coding-correction'
import {
  type CodingLanguage,
  type CodingAnswer,
  parseCodingAnswer,
} from '@/lib/coding-types'
import type {
  CorrectionSession,
  GradingMode,
  RubricCriterion,
} from '@/types/correction'
import {
  getQuestionTypeLabel,
  isAutoGradedType,
  isSemiAutoGradedType,
  getCorrectionBadge,
  getScoreColor,
  getStudentStatusDot,
  generateRubricCriteria,
  parseAnswerContent,
  isCodingAnswer,
} from '@/lib/correction-utils'
import { ScoreCircle } from '@/components/correction/score-circle'
import { AiSuggestionPanel } from '@/components/correction/ai-suggestion-panel'
import { GradingForm } from '@/components/correction/grading-form'
import { CorrectionToolbar } from '@/components/correction/correction-toolbar'
import { StudentSidebar } from '@/components/correction/student-sidebar'
import { QuestionSidebar } from '@/components/correction/question-sidebar'
import { QuestionHeader } from '@/components/correction/question-header'
import { CorrectionLoadingSkeleton, CorrectionEmptyState } from '@/components/correction/correction-skeletons'
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

  // ─── RENDER: Par copie main content ───
  const renderParCopieContent = () => {
    if (!selectedSession) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted">
              <PenTool className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Sélectionnez une copie</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Choisissez un étudiant dans le panneau latéral pour commencer la correction.
            </p>
          </div>
        </div>
      )
    }

    if (selectedSession.statut === 'RETOURNEE') {
      return (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center max-w-sm">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
              <Check className="h-8 w-8 text-teal-500 dark:text-teal-400" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Copie rendue</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              La copie de {selectedSession.etudiant.name} a été corrigée et rendue.
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm">
                Score final :{' '}
                <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>
                  {selectedSession.score?.toFixed(1) ?? '—'} pts
                </span>
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (totalQuestions === 0) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <Check className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Toutes les questions sont corrigées</h3>
            <Button
              className="mt-4 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleFinalize()}
              disabled={isFinalizing}
            >
              {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              Finaliser et rendre
            </Button>
          </div>
        </div>
      )
    }

    const q = currentQuestion?.question
    if (!q || !currentQuestion) return null

    const answerContent = parseAnswerContent(currentReponse?.contenu)
    const expectedAnswer = typeof q.reponseCorrecte === 'string'
      ? q.reponseCorrecte
      : Array.isArray(q.reponseCorrecte)
        ? q.reponseCorrecte.join(', ')
        : ''

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Student info bar */}
        <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{selectedSession.etudiant.name}</p>
              <p className="text-[10px] text-muted-foreground">{selectedSession.etudiant.email}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <Badge
            variant="outline"
            className={
              selectedSession.statut === 'CORRIGEE'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800 text-[10px] h-5'
                : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 text-[10px] h-5'
            }
          >
            {selectedSession.statut === 'CORRIGEE' ? 'Corrigée' : 'En correction'}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs">
            <Award className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>
                {selectedSession.score !== null ? selectedSession.score.toFixed(1) : '—'}
              </span>
              <span className="text-muted-foreground"> pts</span>
            </span>
          </div>
          {selectedSession.autoGradedTotal > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 text-sky-500" />
              Auto: {selectedSession.autoGradedScore.toFixed(1)}/{selectedSession.autoGradedTotal.toFixed(1)}
            </div>
          )}
          {selectedSession.alertes > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 gap-0.5">
              <AlertTriangle className="h-3 w-3" />
              {selectedSession.alertes}
            </Badge>
          )}
          {/* Progress */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{manualCorrectedCount}/{totalQuestions}</span>
            <Progress value={totalQuestions > 0 ? (manualCorrectedCount / totalQuestions) * 100 : 0} className="w-16 h-1.5" />
          </div>
        </div>

        {/* Question header */}
        <QuestionHeader
          currentQuestion={currentQuestion}
          currentQuestionIndex={currentQuestionIndex}
        />

        {/* Scrollable content */}
        <ScrollArea className="flex-1 min-h-0" ref={mainContentRef}>
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`content-${currentQuestionIndex}-${selectedSessionId}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Énoncé */}
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.enonce}</p>
                </div>

                {/* Réponse attendue (collapsible) */}
                {expectedAnswer && (
                  <Collapsible open={expectedAnswerOpen} onOpenChange={setExpectedAnswerOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 transition-colors">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Réponse attendue
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 ml-auto text-emerald-600 dark:text-emerald-400 transition-transform ${expectedAnswerOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-b-lg border border-t-0 border-emerald-200 bg-emerald-50/30 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/10">
                        <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                          {expectedAnswer}
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Réponse de l'étudiant */}
                {q.type === 'CODE' ? (
                  <CodingCorrection
                    questionId={currentQuestion.questionId}
                    enonce={q.enonce}
                    langage={(q.langage || 'python') as CodingLanguage}
                    fonctionSignature={q.fonctionSignature || ''}
                    testsPublics={q.testsPublics || []}
                    testsPrives={q.testsPrives || []}
                    bareme={currentQuestion.bareme}
                    reponseCorrecte={typeof q.reponseCorrecte === 'string' ? q.reponseCorrecte : ''}
                    studentAnswer={parseCodingAnswer(currentReponse?.contenu || null)}
                    scoreAuto={currentReponse?.score ?? undefined}
                    noteIA={currentReponse?.noteIA ?? undefined}
                    justificationIA={currentReponse?.justificationIA ?? undefined}
                    scoreFinal={currentReponse?.score ?? undefined}
                    commentaireEnseignant={currentReponse?.commentaire ?? undefined}
                    onSaveScore={async (_questionId, score, comment) => {
                      await handleSave(selectedSessionId ?? undefined, _questionId, score, comment)
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-foreground">
                          Réponse de l&apos;étudiant
                        </span>
                      </div>
                      {currentReponse?.score !== null && currentReponse?.score !== undefined && (
                        <ScoreCircle score={currentReponse.score} total={currentQuestion.bareme} size="sm" />
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                      {answerContent}
                    </p>
                  </div>
                )}

                {/* Existing commentaire */}
                {currentReponse?.commentaire && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5 dark:border-teal-800 dark:bg-teal-950/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                      <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                        Commentaire existant
                      </span>
                    </div>
                    <p className="text-xs text-teal-900 dark:text-teal-100 whitespace-pre-wrap">
                      {currentReponse.commentaire}
                    </p>
                  </div>
                )}

                {/* AI Suggestion (collapsible) */}
                {showAiSuggestion && currentReponse?.noteIA !== null && currentReponse?.noteIA !== undefined && !isAutoGradedType(q.type) && (
                  <AiSuggestionPanel
                    variant="collapsible"
                    noteIA={currentReponse.noteIA}
                    bareme={currentQuestion.bareme}
                    justificationIA={currentReponse.justificationIA}
                    onApply={handleApplyAi}
                    isApplying={isApplyingAi}
                    isOpen={aiSuggestionOpen}
                    onOpenChange={setAiSuggestionOpen}
                    onDismiss={handleDismissAi}
                  />
                )}

                {/* Auto-graded notice */}
                {isAutoGradedType(q.type) && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800">
                    <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Question auto-corrigée</p>
                      <p className="text-[10px] text-sky-600 dark:text-sky-300">
                        Score automatique : {currentReponse?.score ?? '—'} / {currentQuestion.bareme}
                      </p>
                    </div>
                  </div>
                )}

                {/* Semi-auto (CODE) notice — CodingCorrection handles the grading UI */}
                {isSemiAutoGradedType(q.type) && currentReponse?.score !== null && currentReponse?.score !== undefined && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800">
                    <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">Question auto+corrigée</p>
                      <p className="text-[10px] text-violet-600 dark:text-violet-300">
                        Score auto-calculé : {currentReponse.score} / {currentQuestion.bareme} — Vous pouvez modifier la note ci-dessus
                      </p>
                    </div>
                  </div>
                )}

                {/* Grading section — only for non-auto, non-CODE questions */}
                {!isAutoGradedType(q.type) && !isSemiAutoGradedType(q.type) && (
                  <GradingForm
                    variant="par-copie"
                    bareme={currentQuestion.bareme}
                    rubricCriteria={currentRubricCriteria}
                    selectedCriteria={selectedCriteria}
                    onToggleCriterion={handleToggleCriterion}
                    noteFinale={noteFinale}
                    onNoteChange={setNoteFinale}
                    commentaire={commentaire}
                    onCommentChange={setCommentaire}
                    computedScore={computedScore}
                    onSave={() => handleSave()}
                    isSaving={isSaving}
                    onAiGrade={() => handleAiGrade()}
                    isAiLoading={isAiLoading}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Sticky bottom navigation */}
        <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToQuestion(currentQuestionIndex - 1)}
            disabled={currentQuestionIndex === 0}
            className="h-7 text-xs gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Préc.
          </Button>

          {/* Question dots */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-[60%] px-2">
            {questions.map((q, idx) => {
              const rep = selectedSession?.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
              const isCurrent = idx === currentQuestionIndex
              const isCorrected = rep?.score !== null && rep?.score !== undefined

              let dotClass = 'bg-muted text-muted-foreground border-border'
              if (isCurrent) {
                dotClass = 'bg-emerald-600 text-white border-emerald-600'
              } else if (!isCorrected) {
                dotClass = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
              } else {
                dotClass = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
              }

              return (
                <button
                  key={q.id}
                  onClick={() => goToQuestion(idx)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors ${dotClass}`}
                  title={`Question ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToQuestion(currentQuestionIndex + 1)}
            disabled={currentQuestionIndex >= totalQuestions - 1}
            className="h-7 text-xs gap-1"
          >
            Suiv.
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Finalize bar */}
        {selectedSession.allCorrected && selectedSession.statut !== 'RETOURNEE' && (
          <div className="border-t border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              Toutes les questions sont corrigées
            </span>
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleFinalize()}
              disabled={isFinalizing}
            >
              {isFinalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Finaliser et rendre
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ─── RENDER: Par question main content ───
  const renderParQuestionContent = () => {
    if (sessions.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Correction par question</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Sélectionnez une épreuve pour corriger toutes les copies question par question.
            </p>
          </div>
        </div>
      )
    }

    if (!horizontalCurrentQuestion) return null

    const hq = horizontalCurrentQuestion.question
    const totalSessions = sessions.length
    const progressPct = totalSessions > 0 ? (horizontalGradedCount / totalSessions) * 100 : 0
    const expectedAnswer = typeof hq.reponseCorrecte === 'string'
      ? hq.reponseCorrecte
      : Array.isArray(hq.reponseCorrecte)
        ? hq.reponseCorrecte.join(', ')
        : ''

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Question info header (non-scrollable) */}
        <div className="border-b border-border bg-card px-4 py-2 space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">Q{horizontalQuestionIndex + 1}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{getQuestionTypeLabel(hq.type)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{horizontalCurrentQuestion.bareme}pts</span>
            <Badge variant="outline" className={`text-[10px] h-5 ${getCorrectionBadge(hq.type).classes}`}>
              {getCorrectionBadge(hq.type).label}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{horizontalGradedCount}/{totalSessions}</span>
              <Progress value={progressPct} className="w-16 h-1.5" />
            </div>
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-2">{hq.enonce}</p>
        </div>

        {/* Student answer cards (scrollable) */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4 max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={`hq-${horizontalQuestionIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Expected answer panel (collapsible, at top of scroll area) */}
                {expectedAnswer && (
                  <Collapsible open={expectedAnswerOpen} onOpenChange={setExpectedAnswerOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 transition-colors">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Réponse attendue
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 ml-auto text-emerald-600 dark:text-emerald-400 transition-transform ${expectedAnswerOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-b-lg border border-t-0 border-emerald-200 bg-emerald-50/30 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/10">
                        <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                          {expectedAnswer}
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Student answer cards */}
                {sessions.map((session) => {
                  const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
                  const criteria = generateRubricCriteria(hq.type, horizontalCurrentQuestion.bareme)
                  const activeCriteria = horizontalCriteria[session.id] ?? new Set()
                  const answerContent = parseAnswerContent(rep?.contenu)

                  let criteriaScore = 0
                  activeCriteria.forEach((id) => {
                    const c = criteria.find((cr) => cr.id === id)
                    if (c) criteriaScore += c.points
                  })
                  criteriaScore = Math.min(criteriaScore, horizontalCurrentQuestion.bareme)

                  const scoreValue = horizontalScores[session.id] ?? (rep?.score !== null && rep?.score !== undefined ? String(rep.score) : '')
                  const commentValue = horizontalComments[session.id] ?? (rep?.commentaire ?? '')
                  const isSavingRow = savingSessionId === session.id
                  const statusDot = getStudentStatusDot(session)

                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
                    >
                      {/* Card header: Student name + Score circle + Status + Alerts */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot.color}`} title={statusDot.label} />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                            <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <p className="text-sm font-semibold truncate">{session.etudiant.name}</p>
                        </div>
                        <ScoreCircle
                          score={rep?.score ?? null}
                          total={horizontalCurrentQuestion.bareme}
                          size="sm"
                        />
                        {session.alertes > 0 && (
                          <Badge variant="destructive" className="text-[10px] h-5 gap-0.5 shrink-0">
                            <AlertTriangle className="h-3 w-3" />
                            {session.alertes}
                          </Badge>
                        )}
                      </div>

                      {/* Answer section: Full answer text, NO truncation */}
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-foreground">Réponse</span>
                        </div>
                        {hq.type === 'CODE' && isCodingAnswer(rep?.contenu) ? (
                          <div className="space-y-2">
                            {(() => {
                              const codingAns = parseCodingAnswer(rep?.contenu || null)
                              if (!codingAns) return <span className="text-sm text-muted-foreground">Aucun code</span>
                              const passedTests = codingAns.testResultsPublics?.filter?.(t => t.passed)?.length ?? '?'
                              const totalTests = codingAns.testResultsPublics?.length ?? '?'
                              return (
                                <>
                                  <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline" className="text-[10px] h-5 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                                      {(hq.langage || codingAns.language || 'python').toUpperCase()}
                                    </Badge>
                                    <span className="text-muted-foreground">{codingAns.code.split('\n').length} lignes</span>
                                    <span className="text-muted-foreground">Tests: {passedTests}/{totalTests}</span>
                                  </div>
                                  <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-900 rounded-md p-3 overflow-x-auto whitespace-pre-wrap border border-slate-200 dark:border-slate-800">
                                    {codingAns.code}
                                  </pre>
                                </>
                              )
                            })()}
                          </div>
                        ) : (
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {answerContent}
                          </p>
                        )}
                      </div>

                      {/* AI Suggestion (if available) */}
                      {rep?.noteIA !== null && rep?.noteIA !== undefined && !isAutoGradedType(hq.type) && (
                        <AiSuggestionPanel
                          variant="flat"
                          noteIA={rep.noteIA}
                          bareme={horizontalCurrentQuestion.bareme}
                          justificationIA={rep.justificationIA}
                          onApply={() => {
                            setHorizontalScores((prev) => ({ ...prev, [session.id]: String(rep.noteIA) }))
                            if (rep.justificationIA) {
                              setHorizontalComments((prev) => ({ ...prev, [session.id]: rep.justificationIA ?? '' }))
                            }
                            handleHorizontalSave(session.id)
                          }}
                          onCopyNote={() => {
                            setHorizontalScores((prev) => ({ ...prev, [session.id]: String(rep.noteIA) }))
                            if (rep.justificationIA) {
                              setHorizontalComments((prev) => ({ ...prev, [session.id]: rep.justificationIA ?? '' }))
                            }
                          }}
                        />
                      )}

                      {/* Auto-graded notice */}
                      {isAutoGradedType(hq.type) && (
                        <div className="px-4 py-3 border-b border-border">
                          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800">
                            <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Auto-corrigée</p>
                              <p className="text-[10px] text-sky-600 dark:text-sky-300">
                                Score automatique : {rep?.score ?? '—'} / {horizontalCurrentQuestion.bareme}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Semi-auto (CODE) notice */}
                      {isSemiAutoGradedType(hq.type) && (
                        <div className="px-4 py-3 border-b border-border">
                          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800">
                            <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">Auto+corrigée</p>
                              <p className="text-[10px] text-violet-600 dark:text-violet-300">
                                Score auto-calculé : {rep?.score ?? '—'} / {horizontalCurrentQuestion.bareme} — Vous pouvez modifier la note ci-dessous
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Grading section — for manual questions */}
                      {!isAutoGradedType(hq.type) && !isSemiAutoGradedType(hq.type) && (
                        <GradingForm
                          variant="par-question"
                          bareme={horizontalCurrentQuestion.bareme}
                          rubricCriteria={criteria}
                          selectedCriteria={activeCriteria}
                          onToggleCriterion={(criterionId) => handleHorizontalToggleCriterion(session.id, criterionId, criteria)}
                          noteFinale={scoreValue}
                          onNoteChange={(value) => setHorizontalScores((prev) => ({ ...prev, [session.id]: value }))}
                          commentaire={commentValue}
                          onCommentChange={(value) => setHorizontalComments((prev) => ({ ...prev, [session.id]: value }))}
                          computedScore={criteriaScore}
                          onSave={() => handleHorizontalSave(session.id)}
                          isSaving={isSavingRow}
                          onAiGrade={() => handleAiGrade(session.id, horizontalCurrentQuestion.questionId)}
                          isAiLoading={isAiLoading}
                        />
                      )}

                      {/* Semi-auto grading section (CODE) — override option */}
                      {isSemiAutoGradedType(hq.type) && (
                        <div className="rounded-b-xl border-t border-border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <Label className="text-sm font-bold whitespace-nowrap">Note</Label>
                            <ScoreCircle
                              score={scoreValue !== '' ? parseFloat(scoreValue) || 0 : (rep?.score ?? 0)}
                              total={horizontalCurrentQuestion.bareme}
                              size="md"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={horizontalCurrentQuestion.bareme}
                              step={0.5}
                              value={scoreValue}
                              onChange={(e) => setHorizontalScores((prev) => ({ ...prev, [session.id]: e.target.value }))}
                              placeholder={rep?.score != null ? String(rep.score) : '0'}
                              className="w-24 h-9 text-base font-bold"
                            />
                            <span className="text-base font-semibold text-muted-foreground">/ {horizontalCurrentQuestion.bareme}</span>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Commentaire
                            </Label>
                            <Textarea
                              value={commentValue}
                              onChange={(e) => setHorizontalComments((prev) => ({ ...prev, [session.id]: e.target.value }))}
                              placeholder="Ajoutez votre commentaire..."
                              rows={2}
                              className="resize-none text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleHorizontalSave(session.id)}
                              disabled={isSavingRow}
                              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 px-4"
                            >
                              {isSavingRow ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                              Sauvegarder
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Sticky bottom navigation */}
        <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHorizontalQuestionIndex(Math.max(0, horizontalQuestionIndex - 1))}
            disabled={horizontalQuestionIndex === 0}
            className="h-7 text-xs gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Préc.
          </Button>

          <div className="flex items-center gap-1 overflow-x-auto max-w-[60%] px-2">
            {horizontalQuestions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setHorizontalQuestionIndex(idx)}
                className={`h-6 w-6 shrink-0 rounded border text-[10px] font-bold transition-colors ${
                  idx === horizontalQuestionIndex
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-muted text-muted-foreground border-border hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHorizontalQuestionIndex(Math.min(horizontalQuestions.length - 1, horizontalQuestionIndex + 1))}
            disabled={horizontalQuestionIndex >= horizontalQuestions.length - 1}
            className="h-7 text-xs gap-1"
          >
            Suiv.
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Batch AI for this question */}
        {!isAutoGradedType(hq.type) && (
          <div className="border-t border-border px-4 py-2 shrink-0">
            <Button
              variant="outline"
              className="w-full h-8 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              onClick={async () => {
                setIsBatchAiLoading(true)
                let graded = 0
                for (const session of sessions) {
                  const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
                  if (rep?.score === null || rep?.score === undefined) {
                    try {
                      await aiGradeMutation.mutateAsync({
                        sessionId: session.id,
                        questionId: horizontalCurrentQuestion.questionId,
                      })
                      graded++
                    } catch {
                      // Continue
                    }
                  }
                }
                setIsBatchAiLoading(false)
                toast.success('Évaluation IA terminée', {
                  description: `${graded} copies évaluées par l'IA pour cette question.`,
                })
              }}
              disabled={isBatchAiLoading}
            >
              {isBatchAiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 mr-1" />
              )}
              Évaluer toutes les copies avec l&apos;IA (cette question)
            </Button>
          </div>
        )}
      </div>
    )
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
  const mainContent = gradingMode === 'par-copie' ? renderParCopieContent() : renderParQuestionContent()

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
