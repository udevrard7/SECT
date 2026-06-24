'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardList,
  Clock,
  Play,
  RotateCcw,
  CalendarDays,
  HelpCircle,
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
  Ban,
  AlertTriangle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter, useSearchParams } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { EntityCard } from '@/components/ds'

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
  noteTotal: number
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
      totalPossible?: number
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

// Normalize stored detailParQuestion format to frontend format
// Stored: {questionId, type, bareme, score, repondu}
// Frontend: {index, type, enonce, pointsMax, pointsObtenus, correct, reponseEtudiant, reponseAttendue}
function normalizeQuestionDetails(raw: unknown): QuestionDetail[] {
  if (!Array.isArray(raw)) return []

  return raw.map((q: Record<string, unknown>, idx: number) => {
    // If already in frontend format (has pointsMax field), use as-is
    if (typeof q.pointsMax === 'number') {
      return {
        index: typeof q.index === 'number' ? q.index : idx + 1,
        type: String(q.type || ''),
        enonce: String(q.enonce || `Question ${idx + 1}`),
        pointsMax: q.pointsMax as number,
        pointsObtenus: typeof q.pointsObtenus === 'number' ? q.pointsObtenus : null,
        correct: typeof q.correct === 'boolean' ? q.correct : null,
        reponseEtudiant: typeof q.reponseEtudiant === 'string' ? q.reponseEtudiant : null,
        reponseAttendue: typeof q.reponseAttendue === 'string' ? q.reponseAttendue : null,
      }
    }

    // Convert stored format to frontend format
    const bareme = typeof q.bareme === 'number' ? q.bareme : 1
    const score = typeof q.score === 'number' ? q.score : null
    const isGraded = score !== null

    return {
      index: idx + 1,
      type: String(q.type || ''),
      enonce: String(q.enonce || `Question ${idx + 1}`),
      pointsMax: bareme,
      pointsObtenus: score,
      correct: isGraded ? (score! >= bareme * 0.5) : null,
      reponseEtudiant: typeof q.reponseEtudiant === 'string' ? q.reponseEtudiant : null,
      reponseAttendue: typeof q.reponseAttendue === 'string' ? q.reponseAttendue : null,
    }
  })
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

function getExamAvailability(epreuve: StudentEpreuve): 'disponible' | 'pas_encore' | 'en_cours' | 'terminee' {
  const now = new Date()
  const debut = new Date(epreuve.dateDebut)
  const fin = new Date(epreuve.dateFin)

  // Check if already submitted
  const submittedSession = epreuve.sessions.find(
    (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE'
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
        dotClass: 'bg-success',
        textClass: 'text-success',
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
        dotClass: 'bg-warning',
        textClass: 'text-warning',
      }
    case 'terminee':
      return {
        label: 'Terminée',
        dotClass: 'bg-gray-400',
        textClass: 'text-gray-500 dark:text-gray-400',
      }
  }
}

function getScoreBadgeClasses(score: number, maxScore = 20): string {
  const halfMax = maxScore / 2
  const threshold = halfMax * 0.8
  if (score >= halfMax) {
    return 'bg-success/10 text-success border-success/20'
  }
  if (score >= threshold) {
    return 'bg-warning/10 text-warning border-warning/20'
  }
  return 'bg-destructive/10 text-destructive border-destructive/20'
}

function getProgressColor(score: number, maxScore = 20): string {
  const halfMax = maxScore / 2
  if (score >= halfMax) return 'bg-success'
  if (score >= halfMax * 0.8) return 'bg-warning'
  return 'bg-destructive'
}

function getProgressBg(score: number, maxScore = 20): string {
  const halfMax = maxScore / 2
  if (score >= halfMax) return 'bg-success/10'
  if (score >= halfMax * 0.8) return 'bg-warning/10'
  return 'bg-destructive/10'
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

function getTimeRemaining(dateFin: string): { text: string; urgent: boolean } {
  const now = new Date()
  const fin = new Date(dateFin)
  const diffMs = fin.getTime() - now.getTime()

  if (diffMs <= 0) return { text: 'Expirée', urgent: true }

  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays > 0) return { text: `${diffDays}j restant${diffDays > 1 ? 's' : ''}`, urgent: diffDays <= 1 }
  if (diffHours > 0) return { text: `${diffHours}h restante${diffHours > 1 ? 's' : ''}`, urgent: true }
  if (diffMin > 0) return { text: `${diffMin}min restant${diffMin > 1 ? 's' : ''}`, urgent: true }
  return { text: 'Moins d\'une minute', urgent: true }
}

function getQuestionTypeBadgeClasses(type: string): string {
  switch (type?.toUpperCase()) {
    case 'QCU':
      return 'bg-info/10 text-info border-info/20'
    case 'QCM':
      return 'bg-warning/10 text-warning border-warning/20'
    case 'QRC':
      return 'bg-success/10 text-success border-success/20'
    case 'TRS':
      return 'bg-secondary/10 text-secondary border-secondary/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

// ─── Component ───

export function MesEpreuvesPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const searchParams = useSearchParams()

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
      (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE' || s.statut === 'ABSENT' || s.statut === 'NON_SOUMIS'
    )
  })

  // ─── Navigation handlers ───
  const handleCommencer = (epreuveId: string) => {
    router.push(PAGE_ROUTES.passation + '?epreuveId=' + epreuveId)
  }

  const handleReprendre = (epreuveId: string) => {
    router.push(PAGE_ROUTES.passation + '?epreuveId=' + epreuveId)
  }

  const handleVoirDetail = (epreuve: StudentEpreuve, session: StudentEpreuve['sessions'][0]) => {
    setSelectedResult({ epreuve, session })
    setDetailDialogOpen(true)
  }

  // ─── Parsed question details ───
  const questionDetails: QuestionDetail[] = useMemo(() => {
    const raw = selectedResult?.session?.resultat?.detailParQuestion
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return normalizeQuestionDetails(parsed)
    } catch {
      return []
    }
  }, [selectedResult?.session?.resultat?.detailParQuestion])

  const hasQuestionDetails = questionDetails.length > 0

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
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
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-success/10 text-success"
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
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-secondary/10 text-secondary"
              >
                {completedEpreuves.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── À venir tab ─── */}
        <TabsContent value="a-venir">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EntityCard key={i} loading title="" />
              ))}
            </div>
          ) : upcomingEpreuves.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <FileCheck className="h-10 w-10 text-success" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">Aucune épreuve à venir</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez aucune épreuve programmée pour le moment. Les épreuves disponibles apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEpreuves.map((ep, idx) => {
                const availability = getExamAvailability(ep)
                const statusInfo = getStatusIndicator(availability)
                const activeSession = ep.sessions.find((s) => s.statut === 'EN_COURS')
                const canStart = availability === 'disponible'
                const canResume = availability === 'en_cours'
                const rem = getTimeRemaining(ep.dateFin)
                const badgeVariant =
                  availability === 'disponible' ? 'success' as const
                  : availability === 'en_cours' ? 'warning' as const
                  : 'secondary' as const

                return (
                  <EntityCard
                    key={ep.id}
                    index={idx}
                    title={ep.titre}
                    subtitle={ep.enseignant.name}
                    thumbnailIcon={ClipboardList}
                    badge={{ label: statusInfo.label, variant: badgeVariant }}
                    meta={`${ep.duree} min · ${ep.questionCount} question${ep.questionCount > 1 ? 's' : ''} · ${ep.totalPoints} pts`}
                  >
                    {/* Dates + time remaining + status */}
                    <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3 text-success" />
                        <span>Début : {formatDateTimeFR(ep.dateDebut)}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${rem.urgent ? 'text-destructive' : 'text-warning'}`}>
                        <AlertCircle className="h-3 w-3" />
                        <span>Limite : {formatDateTimeFR(ep.dateFin)}</span>
                      </div>
                      {availability !== 'terminee' && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          rem.urgent
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-warning/10 text-warning'
                        }`}>
                          <Clock className="h-3 w-3" />
                          {rem.text}
                        </span>
                      )}
                      {availability === 'pas_encore' && (
                        <p className="text-[11px] text-muted-foreground">
                          Disponible le {formatDateFR(ep.dateDebut)} à {formatTime(ep.dateDebut)}
                        </p>
                      )}
                      {availability === 'en_cours' && activeSession?.dateDebut && (
                        <p className="text-[11px] text-muted-foreground">
                          Débuté le {formatDateTimeFR(activeSession.dateDebut)}
                        </p>
                      )}
                      {ep.description && (
                        <p className="line-clamp-2 pt-1">{ep.description}</p>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="mt-3">
                      {canStart && (
                        <Button
                          className="w-full bg-success hover:bg-success/90"
                          onClick={() => handleCommencer(ep.id)}
                        >
                          <Play className="h-4 w-4" />
                          Commencer
                        </Button>
                      )}
                      {canResume && (
                        <Button
                          className="w-full bg-warning hover:bg-warning/90"
                          onClick={() => handleReprendre(ep.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reprendre
                        </Button>
                      )}
                      {!canStart && !canResume && (
                        <Button variant="outline" disabled className="w-full">
                          <Clock className="h-4 w-4" />
                          {availability === 'pas_encore' ? 'Pas encore disponible' : 'Terminée'}
                        </Button>
                      )}
                    </div>
                  </EntityCard>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Résultats tab ─── */}
        <TabsContent value="resultats">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EntityCard key={i} loading title="" />
              ))}
            </div>
          ) : completedEpreuves.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary/10">
                <Trophy className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">Aucun résultat disponible</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore passé d&apos;épreuve. Vos résultats apparaîtront ici après soumission.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {completedEpreuves.map((ep, idx) => {
                const session = ep.sessions.find(
                  (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE' || s.statut === 'ABSENT' || s.statut === 'NON_SOUMIS'
                )
                if (!session) return null

                const isAbsent = session.statut === 'ABSENT'
                const isNonSoumis = session.statut === 'NON_SOUMIS'
                const score = session.resultat?.scoreFinal ?? session.score ?? 0
                const maxScore = ep.totalPoints || ep.noteTotal || 20
                const percentage = Math.round((score / maxScore) * 100)
                const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
                const allGraded = isCorrected || (session.resultat?.detailParQuestion
                  ? (() => {
                      try {
                        const parsed = JSON.parse(session.resultat.detailParQuestion)
                        const normalized = normalizeQuestionDetails(parsed)
                        return normalized.length > 0 && normalized.every((q) => q.pointsObtenus !== null)
                      } catch {
                        return false
                      }
                    })()
                  : false
                )

                const thumbnailIcon = isAbsent ? Ban : isNonSoumis ? AlertTriangle : FileCheck
                const badgeLabel = isAbsent
                  ? 'Absent'
                  : isNonSoumis
                    ? 'Non soumis'
                    : isCorrected
                      ? 'Corrigé'
                      : 'En attente'
                const badgeVariant =
                  isCorrected ? 'success' as const
                  : (isAbsent || isNonSoumis) ? 'warning' as const
                  : 'warning' as const

                return (
                  <EntityCard
                    key={ep.id}
                    index={idx}
                    title={ep.titre}
                    subtitle={ep.enseignant.name}
                    thumbnailIcon={thumbnailIcon}
                    progress={isAbsent || isNonSoumis ? undefined : percentage}
                    badge={{ label: badgeLabel, variant: badgeVariant }}
                    meta={
                      isAbsent
                        ? 'Absent(e) à l\'épreuve'
                        : isNonSoumis
                          ? 'Brouillon sauvegardé'
                          : `Score : ${score.toFixed(1)}/${maxScore} · ${session.dateDebut ? formatDateTimeFR(session.dateDebut) : ''}`
                    }
                  >
                    {/* Absent/Non soumis banner */}
                    {isAbsent && (
                      <div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Absent(e) — Vous n&apos;avez pas commencé cette épreuve.
                        </p>
                      </div>
                    )}
                    {isNonSoumis && (
                      <div className="mt-2 rounded-md border border-warning/20 bg-warning/10 p-3">
                        <p className="text-xs font-medium text-warning">
                          Non soumis — Votre brouillon a été sauvegardé automatiquement à la clôture de l&apos;épreuve.
                        </p>
                      </div>
                    )}

                    {/* Score badge + correction status for normal cases */}
                    {!isAbsent && !isNonSoumis && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs font-bold tabular-nums px-2 py-0.5 ${getScoreBadgeClasses(score)}`}
                          >
                            {score.toFixed(1)}/{maxScore}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {percentage}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          {isCorrected ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              <span className="font-medium text-success">Corrigé</span>
                            </>
                          ) : (
                            <>
                              <Loader2 className="h-3.5 w-3.5 text-warning animate-spin" />
                              <span className="font-medium text-warning">En attente de correction</span>
                            </>
                          )}
                          {!allGraded && isCorrected && (
                            <span className="text-[10px] text-muted-foreground">
                              (certaines questions en attente)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action button */}
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="w-full border-success/30 text-success hover:bg-success/10"
                        onClick={() => handleVoirDetail(ep, session)}
                      >
                        <Eye className="h-4 w-4" />
                        Voir le détail
                      </Button>
                    </div>
                  </EntityCard>
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
            <DialogTitle className="flex items-center gap-2 font-display">
              <ClipboardList className="h-5 w-5 text-success" />
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
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <Trophy className="h-7 w-7 text-success" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tabular-nums">
                        {(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0).toFixed(1)}
                        <span className="font-mono text-lg text-muted-foreground">/{(selectedResult.session.resultat?.totalPossible ?? selectedResult.epreuve.noteTotal) || 20}</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={getScoreBadgeClasses(
                          selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0
                        )}
                      >
                        {Math.round(
                          ((selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0) / ((selectedResult.session.resultat?.totalPossible ?? selectedResult.epreuve.noteTotal) || 20)) * 100
                        )}%
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <div className={`h-2.5 w-full max-w-xs overflow-hidden rounded-full ${getProgressBg(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0)}`}>
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0)}`}
                          style={{
                            width: `${Math.round(
                              ((selectedResult.session.resultat?.scoreFinal ?? selectedResult.session.score ?? 0) / ((selectedResult.session.resultat?.totalPossible ?? selectedResult.epreuve.noteTotal) || 20)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Correction status */}
                <div className="flex items-center gap-2">
                  {selectedResult.session.statut === 'RETOURNEE' ? (
                    <Badge className="bg-secondary/10 text-secondary border-secondary/20">
                      <CheckCircle2 className="h-3 w-3" />
                      Rendu
                    </Badge>
                  ) : selectedResult.session.statut === 'CORRIGEE' ? (
                    <Badge className="bg-success/10 text-success border-success/20">
                      <CheckCircle2 className="h-3 w-3" />
                      Corrigé
                    </Badge>
                  ) : (
                    <Badge className="bg-warning/10 text-warning border-warning/20">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      En attente de correction
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Question-by-question breakdown */}
                {hasQuestionDetails ? (
                  <div className="space-y-4">
                    <h4 className="font-display text-sm font-semibold flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-success" />
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
                                ? 'border-success/20 bg-success/5'
                                : isIncorrect
                                  ? 'border-destructive/20 bg-destructive/5'
                                  : 'border-muted'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Question number & status icon */}
                              <div className="flex flex-col items-center gap-1">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold tabular-nums">
                                  {q.index ?? idx + 1}
                                </span>
                                {isGraded && isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                )}
                                {isGraded && isIncorrect && (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                                {isGraded && q.correct === null && isManual && (
                                  <MinusCircle className="h-4 w-4 text-muted-foreground" />
                                )}
                                {!isGraded && (
                                  <Loader2 className="h-4 w-4 text-warning animate-spin" />
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
                                    <span className={`font-mono text-sm font-semibold tabular-nums ${
                                      isCorrect
                                        ? 'text-success'
                                        : 'text-destructive'
                                    }`}>
                                      {q.pointsObtenus?.toFixed(1) ?? '0'}/{q.pointsMax}
                                    </span>
                                    {isCorrect && (
                                      <Badge className="bg-success/10 text-success text-[10px] px-1.5 py-0">
                                        Correct
                                      </Badge>
                                    )}
                                    {isIncorrect && (
                                      <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5 py-0">
                                        Incorrect
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/10 px-3 py-1.5">
                                    {isManual ? (
                                      <>
                                        <PenLine className="h-3.5 w-3.5 text-warning" />
                                        <span className="text-xs text-warning">
                                          En attente de correction par l&apos;enseignant
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <MessageSquare className="h-3.5 w-3.5 text-warning" />
                                        <span className="text-xs text-warning">
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
                                      <p className="text-xs text-success">
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
                      <p className="mt-1 text-xs text-warning">
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
