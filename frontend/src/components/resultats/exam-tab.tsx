// ─────────────────────────────────────────────────────────────
// Vue "Par épreuve" — résultats détaillés d'une épreuve (refonte Savane EdTech).
// Sélecteur d'épreuve + refresh + export CSV/JSON/PDF (endpoint backend réel).
// Charts : Distribution + Radar (performance par type, données réelles) + Taux par question.
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
  FileText,
  Loader2,
  BarChart2,
  RefreshCw,
  AlertCircle,
  Radar,
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
  buildPerformanceByType,
  sessionsToCSV,
  sessionsToJSON,
  formatDateFR,
} from '@/lib/resultats-utils'
import { StatCard } from '@/components/ds'
import { ChartCard, DistributionChart, QuestionSuccessChart } from './resultats-charts'
import { ComparisonRadarChart } from './comparison-radar-chart'
import { ResultsTable } from './results-table'
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from './resultats-skeletons'
import { SessionDetailDialog } from './session-detail-dialog'
import type { SessionResult, ScoreBin, QuestionSuccess } from '@/types/resultats'

interface ExamTabProps {
  enseignantId: string
}

/**
 * ExamTab — Onglet "Par épreuve" pour analyser les résultats d'une épreuve spécifique.
 *
 * @param enseignantId — ID de l'enseignant pour filtrer les épreuves.
 */
