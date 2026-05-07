'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trophy,
  Award,
  Target,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  XCircle,
  MinusCircle,
  MessageSquare,
  PenLine,
  BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

// ─── Types ───

interface QuestionInfo {
  id: string
  type: string
  enonce: string
  difficulte: string
}

interface EpreuveQuestionInfo {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: QuestionInfo
}

interface SessionResultat {
  id: string
  scoreFinal: number
  detailParQuestion: Array<{
    index: number
    type: string
    enonce: string
    pointsMax: number
    pointsObtenus: number | null
    correct: boolean | null
    reponseEtudiant: string | null
    reponseAttendue: string | null
    commentaire?: string | null
  }> | null
  dateCorrection: string | null
  commentaires: string | null
}

interface ReponseInfo {
  id: string
  questionId: string
  contenu: string | null
  score: number | null
  commentaire: string | null
  noteIA: number | null
  justificationIA: string | null
  question: {
    id: string
    type: string
    enonce: string
  }
}

interface StudentSession {
  id: string
  etudiantId: string
  epreuveId: string
  statut: string
  score: number | null
  alertes: number
  dateDebut: string | null
  dateFin: string | null
  epreuve: {
    id: string
    titre: string
    description: string | null
    duree: number
    enseignant: { name: string }
    questions: EpreuveQuestionInfo[]
  }
  reponses: ReponseInfo[]
  resultat: SessionResultat | null
}

// ─── Utility functions ───

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const DAYS_FR = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
]

