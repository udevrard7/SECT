// [35m══════════════════════════════════════════════════════════════════════════════
// Page principale "Résultats & Analyses" (refonte complète avec identité Savane EdTech)
// Onglets : Vue d'ensemble | Par épreuve | Étudiants en difficulté
// Design System : Palette africaine (vert lime + terre cuite + bleu nuit + or) + motifs Kente
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState } from 'react'
import {
  TrendingUp,
  LayoutDashboard,
  FileBarChart,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ds/badge' // Utilisation du Badge DS unifié
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useResultatsOverview, useRefreshResultats } from '@/hooks/use-resultats'
import { PageSkeleton } from './resultats-skeletons'
import { OverviewTab } from './overview-tab'
import { ExamTab } from './exam-tab'
import { StudentsAtRiskList } from './students-at-risk'
import { Card, CardContent } from '@/components/ui/card'
import { ResultatsPDFExport } from './resultats-pdf-export'

export function ResultatsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState('overview')

  const overviewQuery = useResultatsOverview(user?.id)
  const refresh = useRefreshResultats()

  // Page skeleton tant que l'overview n'est pas chargé
  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <PageSkeleton />
  }

  const overview = overviewQuery.data
  const atRiskCount = overview?.studentsAtRisk.length ?? 0

  return (
    <div className="space-y-6">
      {/* [36mHeader avec motif Kente et identité africaine[0m */}
      <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-xl px-4 py-6 sm:mx-0 sm:rounded-2xl sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              Résultats & Analyses
            </h1>
            <p className="mt-1 text-sm text-muted-foreground/80">
              Consultez et analysez les résultats de vos épreuves avec une vue d'ensemble inspirée des savanes africaines.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ResultatsPDFExport data={overview} />
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={overviewQuery.isFetching}
              className="border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary-text hover:text-primary-text"
            >
              <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* [36mOnglets avec style Kente[0m */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 backdrop-blur-sm sm:inline-flex sm:w-auto">
          <TabsTrigger
            value="overview"
            className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary-text data-[state=active]:shadow-sm"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Vue d&apos;ensemble</span>
            <span className="sm:hidden">Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="exam"
            className="gap-1.5 data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary-foreground data-[state=active]:shadow-sm"
          >
            <FileBarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Par épreuve</span>
            <span className="sm:hidden">Épreuve</span>
          </TabsTrigger>
          <TabsTrigger
            value="students"
            className="gap-1.5 data-[state=active]:bg-warning/10 data-[state=active]:text-warning-foreground data-[state=active]:shadow-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Étudiants</span>
            <span className="sm:hidden">Étud.</span>
            {atRiskCount > 0 && (
              <Badge variant="danger" className="ml-1 h-5 min-w-5 justify-center px-1 text-xs">
                {atRiskCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Vue d'ensemble */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {overviewQuery.isError ? (
            <Card className="ds-kente-top border-l-4 border-l-primary">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger les analyses globales. Veuillez réessayer.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => overviewQuery.refetch()}
                  className="mt-4 border-primary/30 text-primary-text hover:bg-primary/5"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : overview ? (
            <OverviewTab data={overview} />
          ) : null}
        </TabsContent>

        {/* Par épreuve */}
        <TabsContent value="exam" className="mt-6">
          {user?.id ? <ExamTab enseignantId={user.id} /> : null}
        </TabsContent>

        {/* Étudiants en difficulté */}
        <TabsContent value="students" className="mt-6 space-y-6">
          {overviewQuery.isError ? (
            <Card className="ds-kente-top border-l-4 border-l-destructive">
              <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">Impossible de charger les données étudiants.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh()}
                  className="border-destructive/30 text-destructive hover:bg-destructive/5"
                >
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : overview ? (
            <div className="space-y-6">
              {/* KPIs étudiants avec style Savane */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="ds-kente-top border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="h-5 w-5 text-primary-text" />
                      <p className="text-xs font-medium text-muted-foreground">Étudiants évalués</p>
                    </div>
                    <p className="font-mono text-2xl font-bold tabular-nums">
                      {overview.studentsAtRisk?.length ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">en difficulté sur {overview.totalSessions ?? 0} copies</p>
                  </CardContent>
                </Card>
                <Card className="ds-kente-top border-l-4 border-l-warning">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      <p className="text-xs font-medium text-muted-foreground">Étudiants en difficulté</p>
                    </div>
                    <p className="font-mono text-2xl font-bold tabular-nums text-warning">
                      {atRiskCount}
                    </p>
                    <p className="text-xs text-muted-foreground">moyenne &lt; 8/20</p>
                  </CardContent>
                </Card>
                <Card className="ds-kente-top border-l-4 border-l-success">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-success-text" />
                      <p className="text-xs font-medium text-muted-foreground">Taux de réussite global</p>
                    </div>
                    <p className="font-mono text-2xl font-bold tabular-nums text-success-text">
                      {Math.round(overview?.globalTauxReussite ?? 0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">moyenne ≥ 50% du barème</p>
                  </CardContent>
                </Card>
              </div>

              <StudentsAtRiskList students={(overview?.studentsAtRisk ?? [])} />
            </div>
          ) : (
            <PageSkeleton />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
