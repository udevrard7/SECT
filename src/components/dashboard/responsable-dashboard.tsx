'use client'

import {
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Info,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useAuthStore } from '@/stores/auth-store'

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

const subjectResults = [
  { subject: 'Algorithmique', moyenne: 11.8, tauxReussite: 55 },
  { subject: 'BD Avancées', moyenne: 13.2, tauxReussite: 72 },
  { subject: 'Réseaux', moyenne: 12.5, tauxReussite: 65 },
  { subject: 'Intelligence Artificielle', moyenne: 14.1, tauxReussite: 78 },
  { subject: 'Systèmes d\'exploitation', moyenne: 10.9, tauxReussite: 48 },
]

export function ResponsableDashboard() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {user?.name ?? 'Responsable'}
        </h1>
        <Badge className="w-fit bg-amber-600 text-white hover:bg-amber-700">
          Responsable de filière
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Étudiants inscrits"
          value={280}
          icon={<GraduationCap className="h-5 w-5" />}
          change={8}
          changeLabel="ce semestre"
          accentColor="#10b981"
        />
        <StatCard
          title="Évaluations ce mois"
          value={8}
          icon={<ClipboardCheck className="h-5 w-5" />}
          change={15}
          changeLabel="vs mois dernier"
          accentColor="#14b8a6"
        />
        <StatCard
          title="Taux de réussite"
          value="72%"
          icon={<TrendingUp className="h-5 w-5" />}
          change={-3}
          changeLabel="vs semestre précédent"
          accentColor="#f59e0b"
        />
        <StatCard
          title="Moyenne générale"
          value="13.4/20"
          icon={<BarChart3 className="h-5 w-5" />}
          change={2}
          changeLabel="vs semestre précédent"
          accentColor="#059669"
        />
      </div>

      {/* Chart + Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              Résultats par matière
            </CardTitle>
            <CardDescription>Moyennes et taux de réussite par matière</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectResults} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="subject"
                    tick={{ fontSize: 11 }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="moyenne" name="Moyenne /20" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tauxReussite" name="Taux réussite %" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertes
            </CardTitle>
            <CardDescription>Notifications importantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Taux d&apos;échec élevé</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Algorithmique L2 — 45% d&apos;échec au dernier contrôle
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs">
                    Voir les détails
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Évaluations à venir</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    3 évaluations prévues cette semaine
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs">
                    Consulter
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
