'use client'

import { motion } from 'framer-motion'
import { type LucideIcon, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { PulseSkeleton } from './pulse-skeleton'
import type { GamificationTier } from './user-stats'

export interface EntityCardProps {
  /** Titre de l'entité (ex: "Examen final - Algorithmique") */
  title: string
  /** Sous-titre / description courte */
  subtitle?: string
  /** Thumbnail : URL image ou icône Lucide fallback */
  thumbnailUrl?: string
  thumbnailIcon?: LucideIcon
  /** Progression 0-100 (affiche une barre animée) */
  progress?: number
  /** Niveau de difficulté / tier (badge coloré) */
  tier?: GamificationTier
  /** Badge personnalisé (libellé + couleur) */
  badge?: { label: string; variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' }
  /** Métadonnées en footer (ex: "12 questions · 45 min") */
  meta?: string
  /** Niveau d'apprentissage du cours/module (ex: 3 sur 5) — affiché
   *  comme un badge "Niveau X" + icône. Permet la gamification par cours. */
  level?: { current: number; max: number; label?: string }
  /** État de chargement */
  loading?: boolean
  /** Index pour stagger d'animation */
  index?: number
  /** Callback au clic */
  onClick?: () => void
  /** Action secondaire (bouton chevron à droite) */
  onAction?: () => void
  /** Children : contenu personnalisé dans le corps de la carte */
  children?: React.ReactNode
}

const BADGE_VARIANT_MAP = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
} as const

/**
 * EntityCard — Carte d'entité générique (épreuve, cours, étudiant, devoir…).
 *
 * Affiche : thumbnail + titre + sous-titre + badge + barre de progression + meta.
 *
 * Design :
 *   - Card-based, radius-lg (16px), shadow-sm, border par défaut
 *   - Hover lift (translateY -2px) si interactive
 *   - Thumbnail 16:9 (image) ou icône dans un carré coloré (fallback)
 *   - Barre de progression animée (Framer Motion spring)
 *   - Badge tier (bronze/argent/or/platine) avec glow subtil
 *
 * Accessibilité :
 *   - Si interactive, <button> entier cliquable avec aria-label
 *   - Chevron d'action secondaire avec aria-label distinct
 */
export function EntityCard({
  title,
  subtitle,
  thumbnailUrl,
  thumbnailIcon: ThumbnailIcon,
  progress,
  tier,
  badge,
  meta,
  level,
  loading = false,
  index = 0,
  onClick,
  onAction,
  children,
}: EntityCardProps) {
  const isInteractive = !!onClick
  const hasProgress = progress !== undefined && progress >= 0

  const cardClasses = cn(
    'group relative p-0 rounded-lg border border-border bg-card shadow-sm overflow-hidden',
    isInteractive && 'ds-lift cursor-pointer',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  )

  const inner = (
    <>
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {loading ? (
          <PulseSkeleton className="h-full w-full" variant="card" />
        ) : thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : ThumbnailIcon ? (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
            <ThumbnailIcon className="h-10 w-10 text-primary/60" />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted">
            <span className="font-display text-2xl font-bold text-muted-foreground">
              {title.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        {/* Badge overlay (tier ou custom) — alignés top-right, tailles égales */}
        {(tier || badge) && (
          <div className="absolute top-2 right-2 flex gap-1.5 items-center">
            {tier && (
              <span
                className={cn(
                  'h-6 min-w-[1.5rem] px-2 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 capitalize backdrop-blur-sm shadow-sm',
                  `ds-glow-${tier}`
                )}
                style={{
                  backgroundColor: `var(--${tier})`,
                  color: tier === 'silver' || tier === 'platinum' ? '#000' : '#fff',
                }}
              >
                {tier}
              </span>
            )}
            {badge && (
              <span
                className={cn(
                  'h-6 min-w-[1.5rem] px-2 rounded-full text-[10px] font-semibold flex items-center justify-center shadow-sm',
                  BADGE_VARIANT_MAP[badge.variant ?? 'primary']
                )}
              >
                {badge.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {loading ? (
          <>
            <PulseSkeleton className="h-4 w-3/4 mb-2" />
            <PulseSkeleton className="h-3 w-1/2" />
          </>
        ) : (
          <>
            <h3 className="font-semibold text-sm leading-tight line-clamp-2 mb-0.5">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
            )}
          </>
        )}

        {/* Progress bar */}
        {hasProgress && !loading && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Progression
              </span>
              <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
                {Math.round(progress!)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress!, 100)}%` }}
                transition={{ duration: 0.6, delay: index * 0.05 + 0.1, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Children (contenu personnalisé) */}
        {children}

        {/* Niveau d'apprentissage (gamification par cours/module) */}
        {level && !loading && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {level.label ?? 'Niveau'}
            </span>
            <div className="flex gap-0.5">
              {Array.from({ length: level.max }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    i < level.current ? 'bg-primary' : 'bg-muted'
                  )}
                />
              ))}
            </div>
            <span className="font-mono text-[10px] font-semibold tabular-nums text-primary ml-0.5">
              {level.current}/{level.max}
            </span>
          </div>
        )}

        {/* Meta footer */}
        {meta && !loading && (
          <p className="mt-2 text-[11px] text-muted-foreground">{meta}</p>
        )}
      </div>
    </>
  )

  const motionProps = {
    initial: { opacity: 0, y: 8 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.25, delay: index * 0.05, ease: 'easeOut' as const },
  }

  if (isInteractive) {
    return (
      <motion.button
        {...motionProps}
        onClick={onClick}
        aria-label={title}
        className={cn(cardClasses, 'text-left w-full block')}
      >
        {inner}
      </motion.button>
    )
  }

  return (
    <motion.div {...motionProps} className={cn(cardClasses, 'relative')}>
      {inner}
      {onAction && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          aria-label={`Action sur ${title}`}
          className="absolute bottom-3 right-3 h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  )
}
