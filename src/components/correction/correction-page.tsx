'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PenTool,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Loader2,
  ClipboardList,
  FileCheck,
  Sparkles,
  Save,
  CheckCircle2,
  XCircle,
  MinusCircle,
  User,
  Mail,
  Award,
  MessageSquare,
  FileText,
  Search,
  Filter,
  Flag,
  Send,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

interface CorrectionSession {
  id: string
  statut: string
  score: number | null
  alertes: number
  needsCorrectionCount: number
  allCorrected: boolean
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
    question: { id: string; type: string; enonce: string }
  }>
  resultat: {
    id: string
    scoreFinal: number
    detailParQuestion: unknown
    dateCorrection: string | null
  } | null
}

interface EpreuveOption {
  id: string
  titre: string
  statut: string
  dateDebut: string
  dateFin: string
}

// ─── Utility functions ───

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'QCU': return 'QCU'
    case 'QCM': return 'QCM'
    case 'QRC': return 'QRC'
    case 'TRS': return 'TRS'
    case 'REFLEXION': return 'REFLEXION'
    default: return type
  }
}

function getQuestionTypeBadgeClasses(type: string): string {
  switch (type) {
    case 'QCU': return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'
    case 'QCM': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    case 'QRC': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    case 'TRS': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
    case 'REFLEXION': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
    default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
  }
}

function getDifficulteBadgeClasses(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
    case 'MOYEN': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
    case 'DIFFICILE': return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800'
    case 'EXPERT': return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800'
    default: return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

function getDifficulteLabel(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'Facile'
    case 'MOYEN': return 'Moyen'
    case 'DIFFICILE': return 'Difficile'
    case 'EXPERT': return 'Expert'
    default: return diff
  }
}

function isManualType(type: string): boolean {
  return type === 'QRC' || type === 'TRS' || type === 'REFLEXION'
}

// ─── Main Component ───

