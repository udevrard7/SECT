'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Sparkles,
  ClipboardPen,
  Clock,
  Users,
  Plus,
  BarChart3,
  TrendingUp,
  Inbox,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ───

interface StatsData {
  nbDocuments: number
  nbQuestionsTotal: number
  nbQuestionsValidees: number
  nbEpreuves: number
  nbEpreuvesActives: number
  nbCorrectionsEnAttente: number
  pendingCorrections: {
    sessionId: string
    etudiantNom: string
    etudiantEmail: string
    epreuveTitre: string
    questionType: 'QRC' | 'TRS'
    questionPreview: string
  }[]
  recentEpreuves: {
    id: string
    titre: string
    date: string
    statut: string
    nbParticipants: number
    tauxReussite: number
  }[]
  questionsParType: { type: string; count: number }[]
  questionsParDifficulte: { difficulte: string; count: number }[]
  epreuvesParMois: Record<string, number>
  tauxReussiteMoyen: number
  moyenneGenerale: number
  performanceParEpreuve: {
    titre: string
    moyenne: number
    tauxReussite: number
    nbParticipants: number
  }[]
}

// ─── Stat Card ───

interface StatCardProps {
  title: string
  value: number | string
  subText?: string
  icon: React.ReactNode
  accentColor: string
}

