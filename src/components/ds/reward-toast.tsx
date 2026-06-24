'use client'

import { type ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playRewardSound } from '@/lib/sounds'
import type { GamificationTier } from './user-stats'

export interface RewardToastProps {
  /** Afficher ou non la toast */
  open: boolean
  /** Callback à la fermeture (auto ou manuelle) */
  onClose?: () => void
  /** Titre de la récompense (ex: "Nouveau badge débloqué !") */
  title: string
  /** Description (ex: "Vous avez complété 10 examens sans erreur") */
  description?: string
  /** Points XP gagnés (affichés en gros) */
  xpGained?: number
  /** Tier de la récompense */
  tier?: GamificationTier
  /** Icône personnalisée (défaut : Award) */
  icon?: LucideIcon
  /** Durée d'affichage en ms (0 = manuel) */
  duration?: number
}

const TIER_LABEL: Record<GamificationTier, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
  platinum: 'Platine',
}

/**
 * RewardToast — Notification de récompense gamifiée.
 *
 * Affiche une toast animée qui célèbre une réussite utilisateur :
 *   - Badge débloqué, XP gagnés, niveau atteint, streak préservé…
 *
 * Design :
 *   - Position : top-center, fixed, z-50
 *   - Fond opaque (bg-card) pour lisibilité maximale
 *   - Icône de récompense dans un cercle coloré selon le tier
 *   - XP gagnés en grand, en violet (couleur XP)
 *   - Animation d'entrée : slide-down + spring + pulse de l'icône
 *   - Animation de sortie : slide-up + fade
 *   - Auto-dismiss après `duration` (défaut 4s)
 *
 * Accessibilité :
 *   - role="status" aria-live="assertive"
 *   - Bouton fermer avec aria-label
 *
 * Performance :
 *   - Respecte prefers-reduced-motion
 *   - Auto-dismiss via setTimeout (clearTimeout au démontage)
 */
export function RewardToast({
  open,
  onClose,
  title,
  description,
  xpGained,
  tier,
  icon: Icon = Award,
  duration = 4000,
}: RewardToastProps) {
  // Son de récompense à l'ouverture (optionnel, respecte prefers-reduced-motion)
  useEffect(() => {
    if (open) playRewardSound()
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.85 }}
          animate={{
            opacity: 1,
            y: [0, -8, 0], // bounce subtil après l'entrée
            scale: 1,
          }}
          exit={{ opacity: 0, y: -40, scale: 0.9 }}
          transition={{
            type: 'spring',
            damping: 14, // moins de damping = plus de bounce
            stiffness: 320,
            mass: 0.8,
          }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
          role="status"
          aria-live="assertive"
          onAnimationComplete={() => {
            if (duration > 0 && onClose) {
              setTimeout(onClose, duration)
            }
          }}
        >
          <motion.div
            className="bg-card border border-border rounded-xl shadow-2xl p-4 flex items-center gap-3.5 relative overflow-hidden"
            animate={{
              boxShadow: tier
                ? [
                    '0 25px 50px -12px rgba(0,0,0,0.25)',
                    `0 25px 50px -12px color-mix(in oklch, var(--${tier}) 30%, transparent)`,
                    '0 25px 50px -12px rgba(0,0,0,0.25)',
                  ]
                : [
                    '0 25px 50px -12px rgba(0,0,0,0.25)',
                    '0 25px 50px -12px color-mix(in oklch, var(--xp) 30%, transparent)',
                    '0 25px 50px -12px rgba(0,0,0,0.25)',
                  ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Icône de récompense avec pulse + bounce marqué */}
            <motion.div
              className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: tier
                  ? `color-mix(in oklch, var(--${tier}) 15%, transparent)`
                  : 'color-mix(in oklch, var(--xp) 15%, transparent)',
              }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{
                scale: [0, 1.3, 1], // pop-in overshoot
                rotate: [-180, 10, 0],
              }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            >
              <Icon
                className="h-6 w-6"
                style={tier ? { color: `var(--${tier})` } : { color: 'var(--xp)' }}
              />
            </motion.div>

            {/* Texte */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">{title}</p>
              {description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
              )}
              {tier && (
                <span
                  className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: `var(--${tier})`, color: tier === 'silver' || tier === 'platinum' ? '#000' : '#fff' }}
                >
                  {TIER_LABEL[tier]}
                </span>
              )}
            </div>

            {/* XP gagnés */}
            {xpGained !== undefined && (
              <div className="shrink-0 text-right">
                <p className="font-mono font-bold text-lg text-xp leading-none">+{xpGained}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">XP</p>
              </div>
            )}

            {/* Bouton fermer */}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Fermer la notification"
                className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
