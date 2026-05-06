'use client'

import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Clock,
  Play,
  Eye,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Timer,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
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
import { Progress } from '@/components/ui/progress'

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  change: number
  changeLabel: string
  accentColor: string
}

function StatCard({ title, value, icon, change, changeLabel, accentColor }: StatCardProps) {
  const isPositive = change >= 0

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
        <div className="mt-1 flex items-center gap-1 text-xs">
          {isPositive ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-red-500" />
          )}
          <span className={isPositive ? 'text-emerald-600' : 'text-red-500'}>
            {Math.abs(change)}%
          </span>
          <span className="text-muted-foreground">{changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  )
}

interface UpcomingExam {
  id: string
  name: string
  date: string
  time: string
  duration: string
  location: string
  available: boolean
}

const upcomingExams: UpcomingExam[] = [
  {
    id: '1',
    name: 'Algorithmique L2 - Contrôle 2',
    date: '15/06/2026',
    time: '10:00',
    duration: '90 min',
    location: 'Salle B204',
    available: false,
  },
  {
    id: '2',
    name: 'BD Avancées - Partiel',
    date: '18/06/2026',
    time: '14:00',
    duration: '120 min',
    location: 'Amphi A',
    available: false,
  },
]

interface RecentResult {
  id: string
  name: string
  date: string
  score: number
  total: number
}

const recentResults: RecentResult[] = [
  {
    id: '1',
    name: 'Algorithmique L2 - Contrôle 1',
    date: '02/06/2026',
    score: 15,
    total: 20,
  },
  {
    id: '2',
    name: 'Réseaux - TD3',
    date: '28/05/2026',
    score: 12,
    total: 20,
  },
  {
    id: '3',
    name: 'BD Avancées - Contrôle continu',
    date: '20/05/2026',
    score: 16.5,
    total: 20,
  },
]

function getScoreColor(score: number, total: number): string {
  const pct = (score / total) * 100
  if (pct >= 70) return '#10b981'
  if (pct >= 50) return '#f59e0b'
  return '#ef4444'
}

function getScoreLabel(score: number, total: number): string {
  const pct = (score / total) * 100
  if (pct >= 70) return 'Bon'
  if (pct >= 50) return 'Moyen'
  return 'Insuffisant'
}

export function EtudiantDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Étudiant'
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {name}
        </h1>
        <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
          Étudiant
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Épreuves à venir"
          value={2}
          icon={<CalendarDays className="h-5 w-5" />}
          change={0}
          changeLabel="cette semaine"
          accentColor="#10b981"
        />
        <StatCard
          title="Épreuves terminées"
          value={5}
          icon={<ClipboardCheck className="h-5 w-5" />}
          change={25}
          changeLabel="ce mois"
          accentColor="#14b8a6"
        />
        <StatCard
          title="Moyenne"
          value="14.2/20"
          icon={<GraduationCap className="h-5 w-5" />}
          change={5}
          changeLabel="vs semestre précédent"
          accentColor="#059669"
        />
      </div>

      {/* Upcoming Exams + Recent Results */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming Exams */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              Épreuves à venir
            </CardTitle>
            <CardDescription>Vos prochains examens planifiés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingExams.map((exam, index) => (
                <div key={exam.id}>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold">{exam.name}</h4>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {exam.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {exam.time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {exam.duration}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {exam.location}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!exam.available}
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        Commencer
                      </Button>
                    </div>
                  </div>
                  {index < upcomingExams.length - 1 && (
                    <Separator className="mt-4" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-teal-600" />
              Résultats récents
            </CardTitle>
            <CardDescription>Vos dernières notes obtenues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recentResults.map((result, index) => {
                const scoreColor = getScoreColor(result.score, result.total)
                const scorePct = (result.score / result.total) * 100

                return (
                  <div key={result.id}>
                    <div className="flex items-center gap-3 py-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                        style={{
                          backgroundColor: `${scoreColor}18`,
                          color: scoreColor,
                        }}
                      >
                        {result.score}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{result.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Progress
                            value={scorePct}
                            className="h-1.5 flex-1"
                          />
                          <span
                            className="text-xs font-medium"
                            style={{ color: scoreColor }}
                          >
                            {getScoreLabel(result.score, result.total)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-teal-600 hover:text-teal-700"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Détail
                      </Button>
                    </div>
                    {index < recentResults.length - 1 && <Separator />}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
