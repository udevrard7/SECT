'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3,
  TrendingUp,
  Trophy,
  Users,
  Download,
  FileJson,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  CheckCircle2,
  XCircle,
  Loader2,
  Award,
  Target,
  BarChart2,
  Clock,
  ArrowUpDown,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

// ─── Types ───

interface EpreuveOption {
  id: string
  titre: string
  dateDebut: string
  dateFin: string
  statut: string
}

interface SessionResult {
  id: string
  etudiantId: string
  etudiant: {
    id: string
    name: string
    email: string
    filiere: string | null
  }
  statut: string
  score: number | null
  alertes: number
  dateDebut: string | null
  dateFin: string | null
  resultat: {
    id: string
    scoreFinal: number
    detailParQuestion: Array<{
      index: number
      type: string
      enonce: string
      pointsMax: number
      pointsObtenus: number | null
      correct: boolean | null
      reponseEtudiant: string | null
      reponseAttendue: string | null
      commentaire?: string | null
    }> | null
    dateCorrection: string | null
  } | null
  reponses: Array<{
    id: string
    questionId: string
    contenu: string | null
    score: number | null
    commentaire: string | null
  }>
}

interface Stats {
  totalSessions: number
  soumis: number
  corriges: number
  moyenne: number
  mediane: number
  min: number
  max: number
  tauxReussite: number
}

