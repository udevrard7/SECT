'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigationStore } from '@/stores/navigation-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Clock,
  ShieldCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flag,
  FlagOff,
  Maximize,
  Eye,
  ClipboardPaste,
  CheckCircle2,
  Send,
  Home,
  BookOpen,
  Lock,
  FileWarning,
  Save,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExamSession {
  id: string
  etudiantId: string
  epreuveId: string
  statut: 'NON_COMMENCEE' | 'EN_COURS' | 'SOUMISE' | 'CORRIGEE'
  dateDebut: string | null
  dateFin: string | null
  score: number | null
  alertes: number
}

interface ExamQuestion {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: 'QCU' | 'QCM' | 'QRC' | 'TRS'
    enonce: string
    propositions: string[] | null
    difficulte: string
    themes: string[] | null
  }
}

interface EpreuveInfo {
  id: string
  titre: string
  description: string | null
  duree: number
  blocageRetour: boolean
  melangePropositions: boolean
}

type ExamPhase = 'pre-exam' | 'in-exam' | 'post-exam'

// ─── Utility: format time as HH:MM:SS ──────────────────────────────────────

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

// ─── Utility: parse JSON safely ─────────────────────────────────────────────

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// ─── Letter labels for propositions ─────────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// ─── Main Component ─────────────────────────────────────────────────────────

