'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Progress } from '@/components/ui/progress'
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
  Timer,
  ShieldAlert,
  Printer,
  MousePointerClick,
  Camera,
  MinusCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { CodingQuestionStudent } from '@/components/coding/code-editor'
import { type CodingLanguage, type CodingAnswer, serializeCodingAnswer, parseCodingAnswer } from '@/lib/coding-types'

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
  penalite?: number
}

interface ExamQuestion {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: 'QCU' | 'QCM' | 'QRC' | 'TRS' | 'REFLEXION' | 'CODE'
    enonce: string
    propositions: string[] | null
    difficulte: string
    themes: string[] | null
    // CODE-specific fields (present when type is 'CODE')
    langage?: string
    codeInitial?: string
    fonctionSignature?: string
    testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
  }
}

interface EpreuveInfo {
  id: string
  titre: string
  description: string | null
  duree: number
  blocageRetour: boolean
  melangePropositions: boolean
  proctoringActif: boolean
  verificationIdentite: boolean
  noteTotal?: number
  dateFin?: string
  delaiGrace?: number
  clotureeAt?: string | null
  clotureeAutomatiquement?: boolean
  raisonCloture?: string | null
}

interface SecurityConfig {
  proctoringActif: boolean
  detectionCopie: boolean
  detectionOnglet: boolean
  detectionFullscreen: boolean
  blocageCopie: boolean
  blocageClicDroit: boolean
  blocageImpression: boolean
  verificationIdentite: boolean
  tempsInactiviteMax: number
  nbOngletsMax: number
  nbAlertesMax: number
  autoSubmitOnViolation: boolean
  captureEcran: boolean
  rapportFraude: boolean
  seuilSimilarite: number
  penaliteFullscreenExit: number
  fullscreenObligatoire: boolean
  intervalleCaptureEcran: number
}

type ExamPhase = 'pre-exam' | 'in-exam' | 'post-exam'
type AutoSubmitReason = 'time' | 'violations' | 'inactivity' | null

// ─── Default security config (fallback) ─────────────────────────────────────

