'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Info,
  Trophy,
  BookOpen,
  BookMarked,
  UserCheck,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
} from 'recharts'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ───

interface RepartitionNote {
  label: string
  count: number
}

interface ResultatMatiere {
  titre: string
  enseignant: string
  moyenne: number
  tauxReussite: number
  nbParticipants: number
}

interface EtudiantFiliere {
  filiere: string
  count: number
}

interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

interface TopEnseignant {
  nom: string
  nbEpreuves: number
  moyenne: number
  tauxReussite: number
}

interface Alerte {
  type: string
  titre: string
  description: string
  severity: 'critical' | 'warning' | 'info'
}

interface ChargeEnseignant {
  enseignantId: string
  enseignantNom: string
  totalHeures: number
  nbUEs: number
  statut: string
}

interface AffectationParNiveau {
  niveau: string
  nbUEs: number
  nbAffectations: number
  tauxCouverture: number
}

interface StatsData {
  nbEtudiants: number
  nbEnseignants: number
  nbEvaluations: number
  tauxReussiteGlobal: number
  moyenneGenerale: number
  repartitionNotes: RepartitionNote[]
  resultatsParMatiere: ResultatMatiere[]
  etudiantsParFiliere: EtudiantFiliere[]
  evolutionMoyennes: EvolutionMoyenne[]
  topEnseignants: TopEnseignant[]
  alertes: Alerte[]
  nbUnitesEnseignement: number
  nbAffectations: number
  nbAffectationsValidees: number
  tauxCouvertureAffectations: number
  chargeEnseignants: ChargeEnseignant[]
  affectationsParNiveau: AffectationParNiveau[]
}

// ─── Helpers ───

const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function formatMonth(mois: string): string {
  const [year, month] = mois.split('-')
  const mIdx = parseInt(month, 10) - 1
  return `${monthNames[mIdx]} ${year}`
}

function abbreviateTitle(titre: string, maxLen = 14): string {
  if (titre.length <= maxLen) return titre
  return titre.substring(0, maxLen - 1) + '…'
}

// ─── Note colors ───

const noteBarColors: Record<string, string> = {
  '0-4': '#ef4444',
  '4-8': '#f59e0b',
  '8-10': '#d97706',
  '10-12': '#10b981',
  '12-14': '#059669',
  '14-16': '#14b8a6',
  '16-20': '#0d9488',
}

// ─── Pie colors (emerald/teal/amber tones) ───

const pieColors = ['#10b981', '#14b8a6', '#0d9488', '#059669', '#d97706', '#f59e0b', '#047857', '#0f766e']

// ─── StatCard ───

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  accentColor: string
  subtitle: string
}

function StatCard({ title, value, icon, accentColor, subtitle }: StatCardProps) {
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

// ─── Custom Tooltips ───

function SubjectTooltip({ active, payload, data }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string; payload?: Record<string, unknown> }>
  data?: ResultatMatiere[]
}) {
  if (!active || !payload || !payload.length) return null
  const idx = payload[0]?.payload ? data?.findIndex(
    (d) => d.titre === (payload[0].payload as Record<string, unknown>).titre
  ) : -1
  const enseignant = idx !== undefined && idx >= 0 && data ? data[idx].enseignant : ''

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{(payload[0].payload as Record<string, unknown>).titre as string}</p>
      {enseignant && <p className="text-xs text-muted-foreground mb-2">Enseignant : {enseignant}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">
            {entry.dataKey === 'moyenne' ? 'Moyenne' : 'Taux réussite'} :
          </span>
          <span className="font-medium">
            {entry.value}{entry.dataKey === 'moyenne' ? '/20' : '%'}
          </span>
        </div>
      ))}
    </div>
  )
}

function NotesTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; payload: { label: string; count: number } }>
}) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold">Notes : {d.label}</p>
      <p className="text-muted-foreground">{d.count} étudiant(s)</p>
    </div>
  )
}

function EvolutionTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { mois: string; moyenne: number; nbEvaluations: number } }>
}) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold">{formatMonth(d.mois)}</p>
      <p>Moyenne : <span className="font-medium">{d.moyenne}/20</span></p>
      <p className="text-muted-foreground">{d.nbEvaluations} évaluation(s)</p>
    </div>
  )
}

function CoverageTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { niveau: string; tauxCouverture: number; nbUEs: number; nbAffectations: number } }>
}) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold">{d.niveau}</p>
      <p>Taux de couverture : <span className="font-medium">{d.tauxCouverture}%</span></p>
      <p className="text-muted-foreground">{d.nbUEs} UE · {d.nbAffectations} affectation(s)</p>
    </div>
  )
}

// ─── Loading Skeleton ───

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-1 bg-muted" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader>
          <CardContent><Skeleton className="h-72 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-48" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader>
          <CardContent><Skeleton className="h-72 w-full" /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-40" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full" />))}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-5 w-44" /></CardHeader>
          <CardContent><Skeleton className="h-72 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-72 w-full" /></CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-5 w-52" /></CardHeader>
          <CardContent><Skeleton className="h-72 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Alert component ───

function AlertCard({ alerte }: { alerte: Alerte }) {
  const config = {
    critical: {
      border: 'border-destructive/30',
      bg: 'bg-destructive/5',
      icon: <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      titleClass: 'text-destructive',
    },
    warning: {
      border: 'border-amber-300',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />,
      titleClass: 'text-amber-700 dark:text-amber-500',
    },
    info: {
      border: 'border-sky-300',
      bg: 'bg-sky-50 dark:bg-sky-950/20',
      icon: <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />,
      titleClass: 'text-sky-700 dark:text-sky-500',
    },
  }
  const c = config[alerte.severity] || config.info

  return (
    <div className={`rounded-lg border p-3 ${c.border} ${c.bg}`}>
      <div className="flex items-start gap-2">
        {c.icon}
        <div className="min-w-0">
          <p className={`text-sm font-medium ${c.titleClass}`}>{alerte.titre}</p>
          <p className="text-xs text-muted-foreground mt-1">{alerte.description}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Teacher Workload Row ───

function TeacherWorkloadRow({ teacher }: { teacher: ChargeEnseignant }) {
  // Color: green (normal load ≤30h), amber (high load 30-40h), red (overloaded >40h)
  let loadColor: string
  let loadLabel: string
  if (teacher.totalHeures > 40) {
    loadColor = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
    loadLabel = 'Surchargé'
  } else if (teacher.totalHeures > 30) {
    loadColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    loadLabel = 'Charge élevée'
  } else {
    loadColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
    loadLabel = 'Normal'
  }

  // Progress bar width
  const maxHours = 50
  const widthPct = Math.min((teacher.totalHeures / maxHours) * 100, 100)
  const barColor = teacher.totalHeures > 40 ? 'bg-red-500' : teacher.totalHeures > 30 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <p className="truncate text-sm font-medium">{teacher.enseignantNom}</p>
          <Badge className={`text-xs shrink-0 ${loadColor}`}>{loadLabel}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all`}
              style={{ width: `${widthPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {teacher.totalHeures}h · {teacher.nbUEs} UE{teacher.nbUEs > 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function ResponsableDashboard() {
  const user = useAuthStore((s) => s.user)
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
      if (user?.filiere?.id) params.set('filiereId', user.filiere.id)
      else if (user?.filiereId) params.set('filiereId', user.filiereId)
      const url = params.toString()
        ? `/api/stats/responsable?${params.toString()}`
        : '/api/stats/responsable'
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur réseau')
      const json: StatsData = await res.json()
      setData(json)
    } catch {
      toast.error('Impossible de charger les statistiques')
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.filiere?.id, user?.filiereId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <DashboardSkeleton />
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Bonjour, {user?.name ?? 'Responsable'}
          </h1>
          <Badge className="w-fit text-white hover:opacity-90" style={{ backgroundColor: '#d97706' }}>
            Responsable des études
          </Badge>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold">Aucune donnée disponible</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Les statistiques apparaîtront une fois que des évaluations seront réalisées.
          </p>
        </div>
      </div>
    )
  }

  // ─── Compute KPI values ───
  const tauxCouvertureValue = data.tauxCouvertureAffectations ?? 0
  const tauxCouvertureColor = tauxCouvertureValue >= 80 ? '#10b981' : tauxCouvertureValue >= 50 ? '#f59e0b' : '#ef4444'

  // ─── Affectation coverage bar data ───
  const coverageBarData = (data.affectationsParNiveau ?? []).map((n) => ({
    ...n,
    fill: n.tauxCouverture >= 80 ? '#10b981' : n.tauxCouverture >= 50 ? '#f59e0b' : '#ef4444',
  }))

  // ─── Teacher workload (top 8) ───
  const teacherWorkload = (data.chargeEnseignants ?? []).slice(0, 8)

  return (
    <div className="space-y-6">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {user?.name ?? 'Responsable'}
        </h1>
        <Badge className="w-fit text-white hover:opacity-90" style={{ backgroundColor: '#d97706' }}>
          Responsable des études
        </Badge>
      </div>

      {/* ─── 2. KPI Cards (3x2 grid) ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Étudiants inscrits"
          value={data.nbEtudiants}
          icon={<GraduationCap className="h-5 w-5" />}
          accentColor="#10b981"
          subtitle="Total des étudiants dans vos filières"
        />
        <StatCard
          title="Enseignants"
          value={data.nbEnseignants}
          icon={<BookOpen className="h-5 w-5" />}
          accentColor="#14b8a6"
          subtitle="Enseignants affectés à vos filières"
        />
        <StatCard
          title="Unités d'enseignement"
          value={data.nbUnitesEnseignement ?? 0}
          icon={<BookMarked className="h-5 w-5" />}
          accentColor="#f59e0b"
          subtitle="UEs actives dans vos filières"
        />
        <StatCard
          title="Taux de couverture"
          value={`${tauxCouvertureValue}%`}
          icon={<UserCheck className="h-5 w-5" />}
          accentColor={tauxCouvertureColor}
          subtitle="UEs avec au moins une affectation"
        />
        <StatCard
          title="Taux de réussite"
          value={`${data.tauxReussiteGlobal}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accentColor="#10b981"
          subtitle="Étudiants avec note ≥ 10/20"
        />
        <StatCard
          title="Moyenne générale"
          value={`${data.moyenneGenerale}/20`}
          icon={<BarChart3 className="h-5 w-5" />}
          accentColor="#14b8a6"
          subtitle="Moyenne de toutes les épreuves"
        />
      </div>

      {/* ─── 3. Affectation Coverage Chart + Teacher Workload ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Horizontal BarChart by niveau */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Couverture par niveau
            </CardTitle>
            <CardDescription>
              Taux d&apos;affectation des UEs par niveau d&apos;étude
            </CardDescription>
          </CardHeader>
          <CardContent>
            {coverageBarData.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
                <UserCheck className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune donnée de couverture disponible</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={coverageBarData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="niveau" tick={{ fontSize: 12 }} width={70} />
                    <Tooltip content={<CoverageTooltip />} />
                    <Bar
                      dataKey="tauxCouverture"
                      name="Taux de couverture"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={32}
                    >
                      {coverageBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Teacher Workload List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-600" />
              Charge enseignants
            </CardTitle>
            <CardDescription>
              Volume horaire et nombre d&apos;UEs par enseignant
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teacherWorkload.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BookOpen className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune affectation enregistrée</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {teacherWorkload.map((teacher) => (
                  <TeacherWorkloadRow key={teacher.enseignantId} teacher={teacher} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 4. Results by Subject + Alerts ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left 60% — Bar Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              Résultats par matière
            </CardTitle>
            <CardDescription>Moyennes et taux de réussite par matière</CardDescription>
          </CardHeader>
          <CardContent>
            {data.resultatsParMatiere.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
                <BookOpen className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucun résultat disponible</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.resultatsParMatiere.map((r) => ({
                      ...r,
                      titreCourt: abbreviateTitle(r.titre),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="titreCourt"
                      tick={{ fontSize: 11 }}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={<SubjectTooltip data={data.resultatsParMatiere} />}
                    />
                    <Legend />
                    <Bar
                      dataKey="moyenne"
                      name="Moyenne /20"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="tauxReussite"
                      name="Taux réussite %"
                      fill="#14b8a6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right 40% — Alertes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertes
            </CardTitle>
            <CardDescription>Notifications importantes</CardDescription>
          </CardHeader>
          <CardContent>
            {data.alertes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Info className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">Aucune alerte en cours</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {data.alertes.map((alerte, i) => (
                  <AlertCard key={i} alerte={alerte} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 5. Score Distribution + Students per Filière ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Histogram */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              Répartition des notes
            </CardTitle>
            <CardDescription>Distribution des étudiants par tranche de notes</CardDescription>
          </CardHeader>
          <CardContent>
            {data.repartitionNotes.every((r) => r.count === 0) ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
                <BarChart3 className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune donnée disponible</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.repartitionNotes}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<NotesTooltip />} />
                    <Bar dataKey="count" name="Étudiants" radius={[4, 4, 0, 0]}>
                      {data.repartitionNotes.map((entry) => (
                        <Cell key={entry.label} fill={noteBarColors[entry.label] || '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Pie/Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-teal-600" />
              Étudiants par filière
            </CardTitle>
            <CardDescription>Répartition des étudiants across les filières</CardDescription>
          </CardHeader>
          <CardContent>
            {data.etudiantsParFiliere.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
                <GraduationCap className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune filière enregistrée</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.etudiantsParFiliere}
                      dataKey="count"
                      nameKey="filiere"
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      label={({ filiere, count }) => `${filiere} (${count})`}
                    >
                      {data.etudiantsParFiliere.map((_, i) => (
                        <Cell key={i} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} étudiants`, name]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => (
                        <span className="text-xs">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 6. Score Evolution + Top Teachers ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Évolution des moyennes
            </CardTitle>
            <CardDescription>Tendance des moyennes au fil des mois</CardDescription>
          </CardHeader>
          <CardContent>
            {data.evolutionMoyennes.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune donnée disponible</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.evolutionMoyennes.map((e) => ({
                      ...e,
                      moisLabel: formatMonth(e.mois),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="moisLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={[0, 20]}
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <Tooltip content={<EvolutionTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="moyenne"
                      stroke="#10b981"
                      fill="url(#emeraldGradient)"
                      strokeWidth={0}
                    />
                    <Line
                      type="monotone"
                      dataKey="moyenne"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#059669', strokeWidth: 2, stroke: '#fff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Top enseignants */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Top enseignants
            </CardTitle>
            <CardDescription>Les enseignants les plus performants</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topEnseignants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Trophy className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucun enseignant avec épreuve</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.topEnseignants.map((ens, i) => {
                  const rankBg = i === 0
                    ? 'bg-amber-500 text-white'
                    : i === 1
                      ? 'bg-amber-400 text-white'
                      : i === 2
                        ? 'bg-amber-300 text-amber-900'
                        : 'bg-muted text-muted-foreground'

                  const tauxColor = ens.tauxReussite >= 70
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : ens.tauxReussite >= 50
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

                  const moyColor = ens.moyenne >= 12
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : ens.moyenne >= 10
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankBg}`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{ens.nom}</p>
                        <p className="text-xs text-muted-foreground">
                          {ens.nbEpreuves} épreuve{ens.nbEpreuves > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary" className={`text-xs ${moyColor}`}>
                          {ens.moyenne}/20
                        </Badge>
                        <Badge variant="secondary" className={`text-xs ${tauxColor}`}>
                          {ens.tauxReussite}%
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
