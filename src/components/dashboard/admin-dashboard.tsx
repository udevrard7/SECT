'use client'

import { useEffect, useState } from 'react'
import {
  Users,
  Building2,
  ClipboardCheck,
  Library,
  FileText,
  Activity,
  UserPlus,
  TrendingUp,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ───

interface AdminStats {
  nbUtilisateurs: number
  nbEtablissements: number
  nbEvaluations: number
  nbQuestions: number
  nbDocuments: number
  utilisateursParRole: Array<{ role: string; count: number }>
  epreuvesParStatut: Array<{ statut: string; count: number }>
  creationTrend: Array<{
    mois: string
    utilisateurs: number
    questions: number
    epreuves: number
  }>
  recentActivities: Array<{
    id: string
    type: string
    description: string
    time: string
  }>
  questionsParType: Array<{ type: string; count: number }>
  tauxReussiteGlobal: number
}

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  accentColor: string
}

// ─── Constants ───

const monthNames = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

const ROLE_COLORS: Record<string, string> = {
  ADMIN: '#ef4444',
  RESPONSABLE: '#f59e0b',
  ENSEIGNANT: '#10b981',
  ETUDIANT: '#14b8a6',
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  RESPONSABLE: 'Responsable',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

const TYPE_COLORS: Record<string, string> = {
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

const STATUT_COLORS: Record<string, string> = {
  BROUILLON: '#6b7280',
  PLANIFIEE: '#f59e0b',
  EN_COURS: '#10b981',
  TERMINEE: '#0ea5e9',
  CLOTUREE: '#64748b',
}

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  PLANIFIEE: 'Planifiée',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  CLOTUREE: 'Clôturée',
}

// ─── StatCard ───

function StatCard({ title, value, icon, accentColor }: StatCardProps) {
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
      </CardContent>
    </Card>
  )
}

// ─── Custom Pie Label ───

function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
  value,
}: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
  name: string
  value: number
}) {
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 28
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  if (percent < 0.03) return null

  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs fill-muted-foreground"
    >
      {name} ({value}, {`${(percent * 100).toFixed(0)}%`})
    </text>
  )
}

// ─── Activity Icon ───

