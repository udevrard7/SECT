'use client'

import { useEffect, useState } from 'react'
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Trophy,
  Clock,
  Play,
  Eye,
  Timer,
  BookOpen,
  TrendingUp,
  BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Cell,
} from 'recharts'

// ─── Types ───

interface EpreuveAVenir {
  id: string
  titre: string
  date: string
  duree: number
  enseignant: string
  nbQuestions: number
  totalPoints: number
}

interface ResultatRecent {
  id: string
  epreuveId: string
  titre: string
  enseignant: string
  date: string
  score: number
  statut: 'SOUMISE' | 'CORRIGEE'
  resultat: {
    scoreFinal: number
    detailParQuestion: unknown[]
  } | null
}

interface EvolutionScore {
  titre: string
  score: number
  date: string
}

interface PerformanceType {
  type: 'QCU' | 'QCM' | 'QRC' | 'TRS'
  moyenne: number
  nbReponses: number
}

interface SessionEnCours {
  id: string
  epreuveId: string
  epreuveTitre: string
  dateDebut: string
}

interface StatsData {
  nbEpreuvesAVenir: number
  nbEpreuvesTerminees: number
  moyenne: number
  meilleureNote: number
  epreuvesAVenir: EpreuveAVenir[]
  resultatsRecents: ResultatRecent[]
  evolutionScores: EvolutionScore[]
  performanceParType: PerformanceType[]
  sessionEnCours: SessionEnCours | null
}

// ─── Helpers ───

function getScoreColor(score: number): string {
  if (score >= 10) return '#10b981'
  if (score >= 8) return '#f59e0b'
  return '#ef4444'
}

function formatDateFR(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function abbreviateTitle(title: string, maxLen = 12): string {
  if (title.length <= maxLen) return title
  return title.substring(0, maxLen) + '…'
}

const PERFORMANCE_COLORS: Record<string, string> = {
  QCU: '#10b981',
  QCM: '#14b8a6',
  QRC: '#059669',
  TRS: '#0d9488',
}

const TYPE_LABELS: Record<string, string> = {
  QCU: 'QCU',
  QCM: 'QCM',
  QRC: 'QRC',
  TRS: 'TRS',
}

// ─── StatCard ───

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  subtitle: string
  accentColor: string
}

function StatCard({ title, value, icon, subtitle, accentColor }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">{title}</CardDescription>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accentColor}18` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

// ─── Loading Skeleton ───

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-emerald-200" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Custom Tooltip for Line Chart ───

function ScoreTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: EvolutionScore }>; label?: string }) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="text-sm font-semibold">{data.titre}</p>
      <p className="text-xs text-muted-foreground">{formatDateFR(data.date)}</p>
      <p className="mt-1 text-sm font-bold" style={{ color: '#10b981' }}>
        {data.score}/20
      </p>
    </div>
  )
}

// ─── Custom Tooltip for Bar Chart ───

function PerfTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { type: string; moyenne: number; nbReponses: number } }> }) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="text-sm font-semibold">{TYPE_LABELS[data.type] || data.type}</p>
      <p className="text-sm" style={{ color: PERFORMANCE_COLORS[data.type] || '#10b981' }}>
        Moyenne : {data.moyenne}/20
      </p>
      <p className="text-xs text-muted-foreground">{data.nbReponses} réponse(s)</p>
    </div>
  )
}

// ─── Main Component ───

