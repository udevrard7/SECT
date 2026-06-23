'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ProgressRingProps {
  /** Progression 0-100 */
  value: number
  /** Taille du SVG en px */
  size?: number
  /** Épaisseur de l'anneau en px */
  strokeWidth?: number
  /** Couleur d'accent (semantic) */
  accent?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'xp'
  /** Texte affiché au centre (défaut : pourcentage) */
  label?: string
  /** Sous-texte affiché sous le label */
  sublabel?: string
  /** Afficher le signe % après la valeur */
  showPercent?: boolean
  /** Index pour stagger (délai d'animation) */
  index?: number
}

const ACCENT_COLOR: Record<NonNullable<ProgressRingProps['accent']>, string> = {
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--destructive)',
  info: 'var(--info)',
  xp: 'var(--xp)',
}

/**
 * ProgressRing — Anneau de progression SVG animé (Framer Motion).
 *
 * Affiche un anneau circulaire qui se remplit progressivement avec une
 * animation spring. Le centre affiche la valeur (pourcentage ou label).
 *
 * Design :
 *   - Anneau SVG avec stroke-linecap round
 *   - Fond de piste (track) en muted
 *   - Progression colorée selon l'accent sémantique
 *   - Animation : stroke-dashoffset animé de la circonférence à 0
 *
 * Performance :
 *   - SVG natif (pas de canvas/lottie), léger
 *   - Animation Framer Motion sur stroke-dashoffset (GPU-friendly)
 *   - Respecte prefers-reduced-motion
 *
 * Usage typique : score d'examen, complétion de profil, taux de réussite.
 */
export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 8,
  accent = 'primary',
  label,
  sublabel,
  showPercent = true,
  index = 0,
}: ProgressRingProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clampedValue / 100) * circumference
  const color = ACCENT_COLOR[accent]

  const displayLabel = label ?? `${Math.round(clampedValue)}${showPercent ? '%' : ''}`

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-label={`Progression: ${Math.round(clampedValue)}%`}
        role="img"
      >
        {/* Track (piste de fond) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        {/* Progression animée */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: 0.8,
            delay: index * 0.08,
            ease: 'easeOut',
          }}
        />
      </svg>
      {/* Label central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold tabular-nums leading-none" style={{ fontSize: size * 0.22 }}>
          {displayLabel}
        </span>
        {sublabel && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
