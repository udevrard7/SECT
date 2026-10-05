// use-monitoring.ts — Hooks de données du module /monitoring (SECT-MONITORING-UI-1).
//
// TanStack Query centralisé (pattern BUGFIX QUERY-MIGRATION-GROUP-A) :
// cache qui survit au démontage, polling 30 s auto-nettoyé, une queryKey
// par endpoint. Le toggle autoRefresh pilote refetchInterval.
//
// Alignement backend :
//   - events   : GET /api/monitoring?type&severite&statut&since&page&limit (≤ 500)
//   - alerts   : GET /api/monitoring?statut=ACTIF&limit=100 — requête DÉDIÉE,
//                indépendante des filtres de l'onglet Événements (correction
//                refonte : avant, la file d'alertes dépendait des filtres).
//   - overview : GET /api/monitoring/overview (source unique des KPIs, même
//                formule que la carte dashboard — ADR-0011)
//   - health   : GET /api/monitoring/health (6 vrais checks backend)
//   - rules    : GET /api/monitoring/rules (statut live + canaux + catalogue)
//   - endpoints: GET /api/monitoring/endpoints?window=1h|24h|7d

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type {
  EndpointsData,
  EndpointsWindow,
  EventsPage,
  HealthReport,
  MonitoringEvent,
  OverviewData,
  RulesData,
} from './types'

export interface EventsFilters {
  type: string
  severite: string
  statut: string
  sinceHours: string
  page: number
  pageSize: number
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Échec ${url} (${res.status})`)
  return res.json() as Promise<T>
}

export function useMonitoringEvents(filters: EventsFilters, autoRefresh: boolean) {
  const { type, severite, statut, sinceHours, page, pageSize } = filters
  return useQuery<EventsPage>({
    queryKey: ['monitoring', type, severite, statut, sinceHours, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (type && type !== 'all') params.set('type', type)
      if (severite && severite !== 'all') params.set('severite', severite)
      if (statut && statut !== 'all') params.set('statut', statut)
      // ADR-0011 §7 : fenêtre temporelle (heures) + pagination backend.
      if (sinceHours !== 'all') params.set('since', sinceHours)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      return fetchJSON<EventsPage>(`/api/monitoring?${params.toString()}`)
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
}

/** File d'alertes actives — requête dédiée, insensible aux filtres Événements. */
export function useActiveAlerts(autoRefresh: boolean) {
  return useQuery<EventsPage>({
    queryKey: ['monitoring-alerts-actives'],
    queryFn: () =>
      fetchJSON<EventsPage>('/api/monitoring?statut=ACTIF&page=1&limit=100'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
}

export function useMonitoringOverview(autoRefresh: boolean) {
  return useQuery<OverviewData>({
    queryKey: ['monitoring-overview'],
    queryFn: () => fetchJSON<OverviewData>('/api/monitoring/overview'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
}

export function useMonitoringHealth(autoRefresh: boolean) {
  return useQuery<HealthReport>({
    queryKey: ['monitoring-health'],
    queryFn: () => fetchJSON<HealthReport>('/api/monitoring/health'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // Le healthcheck exécute 6 checks réels (ping DB, appels HTTP) — 60 s suffit.
    refetchInterval: autoRefresh ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

export function useMonitoringRules(autoRefresh: boolean) {
  return useQuery<RulesData>({
    queryKey: ['monitoring-rules'],
    queryFn: () => fetchJSON<RulesData>('/api/monitoring/rules'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
}

export function useEndpointsStats(window: EndpointsWindow, autoRefresh: boolean) {
  return useQuery<EndpointsData>({
    queryKey: ['monitoring-endpoints', window],
    queryFn: () => fetchJSON<EndpointsData>(`/api/monitoring/endpoints?window=${window}`),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 60_000 : false,
    refetchIntervalInBackground: false,
  })
}

/** Invalide toutes les queries monitoring (après mutation ou refresh manuel).
 *  invalidateQueries refetch les queries ACTIVES — avec forceMount sur les
 *  onglets, cela couvre events/overview/alerts/rules/health/endpoints. */
export function useInvalidateMonitoring() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['monitoring'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-alerts-actives'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-rules'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-health'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-endpoints'] })
  }, [queryClient])
}

/** Tri stable de la file d'alertes actives (CRITICAL > ERROR > WARNING). */
export function sortAlertsByPriority(events: MonitoringEvent[], priority: Record<string, number>) {
  return [...events].sort((a, b) => priority[a.severite] - priority[b.severite])
}
