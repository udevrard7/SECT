'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  ClipboardPen,
  Clock,
  Plus,
  BarChart3,
  TrendingUp,
  Inbox,
  CheckCircle,
  MessageSquareWarning,
  CalendarDays,
  Target,
  Check,
  RefreshCw,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge as UiBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PulseSkeleton, StatCardSkeletonGrid, StatCard, AcademicCalendar, type CalendarEvent } from '@/components/ds'
import { EvolutionChart, ComparisonChart, ChartCard } from '@/components/resultats/resultats-charts'
import { ErrorState } from '@/components/shared/error-state'
import { BadgesCarousel, BadgeUnlockNotification } from '@/components/shared/badges-carousel'
import {
  useEnseignantDashboard,
  useBadges,
  useRecalculateBadges,
  useRefreshDashboard,
  type EpreuveAVenirEnseignant,
  type RecentEpreuve,
  type EnseignantStatsData,
} from '@/hooks/use-dashboard'
import {
  formatDateFR,
  formatMonthShortFR,
  timeAgoFR,
  getBarColor,
} from '@/lib/resultats-utils'
import type { EvolutionPoint } from '@/types/resultats'
import type { BadgeWithProgress } from '@/lib/badges-engine'

// ─── Animation Variants ───
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 100 },
  },
}

// ─── Skeleton for Loading State ───
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <PulseSkeleton className="h-9 w-64" />
        <PulseSkeleton className="h-6 w-24" />
      </div>
      <StatCardSkeletonGrid count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PulseSkeleton className="h-40 w-full" variant="card" />
          <PulseSkeleton className="h-40 w-full" variant="card" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PulseSkeleton className="h-72 w-full" variant="card" />
            <PulseSkeleton className="h-72 w-full" variant="card" />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <PulseSkeleton className="h-48 w-full" variant="card" />
          <PulseSkeleton className="h-64 w-full" variant="card" />
        </div>
      </div>
    </div>
  )
}

