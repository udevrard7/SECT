'use client'

import { cn } from '@/lib/utils'

export interface PulseSkeletonProps {
  /** Classes Tailwind pour la taille (ex: "h-4 w-full", "h-8 w-24") */
  className?: string
  /** Forme : rounded par défaut, rounded-full pour les avatars, rounded-lg pour les cartes */
  variant?: 'default' | 'circle' | 'card'
}

/**
 * PulseSkeleton — État de chargement animé (pulse).
 *
 * Remplace les spinners par des blocs gris qui "respirent" (pulse),
 * indiquant que le contenu se charge sans CLS (le squelette occupe
 * la place finale du contenu).
 *
 * Variants :
 *   - default : barre arrondie (texte, inputs)
 *   - circle : cercle (avatars, icônes)
 *   - card : carte complète (radius-lg)
 *
 * Performance :
 *   - Animation CSS pure (animate-pulse de Tailwind), pas de JS
 *   - Respecte prefers-reduced-motion (désactivé automatiquement)
 */
export function PulseSkeleton({ className, variant = 'default' }: PulseSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted',
        variant === 'circle' && 'rounded-full',
        variant === 'card' && 'rounded-lg',
        variant === 'default' && 'rounded-md',
        className
      )}
      aria-hidden="true"
    />
  )
}

/**
 * Grille de skeletons pour un tableau de bord (4 StatCards en chargement).
 */
export function StatCardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 rounded-lg border border-border bg-card">
          <div className="flex items-start justify-between mb-3">
            <PulseSkeleton className="h-10 w-10" variant="circle" />
            <PulseSkeleton className="h-5 w-16" />
          </div>
          <PulseSkeleton className="h-4 w-24 mb-2" />
          <PulseSkeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}
