// ─────────────────────────────────────────────────────────────
// SavaneIllustration — illustrations africaines subtiles (SVG inline).
//
// Refonte Savane EdTech (B10) : ajoute des motifs culturels africains
// en filigrane dans les empty states, gates et headers.
//
// Conception :
//   - SVG PUR (pas de lib externe), léger (<2ko par variant)
//   - stroke-based pour rester subtil
//   - currentColor pour hériter du token de texte du parent
//   - opacity par défaut très faible (0.06) pour ne pas distraire
//
// Variants :
//   - "baobab"      : silhouette baobab + soleil stylisé
//   - "adinkra"     : symbole adinkra "Gye Nyame" (rotation circulaire)
//   - "kente-border": bande ornementale kente (à utiliser en pied de card)
// ─────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'

export type SavaneIllustrationVariant = 'baobab' | 'adinkra' | 'kente-border'

export interface SavaneIllustrationProps {
  /** Variant graphique à afficher */
  variant: SavaneIllustrationVariant
  /** Taille du viewBox en px (côté du carré pour baobab/adinkra, hauteur pour kente-border) */
  size?: number
  /** Opacité du tracé (0-1). Défaut : 0.06 pour rester très subtil. */
  opacity?: number
  /** Classes Tailwind additionnelles (positionnement, couleur texte…) */
  className?: string
  /** Accessibilité : description courte pour le screen reader */
  ariaLabel?: string
}

/**
 * SavaneIllustration — composant d'illustration africaine subtil.
 *
 * @example
 * ```tsx
 * // Baobab en watermark d'empty state
 * <div className="relative">
 *   <SavaneIllustration variant="baobab" className="absolute right-4 bottom-4 text-primary" />
 *   <p>Aucune donnée</p>
 * </div>
 *
 * // Bordure kente en pied de card
 * <SavaneIllustration variant="kente-border" className="w-full text-gold" opacity={0.12} />
 * ```
 */
export function SavaneIllustration({
  variant,
  size = 120,
  opacity = 0.06,
  className,
  ariaLabel,
}: SavaneIllustrationProps) {
  const commonProps = {
    className: cn('pointer-events-none select-none', className),
    style: { opacity },
    role: ariaLabel ? ('img' as const) : undefined,
    'aria-label': ariaLabel,
    'aria-hidden': ariaLabel ? undefined : (true as const),
  }

  if (variant === 'baobab') {
    // Baobab stylisé : tronc épais court + grande canopée aplatie + soleil
    return (
      <svg
        {...commonProps}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soleil (cercle avec rayons courts) */}
        <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none">
          <circle cx="92" cy="28" r="9" />
          <line x1="92" y1="11" x2="92" y2="6" />
          <line x1="92" y1="50" x2="92" y2="55" />
          <line x1="75" y1="28" x2="70" y2="28" />
          <line x1="109" y1="28" x2="114" y2="28" />
          <line x1="80" y1="16" x2="76" y2="12" />
          <line x1="104" y1="40" x2="108" y2="44" />
          <line x1="80" y1="40" x2="76" y2="44" />
          <line x1="104" y1="16" x2="108" y2="12" />
        </g>
        {/* Canopée du baobab (couronnes superposées) */}
        <g stroke="currentColor" strokeWidth={1.8} fill="none" strokeLinejoin="round">
          <path d="M60 56 C 38 50, 26 62, 30 76 C 20 78, 22 92, 34 92 L 86 92 C 98 92, 100 78, 90 76 C 94 62, 82 50, 60 56 Z" />
          <path d="M60 64 C 46 60, 38 70, 42 80 L 78 80 C 82 70, 74 60, 60 64 Z" />
        </g>
        {/* Tronc court et épais + branches montantes */}
        <g stroke="currentColor" strokeWidth={2.4} fill="none" strokeLinecap="round">
          <line x1="60" y1="92" x2="60" y2="112" />
          <line x1="60" y1="92" x2="44" y2="86" />
          <line x1="60" y1="92" x2="76" y2="86" />
        </g>
      </svg>
    )
  }

  if (variant === 'adinkra') {
    // "Gye Nyame" : symbole circulaire avec 4 branches courbes tournantes
    // symbolisant la suprématie de Dieu. Version stylisée/épurée.
    return (
      <svg
        {...commonProps}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Cercle extérieur */}
          <circle cx="60" cy="60" r="46" />
          {/* Cercle intérieur (limbe) */}
          <circle cx="60" cy="60" r="28" />
          {/* 4 croissants tournés vers l'extérieur (branches de Gye Nyame) */}
          <path d="M60 32 C 50 24, 50 14, 60 8 C 70 14, 70 24, 60 32 Z" />
          <path d="M88 60 C 96 50, 106 50, 112 60 C 106 70, 96 70, 88 60 Z" />
          <path d="M60 88 C 70 96, 70 106, 60 112 C 50 106, 50 96, 60 88 Z" />
          <path d="M32 60 C 24 70, 14 70, 8 60 C 14 50, 24 50, 32 60 Z" />
          {/* Croix centrale */}
          <line x1="60" y1="48" x2="60" y2="72" />
          <line x1="48" y1="60" x2="72" y2="60" />
        </g>
      </svg>
    )
  }

  // kente-border : bande ornementale horizontale (3 motifs géométriques répétés)
  // Pensé pour être placé en pied de card ou en séparateur.
  const width = Math.max(120, size * 3)
  return (
    <svg
      {...commonProps}
      width="100%"
      height={size}
      viewBox={`0 0 ${width} ${size}`}
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="savane-kente" x="0" y="0" width="40" height={size} patternUnits="userSpaceOnUse">
          {/* Bandes verticales alternées (vert / terre / or) */}
          <rect x="0" y="0" width="10" height={size} fill="currentColor" />
          <rect x="10" y="0" width="6" height={size} fill="currentColor" fillOpacity={0.4} />
          <rect x="16" y="0" width="4" height={size} fill="currentColor" fillOpacity={0.7} />
          <rect x="20" y="0" width="12" height={size} fill="currentColor" fillOpacity={0.25} />
          <rect x="32" y="0" width="2" height={size} fill="currentColor" />
          <rect x="34" y="0" width="6" height={size} fill="currentColor" fillOpacity={0.5} />
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height={size} fill="url(#savane-kente)" />
    </svg>
  )
}
