'use client'

// ─────────────────────────────────────────────────────────────
// MessagerieBubble — Bulle flottante (style Messenger).
//
// Bouton flottant fixe en bas à droite qui ouvre/ferme le panneau
// de messagerie. Affiche un badge non-lu si des messages non lus
// sont présents dans n'importe quelle conversation.
//
// Position : `bottom-4 right-4` — unique bulle flottante de l'application
// (l'Assistant IA flottant a été retiré, l'IA est désormais accessible
// uniquement via les conversations IA de la messagerie).
// Le panneau s'ouvre au-dessus (bottom-24) aligné à droite (right-4).
// ─────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useConversations } from '@/hooks/use-messagerie'
import { MessageriePanel } from './messagerie-panel'

/**
 * MessagerieBubble — bulle flottante + panneau de messagerie.
 *
 * Affiche un bouton circulaire en bas à droite (dégradé vert lime →
 * terre cuite) avec :
 *  - Icône MessageCircle (état fermé) ou X (état ouvert) avec rotation
 *  - Badge non-lu (nombre de messages non lus, max 99+)
 *  - Anneau pulse subtil quand fermé + non-lu > 0 (attire l'attention)
 *
 * Au clic, ouvre le MessageriePanel au-dessus de la bulle.
 * Ferme aussi le panneau avec la touche Escape (géré dans le panel).
 *
 * Accessibilité :
 *  - aria-label dynamique selon l'état (ouvrir / fermer)
 *  - aria-expanded reflète l'état ouvert
 *  - Le panneau a role="dialog" aria-modal="true"
 */
export function MessagerieBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: conversations } = useConversations()

  const totalUnread =
    conversations?.reduce((sum, c) => sum + (c.unreadCount || 0), 0) ?? 0

  const toggleOpen = useCallback(() => {
    setIsOpen((v) => !v)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Ferme le panneau avec Escape (en plus du handler interne du panel)
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  return (
    <>
      {/* ── Bulle flottante ── */}
      <motion.button
        type="button"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 280, delay: 0.2 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        aria-label={isOpen ? 'Fermer la messagerie' : 'Ouvrir la messagerie'}
        aria-expanded={isOpen}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-xl shadow-primary/30 transition-shadow hover:shadow-2xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Badge non-lu (visible uniquement quand le panneau est fermé) */}
        <AnimatePresence>
          {totalUnread > 0 && !isOpen && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 320 }}
              className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground tabular-nums ring-2 ring-card"
              aria-label={`${totalUnread > 99 ? '99 plus' : totalUnread} messages non lus`}
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Anneau pulse subtil pour attirer l'attention quand non-lu > 0 */}
        {totalUnread > 0 && !isOpen && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-primary"
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Icône avec rotation (MessageCircle ↔ X) */}
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MessageCircle className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Panneau de messagerie (s'ouvre au-dessus de la bulle) ── */}
      <AnimatePresence>
        {isOpen && <MessageriePanel onClose={close} />}
      </AnimatePresence>
    </>
  )
}
