// services-tab.tsx — Onglet « Services » (SECT-MONITORING-UI-2).
//
// Refonte visuelle « status page » : bandeau de segments (un par
// service, façon page de statut publique) + lignes compactes riches —
// remplace l'ancienne grille de 6 cartes. Le score global n'est plus
// répété ici (il vit dans le panneau héro — source unique).
//
// HONNÊTETÉ TOTALE (ADR-0011, conservée de UI-1) : si
// /api/monitoring/health échoue → état d'erreur explicite avec bouton
// Réessayer. AUCUN service fabriqué. Le mapping service→type utilise
// les NOMS EXACTS du healthcheck backend (healthcheck.go).

'use client'

import { AlertTriangle, CheckCircle2, Database, RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import {
  SERVICE_STATUS_CONFIG,
  SERVICE_TYPE_BY_NAME,
  TYPE_ICONS,
  TYPE_LABELS,
  type EventType,
  type ServiceStatus,
  type ServiceStatusValue,
} from './types'
import { getTimeAgo } from './utils'
import type { OverviewData } from './types'

/** Couleur du segment (bandeau statut) — littéral Tailwind. */
const SEGMENT_COLOR: Record<ServiceStatusValue, string> = {
  OPERATIONNEL: 'bg-success',
  DEGRADE: 'bg-warning animate-pulse',
  INDISPONIBLE: 'bg-destructive animate-pulse',
}

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
    <div className="space-y-5">
      {/* ─── Bandeau état global (honnête) ─── */}
      {health ? (
        <div
          className={`flex flex-col gap-2 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:justify-between ${
            health.overall === 'OPERATIONNEL'
              ? 'border-success/30 bg-success/[0.07]'
              : health.overall === 'DEGRADE'
                ? 'border-warning/30 bg-warning/[0.07]'
                : 'border-destructive/30 bg-destructive/[0.07]'
          }`}
          role="status"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            {health.overall === 'OPERATIONNEL' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${health.overall === 'DEGRADE' ? 'text-warning' : 'text-destructive'}`}
                aria-hidden="true"
              />
            )}
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              VRAIS HEALTHCHECKS BACKEND (ping DB, requêtes de test) ·{' '}
              <span className="font-semibold text-foreground">
                {health.healthyCount}/{health.totalCount} OPÉRATIONNELS
              </span>{' '}
              · DERNIER CHECK {new Date(health.checkedAt).toLocaleTimeString('fr-FR')} ·{' '}
              {autoRefresh ? 'AUTO 60 S' : 'MANUEL'}
            </p>
          </div>
          <span
            className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
              SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].bgColor
            } ${SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].textColor} ${
              SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].borderColor
            }`}
          >
            {SERVICE_STATUS_CONFIG[health.overall as ServiceStatusValue].label}
          </span>
        </div>
      ) : healthQuery.isError ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
            <h3 className="mt-3 font-mono text-sm font-semibold uppercase tracking-[0.12em]">
              Healthcheck indisponible
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Impossible d&apos;exécuter les vérifications de services (/api/monitoring/health). Aucune
              valeur n&apos;est simulée — réessayez ou consultez l&apos;onglet Système.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5 font-mono text-xs uppercase tracking-wider"
              onClick={() => void healthQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Relancer les checks
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ─── Bandeau segments (status page) ─── */}
      {healthQuery.isLoading ? (
        <div className="rounded-xl border p-4" aria-busy="true">
          <PulseSkeleton className="mb-3 h-3 w-48" />
          <PulseSkeleton className="h-3 w-full rounded-full" />
          <div className="mt-3 flex flex-wrap gap-3">
            <PulseSkeleton className="h-3 w-24" />
            <PulseSkeleton className="h-3 w-24" />
            <PulseSkeleton className="h-3 w-24" />
          </div>
        </div>
      ) : health ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Services · {health.healthyCount}/{health.totalCount} opérationnels
            </p>
            {!overviewLoading && overview && (
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Score plateforme{' '}
                <span className="font-semibold text-foreground">{overview.score.score}/100</span> — voir
                panneau héro
              </p>
            )}
          </div>
          {/* Segments — un par service, plein largeur */}
          <div
            className="mt-3 flex h-3.5 gap-1 overflow-hidden rounded-full"
            role="img"
            aria-label={`Statut des ${health.totalCount} services : ${health.healthyCount} opérationnels`}
          >
            {health.services.map((s) => (
              <div
                key={s.name}
                className={`flex-1 rounded-sm transition-opacity hover:opacity-80 ${SEGMENT_COLOR[s.status]}`}
                title={`${s.name} — ${SERVICE_STATUS_CONFIG[s.status].label}`}
              />
            ))}
          </div>
          {/* Légende */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {health.services.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${SEGMENT_COLOR[s.status].split(' ')[0]}`} aria-hidden="true" />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ─── Lignes services (vraies mesures, zéro valeur fabriquée) ─── */}
      {healthQuery.isLoading ? (
        <div className="space-y-2 rounded-xl border p-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2.5">
              <PulseSkeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <PulseSkeleton className="h-3.5 w-36" />
                <PulseSkeleton className="h-3 w-24" />
              </div>
              <PulseSkeleton className="h-3.5 w-16" />
              <PulseSkeleton className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : health ? (
        <div className="overflow-hidden rounded-xl border" aria-label="Détail des services">
          <div className="divide-y">
            {health.services.map((service) => (
              <ServiceRow key={service.name} service={service} />
            ))}
          </div>
        </div>
      ) : (
        !healthQuery.isError && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
              En attente des résultats des healthchecks…
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

// ─── Ligne service — vraies mesures, zéro valeur fabriquée ───

function ServiceRow({ service }: { service: ServiceStatus }) {
  const statusConfig = SERVICE_STATUS_CONFIG[service.status]
  // Mapping EXACT par nom backend (types.ts) — fallback API (jamais fabriqué).
  const type: EventType = SERVICE_TYPE_BY_NAME[service.name] ?? 'API'
  const Icon = TYPE_ICONS[type]
  const isDb = type === 'DATABASE'

  return (
    <div
      className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 px-3.5 py-3 transition-colors hover:bg-accent/40 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] ${statusConfig.borderColor} border-l-2`}
    >
      {/* Icône */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${statusConfig.bgColor} ${statusConfig.darkBgColor}`}
      >
        {isDb ? (
          <Database className="h-4 w-4 text-primary-text" aria-hidden="true" />
        ) : type === 'SYSTEM' ? (
          <Server className="h-4 w-4 text-primary-text" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4 text-primary-text" aria-hidden="true" />
        )}
      </span>

      {/* Nom + type + erreur éventuelle */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold leading-tight">{service.name}</h4>
          <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
            {TYPE_LABELS[type]}
          </span>
        </div>
        {service.lastError ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-destructive" title={service.lastError}>
            ✗ {service.lastError}
          </p>
        ) : (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            Check {getTimeAgo(service.lastCheck)}
          </p>
        )}
      </div>

      {/* Latence */}
      <span className="font-mono text-xs tabular-nums">
        <span className="mr-1 text-[9px] uppercase tracking-wider text-muted-foreground">lat.</span>
        <span
          className={
            service.latency <= 200
              ? 'font-semibold text-success-text'
              : service.latency <= 500
                ? 'font-semibold text-warning'
                : 'font-semibold text-destructive'
          }
        >
          {service.latency} ms
        </span>
      </span>

      {/* Connexions DB */}
      {isDb && (
        <span className="hidden font-mono text-xs tabular-nums md:inline">
          <span className="mr-1 text-[9px] uppercase tracking-wider text-muted-foreground">conn.</span>
          <span className="font-semibold">{service.activeConns}</span>
        </span>
      )}

      {/* Statut */}
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${statusConfig.bgColor} ${statusConfig.textColor} ${statusConfig.borderColor} ${statusConfig.darkBgColor} ${statusConfig.darkTextColor} ${statusConfig.darkBorderColor}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor} ${service.status !== 'OPERATIONNEL' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        {statusConfig.label}
      </span>
    </div>
  )
}
