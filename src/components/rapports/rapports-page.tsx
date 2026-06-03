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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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

// ─── Types ───

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
}

interface FiliereOption {
  id: string
  nom: string
}

interface StudentData {
  id: string
  name: string
  email: string
  moyenne: number
  filiere: string
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

  // ─── Simulated student data (for top/bottom) ───
  const [studentsData, setStudentsData] = useState<StudentData[]>([])

  // ─── Fetch stats ───
  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const filiereParam = selectedFiliere !== 'all' ? selectedFiliere : (user?.filiereId || '')
      const params = new URLSearchParams()
      if (filiereParam) params.set('filiereId', filiereParam)
      if (dateDebut) params.set('dateDebut', dateDebut)
      if (dateFin) params.set('dateFin', dateFin)
      const qs = params.toString()
      const res = await fetch(`/api/stats/responsable${qs ? `?${qs}` : ''}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        // Generate simulated student data from stats
        generateStudentData(data)
      } else {
        setStats(null)
      }
    } catch {
      setStats(null)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFiliere, user?.filiereId, dateDebut, dateFin])

  // ─── Generate simulated student data ───
  const generateStudentData = (statsData: StatsData) => {
    const students: StudentData[] = []
    const nbEtudiants = Math.min(statsData.nbEtudiants || 20, 20)
    const avg = statsData.moyenneGenerale || 10

    const firstNames = ['Ahmed', 'Fatima', 'Mohamed', 'Sara', 'Youssef', 'Amina', 'Omar', 'Lina', 'Karim', 'Nadia', 'Ali', 'Houda', 'Rachid', 'Meriem', 'Hassan', 'Zineb', 'Amine', 'Khadija', 'Nour', 'Imane']
    const lastNames = ['Benali', 'Mansouri', 'El Amrani', 'Cherkaoui', 'Berrada', 'Tazi', 'Fassi', 'Alaoui', 'Bennani', 'Idrissi', 'Lahlou', 'Senhaji', 'Bouzidi', 'Kettani', 'Rahmouni', 'Chraibi', 'Belhaj', 'Ziani', 'Tahiri', 'Moussaoui']

    for (let i = 0; i < nbEtudiants; i++) {
      const variance = Math.random() * 12 - 4
      const score = Math.max(0, Math.min(20, Math.round((avg + variance) * 10) / 10))
      students.push({
        id: `stu-${i}`,
        name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
        email: `${firstNames[i % firstNames.length].toLowerCase()}.${lastNames[i % lastNames.length].toLowerCase()}@etu.ma`,
        moyenne: score,
        filiere: statsData.etudiantsParFiliere?.[0]?.filiere || 'Générale',
      })
    }
    setStudentsData(students.sort((a, b) => b.moyenne - a.moyenne))
  }

  // ─── Fetch filieres ───
  const fetchFilieres = useCallback(async () => {
    try {
      const res = await fetch('/api/filieres', { headers: getAuthHeaders() })
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

  // ─── Top & bottom students ───
  const topStudents = studentsData.slice(0, 5)
  const studentsNeedingAttention = studentsData.filter((s) => s.moyenne < 10)

  // ─── Export CSV ───
  const handleExportCSV = () => {
    if (!stats) return
    try {
      const rows: string[][] = []

      // Header: Filière, Niveau, Nb étudiants, Nb évaluations, Note moyenne, Taux de réussite
      rows.push(['Filière', 'Niveau', 'Nb étudiants', 'Nb évaluations', 'Note moyenne', 'Taux de réussite'])

      // Per-filiere data
      if (stats.etudiantsParFiliere.length > 0) {
        stats.etudiantsParFiliere.forEach((f) => {
          const filiereStats = stats.resultatsParMatiere.filter((r) =>
            stats.topEnseignants.some((e) => e.nom === r.enseignant)
          )
          const filiereEvals = filiereStats.length || stats.nbEvaluations
          const filiereMoyenne = filiereStats.length > 0
            ? Math.round(filiereStats.reduce((sum, r) => sum + r.moyenne, 0) / filiereStats.length * 10) / 10
            : stats.moyenneGenerale
          const filiereTaux = filiereStats.length > 0
            ? Math.round(filiereStats.reduce((sum, r) => sum + r.tauxReussite, 0) / filiereStats.length)
            : stats.tauxReussiteGlobal

          rows.push([
            f.filiere,
            '',
            f.count.toString(),
            filiereEvals.toString(),
            filiereMoyenne.toString(),
            `${filiereTaux}%`,
          ])
        })
      } else {
        rows.push([
          selectedFiliere === 'all' ? 'Toutes' : selectedFiliere,
          '',
          stats.nbEtudiants.toString(),
          stats.nbEvaluations.toString(),
          stats.moyenneGenerale.toString(),
          `${stats.tauxReussiteGlobal}%`,
        ])
      }

      // Add a summary section
      rows.push([])
      rows.push(['Indicateur', 'Valeur'])
      rows.push(['Moyenne générale', stats.moyenneGenerale.toString()])
      rows.push(['Taux de réussite global', `${stats.tauxReussiteGlobal}%`])
      rows.push(['Nombre d\'évaluations', stats.nbEvaluations.toString()])
      rows.push(['Nombre d\'étudiants', stats.nbEtudiants.toString()])
      rows.push(['Nombre d\'enseignants', stats.nbEnseignants.toString()])

      // Add results per subject
      if (stats.resultatsParMatiere.length > 0) {
        rows.push([])
        rows.push(['Matière', 'Enseignant', 'Moyenne', 'Taux de réussite', 'Participants'])
        stats.resultatsParMatiere.forEach((r) => {
          rows.push([r.titre, r.enseignant, r.moyenne.toString(), `${r.tauxReussite}%`, r.nbParticipants.toString()])
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
      toast.error('Erreur', { description: 'Impossible d\'exporter le rapport.' })
    }
  }

  const handleExportPDF = () => {
    toast.info('Export PDF', { description: 'L\'export PDF sera disponible prochainement.' })
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
            Analysez les performances de vos filières
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950">
            <Download className="h-4 w-4 mr-1" />
            Exporter
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950">
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
          {/* Stats skeleton */}
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
          {/* Charts skeleton */}
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
      {!isLoading && !stats && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BarChart3 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune donnée disponible</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Les statistiques apparaîtront une fois que des évaluations auront été réalisées.
          </p>
        </div>
      )}

      {/* ─── Stats content ─── */}
      {!isLoading && stats && (
        <>
          {/* ─── Overview stats (4 cards) ─── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Moyenne générale</p>
                  <p className={`text-xl font-bold ${getScoreColor(stats.moyenneGenerale)}`}>
                    {stats.moyenneGenerale}/20
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-teal-500">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                  <Trophy className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taux de réussite</p>
                  <p className={`text-xl font-bold ${stats.tauxReussiteGlobal >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stats.tauxReussiteGlobal}%
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Évaluations</p>
                  <p className="text-xl font-bold">{stats.nbEvaluations}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/40">
                  <Users className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Étudiants</p>
                  <p className="text-xl font-bold">{stats.nbEtudiants}</p>
                </div>
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
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                    Aucune donnée disponible
                  </div>
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
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                    Aucune donnée disponible
                  </div>
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
                  Moyenne par épreuve
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.resultatsParMatiere.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
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
                        width={100}
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
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                    Aucune évaluation terminée
                  </div>
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
                {stats.etudiantsParFiliere.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={stats.etudiantsParFiliere}
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
                        {stats.etudiantsParFiliere.map((_entry, index) => (
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
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                    Aucune filière avec des étudiants
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Top/Bottom students section ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ─── Top 5 performers ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-600" />
                  Top 5 — Meilleurs étudiants
                </CardTitle>
                <CardDescription className="text-xs">
                  Les étudiants les plus performants
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {topStudents.length > 0 ? (
                  <div className="space-y-3">
                    {topStudents.map((student, index) => (
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
                          <p className="text-sm font-medium truncate">{student.name}</p>
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
                    Aucun étudiant inscrit
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Students needing attention ─── */}
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
                {studentsNeedingAttention.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {studentsNeedingAttention.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.name}</p>
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
                    Tous les étudiants ont la moyenne !
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
                  Top Enseignants
                </CardTitle>
                <CardDescription className="text-xs">
                  Enseignants les plus performants par taux de réussite
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

          {/* ─── Alertes summary ─── */}
          {stats.alertes.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Alertes détectées ({stats.alertes.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Problèmes identifiés dans les données
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {stats.alertes.map((alerte, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                        alerte.severity === 'critical' ? 'text-red-500' :
                        alerte.severity === 'warning' ? 'text-amber-500' :
                        'text-sky-500'
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