export function CorrectionPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Left panel state ───
  const [epreuves, setEpreuves] = useState<EpreuveOption[]>([])
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [sessions, setSessions] = useState<CorrectionSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isLoadingEpreuves, setIsLoadingEpreuves] = useState(true)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  // ─── Right panel state ───
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [noteFinale, setNoteFinale] = useState<string>('')
  const [commentaire, setCommentaire] = useState<string>('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isBatchAiLoading, setIsBatchAiLoading] = useState(false)
  const [isReturning, setIsReturning] = useState(false)
  const [isBatchReturning, setIsBatchReturning] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  // ─── Fetch epreuves ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingEpreuves(true)
    try {
      const res = await fetch(`/api/epreuves?enseignantId=${user.id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const allEpreuves: EpreuveOption[] = data.epreuves ?? []
        // Show exams that are in progress, finished, or closed (teachers need to correct EN_COURS too)
        const filtered = allEpreuves.filter(
          (e) => ['EN_COURS', 'TERMINEE', 'CLOTUREE'].includes(e.statut)
        )
        setEpreuves(filtered)
      }
    } catch {
      // Silent
    } finally {
      setIsLoadingEpreuves(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchEpreuves()
  }, [fetchEpreuves])

  // ─── Fetch sessions for selected epreuve ───
  const fetchSessions = useCallback(async () => {
    if (!user?.id || !selectedEpreuveId) return
    setIsLoadingSessions(true)
    try {
      const res = await fetch(
        `/api/correction?enseignantId=${user.id}&epreuveId=${selectedEpreuveId}`,
        { headers: getAuthHeaders() }
      )
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
      } else {
        setSessions([])
      }
    } catch {
      setSessions([])
    } finally {
      setIsLoadingSessions(false)
    }
  }, [user?.id, selectedEpreuveId])

  useEffect(() => {
    if (selectedEpreuveId) {
      fetchSessions()
      setSelectedSessionId(null)
    } else {
      setSessions([])
      setSelectedSessionId(null)
    }
  }, [selectedEpreuveId, fetchSessions])

  // ─── Selected session ───
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

  // ─── Questions list (sorted by ordre) ───
  const questions = selectedSession?.epreuve.questions
    ? [...selectedSession.epreuve.questions].sort((a, b) => a.ordre - b.ordre)
    : []

  // ─── Current question ───
  const currentQuestion = questions[currentQuestionIndex] ?? null

  // ─── Current response ───
  const currentReponse = currentQuestion
    ? selectedSession?.reponses.find((r) => r.questionId === currentQuestion.questionId) ?? null
    : null

  // ─── Reset correction fields when question changes ───
  useEffect(() => {
    if (currentReponse) {
      setNoteFinale(currentReponse.score !== null ? String(currentReponse.score) : '')
      setCommentaire(currentReponse.commentaire ?? '')
    } else {
      setNoteFinale('')
      setCommentaire('')
    }
  }, [currentQuestionIndex, selectedSessionId, currentReponse])

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
  const correctedCount = selectedSession?.reponses.filter(
    (r) => r.score !== null
  ).length ?? 0
  const needsCorrectionQuestions = questions.filter((q) => {
    const rep = selectedSession?.reponses.find((r) => r.questionId === q.questionId)
    return isManualType(q.question.type) && (!rep || rep.score === null)
  })
  const needsCorrectionCount = needsCorrectionQuestions.length

  // ─── AI Grade handler ───
  const handleAiGrade = async () => {
    if (!selectedSessionId || !currentQuestion) return
    setIsAiLoading(true)
    try {
      const res = await fetch(
        `/api/correction/${selectedSessionId}/ai-grade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ questionId: currentQuestion.questionId }),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'évaluation IA')
      }
      const data = await res.json()
      // Refresh sessions
      await fetchSessions()
      // Update local state with AI proposal
      if (data.noteIA !== undefined && data.noteIA !== null) {
        setNoteFinale(String(data.noteIA))
      }
      if (data.justificationIA) {
        // The justification is stored in the response, will be visible on refresh
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

  // ─── Save handler ───
  const handleSave = async () => {
    if (!selectedSessionId || !currentQuestion) return
    const score = noteFinale !== '' ? parseFloat(noteFinale) : null
    if (score !== null && (isNaN(score) || score < 0 || score > currentQuestion.bareme)) {
      toast.error('Note invalide', {
        description: `La note doit être comprise entre 0 et ${currentQuestion.bareme}.`,
      })
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch(`/api/correction/${selectedSessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          questionId: currentQuestion.questionId,
          score,
          commentaire: commentaire || null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Note sauvegardée', {
        description: 'La correction a été enregistrée.',
      })
      await fetchSessions()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de sauvegarder.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Finalize handler ───
  const handleFinalize = async () => {
    if (!selectedSessionId) return
    setIsFinalizing(true)
    try {
      const res = await fetch(`/api/correction/${selectedSessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ finalizeAll: true }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la finalisation')
      }
      toast.success('Correction finalisée', {
        description: 'La note finale a été calculée et la session est corrigée.',
      })
      await fetchSessions()
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
      const res = await fetch(
        `/api/correction/${selectedSessionId}/ai-grade-batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'évaluation IA')
      }
      const data = await res.json()
      toast.success('Évaluation IA terminée', {
        description: data.message || `${data.graded} questions évaluées par l'IA`,
      })
      await fetchSessions()
    } catch (err) {
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Impossible d\'évaluer avec l\'IA.',
      })
    } finally {
      setIsBatchAiLoading(false)
    }
  }

  // ─── Return copy handler ───
  const handleReturnCopy = async () => {
    if (!selectedSessionId) return
    setIsReturning(true)
    try {
      const res = await fetch(
        `/api/correction/${selectedSessionId}/retourner`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors du retour')
      }
      toast.success('Copie retournée', {
        description: 'L\'étudiant peut maintenant consulter sa note.',
      })
      await fetchSessions()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de retourner la copie.',
      })
    } finally {
      setIsReturning(false)
    }
  }

  // ─── Batch return handler ───
  const handleBatchReturn = async () => {
    if (!selectedEpreuveId) return
    setIsBatchReturning(true)
    try {
      const res = await fetch('/api/correction/retourner-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ epreuveId: selectedEpreuveId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors du retour')
      }
      const data = await res.json()
      toast.success('Copies retournées', {
        description: data.message || `${data.returned} copies retournées`,
      })
      await fetchSessions()
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
    }
  }

  // ─── Render student answer for QCU/QCM ───
  const renderAutoGradedAnswer = () => {
    if (!currentQuestion || !currentReponse) return null
    const q = currentQuestion.question
    const propositions = parseJsonSafe<string[]>(q.propositions as string | null, [])
    const correctAnswer = parseJsonSafe<string | string[]>(q.reponseCorrecte as string | null, '')
    const studentAnswer = currentReponse.contenu

    const correctLetters = Array.isArray(correctAnswer)
      ? correctAnswer
      : correctAnswer
        ? [String(correctAnswer)]
        : []

    const studentLetters = studentAnswer
      ? parseJsonSafe<string[]>(studentAnswer, [studentAnswer])
      : []

    const isCorrect =
      correctLetters.length > 0 &&
      studentLetters.length > 0 &&
      correctLetters.length === studentLetters.length &&
      correctLetters.every((l) => studentLetters.includes(l))

    return (
      <div className="space-y-3">
        {/* Propositions review */}
        <div className="space-y-2">
          {propositions.map((prop, idx) => {
            const letter = String.fromCharCode(65 + idx)
            const isCorrectOption = correctLetters.includes(letter)
            const isStudentOption = studentLetters.includes(letter)

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  isCorrectOption
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                    : isStudentOption && !isCorrectOption
                      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                      : 'border-border bg-background'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCorrectOption
                      ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
                      : isStudentOption && !isCorrectOption
                        ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {letter}
                </span>
                <span className="flex-1">{prop}</span>
                {isCorrectOption && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                {isStudentOption && !isCorrectOption && (
                  <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
              </div>
            )
          })}
        </div>

        {/* Score adjustment */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <Label className="text-sm font-medium shrink-0">Note obtenue</Label>
          <Input
            type="number"
            min={0}
            max={currentQuestion.bareme}
            step={0.5}
            value={noteFinale}
            onChange={(e) => setNoteFinale(e.target.value)}
            className="w-20 h-8 text-sm"
          />
          <span className="text-sm text-muted-foreground">
            / {currentQuestion.bareme}
          </span>
          {isCorrect ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Correct
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
              <XCircle className="h-3 w-3 mr-1" />
              Incorrect
            </Badge>
          )}
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Commentaire (optionnel)</Label>
          <Textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ajouter un commentaire..."
            rows={2}
            className="text-sm"
          />
        </div>

        {/* Save button for QCU/QCM */}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>
    )
  }

  // ─── Render correction card for QRC ───
  const renderQRCCorrection = () => {
    if (!currentQuestion) return null
    const q = currentQuestion.question
    const expectedAnswer = parseJsonSafe<string>(q.reponseCorrecte as string | null, '')

    return (
      <div className="space-y-4">
        {/* Réponse attendue */}
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Réponse attendue
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
            {expectedAnswer || 'Aucune réponse attendue définie'}
          </p>
        </div>

        {/* Réponse de l'étudiant */}
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Réponse de l&apos;étudiant
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {currentReponse?.contenu || 'Aucune réponse fournie'}
          </p>
        </div>

        {/* Proposition IA */}
        {(currentReponse?.noteIA !== null && currentReponse?.noteIA !== undefined) && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Proposition IA
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-amber-800 dark:text-amber-200">Note proposée :</span>
              <Badge className="bg-amber-200 text-amber-800 border-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:border-amber-700">
                {currentReponse.noteIA} / {currentQuestion.bareme}
              </Badge>
            </div>
            {currentReponse.justificationIA && (
              <div className="mt-2">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Justification IA :
                </span>
                <p className="mt-1 text-sm whitespace-pre-wrap text-amber-900 dark:text-amber-100">
                  {currentReponse.justificationIA}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Note finale */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Note finale</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={currentQuestion.bareme}
              step={0.5}
              value={noteFinale}
              onChange={(e) => setNoteFinale(e.target.value)}
              placeholder="0"
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              / {currentQuestion.bareme}
            </span>
          </div>
        </div>

        {/* Commentaire */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Commentaire</Label>
          <Textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ajoutez votre commentaire pour l'étudiant..."
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleAiGrade}
            disabled={isAiLoading}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            {isAiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Évaluer avec l&apos;IA
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>
    )
  }

  // ─── Render correction card for TRS ───
  const renderTRSCorrection = () => {
    if (!currentQuestion) return null
    const q = currentQuestion.question
    const grilleCorrection = parseJsonSafe<string>(q.reponseCorrecte as string | null, '')

    return (
      <div className="space-y-4">
        {/* Grille de correction */}
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Grille de correction
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
            {grilleCorrection || 'Aucune grille de correction définie'}
          </p>
        </div>

        {/* Réponse de l'étudiant */}
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Réponse de l&apos;étudiant
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {currentReponse?.contenu || 'Aucune réponse fournie'}
          </p>
        </div>

        {/* Proposition IA */}
        {(currentReponse?.noteIA !== null && currentReponse?.noteIA !== undefined) && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Proposition IA
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-amber-800 dark:text-amber-200">Note proposée :</span>
              <Badge className="bg-amber-200 text-amber-800 border-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:border-amber-700">
                {currentReponse.noteIA} / {currentQuestion.bareme}
              </Badge>
            </div>
            {currentReponse.justificationIA && (
              <div className="mt-2">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Justification IA :
                </span>
                <p className="mt-1 text-sm whitespace-pre-wrap text-amber-900 dark:text-amber-100">
                  {currentReponse.justificationIA}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Note finale */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Note finale</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={currentQuestion.bareme}
              step={0.5}
              value={noteFinale}
              onChange={(e) => setNoteFinale(e.target.value)}
              placeholder="0"
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              / {currentQuestion.bareme}
            </span>
          </div>
        </div>

        {/* Commentaire */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Commentaire</Label>
          <Textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ajoutez votre commentaire pour l'étudiant..."
            rows={5}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleAiGrade}
            disabled={isAiLoading}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            {isAiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Évaluer avec l&apos;IA
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>
    )
  }

  // ─── Render current question correction ───
  const renderCorrectionContent = () => {
    if (!currentQuestion) return null
    const type = currentQuestion.question.type

    if (type === 'QRC') return renderQRCCorrection()
    if (type === 'TRS') return renderTRSCorrection()
    if (type === 'REFLEXION') return renderTRSCorrection()
    // QCU/QCM: read-only review with score adjustment
    return renderAutoGradedAnswer()
  }

  // ─── Question navigation dots ───
  const renderQuestionNav = () => {
    if (totalQuestions === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, idx) => {
          const rep = selectedSession?.reponses.find(
            (r) => r.questionId === q.questionId
          )
          const isCurrent = idx === currentQuestionIndex
          const isCorrected = rep?.score !== null && rep?.score !== undefined
          const needsManual = isManualType(q.question.type)

          let dotClass = 'bg-muted text-muted-foreground border-border'
          if (isCurrent) {
            dotClass = 'bg-emerald-600 text-white border-emerald-600'
          } else if (needsManual && !isCorrected) {
            dotClass = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
          } else if (isCorrected) {
            dotClass = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
          }

          return (
            <button
              key={q.id}
              onClick={() => goToQuestion(idx)}
              className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-colors ${dotClass}`}
              title={`Question ${idx + 1} - ${getQuestionTypeLabel(q.question.type)}`}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>
    )
  }

  // ─── Left Panel ───
  const renderLeftPanel = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <PenTool className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Correction
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Corrigez les copies de vos étudiants
        </p>
      </div>

      {/* Epreuve selector */}
      <div className="mb-4 space-y-2">
        <Label className="text-sm font-medium">Épreuve</Label>
        <Select
          value={selectedEpreuveId}
          onValueChange={setSelectedEpreuveId}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionnez une épreuve" />
          </SelectTrigger>
          <SelectContent>
            {epreuves.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.titre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search filter */}
      {selectedEpreuveId && (
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un étudiant..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>
      )}

      {/* Batch return button */}
      {selectedEpreuveId && sessions.some(s => s.statut === 'CORRIGEE') && (
        <Button
          size="sm"
          className="mb-3 w-full bg-teal-600 hover:bg-teal-700"
          onClick={handleBatchReturn}
          disabled={isBatchReturning}
        >
          {isBatchReturning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Rendre toutes les copies corrigées
        </Button>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-hidden">
        {!selectedEpreuveId ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Sélectionnez une épreuve
            </p>
          </div>
        ) : isLoadingSessions ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border p-3 space-y-2">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileCheck className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Aucune copie à corriger
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-360px)]">
            <div className="space-y-2 pr-1">
              {filteredSessions.map((session) => {
                const isSelected = session.id === selectedSessionId
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setSelectedSessionId(session.id)
                      setCurrentQuestionIndex(0)
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30 ring-1 ring-emerald-400/50 dark:ring-emerald-700/50'
                        : 'border-border bg-background hover:border-emerald-200 dark:hover:border-emerald-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {session.etudiant.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {session.etudiant.email}
                        </p>
                      </div>
                      {session.statut === 'RETOURNEE' ? (
                        <Badge className="shrink-0 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800 text-[10px]">
                          <Send className="h-3 w-3 mr-0.5" />
                          Rendue
                        </Badge>
                      ) : session.allCorrected ? (
                        <Badge className="shrink-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800 text-[10px]">
                          <Check className="h-3 w-3 mr-0.5" />
                          Corrigé
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 text-[10px]">
                          <PenTool className="h-3 w-3 mr-0.5" />
                          À corriger
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {session.score !== null && (
                        <span className="text-xs text-muted-foreground">
                          <Award className="h-3 w-3 inline mr-0.5" />
                          {session.score.toFixed(1)} pts
                        </span>
                      )}
                      {session.alertes > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          {session.alertes}
                        </Badge>
                      )}
                      {session.needsCorrectionCount > 0 && !session.allCorrected && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          {session.needsCorrectionCount} question{session.needsCorrectionCount > 1 ? 's' : ''} restante{session.needsCorrectionCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )

  // ─── Right Panel ───
  const renderRightPanel = () => {
    // No session selected
    if (!selectedSession) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-muted">
              <PenTool className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Sélectionnez une copie</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Choisissez une session étudiant dans le panneau de gauche pour commencer la correction.
            </p>
          </div>
        </div>
      )
    }

    // No questions needing correction and all auto-graded
    if (totalQuestions === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <Check className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Toutes les questions sont corrigées</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucune question ne nécessite de correction manuelle.
            </p>
            <Button
              className="mt-4 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleFinalize}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Finaliser la correction
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col">
        {/* Student info bar */}
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">{selectedSession.etudiant.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {selectedSession.etudiant.email}
                </p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  selectedSession.statut === 'CORRIGEE'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                }
              >
                {selectedSession.statut === 'CORRIGEE' ? 'Corrigée' : 'En correction'}
              </Badge>
            </div>
            <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <div className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                Score actuel :{' '}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedSession.score !== null ? selectedSession.score.toFixed(1) : '—'}
                </span>
              </span>
            </div>
            {selectedSession.alertes > 0 && (
              <>
                <Separator orientation="vertical" className="h-8 hidden sm:block" />
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {selectedSession.alertes} alerte{selectedSession.alertes > 1 ? 's' : ''}
                </Badge>
              </>
            )}
            {selectedSession.statut === 'CORRIGEE' && (
              <>
                <Separator orientation="vertical" className="h-8 hidden sm:block" />
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={handleReturnCopy}
                  disabled={isReturning}
                >
                  {isReturning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Rendre la copie
                </Button>
              </>
            )}
            {selectedSession.statut === 'RETOURNEE' && (
              <>
                <Separator orientation="vertical" className="h-8 hidden sm:block" />
                <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Copie retournée
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {correctedCount} / {totalQuestions} questions corrigées
            </span>
            {needsCorrectionCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {needsCorrectionCount} à corriger manuellement
              </span>
            )}
          </div>
          <Progress
            value={totalQuestions > 0 ? (correctedCount / totalQuestions) * 100 : 0}
            className="h-2"
          />
        </div>

        {/* Question navigation */}
        <div className="mb-4">
          {renderQuestionNav()}
        </div>

        {/* Question display */}
        {currentQuestion && (
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 pb-4">
              {/* Question header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-foreground">
                  Question {currentQuestionIndex + 1}/{totalQuestions}
                </span>
                <Badge
                  variant="outline"
                  className={getQuestionTypeBadgeClasses(currentQuestion.question.type)}
                >
                  {getQuestionTypeLabel(currentQuestion.question.type)}
                </Badge>
                <Badge
                  variant="outline"
                  className={getDifficulteBadgeClasses(currentQuestion.question.difficulte)}
                >
                  {getDifficulteLabel(currentQuestion.question.difficulte)}
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800"
                >
                  <Award className="h-3 w-3 mr-0.5" />
                  {currentQuestion.bareme} pts
                </Badge>
              </div>

              {/* Énoncé */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {currentQuestion.question.enonce}
                  </p>
                </CardContent>
              </Card>

              {/* Correction card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PenTool className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Correction
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderCorrectionContent()}
                </CardContent>
              </Card>

              {/* Previous question comment if exists */}
              {currentReponse?.commentaire && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/20">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                      Commentaire existant
                    </span>
                  </div>
                  <p className="text-sm text-teal-900 dark:text-teal-100 whitespace-pre-wrap">
                    {currentReponse.commentaire}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Navigation + Finalize */}
        <div className="mt-4 space-y-3">
          <Separator />
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToQuestion(currentQuestionIndex - 1)}
              disabled={currentQuestionIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Précédente
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentQuestionIndex + 1} / {totalQuestions}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToQuestion(currentQuestionIndex + 1)}
              disabled={currentQuestionIndex >= totalQuestions - 1}
            >
              Suivante
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Batch AI grade button */}
          {needsCorrectionCount > 0 && (
            <Button
              variant="outline"
              onClick={handleBatchAiGrade}
              disabled={isBatchAiLoading}
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
            >
              {isBatchAiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Évaluer toutes les questions avec l&apos;IA
            </Button>
          )}

          {/* Finalize button */}
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={handleFinalize}
            disabled={isFinalizing}
          >
            {isFinalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Finaliser la correction
          </Button>
        </div>
      </div>
    )
  }

  // ─── Main render ───
  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex h-full gap-4">
        {/* Left panel */}
        <div className="w-full lg:w-[35%] shrink-0 rounded-xl border border-border bg-card p-4 overflow-hidden">
          {isLoadingEpreuves ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            renderLeftPanel()
          )}
        </div>

        {/* Right panel */}
        <div className="hidden lg:block lg:w-[65%] rounded-xl border border-border bg-card p-4 overflow-hidden">
          {renderRightPanel()}
        </div>

        {/* Mobile right panel (shown when session selected) */}
        <div className="lg:hidden fixed inset-0 z-50 bg-background p-4 overflow-auto" style={{ display: selectedSessionId ? 'block' : 'none' }}>
          <div className="mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSessionId(null)}
              className="mb-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour à la liste
            </Button>
          </div>
          {renderRightPanel()}
        </div>
      </div>
    </div>
  )
}
