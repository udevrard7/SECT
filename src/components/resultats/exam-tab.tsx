// ─────────────────────────────────────────────────────────────
// Vue "Par épreuve" — résultats détaillés d'une épreuve
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import {
  Target,
  Trophy,
  Users,
  BarChart3,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  BarChart2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useEpreuvesTerminees, useExamResults } from '@/hooks/use-resultats'
import {
  buildDistribution,
  buildQuestionSuccess,
  sessionsToCSV,
  sessionsToJSON,
  formatDateFR,
} from '@/lib/resultats-utils'
import { StatCard } from '@/components/ds'
import { ChartCard, DistributionChart, QuestionSuccessChart } from './resultats-charts'
import { ResultsTable } from './results-table'
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from './resultats-skeletons'
import { SessionDetailDialog } from './session-detail-dialog'
import type { SessionResult, ScoreBin, QuestionSuccess } from '@/types/resultats'

interface ExamTabProps {
  enseignantId: string
}

export function ExamTab({ enseignantId }: ExamTabProps) {
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [activeScoreBin, setActiveScoreBin] = useState<string | null>(null)
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // ─── Queries ───
  const epreuvesQuery = useEpreuvesTerminees(enseignantId)
  const resultsQuery = useExamResults(selectedEpreuveId || null)

  const epreuves = epreuvesQuery.data ?? []
  const sessions = resultsQuery.data?.sessions ?? []
  const stats = resultsQuery.data?.stats ?? null
  const noteTotal = resultsQuery.data?.noteTotal ?? stats?.noteTotal ?? 20
  const selectedEpreuve = useMemo(
    () => epreuves.find((e) => e.id === selectedEpreuveId),
    [epreuves, selectedEpreuveId]
  )

  // ─── Derived data ───
  const distributionData: ScoreBin[] = useMemo(
    () => buildDistribution(sessions, noteTotal),
    [sessions, noteTotal]
  )

  const questionSuccessData: QuestionSuccess[] = useMemo(
    () => buildQuestionSuccess(sessions),
    [sessions]
  )

  // ─── Handlers ───
  const handleViewDetail = (session: SessionResult) => {
    setSelectedSession(session)
    setDetailOpen(true)
  }

  const handleBarClick = (bin: ScoreBin) => {
    setActiveScoreBin((prev) => (prev === bin.name ? null : bin.name))
  }

  const handleQuestionClick = (q: QuestionSuccess) => {
    setActiveQuestionIdx((prev) => (prev === q.index ? null : q.index))
  }

  const handleExport = async (format: 'csv' | 'json') => {
    if (!selectedEpreuveId || sessions.length === 0) return
    if (format === 'csv') {
      sessionsToCSV(sessions, noteTotal, selectedEpreuve?.titre ?? 'epreuve')
      toast.success('Export CSV réussi', { description: `${sessions.length} copies exportées` })
      return
    }
    if (format === 'json') {
      sessionsToJSON(sessions, stats as Record<string, unknown> | null, selectedEpreuve?.titre ?? 'epreuve')
      toast.success('Export JSON réussi', { description: `${sessions.length} copies exportées` })
      return
    }
    // PDF via l'API
    setIsExporting(true)
    try {
      const res = await fetch(`/api/epreuves/${selectedEpreuveId}/export?format=pdf`)
      if (!res.ok) throw new Error('Export PDF échoué')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resultats_${(selectedEpreuve?.titre ?? 'epreuve').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Export PDF réussi')
    } catch {
      toast.error("Erreur d'export PDF", { description: 'Le format PDF nécessite une route dédiée.' })
    } finally {
      setIsExporting(false)
    }
  }

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Sélecteur d'épreuve + actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">
                Sélectionnez une épreuve terminée
              </label>
              <Select
                value={selectedEpreuveId}
                onValueChange={(v) => {
                  setSelectedEpreuveId(v)
                  setActiveScoreBin(null)
                  setActiveQuestionIdx(null)
                }}
              >
                <SelectTrigger className="w-full sm:max-w-md">
                  <SelectValue placeholder="Choisir une épreuve..." />
                </SelectTrigger>
                <SelectContent>
                  {epreuvesQuery.isLoading ? (
                    <SelectItem value="_loading" disabled>
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement...
                      </span>
                    </SelectItem>
                  ) : epreuves.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      Aucune épreuve terminée
                    </SelectItem>
                  ) : (
                    epreuves.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{ep.titre}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({formatDateFR(ep.dateDebut)})
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {selectedEpreuveId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resultsQuery.refetch()}
                    disabled={resultsQuery.isFetching}
                    aria-label="Rafraîchir"
                  >
                    <RefreshCw className={`h-4 w-4 ${resultsQuery.isFetching ? 'animate-spin' : ''}`} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sessions.length === 0}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Exporter</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExport('csv')}>
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        Exporter CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport('json')}>
                        <FileJson className="h-4 w-4 text-teal-600" />
                        Exporter JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>

          {/* Indicateur de filtre actif (tranche) */}
          {activeScoreBin && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <AlertCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                Filtre actif : tranche {activeScoreBin}
              </span>
              <button
                onClick={() => setActiveScoreBin(null)}
                className="ml-auto text-xs text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400"
              >
                Retirer le filtre
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* États : vide / chargement / erreur / contenu */}
      {!selectedEpreuveId ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BarChart3 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Sélectionnez une épreuve pour voir les résultats</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Choisissez une épreuve terminée ou clôturée dans le sélecteur ci-dessus pour afficher ses résultats détaillés.
          </p>
        </div>
      ) : resultsQuery.isLoading ? (
        <>
          <KpiSkeleton />
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <TableSkeleton />
        </>
      ) : resultsQuery.isError ? (
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Impossible de charger les résultats de cette épreuve.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resultsQuery.refetch()}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : sessions.length === 0 && stats ? (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-amber-500" />
            <p className="mt-3 text-sm font-medium">Aucune copie soumise</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Cette épreuve n&apos;a pas encore de copie soumise ou corrigée.
            </p>
          </CardContent>
        </Card>
      ) : stats ? (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Target}
              label="Moyenne"
              value={stats.moyenne.toFixed(1)}
              suffix={`/${noteTotal}`}
              accent="success"
              scoreOn20={(stats.moyenne / noteTotal) * 20}
            />
            <StatCard
              icon={BarChart2}
              label="Médiane"
              value={stats.mediane.toFixed(1)}
              suffix={`/${noteTotal}`}
              accent="primary"
              scoreOn20={(stats.mediane / noteTotal) * 20}
            />
            <StatCard
              icon={Trophy}
              label="Taux de réussite"
              value={stats.tauxReussite}
              suffix="%"
              accent={stats.tauxReussite >= 50 ? 'success' : 'warning'}
            />
            <StatCard
              icon={Users}
              label="Nombre de copies"
              value={stats.totalSessions}
              hint={`${stats.corriges} corrigée${stats.corriges > 1 ? 's' : ''}`}
              accent="info"
            />
          </div>

          {/* Graphiques */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Distribution des notes"
              description="Cliquez sur une barre pour filtrer le tableau"
              icon={<BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            >
              <div className="h-64">
                <DistributionChart
                  data={distributionData}
                  noteTotal={noteTotal}
                  onBarClick={handleBarClick}
                  activeBin={activeScoreBin}
                  height={256}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Taux de réussite par question"
              description="Cliquez pour mettre en évidence une question"
              icon={<Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
            >
              <div className="h-64">
                <QuestionSuccessChart
                  data={questionSuccessData}
                  onBarClick={handleQuestionClick}
                  activeIndex={activeQuestionIdx}
                  height={256}
                />
              </div>
            </ChartCard>
          </div>

          {/* Tableau des résultats */}
          <ResultsTable
            sessions={sessions}
            noteTotal={noteTotal}
            examTitle={selectedEpreuve?.titre}
            onViewDetail={handleViewDetail}
            activeScoreBin={activeScoreBin}
          />
        </>
      ) : null}

      {/* Dialog de détail */}
      <SessionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        session={selectedSession}
        epreuveTitre={selectedEpreuve?.titre}
        noteTotal={noteTotal}
      />
    </div>
  )
}
