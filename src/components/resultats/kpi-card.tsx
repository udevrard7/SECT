// ─────────────────────────────────────────────────────────────
// Cartes KPI pour les Résultats & Analyses — alignée au Design System.
//
// Utilise les tokens DS (primary/secondary/success/warning/danger/info)
// via un mapping des anciens noms d'accents (emerald/teal/amber/red/
// sky/violet) pour rétro-compatibilité avec les call sites existants.
// ─────────────────────────────────────────────────────────────

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { getScoreColor } from '@/lib/resultats-utils'
import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  suffix?: string
  subValue?: string
  /** Accent conservé pour rétro-compat ; mappé vers les tokens DS */
  accentColor: 'emerald' | 'teal' | 'amber' | 'red' | 'sky' | 'violet'
  scoreOn20?: number // si fourni, colore la valeur selon le score
}

// Mapping des anciens noms d'accents vers les tokens DS sémantiques.
// On garde les classes Tailwind responsives pour le border-l + iconBg
// car le DS n'expose pas de token par accent "teal" — on le mappe à
// primary (indigo) pour cohérence.
const accentMap = {
  emerald: {
    border: 'border-l-success',
    iconBg: 'bg-success/10',
    iconText: 'text-success',
  },
  teal: {
    border: 'border-l-primary',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
  },
  amber: {
    border: 'border-l-warning',
    iconBg: 'bg-warning/10',
    iconText: 'text-warning',
  },
  red: {
    border: 'border-l-destructive',
    iconBg: 'bg-destructive/10',
    iconText: 'text-destructive',
  },
  sky: {
    border: 'border-l-info',
    iconBg: 'bg-info/10',
    iconText: 'text-info',
  },
  violet: {
    border: 'border-l-secondary',
    iconBg: 'bg-secondary/10',
    iconText: 'text-secondary',
  },
} as const

export function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  subValue,
  accentColor,
  scoreOn20,
}: KpiCardProps) {
  const accent = accentMap[accentColor]
  const valueColor = scoreOn20 !== undefined ? getScoreColor(scoreOn20) : undefined

  return (
    <Card className={`border-l-4 ${accent.border} rounded-lg shadow-sm ds-lift transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${accent.iconBg}`}>
            <Icon className={`h-5 w-5 ${accent.iconText}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${valueColor ?? ''}`}>
              {value}
              {suffix && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{suffix}</span>}
            </p>
            {subValue && <p className="truncate text-xs text-muted-foreground">{subValue}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
