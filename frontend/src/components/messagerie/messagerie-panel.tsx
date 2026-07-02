'use client'

// ─────────────────────────────────────────────────────────────
// MessageriePanel — Panneau principal de la messagerie.
//
// Layout 2 colonnes (style Messenger) :
//  - Sidebar gauche : liste des conversations (IA, classe, promo, équipe, staff, direct)
//  - Zone principale : chat window (messages + input)
//
// Sur mobile (< sm) : une seule colonne, toggle entre liste et chat.
//
// Le panneau est positionné fixed bottom-right, au-dessus de la bulle.
// Il se ferme via le bouton X en haut à droite ou via la touche Escape.
// ─────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import { X, MessageCircle, ShieldAlert } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useConversations, useMessagerieStream } from '@/hooks/use-messagerie'
import { Button } from '@/components/ui/button'
import { ConversationList } from './conversation-list'
import { ChatWindow } from './chat-window'
import { MessagerieSkeleton, MessagerieEmptyState } from './messagerie-skeletons'
import { cn } from '@/lib/utils'

export interface MessageriePanelProps {
  /** Callback pour fermer le panneau (bouton X ou Escape) */
  onClose: () => void
}

/**
 * MessageriePanel — panneau principal de la messagerie.
 *
 * Comportements :
 *  - Ouvre une connexion SSE au montage pour recevoir les nouveaux
 *    messages en temps réel (useMessagerieStream). La connexion est
 *    fermée automatiquement au démontage (cleanup dans le hook).
 *  - Ferme le panneau avec la touche Escape.
 *  - Responsive : sur mobile (< sm), bascule entre liste et chat via
 *    le state selectedConversationId (null = liste, id = chat).
 *  - Header avec motif kente (ds-kente-top) pour l'identité visuelle.
 */
export function MessageriePanel({ onClose }: MessageriePanelProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const { isLoading, isError } = useConversations()

  // Connexion SSE pour le temps réel (invalide les queries au besoin)
  const { isConnected } = useMessagerieStream()

  // ── Fermeture avec Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role="dialog"
      aria-modal="true"
      aria-label="Messagerie SECT"
      className={cn(
        // Position : au-dessus des bulles flottantes (bottom-24 = 96px du bas),
        // alignée à droite (right-4 = 16px) avec l'AIAssistant et la MessagerieBubble.
        'fixed bottom-24 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
        // Taille : 920px de large max sur desktop, plein écran - 2rem sur mobile
        'h-[min(640px,calc(100vh-9rem))] w-[min(920px,calc(100vw-2rem))]'
      )}
    >
      {/* Bande kente supérieure (identité visuelle Savane EdTech) */}
      <div className="ds-kente-strip shrink-0" />

      {/* Header global du panneau */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary-text" />
          <h2 className="text-sm font-semibold text-foreground">Messagerie</h2>
          {/* Indicateur temps réel (SSE connecté) */}
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
              isConnected
                ? 'bg-success/10 text-success-text'
                : 'bg-muted text-muted-foreground'
            )}
            title={isConnected ? 'Connecté en temps réel' : 'Hors ligne'}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isConnected ? 'bg-success animate-pulse' : 'bg-muted-foreground'
              )}
            />
            {isConnected ? 'Live' : 'Hors ligne'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7"
          aria-label="Fermer la messagerie"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Corps du panneau : sidebar + chat (ou erreur / skeleton / empty) */}
      <div className="flex min-h-0 flex-1">
        {isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Messagerie indisponible
              </p>
              <p className="text-xs text-muted-foreground">
                Le service de messagerie est temporairement inaccessible.
                <br />
                Veuillez réessayer dans un instant.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Fermer
            </Button>
          </div>
        ) : isLoading ? (
          <MessagerieSkeleton />
        ) : (
          <>
            {/* Sidebar : liste des conversations (cachée sur mobile si une conv est sélectionnée) */}
            <div
              className={cn(
                'flex w-full flex-col border-r border-border sm:w-72',
                selectedConversationId ? 'hidden sm:flex' : 'flex'
              )}
            >
              <ConversationList
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
            </div>

            {/* Zone principale : chat window (cachée sur mobile si aucune conv sélectionnée) */}
            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col',
                selectedConversationId ? 'flex' : 'hidden sm:flex'
              )}
            >
              {selectedConversationId ? (
                <ChatWindow
                  conversationId={selectedConversationId}
                  onBack={() => setSelectedConversationId(null)}
                />
              ) : (
                <MessagerieEmptyState
                  icon="chat"
                  title="Sélectionnez une conversation"
                  message="Choisissez une conversation dans la liste pour afficher les messages."
                />
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