export function EtudiantDashboard() {
  const user = useAuthStore((s) => s.user)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const name = user?.name ?? 'Étudiant'

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false

    async function fetchStats() {
      setLoading(true)
      try {
        const res = await fetch(`/api/stats/etudiant?userId=${user.id}`)
        if (!res.ok) {
          throw new Error('Erreur lors du chargement des statistiques')
        }
        const json = await res.json()
        if (!cancelled) {
          setData(json)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error('Impossible de charger vos statistiques')
          console.error(err)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (loading || !data) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {name}
        </h1>
        <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
          Étudiant
        </Badge>
      </div>

      {/* ─── 2. Session en cours banner ─── */}
      {data.sessionEnCours && (
        <Card className="border-2 border-emerald-500 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/30">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                <Clock className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Vous avez une épreuve en cours : {data.sessionEnCours.epreuveTitre}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Commencée le {formatDateFR(data.sessionEnCours.dateDebut)}
                </p>
              </div>
            </div>
            <Button
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
              onClick={() =>
                setCurrentPage('passation', { epreuveId: data.sessionEnCours!.epreuveId })
              }
            >
              <Play className="mr-2 h-4 w-4" />
              Reprendre
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── 3. Stats Cards Row ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Épreuves à venir"
          value={data.nbEpreuvesAVenir}
          icon={<CalendarDays className="h-5 w-5" />}
          subtitle="Prochains examens planifiés"
          accentColor="#10b981"
        />
        <StatCard
          title="Épreuves terminées"
          value={data.nbEpreuvesTerminees}
          icon={<ClipboardCheck className="h-5 w-5" />}
          subtitle="Examens déjà passés"
          accentColor="#14b8a6"
        />
        <StatCard
          title="Ma moyenne"
          value={`${data.moyenne}/20`}
          icon={<GraduationCap className="h-5 w-5" />}
          subtitle="Moyenne de vos notes"
          accentColor="#059669"
        />
        <StatCard
          title="Meilleure note"
          value={`${data.meilleureNote}/20`}
          icon={<Trophy className="h-5 w-5" />}
          subtitle="Votre meilleur score"
          accentColor="#f59e0b"
        />
      </div>

      {/* ─── 4. Two-column: Épreuves à venir + Résultats récents ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Épreuves à venir */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              Épreuves à venir
            </CardTitle>
            <CardDescription>Vos prochains examens planifiés</CardDescription>
          </CardHeader>
          <CardContent>
            {data.epreuvesAVenir.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Aucune épreuve à venir
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Vos futurs examens apparaîtront ici
                </p>
              </div>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {data.epreuvesAVenir.map((exam) => (
                  <div
                    key={exam.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold">{exam.titre}</h4>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDateFR(exam.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {exam.duree} min
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {exam.nbQuestions} question{exam.nbQuestions !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" />
                            {exam.enseignant}
                          </span>
                          <span className="flex items-center gap-1">
                            <Trophy className="h-3 w-3" />
                            {exam.totalPoints} pts
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() =>
                          setCurrentPage('passation', { epreuveId: exam.id })
                        }
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        Commencer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Résultats récents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-teal-600" />
              Résultats récents
            </CardTitle>
            <CardDescription>Vos dernières notes obtenues</CardDescription>
          </CardHeader>
          <CardContent>
            {data.resultatsRecents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Trophy className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Aucun résultat
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Vos notes apparaîtront ici après vos examens
                </p>
              </div>
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {data.resultatsRecents.map((result, index) => {
                  const scoreVal = result.resultat?.scoreFinal ?? result.score
                  const scoreColor = getScoreColor(scoreVal)

                  return (
                    <div key={result.id}>
                      <div className="flex items-center gap-3 py-3">
                        {/* Score circle */}
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                          style={{
                            backgroundColor: `${scoreColor}18`,
                            color: scoreColor,
                            border: `2px solid ${scoreColor}40`,
                          }}
                        >
                          {scoreVal}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{result.titre}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDateFR(result.date)}</span>
                            <span>·</span>
                            <span>{result.enseignant}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{
                                borderColor: scoreColor,
                                color: scoreColor,
                              }}
                            >
                              {scoreVal}/20
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {result.statut === 'CORRIGEE' ? 'Corrigé' : 'En attente'}
                            </Badge>
                          </div>
                        </div>
                        {/* Detail button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-teal-600 hover:text-teal-700"
                          onClick={() => setCurrentPage('mes-resultats')}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          Voir détail
                        </Button>
                      </div>
                      {index < data.resultatsRecents.length - 1 && <Separator />}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 5. Two-column: Charts ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Évolution des scores (Line Chart) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Évolution des scores
            </CardTitle>
            <CardDescription>Votre progression au fil des épreuves</CardDescription>
          </CardHeader>
          <CardContent>
            {data.evolutionScores.length < 2 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Pas assez de données
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  L&apos;évolution s&apos;affichera après au moins 2 épreuves
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.evolutionScores}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
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
                      ticks={[0, 5, 10, 15, 20]}
                    />
                    <Tooltip content={<ScoreTooltip />} />
                    <ReferenceLine
                      y={10}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Moyenne',
                        position: 'right',
                        fill: '#ef4444',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fill="url(#scoreGradient)"
                      dot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Performance par type de question (Bar Chart) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-600" />
              Performance par type de question
            </CardTitle>
            <CardDescription>Votre moyenne selon le type de question</CardDescription>
          </CardHeader>
          <CardContent>
            {data.performanceParType.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Aucune donnée disponible
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Les statistiques s&apos;afficheront après vos premières réponses
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.performanceParType.map((p) => ({
                      ...p,
                      typeLabel: TYPE_LABELS[p.type] || p.type,
                    }))}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis
                      dataKey="typeLabel"
                      tick={{ fontSize: 12, fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 20]}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      ticks={[0, 5, 10, 15, 20]}
                    />
                    <Tooltip content={<PerfTooltip />} />
                    <Bar dataKey="moyenne" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {data.performanceParType.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PERFORMANCE_COLORS[entry.type] || '#10b981'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

