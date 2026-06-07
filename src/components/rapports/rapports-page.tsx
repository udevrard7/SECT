'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  Users,
  ClipboardList,
  GraduationCap,
  Trophy,
  AlertTriangle,
  Download,
  FileText,
  Filter,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
  Eye,
  UserX,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// ─── Types (aligned with API response) ───

interface StatsData {
  nbEtudiants: number
  nbEnseignants: number
  nbEvaluations: number
  tauxReussiteGlobal: number
  moyenneGenerale: number
  repartitionNotes: Array<{ label: string; count: number }>
  resultatsParMatiere: Array<{
    titre: string
    enseignant: string
    moyenne: number
    tauxReussite: number
    nbParticipants: number
  }>
  etudiantsParFiliere: Array<{ filiere: string; count: number }>
  evolutionMoyennes: Array<{ mois: string; moyenne: number; nbEvaluations: number }>
  topEnseignants: Array<{
    nom: string
    nbEpreuves: number
    moyenne: number
    tauxReussite: number
  }>
  alertes: Array<{ type: string; titre: string; description: string; severity: string }>
  topEtudiants: Array<{
    id: string
    nom: string
    email: string
    moyenne: number
    filiere: string
  }>
  etudiantsEnDifficulte: Array<{
    id: string
    nom: string
    email: string
    moyenne: number
    filiere: string
  }>
}

interface FiliereOption {
  id: string
  nom: string
}

// ─── Chart colors (emerald/teal scheme, no indigo/blue) ───

const CHART_COLORS = [
  '#10b981', // emerald-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#059669', // emerald-600
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#dc2626', // red-600
]

const GRADE_COLORS: Record<string, string> = {
  '0-4': '#ef4444',
  '4-8': '#f97316',
  '8-10': '#f59e0b',
  '10-12': '#10b981',
  '12-14': '#059669',
  '14-16': '#0d9488',
  '16-20': '#047857',
}

// ─── Custom tooltip ───

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Month formatter ───

function formatMonth(mois: string): string {
  const [year, month] = mois.split('-')
  const months: Record<string, string> = {
    '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aoû',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
  }
  return `${months[month] || month} ${year.slice(2)}`
}

// ─── Score color ───

function getScoreColor(score: number): string {
  if (score >= 14) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 10) return 'text-teal-600 dark:text-teal-400'
  if (score >= 8) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function getScoreBg(score: number): string {
  if (score >= 14) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  if (score >= 10) return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800'
  if (score >= 8) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800'
}

function getTrendIcon(trend: 'up' | 'down' | 'stable') {
  if (trend === 'up') return <ArrowUpRight className="h-4 w-4 text-emerald-600" />
  if (trend === 'down') return <ArrowDownRight className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-amber-500" />
}

// ─── KPI Card ───

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  iconBg: string
  borderColor: string
}

function KPICard({ title, value, subtitle, icon, iconBg, borderColor }: KPICardProps) {
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Empty chart placeholder ───

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[260px] text-sm text-muted-foreground gap-2">
      <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
      {message}
    </div>
  )
}

// ─── Main Component ───