export function PassationPage() {
  const { currentPageParams } = useNavigationStore()
  const { user } = useAuthStore()

  const epreuveId = currentPageParams?.epreuveId || ''

  // ─── Core state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ExamPhase>('pre-exam')
  const [epreuve, setEpreuve] = useState<EpreuveInfo | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [session, setSession] = useState<ExamSession | null>(null)
  const [loading, setLoading] = useState(true)

  // ─── Exam state ────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reponses, setReponses] = useState<Record<string, string>>({})
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ─── Consent state ─────────────────────────────────────────────────────
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  // ─── Anti-cheat state ──────────────────────────────────────────────────
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false)
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false)
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0)

  // ─── Refs ──────────────────────────────────────────────────────────────
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const examContainerRef = useRef<HTMLDivElement>(null)
  const reponsesRef = useRef(reponses)
  const sessionRef = useRef(session)
  const phaseRef = useRef(phase)

  // Keep refs in sync
  useEffect(() => { reponsesRef.current = reponses }, [reponses])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ─── Fetch epreuve data ────────────────────────────────────────────────
  useEffect(() => {
    if (!epreuveId) {
      setLoading(false)
      return
    }

    async function fetchEpreuveData() {
      try {
        // Fetch epreuve info
        const epreuveRes = await fetch(`/api/epreuves/${epreuveId}`)
        if (!epreuveRes.ok) throw new Error('Épreuve introuvable')
        const epreuveData = await epreuveRes.json()
        setEpreuve(epreuveData)

        // Fetch questions
        const questionsRes = await fetch(`/api/epreuves/${epreuveId}/questions`)
        if (!questionsRes.ok) throw new Error('Questions introuvables')
        const questionsData = await questionsRes.json()
        // Sort by ordre
        questionsData.sort((a: ExamQuestion, b: ExamQuestion) => a.ordre - b.ordre)
        setQuestions(questionsData)

        // Check for existing session (resume)
        if (user?.id) {
          const sessionRes = await fetch(`/api/sessions?etudiantId=${user.id}&epreuveId=${epreuveId}`)
          if (sessionRes.ok) {
            const sessionsData = await sessionRes.json()
            const activeSession = sessionsData.find(
              (s: ExamSession) => s.statut === 'EN_COURS' || s.statut === 'NON_COMMENCEE'
            )
            if (activeSession) {
              setSession(activeSession)
              if (activeSession.statut === 'EN_COURS' && activeSession.dateDebut) {
                // Resume: calculate remaining time
                const start = new Date(activeSession.dateDebut).getTime()
                const end = start + epreuveData.duree * 60 * 1000
                const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000))
                setTimeRemaining(remaining)

                // Load existing answers
                const answersRes = await fetch(`/api/sessions/${activeSession.id}/reponses`)
                if (answersRes.ok) {
                  const answersData = await answersRes.json()
                  const loadedReponses: Record<string, string> = {}
                  answersData.forEach((r: { questionId: string; contenu: string | null }) => {
                    if (r.contenu) loadedReponses[r.questionId] = r.contenu
                  })
                  setReponses(loadedReponses)
                }

                // Resume exam directly
                setPhase('in-exam')
              }
            }
          }
        }
      } catch (err) {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Impossible de charger l\'épreuve',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchEpreuveData()
  }, [epreuveId, user?.id])

  // ─── Start exam ────────────────────────────────────────────────────────
  const startExam = useCallback(async () => {
    if (!user?.id || !epreuveId || isStarting) return
    setIsStarting(true)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etudiantId: user.id, epreuveId }),
      })

      if (!res.ok) throw new Error('Impossible de démarrer la session')
      const data = await res.json()
      setSession(data.session)

      // Calculate time
      const start = new Date(data.session.dateDebut).getTime()
      const end = start + (epreuve?.duree || 60) * 60 * 1000
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000))
      setTimeRemaining(remaining)

      // Request fullscreen
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        // Fullscreen request may fail — not critical
      }

      setPhase('in-exam')
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de démarrer l\'épreuve',
      })
    } finally {
      setIsStarting(false)
    }
  }, [user?.id, epreuveId, epreuve?.duree, isStarting])

  // ─── Auto-save answers ─────────────────────────────────────────────────
  const saveAnswers = useCallback(async () => {
    if (!sessionRef.current || phaseRef.current !== 'in-exam') return

    try {
      const res = await fetch(`/api/sessions/${sessionRef.current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reponses: reponsesRef.current }),
      })

      if (res.ok) {
        setLastSaved(new Date())
      }
    } catch {
      // Silent fail — don't disrupt the student
    }
  }, [])

  // ─── Submit exam ───────────────────────────────────────────────────────
  const submitExam = useCallback(async (autoSubmit: boolean = false) => {
    if (!sessionRef.current || isSubmitting) return
    setIsSubmitting(true)

    try {
      // Save answers first
      await saveAnswers()

      const res = await fetch(`/api/sessions/${sessionRef.current.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSubmit }),
      })

      if (!res.ok) throw new Error('Erreur lors de la soumission')

      if (autoSubmit) setAutoSubmitted(true)
      setPhase('post-exam')

      // Exit fullscreen
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen()
        }
      } catch {
        // Ignore
      }

      // Clean up intervals
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de soumettre l\'épreuve',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, saveAnswers])

  // ─── Log alert ─────────────────────────────────────────────────────────
  const logAlert = useCallback(async (type: string, details?: string) => {
    if (!sessionRef.current) return

    try {
      await fetch(`/api/sessions/${sessionRef.current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerte: { type, details } }),
      })
    } catch {
      // Silent fail
    }
  }, [])

  // ─── Timer effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up — auto-submit
          clearInterval(timerIntervalRef.current!)
          submitExam(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [phase, submitExam])

  // ─── Auto-save effect (every 30s) ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    autoSaveIntervalRef.current = setInterval(() => {
      saveAnswers()
    }, 30000)

    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current)
    }
  }, [phase, saveAnswers])

  // ─── Anti-cheat: Fullscreen exit detection ─────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setFullscreenExitCount((prev) => {
          const newCount = prev + 1
          if (newCount >= 1) {
            setShowFullscreenWarning(true)
          }
          return newCount
        })
        logAlert('FULLSCREEN_EXIT')
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [phase, logAlert])

  // ─── Anti-cheat: Tab switch detection ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    function handleVisibilityChange() {
      if (document.hidden) {
        const timestamp = new Date().toLocaleTimeString('fr-FR')
        logAlert('TAB_SWITCH', `Changement d\'onglet à ${timestamp}`)
      } else {
        // Returning to tab — show warning
        setShowTabSwitchWarning(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [phase, logAlert])

  // ─── Anti-cheat: Right-click prevention ────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [phase])

  // ─── Anti-cheat: Keyboard shortcuts prevention ─────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    function handleKeyDown(e: KeyboardEvent) {
      // Prevent Ctrl+C, Ctrl+V, Ctrl+U, F12
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'u')) ||
        e.key === 'F12'
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [phase])

  // ─── Save on question navigation ───────────────────────────────────────
  const navigateToQuestion = useCallback((index: number) => {
    setCurrentIndex(index)
    saveAnswers()
  }, [saveAnswers])

  // ─── Handle answer change ──────────────────────────────────────────────
  const handleAnswerChange = useCallback((epreuveQuestionId: string, value: string) => {
    setReponses((prev) => ({ ...prev, [epreuveQuestionId]: value }))
  }, [])

  // ─── Handle QCM toggle ─────────────────────────────────────────────────
  const handleQCMToggle = useCallback((epreuveQuestionId: string, letter: string) => {
    setReponses((prev) => {
      const current = parseJsonSafe<string[]>(prev[epreuveQuestionId], [])
      const updated = current.includes(letter)
        ? current.filter((l) => l !== letter)
        : [...current, letter]
      return { ...prev, [epreuveQuestionId]: JSON.stringify(updated) }
    })
  }, [])

  // ─── Toggle flag ───────────────────────────────────────────────────────
  const toggleFlag = useCallback((epreuveQuestionId: string) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(epreuveQuestionId)) next.delete(epreuveQuestionId)
      else next.add(epreuveQuestionId)
      return next
    })
  }, [])

  // ─── Paste handler for QRC ─────────────────────────────────────────────
  const handlePastePrevent = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    logAlert('PASTE_ATTEMPT')
    toast.warning('Coller désactivé', {
      description: 'Le copier-coller est interdit pour ce type de question.',
    })
  }, [logAlert])

  // ─── Computed: answered questions count ────────────────────────────────
  const answeredCount = questions.filter((q) => {
    const answer = reponses[q.id]
    if (!answer) return false
    if (q.question.type === 'QCM') {
      const selected = parseJsonSafe<string[]>(answer, [])
      return selected.length > 0
    }
    return answer.trim().length > 0
  }).length

  const totalPoints = questions.reduce((sum, q) => sum + q.bareme, 0)

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Chargement de l&apos;épreuve...</p>
        </div>
      </div>
    )
  }

  // ─── No epreuveId ──────────────────────────────────────────────────────
  if (!epreuveId || !epreuve) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Aucune épreuve sélectionnée</CardTitle>
            <CardDescription>
              Veuillez sélectionner une épreuve depuis votre tableau de bord.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              variant="outline"
              className="border-emerald-600 text-emerald-600 hover:bg-emerald-50"
              onClick={() => useNavigationStore.getState().setCurrentPage('mes-epreuves')}
            >
              <Home className="h-4 w-4 mr-2" />
              Mes épreuves
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: PRE-EXAM CONSENT SCREEN
  // ═══════════════════════════════════════════════════════════════════════

  if (phase === 'pre-exam') {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-2xl border-emerald-200 dark:border-emerald-900">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">{epreuve.titre}</CardTitle>
            {epreuve.description && (
              <CardDescription className="mt-1">{epreuve.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Exam info */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/50">
                <Clock className="mx-auto h-5 w-5 text-emerald-600 mb-1" />
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{epreuve.duree} min</p>
                <p className="text-xs text-muted-foreground">Durée</p>
              </div>
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/50">
                <BookOpen className="mx-auto h-5 w-5 text-teal-600 mb-1" />
                <p className="text-lg font-bold text-teal-700 dark:text-teal-400">{questions.length}</p>
                <p className="text-xs text-muted-foreground">Questions</p>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-800 dark:bg-cyan-950/50">
                <CheckCircle2 className="mx-auto h-5 w-5 text-cyan-600 mb-1" />
                <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400">{totalPoints}</p>
                <p className="text-xs text-muted-foreground">Points</p>
              </div>
            </div>

            {/* Rules */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600" />
                Règles de l&apos;épreuve
              </h3>
              <ul className="space-y-2.5">
                {[
                  { icon: Maximize, text: 'Le mode plein écran est obligatoire' },
                  { icon: Eye, text: 'Toute sortie de l\'onglet sera enregistrée' },
                  { icon: ClipboardPaste, text: 'Le copier-coller est désactivé pour les questions à réponse courte' },
                  { icon: Save, text: 'Les réponses sont sauvegardées automatiquement toutes les 30 secondes' },
                  { icon: Clock, text: 'L\'épreuve sera soumise automatiquement à la fin du temps imparti' },
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <rule.icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{rule.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Consent checkbox */}
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <Checkbox
                id="consent"
                checked={consentAccepted}
                onCheckedChange={(checked) => setConsentAccepted(checked === true)}
                className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
              />
              <Label htmlFor="consent" className="text-sm font-normal cursor-pointer leading-relaxed">
                J&apos;accepte les règles de l&apos;épreuve et je m&apos;engage à la réaliser de manière honnête et autonome.
              </Label>
            </div>

            {/* Start button */}
            <Button
              onClick={startExam}
              disabled={!consentAccepted || isStarting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 text-base"
              size="lg"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Démarrage en cours...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5 mr-2" />
                  Commencer l&apos;épreuve
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: POST-EXAM
  // ═══════════════════════════════════════════════════════════════════════

  if (phase === 'post-exam') {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-lg border-emerald-200 dark:border-emerald-900">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Épreuve soumise !</CardTitle>
            <CardDescription className="mt-1">
              {autoSubmitted
                ? 'Votre épreuve a été soumise automatiquement (temps écoulé).'
                : 'Votre épreuve a été soumise avec succès.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{answeredCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Questions répondues</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{questions.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Questions totales</p>
              </div>
            </div>

            {autoSubmitted && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <FileWarning className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Votre épreuve a été soumise automatiquement car le temps imparti est écoulé.
                </p>
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => useNavigationStore.getState().setCurrentPage('mes-epreuves')}
            >
              <Home className="h-4 w-4 mr-2" />
              Retour au tableau de bord
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: IN-EXAM INTERFACE
  // ═══════════════════════════════════════════════════════════════════════

  const currentQuestion = questions[currentIndex]
  const isLowTime = timeRemaining < 600 // less than 10 minutes
  const isVeryLowTime = timeRemaining < 60 // less than 1 minute

  return (
    <div
      ref={examContainerRef}
      className="fixed inset-0 z-50 bg-background flex flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ─── Top Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-2 gap-4 shrink-0">
        {/* Left: Exam title + sidebar toggle */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 lg:hidden"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <h1 className="text-sm font-semibold truncate">{epreuve.titre}</h1>
        </div>

        {/* Center: Timer */}
        <div className="flex items-center gap-2 shrink-0">
          <Clock className={`h-5 w-5 ${isVeryLowTime ? 'text-red-600' : isLowTime ? 'text-red-500' : 'text-emerald-600'}`} />
          <span
            className={`text-lg font-mono font-bold tabular-nums ${
              isVeryLowTime
                ? 'text-red-600 animate-pulse'
                : isLowTime
                  ? 'text-red-500'
                  : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatTime(timeRemaining)}
          </span>
        </div>

        {/* Right: Progress + Save indicator + Submit */}
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="outline" className="text-xs border-emerald-300 dark:border-emerald-700">
            {currentIndex + 1}/{questions.length}
          </Badge>

          {lastSaved && (
            <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
              <Save className="h-3 w-3" />
              Sauvegardé
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
            onClick={() => submitExam(false)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Soumettre
          </Button>
        </div>
      </div>

      {/* ─── Main content area ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar: Question navigation ───────────────────────────── */}
        <div
          className={`border-r bg-card transition-all duration-200 ${
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          } shrink-0 hidden lg:block`}
        >
          <ScrollArea className="h-full">
            <div className="p-4">
              <h2 className="text-sm font-semibold mb-3">Navigation</h2>

              {/* Progress info */}
              <div className="mb-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progression</span>
                  <span>{answeredCount}/{questions.length}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Question grid */}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = (() => {
                    const ans = reponses[q.id]
                    if (!ans) return false
                    if (q.question.type === 'QCM') {
                      return parseJsonSafe<string[]>(ans, []).length > 0
                    }
                    return ans.trim().length > 0
                  })()
                  const isFlagged = flaggedQuestions.has(q.id)
                  const isCurrent = idx === currentIndex

                  let bgClass = 'bg-muted text-muted-foreground hover:bg-muted/80'
                  if (isCurrent) bgClass = 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  else if (isFlagged) bgClass = 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300'
                  else if (isAnswered) bgClass = 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300'

                  return (
                    <button
                      key={q.id}
                      onClick={() => navigateToQuestion(idx)}
                      className={`h-9 w-9 rounded-md text-xs font-semibold transition-all ${bgClass} flex items-center justify-center`}
                      title={`Question ${idx + 1}${isFlagged ? ' (marquée)' : ''}`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/50" />
                  <span>Répondu</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-muted" />
                  <span>Non répondu</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-900/50" />
                  <span>Marqué pour révision</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm ring-2 ring-emerald-500" />
                  <span>Question actuelle</span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Répondues</span>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-xs">
                    {answeredCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Non répondues</span>
                  <Badge variant="secondary" className="text-xs">
                    {questions.length - answeredCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Marquées</span>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-xs">
                    {flaggedQuestions.size}
                  </Badge>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* ─── Mobile sidebar overlay ─────────────────────────────────── */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="w-72 bg-card border-r shadow-xl overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Navigation</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Progress */}
                <div className="mb-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progression</span>
                    <span>{answeredCount}/{questions.length}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Question grid */}
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = (() => {
                      const ans = reponses[q.id]
                      if (!ans) return false
                      if (q.question.type === 'QCM') {
                        return parseJsonSafe<string[]>(ans, []).length > 0
                      }
                      return ans.trim().length > 0
                    })()
                    const isFlagged = flaggedQuestions.has(q.id)
                    const isCurrent = idx === currentIndex

                    let bgClass = 'bg-muted text-muted-foreground hover:bg-muted/80'
                    if (isCurrent) bgClass = 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    else if (isFlagged) bgClass = 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300'
                    else if (isAnswered) bgClass = 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300'

                    return (
                      <button
                        key={q.id}
                        onClick={() => {
                          navigateToQuestion(idx)
                          setSidebarOpen(false)
                        }}
                        className={`h-9 w-9 rounded-md text-xs font-semibold transition-all ${bgClass} flex items-center justify-center`}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            {/* Overlay backdrop */}
            <div
              className="flex-1 bg-black/30"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* ─── Question content area ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
            {currentQuestion && (
              <div className="space-y-6">
                {/* Question header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={
                          currentQuestion.question.type === 'QCU'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                            : currentQuestion.question.type === 'QCM'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : currentQuestion.question.type === 'QRC'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }
                      >
                        {currentQuestion.question.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Question {currentIndex + 1} sur {questions.length}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {currentQuestion.bareme} pt{currentQuestion.bareme > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    {currentQuestion.question.themes && currentQuestion.question.themes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentQuestion.question.themes.slice(0, 3).map((theme, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300">
                            {theme}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Flag button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFlag(currentQuestion.id)}
                    className={`shrink-0 ${
                      flaggedQuestions.has(currentQuestion.id)
                        ? 'text-amber-600 hover:text-amber-700'
                        : 'text-muted-foreground hover:text-amber-600'
                    }`}
                  >
                    {flaggedQuestions.has(currentQuestion.id) ? (
                      <>
                        <Flag className="h-4 w-4 mr-1 fill-amber-500" />
                        <span className="text-xs hidden sm:inline">Marquée</span>
                      </>
                    ) : (
                      <>
                        <FlagOff className="h-4 w-4 mr-1" />
                        <span className="text-xs hidden sm:inline">Marquer</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Question enoncé */}
                <div className="rounded-lg border bg-card p-4 sm:p-6">
                  <p className="text-base leading-relaxed whitespace-pre-wrap">
                    {currentQuestion.question.enonce}
                  </p>
                </div>

                {/* Answer area based on type */}
                <div className="space-y-3">
                  {/* QCU - Single choice */}
                  {currentQuestion.question.type === 'QCU' && currentQuestion.question.propositions && (
                    <RadioGroup
                      value={reponses[currentQuestion.id] || ''}
                      onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                      className="space-y-2"
                    >
                      {currentQuestion.question.propositions.map((prop, idx) => {
                        const letter = LETTERS[idx]
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors cursor-pointer ${
                              reponses[currentQuestion.id] === letter
                                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleAnswerChange(currentQuestion.id, letter)}
                          >
                            <RadioGroupItem
                              value={letter}
                              id={`qcu-${currentQuestion.id}-${letter}`}
                              className="data-[state=checked]:border-emerald-600 data-[state=checked]:text-emerald-600"
                            />
                            <Label
                              htmlFor={`qcu-${currentQuestion.id}-${letter}`}
                              className="flex items-center gap-3 cursor-pointer flex-1"
                            >
                              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 shrink-0">
                                {letter}
                              </span>
                              <span className="text-sm leading-relaxed">{prop}</span>
                            </Label>
                          </div>
                        )
                      })}
                    </RadioGroup>
                  )}

                  {/* QCM - Multiple choice */}
                  {currentQuestion.question.type === 'QCM' && currentQuestion.question.propositions && (
                    <div className="space-y-2">
                      {currentQuestion.question.propositions.map((prop, idx) => {
                        const letter = LETTERS[idx]
                        const selectedLetters = parseJsonSafe<string[]>(reponses[currentQuestion.id], [])
                        const isChecked = selectedLetters.includes(letter)

                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors cursor-pointer ${
                              isChecked
                                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleQCMToggle(currentQuestion.id, letter)}
                          >
                            <div
                              className={`flex h-4 w-4 items-center justify-center rounded-[4px] border shrink-0 transition-colors ${
                                isChecked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-input bg-background'
                              }`}
                            >
                              {isChecked && <CheckCircle2 className="h-3 w-3" />}
                            </div>
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 shrink-0">
                              {letter}
                            </span>
                            <span className="text-sm leading-relaxed">{prop}</span>
                          </div>
                        )
                      })}
                      <p className="text-xs text-muted-foreground pt-1">
                        Cochez toutes les réponses correctes.
                      </p>
                    </div>
                  )}

                  {/* QRC - Short answer (paste disabled) */}
                  {currentQuestion.question.type === 'QRC' && (
                    <div className="space-y-2">
                      <Textarea
                        value={reponses[currentQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        onPaste={handlePastePrevent}
                        placeholder="Saisissez votre réponse ici..."
                        className="min-h-[120px] resize-y text-base"
                      />
                      <p className="text-xs text-muted-foreground">
                        Le copier-coller est désactivé pour ce type de question.
                      </p>
                    </div>
                  )}

                  {/* TRS - Extended answer (paste disabled) */}
                  {currentQuestion.question.type === 'TRS' && (
                    <div className="space-y-2">
                      <Textarea
                        value={reponses[currentQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        onPaste={handlePastePrevent}
                        placeholder="Développez votre réponse de manière détaillée..."
                        className="min-h-[240px] resize-y text-base"
                      />
                      <p className="text-xs text-muted-foreground">
                        Le copier-coller est désactivé pour ce type de question. Prenez le temps de rédiger votre réponse.
                      </p>
                    </div>
                  )}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => navigateToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0 || epreuve.blocageRetour}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Précédente
                  </Button>

                  {epreuve.blocageRetour && currentIndex > 0 && (
                    <span className="text-xs text-muted-foreground italic hidden sm:inline">
                      Retour en arrière désactivé
                    </span>
                  )}

                  {currentIndex < questions.length - 1 ? (
                    <Button
                      onClick={() => navigateToQuestion(currentIndex + 1)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      Suivante
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => submitExam(false)}
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Soumettre
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Fullscreen Exit Warning Dialog ─────────────────────────────── */}
      <Dialog open={showFullscreenWarning} onOpenChange={setShowFullscreenWarning}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Mode plein écran requis
            </DialogTitle>
            <DialogDescription>
              Vous avez quitté le mode plein écran. Veuillez revenir en plein écran pour continuer l&apos;épreuve.
              Cette action a été enregistrée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen()
                } catch {
                  // Fallback — fullscreen may not be available
                }
                setShowFullscreenWarning(false)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Maximize className="h-4 w-4 mr-2" />
              Revenir en plein écran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tab Switch Warning Dialog ──────────────────────────────────── */}
      <Dialog open={showTabSwitchWarning} onOpenChange={setShowTabSwitchWarning}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Changement d&apos;onglet détecté
            </DialogTitle>
            <DialogDescription>
              Vous avez quitté l&apos;onglet de l&apos;épreuve. Ce comportement a été enregistré et signalé.
              Veuillez rester sur cet onglet pendant toute la durée de l&apos;épreuve.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowTabSwitchWarning(false)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              J&apos;ai compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
