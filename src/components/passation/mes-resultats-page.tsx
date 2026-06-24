// ─────────────────────────────────────────────────────────────
// Page principale "Mes Résultats" (étudiant) — refonte complète
// 3 onglets : Vue d'ensemble | Mes épreuves | Évolution
// ─────────────────────────────────────────────────────────────

'use client'

import { useState } from 'react'
import {
  Trophy,
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useMesResultats, useEtudiantOverview, useRefreshResultats } from '@/hooks/use-resultats'
import { PulseSkeleton } from '@/components/ds'
import { MesResultatsSkeleton, MesEpreuvesSkeleton } from '../mes-resultats/mes-resultats-skeletons'
import { EtudiantOverviewTab } from '../mes-resultats/etudiant-overview-tab'
import { MesEpreuvesTab } from '../mes-resultats/mes-epreuves-tab'
import { MonResultatDialog } from '../mes-resultats/mon-resultat-dialog'
import type { StudentSession } from '@/types/resultats'

export function MesResultatsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState('overview')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudentSession | null>(null)

  const overviewQuery = useEtudiantOverview(user?.id)
  const resultatsQuery = useMesResultats(user?.id)
  const refresh = useRefreshResultats()

  const handleViewDetail = (session: StudentSession) => {
    setSelectedSession(session)
    setDetailOpen(true)
  }

  // ─── Skeleton global tant que l'overview charge ───
  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
        <PulseSkeleton variant="card" className="h-64" />
      </div>
    )
  }

  const overview = overviewQuery.data
  const sessions = resultatsQuery.data ?? []
  const pendingCount = sessions.filter((s) => s.statut === 'SOUMISE').length

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight md:text-3xl">
            <Trophy className="h-7 w-7 text-success" />
            Mes Résultats
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez vos notes, suivez votre progression et analysez vos performances
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={overviewQuery.isFetching || resultatsQuery.isFetching}
          className="self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching || resultatsQuery.isFetching ? 'animate-spin' : ''}`} />
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
          <TabsTrigger value="epreuves" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Mes épreuves</span>
            <span className="sm:hidden">Épreuves</span>
            {sessions.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-success/15 px-1 text-xs text-success font-mono tabular-nums">
                {sessions.length}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center bg-warning/15 px-1 text-xs text-warning font-mono tabular-nums" title="En attente de correction">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="evolution" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Évolution</span>
            <span className="sm:hidden">Évol.</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── Vue d'ensemble ─── */}
        <TabsContent value="overview" className="mt-6">
          {overviewQuery.isError ? (
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger vos analyses.
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
          ) : overview && overview.totalEpreuves === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                  <Trophy className="h-10 w-10 text-success" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">Aucun résultat disponible</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Vous n&apos;avez pas encore passé d&apos;épreuve. Vos résultats apparaîtront ici après soumission.
                </p>
              </CardContent>
            </Card>
          ) : overview ? (
            <EtudiantOverviewTab data={overview} />
          ) : null}
        </TabsContent>

        {/* ─── Mes épreuves ─── */}
        <TabsContent value="epreuves" className="mt-6">
          {resultatsQuery.isLoading && !resultatsQuery.data ? (
            <MesEpreuvesSkeleton />
          ) : resultatsQuery.isError ? (
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger vos résultats.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultatsQuery.refetch()}
                  className="mt-4"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : sessions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                <h3 className="mt-3 text-lg font-semibold">Aucune épreuve</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Vous n&apos;avez pas encore passé d&apos;épreuve.
                </p>
              </CardContent>
            </Card>
          ) : (
            <MesEpreuvesTab sessions={sessions} onViewDetail={handleViewDetail} />
          )}
        </TabsContent>

        {/* ─── Évolution ─── */}
        <TabsContent value="evolution" className="mt-6">
          {overview && overview.totalEpreuves > 0 ? (
            <EtudiantOverviewTab data={overview} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
                <h3 className="mt-3 text-lg font-semibold">Pas encore de données</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  L&apos;évolution de vos performances sera visible après vos premières épreuves corrigées.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Dialog de détail ─── */}
      <MonResultatDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        session={selectedSession}
      />
    </div>
  )
}
