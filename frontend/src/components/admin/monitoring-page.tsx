'use client'

// monitoring-page.tsx — Orchestrateur du module /monitoring
// (SECT-MONITORING-UI-2 — refonte visuelle « console d'observabilité »).
//
// AVANT (UI-1) : header kente standard + 6 StatCards + Tabs shadcn par
// défaut — le module se fondait dans les autres pages admin.
// APRÈS (UI-2) : panneau « salle des machines » sombre permanent
// (hero.tsx : jauge en arc + tuiles KPI + rail LIVE + alarmes) et
// navigation console segmentée (mono uppercase + compteurs live).
//
// L'architecture modulaire et l'alignement backend (ADR-0011/0012) sont
// INTACTS : mêmes hooks (use-monitoring.ts), mêmes mutations, même
// source unique /api/monitoring/overview.
//
//   monitoring/types.ts          — contrat exact des 12 endpoints backend
//   monitoring/utils.ts          — formatage + parsing details + jauge règles
//   monitoring/badges.tsx        — chips console (sévérité/type/statut/verdict)
//   monitoring/hero.tsx          — panneau salle des machines (NOUVEAU UI-2)
//   monitoring/use-monitoring.ts — 6 hooks TanStack Query centralisés
//   monitoring/event-mutations.ts— mutations + toasts (events + règles)
//   monitoring/events-tab.tsx    — log console + filtres + pagination
//   monitoring/services-tab.tsx  — status page (bandeau segments + lignes)
//   monitoring/system-tab.tsx    — couteau suisse (runtime/infra/workers/endpoints)
//   monitoring/alerts-tab.tsx    — file active DÉDIÉE + règles persistées ADR-0012
//   monitoring/*-dialogs.tsx     — GlassModal/AlertDialog contrôlés

import { useState } from 'react'
import { Activity, Bell, Server, Wrench } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { ConsoleHero } from './monitoring/hero'
import { EventsTab } from './monitoring/events-tab'
import { ServicesTab } from './monitoring/services-tab'
import { SystemTab } from './monitoring/system-tab'
import { AlertsTab } from './monitoring/alerts-tab'
import {
  useActiveAlerts,
  useInvalidateMonitoring,
  useMonitoringHealth,
  useMonitoringOverview,
} from './monitoring/use-monitoring'

type TabValue = 'evenements' | 'services' | 'systeme' | 'alertes'

export function MonitoringPage() {
  const { user } = useAuthStore()
  const userEmail = user?.email ?? 'admin'

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('evenements')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  // Source unique des KPIs + score + alarmes (alignée dashboard).
  const overviewQuery = useMonitoringOverview(autoRefresh)
  const healthQuery = useMonitoringHealth(autoRefresh)
  const alertsQuery = useActiveAlerts(autoRefresh)
  const invalidateAll = useInvalidateMonitoring()

  const overview = overviewQuery.data ?? null
  const health = healthQuery.data ?? null
  const activeAlertCount = (alertsQuery.data?.events ?? []).filter(
    (e) => e.severite === 'CRITICAL' || e.severite === 'ERROR' || e.severite === 'WARNING'
  ).length

  // Refresh manuel global : invalide TOUTES les queries du module (events
  // inclus — correction E2E de UI-1, conservée).
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true)
    try {
      await invalidateAll()
    } catch {
      toast.error('Actualisation partielle', {
        description: 'Une des sources de données a échoué — réessayez.',
      })
    } finally {
      setIsManualRefreshing(false)
    }
  }

  const lastRefreshLabel =
    overviewQuery.dataUpdatedAt > 0
      ? new Date(overviewQuery.dataUpdatedAt).toLocaleTimeString('fr-FR')
      : '—'

  // Compteurs live de la nav console.
  const tabCounts: Record<TabValue, { label: string; tone: 'danger' | 'neutral' } | null> = {
    evenements:
      overview && overview.kpis.activeEvents > 0
        ? { label: String(overview.kpis.activeEvents), tone: overview.kpis.criticalEvents > 0 ? 'danger' : 'neutral' }
        : null,
    services: health ? { label: `${health.healthyCount}/${health.totalCount}`, tone: 'neutral' } : null,
    systeme: overview ? { label: String(overview.workers.length), tone: 'neutral' } : null,
    alertes:
      activeAlertCount > 0
        ? { label: String(activeAlertCount), tone: 'danger' }
        : null,
  }

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Monitoring plateforme — console administrateur système</h1>

      {/* ═══ Panneau « salle des machines » (jauge + KPIs + alarmes) ═══ */}
      <ConsoleHero
        overview={overview}
        loading={overviewQuery.isLoading}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={setAutoRefresh}
        onRefresh={() => void handleManualRefresh()}
        isRefreshing={isManualRefreshing}
        lastRefreshLabel={lastRefreshLabel}
        activeAlertCount={activeAlertCount}
        onGoToAlerts={() => setActiveTab('alertes')}
      />

      {/* ═══ Navigation console segmentée ═══ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 sm:w-auto">
          <TabsTrigger
            value="evenements"
            className="group gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Événements
            <TabCount count={tabCounts.evenements} />
          </TabsTrigger>
          <TabsTrigger
            value="services"
            className="group gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            Services
            <TabCount count={tabCounts.services} />
          </TabsTrigger>
          <TabsTrigger
            value="systeme"
            className="group gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            Système
            <TabCount count={tabCounts.systeme} />
          </TabsTrigger>
          <TabsTrigger
            value="alertes"
            className="group gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Alertes
            <TabCount count={tabCounts.alertes} />
          </TabsTrigger>
        </TabsList>

        {/* forceMount + data-[state=inactive]:hidden → les onglets restent montés
            (les filtres/pagination/sélection survivent aux changements d'onglet). */}
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

/** Compteur live d'un onglet de la nav console. */
function TabCount({ count }: { count: { label: string; tone: 'danger' | 'neutral' } | null }) {
  if (!count) return null
  return (
    <span
      className={`ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 font-mono text-[10px] font-bold leading-none tabular-nums ${
        count.tone === 'danger'
          ? 'bg-destructive/15 text-destructive group-data-[state=active]:bg-red-950/40 group-data-[state=active]:text-red-200'
          : 'bg-muted text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground'
      }`}
    >
      {count.label}
    </span>
  )
}
