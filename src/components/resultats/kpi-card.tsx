// ─────────────────────────────────────────────────────────────
// KpiCard — Wrapper de compatibilité vers StatCard (DS).
//
// ⚠️ DÉPRÉCIÉ : utilisez `StatCard` de `@/components/ds` directement.
//
// Ce composant existe pour rétro-compatibilité : il conserve l'ancienne
// API (accentColor: emerald/teal/amber/red/sky/violet, suffix, subValue,
// scoreOn20) et délègue à StatCard en mappant les props.
//
// Migration : remplacez
//   <KpiCard icon={...} label="..." value={...} accentColor="emerald" />
// par
//   <StatCard icon={...} label="..." value={...} accent="success" />
//
// Mapping accentColor → accent :
//   emerald → success, teal → primary, amber → warning,
//   red → danger, sky → info, violet → secondary
// ─────────────────────────────────────────────────────────────

'use client'

import type { LucideIcon } from 'lucide-react'
import { StatCard } from '@/components/ds/stat-card'
import type { StatCardProps } from '@/components/ds/stat-card'

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  suffix?: string
  subValue?: string
  /** Accent legacy — mappé vers les tokens DS */
  accentColor: 'emerald' | 'teal' | 'amber' | 'red' | 'sky' | 'violet'
  scoreOn20?: number // si fourni, colore la valeur selon le score
}

// Mapping des anciens noms d'accents vers les tokens DS sémantiques
const ACCENT_LEGACY_MAP: Record<
  KpiCardProps['accentColor'],
  NonNullable<StatCardProps['accent']>
> = {
  emerald: 'success',
  teal: 'primary',
  amber: 'warning',
  red: 'danger',
  sky: 'info',
  violet: 'secondary',
}

/**
 * @deprecated Utilisez `StatCard` de `@/components/ds` directement.
 */
export function KpiCard({
  icon,
  label,
  value,
  suffix,
  subValue,
  accentColor,
  scoreOn20,
}: KpiCardProps) {
  return (
    <StatCard
      icon={icon}
      label={label}
      value={value}
      suffix={suffix}
      hint={subValue}
      accent={ACCENT_LEGACY_MAP[accentColor]}
      scoreOn20={scoreOn20}
    />
  )
}
