'use client'

import { useEffect, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/resultats/kpi-card'
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
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
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
    <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-200 dark:border-emerald-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
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
              className="flex-grow bg-transparent border-b border-emerald-500 focus:outline-none text-lg font-semibold"
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
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
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
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-emerald-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                  <CalendarDays className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="font-semibold truncate" title={exam.titre}>{exam.titre}</p>
                <p className="text-sm text-muted-foreground">Du {formatDateFR(exam.date)}</p>
                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Limite : {formatDateFR(exam.dateFin)}</span>
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <UiBadge variant="outline" className="text-[10px] shrink-0">{exam.statut}</UiBadge>
                  <span className="text-xs text-muted-foreground">{exam.nbParticipants} participant{exam.nbParticipants !== 1 ? 's' : ''}</span>
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
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-600" />
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
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs"
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
                      {epreuve.nbParticipants} participant{epreuve.nbParticipants !== 1 ? 's' : ''} · {formatDateFR(epreuve.date)}
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
      <motion.h1 variants={itemVariants} className="text-2xl font-bold tracking-tight md:text-3xl">
        Bonjour, {name} ! Bienvenue sur votre espace.
      </motion.h1>
      <ObjectiveCard />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <ClipboardPen className="h-10 w-10 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore créé d&apos;épreuves. Commencez par créer votre première évaluation.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.h1 variants={itemVariants} className="text-2xl font-bold tracking-tight md:text-3xl">
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
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={FileText}
          label="Documents"
          value={data.nbDocuments}
          accentColor="emerald"
        />
        <KpiCard
          icon={BookOpen}
          label="Questions"
          value={data.nbQuestionsTotal}
          accentColor="teal"
        />
        <KpiCard
          icon={CalendarDays}
          label="Épreuves actives"
          value={data.nbEpreuvesActives}
          accentColor="amber"
        />
        <KpiCard
          icon={ClipboardPen}
          label="Corrections en attente"
          value={data.nbCorrectionsEnAttente}
          accentColor="red"
        />
      </motion.div>

      {/* ─── Pending corrections alert ─── */}
      {data.nbCorrectionsEnAttente > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                  <MessageSquareWarning className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {data.nbCorrectionsEnAttente} correction{data.nbCorrectionsEnAttente !== 1 ? 's' : ''} en attente
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Des étudiants ont soumis des réponses à évaluer
                  </p>
                </div>
              </div>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
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
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              >
                <div className="h-72">
                  <EvolutionChart data={evolutionData} height={288} />
                </div>
              </ChartCard>
            </motion.div>

            <motion.div variants={itemVariants}>
              <ChartCard
                title="Performance par épreuve"
                icon={<BarChart3 className="h-4 w-4 text-teal-600" />}
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
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5" />
                  Flux d&apos;Activité
                </CardTitle>
                <CardDescription>Les dernières soumissions de vos étudiants.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[300px] overflow-y-auto">
                {data.pendingCorrections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <CheckCircle className="h-10 w-10 text-emerald-500 mb-2" />
                    <p className="font-semibold">Boîte de réception vide</p>
                    <p className="text-sm text-muted-foreground">Aucune nouvelle soumission à corriger.</p>
                  </div>
                ) : (
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
                    {data.pendingCorrections.map((item, index) => (
                      <motion.div key={item.sessionId + index} variants={itemVariants} className="mb-6 last:mb-0">
                        <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-amber-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                          <MessageSquareWarning className="h-3 w-3 text-amber-500" />
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
