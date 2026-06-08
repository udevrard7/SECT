'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  User,
  Mail,
  Award,
  MessageSquare,
  FileText,
  Search,
  Send,
  Zap,
  LayoutGrid,
  List,
  X,
  Wand2,
  ThumbsUp,
  ThumbsDown,
  CircleDot,
  ChevronDown,
  Eye,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ─── Types ───

interface CorrectionSession {
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

interface EpreuveOption {
  id: string
  titre: string
  statut: string
  dateDebut: string
  dateFin: string
}

type GradingMode = 'par-copie' | 'par-question'

interface RubricCriterion {
  id: string
  label: string
  points: number
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
    case 'QRC': return 'Réponse courte'
    case 'TRS': return 'Travail structuré'
    case 'REFLEXION': return 'Réflexion'
    case 'QCM': return 'QCM'
    case 'QCU': return 'QCU'
    default: return type
  }
}

function isAutoGradedType(type: string): boolean {
  return type === 'QCM' || type === 'QCU'
}

function isSemiAutoGradedType(type: string): boolean {
  return type === 'CODE'
}

function getCorrectionBadge(type: string): { label: string; classes: string } {
  if (isAutoGradedType(type)) {
    return {
      label: 'Auto-corrigée',
      classes: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
    }
  }
  if (isSemiAutoGradedType(type)) {
    return {
      label: 'Auto + Override',
      classes: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
    }
  }
  return {
    label: 'À corriger',
    classes: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  }
}