// ─── Utility functions ───

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function formatDateFR(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function getScoreColor(score: number): string {
  if (score >= 10) return 'text-emerald-700 dark:text-emerald-400'
  if (score >= 8) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

function getScoreBg(score: number): string {
  if (score >= 10) return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
  if (score >= 8) return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
  return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
}

function getBarColor(score: number): string {
  if (score >= 10) return '#10b981'
  if (score >= 8) return '#f59e0b'
  return '#ef4444'
}

// ─── Component ───

export function ResultatsPage() {
  const user = useAuthStore((s) => s.user)

  const [epreuves, setEpreuves] = useState<EpreuveOption[]>([])
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [sessions, setSessions] = useState<SessionResult[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoadingEpreuves, setIsLoadingEpreuves] = useState(true)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [isExporting, setIsExporting] = useState(false)

  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(null)

  // ─── Fetch epreuves (TERMINEE / CLOTUREE) ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingEpreuves(true)
    try {
      const res = await fetch(`/api/epreuves?enseignantId=${user.id}&statut=TERMINEE`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const termineeEpreuves: EpreuveOption[] = data.epreuves ?? []
        // Also fetch CLOTUREE
        const res2 = await fetch(`/api/epreuves?enseignantId=${user.id}&statut=CLOTUREE`, { headers: getAuthHeaders() })
        let clotureeEpreuves: EpreuveOption[] = []
        if (res2.ok) {
          const data2 = await res2.json()
          clotureeEpreuves = data2.epreuves ?? []
        }
        setEpreuves([...termineeEpreuves, ...clotureeEpreuves])
      }
    } catch {
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger les épreuves.',
      })
    } finally {
      setIsLoadingEpreuves(false)
    }
  }, [user])

  useEffect(() => {
    fetchEpreuves()
  }, [fetchEpreuves])

  // ─── Fetch results for selected exam ───
  const fetchResults = useCallback(async (epreuveId: string) => {
    setIsLoadingResults(true)
    try {
      const res = await fetch(`/api/resultats?epreuveId=${epreuveId}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
        setStats(data.stats ?? null)
      }
    } catch {
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger les résultats.',
      })
    } finally {
      setIsLoadingResults(false)
    }
  }, [])

  useEffect(() => {
    if (selectedEpreuveId) {
      fetchResults(selectedEpreuveId)
    } else {
      setSessions([])
      setStats(null)
    }
  }, [selectedEpreuveId, fetchResults])

  // ─── Score distribution histogram data ───
  const distributionData = useMemo(() => {
    const bins = [
      { label: '0-4', min: 0, max: 4, count: 0 },
      { label: '4-8', min: 4, max: 8, count: 0 },
      { label: '8-10', min: 8, max: 10, count: 0 },
      { label: '10-12', min: 10, max: 12, count: 0 },
      { label: '12-14', min: 12, max: 14, count: 0 },
      { label: '14-16', min: 14, max: 16, count: 0 },
      { label: '16-20', min: 16, max: 20.01, count: 0 },
    ]

    sessions.forEach((s) => {
      if (s.score !== null) {
        const score = s.score
        for (const bin of bins) {
          if (score >= bin.min && score < bin.max) {
            bin.count++
            break
          }
        }
      }
    })

    return bins.map((b) => ({
      name: b.label,
      count: b.count,
      midpoint: (b.min + b.max) / 2,
    }))
  }, [sessions])

  // ─── Per-question success rate ───
  const questionSuccessData = useMemo(() => {
    if (sessions.length === 0) return []

    // Collect all questions from all sessions' resultats
    const questionMap = new Map<number, { total: number; correct: number; enonce: string; type: string }>()

    sessions.forEach((s) => {
      const details = s.resultat?.detailParQuestion
      if (details && Array.isArray(details)) {
        details.forEach((q) => {
          const idx = q.index
          if (!questionMap.has(idx)) {
            questionMap.set(idx, { total: 0, correct: 0, enonce: q.enonce || `Q${idx + 1}`, type: q.type })
          }
          const entry = questionMap.get(idx)!
          entry.total++
          if (q.correct === true) entry.correct++
        })
      }
    })

    return Array.from(questionMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([idx, data]) => ({
        name: `Q${idx + 1}`,
        taux: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        type: data.type,
        enonce: data.enonce,
      }))
  }, [sessions])

  // ─── Sorted sessions ───
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const scoreA = a.score ?? 0
      const scoreB = b.score ?? 0
      return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB
    })
  }, [sessions, sortOrder])

  // ─── Selected epreuve info ───
  const selectedEpreuve = useMemo(() => {
    return epreuves.find((e) => e.id === selectedEpreuveId)
  }, [epreuves, selectedEpreuveId])

  // ─── Export handlers ───
  const handleExport = async (format: 'csv' | 'json') => {
    if (!selectedEpreuveId) return
    setIsExporting(true)
    try {
      const res = await fetch(`/api/epreuves/${selectedEpreuveId}/export?format=${format}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Export échoué')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resultats_${selectedEpreuve?.titre ?? 'epreuve'}.${format === 'csv' ? 'csv' : 'json'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Export réussi', {
        description: `Le fichier ${format.toUpperCase()} a été téléchargé.`,
      })
    } catch {
      toast.error('Erreur d\'export', {
        description: 'Impossible d\'exporter les résultats.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  // ─── Detail dialog handlers ───
  const handleViewDetail = (session: SessionResult) => {
    setSelectedSession(session)
    setDetailDialogOpen(true)
  }

  // ─── Custom tooltip for charts ───
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {payload[0].value} étudiant{payload[0].value > 1 ? 's' : ''}
          </p>
        </div>
      )
    }
    return null
  }

  const SuccessTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            Taux de réussite : {payload[0].value}%
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            Résultats & Analyses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez et analysez les résultats de vos épreuves
          </p>
        </div>
      </div>

      {/* ─── Exam selector ─── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">
                Sélectionnez une épreuve terminée
              </label>
              <Select
                value={selectedEpreuveId}
                onValueChange={setSelectedEpreuveId}
              >
                <SelectTrigger className="w-full sm:max-w-md">
                  <SelectValue placeholder="Choisir une épreuve..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingEpreuves ? (
                    <SelectItem value="_loading" disabled>
                      Chargement...
                    </SelectItem>
                  ) : epreuves.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      Aucune épreuve terminée
                    </SelectItem>
                  ) : (
                    epreuves.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        <span className="flex items-center gap-2">
                          {ep.titre}
                          <span className="text-xs text-muted-foreground">
                            ({formatDateFR(ep.dateDebut)})
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedEpreuveId && (
              <div className="flex items-center gap-2 self-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv')}
                  disabled={isExporting || sessions.length === 0}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Exporter CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('json')}
                  disabled={isExporting || sessions.length === 0}
                  className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                  Exporter JSON
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Empty state ─── */}
      {!selectedEpreuveId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BarChart3 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Sélectionnez une épreuve pour voir les résultats</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Choisissez une épreuve terminée ou clôturée dans le sélecteur ci-dessus pour afficher ses résultats et analyses.
          </p>
        </div>
      )}

      {/* ─── Loading state ─── */}
      {selectedEpreuveId && isLoadingResults && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 w-24 rounded bg-muted mb-3" />
                <div className="h-8 w-16 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Results content ─── */}
      {selectedEpreuveId && !isLoadingResults && stats && (
        <>
          {/* ─── Statistics dashboard ─── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Moyenne */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                    <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Moyenne</p>
                    <p className={`text-2xl font-bold ${getScoreColor(stats.moyenne)}`}>
                      {stats.moyenne.toFixed(1)}<span className="text-sm text-muted-foreground">/20</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Médiane */}
            <Card className="border-l-4 border-l-teal-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                    <BarChart2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Médiane</p>
                    <p className={`text-2xl font-bold ${getScoreColor(stats.mediane)}`}>
                      {stats.mediane.toFixed(1)}<span className="text-sm text-muted-foreground">/20</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Taux de réussite */}
            <Card className="border-l-4 border-l-emerald-600">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                    <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Taux de réussite</p>
                    <p className={`text-2xl font-bold ${stats.tauxReussite >= 50 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {stats.tauxReussite}<span className="text-sm text-muted-foreground">%</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nombre de copies */}
            <Card className="border-l-4 border-l-teal-600">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                    <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Nombre de copies</p>
                    <p className="text-2xl font-bold">
                      {stats.totalSessions}
                      <span className="text-sm text-muted-foreground ml-1">
                        ({stats.corriges} corrigé{stats.corriges > 1 ? 's' : ''})
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Charts ─── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Score distribution histogram */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Distribution des notes
                </CardTitle>
                <CardDescription>
                  Répartition des scores par tranche
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {distributionData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getBarColor(entry.midpoint)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Per-question success rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Taux de réussite par question
                </CardTitle>
                <CardDescription>
                  Pourcentage de réponses correctes par question
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {questionSuccessData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={questionSuccessData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip content={<SuccessTooltip />} />
                        <Bar dataKey="taux" radius={[4, 4, 0, 0]}>
                          {questionSuccessData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.taux >= 70 ? '#10b981' : entry.taux >= 40 ? '#f59e0b' : '#ef4444'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                    Aucune donnée de question disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Student results table ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Résultats par étudiant
                  </CardTitle>
                  <CardDescription>
                    {sessions.length} copie{sessions.length > 1 ? 's' : ''} · {selectedEpreuve?.titre}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="text-muted-foreground"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  {sortOrder === 'desc' ? 'Meilleur en premier' : 'Moins bon en premier'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rang</TableHead>
                      <TableHead>Étudiant</TableHead>
                      <TableHead className="w-24 text-center">Score</TableHead>
                      <TableHead className="w-24 text-center">Pourcentage</TableHead>
                      <TableHead className="w-28 text-center">Statut</TableHead>
                      <TableHead className="w-24 text-center">Alertes</TableHead>
                      <TableHead className="w-24 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSessions.map((session, index) => {
                      const score = session.score ?? 0
                      const percentage = Math.round((score / 20) * 100)
                      const isCorrected = session.statut === 'CORRIGEE'
                      const hasAlerts = session.alertes > 0

                      return (
                        <TableRow
                          key={session.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleViewDetail(session)}
                        >
                          <TableCell className="font-bold text-center">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{session.etudiant.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {session.etudiant.email}
                                {session.etudiant.filiere && ` · ${session.etudiant.filiere}`}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`font-bold ${getScoreBg(score)}`}
                            >
                              {score.toFixed(1)}/20
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${percentage}%`,
                                    backgroundColor: getBarColor(score),
                                  }}
                                />
                              </div>
                              <span className={`text-sm font-medium ${getScoreColor(score)}`}>
                                {percentage}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {isCorrected ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Corrigé
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                                <Clock className="h-3 w-3" />
                                En attente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {hasAlerts ? (
                              <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
                                <AlertTriangle className="h-3 w-3" />
                                {session.alertes}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewDetail(session)
                              }}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {sessions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Aucune copie soumise pour cette épreuve
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Student Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Détail du résultat
            </DialogTitle>
            <DialogDescription>
              {selectedSession?.etudiant.name} — {selectedEpreuve?.titre}
            </DialogDescription>
          </DialogHeader>

          {selectedSession && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-6 pb-4">
                {/* Score overview */}
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Trophy className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${getScoreColor(selectedSession.score ?? 0)}`}>
                        {(selectedSession.score ?? 0).toFixed(1)}
                        <span className="text-lg text-muted-foreground">/20</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={getScoreBg(selectedSession.score ?? 0)}
                      >
                        {Math.round(((selectedSession.score ?? 0) / 20) * 100)}%
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                      {selectedSession.dateDebut && (
                        <span>Passé le {formatDateFR(selectedSession.dateDebut)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & alerts */}
                <div className="flex items-center gap-3">
                  {selectedSession.statut === 'CORRIGEE' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      Corrigé
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                      <Clock className="h-3 w-3" />
                      En attente de correction
                    </Badge>
                  )}
                  {selectedSession.alertes > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
                      <AlertTriangle className="h-3 w-3" />
                      {selectedSession.alertes} alerte{selectedSession.alertes > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Question-by-question breakdown */}
                {selectedSession.resultat?.detailParQuestion && Array.isArray(selectedSession.resultat.detailParQuestion) && selectedSession.resultat.detailParQuestion.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Détail par question
                    </h4>
                    <div className="space-y-3">
                      {selectedSession.resultat.detailParQuestion.map((q, idx) => {
                        const isGraded = q.pointsObtenus !== null
                        const isCorrect = q.correct === true
                        const isIncorrect = q.correct === false

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border p-4 transition-colors ${
                              isGraded && isCorrect
                                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                                : isGraded && isIncorrect
                                  ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                                  : 'border-muted'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Question number */}
                              <div className="flex flex-col items-center gap-1">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                  {q.index ?? idx + 1}
                                </span>
                                {isGraded && isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                )}
                                {isGraded && isIncorrect && (
                                  <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                                )}
                              </div>

                              {/* Question content */}
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      q.type === 'QCU'
                                        ? 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
                                        : q.type === 'QCM'
                                          ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
                                          : q.type === 'QRC'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
                                            : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800'
                                    }`}
                                  >
                                    {q.type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {q.pointsMax} point{q.pointsMax > 1 ? 's' : ''}
                                  </span>
                                </div>

                                {/* Question text */}
                                <p className="text-sm leading-relaxed">
                                  {q.enonce || `Question ${q.index ?? idx + 1}`}
                                </p>

                                {/* Score */}
                                {isGraded ? (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${
                                      isCorrect
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}>
                                      {q.pointsObtenus?.toFixed(1) ?? '0'}/{q.pointsMax}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
                                    <Loader2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
                                    <span className="text-xs text-amber-700 dark:text-amber-400">
                                      En attente de correction
                                    </span>
                                  </div>
                                )}

                                {/* Student answer for QCU/QCM */}
                                {(q.type === 'QCU' || q.type === 'QCM') && q.reponseEtudiant && (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">Réponse :</span> {q.reponseEtudiant}
                                  </p>
                                )}

                                {/* Comment */}
                                {q.commentaire && (
                                  <div className="rounded border bg-muted/30 p-2">
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Commentaire :</span> {q.commentaire}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Target className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Le détail par question n&apos;est pas encore disponible.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
