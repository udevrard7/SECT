'use client'

import { motion, type Transition } from 'framer-motion'
import { cn } from '@/lib/utils'

export type ProgressBarAccent =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'tech'
  | 'xp'

export interface ProgressBarProps {
  /** Progression 0-100 */
  value: number
  /** Couleur d'accent sémantique (défaut : primary) */
  accent?: ProgressBarAccent
  /** Taille de la barre */
  size?: 'sm' | 'md' | 'lg'
  /** Afficher le libellé (gauche) */
  showLabel?: boolean
  /** Texte du libellé (gauche) */
  label?: string
  /** Afficher le pourcentage (droite) */
  showValue?: boolean
  /** Index pour animation en stagger (délai = index * 0.05s) */
  index?: number
  /** Halo lumineux subtil derrière le remplissage */
  showGlow?: boolean
  /** Classe additionnelle sur le conteneur */
  className?: string
}

/**
 * Map statique accent → classes Tailwind.
 * Tailwind v4 purge les classes dynamiques (bg-${var}), on utilise
 * donc un Record explicite pour garantir la génération du CSS.
 */
const ACCENT_FILL: Record<ProgressBarAccent, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  tech: 'bg-tech',
  xp: 'bg-xp',
}

/** Couleur CSS (var) pour le glow box-shadow — inline style (pas purgeable). */
const ACCENT_GLOW_VAR: Record<ProgressBarAccent, string> = {
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  tech: 'var(--tech)',
  xp: 'var(--xp)',
}

const SIZE_TRACK: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
}

const SIZE_TEXT: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
}

const SPRING: Transition = { type: 'spring', damping: 22, stiffness: 220 }

/**
 * ProgressBar — Barre de progression animée (Framer Motion spring).
 *
 * Affiche : libellé optionnel (gauche) + piste (track) + remplissage
 * animé + pourcentage (droite).
 *
 * Design :
 *   - Track `bg-muted` avec hauteur selon `size` (1.5 / 2 / 3 unités)
 *   - Remplissage `bg-{accent}` animé width 0 → value% via spring
 *   - Halo `box-shadow` optionnel dans la couleur d'accent (showGlow)
 *   - Texte `font-mono tabular-nums` pour alignement parfait
 *
 * Accessibilité :
 *   - role="progressbar"
 *   - aria-valuenow / aria-valuemin / aria-valuemax
 *   - aria-label fourni par le libellé ou "Progression"
 *
 * Performance :
 *   - Animation GPU-friendly (width via Framer Motion)
 *   - Stagger via index * 0.05s
 *   - Respecte prefers-reduced-motion (CSS global + Framer Motion)
 *
 * Usage typique : progression de cours, complétion de module, score.
 */
export function ProgressBar({
  value,
  accent = 'primary',
  size = 'md',
  showLabel = true,
  label,
  showValue = true,
  index = 0,
  showGlow = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), 100)
  const trackClass = SIZE_TRACK[size]
  const textClass = SIZE_TEXT[size]
  const fillClass = ACCENT_FILL[accent]
  const glowColor = ACCENT_GLOW_VAR[accent]

  const displayLabel = label ?? ''
  const ariaLabel = displayLabel || 'Progression'

  return (
    <div className={cn('w-full', className)}>
      {(showLabel && displayLabel) || showValue ? (
        <div
          className={cn(
            'mb-1 flex items-center justify-between gap-2',
            textClass
          )}
        >
          {showLabel && displayLabel ? (
            <span className="font-medium text-foreground truncate">
              {displayLabel}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          {showValue && (
            <span
              className="font-mono font-semibold tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-muted',
          trackClass
        )}
      >
        <motion.div
          className={cn('h-full rounded-full', fillClass)}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ ...SPRING, delay: index * 0.05 }}
          style={
            showGlow
              ? { boxShadow: `0 0 10px -2px ${glowColor}` }
              : undefined
          }
        />
      </div>
    </div>
  )
}
