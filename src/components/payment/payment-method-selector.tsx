'use client'

/**
 * PaymentMethodSelector — indicateur de moyen de paiement Wave.
 *
 * Affiche une unique carte non-cliquable indiquant que le paiement passe par
 * Wave. Le composant conserve la même API (value/onChange) pour ne pas casser
 * les pages appelantes, mais seule la valeur "wave_ci" est possible.
 *
 * Deux variantes visuelles :
 *   - `dark`  → pour les pages à fond sombre (souscrire-b2c)
 *   - `light` → pour les pages à fond clair (retry, renouvellement)
 */

import { Smartphone } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════
// Constantes — mapping valeurs API ↔ infos affichage
// ═══════════════════════════════════════════════════════════════════

export type PaymentMethodValue = 'wave_ci'

export interface PaymentMethodInfo {
  /** Valeur envoyée à l'API (champ `paymentMethod` du body) */
  value: PaymentMethodValue
  /** Nom affiché sur la carte */
  label: string
  /** Nom court utilisé dans le texte du bouton "Payer X FCFA avec …" */
  shortLabel: string
  /** Couleur d'accent (hex) appliquée UNIQUEMENT à l'icône */
  accent: string
  /** Petite description affichée sous le label */
  description: string
}

/** Unique moyen de paiement disponible. */
export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    value: 'wave_ci',
    label: 'Wave',
    shortLabel: 'Wave',
    accent: '#1DC8FF',
    description: 'WaveMoney',
  },
]

/**
 * Retourne le libellé court d'un moyen de paiement à partir de sa valeur
 * API. Par défaut retourne "Wave".
 */
export function getPaymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.shortLabel ?? 'Wave'
}

// ═══════════════════════════════════════════════════════════════════
// Composant
// ═══════════════════════════════════════════════════════════════════

interface PaymentMethodSelectorProps {
  /** Valeur actuellement sélectionnée (toujours 'wave_ci') */
  value: string
  /** Callback appelé avec 'wave_ci' (inchangé, pour compatibilité) */
  onChange: (value: PaymentMethodValue) => void
  /** Variante visuelle selon le fond de page */
  variant?: 'dark' | 'light'
  /** layoutId unique (conservé pour compatibilité, non utilisé) */
  layoutId?: string
}

export function PaymentMethodSelector({
  variant = 'light',
}: PaymentMethodSelectorProps) {
  const isDark = variant === 'dark'
  const method = PAYMENT_METHODS[0]

  return (
    <div className="w-full">
      <div
        className={[
          'relative w-full rounded-xl border-2 p-3',
          'flex items-center gap-3',
          'border-lime-500 bg-lime-500/5',
          isDark
            ? 'border-lime-500/60 bg-lime-500/[0.07]'
            : 'border-lime-500 bg-lime-50',
        ].join(' ')}
      >
        {/* Icône */}
        <div
          className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${method.accent}1A` }}
          aria-hidden="true"
        >
          <Smartphone
            className="h-5 w-5"
            style={{ color: method.accent }}
          />
        </div>

        <div className="min-w-0">
          <div
            className={[
              'text-sm font-semibold leading-tight',
              isDark ? 'text-white' : 'text-slate-900',
            ].join(' ')}
          >
            {method.label}
          </div>
          <div
            className={[
              'text-[10px] leading-tight mt-0.5',
              isDark ? 'text-white/50' : 'text-slate-500',
            ].join(' ')}
          >
            {method.description}
          </div>
        </div>

        {/* Badge "unique" */}
        <span
          className={[
            'ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full',
            isDark
              ? 'bg-lime-500/20 text-lime-300'
              : 'bg-lime-100 text-lime-700',
          ].join(' ')}
        >
          Paiement instantané
        </span>
      </div>
    </div>
  )
}

export default PaymentMethodSelector