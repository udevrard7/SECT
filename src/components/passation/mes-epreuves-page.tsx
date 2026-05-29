'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList,
  Clock,
  Play,
  RotateCcw,
  CalendarDays,
  User,
  Timer,
  HelpCircle,
  Star,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  Trophy,
  ChevronRight,
  XCircle,
  MinusCircle,
  MessageSquare,
  PenLine,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface StudentEpreuve {
  id: string
  titre: string
  description: string | null
  duree: number
  dateDebut: string
  dateFin: string
  statut: string
  questionCount: number
  totalPoints: number
  enseignant: { id: string; name: string }
  sessions: Array<{
    id: string
    statut: string
    score: number | null
    dateDebut: string | null
    dateFin: string | null
    resultat: {
      id: string
      scoreFinal: number
      detailParQuestion: string
    } | null
  }>
}

interface QuestionDetail {
  index: number
  type: string
  enonce: string
  pointsMax: number
  pointsObtenus: number | null
  correct: boolean | null
  reponseEtudiant: string | null
  reponseAttendue: string | null
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

function formatTime(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function getExamAvailability(epreuve: StudentEpreuve): 'disponible' | 'pas_encore' | 'en_cours' | 'terminee' {
  const now = new Date()
  const debut = new Date(epreuve.dateDebut)
  const fin = new Date(epreuve.dateFin)

  // Check if already submitted
  const submittedSession = epreuve.sessions.find(
    (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
  )
  if (submittedSession) return 'terminee'

  // Check if session is in progress
  const activeSession = epreuve.sessions.find((s) => s.statut === 'EN_COURS')
  if (activeSession) return 'en_cours'

  // Check time window
  if (now < debut) return 'pas_encore'
  if (now >= debut && now <= fin) return 'disponible'

  // Past deadline
  return 'terminee'
}

function getStatusIndicator(status: 'disponible' | 'pas_encore' | 'en_cours' | 'terminee') {
  switch (status) {
    case 'disponible':
      return {
        label: 'Disponible',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-700 dark:text-emerald-400',
      }
    case 'pas_encore':
      return {
        label: 'Pas encore disponible',
        dotClass: 'bg-gray-400',
        textClass: 'text-gray-500 dark:text-gray-400',
      }
    case 'en_cours':
      return {
        label: 'En cours',
        dotClass: 'bg-amber-500',
        textClass: 'text-amber-700 dark:text-amber-400',
      }
    case 'terminee':
      return {
        label: 'Terminée',
        dotClass: 'bg-gray-400',
        textClass: 'text-gray-500 dark:text-gray-400',
      }
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

function getQuestionTypeLabel(type: string): string {
  switch (type?.toUpperCase()) {
    case 'QCU': return 'QCU'
    case 'QCM': return 'QCM'
    case 'QRC': return 'QRC'
    case 'TRS': return 'TRS'
    default: return type
  }
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

export function MesEpreuvesPage() {
  const user = useAuthStore((s) => s.user)
  const { setCurrentPage } = useNavigationStore()

  const [epreuves, setEpreuves] = useState<StudentEpreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('a-venir')

  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<{
    epreuve: StudentEpreuve
    session: StudentEpreuve['sessions'][0]
  } | null>(null)

  // ─── Fetch epreuves ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/epreuves?etudiantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
      }
    } catch {
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger vos épreuves.',
      })
    }
  }, [user])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchEpreuves()
      setIsLoading(false)
    }
    load()
  }, [fetchEpreuves])

  // ─── Split epreuves into upcoming vs results ───
  const upcomingEpreuves = epreuves.filter((ep) => {
    const hasCompletedSession = ep.sessions.some(
      (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
    )
    if (hasCompletedSession) return false
    // Show if: no session, or session EN_COURS
    return ep.sessions.length === 0 || ep.sessions.some((s) => s.statut === 'EN_COURS')
  })

  const completedEpreuves = epreuves.filter((ep) => {
    return ep.sessions.some(
      (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
    )
  })

  // ─── Navigation handlers ───
  const handleCommencer = (epreuveId: string) => {
    setCurrentPage('passation', { epreuveId })
  }

  const handleReprendre = (epreuveId: string) => {
    setCurrentPage('passation', { epreuveId })
  }

  const handleVoirDetail = (epreuve: StudentEpreuve, session: StudentEpreuve['sessions'][0]) => {
    setSelectedResult({ epreuve, session })
    setDetailDialogOpen(true)
  }

  // ─── Parsed question details ───
  const questionDetails: QuestionDetail[] = parseJsonSafe<QuestionDetail[]>(
    selectedResult?.session?.resultat?.detailParQuestion ?? null,
    []
  )

  const hasQuestionDetails = questionDetails.length > 0

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Mes Épreuves
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez vos épreuves à venir et vos résultats
        </p>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="a-venir" className="gap-1.5">
            <Clock className="h-4 w-4" />
            À venir
            {upcomingEpreuves.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              >
                {upcomingEpreuves.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resultats" className="gap-1.5">
            <Trophy className="h-4 w-4" />
            Résultats
            {completedEpreuves.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              >
                {completedEpreuves.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── À venir tab ─── */}
        <TabsContent value="a-venir">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="h-5 w-2/3 rounded bg-muted" />
                        <div className="h-4 w-1/2 rounded bg-muted" />
                        <div className="flex gap-4">
                          <div className="h-3 w-24 rounded bg-muted" />
                          <div className="h-3 w-20 rounded bg-muted" />
                          <div className="h-3 w-16 rounded bg-muted" />
                        </div>
                      </div>
                      <div className="h-10 w-32 rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : upcomingEpreuves.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <FileCheck className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune épreuve à venir</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez aucune épreuve programmée pour le moment. Les épreuves disponibles apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingEpreuves.map((ep) => {
                const availability = getExamAvailability(ep)
                const statusInfo = getStatusIndicator(availability)
                const activeSession = ep.sessions.find((s) => s.statut === 'EN_COURS')
                const canStart = availability === 'disponible'
                const canResume = availability === 'en_cours'

                return (
                  <Card
                    key={ep.id}
                    className="group transition-shadow hover:shadow-md"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: Exam info */}
                        <div className="flex-1 space-y-3">
                          {/* Title row */}
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                              <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold leading-tight">
                                {ep.titre}
                              </h3>
                              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <User className="h-3.5 w-3.5" />
                                {ep.enseignant.name}
                              </p>
                            </div>
                          </div>

                          {/* Meta info */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              {formatDateTimeFR(ep.dateDebut)}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Timer className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                              {ep.duree} min
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <HelpCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                              {ep.questionCount} question{ep.questionCount > 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Star className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                              {ep.totalPoints} point{ep.totalPoints > 1 ? 's' : ''}
                            </span>
                          </div>

                          {/* Status indicator */}
                          <div className="flex items-center gap-2 pl-[52px]">
                            <span className={`h-2 w-2 rounded-full ${statusInfo.dotClass}`} />
                            <span className={`text-sm font-medium ${statusInfo.textClass}`}>
                              {statusInfo.label}
                            </span>
                            {availability === 'pas_encore' && (
                              <span className="text-xs text-muted-foreground">
                                (disponible le {formatDateFR(ep.dateDebut)} à {formatTime(ep.dateDebut)})
                              </span>
                            )}
                            {availability === 'en_cours' && activeSession?.dateDebut && (
                              <span className="text-xs text-muted-foreground">
                                (débuté le {formatDateTimeFR(activeSession.dateDebut)})
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {ep.description && (
                            <p className="line-clamp-2 text-sm text-muted-foreground pl-[52px]">
                              {ep.description}
                            </p>
                          )}
                        </div>

                        {/* Right: Action button */}
                        <div className="flex shrink-0 items-center gap-2 sm:ml-4">
                          {canStart && (
                            <Button
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleCommencer(ep.id)}
                            >
                              <Play className="h-4 w-4" />
                              Commencer
                            </Button>
                          )}
                          {canResume && (
                            <Button
                              className="bg-amber-600 hover:bg-amber-700"
                              onClick={() => handleReprendre(ep.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Reprendre
                            </Button>
                          )}
                          {!canStart && !canResume && (
                            <Button variant="outline" disabled>
                              <Clock className="h-4 w-4" />
                              {availability === 'pas_encore' ? 'Pas encore disponible' : 'Terminée'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Résultats tab ─── */}
        <TabsContent value="resultats">
          {isLoading ? (
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
          ) : completedEpreuves.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
                <Trophy className="h-10 w-10 text-teal-500 dark:text-teal-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun résultat disponible</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore passé d&apos;épreuve. Vos résultats apparaîtront ici après soumission.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedEpreuves.map((ep) => {
                const session = ep.sessions.find(
                  (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
                )
                if (!session) return null

                const score = session.resultat?.scoreFinal ?? session.score ?? 0
                const percentage = Math.round((score / 20) * 100)
                const isCorrected = session.statut === 'CORRIGEE'
                const allGraded = isCorrected || (session.resultat?.detailParQuestion
                  ? parseJsonSafe<QuestionDetail[]>(session.resultat.detailParQuestion, []).every(
                      (q) => q.pointsObtenus !== null
                    )
                  : false
                )

                return (
                  <Card
                    key={ep.id}
                    className="group transition-shadow hover:shadow-md"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: Result info */}
                        <div className="flex-1 space-y-3">
                          {/* Title row */}
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                              <FileCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold leading-tight">
                                {ep.titre}
                              </h3>
                              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <User className="h-3.5 w-3.5" />
                                {ep.enseignant.name}
                              </p>
                            </div>
                          </div>

                          {/* Date taken */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
                            {session.dateDebut && (
                              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                                Passé le {formatDateTimeFR(session.dateDebut)}
                              </span>
                            )}
                          </div>

                          {/* Score display */}
                          <div className="pl-[52px]">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant="outline"
                                className={`text-sm font-bold px-3 py-1 ${getScoreBadgeClasses(score)}`}
                              >
                                {score.toFixed(1)}/20
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {percentage}%
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <div className={`h-2.5 flex-1 max-w-xs overflow-hidden rounded-full ${getProgressBg(score)}`}>
                                <div
                                  className={`h-full rounded-full transition-all ${getProgressColor(score)}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Session status */}
                          <div className="flex items-center gap-2 pl-[52px]">
                            {isCorrected ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                  Corrigé
                                </span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                  En attente de correction
                                </span>
                              </>
                            )}
                            {!allGraded && isCorrected && (
                              <span className="text-xs text-muted-foreground">
                                (certaines questions sont encore en attente)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Action button */}
                        <div className="shrink-0 sm:ml-4">
                          <Button
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleVoirDetail(ep, session)}
                          >
                            <Eye className="h-4 w-4" />
                            Voir le détail
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Result Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {selectedResult?.epreuve.titre ?? 'Détail du résultat'}
            </DialogTitle>
            <DialogDescription>
              {selectedResult?.session?.dateDebut
                ? `Passé le ${formatDateTimeFR(selectedResult.session.dateDebut)}`
                : 'Résultat de l\'épreuve'}
            </DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-6 pb-4">
                {/* Score overview */}
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Trophy className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">
                        {(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0).toFixed(1)}
                        <span className="text-lg text-muted-foreground">/20</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={getScoreBadgeClasses(
                          selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0
                        )}
                      >
                        {Math.round(
                          ((selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0) / 20) * 100
                        )}%
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <div className={`h-2.5 w-full max-w-xs overflow-hidden rounded-full ${getProgressBg(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0)}`}>
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0)}`}
                          style={{
                            width: `${Math.round(
                              ((selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0) / 20) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Correction status */}
                <div className="flex items-center gap-2">
                  {selectedResult.session.statut === 'CORRIGEE' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      Corrigé
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      En attente de correction
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Question-by-question breakdown */}
                {hasQuestionDetails ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Détail par question
                    </h4>
                    <div className="space-y-3">
                      {questionDetails.map((q, idx) => {
                        const isGraded = q.pointsObtenus !== null
                        const isCorrect = q.correct === true
                        const isIncorrect = q.correct === false
                        const isManual = q.type === 'QRC' || q.type === 'TRS'

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border p-4 transition-colors ${
                              isCorrect
                                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                                : isIncorrect
                                  ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                                  : 'border-muted'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Question number & status icon */}
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
                                    {getQuestionTypeLabel(q.type)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {q.pointsMax} point{q.pointsMax > 1 ? 's' : ''}
                                  </span>
                                </div>

                                {/* Question text */}
                                <p className="text-sm leading-relaxed">
                                  {q.enonce || `Question ${q.index ?? idx + 1}`}
                                </p>

                                {/* Score for this question */}
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

                                {/* Student answer & expected answer for QCU/QCM */}
                                {(q.type === 'QCU' || q.type === 'QCM') && isGraded && q.reponseEtudiant && (
                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Votre réponse :</span> {q.reponseEtudiant}
                                    </p>
                                    {isIncorrect && q.reponseAttendue && (
                                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                        <span className="font-medium">Réponse attendue :</span> {q.reponseAttendue}
                                      </p>
                                    )}
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
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Le détail par question n&apos;est pas encore disponible.
                    </p>
                    {selectedResult.session.statut !== 'CORRIGEE' && (
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