export function RapportsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [stats, setStats] = useState<StatsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFiliere, setSelectedFiliere] = useState('all')

  // ─── Options state ───
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [dateDebut, setDateDebut] = useState<string>('')
  const [dateFin, setDateFin] = useState<string>('')

  // ─── Fetch stats ───
  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedFiliere && selectedFiliere !== 'all') {
        params.set('filiereId', selectedFiliere)
      }
      if (dateDebut) params.set('dateDebut', dateDebut)
      if (dateFin) params.set('dateFin', dateFin)
      const qs = params.toString()
      const res = await fetch(`/api/stats/responsable${qs ? `?${qs}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error('Stats API error:', errorData)
        setStats(null)
      }
    } catch (err) {
      console.error('Fetch stats error:', err)
      setStats(null)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFiliere, dateDebut, dateFin])

  // ─── Fetch filieres ───
  const fetchFilieres = useCallback(async () => {
    try {
      const res = await fetch('/api/filieres')
      if (res.ok) {
        const data = await res.json()
        setFilieres((data.filieres ?? []).map((f: { id: string; nom: string }) => ({ id: f.id, nom: f.nom })))
      }
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  // ─── Derived data ───
  const hasData = stats && (
    stats.nbEvaluations > 0 ||
    stats.nbEtudiants > 0 ||
    stats.moyenneGenerale > 0
  )

  // ─── Export CSV ───
  const handleExportCSV = () => {
    if (!stats) return
    try {
      const rows: string[][] = []

      // Section 1: KPIs globaux
      rows.push(['=== INDICATEURS CLÉS ==='])
      rows.push(['Indicateur', 'Valeur'])
      rows.push(['Moyenne générale', `${stats.moyenneGenerale}/20`])
      rows.push(['Taux de réussite global', `${stats.tauxReussiteGlobal}%`])
      rows.push(["Nombre d'évaluations", stats.nbEvaluations.toString()])
      rows.push(["Nombre d'étudiants", stats.nbEtudiants.toString()])
      rows.push(["Nombre d'enseignants", stats.nbEnseignants.toString()])

      // Section 2: Par filière
      if (stats.etudiantsParFiliere.length > 0) {
        rows.push([])
        rows.push(['=== ÉTUDIANTS PAR FILIÈRE ==='])
        rows.push(['Filière', "Nombre d'étudiants"])
        stats.etudiantsParFiliere.forEach((f) => {
          rows.push([f.filiere, f.count.toString()])
        })
      }

      // Section 3: Résultats par matière
      if (stats.resultatsParMatiere.length > 0) {
        rows.push([])
        rows.push(['=== RÉSULTATS PAR MATIÈRE ==='])
        rows.push(['Matière', 'Enseignant', 'Moyenne', 'Taux de réussite', 'Participants'])
        stats.resultatsParMatiere.forEach((r) => {
          rows.push([r.titre, r.enseignant, `${r.moyenne}/20`, `${r.tauxReussite}%`, r.nbParticipants.toString()])
        })
      }

      // Section 4: Répartition des notes
      if (stats.repartitionNotes.some(r => r.count > 0)) {
        rows.push([])
        rows.push(['=== RÉPARTITION DES NOTES ==='])
        rows.push(['Tranche', "Nombre d'étudiants"])
        stats.repartitionNotes.forEach((r) => {
          rows.push([r.label, r.count.toString()])
        })
      }

      // Section 5: Top enseignants
      if (stats.topEnseignants.length > 0) {
        rows.push([])
        rows.push(['=== TOP ENSEIGNANTS ==='])
        rows.push(['Enseignant', "Nb épreuves", 'Moyenne', 'Taux réussite'])
        stats.topEnseignants.forEach((e) => {
          rows.push([e.nom, e.nbEpreuves.toString(), `${e.moyenne}/20`, `${e.tauxReussite}%`])
        })
      }

      // Section 6: Top étudiants
      if (stats.topEtudiants.length > 0) {
        rows.push([])
        rows.push(['=== TOP 5 ÉTUDIANTS ==='])
        rows.push(['Nom', 'Email', 'Filière', 'Moyenne'])
        stats.topEtudiants.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      // Section 7: Étudiants en difficulté
      if (stats.etudiantsEnDifficulte.length > 0) {
        rows.push([])
        rows.push(['=== ÉTUDIANTS EN DIFFICULTÉ (< 10/20) ==='])
        rows.push(['Nom', 'Email', 'Filière', 'Moyenne'])
        stats.etudiantsEnDifficulte.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
      const bom = '\uFEFF'
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const dateSuffix = dateDebut || dateFin
        ? `${dateDebut || 'debut'}_${dateFin || 'fin'}`
        : new Date().toISOString().slice(0, 10)
      link.download = `rapport-sect-${dateSuffix}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Rapport exporté en CSV')
    } catch {
      toast.error('Erreur', { description: "Impossible d'exporter le rapport." })
    }
  }

  const handleExportPDF = () => {
    toast.info('Export PDF', { description: "L'export PDF sera disponible prochainement." })
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-emerald-600" />
            Rapports et Statistiques
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysez les performances de vos filières et le suivi pédagogique
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!hasData}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            <Download className="h-4 w-4 mr-1" />
            Exporter CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={!hasData}
            className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
          >
            <FileText className="h-4 w-4 mr-1" />
            Exporter PDF
          </Button>
        </div>
      </div>

      {/* ─── Filière selector + Date range filter ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedFiliere} onValueChange={setSelectedFiliere}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Sélectionner une filière" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les filières</SelectItem>
              {filieres.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dateDebut" className="text-xs text-muted-foreground whitespace-nowrap">Du</Label>
              <Input
                id="dateDebut"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dateFin" className="text-xs text-muted-foreground whitespace-nowrap">Au</Label>
              <Input
                id="dateFin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            {(dateDebut || dateFin) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setDateDebut(''); setDateFin('') }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-40 mb-4" />
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BarChart3 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune donnée disponible</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Les statistiques apparaîtront une fois que des évaluations auront été réalisées par les enseignants de vos filières.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{stats?.nbEnseignants ?? 0} enseignant(s) actif(s) · {stats?.nbEtudiants ?? 0} étudiant(s) inscrit(s)</span>
          </div>
        </div>
      )}

      {/* ─── Stats content ─── */}
      {!isLoading && hasData && stats && (
        <>
          {/* ─── Overview stats (4 KPI cards) ─── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              title="Moyenne générale"
              value={`${stats.moyenneGenerale}/20`}
              subtitle="Toutes évaluations confondues"
              icon={<TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              iconBg="bg-emerald-100 dark:bg-emerald-900/40"
              borderColor="border-l-emerald-500"
            />
            <KPICard
              title="Taux de réussite"
              value={`${stats.tauxReussiteGlobal}%`}
              subtitle="Notes ≥ 10/20"
              icon={<Trophy className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
              iconBg="bg-teal-100 dark:bg-teal-900/40"
              borderColor="border-l-teal-500"
            />
            <KPICard
              title="Évaluations"
              value={stats.nbEvaluations}
              subtitle="Épreuves terminées"
              icon={<ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              iconBg="bg-amber-100 dark:bg-amber-900/40"
              borderColor="border-l-amber-500"
            />
            <KPICard
              title="Étudiants"
              value={stats.nbEtudiants}
              subtitle={`${stats.etudiantsEnDifficulte.length} en difficulté`}
              icon={<Users className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
              iconBg="bg-rose-100 dark:bg-rose-900/40"
              borderColor="border-l-rose-500"
            />
          </div>

          {/* ─── Secondary KPIs (3 mini cards) ─── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="border-l-4 border-l-emerald-400">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">Enseignants actifs</span>
                </div>
                <span className="text-lg font-bold">{stats.nbEnseignants}</span>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-teal-400">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-teal-600" />
                  <span className="text-sm text-muted-foreground">Participants aux épreuves</span>
                </div>
                <span className="text-lg font-bold">
                  {stats.resultatsParMatiere.reduce((acc, r) => acc + r.nbParticipants, 0)}
                </span>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-400">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-muted-foreground">Étudiants en difficulté</span>
                </div>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {stats.etudiantsEnDifficulte.length}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* ─── Charts section (2x2 grid) ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ─── 1. Évolution des moyennes (Area chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Évolution des moyennes
                </CardTitle>
                <CardDescription className="text-xs">
                  Tendance mensuelle des scores moyens
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.evolutionMoyennes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={stats.evolutionMoyennes.map((e) => ({
                      ...e,
                      mois: formatMonth(e.mois),
                    }))}>
                      <defs>
                        <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="moyenne"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#emeraldGradient)"
                        name="Moyenne"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune donnée mensuelle disponible" />
                )}
              </CardContent>
            </Card>

            {/* ─── 2. Répartition des notes (Bar chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-teal-600" />
                  Répartition des notes
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribution par tranches de notes
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.repartitionNotes.some((r) => r.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={stats.repartitionNotes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Étudiants" radius={[4, 4, 0, 0]}>
                        {stats.repartitionNotes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={GRADE_COLORS[entry.label] || '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune note enregistrée" />
                )}
              </CardContent>
            </Card>

            {/* ─── 3. Résultats par matière (Horizontal Bar chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  Résultats par matière
                </CardTitle>
                <CardDescription className="text-xs">
                  Moyenne et taux de réussite par épreuve
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.resultatsParMatiere.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(260, stats.resultatsParMatiere.length * 45)}>
                    <BarChart
                      data={stats.resultatsParMatiere}
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis
                        type="category"
                        dataKey="titre"
                        width={120}
                        tick={{ fontSize: 10 }}
                        stroke="#9ca3af"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="moyenne" name="Moyenne" radius={[0, 4, 4, 0]}>
                        {stats.resultatsParMatiere.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.moyenne >= 10 ? '#10b981' : entry.moyenne >= 8 ? '#f59e0b' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune évaluation terminée" />
                )}
              </CardContent>
            </Card>

            {/* ─── 4. Étudiants par filière (Pie/Donut chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-emerald-600" />
                  Étudiants par filière
                </CardTitle>
                <CardDescription className="text-xs">
                  Répartition des effectifs
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.etudiantsParFiliere.length > 0 && stats.etudiantsParFiliere.some(f => f.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={stats.etudiantsParFiliere.filter(f => f.count > 0)}
                        dataKey="count"
                        nameKey="filiere"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                        label={({ filiere, percent }) =>
                          `${filiere} (${(percent * 100).toFixed(0)}%)`
                        }
                        labelLine={{ stroke: '#9ca3af' }}
                      >
                        {stats.etudiantsParFiliere.filter(f => f.count > 0).map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune filière avec des étudiants" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Top/Bottom students section (REAL DATA) ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ─── Top 5 performers ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-600" />
                  Top 5 — Meilleurs étudiants
                </CardTitle>
                <CardDescription className="text-xs">
                  Classement par moyenne aux évaluations
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.topEtudiants.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topEtudiants.map((student, index) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {/* Rank badge */}
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          index === 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                          index === 1 ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' :
                          index === 2 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {index + 1}
                        </div>

                        {/* Student info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.nom}</p>
                          <p className="text-xs text-muted-foreground">{student.filiere}</p>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <Progress
                              value={(student.moyenne / 20) * 100}
                              className="h-2"
                            />
                          </div>
                          <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[52px] justify-center`}>
                            {student.moyenne}/20
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                    Aucun résultat d&apos;étudiant disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Students needing attention (REAL DATA) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Étudiants en difficulté
                </CardTitle>
                <CardDescription className="text-xs">
                  Étudiants avec une moyenne inférieure à 10/20
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.etudiantsEnDifficulte.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {stats.etudiantsEnDifficulte.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.nom}</p>
                          <p className="text-xs text-muted-foreground">{student.filiere}</p>
                        </div>
                        <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[52px] justify-center`}>
                          {student.moyenne}/20
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                    <Trophy className="h-6 w-6 mr-2 text-emerald-500" />
                    {stats.topEtudiants.length > 0
                      ? 'Tous les participants ont la moyenne !'
                      : 'Aucun résultat d\'étudiant disponible'
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Top Enseignants ─── */}
          {stats.topEnseignants.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-600" />
                  Performance des enseignants
                </CardTitle>
                <CardDescription className="text-xs">
                  Classement par taux de réussite de leurs épreuves
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {stats.topEnseignants.map((ens, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {ens.nom.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <p className="text-sm font-medium text-center">{ens.nom}</p>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(ens.tauxReussite >= 50 ? 'up' : 'down')}
                        <span className={`text-lg font-bold ${ens.tauxReussite >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {ens.tauxReussite}%
                        </span>
                      </div>
                      <div className="flex flex-col items-center text-xs text-muted-foreground">
                        <span>{ens.nbEpreuves} épreuve{ens.nbEpreuves > 1 ? 's' : ''}</span>
                        <span>Moy: {ens.moyenne}/20</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Résultats détaillés par matière (table) ─── */}
          {stats.resultatsParMatiere.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  Détail des résultats par épreuve
                </CardTitle>
                <CardDescription className="text-xs">
                  Vue tabulaire complète des performances
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Épreuve</th>
                        <th className="pb-2 font-medium text-muted-foreground">Enseignant</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Participants</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Moyenne</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Taux réussite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.resultatsParMatiere.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">{r.titre}</td>
                          <td className="py-2 text-muted-foreground">{r.enseignant}</td>
                          <td className="py-2 text-center">{r.nbParticipants}</td>
                          <td className="py-2 text-center">
                            <Badge className={`${getScoreBg(r.moyenne)} text-xs`}>
                              {r.moyenne}/20
                            </Badge>
                          </td>
                          <td className="py-2 text-center">
                            <span className={r.tauxReussite >= 50 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                              {r.tauxReussite}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Alertes summary ─── */}
          {stats.alertes.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Alertes détectées ({stats.alertes.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Problèmes identifiés nécessitant votre attention
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {stats.alertes.map((alerte, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                        alerte.severity === 'critical' ? 'text-red-500' :
                        alerte.severity === 'warning' ? 'text-amber-500' :
                        'text-teal-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{alerte.titre}</p>
                        <p className="text-xs text-muted-foreground">{alerte.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