const DEFAULT_SECURITY: SecurityConfig = {
  proctoringActif: false,
  detectionCopie: true,
  detectionOnglet: true,
  detectionFullscreen: true,
  blocageCopie: true,
  blocageClicDroit: true,
  blocageImpression: true,
  verificationIdentite: false,
  tempsInactiviteMax: 120,
  nbOngletsMax: 3,
  nbAlertesMax: 5,
  autoSubmitOnViolation: false,
  captureEcran: false,
  rapportFraude: true,
  seuilSimilarite: 0.85,
  penaliteFullscreenExit: 5,
  fullscreenObligatoire: true,
  intervalleCaptureEcran: 60,
}

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  const epreuveId = searchParams.get('epreuveId') || ''

  // If no epreuveId, redirect to mes-epreuves
  useEffect(() => {
    if (!epreuveId) {
      router.push('/mes-epreuves')
    }
  }, [epreuveId, router])

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

  // ─── Security config state ─────────────────────────────────────────────
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(DEFAULT_SECURITY)

  // ─── Anti-cheat state ──────────────────────────────────────────────────
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false)
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false)
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0)
  const [totalAlertCount, setTotalAlertCount] = useState(0)
  const [autoSubmitReason, setAutoSubmitReason] = useState<AutoSubmitReason>(null)
  const [showViolationDialog, setShowViolationDialog] = useState(false)
  const [showInactivityWarning, setShowInactivityWarning] = useState(false)
  const [penalite, setPenalite] = useState(0)
  const [isFullscreenBlocked, setIsFullscreenBlocked] = useState(false)
  const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null)
  const [showCaptureFlash, setShowCaptureFlash] = useState(false)

  // ─── Submit result state ──────────────────────────────────────────────────
  const [submitResult, setSubmitResult] = useState<{
    score: number
    totalPossible: number
    autoGradedTotal: number
    pendingCorrection: number
    scenario: 'A' | 'B'
    scenarioMessage: string
  } | null>(null)

  // ─── Closure / grace period state ───────────────────────────────────────
  const [isEpreuveClosed, setIsEpreuveClosed] = useState(false)
  const [inGracePeriod, setInGracePeriod] = useState(false)
  const [gracePeriodEndsAt, setGracePeriodEndsAt] = useState<Date | null>(null)
  const [closureRaison, setClosureRaison] = useState<string | null>(null)
  const [showClosureDialog, setShowClosureDialog] = useState(false)

  // ─── Refs ──────────────────────────────────────────────────────────────
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inactivityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const examContainerRef = useRef<HTMLDivElement>(null)
  const reponsesRef = useRef(reponses)
  const sessionRef = useRef(session)
  const phaseRef = useRef(phase)
  const lastActivityRef = useRef<number>(Date.now())
  const securityConfigRef = useRef(securityConfig)
  const totalAlertCountRef = useRef(totalAlertCount)
  const isAutoSubmittingRef = useRef(false)
  const fullscreenExitCountRef = useRef(fullscreenExitCount)
  const penaliteRef = useRef(penalite)

  // Keep refs in sync
  useEffect(() => { reponsesRef.current = reponses }, [reponses])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { securityConfigRef.current = securityConfig }, [securityConfig])
  useEffect(() => { totalAlertCountRef.current = totalAlertCount }, [totalAlertCount])
  useEffect(() => { fullscreenExitCountRef.current = fullscreenExitCount }, [fullscreenExitCount])
  useEffect(() => { penaliteRef.current = penalite }, [penalite])

  // ─── Fetch epreuve data ────────────────────────────────────────────────
  useEffect(() => {
    if (!epreuveId) {
      setLoading(false)
      return
    }

    async function fetchEpreuveData() {
      try {
        // Fetch epreuve info (studentView=true strips correct answers for security)
        const epreuveRes = await fetch(`/api/epreuves/${epreuveId}?studentView=true`)
        if (!epreuveRes.ok) throw new Error('Épreuve introuvable')
        const epreuveData = await epreuveRes.json()
        const epreuveInfo = epreuveData.epreuve || epreuveData
        setEpreuve(epreuveInfo)

        // Fetch security settings based on user's etablissementId
        const etabId = user?.etablissementId || user?.etablissement?.id
        if (etabId) {
          try {
            const secRes = await fetch(`/api/security-settings/etablissement/${etabId}`)
            if (secRes.ok) {
              const secData = await secRes.json()
              if (secData.securitySettings) {
                setSecurityConfig({
                  proctoringActif: secData.securitySettings.proctoringActif ?? DEFAULT_SECURITY.proctoringActif,
                  detectionCopie: secData.securitySettings.detectionCopie ?? DEFAULT_SECURITY.detectionCopie,
                  detectionOnglet: secData.securitySettings.detectionOnglet ?? DEFAULT_SECURITY.detectionOnglet,
                  detectionFullscreen: secData.securitySettings.detectionFullscreen ?? DEFAULT_SECURITY.detectionFullscreen,
                  blocageCopie: secData.securitySettings.blocageCopie ?? DEFAULT_SECURITY.blocageCopie,
                  blocageClicDroit: secData.securitySettings.blocageClicDroit ?? DEFAULT_SECURITY.blocageClicDroit,
                  blocageImpression: secData.securitySettings.blocageImpression ?? DEFAULT_SECURITY.blocageImpression,
                  verificationIdentite: secData.securitySettings.verificationIdentite ?? DEFAULT_SECURITY.verificationIdentite,
                  tempsInactiviteMax: secData.securitySettings.tempsInactiviteMax ?? DEFAULT_SECURITY.tempsInactiviteMax,
                  nbOngletsMax: secData.securitySettings.nbOngletsMax ?? DEFAULT_SECURITY.nbOngletsMax,
                  nbAlertesMax: secData.securitySettings.nbAlertesMax ?? DEFAULT_SECURITY.nbAlertesMax,
                  autoSubmitOnViolation: secData.securitySettings.autoSubmitOnViolation ?? DEFAULT_SECURITY.autoSubmitOnViolation,
                  captureEcran: secData.securitySettings.captureEcran ?? DEFAULT_SECURITY.captureEcran,
                  rapportFraude: secData.securitySettings.rapportFraude ?? DEFAULT_SECURITY.rapportFraude,
                  seuilSimilarite: secData.securitySettings.seuilSimilarite ?? DEFAULT_SECURITY.seuilSimilarite,
                  penaliteFullscreenExit: secData.securitySettings.penaliteFullscreenExit ?? DEFAULT_SECURITY.penaliteFullscreenExit,
                  fullscreenObligatoire: secData.securitySettings.fullscreenObligatoire ?? DEFAULT_SECURITY.fullscreenObligatoire,
                  intervalleCaptureEcran: secData.securitySettings.intervalleCaptureEcran ?? DEFAULT_SECURITY.intervalleCaptureEcran,
                })
              }
            }
          } catch {
            // Use defaults if security settings fetch fails
          }
        }

        // Check for existing session first (to get sessionId for consistent proposition ordering)
        let activeSessionId: string | null = null
        if (user?.id) {
          const sessionRes = await fetch(`/api/sessions?etudiantId=${user.id}&epreuveId=${epreuveId}`)
          if (sessionRes.ok) {
            const sessionsData = await sessionRes.json()
            const activeSession = sessionsData.find(
              (s: ExamSession) => s.statut === 'EN_COURS' || s.statut === 'NON_COMMENCEE'
            )
            if (activeSession) {
              activeSessionId = activeSession.id
              setSession(activeSession)
              // Initialize alert count and penalty from server
              setTotalAlertCount(activeSession.alertes || 0)
              setPenalite(activeSession.penalite || 0)
            }
          }
        }

        // Fetch questions — if there's an active session, pass sessionId to get consistent proposition ordering
        const questionsUrl = activeSessionId
          ? `/api/epreuves/${epreuveId}/questions?sessionId=${activeSessionId}`
          : `/api/epreuves/${epreuveId}/questions`
        const questionsRes = await fetch(questionsUrl)
        if (!questionsRes.ok) throw new Error('Questions introuvables')
        const questionsData = await questionsRes.json()
        // Sort by ordre
        questionsData.sort((a: ExamQuestion, b: ExamQuestion) => a.ordre - b.ordre)
        setQuestions(questionsData)

        // Resume exam if there's an active session
        if (activeSessionId && session) {
          if (session.statut === 'EN_COURS' && session.dateDebut) {
            // Resume: calculate remaining time
            const start = new Date(session.dateDebut).getTime()
            const end = start + epreuveInfo.duree * 60 * 1000
            const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000))
            setTimeRemaining(remaining)

            // Load existing answers
            const answersRes = await fetch(`/api/sessions/${activeSessionId}`)
            if (answersRes.ok) {
              const answersData = await answersRes.json()
              const sessionData = answersData.session || answersData
              const loadedReponses: Record<string, string> = {}
              if (sessionData.reponses && Array.isArray(sessionData.reponses)) {
                sessionData.reponses.forEach((r: { questionId: string; contenu: string | null }) => {
                  if (r.contenu) loadedReponses[r.questionId] = r.contenu
                })
              }
              setReponses(loadedReponses)
            }

            // Count fullscreen exits from logEvents to restore penalty count
            if (session.logEvents) {
              try {
                const logs = JSON.parse(session.logEvents as string)
                const fsExits = logs.filter((l: { type: string }) => l.type === 'FULLSCREEN_EXIT').length
                setFullscreenExitCount(fsExits)
              } catch {
                // Ignore parse errors
              }
            }

            // Resume exam directly
            setPhase('in-exam')
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
  }, [epreuveId, user?.id, user?.etablissementId, user?.etablissement?.id])

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

      // Update questions from session response (ensures consistent proposition ordering with stored mapping)
      if (data.epreuve?.questions && Array.isArray(data.epreuve.questions)) {
        const sessionQuestions = data.epreuve.questions.sort(
          (a: ExamQuestion, b: ExamQuestion) => a.ordre - b.ordre
        )
        setQuestions(sessionQuestions)
      }

      // Calculate time
      const start = new Date(data.session.dateDebut).getTime()
      const end = start + (epreuve?.duree || 60) * 60 * 1000
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000))
      setTimeRemaining(remaining)

      // Reset activity tracking
      lastActivityRef.current = Date.now()

      // Request fullscreen — MANDATORY if fullscreenObligatoire is true
      if (securityConfigRef.current.detectionFullscreen) {
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          // If fullscreen is mandatory and we can't enter it, warn the student
          if (securityConfigRef.current.fullscreenObligatoire) {
            toast.warning('Plein écran requis', {
              description: 'Veuillez autoriser le plein écran pour commencer l\'épreuve. Appuyez sur F11 si le bouton ne fonctionne pas.',
              duration: 8000,
            })
          }
        }
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
      const currentReponses = reponsesRef.current
      const entries = Object.entries(currentReponses)

      if (entries.length === 0) {
        setLastSaved(new Date())
        return
      }

      // Batch save all answers
      const res = await fetch(`/api/sessions/${sessionRef.current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reponses: currentReponses }),
      })

      if (res.ok) {
        setLastSaved(new Date())
      }
    } catch {
      // Silent fail — don't disrupt the student
    }
  }, [])

  // ─── Submit exam ───────────────────────────────────────────────────────
  const submitExam = useCallback(async (autoSubmit: boolean = false, reason: AutoSubmitReason = null) => {
    if (!sessionRef.current || isAutoSubmittingRef.current) return
    if (isSubmitting && !autoSubmit) return

    isAutoSubmittingRef.current = true
    setIsSubmitting(true)

    try {
      // Save answers first
      await saveAnswers()

      const res = await fetch(`/api/sessions/${sessionRef.current.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSubmit, reponses: reponsesRef.current }),
      })

      if (!res.ok) throw new Error('Erreur lors de la soumission')

      const result = await res.json()

      if (autoSubmit) {
        setAutoSubmitted(true)
        setAutoSubmitReason(reason)
      }

      // Update penalty from server response
      if (result.penalite !== undefined) {
        setPenalite(result.penalite)
      }

      // Store submit result for scenario-specific display
      if (result.scenario) {
        setSubmitResult({
          score: result.score ?? 0,
          totalPossible: result.totalPossible ?? 0,
          autoGradedTotal: result.autoGradableTotal ?? result.totalPossible ?? 0,
          pendingCorrection: result.pendingCorrection ?? 0,
          scenario: result.scenario,
          scenarioMessage: result.scenarioMessage ?? '',
        })
      }

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
      if (inactivityIntervalRef.current) clearInterval(inactivityIntervalRef.current)
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de soumettre l\'épreuve',
      })
    } finally {
      setIsSubmitting(false)
      isAutoSubmittingRef.current = false
    }
  }, [isSubmitting, saveAnswers])

  // ─── Log alert (enhanced with penalty) ─────────────────────────────────
  const logAlert = useCallback(async (type: string, details?: string, alertPenalite?: number) => {
    if (!sessionRef.current) return

    try {
      await fetch(`/api/sessions/${sessionRef.current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alerte: {
            type,
            details,
            penalite: alertPenalite || 0,
          },
        }),
      })

      // Increment client-side alert count
      setTotalAlertCount((prev) => {
        const newCount = prev + 1
        // Check if we need to auto-submit
        const config = securityConfigRef.current
        if (config.autoSubmitOnViolation && newCount >= config.nbAlertesMax && !isAutoSubmittingRef.current) {
          // Trigger auto-submit via violation dialog
          setAutoSubmitReason('violations')
          setShowViolationDialog(true)
        }
        return newCount
      })

      // Update penalty
      if (alertPenalite && alertPenalite > 0) {
        setPenalite((prev) => prev + alertPenalite)
      }
    } catch {
      // Silent fail
    }
  }, [])

  // ─── Handle violation dialog confirmation ──────────────────────────────
  const handleViolationSubmit = useCallback(() => {
    setShowViolationDialog(false)
    submitExam(true, 'violations')
  }, [submitExam])

  // ─── Capture screenshot ───────────────────────────────────────────────
  const captureScreen = useCallback(async () => {
    if (!sessionRef.current || !examContainerRef.current) return

    try {
      // Dynamic import of html2canvas-pro
      const html2canvas = (await import('html2canvas-pro')).default
      const canvas = await html2canvas(examContainerRef.current, {
        scale: 0.5, // Lower resolution for smaller payload
        useCORS: true,
        logging: false,
        allowTaint: true,
      })

      const image = canvas.toDataURL('image/jpeg', 0.4) // Compress to JPEG 40% quality

      // Upload to server
      await fetch(`/api/sessions/${sessionRef.current.id}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })

      // Show brief flash indicator
      setShowCaptureFlash(true)
      setLastCaptureTime(new Date())
      setTimeout(() => setShowCaptureFlash(false), 1500)
    } catch {
      // Silent fail — don't disrupt the exam
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
          submitExam(true, 'time')
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

  // ─── Anti-cheat: Fullscreen exit detection (with penalty) ─────────────
  useEffect(() => {
    if (phase !== 'in-exam' || !securityConfig.detectionFullscreen) return

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        // Student exited fullscreen
        setFullscreenExitCount((prev) => {
          const newCount = prev + 1
          const config = securityConfigRef.current

          // Apply penalty starting from 2nd exit
          if (newCount >= 2) {
            const penaltyAmount = config.penaliteFullscreenExit
            logAlert(
              'FULLSCREEN_EXIT',
              `Sortie plein écran n°${newCount} — Pénalité de -${penaltyAmount} points appliquée`,
              penaltyAmount
            )
            toast.error('Pénalité appliquée', {
              description: `-${penaltyAmount} points pour sortie du plein écran (tentative n°${newCount}). Total pénalités: -${penaliteRef.current + penaltyAmount} points`,
              duration: 5000,
            })
          } else {
            // 1st exit: just warning, no penalty
            logAlert('FULLSCREEN_EXIT', `Sortie plein écran n°1 — Avertissement (pas de pénalité)`)
            toast.warning('Mode plein écran requis', {
              description: 'La prochaine sortie du plein écran entraînera une pénalité de points.',
              duration: 5000,
            })
          }

          // If fullscreen is mandatory, block the exam
          if (config.fullscreenObligatoire) {
            setIsFullscreenBlocked(true)
          } else {
            setShowFullscreenWarning(true)
          }

          return newCount
        })
      } else {
        // Student re-entered fullscreen
        setIsFullscreenBlocked(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [phase, securityConfig.detectionFullscreen, logAlert])

  // ─── Anti-cheat: Tab switch detection (conditional) ───────────────────
  useEffect(() => {
    if (phase !== 'in-exam' || !securityConfig.detectionOnglet) return

    function handleVisibilityChange() {
      if (document.hidden) {
        const timestamp = new Date().toLocaleTimeString('fr-FR')
        logAlert('TAB_SWITCH', `Changement d'onglet à ${timestamp}`)
      } else {
        // Returning to tab — show warning
        setShowTabSwitchWarning(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [phase, securityConfig.detectionOnglet, logAlert])

  // ─── Anti-cheat: Right-click prevention (conditional) ─────────────────
  useEffect(() => {
    if (phase !== 'in-exam' || !securityConfig.blocageClicDroit) return

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [phase, securityConfig.blocageClicDroit])

  // ─── Anti-cheat: Keyboard shortcuts prevention (enhanced) ─────────────
  useEffect(() => {
    if (phase !== 'in-exam') return

    function handleKeyDown(e: KeyboardEvent) {
      const config = securityConfigRef.current

      // Block Ctrl+C, Ctrl+V, Ctrl+U (if blocageCopie)
      if (config.blocageCopie && e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'u')) {
        e.preventDefault()
        if (e.key === 'c') logAlert('COPY_ATTEMPT', 'Ctrl+C')
        if (e.key === 'v') logAlert('PASTE_ATTEMPT', 'Ctrl+V')
      }

      // Always block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (DevTools)
      if (e.key === 'F12') {
        e.preventDefault()
        logAlert('DEVTOOLS_ATTEMPT', 'F12')
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault()
        logAlert('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+I')
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault()
        logAlert('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+J')
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        logAlert('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+C')
      }

      // Block PrintScreen + Ctrl+P (blocageImpression)
      if (config.blocageImpression) {
        if (e.key === 'PrintScreen') {
          e.preventDefault()
          // Clear clipboard to prevent screenshot paste
          try {
            navigator.clipboard.writeText('')
          } catch {
            // Clipboard API may not be available
          }
          logAlert('PRINTSCREEN_ATTEMPT', 'Touche Impr. écran')
          toast.warning('Capture désactivée', {
            description: 'La touche Impr. écran est désactivée pendant l\'épreuve.',
          })
        }
        // Block Ctrl+P
        if (e.ctrlKey && e.key === 'p') {
          e.preventDefault()
          logAlert('PRINT_ATTEMPT', 'Ctrl+P')
          toast.warning('Impression désactivée', {
            description: 'L\'impression est désactivée pendant l\'épreuve.',
          })
        }
        // Block Win+Shift+S (Windows Snipping Tool) — detected via key combination
        if (e.metaKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
          e.preventDefault()
          try {
            navigator.clipboard.writeText('')
          } catch {
            // Clipboard API may not be available
          }
          logAlert('PRINTSCREEN_ATTEMPT', 'Win+Shift+S (Outil Capture)')
          toast.warning('Capture désactivée', {
            description: 'L\'outil de capture est désactivé pendant l\'épreuve.',
          })
        }
      }

      // Block Alt+Tab (cannot be reliably blocked in browsers, but we log the attempt)
      if (e.altKey && e.key === 'Tab') {
        logAlert('ALT_TAB', 'Alt+Tab détecté')
      }

      // Block Escape (prevents exiting fullscreen)
      if (e.key === 'Escape' && config.detectionFullscreen && config.fullscreenObligatoire) {
        // We can't prevent Escape from exiting fullscreen, but we'll detect it via fullscreenchange
        // and block the exam content via isFullscreenBlocked
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [phase, logAlert])

  // ─── Anti-cheat: Inactivity detection (conditional) ───────────────────
  useEffect(() => {
    if (phase !== 'in-exam') return
    const maxInactive = securityConfig.tempsInactiviteMax
    if (maxInactive <= 0) return

    // Reset activity timestamp
    lastActivityRef.current = Date.now()

    function resetActivity() {
      lastActivityRef.current = Date.now()
    }

    // Listen for user activity
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
    activityEvents.forEach((evt) => {
      document.addEventListener(evt, resetActivity, { passive: true })
    })

    // Check inactivity every 5 seconds
    inactivityIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000)
      const config = securityConfigRef.current

      if (elapsed >= config.tempsInactiviteMax) {
        // Inactivity threshold reached
        if (!isAutoSubmittingRef.current) {
          logAlert('INACTIVITY', `Inactivité détectée: ${elapsed} secondes`)
          setShowInactivityWarning(true)

          if (config.autoSubmitOnViolation) {
            setAutoSubmitReason('inactivity')
            setShowViolationDialog(true)
          }
        }
        // Reset timer to avoid repeated alerts
        lastActivityRef.current = Date.now()
      }
    }, 5000)

    return () => {
      activityEvents.forEach((evt) => {
        document.removeEventListener(evt, resetActivity)
      })
      if (inactivityIntervalRef.current) clearInterval(inactivityIntervalRef.current)
    }
  }, [phase, securityConfig.tempsInactiviteMax, logAlert])

  // ─── Periodic screenshot capture ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'in-exam' || !securityConfig.captureEcran) return

    const interval = securityConfig.intervalleCaptureEcran * 1000
    if (interval <= 0) return

    // First capture after half the interval
    const firstCaptureTimeout = setTimeout(() => {
      captureScreen()
    }, interval / 2)

    // Then periodically
    captureIntervalRef.current = setInterval(() => {
      captureScreen()
    }, interval)

    return () => {
      clearTimeout(firstCaptureTimeout)
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current)
    }
  }, [phase, securityConfig.captureEcran, securityConfig.intervalleCaptureEcran, captureScreen])

  // ─── Periodic closure check (every 15s during exam) ───────────────────
  useEffect(() => {
    if (phase !== 'in-exam' || !epreuveId) return

    const checkClosure = async () => {
      try {
        const res = await fetch(`/api/epreuves/auto-close?epreuveId=${epreuveId}`)
        if (res.ok) {
          const data = await res.json()
          
          if (data.isClosed) {
            setIsEpreuveClosed(true)
            setClosureRaison(data.raisonCloture)
            setShowClosureDialog(true)
            // Auto-submit if still in exam
            if (phaseRef.current === 'in-exam' && !isAutoSubmittingRef.current) {
              submitExam(true, 'time')
            }
          } else if (data.inGracePeriod) {
            setInGracePeriod(true)
            setGracePeriodEndsAt(data.gracePeriodEndsAt ? new Date(data.gracePeriodEndsAt) : null)
          } else {
            setInGracePeriod(false)
            setGracePeriodEndsAt(null)
          }
        }
      } catch {
        // Silent fail — don't disrupt the exam
      }
    }

    // Check immediately, then every 15 seconds
    checkClosure()
    const interval = setInterval(checkClosure, 15000)

    return () => clearInterval(interval)
  }, [phase, epreuveId, submitExam])

  // ─── Computed: inactivity progress ────────────────────────────────────
  const [inactivitySeconds, setInactivitySeconds] = useState(0)
  useEffect(() => {
    if (phase !== 'in-exam' || securityConfig.tempsInactiviteMax <= 0) return

    const interval = setInterval(() => {
      setInactivitySeconds(Math.floor((Date.now() - lastActivityRef.current) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [phase, securityConfig.tempsInactiviteMax])

  const inactivityRatio = securityConfig.tempsInactiviteMax > 0
    ? Math.min(inactivitySeconds / securityConfig.tempsInactiviteMax, 1)
    : 0

  // ─── Save on question navigation ───────────────────────────────────────
  const navigateToQuestion = useCallback((index: number) => {
    setCurrentIndex(index)
    saveAnswers()
  }, [saveAnswers])

  // ─── Handle answer change ──────────────────────────────────────────────
  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    setReponses((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  // ─── Handle QCM toggle ─────────────────────────────────────────────────
  const handleQCMToggle = useCallback((questionId: string, letter: string) => {
    setReponses((prev) => {
      const current = parseJsonSafe<string[]>(prev[questionId], [])
      const updated = current.includes(letter)
        ? current.filter((l) => l !== letter)
        : [...current, letter]
      return { ...prev, [questionId]: JSON.stringify(updated) }
    })
  }, [])

  // ─── Toggle flag ───────────────────────────────────────────────────────
  const toggleFlag = useCallback((questionId: string) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }, [])

  // ─── Paste handler for QRC/TRS (conditional) ──────────────────────────
  const handlePastePrevent = useCallback((e: React.ClipboardEvent) => {
    if (!securityConfig.blocageCopie) return
    e.preventDefault()
    logAlert('PASTE_ATTEMPT')
    toast.warning('Coller désactivé', {
      description: 'Le copier-coller est interdit pour ce type de question.',
    })
  }, [logAlert, securityConfig.blocageCopie])

  // ─── Dynamic pre-exam rules ───────────────────────────────────────────
  const examRules = (() => {
    const rules: { icon: React.ElementType; text: string; highlight?: boolean }[] = []

    if (securityConfig.detectionFullscreen) {
      rules.push({
        icon: Maximize,
        text: securityConfig.fullscreenObligatoire
          ? 'Le mode plein écran est OBLIGATOIRE — l\'épreuve est bloquée si vous quittez le plein écran'
          : 'Le mode plein écran est activé pendant l\'épreuve',
        highlight: securityConfig.fullscreenObligatoire,
      })
    }
    if (securityConfig.detectionFullscreen && securityConfig.penaliteFullscreenExit > 0) {
      rules.push({
        icon: MinusCircle,
        text: `Chaque sortie du plein écran à partir de la 2ème tentative entraîne une pénalité de -${securityConfig.penaliteFullscreenExit} points sur votre note`,
        highlight: true,
      })
    }
    if (securityConfig.detectionOnglet) {
      rules.push({ icon: Eye, text: 'Toute sortie de l\'onglet sera enregistrée' })
    }
    if (securityConfig.blocageCopie) {
      rules.push({ icon: ClipboardPaste, text: 'Le copier-coller est désactivé pour les questions à réponse courte' })
    }
    if (securityConfig.blocageClicDroit) {
      rules.push({ icon: MousePointerClick, text: 'Le clic droit est désactivé pendant l\'épreuve' })
    }
    if (securityConfig.blocageImpression) {
      rules.push({ icon: Printer, text: 'Les touches Impr. écran et l\'outil de capture Windows sont désactivés' })
    }
    if (securityConfig.captureEcran) {
      rules.push({
        icon: Camera,
        text: `Des captures d'écran périodiques seront effectuées toutes les ${securityConfig.intervalleCaptureEcran} secondes`,
      })
    }
    rules.push({ icon: Save, text: 'Les réponses sont sauvegardées automatiquement toutes les 30 secondes' })
    rules.push({ icon: Clock, text: 'L\'épreuve sera soumise automatiquement à la fin du temps imparti' })
    if (securityConfig.autoSubmitOnViolation) {
      rules.push({
        icon: ShieldAlert,
        text: `Après ${securityConfig.nbAlertesMax} alertes de sécurité, l'épreuve sera soumise automatiquement`,
        highlight: true,
      })
    }
    if (securityConfig.tempsInactiviteMax > 0) {
      rules.push({
        icon: Timer,
        text: `Toute inactivité de plus de ${securityConfig.tempsInactiviteMax} secondes sera signalée`,
      })
    }

    return rules
  })()

  // ─── Computed: answered questions count ────────────────────────────────
  const answeredCount = questions.filter((q) => {
    const answer = reponses[q.questionId]
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
              onClick={() => router.push('/mes-epreuves')}
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

            {/* Dynamic Rules */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600" />
                Règles de l&apos;épreuve
              </h3>
              <ul className="space-y-2.5">
                {examRules.map((rule, i) => (
                  <li key={i} className={`flex items-start gap-2.5 text-sm ${rule.highlight ? 'font-medium' : ''}`}>
                    <rule.icon className={`h-4 w-4 mt-0.5 shrink-0 ${rule.highlight ? 'text-red-500' : 'text-emerald-600'}`} />
                    <span className={rule.highlight ? 'text-red-700 dark:text-red-400' : ''}>{rule.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Penalty warning box */}
            {securityConfig.detectionFullscreen && securityConfig.penaliteFullscreenExit > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <MinusCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      Système de pénalité plein écran
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      1ère sortie : avertissement sans pénalité. À partir de la 2ème sortie :
                      -{securityConfig.penaliteFullscreenExit} points par sortie.
                      {securityConfig.fullscreenObligatoire && ' L\'épreuve sera bloquée tant que vous n\'êtes pas en plein écran.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                J&apos;ai compris que toute sortie du mode plein écran à partir de la 2ème tentative entraînera une pénalité.
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
    const autoSubmitMessages: Record<NonNullable<AutoSubmitReason>, { title: string; description: string }> = {
      time: {
        title: 'Temps écoulé',
        description: 'Votre épreuve a été soumise automatiquement car le temps imparti est écoulé.',
      },
      violations: {
        title: 'Trop d\'alertes de sécurité',
        description: 'Votre épreuve a été soumise automatiquement car vous avez atteint le nombre maximum d\'alertes de sécurité.',
      },
      inactivity: {
        title: 'Inactivité prolongée',
        description: 'Votre épreuve a été soumise automatiquement en raison d\'une inactivité prolongée.',
      },
    }

    return (
      <div className="flex items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-lg border-emerald-200 dark:border-emerald-900">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Épreuve soumise !</CardTitle>
            <CardDescription className="mt-1">
              {autoSubmitted && autoSubmitReason && autoSubmitMessages[autoSubmitReason]
                ? autoSubmitMessages[autoSubmitReason].description
                : autoSubmitted
                  ? 'Votre épreuve a été soumise automatiquement.'
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

            {/* Scenario A: Show final score immediately */}
            {submitResult && submitResult.scenario === 'A' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    Correction automatique terminée
                  </p>
                </div>
                <div className="flex items-baseline gap-1 ml-7">
                  <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                    {submitResult.score.toFixed(1)}
                  </span>
                  <span className="text-lg text-muted-foreground">/{submitResult.totalPossible}</span>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 ml-7 mt-1">
                  Toutes les questions ont été corrigées automatiquement. Votre note finale est disponible.
                </p>
              </div>
            )}

            {/* Scenario B: Show partial score with pending correction */}
            {submitResult && submitResult.scenario === 'B' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-teal-600" />
                    <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                      Note partielle (questions auto-corrigées)
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1 ml-7">
                    <span className="text-3xl font-bold text-teal-700 dark:text-teal-300">
                      {submitResult.score.toFixed(1)}
                    </span>
                    <span className="text-lg text-muted-foreground">/{submitResult.autoGradedTotal}</span>
                  </div>
                  <p className="text-xs text-teal-700 dark:text-teal-300 ml-7 mt-1">
                    Score basé uniquement sur les questions à choix (QCU/QCM).
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      En attente de correction manuelle
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 ml-6 mt-1">
                    {submitResult.pendingCorrection} question{submitResult.pendingCorrection > 1 ? 's' : ''} ouverte{submitResult.pendingCorrection > 1 ? 's' : ''} (QRC/Réflexion) nécessite{submitResult.pendingCorrection > 1 ? 'nt' : ''} une correction par l&apos;enseignant.
                    Votre note définitive sera disponible après correction.
                  </p>
                </div>
              </div>
            )}

            {/* Penalty display */}
            {penalite > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 mb-1">
                  <MinusCircle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Pénalité appliquée : -{penalite} point{penalite > 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 ml-6">
                  Retrait pour {fullscreenExitCount - 1} sortie{fullscreenExitCount - 1 > 1 ? 's' : ''} du plein écran au-delà de la 1ère
                  ({securityConfig.penaliteFullscreenExit} pts × {fullscreenExitCount - 1} = -{penalite} pts)
                </p>
              </div>
            )}

            {/* Alert count display */}
            {totalAlertCount > 0 && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium">
                    {totalAlertCount} alerte{totalAlertCount > 1 ? 's' : ''} de sécurité enregistrée{totalAlertCount > 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Les alertes ont été communiquées à votre enseignant.
                </p>
              </div>
            )}

            {autoSubmitted && autoSubmitReason && autoSubmitMessages[autoSubmitReason] && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <FileWarning className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {autoSubmitMessages[autoSubmitReason].title}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {autoSubmitMessages[autoSubmitReason].description}
                  </p>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => router.push('/mes-epreuves')}
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

  // Alert counter color
  const alertRatio = securityConfig.nbAlertesMax > 0 ? totalAlertCount / securityConfig.nbAlertesMax : 0
  const alertBadgeColor = alertRatio >= 0.8
    ? 'border-red-400 text-red-600 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/50'
    : alertRatio >= 0.5
      ? 'border-amber-400 text-amber-600 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/50'
      : 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/50'

  // Inactivity badge color
  const inactivityBadgeColor = inactivityRatio >= 0.8
    ? 'text-red-600 dark:text-red-400'
    : inactivityRatio >= 0.5
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div
      ref={examContainerRef}
      className="fixed inset-0 z-50 bg-background flex flex-col select-none"
      onContextMenu={(e) => {
        if (securityConfig.blocageClicDroit) e.preventDefault()
      }}
    >
      {/* ─── Fullscreen Blocked Overlay ────────────────────────────────── */}
      {isFullscreenBlocked && securityConfig.fullscreenObligatoire && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
          <div className="text-center space-y-6 p-8 max-w-md">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <Maximize className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-white">Mode plein écran requis</h2>
            <p className="text-gray-300">
              Vous avez quitté le mode plein écran. L&apos;épreuve est bloquée tant que vous n&apos;êtes pas en plein écran.
            </p>
            {fullscreenExitCount >= 2 && (
              <div className="rounded-lg bg-amber-900/50 border border-amber-500 p-3">
                <p className="text-amber-200 text-sm font-medium">
                  ⚠️ Pénalité de -{securityConfig.penaliteFullscreenExit} points appliquée
                  (sortie n°{fullscreenExitCount})
                </p>
                <p className="text-amber-300 text-xs mt-1">
                  Total pénalités : -{penalite} points
                </p>
              </div>
            )}
            {securityConfig.autoSubmitOnViolation && (
              <p className="text-gray-400 text-sm">
                Alertes restantes avant soumission automatique : {Math.max(0, securityConfig.nbAlertesMax - totalAlertCount)}
              </p>
            )}
            <Button
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen()
                } catch {
                  // Fallback — instruct user
                  toast.error('Impossible de revenir en plein écran', {
                    description: 'Appuyez sur F11 pour activer le plein écran.',
                    duration: 8000,
                  })
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base px-8"
              size="lg"
            >
              <Maximize className="h-5 w-5 mr-2" />
              Revenir en plein écran
            </Button>
            <p className="text-gray-500 text-xs">
              Le chronomètre continue de tourner pendant que vous n&apos;êtes pas en plein écran.
            </p>
          </div>
        </div>
      )}

      {/* ─── Screenshot capture flash indicator ─────────────────────────── */}
      {showCaptureFlash && (
        <div className="fixed top-4 right-4 z-[90] flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 shadow-lg dark:border-blue-800 dark:bg-blue-950/80 animate-pulse">
          <Camera className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Capture d&apos;écran</span>
        </div>
      )}

      {/* ─── Grace Period Banner ─────────────────────────────────────────── */}
      {inGracePeriod && gracePeriodEndsAt && !isEpreuveClosed && (
        <div className="fixed top-0 left-0 right-0 z-[95] bg-amber-500 text-white px-4 py-2 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span className="font-bold text-sm">
              ⏰ Période de grâce — Temps écoulé ! Soumettez rapidement votre épreuve !
            </span>
            <span className="bg-white/20 rounded px-2 py-0.5 text-xs font-mono">
              {Math.max(0, Math.ceil((gracePeriodEndsAt.getTime() - Date.now()) / 60000))} min restante(s)
            </span>
          </div>
        </div>
      )}

      {/* ─── Closure Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showClosureDialog} onOpenChange={setShowClosureDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Lock className="h-5 w-5" />
              Épreuve clôturée
            </DialogTitle>
            <DialogDescription>
              Cette épreuve a été clôturée automatiquement.
              {closureRaison === 'TOUS_SOUMIS'
                ? ' Tous les étudiants ont soumis leur composition.'
                : ' La période de passation est terminée.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <Lock className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-sm text-muted-foreground">
              Les soumissions ne sont plus acceptées. Votre travail a été sauvegardé automatiquement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowClosureDialog(false)
              router.push('/mes-epreuves')
            }}>
              <Home className="h-4 w-4 mr-2" />
              Retour aux épreuves
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

        {/* Center: Timer + Penalty */}
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

          {/* Penalty indicator */}
          {penalite > 0 && (
            <Badge
              variant="outline"
              className="text-xs border-red-400 text-red-600 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/50"
            >
              <MinusCircle className="h-3 w-3 mr-1" />
              -{penalite} pts
            </Badge>
          )}

          {/* Inactivity indicator */}
          {securityConfig.tempsInactiviteMax > 0 && inactivityRatio >= 0.5 && (
            <Badge
              variant="outline"
              className={`text-xs ${inactivityBadgeColor} ${inactivityRatio >= 0.8 ? 'animate-pulse' : ''}`}
            >
              <Timer className="h-3 w-3 mr-1" />
              {inactivitySeconds}s
            </Badge>
          )}

          {/* Capture indicator */}
          {securityConfig.captureEcran && lastCaptureTime && (
            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
              <Camera className="h-3 w-3 mr-1" />
              Capt.
            </Badge>
          )}
        </div>

        {/* Right: Alert counter + Progress + Save indicator + Submit */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Alert counter badge */}
          {securityConfig.autoSubmitOnViolation && (
            <Badge variant="outline" className={`text-xs ${alertBadgeColor}`}>
              <ShieldAlert className="h-3 w-3 mr-1" />
              Alertes: {totalAlertCount}/{securityConfig.nbAlertesMax}
            </Badge>
          )}

          {/* Fullscreen exit counter */}
          {securityConfig.detectionFullscreen && fullscreenExitCount > 0 && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/50">
              <Maximize className="h-3 w-3 mr-1" />
              Sorties: {fullscreenExitCount}
            </Badge>
          )}

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
                <Progress value={questions.length ? (answeredCount / questions.length) * 100 : 0} className="h-1.5" />
              </div>

              {/* Question grid */}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = (() => {
                    const ans = reponses[q.questionId]
                    if (!ans) return false
                    if (q.question.type === 'QCM') {
                      return parseJsonSafe<string[]>(ans, []).length > 0
                    }
                    return ans.trim().length > 0
                  })()
                  const isFlagged = flaggedQuestions.has(q.questionId)
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
                {securityConfig.autoSubmitOnViolation && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Alertes</span>
                    <Badge variant="secondary" className={`text-xs ${alertBadgeColor}`}>
                      {totalAlertCount}/{securityConfig.nbAlertesMax}
                    </Badge>
                  </div>
                )}
                {penalite > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pénalité</span>
                    <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      -{penalite} pts
                    </Badge>
                  </div>
                )}
                {securityConfig.detectionFullscreen && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Sorties plein écran</span>
                    <Badge variant="secondary" className={`text-xs ${fullscreenExitCount > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : ''}`}>
                      {fullscreenExitCount}
                    </Badge>
                  </div>
                )}
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
                  <Progress value={questions.length ? (answeredCount / questions.length) * 100 : 0} className="h-1.5" />
                </div>

                {/* Question grid */}
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = (() => {
                      const ans = reponses[q.questionId]
                      if (!ans) return false
                      if (q.question.type === 'QCM') {
                        return parseJsonSafe<string[]>(ans, []).length > 0
                      }
                      return ans.trim().length > 0
                    })()
                    const isFlagged = flaggedQuestions.has(q.questionId)
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

                {/* Mobile penalty info */}
                {penalite > 0 && (
                  <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                      Pénalité : -{penalite} pts ({fullscreenExitCount - 1} sortie{fullscreenExitCount - 1 > 1 ? 's' : ''} plein écran)
                    </p>
                  </div>
                )}
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
                                : currentQuestion.question.type === 'REFLEXION'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                  : currentQuestion.question.type === 'CODE'
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800'
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
                    onClick={() => toggleFlag(currentQuestion.questionId)}
                    className={`shrink-0 ${
                      flaggedQuestions.has(currentQuestion.questionId)
                        ? 'text-amber-600 hover:text-amber-700'
                        : 'text-muted-foreground hover:text-amber-600'
                    }`}
                  >
                    {flaggedQuestions.has(currentQuestion.questionId) ? (
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
                      value={reponses[currentQuestion.questionId] || ''}
                      onValueChange={(value) => handleAnswerChange(currentQuestion.questionId, value)}
                      className="space-y-2"
                    >
                      {currentQuestion.question.propositions.map((prop, idx) => {
                        const letter = LETTERS[idx]
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors cursor-pointer ${
                              reponses[currentQuestion.questionId] === letter
                                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleAnswerChange(currentQuestion.questionId, letter)}
                          >
                            <RadioGroupItem
                              value={letter}
                              id={`qcu-${currentQuestion.questionId}-${letter}`}
                              className="data-[state=checked]:border-emerald-600 data-[state=checked]:text-emerald-600"
                            />
                            <Label
                              htmlFor={`qcu-${currentQuestion.questionId}-${letter}`}
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
                        const selectedLetters = parseJsonSafe<string[]>(reponses[currentQuestion.questionId], [])
                        const isChecked = selectedLetters.includes(letter)

                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors cursor-pointer ${
                              isChecked
                                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleQCMToggle(currentQuestion.questionId, letter)}
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

                  {/* QRC - Short answer (paste conditionally disabled) */}
                  {currentQuestion.question.type === 'QRC' && (
                    <div className="space-y-2">
                      <Textarea
                        value={reponses[currentQuestion.questionId] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.questionId, e.target.value)}
                        onPaste={securityConfig.blocageCopie ? handlePastePrevent : undefined}
                        placeholder="Saisissez votre réponse ici..."
                        className="min-h-[120px] resize-y text-base"
                      />
                      {securityConfig.blocageCopie && (
                        <p className="text-xs text-muted-foreground">
                          Le copier-coller est désactivé pour ce type de question.
                        </p>
                      )}
                    </div>
                  )}

                  {/* TRS - Extended answer (paste conditionally disabled) */}
                  {currentQuestion.question.type === 'TRS' && (
                    <div className="space-y-2">
                      <Textarea
                        value={reponses[currentQuestion.questionId] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.questionId, e.target.value)}
                        onPaste={securityConfig.blocageCopie ? handlePastePrevent : undefined}
                        placeholder="Développez votre réponse de manière détaillée..."
                        className="min-h-[240px] resize-y text-base"
                      />
                      {securityConfig.blocageCopie && (
                        <p className="text-xs text-muted-foreground">
                          Le copier-coller est désactivé pour ce type de question. Prenez le temps de rédiger votre réponse.
                        </p>
                      )}
                    </div>
                  )}

                  {/* REFLEXION - Digital writing sheet (feuille de rédaction) */}
                  {currentQuestion.question.type === 'REFLEXION' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Feuille de rédaction — Développez votre réflexion de manière structurée</span>
                      </div>
                      <div className="relative">
                        {/* Paper-like writing area */}
                        <div className="rounded-lg border-2 border-amber-200 dark:border-amber-900 bg-gradient-to-b from-amber-50/80 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10 overflow-hidden">
                          {/* Paper header */}
                          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-100/50 dark:bg-amber-950/30">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                Feuille de réponse
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                {(() => {
                                  const text = reponses[currentQuestion.questionId] || ''
                                  const words = text.trim() ? text.trim().split(/\s+/).length : 0
                                  return `${words} mot${words > 1 ? 's' : ''}`
                                })()}
                              </span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                {(() => {
                                  const text = reponses[currentQuestion.questionId] || ''
                                  return `${text.length} car.`
                                })()}
                              </span>
                            </div>
                          </div>
                          {/* Textarea with paper lines effect */}
                          <Textarea
                            value={reponses[currentQuestion.questionId] || ''}
                            onChange={(e) => handleAnswerChange(currentQuestion.questionId, e.target.value)}
                            onPaste={securityConfig.blocageCopie ? handlePastePrevent : undefined}
                            placeholder="Rédigez votre réponse ici...&#10;&#10;Conseil : Structurez votre réponse en plusieurs parties :&#10;1. Analyse de la situation&#10;2. Arguments et développements&#10;3. Conclusion et ouverture"
                            className="min-h-[400px] sm:min-h-[500px] resize-y text-base leading-[2rem] border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-4 sm:p-6 placeholder:text-amber-400/60 dark:placeholder:text-amber-600/40"
                            style={{
                              backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, rgba(180,140,80,0.15) 31px, rgba(180,140,80,0.15) 32px)',
                              backgroundSize: '100% 32px',
                              lineHeight: '32px',
                              paddingTop: '11px',
                            }}
                          />
                        </div>
                      </div>
                      {/* Writing aids */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {securityConfig.blocageCopie && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Copier-coller désactivé
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Sauvegarde auto toutes les 30s</span>
                        </div>
                      </div>
                      {/* Minimum length indicator */}
                      {(() => {
                        const text = reponses[currentQuestion.questionId] || ''
                        const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
                        const minWords = 50
                        const progress = Math.min(100, (wordCount / minWords) * 100)
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={`font-medium ${progress >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {progress >= 100 ? '✓ Réponse suffisamment développée' : `Minimum recommandé : ${minWords} mots`}
                              </span>
                              <span className="text-muted-foreground">{wordCount}/{minWords} mots</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-400'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* CODE - Programming question with Monaco Editor */}
                  {currentQuestion.question.type === 'CODE' && (
                    <CodingQuestionStudent
                      questionId={currentQuestion.questionId}
                      enonce={currentQuestion.question.enonce}
                      langage={(currentQuestion.question.langage || 'javascript') as CodingLanguage}
                      codeInitial={currentQuestion.question.codeInitial || '// Écrivez votre code ici\n'}
                      fonctionSignature={currentQuestion.question.fonctionSignature || ''}
                      testsPublics={currentQuestion.question.testsPublics || []}
                      bareme={currentQuestion.bareme}
                      currentCode={(() => {
                        const answer = parseCodingAnswer(reponses[currentQuestion.questionId] || null)
                        return answer?.code || currentQuestion.question.codeInitial || ''
                      })()}
                      onCodeChange={(code) => {
                        const existingAnswer = parseCodingAnswer(reponses[currentQuestion.questionId] || null)
                        const answer: CodingAnswer = {
                          code,
                          language: (currentQuestion.question.langage || 'javascript') as CodingLanguage,
                          testResultsPublics: existingAnswer?.testResultsPublics,
                          lastSaved: existingAnswer?.lastSaved,
                        }
                        handleAnswerChange(currentQuestion.questionId, serializeCodingAnswer(answer))
                      }}
                      onSubmit={() => {
                        // Submit final code — run all tests and save
                        toast.success('Code soumis', {
                          description: 'Votre code a été sauvegardé. N\'oubliez pas de soumettre l\'épreuve complète.',
                        })
                      }}
                      securityConfig={securityConfig}
                    />
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

      {/* ─── Fullscreen Exit Warning Dialog (non-mandatory mode) ────────── */}
      <Dialog open={showFullscreenWarning && !securityConfig.fullscreenObligatoire} onOpenChange={setShowFullscreenWarning}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Mode plein écran requis
            </DialogTitle>
            <DialogDescription>
              Vous avez quitté le mode plein écran ({fullscreenExitCount} sortie{fullscreenExitCount > 1 ? 's' : ''} détectée{fullscreenExitCount > 1 ? 's' : ''}).
              {fullscreenExitCount >= 2 && (
                <> Une pénalité de -{securityConfig.penaliteFullscreenExit} points a été appliquée (total: -{penalite} points).</>
              )}
              {fullscreenExitCount === 1 && (
                <> La prochaine sortie entraînera une pénalité de -{securityConfig.penaliteFullscreenExit} points.</>
              )}
              Cette action a été enregistrée.
              {securityConfig.autoSubmitOnViolation && (
                <> Il vous reste {Math.max(0, securityConfig.nbAlertesMax - totalAlertCount)} alerte{Math.max(0, securityConfig.nbAlertesMax - totalAlertCount) !== 1 ? 's' : ''} avant la soumission automatique.</>
              )}
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
              {securityConfig.autoSubmitOnViolation && (
                <> Il vous reste {Math.max(0, securityConfig.nbAlertesMax - totalAlertCount)} alerte{Math.max(0, securityConfig.nbAlertesMax - totalAlertCount) !== 1 ? 's' : ''} avant la soumission automatique.</>
              )}
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

      {/* ─── Inactivity Warning Dialog ──────────────────────────────────── */}
      <Dialog open={showInactivityWarning} onOpenChange={setShowInactivityWarning}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Timer className="h-5 w-5" />
              Inactivité détectée
            </DialogTitle>
            <DialogDescription>
              Aucune activité n&apos;a été détectée depuis plus de {securityConfig.tempsInactiviteMax} secondes.
              Ce comportement a été enregistré. Veuillez continuer à interagir avec l&apos;épreuve.
              {securityConfig.autoSubmitOnViolation && (
                <> Toute nouvelle inactivité prolongée entraînera la soumission automatique de l&apos;épreuve.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                lastActivityRef.current = Date.now()
                setShowInactivityWarning(false)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Je suis toujours présent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Violation Auto-Submit Dialog ───────────────────────────────── */}
      <Dialog open={showViolationDialog} onOpenChange={setShowViolationDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
              Soumission automatique
            </DialogTitle>
            <DialogDescription>
              {autoSubmitReason === 'violations'
                ? `Vous avez atteint le nombre maximum d'alertes de sécurité (${securityConfig.nbAlertesMax}). Votre épreuve va être soumise automatiquement.`
                : autoSubmitReason === 'inactivity'
                  ? `Votre inactivité prolongée a déclenché la soumission automatique de l'épreuve.`
                  : 'Votre épreuve va être soumise automatiquement suite à une violation des règles de sécurité.'}
              {penalite > 0 && (
                <> Une pénalité de -{penalite} points sera appliquée à votre note.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={handleViolationSubmit}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