export function ExamTab({ enseignantId }: ExamTabProps) {
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [activeScoreBin, setActiveScoreBin] = useState<string | null>(null)
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  // Queries
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

  // Derived data
  const distributionData: ScoreBin[] = useMemo(
    () => buildDistribution(sessions, noteTotal),
    [sessions, noteTotal]
  )

  const questionSuccessData: QuestionSuccess[] = useMemo(
    () => buildQuestionSuccess(sessions),
    [sessions]
  )

  // Données RÉELLES pour le graphique radar (performance par type de question).
  // Gère les deux schémas de detailParQuestion (bareme/score ET pointsMax/pointsObtenus).
  const radarData = useMemo(() => buildPerformanceByType(sessions), [sessions])

  // Handlers
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

  const safeFilename = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)

  // Export CSV / JSON (côté client)
  const handleTextExport = (format: 'csv' | 'json') => {
    if (!selectedEpreuveId || sessions.length === 0) return
    const title = selectedEpreuve?.titre ?? 'epreuve'
    if (format === 'csv') {
      sessionsToCSV(sessions, noteTotal, title)
      toast.success('Export CSV réussi', { description: `${sessions.length} copies exportées` })
      return
    }
    sessionsToJSON(sessions, stats as Record<string, unknown> | null, title)
    toast.success('Export JSON réussi', { description: `${sessions.length} copies exportées` })
  }

  // Export PDF (backend endpoint — la SEULE route d'export PDF existante)
  const handlePdfExport = async () => {
    if (!selectedEpreuveId) return
    setIsExportingPdf(true)
    try {
      const res = await fetch(`/api/epreuves/${selectedEpreuveId}/export?format=pdf`)
      if (!res.ok) {
        throw new Error(`Export PDF échoué (${res.status})`)
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resultats_${safeFilename(selectedEpreuve?.titre ?? 'epreuve')}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Export PDF réussi', {
        description: selectedEpreuve?.titre ?? 'Épreuve',
      })
    } catch (err) {
      console.error('[ExamTab] PDF export failed', err)
      toast.error("Erreur d'export PDF", {
        description: "Le serveur n'a pas pu générer le PDF. Réessayez ultérieurement.",
      })
    } finally {
      setIsExportingPdf(false)
    }
  }

  // Render
  return (
    <div className="space-y-6">
      {/* Sélecteur d'épreuve + actions */}
      <Card className="ds-kente-top">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium" htmlFor="epreuve-select">
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
                <SelectTrigger id="epreuve-select" className="w-full sm:max-w-md">
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
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
                    aria-label="Rafraîchir les résultats de l'épreuve"
                  >
                    <RefreshCw className={`h-4 w-4 ${resultsQuery.isFetching ? 'animate-spin' : ''}`} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sessions.length === 0}
                        className="border-primary/30 bg-primary/5 text-primary-text hover:bg-primary/10 hover:text-primary-text"
                      >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Exporter</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleTextExport('csv')}>
                        <FileSpreadsheet className="h-4 w-4 text-primary-text" />
                        Exporter CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTextExport('json')}>
                        <FileJson className="h-4 w-4 text-secondary" />
                        Exporter JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handlePdfExport}
                        disabled={isExportingPdf}
                      >
                        <FileText className="h-4 w-4 text-gold" />
                        {isExportingPdf ? 'Génération...' : 'Exporter PDF'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>

          {/* Indicateur de filtre actif (tranche) */}
          {activeScoreBin && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-primary-text" />
              <span className="text-xs text-primary-text">
                Filtre actif : tranche {activeScoreBin}
              </span>
              <button
                onClick={() => setActiveScoreBin(null)}
                className="ml-auto text-xs text-primary-text underline hover:text-primary-text/80"
              >
                Retirer le filtre
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* États : vide / chargement / erreur / contenu */}
      {!selectedEpreuveId ? (
        <div className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="h-10 w-10 text-primary-text" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
            Sélectionnez une épreuve pour voir les résultats
          </h3>
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
        <Card className="ds-kente-top border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-sm font-medium">Erreur de chargement</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Impossible de charger les résultats de cette épreuve.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resultsQuery.refetch()}
              className="border-primary/30 text-primary-text hover:bg-primary/5"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : sessions.length === 0 && stats ? (
        <Card className="ds-kente-watermark border-l-4 border-l-warning">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <Users className="h-7 w-7 text-warning" />
            </div>
            <p className="text-sm font-medium">Aucune copie soumise</p>
            <p className="max-w-xs text-sm text-muted-foreground">
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
              index={0}
            />
            <StatCard
              icon={BarChart2}
              label="Médiane"
              value={stats.mediane.toFixed(1)}
              suffix={`/${noteTotal}`}
              accent="primary"
              scoreOn20={(stats.mediane / noteTotal) * 20}
              index={1}
            />
            <StatCard
              icon={Trophy}
              label="Taux de réussite"
              value={stats.tauxReussite}
              suffix="%"
              accent={stats.tauxReussite >= 50 ? 'success' : 'warning'}
              index={2}
            />
            <StatCard
              icon={Users}
              label="Nombre de copies"
              value={stats.totalSessions}
              hint={`${stats.corriges} corrigé${stats.corriges > 1 ? 'es' : ''}`}
              accent="info"
              index={3}
            />
          </div>

          {/* Graphiques : Distribution + Radar (performance par type) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Distribution des notes"
              description="Cliquez sur une barre pour filtrer le tableau"
              icon={<BarChart3 className="h-4 w-4 text-primary-text" />}
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

            {/* Graphique radar : performance par type de question (données réelles) */}
            {radarData.length > 0 ? (
              <ChartCard
                title="Performance par type de question"
                description="Moyenne /20 calculée par type (gère les 2 schémas de notation)"
                icon={<Radar className="h-4 w-4 text-gold" />}
              >
                <div className="h-64">
                  <ComparisonRadarChart
                    data={radarData}
                    height={256}
                    title=""
                    description=""
                  />
                </div>
              </ChartCard>
            ) : (
              <ChartCard
                title="Performance par type de question"
                description="Aucune donnée disponible"
                icon={<Radar className="h-4 w-4 text-muted-foreground" />}
              >
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée de type de question disponible
                </div>
              </ChartCard>
            )}
          </div>

          {/* Graphique taux de réussite par question */}
          <div className="grid gap-6 lg:grid-cols-1">
            <ChartCard
              title="Taux de réussite par question"
              description="Cliquez pour mettre en évidence une question"
              icon={<Target className="h-4 w-4 text-secondary" />}
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
