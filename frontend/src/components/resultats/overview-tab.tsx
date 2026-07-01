// [35m══════════════════════════════════════════════════════════════════════════════
// Vue d'ensemble (Overview)  analytics cross-exam avec identité Savane EdTech
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useMemo } from 'react'
import {
  TrendingUp,
  Trophy,
  Users,
  Target,
  GraduationCap,
  BarChart3,
  Calendar,
  GitCompare,
  BookOpen,
  AlertTriangle,
} from 'lucide-react'
import { StatCard } from '@/components/ds'
import { StudentsAtRiskList } from './students-at-risk'
import {
  ChartCard,
  EvolutionChart,
  ComparisonChart,
} from './resultats-charts'
import { DistributionPieChart } from './distribution-pie-chart'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ds/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  formatMonthShortFR,
  getScoreColor,
  getBarColor,
  formatDateShortFR,
} from '@/lib/resultats-utils'
import type { OverviewResponse } from '@/types/resultats'

interface OverviewTabProps {
  data: OverviewResponse
}

/**
 * OverviewTab  Vue d'ensemble des résultats avec KPIs, graphiques et analyses.
 *
 * @param data  Données de l'overview (KPIs, évolution, étudiants à risque, top questions)
 */
export function OverviewTab({ data }: OverviewTabProps) {
  const epreuves = data?.epreuves ?? []
  const evolution = data?.evolution ?? []
  const studentsAtRisk = data?.studentsAtRisk ?? []

  // Données pour le graphique de comparaison (8 dernières épreuves)
  const comparisonData = useMemo(
    () =>
      epreuves
        .slice(0, 8)
        .map((e) => ({
          name: e.titre.length > 18 ? e.titre.slice(0, 18) + '' : e.titre,
          value: Number((e.moyenne ?? 0).toFixed(2)),
          count: e.nbSessions,
        })),
    [epreuves]
  )

  // Données pour le graphique d'évolution (avec mois formatés)
  const evolutionData = useMemo(
    () => evolution.map((e) => ({ ...e, mois: formatMonthShortFR(e.mois) })),
    [evolution]
  )

  // Top 5 questions les plus difficiles
  const topQuestions = (data?.topQuestions ?? []).slice(0, 5)

  // Données pour le camembert de répartition des notes
  // Note: Ces données sont simulées car non disponibles dans l'API actuelle.
  // À terme, elles devraient être calculées côté backend.
  const distributionData = useMemo(
    () => [
      {
        name: '16-20 (Excellent)',
        value: Math.round(data.globalTauxReussite * 0.6) || 0,
        color: 'hsl(var(--chart-1))', // Vert lime
      },
      {
        name: '12-16 (Bon)',
        value: Math.round(data.globalTauxReussite * 0.3) || 0,
        color: 'hsl(var(--chart-2))', // Terre cuite
      },
      {
        name: '8-12 (Moyen)',
        value: Math.round((100 - data.globalTauxReussite) * 0.6) || 0,
        color: 'hsl(var(--chart-4))', // Orange
      },
      {
        name: '0-8 (Insuffisant)',
        value: Math.round((100 - data.globalTauxReussite) * 0.4) || 0,
        color: 'hsl(var(--chart-5))', // Rouge
      },
    ],
    [data.globalTauxReussite]
  )

  return (
    <div className="space-y-6">
      {/* [36mKPIs globaux avec style Savane EdTech[0m */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GraduationCap}
          label="Épreuves terminées"
          value={data.totalEpreuves}
          accent="primary"
          index={0}
        />
        <StatCard
          icon={Users}
          label="Total copies"
          value={data.totalSessions}
          hint={`${data.totalCorrigees} corrigées`}
          accent="secondary"
          index={1}
        />
        <StatCard
          icon={Target}
          label="Moyenne globale"
          value={(data?.globalMoyenne ?? 0).toFixed(1)}
          suffix="/20"
          accent="info"
          scoreOn20={data.globalMoyenne}
          index={2}
        />
        <StatCard
          icon={Trophy}
          label="Taux de réussite"
          value={data.globalTauxReussite}
          suffix="%"
          accent={data.globalTauxReussite >= 50 ? 'success' : 'warning'}
          index={3}
        />
      </div>

      {/* [36mGraphiques : Évolution + Comparaison + Répartition[0m */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Évolution des moyennes"
          description="Moyenne mensuelle sur les 12 derniers mois"
          icon={<Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        >
          <div className="h-72">
            <EvolutionChart data={evolutionData} height={288} />
          </div>
        </ChartCard>

        <ChartCard
          title="Comparaison par épreuve"
          description="Moyenne /20 de vos épreuves récentes"
          icon={<GitCompare className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
        >
          <div className="h-72">
            <ComparisonChart data={comparisonData} height={288} />
          </div>
        </ChartCard>
      </div>

      {/* [36mRépartition des notes (Camembert) + Top questions[0m */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionPieChart data={distributionData} />

        {/* Top questions les plus ratées */}
        <Card className="ds-kente-top border-l-4 border-l-destructive">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
                  <BarChart3 className="h-4 w-4 text-destructive" />
                  Questions les plus difficiles
                </CardTitle>
                <CardDescription>Questions avec le plus faible taux de réussite</CardDescription>
              </div>
              <Badge variant="danger" size="sm">
                À retravailler
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {topQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
                <Target className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">Aucune donnée disponible</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2 pr-2">
                  {topQuestions.map((q, idx) => {
                    const tauxFmt = Math.round(q.tauxReussite * 10) / 10
                    return (
                      <div
                        key={`${q.epreuveId}-${q.questionIndex}`}
                        className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: getBarColor((tauxFmt / 100) * 20) }}
                          >
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" size="sm">
                                {q.type}
                              </Badge>
                              <span className="truncate text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                                {q.epreuveTitre}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm break-words overflow-hidden">{q.enonce}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${tauxFmt}%`,
                                    backgroundColor: getBarColor((tauxFmt / 100) * 20),
                                  }}
                                />
                              </div>
                              <span className="shrink-0 text-xs font-semibold font-mono tabular-nums text-muted-foreground">
                                {tauxFmt}%  {q.count} rep.
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* [36mListe détaillée des épreuves avec style Kente[0m */}
      <Card className="ds-kente-top">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
            <TrendingUp className="h-4 w-4 text-primary-text" />
            Toutes vos épreuves
          </CardTitle>
          <CardDescription>
            {data.epreuves.length} épreuve{data.epreuves.length > 1 ? 's' : ''} terminée{data.epreuves.length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {epreuves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm text-muted-foreground">Aucune épreuve terminée disponible</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Épreuve</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 text-center font-medium">Copies</th>
                    <th className="pb-2 pr-4 text-center font-medium">Corrigées</th>
                    <th className="pb-2 pr-4 text-center font-medium">Moyenne</th>
                    <th className="pb-2 pr-4 text-center font-medium">Médiane</th>
                    <th className="pb-2 text-center font-medium">Réussite</th>
                  </tr>
                </thead>
                <tbody>
                  {data.epreuves.map((e) => {
                    const scoreOn20 = e.moyenne
                    return (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 pr-4">
                          <p className="max-w-[200px] truncate text-sm font-medium">{e.titre}</p>
                          <p className="text-xs text-muted-foreground">/{e.noteTotal}</p>
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {formatDateShortFR(e.dateFin || e.dateDebut)}
                        </td>
                        <td className="py-3 pr-4 text-center text-sm">{e.nbSessions}</td>
                        <td className="py-3 pr-4 text-center text-sm">
                          <span className={e.nbCorrigees === e.nbSessions ? 'text-success-text' : 'text-warning'}>
                            {e.nbCorrigees}/{e.nbSessions}
                          </span>
                        </td>
                        <td className={`py-3 pr-4 text-center text-sm font-bold ${getScoreColor(scoreOn20)}`}>
                          {(e.moyenne ?? 0).toFixed(1)}/20
                        </td>
                        <td className="py-3 pr-4 text-center text-sm text-muted-foreground">
                          {(e.mediane ?? 0).toFixed(1)}
                        </td>
                        <td className="py-3 text-center">
                          <Badge
                            variant={e.tauxReussite >= 50 ? 'success' : 'warning'}
                            size="sm"
                          >
                            {Math.round(e.tauxReussite * 10) / 10}%
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* [36mÉtudiants en difficulté (intégré directement pour fluidité)[0m */}
      {studentsAtRisk.length > 0 && (
        <StudentsAtRiskList students={studentsAtRisk} />
      )}
    </div>
  )
}
