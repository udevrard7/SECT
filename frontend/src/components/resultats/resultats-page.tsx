// ─────────────────────────────────────────────────────────────
// Page principale "Résultats & Analyses" (refonte complète)
// Onglets : Vue d'ensemble | Par épreuve | Étudiants en difficulté
// ─────────────────────────────────────────────────────────────

'use client'

import { useState } from 'react'
import {
  TrendingUp,
  LayoutDashboard,
  FileBarChart,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
            <TrendingUp className="h-7 w-7 text-success-text" />
            Résultats & Analyses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez et analysez les résultats de vos épreuves
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={overviewQuery.isFetching}
          className="self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Rafraîchir</span>
        </Button>
      </div>

      {/* ─── Onglets ─── */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Vue d&apos;ensemble</span>
            <span className="sm:hidden">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="exam" className="gap-1.5">
            <FileBarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Par épreuve</span>
            <span className="sm:hidden">Épreuve</span>
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Étudiants</span>
            <span className="sm:hidden">Étud.</span>
            {atRiskCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 justify-center bg-destructive/15 px-1 text-xs text-destructive"
              >
                {atRiskCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Vue d'ensemble ─── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {overviewQuery.isError ? (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger les analyses globales.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => overviewQuery.refetch()}
                  className="mt-4"
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

        {/* ─── Par épreuve ─── */}
        <TabsContent value="exam" className="mt-6">
          {user?.id ? <ExamTab enseignantId={user.id} /> : null}
        </TabsContent>

        {/* ─── Étudiants en difficulté ─── */}
        <TabsContent value="students" className="mt-6 space-y-6">
          {overview ? (
            <div className="space-y-6">
              {/* KPIs étudiants */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Total étudiants évalués</p>
                    <p className="font-mono text-2xl font-bold tabular-nums">
                      {new Set((overview?.studentsAtRisk ?? []).map((s) => s.etudiantId)).size + atRiskCount}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Étudiants en difficulté</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-warning">
                      {atRiskCount}
                    </p>
                    <p className="text-xs text-muted-foreground">moyenne &lt; 8/20</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Étudiants en réussite</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-success-text">
                      {Math.max(0, overview.totalSessions > 0 ? overview.totalSessions - atRiskCount : 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">moyenne ≥ 10/20</p>
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
