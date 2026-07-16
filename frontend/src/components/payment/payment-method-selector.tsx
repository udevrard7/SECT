'use client'

/**
 * PaymentMethodSelector — sélecteur de moyen de paiement Mobile Money.
 *
 * Affiche 3 cartes cliquables : Wave, Orange Money, MTN Money.
 * Chaque carte montre une icône avec la couleur de la marque (sur l'icône
 * uniquement) et le nom du provider. La carte sélectionnée reçoit une
 * bordure lime (couleur primaire SECT #84CC16) + un fond lime léger.
 *
 * Deux variantes visuelles :
 *   - `dark`  → pour les pages à fond sombre (souscrire-b2c)
 *   - `light` → pour les pages à fond clair (retry, renouvellement)
 *
 * L'animation de sélection utilise Framer Motion + `layoutId` pour un
 * glissement fluide de la surbrillance entre les cartes.
 */

import { motion } from 'framer-motion'
import { Smartphone, Check } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════
// Constantes — mapping valeurs API ↔ infos affichage
// ═══════════════════════════════════════════════════════════════════

export type PaymentMethodValue =
  | 'wave_ci'
  | 'orange_money_ci'
  | 'mtn_money_ci'

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

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    value: 'wave_ci',
    label: 'Wave',
    shortLabel: 'Wave',
    accent: '#1DC8FF',
    description: 'WaveMoney',
  },
  {
    value: 'orange_money_ci',
    label: 'Orange Money',
    shortLabel: 'Orange Money',
    accent: '#FF6600',
    description: 'Orange CI',
  },
  {
    value: 'mtn_money_ci',
    label: 'MTN Money',
    shortLabel: 'MTN Money',
    accent: '#FFCC00',
    description: 'MTN MoMo',
  },
]

/**
 * Retourne le libellé court d'un moyen de paiement à partir de sa valeur
 * API. Utile pour construire dynamiquement le texte du bouton :
 *   `Payer ${amount} FCFA avec ${getPaymentMethodLabel(method)}`
 */
export function getPaymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.shortLabel ?? 'Wave'
}

// ═══════════════════════════════════════════════════════════════════
// Composant
// ═══════════════════════════════════════════════════════════════════

interface PaymentMethodSelectorProps {
  /** Valeur actuellement sélectionnée */
  value: string
  /** Callback appelé avec la nouvelle valeur sélectionnée */
  onChange: (value: PaymentMethodValue) => void
  /** Variante visuelle selon le fond de page */
  variant?: 'dark' | 'light'
  /** layoutId unique pour l'animation Framer Motion (utile si plusieurs
   *  sélecteurs coexistent sur la même page — par défaut un ID stable). */
  layoutId?: string
}

export function PaymentMethodSelector({
  value,
  onChange,
  variant = 'light',
  layoutId = 'payment-method-highlight',
}: PaymentMethodSelectorProps) {
  const isDark = variant === 'dark'

  return (
    <div
      role="radiogroup"
      aria-label="Moyen de paiement"
      className="grid grid-cols-1 sm:grid-cols-3 gap-2"
    >
      {PAYMENT_METHODS.map((method) => {
        const selected = value === method.value
        return (
          <motion.button
            key={method.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(method.value)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={[
              'relative w-full text-left rounded-xl border-2 p-3 transition-colors',
              'flex flex-col sm:items-center sm:text-center gap-2 sm:gap-2.5',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/50 focus-visible:ring-offset-0',
              selected
                ? 'border-lime-500 bg-lime-500/5'
                : isDark
                  ? 'border-white/10 bg-white/[0.03] hover:border-lime-500/40 hover:bg-white/[0.06]'
                  : 'border-slate-200 bg-slate-50 hover:border-lime-500/40 hover:bg-slate-100',
            ].join(' ')}
          >
            {/* Surbrillance animée (layoutId fait glisser entre les cartes) */}
            {selected && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl ring-2 ring-lime-500 pointer-events-none"
                initial={false}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}

            {/* Icône — couleur de marque sur l'icône uniquement */}
            <div className="flex items-center gap-2.5 sm:flex-col sm:gap-2">
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
              <div className="min-w-0 sm:text-center">
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
            </div>

            {/* Check quand sélectionné */}
            {selected && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className={[
                  'absolute top-1.5 right-1.5 h-4 w-4 rounded-full flex items-center justify-center',
                  'bg-lime-500 text-slate-900',
                ].join(' ')}
                aria-hidden="true"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </motion.span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

export default PaymentMethodSelector
