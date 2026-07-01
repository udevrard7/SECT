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
  formatDateShortFR,
  scoreToPercentage,
} from '@/lib/resultats-utils'
import { StatCard } from '@/components/ds'
import { ChartCard, DistributionChart, QuestionSuccessChart } from './resultats-charts'
import { ComparisonRadarChart } from './comparison-radar-chart'
import { ResultsTable } from './results-table'
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from './resultats-skeletons'
import { SessionDetailDialog } from './session-detail-dialog'
import { SavaneIllustration } from './savane-illustration'
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

  // Export PDF — 100% côté client (jsPDF + autotable), même pattern que ResultatsPDFExport.
  // BUGFIX (B1) : l'ancienne implémentation appelait `/api/epreuves/{id}/export?format=pdf`
  // qui n'existe PAS côté backend (route jamais déclarée dans router.go → 404 systématique).
  // On génère désormais un PDF entièrement côté client avec les données déjà disponibles
  // (sessions + stats + noteTotal). Bandeau Kente tricolore, KPIs, tableau des sessions.
  const handlePdfExport = async () => {
    if (!selectedEpreuveId || sessions.length === 0 || !stats) return
    setIsExportingPdf(true)
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const autoTable = (autoTableMod.default ?? autoTableMod) as (
        doc: unknown,
        options: unknown
      ) => void

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const now = new Date()
      const titre = selectedEpreuve?.titre ?? 'Épreuve'

      // ─── Bandeau Kente (vert lime / terre cuite / or) ───
      const stripeHeight = 6
      const w = pageWidth / 3
      doc.setFillColor(132, 204, 22) // vert lime (--primary)
      doc.rect(0, 0, w, stripeHeight, 'F')
      doc.setFillColor(194, 65, 12) // terre cuite (--secondary)
      doc.rect(w, 0, w, stripeHeight, 'F')
      doc.setFillColor(212, 160, 23) // or (--gold)
      doc.rect(2 * w, 0, w, stripeHeight, 'F')

      // ─── Titre + date d'édition ───
      doc.setTextColor(44, 62, 80) // bleu nuit (--info)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text(`Résultats — ${titre.length > 60 ? titre.slice(0, 57) + '...' : titre}`, 40, 48)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      doc.text(
        `Édité le ${formatDateShortFR(now)} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
        40,
        64
      )

      // ─── KPIs (4 cartes avec bordure colorée par accent) ───
      const kpiY = 88
      const cardW = (pageWidth - 80 - 30) / 4
      const cardH = 60
      const kpis: Array<{ label: string; value: string; r: number; g: number; b: number }> = [
        {
          label: 'Moyenne',
          value: `${(stats.moyenneBrute ?? stats.moyenne).toFixed(1)}/${noteTotal}`,
          r: 132,
          g: 204,
          b: 22,
        },
        {
          label: 'Médiane',
          value: `${(stats.medianeBrute ?? stats.mediane).toFixed(1)}/${noteTotal}`,
          r: 44,
          g: 62,
          b: 80,
        },
        {
          label: 'Taux de réussite',
          value: `${stats.tauxReussite.toFixed(1)}%`,
          r: 212,
          g: 160,
          b: 23,
        },
        {
          label: 'Copies',
          value: String(stats.totalSessions),
          r: 194,
          g: 65,
          b: 12,
        },
      ]
      kpis.forEach((kpi, i) => {
        const x = 40 + i * (cardW + 10)
        doc.setFillColor(245, 247, 250)
        doc.roundedRect(x, kpiY, cardW, cardH, 4, 4, 'F')
        doc.setDrawColor(kpi.r, kpi.g, kpi.b)
        doc.setLineWidth(2)
        doc.line(x, kpiY, x, kpiY + cardH)
        doc.setTextColor(107, 114, 128)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(kpi.label.toUpperCase(), x + 8, kpiY + 16)
        doc.setTextColor(kpi.r, kpi.g, kpi.b)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.text(kpi.value, x + 8, kpiY + 42)
      })

      // ─── Tableau des sessions ───
      let cursorY = kpiY + cardH + 24
      doc.setTextColor(44, 62, 80)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('Détail des copies', 40, cursorY)
      cursorY += 6

      const body = sessions.map((s, i) => {
        const score = s.score ?? 0
        const pct = scoreToPercentage(score, noteTotal)
        const statut = s.statut ?? '—'
        const alertes = s.alertes ?? 0
        const alerteTxt = alertes > 0 ? `${alertes} alerte${alertes > 1 ? 's' : ''}` : '—'
        return [
          String(i + 1),
          s.etudiant.name.length > 32 ? s.etudiant.name.slice(0, 29) + '...' : s.etudiant.name,
          s.etudiant.email.length > 40 ? s.etudiant.email.slice(0, 37) + '...' : s.etudiant.email,
          `${score.toFixed(2)}/${noteTotal}`,
          `${pct}%`,
          statut,
          alerteTxt,
        ]
      })

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'Étudiant', 'Email', 'Score', 'Pct', 'Statut', 'Alertes']],
        body: body.length > 0 ? body : [['—', 'Aucune copie', '', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [132, 204, 22], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [44, 62, 80] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 40, right: 40 },
        styles: { cellPadding: 5 },
      })

      // ─── Pied de page sur chaque page ───
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const h = doc.internal.pageSize.getHeight()
        doc.setDrawColor(224, 224, 224)
        doc.setLineWidth(0.5)
        doc.line(40, h - 30, pageWidth - 40, h - 30)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(107, 114, 128)
        doc.text('SECT — Savane EdTech', 40, h - 18)
        doc.text(`Page ${i} / ${pageCount}`, pageWidth - 40, h - 18, { align: 'right' })
      }

      const filename = `resultats_${safeFilename(titre)}.pdf`
      doc.save(filename)
      toast.success('Export PDF réussi', { description: filename })
    } catch (err) {
      console.error('[ExamTab] PDF export failed', err)
      toast.error("Erreur d'export PDF", {
        description: 'Impossible de générer le PDF. Réessayez ou contactez l\'administrateur.',
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
                  ) : epreuvesQuery.isError ? (
                    // B6 : on distingue l'erreur du vide pour ne pas tromper l'utilisateur.
                    <SelectItem value="_error" disabled>
                      <span className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Erreur de chargement
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
        <div className="ds-kente-watermark relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed py-16 text-center">
          {/* Illustration baobab subtile en watermark (B10) */}
          <SavaneIllustration
            variant="baobab"
            size={140}
            className="pointer-events-none absolute -right-2 -bottom-2 text-primary"
          />
          <div className="relative z-10 flex flex-col items-center">
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
              value={(stats.moyenneBrute ?? stats.moyenne).toFixed(1)}
              suffix={`/${noteTotal}`}
              accent="success"
              scoreOn20={stats.moyenne}
              index={0}
            />
            <StatCard
              icon={BarChart2}
              label="Médiane"
              value={(stats.medianeBrute ?? stats.mediane).toFixed(1)}
              suffix={`/${noteTotal}`}
              accent="primary"
              scoreOn20={stats.mediane}
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

          {/* Graphiques : Distribution (+ Radar si des données par type existent, B7). */}
          {/* B7 : si radarData est vide, on NE génère pas le ChartCard dédié (gain de
              place visuelle) et la distribution prend toute la largeur (lg:grid-cols-1). */}
          <div
            className={
              radarData.length > 0 ? 'grid gap-6 lg:grid-cols-2' : 'grid gap-6 lg:grid-cols-1'
            }
          >
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

            {/* Graphique radar : performance par type de question (données réelles). */}
            {radarData.length > 0 && (
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