// ─── Objective Card ───
function ObjectiveCard() {
  const [objective, setObjective] = useState('Corriger toutes les copies cette semaine')
  const [isEditing, setIsEditing] = useState(false)

  return (
    <Card className="bg-gradient-to-br from-success/10 to-primary/10 border-success/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-success font-display tracking-tight">
          <Target className="h-5 w-5" />
          Mon Objectif
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="flex-grow bg-transparent border-b border-success focus:outline-none text-lg font-semibold"
            />
            <Button size="sm" onClick={() => setIsEditing(false)}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-semibold">{objective}</p>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>Modifier</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Upcoming Exams Timeline ───
function EpreuvesTimeline({ epreuves }: { epreuves: EpreuveAVenirEnseignant[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display tracking-tight">
          <CalendarDays className="h-5 w-5 text-success" />
          Épreuves à venir
        </CardTitle>
        <CardDescription>Votre planning d&apos;examens</CardDescription>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto">
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune épreuve planifiée.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
            {epreuves.map((exam) => (
              <motion.div key={exam.id} variants={itemVariants} className="mb-8 last:mb-0">
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-success flex items-center justify-center -translate-x-1/2 ml-0.5">
                  <CalendarDays className="h-3 w-3 text-success" />
                </div>
                <p className="font-semibold truncate" title={exam.titre}>{exam.titre}</p>
                <p className="text-sm text-muted-foreground">Du {formatDateFR(exam.date)}</p>
                <p className="text-sm text-destructive font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Limite : {formatDateFR(exam.dateFin)}</span>
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <UiBadge variant="outline" className="text-[10px] shrink-0">{exam.statut}</UiBadge>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums tracking-tight">{exam.nbParticipants}</span> participant{exam.nbParticipants !== 1 ? 's' : ''}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Recent Epreuves with Score Circles ───
function RecentEpreuves({ epreuves }: { epreuves: RecentEpreuve[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display tracking-tight">
          <FileText className="h-5 w-5 text-success" />
          Épreuves Récentes
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto">
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucune épreuve pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {epreuves.map(epreuve => {
              const scoreColor = getBarColor(epreuve.moyenne ?? 0)
              const avgDisplay = epreuve.moyenne ? epreuve.moyenne.toFixed(1) : '-'
              return (
                <div key={epreuve.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs font-mono tabular-nums tracking-tight"
                    style={{
                      backgroundColor: `${scoreColor}20`,
                      color: scoreColor,
                    }}
                    title={epreuve.moyenne ? `Moyenne : ${epreuve.moyenne.toFixed(1)}/20` : 'Pas de moyenne'}
                  >
                    {avgDisplay}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate" title={epreuve.titre}>{epreuve.titre}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <span className="font-mono tabular-nums tracking-tight">{epreuve.nbParticipants}</span> participant{epreuve.nbParticipants !== 1 ? 's' : ''} · {formatDateFR(epreuve.date)}
                    </p>
                  </div>
                  <UiBadge variant="outline" className="text-[10px] shrink-0">{epreuve.statut}</UiBadge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Empty Dashboard ───
function EmptyDashboard({ name }: { name: string }) {
  const router = useRouter()

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.h1 variants={itemVariants} className="text-2xl font-display font-bold tracking-tight md:text-3xl ds-kente-pattern rounded-lg px-4 py-3">
        Bonjour, {name} ! Bienvenue sur votre espace.
      </motion.h1>
      <ObjectiveCard />
      <Card className="border-dashed ds-kente-pattern">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <ClipboardPen className="h-10 w-10 text-success" />
          </div>
          <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore créé d&apos;épreuves. Commencez par créer votre première évaluation.
          </p>
          <Button
            className="mt-4 bg-success hover:bg-success/90"
            onClick={() => router.push('/epreuves')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Créer une épreuve
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ───
export function EnseignantDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Enseignant'
  const userId = user?.id
  const router = useRouter()

  const statsQuery = useEnseignantDashboard(userId)
  const badgesQuery = useBadges(userId)
  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<BadgeWithProgress | null>(null)

  // POST /api/badges on mount to refresh badge progress. The onSuccess
  // callback surfaces newly unlocked badges via the notification component
  // (avoids setState in useEffect body, which is forbidden by
  // react-hooks/set-state-in-effect).
  const recalculateBadges = useRecalculateBadges(userId, {
    onSuccess: (data) => {
      if (data.newlyUnlocked?.length) {
        setNewlyUnlockedBadge(data.newlyUnlocked[0])
      }
    },
  })
  const refresh = useRefreshDashboard()

  // Trigger the recalculation once on mount (preserves original behavior).
  useEffect(() => {
    if (!userId) return
    recalculateBadges.mutate()
  }, [userId, recalculateBadges])

  // Auto-dismiss the badge notification with a cleanup-based timer
  // (replaces the previous setTimeout-without-cleanup leak).
  useEffect(() => {
    if (!newlyUnlockedBadge) return
    const t = setTimeout(() => setNewlyUnlockedBadge(null), 5000)
    return () => clearTimeout(t)
  }, [newlyUnlockedBadge])

  // ─── Mapping des épreuves à venir vers CalendarEvent[] ───
  // Chaque épreuve produit 2 événements : 'exam' sur la date de début
  // (dateDebut = date) et 'deadline' sur la date de fin (échéance de
  // soumission / fin de session). Les dates invalides (NaN) sont filtrées.
  // Les corrections en attente (pendingCorrections) ne sont pas incluses
  // ici car elles n'exposent pas de date d'échéance côté API — uniquement
  // un `submittedAt`. On se concentre donc sur les sessions d'examen.
  // Les hooks sont appelés AVANT les retours anticipés (rules-of-hooks).
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const epreuves = statsQuery.data?.epreuvesAVenir
    if (!epreuves) return []
    return epreuves.flatMap((epreuve): CalendarEvent[] => {
      const events: CalendarEvent[] = []
      const startDate = new Date(epreuve.date)
      if (!Number.isNaN(startDate.getTime())) {
        events.push({
          id: `${epreuve.id}-start`,
          date: startDate,
          title: epreuve.titre,
          type: 'exam',
        })
      }
      const endDate = new Date(epreuve.dateFin)
      if (!Number.isNaN(endDate.getTime())) {
        events.push({
          id: `${epreuve.id}-deadline`,
          date: endDate,
          title: epreuve.titre,
          type: 'deadline',
        })
      }
      return events
    })
  }, [statsQuery.data?.epreuvesAVenir])

  // ─── Loading ───
  if (statsQuery.isLoading && !statsQuery.data) {
    return <DashboardSkeleton />
  }

  // ─── Error ───
  if (statsQuery.isError && !statsQuery.data) {
    return (
      <div className="py-6">
        <ErrorState
          message="Impossible de charger vos statistiques. Veuillez réessayer."
          onRetry={() => statsQuery.refetch()}
        />
      </div>
    )
  }

  const data: EnseignantStatsData | undefined = statsQuery.data

  // ─── Empty / no data ───
  if (!data) {
    return <EmptyDashboard name={name} />
  }

  const hasNoActivity = data.nbEpreuves === 0 && data.pendingCorrections.length === 0
  if (hasNoActivity) {
    return <EmptyDashboard name={name} />
  }

  // Badges viennent de useBadges (format BadgeWithProgress), pas du champ
  // basique `badges` renvoyé par /api/stats/enseignant.
  const badges: BadgeWithProgress[] = badgesQuery.data?.badges ?? []

  // ─── Données transformées pour les charts partagés ───
  const evolutionData: EvolutionPoint[] = data.evolutionMoyennes.map((e) => ({
    mois: formatMonthShortFR(e.mois),
    moyenne: e.moyenne,
    count: e.nbEvaluations,
  }))

  const comparisonData = data.performanceParEpreuve.map((p) => ({
    name: p.titre,
    value: p.moyenne,
  }))

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ds-kente-pattern rounded-lg px-4 py-3">
        <motion.h1 variants={itemVariants} className="text-2xl font-display font-bold tracking-tight md:text-3xl">
          Bonjour, {name} ! Bienvenue sur votre espace.
        </motion.h1>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={statsQuery.isFetching || badgesQuery.isFetching}
          className="self-start sm:self-auto gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${statsQuery.isFetching || badgesQuery.isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Rafraîchir</span>
        </Button>
      </div>

      {/* ─── Quick stats KPIs ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 [&>div]:border-l-4 [&>div]:border-l-primary">
        <StatCard
          icon={FileText}
          label="Documents"
          value={data.nbDocuments}
          accent="success"
        />
        <StatCard
          icon={BookOpen}
          label="Questions"
          value={data.nbQuestionsTotal}
          accent="primary"
        />
        <StatCard
          icon={CalendarDays}
          label="Épreuves actives"
          value={data.nbEpreuvesActives}
          accent="warning"
        />
        <StatCard
          icon={ClipboardPen}
          label="Corrections en attente"
          value={data.nbCorrectionsEnAttente}
          accent="danger"
        />
      </motion.div>

      {/* ─── Pending corrections alert ─── */}
      {data.nbCorrectionsEnAttente > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-warning/40 bg-warning/10">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                  <MessageSquareWarning className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-semibold text-warning">
                    <span className="font-mono tabular-nums tracking-tight">{data.nbCorrectionsEnAttente}</span> correction{data.nbCorrectionsEnAttente !== 1 ? 's' : ''} en attente
                  </p>
                  <p className="text-sm text-warning">
                    Des étudiants ont soumis des réponses à évaluer
                  </p>
                </div>
              </div>
              <Button
                className="bg-warning hover:bg-warning/90"
                onClick={() => router.push('/correction')}
              >
                <ClipboardPen className="mr-2 h-4 w-4" /> Corriger
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
        {/* ─── Main column (2/3) ─── */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div variants={itemVariants}>
            <ObjectiveCard />
          </motion.div>

          <motion.div variants={itemVariants}>
            <BadgesCarousel badges={badges} />
          </motion.div>

          {/* ─── Charts ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <ChartCard
                title="Évolution des moyennes"
                icon={<TrendingUp className="h-4 w-4 text-success" />}
              >
                <div className="h-72">
                  <EvolutionChart data={evolutionData} height={288} />
                </div>
              </ChartCard>
            </motion.div>

            <motion.div variants={itemVariants}>
              <ChartCard
                title="Performance par épreuve"
                icon={<BarChart3 className="h-4 w-4 text-primary" />}
              >
                <div className="h-72">
                  <ComparisonChart data={comparisonData} height={288} color="#14b8a6" />
                </div>
              </ChartCard>
            </motion.div>
          </div>

          {/* ─── Activity Feed ─── */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                  <Inbox className="h-5 w-5" />
                  Flux d&apos;Activité
                </CardTitle>
                <CardDescription>Les dernières soumissions de vos étudiants.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[300px] overflow-y-auto">
                {data.pendingCorrections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6 ds-kente-pattern rounded-lg">
                    <CheckCircle className="h-10 w-10 text-success mb-2" />
                    <p className="font-semibold">Boîte de réception vide</p>
                    <p className="text-sm text-muted-foreground">Aucune nouvelle soumission à corriger.</p>
                  </div>
                ) : (
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
                    {data.pendingCorrections.map((item, index) => (
                      <motion.div key={item.sessionId + index} variants={itemVariants} className="mb-6 last:mb-0">
                        <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-warning flex items-center justify-center -translate-x-1/2 ml-0.5">
                          <MessageSquareWarning className="h-3 w-3 text-warning" />
                        </div>
                        <p className="text-sm truncate">
                          Correction pour <span className="font-medium">{item.etudiantNom}</span> sur{' '}
                          <span className="font-medium" title={item.epreuveTitre}>{item.epreuveTitre}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <time dateTime={item.submittedAt}>{timeAgoFR(item.submittedAt)}</time>
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ─── Sidebar (1/3) ─── */}
        <div className="lg:col-span-1 space-y-6">
          {/* ─── Calendrier académique ─── */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display tracking-tight">
                  Calendrier académique
                </CardTitle>
                <CardDescription>
                  Sessions d&apos;examen et échéances à venir
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <AcademicCalendar
                  events={calendarEvents}
                  onDateClick={(date) => router.push('/epreuves')}
                  className="max-w-md w-full"
                />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <EpreuvesTimeline epreuves={data.epreuvesAVenir} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <RecentEpreuves epreuves={data.recentEpreuves} />
          </motion.div>
        </div>
      </div>

      {/* ─── Badge Unlock Notification ─── */}
      <AnimatePresence>
        {newlyUnlockedBadge && (
          <BadgeUnlockNotification
            badge={newlyUnlockedBadge}
            onClose={() => setNewlyUnlockedBadge(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
