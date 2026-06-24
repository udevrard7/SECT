'use client'

import { motion } from 'framer-motion'
import { Lock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GamificationTier } from './user-stats'

/**
 * Données d'un badge (récompense gamifiée).
 * Réutilisé par `RewardCenter` mais aussi standalone.
 */
export interface BadgeData {
  /** Titre court (ex: "Marathonien") */
  title: string
  /** Description / condition de déblocage */
  description: string
  /** Tier de rareté (bronze → argent → or → platine) */
  tier: GamificationTier
  /** Icône Lucide représentant le badge */
  icon: LucideIcon
  /** Débloqué ou verrouillé */
  unlocked: boolean
  /** Date de déblocage (si unlocked) */
  unlockedAt?: Date
  /** Progression 0-100 vers le déblocage (si locked) */
  progress?: number
}

export interface BadgeCardProps {
  /** Données du badge à afficher */
  badge: BadgeData
  /** Index pour stagger d'animation (délai d'entrée) */
  index?: number
}

/* ── Maps statiques par tier (Tailwind v4 purge les classes dynamiques) ── */

const TIER_TEXT: Record<GamificationTier, string> = {
  bronze: 'text-bronze',
  silver: 'text-silver',
  gold: 'text-gold',
  platinum: 'text-platinum',
}

const TIER_GLOW: Record<GamificationTier, string> = {
  bronze: 'ds-glow-bronze',
  silver: 'ds-glow-silver',
  gold: 'ds-glow-gold',
  platinum: 'ds-glow-platinum',
}

const TIER_LABEL: Record<GamificationTier, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
  platinum: 'Platine',
}

/** Couleur de texte lisible sur fond tier (sombre pour silver/platinum clairs) */
function tierOnBgColor(tier: GamificationTier): string {
  return tier === 'silver' || tier === 'platinum' ? '#000' : '#fff'
}

/** Formate une date en "12 mars 2024" (locale fr-FR) */
function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * BadgeCard — Carte de badge (récompense gamifiée) standalone.
 *
 * Affichage :
 *   - Icône dans un cercle coloré selon le tier (couleur pleine)
 *   - Titre + description + label de tier
 *   - Si débloqué : `ds-glow-{tier}` (lueur subtile) + `ds-lift` au hover
 *     + date de déblocage en font-mono
 *   - Si verrouillé : grayscale + opacity-60 + overlay icône cadenas
 *     + barre de progression animée (si `progress` fourni)
 *
 * Animations Framer Motion :
 *   - Entrée en stagger (delay = index * 60ms)
 *   - Barre de progression animée si verrouillé
 *
 * Accessibilité :
 *   - role="article" + aria-label descriptif
 *   - État verrouillé/débloqué exposé via aria-label
 *
 * @example
 * <BadgeCard
 *   badge={{
 *     title: 'Marathonien',
 *     description: 'Compléter 10 examens',
 *     tier: 'gold',
 *     icon: Trophy,
 *     unlocked: true,
 *     unlockedAt: new Date('2024-03-12'),
 *   }}
 *   index={2}
 * />
 */
export function BadgeCard({ badge, index = 0 }: BadgeCardProps) {
  const { title, description, tier, icon: Icon, unlocked, unlockedAt, progress } = badge

  const hasProgress = !unlocked && progress !== undefined && progress >= 0
  const showProgressBar = !unlocked && (progress === undefined || progress === 0)
  const clampedProgress = Math.min(Math.max(progress ?? 0, 0), 100)

  const cardClasses = cn(
    'group relative p-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden',
    'flex flex-col items-center text-center',
    unlocked && TIER_GLOW[tier],
    unlocked && 'ds-lift cursor-default',
    !unlocked && 'grayscale opacity-60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  )

  const ariaLabel = unlocked
    ? `Badge ${title}, tier ${TIER_LABEL[tier]}, débloqué${unlockedAt ? ` le ${formatFrDate(unlockedAt)}` : ''}`
    : `Badge ${title}, tier ${TIER_LABEL[tier]}, verrouillé${hasProgress ? `, progression ${Math.round(clampedProgress)}%` : ''}`

  return (
    <motion.article
      role="article"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cardClasses}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.3,
        delay: index * 0.06,
        ease: 'easeOut',
      }}
    >
      {/* Cercle icône coloré par tier */}
      <div className="relative mb-3">
        <div
          className={cn(
            'h-14 w-14 rounded-full flex items-center justify-center transition-transform duration-300',
            unlocked && 'group-hover:scale-110'
          )}
          style={{
            backgroundColor: `color-mix(in oklch, var(--${tier}) 18%, transparent)`,
          }}
        >
          <Icon
            className="h-7 w-7"
            style={{ color: `var(--${tier})` }}
            aria-hidden="true"
          />
        </div>

        {/* Overlay cadenas si verrouillé */}
        {!unlocked && (
          <span
            className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center shadow-sm"
            aria-hidden="true"
          >
            <Lock className="h-3 w-3 text-muted-foreground" />
          </span>
        )}
      </div>

      {/* Tier label */}
      <span
        className="mb-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
        style={{
          backgroundColor: `var(--${tier})`,
          color: tierOnBgColor(tier),
        }}
      >
        {TIER_LABEL[tier]}
      </span>

      {/* Titre */}
      <h4 className="font-display text-sm font-semibold leading-tight line-clamp-1">
        {title}
      </h4>

      {/* Description */}
      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 min-h-[2.5rem]">
        {description}
      </p>

      {/* Footer : progression ou date de déblocage — espacé pour éviter chevauchement */}
      <div className="mt-auto pt-3 w-full">
        {unlocked ? (
          unlockedAt && (
            <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
              Débloqué le {formatFrDate(unlockedAt)}
            </p>
          )
        ) : hasProgress ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Progression
              </span>
              <span className={cn('font-mono text-[10px] font-semibold tabular-nums', TIER_TEXT[tier])}>
                {Math.round(clampedProgress)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: `var(--${tier})` }}
                initial={{ width: 0 }}
                animate={{ width: `${clampedProgress}%` }}
                transition={{
                  duration: 0.7,
                  delay: index * 0.06 + 0.15,
                  ease: 'easeOut',
                }}
              />
            </div>
          </div>
        ) : showProgressBar ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Progression
              </span>
              <span className={cn('font-mono text-[10px] font-semibold tabular-nums', TIER_TEXT[tier])}>
                0%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full opacity-30"
                style={{ backgroundColor: `var(--${tier})`, width: '2%' }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Verrouillé</p>
        )}
      </div>
    </motion.article>
  )
}
