// ─────────────────────────────────────────────────────────────
// Cartes KPI pour les Résultats & Analyses
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
  accentColor: 'emerald' | 'teal' | 'amber' | 'red' | 'sky'
  scoreOn20?: number // si fourni, colore la valeur selon le score
}

const accentMap = {
  emerald: {
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
  },
  teal: {
    border: 'border-l-teal-500',
    iconBg: 'bg-teal-100 dark:bg-teal-900/40',
    iconText: 'text-teal-600 dark:text-teal-400',
  },
  amber: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconText: 'text-amber-600 dark:text-amber-400',
  },
  red: {
    border: 'border-l-red-500',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    iconText: 'text-red-600 dark:text-red-400',
  },
  sky: {
    border: 'border-l-sky-500',
    iconBg: 'bg-sky-100 dark:bg-sky-900/40',
    iconText: 'text-sky-600 dark:text-sky-400',
  },
}

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
    <Card className={`border-l-4 ${accent.border} transition-shadow hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent.iconBg}`}>
            <Icon className={`h-5 w-5 ${accent.iconText}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${valueColor ?? ''}`}>
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
