// ═══════════════════════════════════════════════════════════════════════════════
// Vue d'ensemble (Overview) — analytics cross-exam, identité Savane EdTech.
// Layout : 4 StatCards → 2 charts (Évolution + Taux de correction) →
// 2 cards (Top questions + Aperçu étudiants à risque) → Tableau épreuves → Liste complète.
// ═══════════════════════════════════════════════════════════════════════════════

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
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
} from 'lucide-react'
import { StatCard } from '@/components/ds'
import {
  ChartCard,
  EvolutionChart,
  ComparisonChart,
  CorrectionDonutChart,
} from './resultats-charts'
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
import { SavaneIllustration } from './savane-illustration'

interface OverviewTabProps {
  data: OverviewResponse
}

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
          name: e.titre.length > 18 ? e.titre.slice(0, 18) + '…' : e.titre,
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

  // Aperçu top 3 étudiants à risque (la liste complète est dans l'onglet dédié)
  const atRiskPreview = studentsAtRisk.slice(0, 3)

  return (
    <div className="space-y-6">
      {/* KPIs globaux avec style Savane EdTech */}
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
          value={data.globalTauxReussite.toFixed(1)}
          suffix="%"
          accent={data.globalTauxReussite >= 50 ? 'success' : 'warning'}
          index={3}
        />
      </div>

      {/* Graphiques : Évolution + Taux de correction (donut, données réelles) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Évolution des moyennes"
          description="Moyenne mensuelle sur les 12 derniers mois"
          icon={<Calendar className="h-4 w-4 text-primary-text" />}
        >
          <div className="h-72">
            <EvolutionChart data={evolutionData} height={288} />
          </div>
        </ChartCard>

        <ChartCard
          title="Taux de correction"
          description="Copies corrigées vs en attente (données réelles)"
          icon={<CheckCircle2 className="h-4 w-4 text-success-text" />}
        >
          <div className="flex h-72 items-center justify-center">
            <CorrectionDonutChart
              total={data.totalSessions}
              corrigees={data.totalCorrigees}
              height={260}
            />
          </div>
        </ChartCard>
      </div>

      {/* Top questions difficiles + Aperçu étudiants à risque (top 3) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top questions les plus ratées */}
        <Card className="ds-kente-top overflow-hidden border-l-4 border-l-destructive">
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
              <div className="ds-kente-watermark relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed py-10 text-center">
                {/* Illustration adinkra subtile en watermark (B10) */}
                <SavaneIllustration
                  variant="adinkra"
                  size={110}
                  className="pointer-events-none absolute -right-2 -bottom-2 text-destructive"
                />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Target className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">Aucune donnée disponible</p>
                </div>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2 pr-3">
                  {topQuestions.map((q, idx) => {
                    const tauxFmt = Math.round(q.tauxReussite * 10) / 10
                    return (
                      <div
                        key={`${q.epreuveId}-${q.questionIndex}`}
                        className="overflow-hidden rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                      >
                        {/* BUGFIX (LAYOUT-OVERFLOW-1) : overflow-hidden sur la carte
                            pour empêcher le texte de déborder vers la droite.
                            gap-2.5 (au lieu de gap-3) pour gagner de l'espace horizontal
                            sur tablette/mobile où le bug de superposition apparaissait. */}
                        <div className="flex items-start gap-2.5">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white tabular-nums sm:h-9 sm:w-9"
                            style={{ backgroundColor: getBarColor((tauxFmt / 100) * 20) }}
                          >
                            {idx + 1}
                          </div>
                          {/* min-w-0 + overflow-hidden : garantit que le contenu
                              ne dépasse jamais la largeur disponible du flex item. */}
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" size="sm" className="shrink-0">
                                {q.type}
                              </Badge>
                              <span className="truncate text-xs text-muted-foreground">
                                {q.epreuveTitre}
                              </span>
                            </div>
                            {/* line-clamp-3 (au lieu de 2) pour les énoncés longs
                                (certains font 200+ caractères). break-words + hyphens-auto. */}
                            <p className="mt-1 line-clamp-3 break-words text-sm leading-relaxed hyphens-auto">{q.enonce}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${tauxFmt}%`,
                                    backgroundColor: getBarColor((tauxFmt / 100) * 20),
                                  }}
                                />
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                                {tauxFmt}% · {q.count} rep.
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

        {/* Aperçu étudiants à risque (top 3) */}
        <Card className="ds-kente-top border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Étudiants à surveiller
                </CardTitle>
                <CardDescription>
                  Aperçu — voir l&apos;onglet « Étudiants » pour la liste complète
                </CardDescription>
              </div>
              {studentsAtRisk.length > 0 && (
                <Badge variant="warning" size="sm">
                  {studentsAtRisk.length} au total
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {atRiskPreview.length === 0 ? (
              <div className="ds-kente-watermark relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed py-10 text-center">
                {/* Illustration baobab subtile en watermark (B10) */}
                <SavaneIllustration
                  variant="baobab"
                  size={120}
                  className="pointer-events-none absolute -right-2 -bottom-2 text-success"
                />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle2 className="h-6 w-6 text-success-text" />
                  </div>
                  <p className="mt-3 text-sm font-medium">Tous vos étudiants s&apos;en sortent bien</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Aucun étudiant n&apos;a une moyenne inférieure à 8/20.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {atRiskPreview.map((s, idx) => (
                  <div
                    key={s.etudiantId}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold tabular-nums text-destructive">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.etudiantName}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {s.etudiantEmail}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="danger" size="sm" className="tabular-nums">
                        {(s.moyenne ?? 0).toFixed(1)}/20
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {s.nbExamens} épreuve{s.nbExamens > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
                {studentsAtRisk.length > 3 && (
                  <p className="pt-1 text-center text-xs text-muted-foreground tabular-nums">
                    +{studentsAtRisk.length - 3} autre(s) étudiant(s) en difficulté
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Liste détaillée des épreuves avec style Kente */}
      <Card className="ds-kente-top">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
                <TrendingUp className="h-4 w-4 text-primary-text" />
                Toutes vos épreuves
              </CardTitle>
              <CardDescription className="tabular-nums">
                {data.epreuves.length} épreuve{data.epreuves.length > 1 ? 's' : ''} terminée{data.epreuves.length > 1 ? 's' : ''}
              </CardDescription>
            </div>
            {/* B4 : légende claire avec 3 pastilles colorées (≥16 or, ≥10 vert, <10 rouge) */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gold" />
                Moy. ≥16
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Moy. ≥10
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Moy. &lt;10
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {epreuves.length === 0 ? (
            <div className="ds-kente-watermark relative flex flex-col items-center justify-center overflow-hidden py-12 text-center">
              {/* Illustration baobab subtile en watermark (B10) */}
              <SavaneIllustration
                variant="baobab"
                size={130}
                className="pointer-events-none absolute -right-2 -bottom-2 text-primary"
              />
              <div className="relative z-10 flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Aucune épreuve terminée disponible</p>
              </div>
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
                          <p className="text-xs text-muted-foreground tabular-nums">/{e.noteTotal}</p>
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground tabular-nums">
                          {formatDateShortFR(e.dateFin || e.dateDebut)}
                        </td>
                        <td className="py-3 pr-4 text-center text-sm tabular-nums">{e.nbSessions}</td>
                        <td className="py-3 pr-4 text-center text-sm">
                          {e.nbCorrigees === e.nbSessions ? (
                            <span className="inline-flex items-center gap-1 text-success-text tabular-nums">
                              <CheckCircle2 className="h-3 w-3" />
                              {e.nbCorrigees}/{e.nbSessions}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warning tabular-nums">
                              <Clock className="h-3 w-3" />
                              {e.nbCorrigees}/{e.nbSessions}
                            </span>
                          )}
                        </td>
                        <td className={`py-3 pr-4 text-center text-sm font-bold tabular-nums ${getScoreColor(scoreOn20)}`}>
                          {(e.moyenne ?? 0).toFixed(1)}/20
                        </td>
                        <td className="py-3 pr-4 text-center text-sm text-muted-foreground tabular-nums">
                          {(e.mediane ?? 0).toFixed(1)}
                        </td>
                        <td className="py-3 text-center">
                          <Badge
                            variant={e.tauxReussite >= 70 ? 'success' : e.tauxReussite >= 40 ? 'warning' : 'danger'}
                            size="sm"
                            className="tabular-nums"
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

      {/* Comparaison cross-exam (8 dernières épreuves) */}
      {comparisonData.length > 0 && (
        <ChartCard
          title="Comparaison par épreuve"
          description="Moyenne /20 de vos 8 épreuves les plus récentes"
          icon={<BarChart3 className="h-4 w-4 text-secondary" />}
        >
          <div className="h-72">
            <ComparisonChart data={comparisonData} height={288} accent="secondary" />
          </div>
        </ChartCard>
      )}
    </div>
  )
}
