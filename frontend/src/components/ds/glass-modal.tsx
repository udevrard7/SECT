'use client'

import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GlassModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  /** Taille de la modale */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Afficher le bouton de fermeture (X) — défaut true */
  showCloseButton?: boolean
  /** Fermer au clic sur l'overlay — défaut true */
  closeOnOverlayClick?: boolean
  /** Fermer à la touche Escape — défaut true */
  closeOnEscape?: boolean
  /** Footer (actions) */
  footer?: ReactNode
}

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const

/**
 * GlassModal — Modale avec overlay assombri et animation d'entrée.
 *
 * Design :
 *   - Overlay : bg-black/60 (assombrit le fond, pas de blur pour lisibilité)
 *   - Modale : fond opaque bg-card + border + radius-xl (24px) + shadow-2xl
 *   - Animation : scale + fade à l'entrée (spring), fade à la sortie
 *   - Header sticky avec titre + bouton close
 *   - Body scrollable
 *   - Footer optionnel
 *
 * Note : Le glassmorphism (backdrop-blur + transparence) a été supprimé
 *   pour garantir une lisibilité maximale (WCAG AA). La modale utilise
 *   désormais un fond opaque bg-card.
 *
 * Accessibilité :
 *   - role="dialog" aria-modal="true"
 *   - aria-labelledby pointant vers le titre
 *   - Fermeture Escape (si closeOnEscape)
 *   - Focus trap recommandé (à gérer côté parent via Radix Dialog si besoin)
 *   - Bouton close avec aria-label
 */
export function GlassModal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  footer,
}: GlassModalProps) {
  // Gestion Escape
  if (closeOnEscape && typeof window !== 'undefined') {
    // Handler injecté via onKeyDown sur l'overlay (évite addEventListener global)
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'glass-modal-title' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && closeOnEscape) {
              e.preventDefault()
              onClose()
            }
          }}
        >
          {/* Overlay — assombri pour focus sur la modale (sans blur, lisibilité) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60"
            onClick={closeOnOverlayClick ? onClose : undefined}
          />

          {/* Modale — fond opaque pour lisibilité maximale */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300, duration: 0.25 }}
            className={cn(
              'relative w-full rounded-xl shadow-2xl flex flex-col max-h-[90vh]',
              'bg-card border border-border',
              SIZE_MAP[size]
            )}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-start justify-between gap-4 p-5 pb-3 border-b border-border/50">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2
                      id="glass-modal-title"
                      className="font-display text-lg font-bold tracking-tight"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    aria-label="Fermer"
                    className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="p-5 pt-3 border-t border-border/50 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
