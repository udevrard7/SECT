'use client'

// monitoring-page.tsx — Orchestrator du module /monitoring (SECT-MONITORING-UI-1).
//
// Refonte en architecture modulaire (src/components/admin/monitoring/) :
//   monitoring/types.ts          — contrat exact des 12 endpoints backend
//   monitoring/utils.ts          — formatage + parsing details + jauge règles
//   monitoring/badges.tsx        — badges sévérité/type/statut/verdict
//   monitoring/use-monitoring.ts — 6 hooks TanStack Query centralisés
//   monitoring/event-mutations.ts— mutations + toasts (events + règles)
//   monitoring/kpi-row.tsx       — KPIs (source overview = dashboard) + bandeau critique
//   monitoring/events-tab.tsx    — flux + filtres + pagination + lignes dépliables
//   monitoring/services-tab.tsx  — 6 vrais services (zéro fallback fabriqué)
//   monitoring/system-tab.tsx    — couteau suisse (runtime/infra/workers/endpoints/score)
//   monitoring/alerts-tab.tsx    — file active DÉDIÉE + règles persistées ADR-0012
//   monitoring/*-dialogs.tsx     — GlassModal/AlertDialog contrôlés
//
// Alignement produit (ADR-0011/0012) : le score, les KPIs et la tendance
// viennent UNIQUEMENT du backend (/api/monitoring/overview) — même formule
// que la carte « Santé plateforme » du dashboard admin.

import { useState } from 'react'
import { Activity, Bell, RefreshCw, Server, Sparkles, Wrench } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { VerdictBadge } from './monitoring/badges'
import { CriticalBanner, KpiRow } from './monitoring/kpi-row'
import { EventsTab } from './monitoring/events-tab'
import { ServicesTab } from './monitoring/services-tab'
import { SystemTab } from './monitoring/system-tab'
import { AlertsTab } from './monitoring/alerts-tab'
import { useActiveAlerts, useMonitoringHealth, useMonitoringOverview } from './monitoring/use-monitoring'

type TabValue = 'evenements' | 'services' | 'systeme' | 'alertes'

export function MonitoringPage() {
  const { user } = useAuthStore()
  const userEmail = user?.email ?? 'admin'

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('evenements')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  // Source unique des KPIs + score + bandeau critique (alignée dashboard).
  const overviewQuery = useMonitoringOverview(autoRefresh)
  const healthQuery = useMonitoringHealth(autoRefresh)
  const alertsQuery = useActiveAlerts(autoRefresh)

  const overview = overviewQuery.data ?? null
  const criticalCount = overview?.kpis.criticalEvents ?? 0
  const activeAlertCount = (alertsQuery.data?.events ?? []).filter(
    (e) => e.severite === 'CRITICAL' || e.severite === 'ERROR' || e.severite === 'WARNING'
  ).length

  // Refresh manuel global : invalide les queries du module (les hooks
  // refetchent) + spinner local pendant l'opération.
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true)
    try {
      await Promise.all([
        overviewQuery.refetch(),
        healthQuery.refetch(),
        alertsQuery.refetch(),
      ])
    } catch {
      toast.error('Actualisation partielle', {
        description: 'Une des sources de données a échoué — réessayez.',
      })
    } finally {
      setIsManualRefreshing(false)
    }
  }

  const lastRefresh =
    overviewQuery.dataUpdatedAt > 0 ? new Date(overviewQuery.dataUpdatedAt) : new Date()

  return (
    <div className="space-y-6">
      {/* ═══ Header kente + verdict backend ═══ */}
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div className="ds-kente-pattern border-b border-border bg-card">
          <div className="ds-kente-strip" aria-hidden="true" />
          <div className="px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <Activity className="h-6 w-6" aria-hidden="true" />
                  </span>
                  Monitoring plateforme
                  <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Couteau suisse de l&apos;admin système — services, événements, workers, alertes
                  </p>
                  {overview && <VerdictBadge verdict={overview.score.verdict} />}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="auto-refresh"
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    className="data-[state=checked]:bg-success"
                  />
                  <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
                    Auto-refresh 30s
                  </Label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleManualRefresh()}
                  disabled={isManualRefreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isManualRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Actualiser
                </Button>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Dernière màj : {lastRefresh.toLocaleTimeString('fr-FR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Bandeau critique (uniquement si CRITICAUX actifs) ═══ */}
      <CriticalBanner criticalCount={criticalCount} onGoToAlerts={() => setActiveTab('alertes')} />

      {/* ═══ KPIs — même source que la carte dashboard (ADR-0011) ═══ */}
      <KpiRow overview={overview} loading={overviewQuery.isLoading} />

      {/* ═══ Onglets ═══ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="evenements" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Événements
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            État des services
          </TabsTrigger>
          <TabsTrigger value="systeme" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            Système
          </TabsTrigger>
          <TabsTrigger value="alertes" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Alertes
            {activeAlertCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 h-4 ml-1">
                {activeAlertCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* forceMount + data-[state=inactive]:hidden → les onglets restent montés
            (les filtres/pagination/sélection survivent aux changements d'onglet,
            comme avant la refonte où l'état vivait au niveau supérieur). */}
        <TabsContent value="evenements" forceMount className="data-[state=inactive]:hidden">
          <EventsTab autoRefresh={autoRefresh} userEmail={userEmail} />
        </TabsContent>

        <TabsContent value="services" forceMount className="data-[state=inactive]:hidden">
          <ServicesTab
            healthQuery={healthQuery}
            overview={overview}
            overviewLoading={overviewQuery.isLoading}
            autoRefresh={autoRefresh}
          />
        </TabsContent>

        <TabsContent value="systeme" forceMount className="data-[state=inactive]:hidden">
          <SystemTab
            overview={overview}
            overviewLoading={overviewQuery.isLoading}
            autoRefresh={autoRefresh}
            onRetryOverview={() => void overviewQuery.refetch()}
          />
        </TabsContent>

        <TabsContent value="alertes" forceMount className="data-[state=inactive]:hidden">
          <AlertsTab autoRefresh={autoRefresh} userEmail={userEmail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
