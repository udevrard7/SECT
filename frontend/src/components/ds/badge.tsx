'use client'

import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

// [35m══════════════════════════════════════════════════════════════════════════════
// Badge unifié pour Savane EdTech
// Palette africaine : vert lime (success), terre cuite (warning), or (gold), etc.
// [35m══════════════════════════════════════════════════════════════════════════════

/**
 * BadgeProps  Props pour le composant Badge avec variants sémantiques.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Réussi</Badge>
 * <Badge variant="warning">À retravailler</Badge>
 * <Badge variant="gold">Récompense</Badge>
 * ```
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Contenu du badge (texte ou icône) */
  children: React.ReactNode
  /** Variante de couleur (par défaut: 'default') */
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'bronze' | 'silver'
  /** Taille du badge */
  size?: 'sm' | 'md' | 'lg'
  /** Style supplémentaire */
  className?: string
}

// [36mVariants de style pour le Badge[0m
const badgeVariants = cva(
  'inline-flex items-center justify-center font-medium rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-secondary/10 text-secondary-foreground',
        primary: 'bg-primary/10 text-primary-text',
        secondary: 'bg-secondary/10 text-secondary-foreground',
        success: 'bg-success/10 text-success-text',
        warning: 'bg-warning/10 text-warning-foreground',
        danger: 'bg-destructive/10 text-destructive',
        info: 'bg-info/10 text-info-foreground',
        // [33mVariantes gamification (palette africaine)[0m
        gold: 'bg-gold/20 text-gold dark:bg-gold/30 dark:text-gold',
        bronze: 'bg-bronze/20 text-bronze dark:bg-bronze/30 dark:text-bronze',
        silver: 'bg-silver/20 text-silver dark:bg-silver/30 dark:text-silver',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

/**
 * Badge  Composant de badge unifié pour Savane EdTech.
 *
 * @example
 * ```tsx
 * // Badge de statut
 * <Badge variant="success">Corrigé</Badge>
 *
 * // Badge avec icône
 * <Badge variant="warning" size="lg">
 *   <AlertTriangle className="h-3 w-3 mr-1" />
 *   À retravailler
 * </Badge>
 *
 * // Badge de récompense (or)
 * <Badge variant="gold">
 *   <Trophy className="h-3 w-3 mr-1" />
 *   Top 10%
 * </Badge>
 * ```
 */
export function Badge({ children, variant = 'default', size = 'md', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </span>
  )
}

// [36mVariantes pré-définies pour les statuts courants[0m
export const BadgeStatus = {
  /** Badge pour les éléments réussis (vert lime) */
  Success: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <Badge variant="success" className={className}>
      {children}
    </Badge>
  ),
  /** Badge pour les éléments en attente (orange) */
  Warning: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <Badge variant="warning" className={className}>
      {children}
    </Badge>
  ),
  /** Badge pour les éléments en échec (rouge) */
  Danger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <Badge variant="danger" className={className}>
      {children}
    </Badge>
  ),
  /** Badge pour les récompenses (or) */
  Gold: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <Badge variant="gold" className={className}>
      {children}
    </Badge>
  ),
  /** Badge pour les informations (bleu nuit) */
  Info: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <Badge variant="info" className={className}>
      {children}
    </Badge>
  ),
}