function getActivityIcon(type: string) {
  switch (type) {
    case 'inscription':
      return { icon: UserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' }
    case 'soumission':
      return { icon: ClipboardCheck, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/30' }
    case 'epreuve':
      return { icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' }
    default:
      return { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted' }
  }
}

// ─── Format French month ───

function formatFrenchMonth(yyyyMm: string): string {
  const [year, mm] = yyyyMm.split('-')
  const monthIdx = parseInt(mm, 10) - 1
  return `${monthNames[monthIdx]} ${year}`
}

// ─── Custom Tooltip for Area Chart ───

function AreaChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-xs" style={{ color: entry.color }}>
          {entry.name === 'utilisateurs'
            ? 'Utilisateurs'
            : entry.name === 'questions'
              ? 'Questions'
              : 'Épreuves'}
          : {entry.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───

export function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats/admin')
        if (!res.ok) throw new Error('Erreur réseau')
        const data: AdminStats = await res.json()
        setStats(data)
      } catch {
        toast.error('Impossible de charger les statistiques')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // ─── Prepare chart data ───
  const roleData = (stats?.utilisateursParRole ?? []).map((r) => ({
    name: ROLE_LABELS[r.role] || r.role,
    value: r.count,
    color: ROLE_COLORS[r.role] || '#6b7280',
  }))

  const typeData = (stats?.questionsParType ?? []).map((t) => ({
    name: TYPE_LABELS[t.type] || t.type,
    value: t.count,
    color: TYPE_COLORS[t.type] || '#6b7280',
  }))

  const trendData = (stats?.creationTrend ?? []).map((t) => ({
    ...t,
    moisLabel: formatFrenchMonth(t.mois),
  }))

  const statutData = (stats?.epreuvesParStatut ?? []).map((s) => ({
    name: STATUT_LABELS[s.statut] || s.statut,
    count: s.count,
    fill: STATUT_COLORS[s.statut] || '#6b7280',
  }))

  const totalRole = roleData.reduce((acc, r) => acc + r.value, 0)
  const totalType = typeData.reduce((acc, t) => acc + t.value, 0)

  return (
    <div className="space-y-6">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {user?.name ?? 'Administrateur'}
        </h1>
        <Badge
          className="w-fit text-white hover:opacity-90"
          style={{ backgroundColor: '#dc2626' }}
        >
          Administrateur
        </Badge>
      </div>

      {/* ─── 2. Stats Cards Row (5 cards) ─── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-muted" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Total utilisateurs"
            value={stats?.nbUtilisateurs ?? 0}
            icon={<Users className="h-5 w-5" />}
            accentColor="#10b981"
          />
          <StatCard
            title="Établissements"
            value={stats?.nbEtablissements ?? 0}
            icon={<Building2 className="h-5 w-5" />}
            accentColor="#f59e0b"
          />
          <StatCard
            title="Évaluations"
            value={stats?.nbEvaluations ?? 0}
            icon={<ClipboardCheck className="h-5 w-5" />}
            accentColor="#14b8a6"
          />
          <StatCard
            title="Questions en banque"
            value={stats?.nbQuestions ?? 0}
            icon={<Library className="h-5 w-5" />}
            accentColor="#059669"
          />
          <StatCard
            title="Documents"
            value={stats?.nbDocuments ?? 0}
            icon={<FileText className="h-5 w-5" />}
            accentColor="#0d9488"
          />
        </div>
      )}

      {/* ─── 3. Two-column: Pie Charts ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Utilisateurs par rôle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              Utilisateurs par rôle
            </CardTitle>
            <CardDescription>Répartition des utilisateurs selon leur rôle</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Skeleton className="h-48 w-48 rounded-full" />
              </div>
            ) : roleData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                <Users className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucune donnée disponible</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={roleData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {roleData.map((entry, index) => (
                      <Cell key={`role-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `${value} (${totalRole > 0 ? ((value / totalRole) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Questions par type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Library className="h-5 w-5 text-teal-600" />
              Questions par type
            </CardTitle>
            <CardDescription>Répartition des questions selon leur type</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Skeleton className="h-48 w-48 rounded-full" />
              </div>
            ) : typeData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                <Library className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucune donnée disponible</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`type-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `${value} (${totalType > 0 ? ((value / totalType) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 4. Tendances de création (Area Chart) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Tendances de création
          </CardTitle>
          <CardDescription>Évolution mensuelle des créations sur la plateforme</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-72 items-center justify-center">
              <Skeleton className="h-56 w-full" />
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
              <TrendingUp className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">Aucune donnée de tendance disponible</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="moisLabel"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  allowDecimals={false}
                />
                <RechartsTooltip content={<AreaChartTooltip />} />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      utilisateurs: 'Utilisateurs',
                      questions: 'Questions',
                      epreuves: 'Épreuves',
                    }
                    return <span className="text-xs text-muted-foreground">{labels[value] || value}</span>
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="utilisateurs"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="questions"
                  stroke="#14b8a6"
                  fill="#14b8a6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="epreuves"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── 5. Two-column: Activity + Epreuves par statut ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Activité récente (60%) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Activité récente
            </CardTitle>
            <CardDescription>Derniers événements sur la plateforme</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !stats?.recentActivities || stats.recentActivities.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
                <Activity className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucune activité récente</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="space-y-1">
                  {stats.recentActivities.slice(0, 8).map((activity, index) => {
                    const { icon: ActivityIcon, color, bg } = getActivityIcon(activity.type)
                    return (
                      <div key={activity.id}>
                        <div className="flex items-center gap-3 py-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}
                          >
                            <ActivityIcon className={`h-4 w-4 ${color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{activity.description}</p>
                            <p className="text-xs text-muted-foreground">{activity.time}</p>
                          </div>
                        </div>
                        {index < Math.min(stats.recentActivities.length, 8) - 1 && <Separator />}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Épreuves par statut (40%) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
              Épreuves par statut
            </CardTitle>
            <CardDescription>Répartition des épreuves selon leur statut</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : statutData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                <ClipboardCheck className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucune épreuve enregistrée</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={statutData}
                  layout="vertical"
                  margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={80}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [`${value} épreuve(s)`, 'Nombre']}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
                    {statutData.map((entry, index) => (
                      <Cell key={`statut-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 6. Global Stats Card ─── */}
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
        <CardContent className="flex flex-col items-center justify-center py-8">
          {loading ? (
            <>
              <Skeleton className="mb-3 h-8 w-48" />
              <Skeleton className="h-20 w-32 rounded-2xl" />
              <Skeleton className="mt-3 h-5 w-36" />
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Performance globale
              </p>
              <div className="flex items-end gap-1">
                <span
                  className="text-6xl font-bold leading-none"
                  style={{ color: '#10b981' }}
                >
                  {stats?.tauxReussiteGlobal ?? 0}
                </span>
                <span className="mb-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  %
                </span>
              </div>
              <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                Taux de réussite global
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
