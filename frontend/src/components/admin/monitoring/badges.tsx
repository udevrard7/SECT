// badges.tsx — Badges sémantiques du module /monitoring (SECT-MONITORING-UI-1).

import { Badge } from '@/components/ui/badge'
import {
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  TYPE_ICONS,
  TYPE_LABELS,
  VERDICT_CONFIG,
  type EventStatut,
  type EventType,
  type Severity,
  type Verdict,
} from './types'

export function SeverityBadge({ severite, pulse = false }: { severite: Severity; pulse?: boolean }) {
  const config = SEVERITY_CONFIG[severite]
  const isCriticalOrError = severite === 'CRITICAL' || severite === 'ERROR'
  return (
    <Badge
      className={`${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder} text-xs font-medium gap-1 ${
        pulse && isCriticalOrError ? 'animate-pulse' : ''
      }`}
    >
      <config.icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export function TypeBadge({ type }: { type: EventType }) {
  const Icon = TYPE_ICONS[type]
  return (
    <Badge variant="outline" className="text-xs font-medium gap-1">
      <Icon className="h-3 w-3" />
      {TYPE_LABELS[type]}
    </Badge>
  )
}

export function StatutBadge({ statut }: { statut: EventStatut }) {
  const config = STATUS_CONFIG[statut]
  return (
    <Badge
      className={`${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder} text-xs font-medium`}
    >
      {config.label}
    </Badge>
  )
}

/** Chip verdict global (BONNE_SANTE / ATTENTION / URGENT — backend score.go). */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config = VERDICT_CONFIG[verdict]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}