function StatCard({ title, value, subText, icon, accentColor }: StatCardProps) {
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
        {subText && (
          <p className="mt-1 text-xs text-muted-foreground">{subText}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Status badge helpers ───

function getStatutBadgeClasses(statut: string): string {
  switch (statut) {
    case 'BROUILLON':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-100'
    case 'PLANIFIEE':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 hover:bg-amber-100'
    case 'EN_COURS':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-100'
    case 'TERMINEE':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 hover:bg-sky-100'
    case 'CLOTUREE':
      return 'bg-muted text-muted-foreground hover:bg-muted'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getStatutLabel(statut: string): string {
  switch (statut) {
    case 'BROUILLON':
      return 'Brouillon'
    case 'PLANIFIEE':
      return 'Planifiée'
    case 'EN_COURS':
      return 'En cours'
    case 'TERMINEE':
      return 'Terminée'
    case 'CLOTUREE':
      return 'Clôturée'
    default:
      return statut
  }
}

// ─── Color maps ───

const TYPE_COLORS: Record<string, string> = {
  QCU: '#10b981',
  QCM: '#14b8a6',
  QRC: '#059669',
  TRS: '#0d9488',
}

const DIFFICULTE_COLORS: Record<string, string> = {
  FACILE: '#10b981',
  MOYEN: '#14b8a6',
  DIFFICILE: '#f59e0b',
  EXPERT: '#ef4444',
}

const DIFFICULTE_ORDER = ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT']
const DIFFICULTE_LABELS: Record<string, string> = {
  FACILE: 'Facile',
  MOYEN: 'Moyen',
  DIFFICILE: 'Difficile',
  EXPERT: 'Expert',
}

// ─── Custom chart tooltip ───

function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-mono font-medium">
            {item.name === 'Moyenne (/20)' ? `${item.value}/20` : `${item.value}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Loading skeleton ───

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-muted" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function EnseignantDashboard() {
  const user = useAuthStore((s) => s.user)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const name = user?.name ?? 'Enseignant'
  const userId = user?.id

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/stats/enseignant?userId=${userId}`, { headers: getAuthHeaders() })
        if (!res.ok) {
          throw new Error('Erreur lors du chargement des statistiques')
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error(err)
        toast.error('Impossible de charger les statistiques du tableau de bord')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId])

  if (loading || !data) {
    return <DashboardSkeleton />
  }

  // ─── Prepare chart data ───

  const performanceData = data.performanceParEpreuve.map((ep) => ({
    titre: ep.titre,
    moyenne: ep.moyenne,
    tauxReussite: ep.tauxReussite,
  }))

  const pieData = data.questionsParType.map((q) => ({
    name: q.type,
    value: q.count,
  }))

  const totalQuestions = data.questionsParType.reduce((acc, q) => acc + q.count, 0)

  const diffData = DIFFICULTE_ORDER.map((d) => {
    const found = data.questionsParDifficulte.find((q) => q.difficulte === d)
    return {
      difficulte: DIFFICULTE_LABELS[d] || d,
      count: found?.count ?? 0,
      fill: DIFFICULTE_COLORS[d],
    }
  })

  const formatDate = (isoDate: string) => {
    try {
      return new Date(isoDate).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return isoDate
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {name}
        </h1>
        <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
          Enseignant
        </Badge>
      </div>

      {/* ─── 2. Stats Cards Row ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Mes documents"
          value={data.nbDocuments}
          icon={<FileText className="h-5 w-5" />}
          accentColor="#10b981"
        />
        <StatCard
          title="Questions générées"
          value={data.nbQuestionsTotal}
          subText={`${data.nbQuestionsValidees} validées`}
          icon={<Sparkles className="h-5 w-5" />}
          accentColor="#14b8a6"
        />
        <StatCard
          title="Épreuves actives"
          value={`${data.nbEpreuvesActives} / ${data.nbEpreuves}`}
          subText="actives / totales"
          icon={<ClipboardPen className="h-5 w-5" />}
          accentColor="#059669"
        />
        <StatCard
          title="En attente correction"
          value={data.nbCorrectionsEnAttente}
          subText="réponses à corriger"
          icon={<Clock className="h-5 w-5" />}
          accentColor="#f59e0b"
        />
      </div>

      {/* ─── Quick Action Buttons ─── */}
      <div className="flex flex-wrap gap-3">
        <Button
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setCurrentPage('documents')}
        >
          <FileText className="h-4 w-4" />
          Nouveau document
        </Button>
        <Button
          className="gap-2 bg-teal-600 hover:bg-teal-700"
          onClick={() => setCurrentPage('questions-ia')}
        >
          <Sparkles className="h-4 w-4" />
          Générer des questions
        </Button>
        <Button
          variant="outline"
          className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
          onClick={() => setCurrentPage('epreuves')}
        >
          <ClipboardPen className="h-4 w-4" />
          Créer une épreuve
        </Button>
      </div>

      {/* ─── 3. Charts Row: Performance + Questions par type ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left (60%) — Performance par épreuve */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              Performance par épreuve
            </CardTitle>
            <CardDescription>Moyenne et taux de réussite par épreuve terminée</CardDescription>
          </CardHeader>
          <CardContent>
            {performanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={performanceData} barGap={4} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis
                    dataKey="titre"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 20]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value: string) => <span className="text-foreground">{value}</span>}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="moyenne"
                    name="Moyenne (/20)"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="tauxReussite"
                    name="Taux de réussite (%)"
                    fill="#14b8a6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune épreuve terminée pour le moment</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right (40%) — Questions par type (Donut) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-600" />
              Questions par type
            </CardTitle>
            <CardDescription>Répartition de vos questions par catégorie</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 && totalQuestions > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={TYPE_COLORS[entry.name] || '#94a3b8'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const pct = totalQuestions > 0 ? Math.round((value / totalQuestions) * 100) : 0
                        return [`${value} (${pct}%)`, name]
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend below */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: TYPE_COLORS[entry.name] || '#94a3b8' }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-medium">{entry.value}</span>
                      <span className="text-muted-foreground">
                        ({totalQuestions > 0 ? Math.round((entry.value / totalQuestions) * 100) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-muted-foreground">
                <Sparkles className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune question pour le moment</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 4. Recent evaluations + Pending corrections ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left (60%) — Évaluations récentes */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-teal-600" />
              Évaluations récentes
            </CardTitle>
            <CardDescription>Vos dernières épreuves créées</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentEpreuves.length > 0 ? (
              <div>
                {/* Table Header */}
                <div className="mb-3 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
                  <div className="col-span-4">Épreuve</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-2">Statut</div>
                  <div className="col-span-2 text-center">Participants</div>
                  <div className="col-span-2 text-right">Réussite</div>
                </div>
                <div className="space-y-1">
                  {data.recentEpreuves.map((ep, index) => (
                    <div key={ep.id}>
                      <div className="grid grid-cols-12 items-center gap-2 py-3">
                        <div className="col-span-4 truncate text-sm font-medium">
                          {ep.titre}
                        </div>
                        <div className="col-span-2 text-sm text-muted-foreground">
                          {formatDate(ep.date)}
                        </div>
                        <div className="col-span-2">
                          <Badge
                            variant="outline"
                            className={getStatutBadgeClasses(ep.statut)}
                          >
                            {getStatutLabel(ep.statut)}
                          </Badge>
                        </div>
                        <div className="col-span-2 text-center text-sm">
                          {ep.nbParticipants}
                        </div>
                        <div className="col-span-2 text-right text-sm font-medium">
                          {ep.tauxReussite}%
                        </div>
                      </div>
                      {index < data.recentEpreuves.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
                <Inbox className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune épreuve créée pour le moment</p>
                <Button
                  variant="link"
                  className="mt-1 text-emerald-600"
                  onClick={() => setCurrentPage('epreuves')}
                >
                  Créer votre première épreuve
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right (40%) — Corrections en attente */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Corrections en attente
            </CardTitle>
            <CardDescription>
              Réponses QRC / TRS nécessitant votre relecture
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.pendingCorrections.length > 0 ? (
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                {data.pendingCorrections.map((correction, index) => (
                  <div key={`${correction.sessionId}-${index}`}>
                    <div className="flex items-start gap-3 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium">{correction.etudiantNom}</p>
                          <Badge
                            variant="outline"
                            className="text-xs border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                          >
                            {correction.epreuveTitre}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {correction.questionPreview}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-xs"
                        style={{
                          borderColor: TYPE_COLORS[correction.questionType] || '#94a3b8',
                          color: TYPE_COLORS[correction.questionType] || '#94a3b8',
                        }}
                      >
                        {correction.questionType}
                      </Badge>
                    </div>
                    {index < data.pendingCorrections.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
                <CheckCircleIcon className="mb-2 h-10 w-10 opacity-40 text-emerald-500" />
                <p className="text-sm">Aucune correction en attente</p>
                <p className="text-xs text-muted-foreground">Tout est à jour !</p>
              </div>
            )}
            {data.pendingCorrections.length > 0 && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                  onClick={() => setCurrentPage('correction')}
                >
                  <ClipboardPen className="h-4 w-4" />
                  Corriger
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 5. Questions par difficulté (Horizontal Bar Chart) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            Questions par difficulté
          </CardTitle>
          <CardDescription>Répartition de vos questions selon le niveau de difficulté</CardDescription>
        </CardHeader>
        <CardContent>
          {diffData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={diffData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="difficulte"
                  tick={{ fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number) => [`${value} question${value > 1 ? 's' : ''}`, 'Nombre']}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {diffData.map((entry, index) => (
                    <Cell key={`cell-diff-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
              <Plus className="mb-2 h-10 w-10 opacity-40" />
              <p className="text-sm">Aucune question pour le moment</p>
              <Button
                variant="link"
                className="mt-1 text-emerald-600"
                onClick={() => setCurrentPage('questions-ia')}
              >
                Générer des questions via l&apos;IA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Small helper icon component ───
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
