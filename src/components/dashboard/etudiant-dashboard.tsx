'use client'

import { getGreeting } from '@/lib/micro-copy'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  GraduationCap,
  Trophy,
  Clock,
  Play,
  Eye,
  Award,
  Star,
  Check,
  Target,
  RefreshCw,
  TrendingUp,
  BarChart3,
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
import {
  PulseSkeleton,
  StatCardSkeletonGrid,
  StatCard,
  AcademicCalendar,
  type CalendarEvent,
} from '@/components/ds'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartCard } from '@/components/resultats/resultats-charts'
import { ErrorState } from '@/components/shared/error-state'
import { BadgesCarousel, BadgeUnlockNotification } from '@/components/shared/badges-carousel'
import {
  useEtudiantDashboard,
  useBadges,
  useRecalculateBadges,
  useRefreshDashboard,
  type EpreuveAVenirEtudiant,
  type EtudiantStatsData,
} from '@/hooks/use-dashboard'
import {
  formatDateFR,
  getBarColor,
  normalizeTo20,
} from '@/lib/resultats-utils'
import type { BadgeWithProgress } from '@/lib/badges-engine'

// ─── Animation Variants ───
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
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
      <StatCardSkeletonGrid count={4} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <PulseSkeleton className="h-24 w-full" variant="card" />
          <PulseSkeleton className="h-40 w-full" variant="card" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PulseSkeleton className="h-64 w-full" variant="card" />
            <PulseSkeleton className="h-64 w-full" variant="card" />
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
  const [objective, setObjective] = useState('Obtenir 15/20 au prochain partiel')
  const [isEditing, setIsEditing] = useState(false)

  return (
    <Card className="bg-gradient-to-br from-success/10 to-primary/10 border-success/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-success-text font-display tracking-tight">
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
              className="flex-grow bg-transparent border-b border-success focus:outline-none"
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

// ─── Timeline for Upcoming Exams ───
function EpreuvesTimeline({ epreuves }: { epreuves: EpreuveAVenirEtudiant[] }) {
  const router = useRouter()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display tracking-tight">
          <CalendarDays className="h-5 w-5 text-success-text" />
          Épreuves à venir
        </CardTitle>
        <CardDescription>Votre planning d&apos;examens</CardDescription>
      </CardHeader>
      <CardContent>
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune épreuve planifiée.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
            {epreuves.map((exam) => (
              <motion.div key={exam.id} variants={itemVariants} className="mb-8">
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-success flex items-center justify-center -translate-x-1/2 ml-0.5">
                  <CalendarDays className="h-3 w-3 text-success-text" />
                </div>
                <p className="font-semibold">{exam.titre}</p>
                <p className="text-sm text-muted-foreground">Du {formatDateFR(exam.date)}</p>
                <p className="text-sm text-destructive font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Limite : {formatDateFR(exam.dateFin)}
                </p>
                <Button size="sm" className="mt-2" onClick={() => router.push(`/passation?epreuveId=${exam.id}`)}>
                  <Play className="mr-2 h-4 w-4" /> Commencer
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Empty Dashboard (no data yet) ───
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
        {getGreeting()}, {name} ! Bienvenue sur votre espace.
      </motion.h1>

      <ObjectiveCard />

      <Card className="border-dashed ds-kente-pattern">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <GraduationCap className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore d&apos;épreuves ou de résultats. Consultez vos épreuves pour commencer.
          </p>
          <Button
            className="mt-4 bg-success hover:bg-success/90"
            onClick={() => router.push('/mes-epreuves')}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Voir mes épreuves
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ───
export function EtudiantDashboard() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Étudiant'
  const userId = user?.id

  const statsQuery = useEtudiantDashboard(userId)
  const badgesQuery = useBadges(userId)
  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<BadgeWithProgress | null>(null)

  // POST /api/badges on mount to refresh badge progress. The onSuccess
  // callback surfaces newly unlocked badges via the notification component
  // (avoids setState in useEffect body, which is forbidden by
  // react-hooks/set-state-in-effect).
  //
  // Combined with useBadges (GET /api/badges), TanStack Query dedups the
  // requests so we no longer have the previous race condition between two
  // parallel useEffects calling setData in non-deterministic order.
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
  // Chaque épreuve produit 2 événements : 'exam' sur la date de début,
  // 'deadline' sur la date de fin (échéance de soumission).
  // Les dates invalides (NaN) sont filtrées pour éviter les warnings React.
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

  // Liste triée par date (chronologique) pour l'affichage à côté du calendrier.
  const upcomingEventsSorted: CalendarEvent[] = useMemo(
    () =>
      [...calendarEvents].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      ),
    [calendarEvents]
  )

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

  const data: EtudiantStatsData | undefined = statsQuery.data

  // ─── No data ───
  if (!data) {
    return <EmptyDashboard name={name} />
  }

  const hasNoActivity =
    data.nbEpreuvesTerminees === 0 &&
    data.epreuvesAVenir.length === 0 &&
    data.resultatsRecents.length === 0

  if (hasNoActivity) {
    return <EmptyDashboard name={name} />
  }

  // Badges viennent de useBadges (format BadgeWithProgress), pas du champ
  // basique `badges` renvoyé par /api/stats/etudiant.
  const badges: BadgeWithProgress[] = badgesQuery.data?.badges ?? []
  const unlockedBadgeCount = badges.filter((b) => b.debloque).length

  // KPI: couleur dynamique de la moyenne (déjà /20).
  const moyenneAccent =
    data.moyenne >= 10 ? 'success' : data.moyenne >= 8 ? 'warning' : 'danger'

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
          {getGreeting()}, {name} ! Bienvenue sur votre espace.
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
          icon={CalendarDays}
          label="Épreuves à venir"
          value={data.nbEpreuvesAVenir}
          accent="info"
        />
        <StatCard
          icon={Trophy}
          label="Moyenne"
          value={data.moyenne.toFixed(1)}
          suffix="/20"
          accent={moyenneAccent}
          scoreOn20={data.moyenne}
        />
        <StatCard
          icon={Star}
          label="Meilleure note"
          value={data.meilleureNote.toFixed(1)}
          suffix="/20"
          accent="secondary"
          scoreOn20={data.meilleureNote}
        />
        <StatCard
          icon={Award}
          label="Badges"
          value={unlockedBadgeCount}
          accent="secondary"
        />
      </motion.div>

      {/* ─── In-progress session alert ─── */}
      {data.sessionEnCours && (
        <motion.div variants={itemVariants}>
          <Card className="border-warning/40 bg-warning/10">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-semibold text-warning">Épreuve en cours</p>
                  <p className="text-sm text-warning">{data.sessionEnCours.epreuveTitre}</p>
                </div>
              </div>
              <Button
                className="bg-warning hover:bg-warning/90"
                onClick={() => router.push(`/passation?epreuveId=${data.sessionEnCours!.epreuveId}`)}
              >
                <Play className="mr-2 h-4 w-4" /> Reprendre
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ─── Calendrier académique + Prochaines échéances ─── */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="font-display tracking-tight">
              Calendrier académique
            </CardTitle>
            <CardDescription>
              Vos épreuves et échéances du mois
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center lg:justify-start">
            <AcademicCalendar
              events={calendarEvents}
              onDateClick={(date) => router.push('/mes-epreuves')}
              className="max-w-md w-full"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display tracking-tight">
              Prochaines échéances
            </CardTitle>
            <CardDescription>
              {calendarEvents.length} événement
              {calendarEvents.length > 1 ? 's' : ''} à venir
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {upcomingEventsSorted.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Aucune échéance planifiée.
              </p>
            ) : (
              <ul className="space-y-3">
                {upcomingEventsSorted.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/40 transition-colors"
                  >
                    <span
                      className={
                        'mt-1.5 h-2 w-2 rounded-full shrink-0 ' +
                        (ev.type === 'exam' ? 'bg-destructive' : 'bg-warning')
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">
                        {ev.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ev.type === 'exam' ? 'Début épreuve' : 'Échéance'} —{' '}
                        {formatDateFR(ev.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>

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
                title="Évolution des scores"
                icon={<TrendingUp className="h-4 w-4 text-success-text" />}
              >
                <div className="h-72">
                  {data.evolutionScores.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.evolutionScores} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="etudiantScoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="titre"
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          domain={[0, 20]}
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="url(#etudiantScoreGradient)"
                          dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm ds-kente-pattern rounded-lg">
                      Pas encore de données
                    </div>
                  )}
                </div>
              </ChartCard>
            </motion.div>

            <motion.div variants={itemVariants}>
              <ChartCard
                title="Performance par type"
                icon={<BarChart3 className="h-4 w-4 text-primary-text" />}
              >
                <div className="h-72">
                  {data.performanceParType.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.performanceParType} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                        <XAxis
                          dataKey="type"
                          tick={{ fontSize: 12, fontWeight: 600 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={[0, 20]}
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip />
                        {/* BUG FIX : entry.moyenne est DÉJÀ /20 (normalisé côté API).
                            L'ancien code multipliait par 2 → affichait du vert même
                            pour des scores < 10. Utilisation directe de getBarColor. */}
                        <Bar dataKey="moyenne" radius={[6, 6, 0, 0]}>
                          {data.performanceParType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.moyenne)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm ds-kente-pattern rounded-lg">
                      Pas encore de données
                    </div>
                  )}
                </div>
              </ChartCard>
            </motion.div>
          </div>
        </div>

        {/* ─── Sidebar (1/3) ─── */}
        <div className="lg:col-span-1 space-y-6">
          <motion.div variants={itemVariants}>
            <EpreuvesTimeline epreuves={data.epreuvesAVenir} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display tracking-tight">Résultats Récents</CardTitle>
              </CardHeader>
              <CardContent>
                {data.resultatsRecents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucun résultat pour le moment.</p>
                ) : (
                  <div className="space-y-4">
                    {data.resultatsRecents.map((result) => {
                      const scoreFinal = result.resultat?.scoreFinal ?? result.score ?? 0
                      const totalPossible = result.resultat?.totalPossible ?? 20
                      const scoreOn20 = normalizeTo20(scoreFinal, totalPossible)
                      const scorePercent = totalPossible > 0
                        ? Math.round((scoreFinal / totalPossible) * 100)
                        : 0
                      const scoreColor = getBarColor(scoreOn20)
                      return (
                        <div key={result.id} className="flex items-center">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs font-mono tabular-nums tracking-tight"
                            style={{
                              backgroundColor: `${scoreColor}20`,
                              color: scoreColor,
                            }}
                            title={`${scoreFinal}/${totalPossible} → ${scoreOn20.toFixed(1)}/20`}
                          >
                            {scorePercent}%
                          </div>
                          <div className="ml-4 flex-grow">
                            <p className="font-semibold truncate">{result.titre}</p>
                            <p className="text-sm text-muted-foreground">{formatDateFR(result.date)}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => router.push('/mes-resultats')}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Voir le résultat</span>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
