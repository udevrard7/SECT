'use client'

import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PulseSkeleton } from './pulse-skeleton'

export type StatTrend = 'up' | 'down' | 'neutral'

export interface StatCardProps {
  /** Libellé de la métrique (ex: "Moyenne générale") */
  label: string
  /** Valeur principale (ex: "14.5/20" ou "87%") */
  value: string | number
  /** Icône Lucide associée à la métrique */
  icon: LucideIcon
  /** Couleur d'accent (semantic) */
  accent?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
  /** Tendance (évolution) — optionnelle */
  trend?: {
    direction: StatTrend
    /** Pourcentage ou valeur de l'évolution (ex: "+12%" ou "-3pts") */
    value: string
    /** Libellé contextuel (ex: "vs mois dernier") */
    label?: string
  }
  /** Sous-texte optionnel sous la valeur */
  hint?: string
  /** Suffixe optionnel après la valeur (ex: "/20", "%", "pts") */
  suffix?: string
  /** Score normalisé sur 20 : si fourni, colore dynamiquement la valeur
   *  (≥16 success, ≥10 warning, <10 danger) — override l'accent pour la valeur */
  scoreOn20?: number
  /** État de chargement (affiche un skeleton) */
  loading?: boolean
  /** Délai d'animation en stagger (ms) */
  index?: number
  /** Callback au clic (rend la carte interactive) */
  onClick?: () => void
}

const ACCENT_MAP = {
  primary: { iconBg: 'bg-primary/10', iconText: 'text-primary-text', ring: 'ring-primary/20' },
  secondary: { iconBg: 'bg-secondary/10', iconText: 'text-secondary', ring: 'ring-secondary/20' },
  success: { iconBg: 'bg-success/10', iconText: 'text-success-text', ring: 'ring-success/20' },
  warning: { iconBg: 'bg-warning/10', iconText: 'text-warning', ring: 'ring-warning/20' },
  danger: { iconBg: 'bg-destructive/10', iconText: 'text-destructive', ring: 'ring-destructive/20' },
  info: { iconBg: 'bg-info/10', iconText: 'text-info', ring: 'ring-info/20' },
} as const

const TREND_MAP = {
  up: { icon: ArrowUpRight, color: 'text-success-text', bg: 'bg-success/10' },
  down: { icon: ArrowDownRight, color: 'text-destructive', bg: 'bg-destructive/10' },
  neutral: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted' },
} as const

/**
 * StatCard — Carte de métrique pour tableaux de bord.
 *
 * Affiche : icône (Lucide) + label + valeur + tendance + hint.
 *
 * Design :
 *   - Card-based avec border-radius-lg (16px), shadow-sm, border par défaut
 *   - Hover lift (translateY -2px) si interactive (onClick)
 *   - Icône dans un badge coloré selon l'accent sémantique
 *   - Tendance avec flèche colorée (success/danger/neutral)
 *
 * Accessibilité :
 *   - Si interactive, rendu en <button> avec aria-label
 *   - focus-visible ring
 *
 * Performance :
 *   - Pas de layout shift (hauteur fixe du header de tendance)
 *   - Animation Framer Motion spring à l'entrée (stagger via index)
 *   - Respecte prefers-reduced-motion (global CSS)
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'primary',
  trend,
  hint,
  suffix,
  scoreOn20,
  loading = false,
  index = 0,
  onClick,
}: StatCardProps) {
  const accentMeta = ACCENT_MAP[accent]
  const isInteractive = !!onClick

  // Coloration dynamique de la valeur si scoreOn20 fourni (priorité sur l'accent)
  const valueColorClass =
    scoreOn20 !== undefined
      ? scoreOn20 >= 16
        ? 'text-success-text'
        : scoreOn20 >= 10
          ? 'text-warning'
          : 'text-destructive'
      : undefined

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
      className={cn(
        'relative p-4 sm:p-5 rounded-lg border border-border bg-card shadow-sm ds-kente-top overflow-hidden',
        isInteractive && 'ds-lift cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {/* Header : icône + tendance
          BUGFIX (LAYOUT-STATCARD-1) : min-w-0 sur l'icône (shrink-0) + overflow-hidden
          sur la carte pour empêcher tout débordement. gap-2 (au lieu de gap-3) pour
          gagner de l'espace horizontal sur petit écran. */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={cn(
            'h-9 w-9 shrink-0 rounded-md flex items-center justify-center sm:h-10 sm:w-10',
            accentMeta.iconBg,
            accentMeta.iconText
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
              TREND_MAP[trend.direction].bg,
              TREND_MAP[trend.direction].color
            )}
          >
            {(() => {
              const TrendIcon = TREND_MAP[trend.direction].icon
              return <TrendIcon className="h-3 w-3" />
            })()}
            <span className="tabular-nums">{trend.value}</span>
          </div>
        )}
      </div>

      {/* Label + valeur
          BUGFIX (LAYOUT-STATCARD-1) : truncate sur le label, min-w-0 + break-all
          sur la valeur pour empêcher le débordement. La valeur reste sur une ligne
          mais peut se casser si vraiment trop longue (ex: 9999/9999). */}
      <p className="mb-1 truncate text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <PulseSkeleton className="h-8 w-24" />
      ) : (
        <p className={cn('font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl', valueColorClass)}>
          <span className="break-all">{value}</span>
          {suffix && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{suffix}</span>}
        </p>
      )}

      {/* Hint / trend label — truncate pour empêcher le débordement */}
      {(hint || trend?.label) && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {hint ?? trend?.label}
        </p>
      )}
    </motion.div>
  )

  if (isInteractive) {
    return (
      <button
        onClick={onClick}
        aria-label={`${label}: ${value}`}
        className="text-left w-full"
      >
        {content}
      </button>
    )
  }

  return content
}