function formatDateFR(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTimeFR(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  const day = DAYS_FR[d.getDay()]
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${day} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} à ${hours}h${minutes}`
}

function parseJsonSafe<T>(value: string | null | unknown, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)) as T
  } catch {
    return fallback
  }
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 10) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
  }
  if (score >= 8) {
    return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
  }
  return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
}

function getScoreColor(score: number): string {
  if (score >= 10) return 'text-emerald-700 dark:text-emerald-400'
  if (score >= 8) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

function getProgressColor(score: number): string {
  if (score >= 10) return 'bg-emerald-500'
  if (score >= 8) return 'bg-amber-500'
  return 'bg-red-500'
}

function getProgressBg(score: number): string {
  if (score >= 10) return 'bg-emerald-100 dark:bg-emerald-900/30'
  if (score >= 8) return 'bg-amber-100 dark:bg-amber-900/30'
  return 'bg-red-100 dark:bg-red-900/30'
}

function getQuestionTypeBadgeClasses(type: string): string {
  switch (type?.toUpperCase()) {
    case 'QCU':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
    case 'QCM':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'QRC':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'TRS':
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800'
  }
}

// ─── Component ───

export function MesResultatsPage() {
  const user = useAuthStore((s) => s.user)

  const [resultats, setResultats] = useState<StudentSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<StudentSession | null>(null)

  // ─── Fetch results ───
  const fetchResultats = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/resultats?etudiantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setResultats(data.resultats ?? [])
      }
    } catch {
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger vos résultats.',
      })
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchResultats()
  }, [fetchResultats])

  // ─── Statistics ───
  const globalStats = useMemo(() => {
    const scores = resultats
      .map((r) => r.resultat?.scoreFinal ?? r.score ?? 0)
      .filter((s) => s > 0)

    if (scores.length === 0) {
      return { moyenne: 0, count: 0, best: 0 }
    }

    const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length
    const best = Math.max(...scores)

    return {
      moyenne: Math.round(moyenne * 10) / 10,
      count: resultats.length,
      best: Math.round(best * 10) / 10,
    }
  }, [resultats])

  // ─── Detail dialog handlers ───
  const handleViewDetail = (result: StudentSession) => {
    setSelectedResult(result)
    setDetailDialogOpen(true)
  }

  // ─── Build question details for dialog ───
  const dialogQuestionDetails = useMemo(() => {
    if (!selectedResult) return []

    // Try to get from resultat.detailParQuestion
    const details = selectedResult.resultat?.detailParQuestion
    if (details && Array.isArray(details) && details.length > 0) {
      return details
    }

    // Fallback: build from reponses + epreuve.questions
    const epreuveQuestions = selectedResult.epreuve.questions || []
    const reponses = selectedResult.reponses || []

    return epreuveQuestions.map((eq, idx) => {
      const reponse = reponses.find((r) => r.questionId === eq.questionId)
      return {
        index: idx + 1,
        type: eq.question.type,
        enonce: eq.question.enonce,
        pointsMax: eq.bareme,
        pointsObtenus: reponse?.score ?? null,
        correct: reponse?.score !== null && reponse?.score !== undefined
          ? reponse.score >= eq.bareme * 0.5
          : null,
        reponseEtudiant: reponse?.contenu ?? null,
        reponseAttendue: null,
        commentaire: reponse?.commentaire ?? null,
      }
    })
  }, [selectedResult])

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Trophy className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          Mes Résultats
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez vos notes et résultats
        </p>
      </div>

      {/* ─── Statistics card ─── */}
      {!isLoading && resultats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Moyenne générale</p>
                  <p className={`text-2xl font-bold ${getScoreColor(globalStats.moyenne)}`}>
                    {globalStats.moyenne.toFixed(1)}<span className="text-sm text-muted-foreground">/20</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                  <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Nombre d&apos;épreuves</p>
                  <p className="text-2xl font-bold">
                    {globalStats.count}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-600">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Meilleure note</p>
                  <p className={`text-2xl font-bold ${getScoreColor(globalStats.best)}`}>
                    {globalStats.best.toFixed(1)}<span className="text-sm text-muted-foreground">/20</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="h-5 w-2/3 rounded bg-muted" />
                    <div className="h-4 w-1/2 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted" />
                  </div>
                  <div className="h-10 w-32 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && resultats.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Trophy className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun résultat disponible</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore passé d&apos;épreuve. Vos résultats apparaîtront ici après soumission.
          </p>
        </div>
      )}

      {/* ─── Results list ─── */}
      {!isLoading && resultats.length > 0 && (
        <div className="space-y-4">
          {resultats.map((session) => {
            const score = session.resultat?.scoreFinal ?? session.score ?? 0
            const percentage = Math.round((score / 20) * 100)
            const isCorrected = session.statut === 'CORRIGEE'

            return (
              <Card
                key={session.id}
                className="group transition-shadow hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left: Result info */}
                    <div className="flex-1 space-y-3">
                      {/* Title row */}
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                          <Trophy className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold leading-tight">
                            {session.epreuve.titre}
                          </h3>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                            {session.epreuve.enseignant.name}
                          </p>
                        </div>
                      </div>

                      {/* Date taken */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[60px]">
                        {session.dateDebut && (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                            Passé le {formatDateTimeFR(session.dateDebut)}
                          </span>
                        )}
                      </div>

                      {/* Score display */}
                      <div className="pl-[60px]">
                        <div className="flex items-center gap-3">
                          <span className={`text-3xl font-bold ${getScoreColor(score)}`}>
                            {score.toFixed(1)}
                            <span className="text-lg text-muted-foreground">/20</span>
                          </span>
                          <Badge
                            variant="outline"
                            className={`font-bold px-3 py-1 ${getScoreBadgeClasses(score)}`}
                          >
                            {percentage}%
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className={`h-3 flex-1 max-w-xs overflow-hidden rounded-full ${getProgressBg(score)}`}>
                            <div
                              className={`h-full rounded-full transition-all ${getProgressColor(score)}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Correction status */}
                      <div className="flex items-center gap-2 pl-[60px]">
                        {isCorrected ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Corrigé
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            En attente
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Right: Action button */}
                    <div className="shrink-0 sm:ml-4">
                      <Button
                        variant="outline"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        onClick={() => handleViewDetail(session)}
                      >
                        <Eye className="h-4 w-4" />
                        Voir détail
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Result Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {selectedResult?.epreuve.titre ?? 'Détail du résultat'}
            </DialogTitle>
            <DialogDescription>
              {selectedResult?.dateDebut
                ? `Passé le ${formatDateTimeFR(selectedResult.dateDebut)} — ${selectedResult.epreuve.enseignant.name}`
                : 'Résultat de l\'épreuve'}
            </DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-6 pb-4">
                {/* Score overview */}
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Trophy className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`text-3xl font-bold ${getScoreColor(selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0)}`}>
                        {(selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0).toFixed(1)}
                        <span className="text-lg text-muted-foreground">/20</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={getScoreBadgeClasses(selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0)}
                      >
                        {Math.round(((selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0) / 20) * 100)}%
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <div className={`h-3 w-full max-w-xs overflow-hidden rounded-full ${getProgressBg(selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0)}`}>
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0)}`}
                          style={{
                            width: `${Math.round(((selectedResult.resultat?.scoreFinal ?? selectedResult.score ?? 0) / 20) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {selectedResult.statut === 'CORRIGEE' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Corrigé
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          En attente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Per-question breakdown */}
                {dialogQuestionDetails.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Détail par question
                    </h4>
                    <div className="space-y-3">
                      {dialogQuestionDetails.map((q, idx) => {
                        const isGraded = q.pointsObtenus !== null
                        const isCorrect = q.correct === true
                        const isIncorrect = q.correct === false
                        const isManual = q.type === 'QRC' || q.type === 'TRS'

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border p-4 transition-colors ${
                              isGraded && isCorrect
                                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                                : isGraded && isIncorrect
                                  ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                                  : 'border-muted'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Question number & status */}
                              <div className="flex flex-col items-center gap-1">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                  {q.index ?? idx + 1}
                                </span>
                                {isGraded && isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                )}
                                {isGraded && isIncorrect && (
                                  <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                                )}
                                {isGraded && q.correct === null && isManual && (
                                  <MinusCircle className="h-4 w-4 text-gray-400" />
                                )}
                                {!isGraded && (
                                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                                )}
                              </div>

                              {/* Question content */}
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${getQuestionTypeBadgeClasses(q.type)}`}
                                  >
                                    {q.type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {q.pointsMax} point{q.pointsMax > 1 ? 's' : ''}
                                  </span>
                                </div>

                                {/* Question text */}
                                <p className="text-sm leading-relaxed line-clamp-2">
                                  {q.enonce || `Question ${q.index ?? idx + 1}`}
                                </p>

                                {/* Score */}
                                {isGraded ? (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${
                                      isCorrect
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}>
                                      {q.pointsObtenus?.toFixed(1) ?? '0'}/{q.pointsMax}
                                    </span>
                                    {isCorrect && (
                                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                                        Correct
                                      </Badge>
                                    )}
                                    {isIncorrect && (
                                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0">
                                        Incorrect
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
                                    {isManual ? (
                                      <>
                                        <PenLine className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                        <span className="text-xs text-amber-700 dark:text-amber-400">
                                          En attente de correction par l&apos;enseignant
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                        <span className="text-xs text-amber-700 dark:text-amber-400">
                                          En attente de correction
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Student answer for QCU/QCM */}
                                {(q.type === 'QCU' || q.type === 'QCM') && q.reponseEtudiant && (
                                  <div className="rounded border bg-muted/30 p-2">
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Votre réponse :</span> {q.reponseEtudiant}
                                    </p>
                                  </div>
                                )}

                                {/* Student answer for QRC/TRS */}
                                {(q.type === 'QRC' || q.type === 'TRS') && q.reponseEtudiant && (
                                  <div className="rounded border bg-muted/30 p-2">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Votre réponse :</p>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                      {q.reponseEtudiant}
                                    </p>
                                  </div>
                                )}

                                {/* Teacher comment */}
                                {q.commentaire && (
                                  <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                                      Commentaire de l&apos;enseignant :
                                    </p>
                                    <p className="text-sm leading-relaxed">
                                      {q.commentaire}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Target className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Le détail par question n&apos;est pas encore disponible.
                    </p>
                    {selectedResult.statut !== 'CORRIGEE' && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Les détails seront accessibles une fois la correction terminée.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
