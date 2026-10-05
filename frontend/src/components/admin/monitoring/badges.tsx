// badges.tsx — Chips sémantiques « console » du module /monitoring
// (SECT-MONITORING-UI-2).
//
// Refonte visuelle : les badges deviennent des CHIPS MONO UPPERCASE
// (police JetBrains, micro-caps, tracking large) avec pastille de
// couleur — le langage « console d'observabilité ». Sémantique des
// couleurs inchangée (SEVERITY_CONFIG / STATUS_CONFIG / VERDICT_CONFIG
// restent la source de vérité).

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

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded border px-1.5 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] leading-none whitespace-nowrap'

// Pastilles littérales (le scanner Tailwind ne voit PAS les classes
// construites dynamiquement — chaînes littérales obligatoires).
const SEVERITY_DOT: Record<Severity, string> = {
  INFO: 'bg-info',
  WARNING: 'bg-warning',
  ERROR: 'bg-destructive',
  CRITICAL: 'bg-secondary',
}

const STATUT_DOT: Record<EventStatut, string> = {
  ACTIF: 'bg-warning',
  RESOLU: 'bg-success',
  IGNORE: 'bg-muted-foreground/60',
}

export function SeverityBadge({ severite, pulse = false }: { severite: Severity; pulse?: boolean }) {
  const config = SEVERITY_CONFIG[severite]
  const isCriticalOrError = severite === 'CRITICAL' || severite === 'ERROR'
  return (
    <span
      className={`${CHIP_BASE} ${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder} ${
        pulse && isCriticalOrError ? 'animate-pulse' : ''
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severite]}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}

export function TypeBadge({ type }: { type: EventType }) {
  const Icon = TYPE_ICONS[type]
  return (
    <span className={`${CHIP_BASE} border-border bg-muted/60 text-muted-foreground`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {TYPE_LABELS[type]}
    </span>
  )
}

export function StatutBadge({ statut }: { statut: EventStatut }) {
  const config = STATUS_CONFIG[statut]
  return (
    <span
      className={`${CHIP_BASE} ${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUT_DOT[statut]} ${
          statut === 'ACTIF' ? 'animate-pulse' : ''
        }`}
        aria-hidden="true"
      />
      {config.label}
    </span>
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