function getQuestionTypeBadgeClasses(type: string): string {
  switch (type) {
    case 'QRC': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    case 'TRS': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
    case 'REFLEXION': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
    case 'QCM': return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'
    case 'QCU': return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'
    case 'CODE': return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800'
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

function getScoreColor(score: number, total: number): string {
  if (total === 0) return 'text-muted-foreground'
  const pct = score / total
  if (pct >= 0.5) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 0.4) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function getScoreCircleColor(score: number, total: number): string {
  if (total === 0) return 'bg-muted text-muted-foreground border-border'
  const pct = score / total
  if (pct >= 0.5) return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
  if (pct >= 0.4) return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
  return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
}

// ─── Rubric Criteria Generation ───

function generateRubricCriteria(type: string, bareme: number): RubricCriterion[] {
  const n = bareme
  switch (type) {
    case 'QRC':
      return [
        { id: 'qrc-complete', label: `Réponse complète (+${Math.round(n * 0.6 * 10) / 10})`, points: Math.round(n * 0.6 * 10) / 10 },
        { id: 'qrc-partielle', label: `Réponse partielle (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'qrc-motcle', label: `Mot-clé présent (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
        { id: 'qrc-hors', label: 'Hors sujet (0)', points: 0 },
      ]
    case 'REFLEXION':
      return [
        { id: 'ref-analyse', label: `Analyse approfondie (+${Math.round(n * 0.4 * 10) / 10})`, points: Math.round(n * 0.4 * 10) / 10 },
        { id: 'ref-arguments', label: `Arguments pertinents (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'ref-exemples', label: `Exemples concrets (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'ref-conclusion', label: `Conclusion pertinente (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
      ]
    case 'TRS':
      return [
        { id: 'trs-structure', label: `Structure correcte (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'trs-contenu', label: `Contenu pertinent (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'trs-exemples', label: `Exemples/appuis (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'trs-redaction', label: `Rédaction soignée (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
      ]
    case 'CODE':
      return [
        { id: 'code-logique', label: `Logique correcte (+${Math.round(n * 0.4 * 10) / 10})`, points: Math.round(n * 0.4 * 10) / 10 },
        { id: 'code-syntaxe', label: `Syntaxe correcte (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'code-tests', label: `Tests passés (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'code-style', label: `Bon style de code (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
      ]
    default:
      return [
        { id: 'def-complete', label: `Réponse complète (+${n})`, points: n },
        { id: 'def-zero', label: 'Hors sujet (0)', points: 0 },
      ]
  }
}

// ─── Sub-Components ───

/** Score circle indicator */
function ScoreCircle({ score, total, size = 'md' }: { score: number | null; total: number; size?: 'sm' | 'md' | 'lg' }) {
  const displayScore = score ?? 0
  const sizeClasses = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm'
  const colorClasses = score !== null ? getScoreCircleColor(displayScore, total) : 'bg-muted text-muted-foreground border-border'

  return (
    <div className={`flex items-center justify-center rounded-full border-2 font-bold ${sizeClasses} ${colorClasses}`}>
      {score !== null ? displayScore : '—'}
    </div>
  )
}

/** AI Suggestion card */
function AiSuggestionCard({
  noteIA,
  justificationIA,
  bareme,
  onApply,
  onDismiss,
  isApplying,
}: {
  noteIA: number
  justificationIA: string | null
  bareme: number
  onApply: () => void
  onDismiss: () => void
  isApplying: boolean
}) {
  const pct = bareme > 0 ? (noteIA / bareme) * 100 : 0
  const confidence = pct >= 70 ? 'Élevée' : pct >= 40 ? 'Moyenne' : 'Faible'
  const confidenceColor =
    pct >= 70
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 40
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 p-4 dark:border-violet-800 dark:from-violet-950/30 dark:to-purple-950/20"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-200 dark:bg-violet-800">
          <Sparkles className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
        </div>
        <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">
          Suggestion IA
        </span>
        <Badge variant="outline" className={`ml-auto text-[10px] ${confidenceColor}`}>
          Confiance : {confidence}
        </Badge>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <ScoreCircle score={noteIA} total={bareme} size="lg" />
        <div>
          <p className="text-lg font-bold text-violet-900 dark:text-violet-100">
            {noteIA} / {bareme}
          </p>
          <p className="text-xs text-violet-600 dark:text-violet-300">
            {bareme > 0 ? Math.round((noteIA / bareme) * 100) : 0}%
          </p>
        </div>
      </div>

      {justificationIA && (
        <div className="mb-3 rounded-lg bg-white/60 dark:bg-white/5 p-3">
          <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Justification</p>
          <p className="text-sm text-violet-900 dark:text-violet-100 whitespace-pre-wrap leading-relaxed">
            {justificationIA}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApply}
          disabled={isApplying}
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />}
          Appliquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
        >
          <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
          Ignorer
        </Button>
      </div>
    </motion.div>
  )
}

/** Interactive Rubric criteria */
function RubricPanel({
  criteria,
  selectedCriteria,
  onToggle,
  bareme,
  computedScore,
  manualScore,
  onManualScoreChange,
}: {
  criteria: RubricCriterion[]
  selectedCriteria: Set<string>
  onToggle: (id: string) => void
  bareme: number
  computedScore: number
  manualScore: string
  onManualScoreChange: (val: string) => void
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Critères de notation
      </Label>
      <div className="flex flex-wrap gap-2">
        {criteria.map((c) => {
          const isSelected = selectedCriteria.has(c.id)
          return (
            <motion.button
              key={c.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => onToggle(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-border bg-background text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50/50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20'
              }`}
            >
              {isSelected ? (
                <Check className="h-3 w-3" />
              ) : (
                <CircleDot className="h-3 w-3 opacity-40" />
              )}
              {c.label}
            </motion.button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold whitespace-nowrap">Note</Label>
          <ScoreCircle score={manualScore !== '' ? parseFloat(manualScore) || 0 : computedScore} total={bareme} size="sm" />
        </div>
        <Input
          type="number"
          min={0}
          max={bareme}
          step={0.5}
          value={manualScore}
          onChange={(e) => onManualScoreChange(e.target.value)}
          placeholder={String(Math.round(computedScore * 10) / 10)}
          className="w-20 h-9 text-sm"
        />
        <span className="text-sm text-muted-foreground">/ {bareme}</span>
        {manualScore !== '' && parseFloat(manualScore) !== computedScore && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            (auto : {Math.round(computedScore * 10) / 10})
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───

export function CorrectionPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Panel state ───
  const [epreuves, setEpreuves] = useState<EpreuveOption[]>([])
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [sessions, setSessions] = useState<CorrectionSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isLoadingEpreuves, setIsLoadingEpreuves] = useState(true)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

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

  // ─── Fetch epreuves ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingEpreuves(true)
    try {
      const res = await fetch(`/api/epreuves?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        const allEpreuves: EpreuveOption[] = data.epreuves ?? []
        const filtered = allEpreuves.filter(
          (e) => ['EN_COURS', 'TERMINEE', 'CLOTUREE'].includes(e.statut)
        )
        setEpreuves(filtered)
      } else {
        console.error('[correction] Failed to fetch epreuves:', res.status, await res.text().catch(() => ''))
      }
    } catch (err) {
      console.error('[correction] Error fetching epreuves:', err)
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
        `/api/correction?enseignantId=${user.id}&epreuveId=${selectedEpreuveId}`
      )
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
      } else {
        const errorText = await res.text().catch(() => '')
        console.error('[correction] Failed to fetch sessions:', res.status, errorText)
        toast.error('Erreur de chargement', {
          description: `Impossible de charger les copies (erreur ${res.status}).`,
        })
        setSessions([])
      }
    } catch (err) {
      console.error('[correction] Error fetching sessions:', err)
      toast.error('Erreur réseau', {
        description: 'Impossible de contacter le serveur pour charger les copies.',
      })
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
      // Restore criteria from existing score
      if (currentReponse.score !== null && currentQuestion) {
        const criteria = generateRubricCriteria(currentQuestion.question.type, currentQuestion.bareme)
        const newSelected = new Set<string>()
        // Try to reconstruct criteria from score (best-effort)
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
      const res = await fetch(
        `/api/correction/${sid}/ai-grade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: qid }),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'évaluation IA')
      }
      const data = await res.json()
      await fetchSessions()
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
    // Auto-save
    try {
      const res = await fetch(`/api/correction/${selectedSessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.questionId,
          score: currentReponse.noteIA,
          commentaire: currentReponse.justificationIA || null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Suggestion IA appliquée', {
        description: `Note ${currentReponse.noteIA}/${currentQuestion.bareme} enregistrée.`,
      })
      await fetchSessions()
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
      const res = await fetch(`/api/correction/${sid}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: qid,
          score: finalScore,
          commentaire: finalComment,
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
      const res = await fetch(`/api/correction/${sid}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalizeAll: true }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la finalisation')
      }
      toast.success('Correction finalisée et copie rendue', {
        description: 'La note finale a été calculée et la copie a été rendue à l\'étudiant.',
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
          headers: { 'Content-Type': 'application/json' },
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

  // ─── Batch return handler ───
  const handleBatchReturn = async () => {
    if (!selectedEpreuveId) return
    setIsBatchReturning(true)
    try {
      const res = await fetch('/api/correction/retourner-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      // Compute score
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
      const res = await fetch(`/api/correction/${sessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: horizontalCurrentQuestion.questionId,
          score: finalScore,
          commentaire: comment,
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
      setSavingSessionId(null)
    }
  }

  // ─── Get reponse for a session+question ───
  const getReponseForSession = (session: CorrectionSession, questionId: string) => {
    return session.reponses.find((r) => r.questionId === questionId || r.questionId === questionId) ?? null
  }

  // ─── Question navigation dots ───
  const renderQuestionNav = () => {
    if (totalQuestions === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, idx) => {
          const rep = selectedSession?.reponses.find(
            (r) => r.questionId === q.questionId || r.questionId === q.id
          )
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

  // ─── Render student answer (read-only, top sub-panel) ───
  const renderStudentAnswerPanel = () => {
    if (!currentQuestion) return null

    const q = currentQuestion.question
    const isAutoGraded = isAutoGradedType(q.type)
    const correctionBadge = getCorrectionBadge(q.type)

    // Parse contenu for JSONB fallback
    const answerContent = (() => {
      const raw = currentReponse?.contenu
      if (!raw) return 'Aucune réponse fournie'
      // Try to parse as JSON (JSONB fallback)
      const parsed = parseJsonSafe<string>(raw, null)
      if (parsed !== null) return parsed
      // Could be a JSON array or object
      try {
        const obj = JSON.parse(raw)
        if (Array.isArray(obj)) return obj.join(', ')
        if (typeof obj === 'object') return JSON.stringify(obj, null, 2)
        return String(obj)
      } catch {
        return raw
      }
    })()

    const expectedAnswer = typeof q.reponseCorrecte === 'string'
      ? q.reponseCorrecte
      : Array.isArray(q.reponseCorrecte)
        ? q.reponseCorrecte.join(', ')
        : ''

    return (
      <div className="space-y-3">
        {/* Question header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground">
            Q{currentQuestionIndex + 1}/{totalQuestions}
          </span>
          <Badge variant="outline" className={getQuestionTypeBadgeClasses(q.type)}>
            {getQuestionTypeLabel(q.type)}
          </Badge>
          <Badge variant="outline" className={correctionBadge.classes}>
            {isAutoGraded ? <Zap className="h-3 w-3 mr-0.5" /> : <PenTool className="h-3 w-3 mr-0.5" />}
            {correctionBadge.label}
          </Badge>
          <Badge variant="outline" className={getDifficulteBadgeClasses(q.difficulte)}>
            {getDifficulteLabel(q.difficulte)}
          </Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">
            <Award className="h-3 w-3 mr-0.5" />
            {currentQuestion.bareme} pts
          </Badge>
        </div>

        {/* Énoncé */}
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.enonce}</p>
        </div>

        {/* Réponse attendue */}
        {expectedAnswer && (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 mb-1">
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Réponse attendue
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
              {expectedAnswer}
            </p>
          </div>
        )}

        {/* Réponse de l'étudiant */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
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

        {/* Existing commentaire */}
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
    )
  }

  // ─── Render grading panel (bottom sub-panel) ───
  const renderGradingPanel = () => {
    if (!currentQuestion) return null
    const q = currentQuestion.question
    const isAutoGraded = isAutoGradedType(q.type)

    if (isAutoGraded) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800">
          <Zap className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          <div>
            <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">Question auto-corrigée</p>
            <p className="text-xs text-sky-600 dark:text-sky-300">
              Score automatique : {currentReponse?.score ?? '—'} / {currentQuestion.bareme}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* AI Suggestion */}
        <AnimatePresence>
          {showAiSuggestion && currentReponse?.noteIA !== null && currentReponse?.noteIA !== undefined && (
            <AiSuggestionCard
              noteIA={currentReponse.noteIA}
              justificationIA={currentReponse.justificationIA}
              bareme={currentQuestion.bareme}
              onApply={handleApplyAi}
              onDismiss={handleDismissAi}
              isApplying={isApplyingAi}
            />
          )}
        </AnimatePresence>

        {/* Interactive Rubric */}
        <RubricPanel
          criteria={currentRubricCriteria}
          selectedCriteria={selectedCriteria}
          onToggle={handleToggleCriterion}
          bareme={currentQuestion.bareme}
          computedScore={computedScore}
          manualScore={noteFinale}
          onManualScoreChange={setNoteFinale}
        />

        {/* Commentaire */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Commentaire pour l&apos;étudiant
          </Label>
          <Textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ajoutez votre commentaire..."
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleAiGrade()}
            disabled={isAiLoading}
            className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
          >
            {isAiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1.5" />
            )}
            Suggérer une note
          </Button>
          <Button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>
    )
  }

  // ─── Horizontal grading: render one student row ───
  const renderHorizontalStudentRow = (session: CorrectionSession) => {
    if (!horizontalCurrentQuestion) return null
    const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
    const isAutoGraded = isAutoGradedType(horizontalCurrentQuestion.question.type)
    const criteria = generateRubricCriteria(horizontalCurrentQuestion.question.type, horizontalCurrentQuestion.bareme)
    const activeCriteria = horizontalCriteria[session.id] ?? new Set()

    // Compute score from criteria
    let criteriaScore = 0
    activeCriteria.forEach((id) => {
      const c = criteria.find((cr) => cr.id === id)
      if (c) criteriaScore += c.points
    })
    criteriaScore = Math.min(criteriaScore, horizontalCurrentQuestion.bareme)

    const scoreValue = horizontalScores[session.id] ?? (rep?.score !== null && rep?.score !== undefined ? String(rep.score) : '')
    const commentValue = horizontalComments[session.id] ?? (rep?.commentaire ?? '')
    const isSaving = savingSessionId === session.id

    // Parse contenu
    const answerContent = (() => {
      const raw = rep?.contenu
      if (!raw) return 'Aucune réponse fournie'
      const parsed = parseJsonSafe<string>(raw, null)
      if (parsed !== null) return parsed
      try {
        const obj = JSON.parse(raw)
        if (Array.isArray(obj)) return obj.join(', ')
        if (typeof obj === 'object') return JSON.stringify(obj, null, 2)
        return String(obj)
      } catch {
        return raw
      }
    })()

    return (
      <motion.div
        key={session.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-xl border border-border bg-card p-4 space-y-3"
      >
        {/* Student header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{session.etudiant.name}</p>
              <p className="text-xs text-muted-foreground">{session.etudiant.email}</p>
            </div>
          </div>
          <ScoreCircle
            score={scoreValue !== '' ? parseFloat(scoreValue) || null : rep?.score ?? null}
            total={horizontalCurrentQuestion.bareme}
            size="sm"
          />
        </div>

        {/* Student answer */}
        <div className="rounded-lg bg-muted/50 border border-border p-3 max-h-40 overflow-y-auto">
          <p className="text-sm whitespace-pre-wrap">{answerContent}</p>
        </div>

        {/* Auto-graded badge */}
        {isAutoGraded ? (
          <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300">
            <Zap className="h-3.5 w-3.5" />
            Auto-corrigée : {rep?.score ?? '—'} / {horizontalCurrentQuestion.bareme}
          </div>
        ) : (
          <>
            {/* AI suggestion if exists */}
            {rep?.noteIA !== null && rep?.noteIA !== undefined && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2 dark:border-violet-800 dark:bg-violet-950/20">
                <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  IA : {rep.noteIA}/{horizontalCurrentQuestion.bareme}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-2 text-[10px] text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900"
                  onClick={() => {
                    setHorizontalScores((prev) => ({ ...prev, [session.id]: String(rep.noteIA) }))
                    if (rep.justificationIA) {
                      setHorizontalComments((prev) => ({ ...prev, [session.id]: rep.justificationIA ?? '' }))
                    }
                  }}
                >
                  Appliquer
                </Button>
              </div>
            )}

            {/* Rubric criteria */}
            <div className="flex flex-wrap gap-1.5">
              {criteria.map((c) => {
                const isActive = activeCriteria.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => handleHorizontalToggleCriterion(session.id, c.id, criteria)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all ${
                      isActive
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-border bg-background text-muted-foreground hover:border-emerald-200 dark:hover:border-emerald-800'
                    }`}
                  >
                    {isActive ? <Check className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5 opacity-40" />}
                    {c.label}
                  </button>
                )
              })}
            </div>

            {/* Score + Comment */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={horizontalCurrentQuestion.bareme}
                step={0.5}
                value={scoreValue}
                onChange={(e) => setHorizontalScores((prev) => ({ ...prev, [session.id]: e.target.value }))}
                placeholder="0"
                className="w-20 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">/ {horizontalCurrentQuestion.bareme}</span>
              <Input
                value={commentValue}
                onChange={(e) => setHorizontalComments((prev) => ({ ...prev, [session.id]: e.target.value }))}
                placeholder="Commentaire..."
                className="flex-1 h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={() => handleHorizontalSave(session.id)}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 h-8"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </motion.div>
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
      <div className="mb-3 space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Épreuve</Label>
        <Select
          value={selectedEpreuveId}
          onValueChange={setSelectedEpreuveId}
        >
          <SelectTrigger className="h-9">
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

      {/* Grading mode toggle */}
      {selectedEpreuveId && (
        <div className="mb-3 space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode de correction</Label>
          <Tabs value={gradingMode} onValueChange={(v) => setGradingMode(v as GradingMode)}>
            <TabsList className="w-full h-9">
              <TabsTrigger value="par-copie" className="flex-1 text-xs gap-1.5">
                <List className="h-3.5 w-3.5" />
                Par copie
              </TabsTrigger>
              <TabsTrigger value="par-question" className="flex-1 text-xs gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" />
                Par question
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Search filter */}
      {selectedEpreuveId && gradingMode === 'par-copie' && (
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
          className="mb-3 w-full bg-teal-600 hover:bg-teal-700 h-9"
          onClick={handleBatchReturn}
          disabled={isBatchReturning}
        >
          {isBatchReturning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Send className="h-3.5 w-3.5 mr-1.5" />
          )}
          Rendre les copies corrigées ({sessions.filter(s => s.statut === 'CORRIGEE').length})
        </Button>
      )}

      {/* Session list / Question list based on mode */}
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
        ) : gradingMode === 'par-question' ? (
          // ─── Horizontal grading: question list ───
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-2 pr-1">
              {horizontalQuestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <FileCheck className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    Aucune question
                  </p>
                </div>
              ) : (
                horizontalQuestions.map((q, idx) => {
                  const isCurrent = idx === horizontalQuestionIndex
                  const graded = sessions.filter((s) => {
                    const rep = s.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
                    return rep?.score !== null && rep?.score !== undefined
                  }).length
                  const total = sessions.length
                  const isComplete = graded === total
                  const isAutoGraded = isAutoGradedType(q.question.type)
                  const correctionBadge = getCorrectionBadge(q.question.type)

                  return (
                    <button
                      key={q.id}
                      onClick={() => setHorizontalQuestionIndex(idx)}
                      className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${
                        isCurrent
                          ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30 ring-1 ring-emerald-400/50 dark:ring-emerald-700/50'
                          : 'border-border bg-background hover:border-emerald-200 dark:hover:border-emerald-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold">Q{idx + 1}</span>
                            <Badge variant="outline" className={getQuestionTypeBadgeClasses(q.question.type)} style={{ fontSize: 10, height: 18, padding: '0 4px' }}>
                              {getQuestionTypeLabel(q.question.type)}
                            </Badge>
                            <Badge variant="outline" className={correctionBadge.classes} style={{ fontSize: 10, height: 18, padding: '0 4px' }}>
                              {correctionBadge.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {q.question.enonce.substring(0, 60)}...
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold">{q.bareme} pts</p>
                          {isAutoGraded ? (
                            <Badge className="bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800" style={{ fontSize: 9, height: 16, padding: '0 4px' }}>
                              Auto
                            </Badge>
                          ) : isComplete ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" style={{ fontSize: 9, height: 16, padding: '0 4px' }}>
                              <Check className="h-2.5 w-2.5 mr-0.5" />
                              {graded}/{total}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" style={{ fontSize: 9, height: 16, padding: '0 4px' }}>
                              {graded}/{total}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
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
          <ScrollArea className="h-[calc(100vh-400px)]">
            <div className="space-y-3 pr-1">
              {/* ─── En attente de correction ─── */}
              {(() => {
                const pending = filteredSessions.filter(s => s.statut !== 'RETOURNEE')
                if (pending.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <PenTool className="h-3 w-3" />
                      En attente ({pending.length})
                    </p>
                    <div className="space-y-2">
                      {pending.map((session) => {
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
                              {session.allCorrected ? (
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
                                <ScoreCircle score={session.score} total={session.autoGradedTotal > 0 ? session.autoGradedTotal : 20} size="sm" />
                              )}
                              {session.alertes > 0 && (
                                <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                                  {session.alertes}
                                </Badge>
                              )}
                              {session.needsCorrectionCount > 0 && !session.allCorrected && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                  {session.needsCorrectionCount} restante{session.needsCorrectionCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ─── Copies rendues ─── */}
              {(() => {
                const returned = filteredSessions.filter(s => s.statut === 'RETOURNEE')
                if (returned.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Send className="h-3 w-3" />
                      Rendues ({returned.length})
                    </p>
                    <div className="space-y-2">
                      {returned.map((session) => {
                        const isSelected = session.id === selectedSessionId
                        return (
                          <button
                            key={session.id}
                            onClick={() => {
                              setSelectedSessionId(session.id)
                              setCurrentQuestionIndex(0)
                            }}
                            className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm opacity-80 ${
                              isSelected
                                ? 'border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30 ring-1 ring-teal-400/50 dark:ring-teal-700/50'
                                : 'border-border bg-background hover:border-teal-200 dark:hover:border-teal-800'
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
                              <Badge className="shrink-0 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800 text-[10px]">
                                <Check className="h-3 w-3 mr-0.5" />
                                Rendue
                              </Badge>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              {session.score !== null && (
                                <ScoreCircle score={session.score} total={session.autoGradedTotal > 0 ? session.autoGradedTotal : 20} size="sm" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )

  // ─── Right Panel: Par copie mode ───
  const renderParCopiePanel = () => {
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
              onClick={() => handleFinalize()}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Finaliser et rendre
            </Button>
          </div>
        </div>
      )
    }

    if (selectedSession.statut === 'RETOURNEE') {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
              <Check className="h-10 w-10 text-teal-500 dark:text-teal-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Copie rendue</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              La copie de {selectedSession.etudiant.name} a été corrigée et rendue.
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm">
                Score final : <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>{selectedSession.score?.toFixed(1) ?? '—'} pts</span>
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col">
        {/* Student info bar */}
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
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
            <div className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                Score :{' '}
                <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>
                  {selectedSession.score !== null ? selectedSession.score.toFixed(1) : '—'}
                </span>
              </span>
            </div>
            {selectedSession.autoGradedTotal > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-sky-500" />
                <span>Auto : <span className="font-semibold text-foreground">{selectedSession.autoGradedScore.toFixed(1)}/{selectedSession.autoGradedTotal.toFixed(1)}</span></span>
              </div>
            )}
            {selectedSession.alertes > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {selectedSession.alertes} alerte{selectedSession.alertes > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{manualCorrectedCount}/{totalQuestions} corrigées</span>
            {needsCorrectionCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{needsCorrectionCount} à corriger</span>
            )}
          </div>
          <Progress
            value={totalQuestions > 0 ? (manualCorrectedCount / totalQuestions) * 100 : 0}
            className="h-1.5"
          />
        </div>

        {/* Question navigation */}
        <div className="mb-3">
          {renderQuestionNav()}
        </div>

        {/* Two vertically split sub-panels */}
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Top: Student Answer (read-only) */}
          <ScrollArea className="flex-1 min-h-0 rounded-xl border border-border bg-card p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`answer-${currentQuestionIndex}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStudentAnswerPanel()}
              </motion.div>
            </AnimatePresence>
          </ScrollArea>

          {/* Bottom: Grading Panel */}
          <ScrollArea className="flex-1 min-h-0 rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-800 dark:bg-emerald-950/10">
            <AnimatePresence mode="wait">
              <motion.div
                key={`grading-${currentQuestionIndex}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderGradingPanel()}
              </motion.div>
            </AnimatePresence>
          </ScrollArea>
        </div>

        {/* Navigation + Actions */}
        <div className="mt-3 space-y-2">
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

          <div className="flex gap-2">
            {needsCorrectionCount > 0 && (
              <Button
                variant="outline"
                onClick={handleBatchAiGrade}
                disabled={isBatchAiLoading}
                className="flex-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              >
                {isBatchAiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                Évaluer toutes avec l&apos;IA
              </Button>
            )}
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleFinalize()}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Finaliser et rendre
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Right Panel: Par question mode ───
  const renderParQuestionPanel = () => {
    if (sessions.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-muted">
              <LayoutGrid className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Correction horizontale</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Sélectionnez une épreuve pour corriger toutes les copies question par question.
            </p>
          </div>
        </div>
      )
    }

    if (!horizontalCurrentQuestion) return null

    const q = horizontalCurrentQuestion.question
    const isAutoGraded = isAutoGradedType(q.type)
    const correctionBadge = getCorrectionBadge(q.type)
    const totalSessions = sessions.length
    const progressPct = totalSessions > 0 ? (horizontalGradedCount / totalSessions) * 100 : 0

    return (
      <div className="flex h-full flex-col">
        {/* Question header */}
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-sm font-bold">Question {horizontalQuestionIndex + 1}/{horizontalQuestions.length}</span>
            <Badge variant="outline" className={getQuestionTypeBadgeClasses(q.type)}>
              {getQuestionTypeLabel(q.type)}
            </Badge>
            <Badge variant="outline" className={correctionBadge.classes}>
              {isAutoGraded ? <Zap className="h-3 w-3 mr-0.5" /> : <PenTool className="h-3 w-3 mr-0.5" />}
              {correctionBadge.label}
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">
              <Award className="h-3 w-3 mr-0.5" />
              {horizontalCurrentQuestion.bareme} pts
            </Badge>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{q.enonce}</p>

          {/* Progress */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{horizontalGradedCount}/{totalSessions} copies corrigées</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        </div>

        {/* Question navigation */}
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHorizontalQuestionIndex(Math.max(0, horizontalQuestionIndex - 1))}
            disabled={horizontalQuestionIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Question préc.
          </Button>
          <div className="flex gap-1">
            {horizontalQuestions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setHorizontalQuestionIndex(idx)}
                className={`h-6 w-6 rounded text-[10px] font-bold border transition-colors ${
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
            variant="outline"
            size="sm"
            onClick={() => setHorizontalQuestionIndex(Math.min(horizontalQuestions.length - 1, horizontalQuestionIndex + 1))}
            disabled={horizontalQuestionIndex >= horizontalQuestions.length - 1}
          >
            Question suiv.
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Student list for this question */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-3 pr-1 pb-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`hq-${horizontalQuestionIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {sessions.map((session) => renderHorizontalStudentRow(session))}
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Batch AI for this question */}
        {!isAutoGraded && (
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="outline"
              className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              onClick={async () => {
                // Batch AI: grade all sessions for this question
                setIsBatchAiLoading(true)
                let graded = 0
                for (const session of sessions) {
                  const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
                  if (rep?.score === null || rep?.score === undefined) {
                    try {
                      await fetch(`/api/correction/${session.id}/ai-grade`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ questionId: horizontalCurrentQuestion.questionId }),
                      })
                      graded++
                    } catch {
                      // Continue
                    }
                  }
                }
                await fetchSessions()
                setIsBatchAiLoading(false)
                toast.success('Évaluation IA terminée', {
                  description: `${graded} copies évaluées par l'IA pour cette question.`,
                })
              }}
              disabled={isBatchAiLoading}
            >
              {isBatchAiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Wand2 className="h-4 w-4 mr-1.5" />
              )}
              Évaluer toutes les copies avec l&apos;IA (cette question)
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ─── Main render ───
  const rightPanelContent = gradingMode === 'par-copie' ? renderParCopiePanel() : renderParQuestionPanel()

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex h-full gap-4">
        {/* Left panel */}
        <div className="w-full lg:w-[30%] shrink-0 rounded-xl border border-border bg-card p-4 overflow-hidden">
          {isLoadingEpreuves ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            renderLeftPanel()
          )}
        </div>

        {/* Right panel — desktop */}
        <div className="hidden lg:flex lg:w-[70%] rounded-xl border border-border bg-card p-4 overflow-hidden flex-col">
          {rightPanelContent}
        </div>

        {/* Mobile right panel */}
        <div className="lg:hidden fixed inset-0 z-50 bg-background p-4 overflow-auto flex flex-col" style={{ display: selectedSessionId || gradingMode === 'par-question' ? 'flex' : 'none' }}>
          <div className="mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (gradingMode === 'par-copie') {
                  setSelectedSessionId(null)
                } else {
                  setGradingMode('par-copie')
                  setSelectedSessionId(null)
                }
              }}
              className="mb-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1.5" />
              Retour
            </Button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {rightPanelContent}
          </div>
        </div>
      </div>
    </div>
  )
}
