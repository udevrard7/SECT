'use client'

import { motion } from 'framer-motion'
import { Flame, Star, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Tiers de gamification (bronze → argent → or → platine).
 * L'ordre correspond aussi à la progression.
 */
export type GamificationTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface UserStatsData {
  /** Points d'expérience */
  xp: number
  /** Nombre de jours consécutifs (streak) */
  streak: number
  /** Niveau actuel (déduit de l'XP ou fourni directement) */
  level?: number
  /** Tier de badge actuel */
  tier?: GamificationTier
}

const TIER_META: Record<GamificationTier, { glow: string; ring: string; label: string; letter: string }> = {
  bronze: { glow: 'ds-glow-bronze', ring: 'ring-bronze/30', label: 'Bronze', letter: 'B' },
  silver: { glow: 'ds-glow-silver', ring: 'ring-silver/40', label: 'Argent', letter: 'S' },
  gold: { glow: 'ds-glow-gold', ring: 'ring-gold/40', label: 'Or', letter: 'A' },
  platinum: { glow: 'ds-glow-platinum', ring: 'ring-platinum/50', label: 'Platine', letter: 'P' },
}

/** Couleur de texte statique par tier (Tailwind v4 ne génère pas les classes dynamiques) */
const TIER_TEXT: Record<GamificationTier, string> = {
  bronze: 'text-bronze',
  silver: 'text-silver',
  gold: 'text-gold',
  platinum: 'text-platinum',
}

/** Style inline pour fond coloré par tier (évite les classes dynamiques) */
function tierBgStyle(tier: GamificationTier): React.CSSProperties {
  return { backgroundColor: `var(--${tier})` }
}

/** Couleur de texte lisible sur fond tier (sombre pour silver/platinum clairs) */
function tierOnBgColor(tier: GamificationTier): string {
  return tier === 'silver' || tier === 'platinum' ? '#000' : '#fff'
}

interface StatPillProps {
  icon: LucideIcon
  value: number | string
  label: string
  accent: 'xp' | 'streak' | 'level'
  tier?: GamificationTier
}

function StatPill({ icon: Icon, value, label, accent, tier }: StatPillProps) {
  const colorClass =
    accent === 'xp'
      ? 'text-xp'
      : accent === 'streak'
        ? 'text-warning'
        : tier
          ? TIER_TEXT[tier]
          : 'text-primary'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border">
      <Icon className={cn('h-4 w-4', colorClass)} />
      <div className="flex items-baseline gap-1">
        <span className={cn('font-mono text-sm font-semibold tabular-nums', colorClass)}>
          {value}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
    </div>
  )
}

export interface UserStatsProps {
  stats: UserStatsData
  /** Mode compact (pills inline) ou détaillé (carte avec avatar) */
  compact?: boolean
  /** Avatar URL (mode détaillé) */
  avatarUrl?: string
  /** Nom utilisateur (mode détaillé) */
  userName?: string
}

/**
 * UserStats — Affichage gamifié des statistiques utilisateur.
 *
 * Affiche : XP (violet), streak (ambre/flamme), niveau/tier (couleur tier).
 *
 * Deux variantes :
 *   - compact (défaut pour topbar) : 3 pills inline
 *   - detailed (carte profil) : avatar + nom + tier + 3 stats en colonne
 *
 * Animations Framer Motion :
 *   - Les pills apparaissent en stagger (décalées) à l'entrée
 *   - Pulse subtil sur le streak quand > 0 (récompense la régularité)
 */
export function UserStats({ stats, compact = true, avatarUrl, userName }: UserStatsProps) {
  const tier = stats.tier
  const tierMeta = tier ? TIER_META[tier] : null

  const pills = (
    <motion.div
      className="flex items-center gap-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: -4 }, visible: { opacity: 1, y: 0 } }}
      >
        <StatPill icon={Zap} value={stats.xp.toLocaleString('fr-FR')} label="XP" accent="xp" />
      </motion.div>
      <motion.div
        variants={{ hidden: { opacity: 0, y: -4 }, visible: { opacity: 1, y: 0 } }}
      >
        <motion.div
          animate={stats.streak > 0 ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 1.5, repeat: stats.streak > 0 ? Infinity : 0, ease: 'easeInOut' }}
        >
          <StatPill icon={Flame} value={stats.streak} label="jours" accent="streak" />
        </motion.div>
      </motion.div>
      {(stats.level || tier) && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: -4 }, visible: { opacity: 1, y: 0 } }}
        >
          <StatPill
            icon={Star}
            value={stats.level ?? tierMeta?.label ?? ''}
            label={tier ? '' : 'niv.'}
            accent="level"
            tier={tier}
          />
        </motion.div>
      )}
    </motion.div>
  )

  if (compact) {
    return pills
  }

  // Mode détaillé : carte profil
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card ds-lift">
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={userName ?? ''}
            className={cn(
              'h-12 w-12 rounded-full object-cover ring-2',
              tier ? tierMeta?.ring : 'ring-primary/30'
            )}
          />
        ) : (
          <div
            className={cn(
              'h-12 w-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold ring-2',
              tier ? tierMeta?.ring : 'ring-primary/30',
              tier && tierMeta?.glow
            )}
          >
            {userName?.slice(0, 2).toUpperCase() ?? '?'}
          </div>
        )}
        {tier && (
          <span
            className={cn(
              'absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-card flex items-center justify-center text-[9px] font-bold',
              tierMeta?.glow
            )}
            style={tierBgStyle(tier)}
          >
            <span style={{ color: tierOnBgColor(tier) }}>{tierMeta?.letter}</span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        {userName && (
          <p className="text-sm font-semibold truncate">{userName}</p>
        )}
        {tier && (
          <p className="text-[11px] text-muted-foreground">
            Tier <span className={cn('font-semibold', TIER_TEXT[tier])}>{tierMeta?.label}</span>
          </p>
        )}
        <div className="mt-1.5">{pills}</div>
      </div>
    </div>
  )
}
