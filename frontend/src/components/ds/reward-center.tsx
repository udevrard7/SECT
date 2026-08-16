'use client'

import { motion } from 'framer-motion'
import { Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BadgeCard, type BadgeData } from './badge-card'
import { ProgressRing } from './progress-ring'

/**
 * Récompense (badge) pour le RewardCenter.
 * Étend `BadgeData` avec un `id` (clé React + suivi).
 */
export interface Reward extends BadgeData {
  /** Identifiant unique de la récompense */
  id: string
}

export interface UserProgress {
  /** XP actuel de l'utilisateur */
  xp: number
  /** XP total requis pour passer au niveau suivant */
  nextLevelXp: number
  /** Niveau actuel */
  level: number
}

export interface RewardCenterProps {
  /** Liste des récompenses à afficher */
  rewards: Reward[]
  /** Progression utilisateur (XP / niveau) — affichée dans le header */
  userProgress?: UserProgress
  /** ClassName supplémentaire sur le conteneur */
  className?: string
}

/**
 * RewardCenter — Panneau de récompenses (style Duolingo achievements).
 *
 * Affiche :
 *   - Header gamifié : ProgressRing d'XP + niveau + "X XP vers niveau Y"
 *   - Grille de `BadgeCard` (2 colonnes mobile, 3 tablette, 4 desktop)
 *
 * Animations Framer Motion :
 *   - Header fade-in
 *   - Grille en staggerChildren (chaque BadgeCard apparaît décalée)
 *
 * Accessibilité :
 *   - role="region" aria-label
 *   - Header sémantique avec niveau + progression
 *
 * @example
 * <RewardCenter
 *   userProgress={{ xp: 1200, nextLevelXp: 2000, level: 5 }}
 *   rewards={[
 *     { id: '1', title: 'Marathonien', description: '10 examens', tier: 'gold', icon: Trophy, unlocked: true, unlockedAt: new Date() },
 *     { id: '2', title: 'Débutant', description: '1er examen', tier: 'bronze', icon: Star, unlocked: false, progress: 60 },
 *   ]}
 * />
 */
export function RewardCenter({ rewards, userProgress, className }: RewardCenterProps) {
  // Calcul de la progression vers le niveau suivant (0-100)
  const xpPercent =
    userProgress && userProgress.nextLevelXp > 0
      ? Math.min((userProgress.xp / userProgress.nextLevelXp) * 100, 100)
      : 0

  const xpRemaining =
    userProgress && userProgress.nextLevelXp > 0
      ? Math.max(userProgress.nextLevelXp - userProgress.xp, 0)
      : 0

  // Variants Framer Motion pour la grille (stagger)
  const gridVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.07,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 14, scale: 0.96 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.3, ease: 'easeOut' as const },
    },
  }

  return (
    <section
      role="region"
      aria-label="Centre de récompenses"
      className={cn('flex flex-col gap-5', className)}
    >
      {/* ── Header : progression XP + niveau ── */}
      {userProgress && (
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative p-5 rounded-xl border border-border bg-card overflow-hidden ds-kente-top"
        >
          {/* Halo décoratif */}
          <div
            className="absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ backgroundColor: 'var(--xp)' }}
            aria-hidden="true"
          />

          <div className="relative flex flex-col sm:flex-row items-center gap-5">
            {/* ProgressRing d'XP */}
            <ProgressRing
              value={xpPercent}
              size={88}
              strokeWidth={8}
              accent="xp"
              sublabel="XP"
              index={0}
            />

            {/* Texte progression */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-xp-text" aria-hidden="true" />
                <h3 className="font-display text-base font-semibold tracking-tight">
                  Niveau{' '}
                  <span className="font-mono tabular-nums text-xp-text">{userProgress.level}</span>
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {userProgress.xp.toLocaleString('fr-FR')}
                </span>{' '}
                XP vers niveau{' '}
                <span className="font-mono tabular-nums">{userProgress.level + 1}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
                <Zap className="h-3 w-3 text-xp-text" aria-hidden="true" />
                Plus que{' '}
                <span className="font-mono tabular-nums font-semibold text-xp-text">
                  {xpRemaining.toLocaleString('fr-FR')}
                </span>{' '}
                XP
              </p>
            </div>
          </div>
        </motion.header>
      )}

      {/* ── Grille de badges ── */}
      <div>
        <h4 className="font-display text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Badges{' '}
          <span className="font-mono text-foreground normal-case tracking-normal">
            ({rewards.filter((r) => r.unlocked).length}/{rewards.length})
          </span>
        </h4>

        {rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Aucune récompense disponible pour le moment.
          </p>
        ) : (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            initial="hidden"
            animate="visible"
            variants={gridVariants}
          >
            {rewards.map((reward, i) => (
              <motion.div key={reward.id} variants={itemVariants}>
                <BadgeCard badge={reward} index={i} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  )
}
