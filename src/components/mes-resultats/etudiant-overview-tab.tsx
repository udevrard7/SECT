// ─────────────────────────────────────────────────────────────
// Vue d'ensemble étudiant — KPIs + évolution + perf par type
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import {
  Trophy,
  Target,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Calendar,
  BarChart3,
  PieChart,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ds'
import { ChartCard, EvolutionChart, DistributionChart } from '@/components/resultats/resultats-charts'
import {
  formatMonthShortFR,
  formatDateShortFR,
  getScoreColor,
  getBarColor,
} from '@/lib/resultats-utils'
import type { EtudiantOverviewResponse, ScoreBin } from '@/types/resultats'

interface EtudiantOverviewTabProps {
  data: EtudiantOverviewResponse
}

const TYPE_LABELS: Record<string, string> = {
  QCU: 'QCU (choix unique)',
  QCM: 'QCM (choix multiple)',
  QRC: 'QRC (réponse courte)',
  TRS: 'TRS (texte à trous)',
  REFLEXION: 'Réflexion',
  CODE: 'Code',
}

export function EtudiantOverviewTab({ data }: EtudiantOverviewTabProps) {
  const evolutionData = useMemo(
    () => data.evolution.map((e) => ({ ...e, mois: formatMonthShortFR(e.mois) })),
    [data.evolution]
  )

  const distributionData: ScoreBin[] = useMemo(() => {
    const bins = [
      { label: '0-4', min: 0, max: 4 },
      { label: '4-8', min: 4, max: 8 },
      { label: '8-10', min: 8, max: 10 },
      { label: '10-12', min: 10, max: 12 },
      { label: '12-14', min: 12, max: 14 },
      { label: '14-16', min: 14, max: 16 },
      { label: '16-20', min: 16, max: 20.01 },
    ]
    return bins.map((b, i) => ({
      name: b.label,
      count: data.distribution[i]?.count ?? 0,
      midpoint: (b.min + b.max) / 2,
      min: b.min,
      max: b.max,
    }))
  }, [data.distribution])

  const performanceData = useMemo(
    () =>
      data.performanceParType.map((p) => ({
        name: p.type,
        value: p.moyenne,
        count: p.count,
      })),
    [data.performanceParType]
  )

  const tendanceIcon =
    data.tendance > 0.3 ? (
      <TrendingUp className="h-4 w-4 text-success" />
    ) : data.tendance < -0.3 ? (
      <TrendingDown className="h-4 w-4 text-destructive" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground" />
    )
  const tendanceLabel =
    data.tendance > 0.3
      ? 'En progression'
      : data.tendance < -0.3
        ? 'En régression'
        : 'Stable'
  const tendanceColor =
    data.tendance > 0.3
      ? 'text-success'
      : data.tendance < -0.3
        ? 'text-destructive'
        : 'text-muted-foreground'

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Target}
          label="Moyenne générale"
          value={data.moyenneGenerale.toFixed(1)}
          suffix="/20"
          accent="success"
          scoreOn20={data.moyenneGenerale}
        />
        <StatCard
          icon={BookOpen}
          label="Épreuves passées"
          value={data.totalEpreuves}
          hint={`${data.totalCorrigees} corrigée${data.totalCorrigees > 1 ? 's' : ''}`}
          accent="primary"
        />
        <StatCard
          icon={Award}
          label="Meilleure note"
          value={data.meilleureNote.toFixed(1)}
          suffix="/20"
          accent="info"
          scoreOn20={data.meilleureNote}
        />
        <StatCard
          icon={Trophy}
          label="Taux de réussite"
          value={data.tauxReussite}
          suffix="%"
          accent={data.tauxReussite >= 50 ? 'success' : 'warning'}
        />
      </div>

      {/* Bannière de progression */}
      {data.totalCorrigees >= 3 && (
        <Card className={`border-l-4 ${data.tendance > 0.3 ? 'border-l-success' : data.tendance < -0.3 ? 'border-l-destructive' : 'border-l-slate-400'}`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              data.tendance > 0.3
                ? 'bg-success/10'
                : data.tendance < -0.3
                  ? 'bg-destructive/10'
                  : 'bg-muted'
            }`}>
              {tendanceIcon}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {tendanceLabel}
                <span className={`ml-2 font-mono text-lg font-bold tabular-nums ${tendanceColor}`}>
                  {data.tendance > 0 ? '+' : ''}{data.tendance.toFixed(1)}
                </span>
                <span className="text-sm font-normal text-muted-foreground">/20</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Comparaison de vos 3 dernières épreuves avec les 3 précédentes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Graphiques */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Évolution de mes notes"
          description="Moyenne mensuelle sur les 12 derniers mois"
          icon={<Calendar className="h-4 w-4 text-success" />}
        >
          <div className="h-72">
            {evolutionData.length > 0 ? (
              <EvolutionChart data={evolutionData} height={288} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Pas encore assez de données
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Distribution de mes notes"
          description="Répartition de vos scores par tranche"
          icon={<BarChart3 className="h-4 w-4 text-secondary" />}
        >
          <div className="h-72">
            <DistributionChart data={distributionData} height={288} noteTotal={20} />
          </div>
        </ChartCard>
      </div>

      {/* Performance par type de question */}
      {performanceData.length > 0 && (
        <ChartCard
          title="Performance par type de question"
          description="Vos forces et faiblesses selon le type de question"
          icon={<PieChart className="h-4 w-4 text-success" />}
        >
          <div className="space-y-3 pt-2">
            {performanceData.map((p) => {
              const scoreOn20 = p.value
              return (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="w-40 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {p.name}
                    </Badge>
                  </div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (scoreOn20 / 20) * 100)}%`,
                        backgroundColor: getBarColor(scoreOn20),
                      }}
                    />
                  </div>
                  <div className="flex w-24 shrink-0 items-center justify-end gap-1">
                    <span className={`font-mono text-sm font-bold tabular-nums ${getScoreColor(scoreOn20)}`}>
                      {p.value.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">/20</span>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {p.count} q.
                  </span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      )}

      {/* Résultats récents */}
      {data.recentResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Trophy className="h-4 w-4 text-success" />
              Résultats récents
            </CardTitle>
            <CardDescription>Vos 5 dernières épreuves</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {data.recentResults.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums text-white"
                    style={{ backgroundColor: getBarColor(r.scoreOn20) }}
                  >
                    {r.percentage}%
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.titre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.enseignant} · {formatDateShortFR(r.dateFin)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-mono text-sm font-bold tabular-nums ${getScoreColor(r.scoreOn20)}`}>
                      {r.scoreOn20.toFixed(1)}/20
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        r.isReturned
                          ? 'bg-secondary/10 text-secondary border-secondary/20'
                          : r.isCorrected
                            ? 'bg-success/10 text-success border-success/20'
                            : 'bg-warning/10 text-warning border-warning/20'
                      }`}
                    >
                      {r.isReturned ? 'Rendu' : r.isCorrected ? 'Corrigé' : 'En attente'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
