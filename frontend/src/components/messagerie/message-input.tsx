'use client'

// ─────────────────────────────────────────────────────────────
// MessageInput — Zone de saisie d'un message.
//
// - Textarea multi-ligne (auto-resize jusqu'à 6 lignes)
// - Bouton envoyer (icône Send, désactivé si vide)
// - Détection @assistant (badge suggéré)
// - Enter pour envoyer, Shift+Enter pour nouvelle ligne
// - Indicateur de citation (reply) au-dessus de l'input
// - Indicateur "typing" optionnel (à brancher au SSE plus tard)
// ─────────────────────────────────────────────────────────────

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Sparkles, Reply, Smile } from 'lucide-react'
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from 'emoji-picker-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ds'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTheme } from 'next-themes'
import type { Message } from '@/types/messagerie'

export interface MessageInputProps {
  /** Callback appelé à l'envoi du message (contenu brut) */
  onSend: (contenu: string) => void
  /** Indique si l'envoi est en cours (mutation pending) */
  isSending?: boolean
  /** Placeholder du champ */
  placeholder?: string
  /** Message auquel on répond (affiché en citation au-dessus de l'input) */
  replyTo?: Message | null
  /** Annule la citation (clear replyTo) */
  onCancelReply?: () => void
  /** Auto-focus au montage (quand on ouvre une conversation) */
  autoFocus?: boolean
  /** Désactive l'input (conversation archivée, lecture seule, etc.) */
  disabled?: boolean
  /** ID pour aria-label (conversation courante) */
  conversationId?: string
  /** Classe additionnelle */
  className?: string
}

/** Hauteur max du textarea avant scroll (6 lignes ≈ 144px). */
const MAX_TEXTAREA_HEIGHT = 144

/**
 * MessageInput — zone de saisie d'un message avec auto-resize,
 * détection @assistant, raccourcis clavier, et indicateur de citation.
 */
export function MessageInput({
  onSend,
  isSending = false,
  placeholder = 'Écrivez votre message…',
  replyTo,
  onCancelReply,
  autoFocus = false,
  disabled = false,
  conversationId,
  className,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { resolvedTheme } = useTheme()

  // Auto-resize : ajuste la hauteur du textarea selon son contenu,
  // jusqu'à MAX_TEXTAREA_HEIGHT (au-delà, scroll interne).
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [])

  // Auto-focus au montage (quand on ouvre une conversation)
  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 80)
      return () => window.clearTimeout(t)
    }
  }, [autoFocus])

  // Resize sur changement de valeur
  useEffect(() => {
    resizeTextarea()
  }, [value, resizeTextarea])

  const hasAssistantMention = /@assistant\b/i.test(value)
  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !isSending && !disabled

  const handleSend = useCallback(() => {
    if (!canSend) return
    onSend(trimmed)
    setValue('')
    // Reset height après envoi
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    })
  }, [canSend, onSend, trimmed])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter = envoyer, Shift+Enter = nouvelle ligne
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      // Escape = annuler la citation si active
      if (e.key === 'Escape' && replyTo && onCancelReply) {
        e.preventDefault()
        onCancelReply()
      }
    },
    [handleSend, replyTo, onCancelReply]
  )

  // Insère "@assistant " au début si pas déjà présent
  const handleAssistantClick = useCallback(() => {
    setValue((prev) => {
      if (/@assistant\b/i.test(prev)) return prev
      return prev ? `@assistant ${prev}` : '@assistant '
    })
    textareaRef.current?.focus()
  }, [])

  // Insère un émoji à la position du curseur dans le textarea (pas juste à la fin).
  // Conserve la sélection + repositionne le curseur après l'émoji inséré.
  const handleEmojiClick = useCallback((emojiData: { emoji: string }) => {
    const el = textareaRef.current
    if (!el) {
      setValue((prev) => prev + emojiData.emoji)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + emojiData.emoji + value.slice(end)
    setValue(next)
    // Repositionne le curseur après l'émoji (après le re-render).
    requestAnimationFrame(() => {
      const pos = start + emojiData.emoji.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }, [value])

  return (
    <div className={cn('border-t border-border bg-card/50 p-2.5', className)}>
      {/* Indicateur de citation (reply) */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary/50 bg-primary/5 px-2.5 py-1.5"
          >
            <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-text" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Réponse à{' '}
                {replyTo.isIA
                  ? 'Assistant IA'
                  : replyTo.user?.name ?? 'Utilisateur'}
              </p>
              <p className="truncate text-xs text-foreground/80">
                {replyTo.contenu}
              </p>
            </div>
            {onCancelReply && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancelReply}
                className="h-5 w-5 shrink-0 p-0"
                aria-label="Annuler la citation"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions rapides (bouton @assistant + hint IA) */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleAssistantClick}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
          aria-label="Mentionner l'assistant IA"
        >
          <Sparkles className="h-2.5 w-2.5" />
          @assistant
        </button>
        {hasAssistantMention && (
          <Badge variant="gold" size="sm">
            L'IA répondra dans ce salon
          </Badge>
        )}
      </div>

      {/* Zone de saisie + boutons émoji & envoyer */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label="Message à envoyer"
          aria-describedby={
            conversationId ? `msg-input-help-${conversationId}` : undefined
          }
          className={cn(
            'flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm',
            'min-h-[38px] max-h-[144px]',
            'placeholder:text-muted-foreground/70',
            'focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'scrollbar-thin'
          )}
        />
        {/* Sélecteur d'émojis (Niveau 1) — insère l'émoji au curseur. */}
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className={cn(
                'h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground',
                'disabled:opacity-40'
              )}
              aria-label="Ouvrir le sélecteur d'émojis"
              title="Émojis"
            >
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-auto border-0 bg-transparent p-0 shadow-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {/* Rendu client-only (le picker utilise window). Thème adapté au mode clair/sombre. */}
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                handleEmojiClick(emojiData)
              }}
              theme={(resolvedTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT) as EmojiTheme}
              emojiStyle={EmojiStyle.NATIVE}
              width={320}
              height={360}
              previewConfig={{ showPreview: false }}
              searchPlaceHolder="Rechercher un émoji…"
              lazyLoadEmojis
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          className={cn(
            'h-9 w-9 shrink-0 rounded-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-40'
          )}
          aria-label="Envoyer le message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint clavier (visible uniquement sur desktop) */}
      <p
        id={conversationId ? `msg-input-help-${conversationId}` : undefined}
        className="mt-1 hidden text-[10px] text-muted-foreground/70 sm:block"
      >
        <kbd className="rounded border border-border bg-muted px-1 font-mono">
          Entrée
        </kbd>{' '}
        pour envoyer ·{' '}
        <kbd className="rounded border border-border bg-muted px-1 font-mono">
          Maj+Entrée
        </kbd>{' '}
        pour une nouvelle ligne
      </p>
    </div>
  )
}
