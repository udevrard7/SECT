// services-tab.tsx — Onglet « État des services » (SECT-MONITORING-UI-1).
//
// HONNÊTETÉ TOTALE (ADR-0011) : si /api/monitoring/health échoue, on affiche
// un état d'erreur explicite avec bouton Réessayer — le fallback précédent
// fabriquait 6 services « Opérationnel » (vérité violée, supprimé).
// Le mapping service→type utilise les NOMS EXACTS du healthcheck backend
// (healthcheck.go) — plus d'heuristique `name.includes(...)`.

'use client'

import { AlertTriangle, CheckCircle2, Database, HeartPulse, Loader2, RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressRing, PulseSkeleton } from '@/components/ds'
import {
  SERVICE_STATUS_CONFIG,
  SERVICE_TYPE_BY_NAME,
  TYPE_ICONS,
  TYPE_LABELS,
  type EventType,
  type ServiceStatus,
  type ServiceStatusValue,
} from './types'
import { getTimeAgo, scoreAccent } from './utils'
import type { OverviewData } from './types'

export function ServicesTab({
  healthQuery,
  overview,
  overviewLoading,
  autoRefresh,
}: {
  healthQuery: ReturnType<typeof import('./use-monitoring').useMonitoringHealth>
  overview: OverviewData | null
  overviewLoading: boolean
  autoRefresh: boolean
}) {
  const health = healthQuery.data ?? null

  return (
    <div className="space-y-6">
      {/* ─── Bandeau état global (honnête) ─── */}
      {health ? (
        <div
          className={`rounded-lg border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
            health.overall === 'OPERATIONNEL'
              ? 'border-success/30 bg-success/10'
              : health.overall === 'DEGRADE'
                ? 'border-warning/30 bg-warning/10'
                : 'border-destructive/30 bg-destructive/10'
          }`}
          role="status"
        >
          <div className="flex items-start gap-2 min-w-0">
            {health.overall === 'OPERATIONNEL' ? (
              <CheckCircle2 className="h-4 w-4 text-success-text mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle
                className={`h-4 w-4 mt-0.5 shrink-0 ${health.overall === 'DEGRADE' ? 'text-warning' : 'text-destructive'}`}
                aria-hidden="true"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Vrais healthchecks backend (ping DB, requêtes de test) —{' '}
              <strong className="text-foreground">
                {health.healthyCount}/{health.totalCount} services opérationnels
              </strong>
              , dernier check à {new Date(health.checkedAt).toLocaleTimeString('fr-FR')}. Actualisation{' '}
              {autoRefresh ? 'automatique (60 s)' : 'manuelle'}.
            </p>
          </div>
          <Badge
            className={`shrink-0 ${
              SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].bgColor
            } ${SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].textColor} ${
              SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].borderColor
            }`}
          >
            {SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].label}
          </Badge>
        </div>
      ) : healthQuery.isError ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base font-semibold font-display tracking-tight">
              Healthcheck indisponible
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Impossible d&apos;exécuter les vérifications de services (/api/monitoring/health). Aucune
              valeur n&apos;est simulée — réessayez ou consultez l&apos;onglet Système.
            </p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => void healthQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Relancer les checks
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─── Santé globale : MÊME score backend que le dashboard (ADR-0011) ─── */}
        <Card className="lg:col-span-1 ds-kente-top">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-display">
              <HeartPulse className="h-5 w-5 text-success-text" aria-hidden="true" />
              Santé globale
            </CardTitle>
            <CardDescription>Score de santé de la plateforme</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-4">
            {overviewLoading ? (
              <div className="flex items-center justify-center h-[180px] w-[180px]">
                <Loader2 className="h-8 w-8 animate-spin text-success-text" aria-hidden="true" />
              </div>
            ) : (
              <>
                <ProgressRing
                  value={overview?.score.score ?? 0}
                  size={180}
                  strokeWidth={14}
                  accent={scoreAccent(overview?.score.score ?? 0)}
                  sublabel={health ? `${health.healthyCount}/${health.totalCount} services` : 'Score plateforme'}
                  showPercent
                />
                {overview && overview.score.breakdown.some((c) => c.penalty < 0) && (
                  <div className="mt-3 w-full space-y-1" aria-label="Composantes du score santé">
                    {overview.score.breakdown
                      .filter((c) => c.penalty < 0)
                      .sort((a, b) => a.penalty - b.penalty)
                      .slice(0, 3)
                      .map((c) => (
                        <div key={c.label} className="flex items-center justify-between text-[11px] px-2">
                          <span className="text-muted-foreground truncate">{c.label}</span>
                          <span className="font-semibold text-destructive shrink-0 ml-2">{c.penalty}</span>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
            {health && (
              <div className="mt-4 grid grid-cols-3 gap-4 w-full text-center">
                <div>
                  <p className="text-lg font-bold text-success-text font-mono tabular-nums">
                    {health.services.filter((s) => s.status === 'OPERATIONNEL').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Opérationnels</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-warning font-mono tabular-nums">
                    {health.services.filter((s) => s.status === 'DEGRADE').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Dégradés</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive font-mono tabular-nums">
                    {health.services.filter((s) => s.status === 'INDISPONIBLE').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Indisponibles</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Grille des 6 services réels ─── */}
        <div className="lg:col-span-2">
          {healthQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} aria-hidden="true">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <PulseSkeleton className="h-9 w-9 rounded-lg" />
                      <div className="space-y-1.5">
                        <PulseSkeleton className="h-4 w-32" />
                        <PulseSkeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <PulseSkeleton className="h-px w-full" />
                    <div className="grid grid-cols-2 gap-3">
                      <PulseSkeleton className="h-8 w-full" />
                      <PulseSkeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : health ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {health.services.map((service, i) => (
                <ServiceHealthCard key={service.name} service={service} index={i} />
              ))}
            </div>
          ) : (
            !healthQuery.isError && (
              <Card className="border-dashed sm:col-span-2">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  En attente des résultats des healthchecks…
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Carte service — vraies mesures, zéro valeur fabriquée ───

function ServiceHealthCard({ service, index }: { service: ServiceStatus; index: number }) {
  const statusConfig = SERVICE_STATUS_CONFIG[service.status]
  // Mapping EXACT par nom backend (types.ts) — fallback API (jamais fabriqué).
  const type: EventType = SERVICE_TYPE_BY_NAME[service.name] ?? 'API'
  const Icon = TYPE_ICONS[type]
  const isDb = type === 'DATABASE'

  return (
    <Card
      className={`transition-all hover:shadow-sm ${statusConfig.borderColor} ${statusConfig.darkBorderColor}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusConfig.bgColor} ${statusConfig.darkBgColor}`}
            >
              {isDb ? <Database className="h-4.5 w-4.5 text-primary-text" aria-hidden="true" /> : type === 'SYSTEM' ? <Server className="h-4.5 w-4.5 text-primary-text" aria-hidden="true" /> : <Icon className="h-4.5 w-4.5 text-primary-text" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold leading-tight truncate">{service.name}</h4>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[type]}</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${statusConfig.bgColor} ${statusConfig.textColor} ${statusConfig.borderColor} ${statusConfig.darkBgColor} ${statusConfig.darkTextColor} ${statusConfig.darkBorderColor}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor} ${service.status !== 'OPERATIONNEL' ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            {statusConfig.label}
          </span>
        </div>

        {/* ADR-0011 : latence mesurée + connexions DB réelles + dernière erreur */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">Latence mesurée</p>
            <p
              className={`font-semibold font-mono tabular-nums ${
                service.latency <= 200
                  ? 'text-success-text'
                  : service.latency <= 500
                    ? 'text-warning'
                    : 'text-destructive'
              }`}
            >
              {service.latency} ms
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">{isDb ? 'Connexions actives' : 'Dernier check'}</p>
            <p className="font-semibold font-mono tabular-nums">
              {isDb ? service.activeConns : getTimeAgo(service.lastCheck)}
            </p>
          </div>
          {service.lastError && (
            <div className="col-span-2">
              <p className="text-muted-foreground mb-0.5">Dernière erreur</p>
              <p className="font-medium text-xs text-destructive line-clamp-2" title={service.lastError}>
                {service.lastError}
              </p>
            </div>
          )}
        </div>
        <span className="sr-only">Statut : {statusConfig.label}</span>
      </CardContent>
    </Card>
  )
}
