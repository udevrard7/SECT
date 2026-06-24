'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Sparkles, Send, X, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AIAssistantMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AIAssistantProps {
  /**
   * Callback appelé à l'envoi d'un message utilisateur.
   * Doit retourner la réponse de l'IA (string).
   * Peut rejeter — l'erreur est affichée dans le chat.
   */
  onSend: (message: string) => Promise<string>
  /** Prompts rapides (chips cliquables) — optionnel */
  suggestions?: string[]
  /** Titre du panneau (défaut : "Assistant pédagogique") */
  title?: string
  /** Messages initiaux (optionnel — message de bienvenue) */
  initialMessages?: AIAssistantMessage[]
  /** Placeholder du champ de saisie */
  placeholder?: string
  /** Désactiver la saisie pendant qu'une réponse est en cours */
  disabledWhileTyping?: boolean
  /** Classe additionnelle sur le conteneur */
  className?: string
}

const PANEL_WIDTH_DESKTOP = 350
const PANEL_HEIGHT_DESKTOP = 500

const MESSAGE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 24, stiffness: 280 },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
}

const DOT_VARIANTS: Variants = {
  blink: (i: number) => ({
    opacity: [0.3, 1, 0.3],
    transition: {
      duration: 1.1,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: i * 0.18,
    },
  }),
}

/**
 * AIAssistant — Widget flottant d'assistance pédagogique IA.
 *
 * Affiche un bouton flottant (bottom-right) qui ouvre un panneau de chat
 * glassmorphism avec :
 *   - Header (titre + bouton fermer) en accent `bg-tech` (cyan = tech)
 *   - Zone messages scrollable (user à droite, assistant à gauche)
 *   - Chips de suggestions cliquables
 *   - Champ de saisie + bouton envoyer
 *   - Indicateur de saisie "…" (3 points animés)
 *
 * Design :
 *   - Bouton : `ds-glass` + Sparkles (Lucide) + pulse quand fermé
 *   - Panneau : `ds-glass` + `rounded-xl`, 350×500 (desktop),
 *     pleine largeur - 2rem (mobile)
 *   - Messages user : `bg-primary text-primary-foreground` (droite)
 *   - Messages assistant : `bg-muted` (gauche)
 *   - Animations Framer Motion : spring panneau, slide-in messages
 *
 * Accessibilité :
 *   - role="dialog" aria-modal="true" aria-label
 *   - Focus trap quand ouvert (Tab/Shift+Tab reste dans le panneau)
 *   - Escape pour fermer
 *   - Enter pour envoyer (Shift+Enter = nouvelle ligne)
 *   - aria-live="polite" sur la zone de messages
 *
 * Performance :
 *   - Auto-scroll vers le dernier message (ref + scrollIntoView)
 *   - Respecte prefers-reduced-motion (CSS global)
 *   - Pas de re-render global : seuls les messages se ré-animent
 *
 * Usage typique : ajout sur les pages de cours, exercices, dashboard étudiant.
 */
export function AIAssistant({
  onSend,
  suggestions = [],
  title = 'Assistant pédagogique',
  initialMessages = [],
  placeholder = 'Posez votre question…',
  disabledWhileTyping = true,
  className,
}: AIAssistantProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AIAssistantMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  /** Auto-scroll vers le dernier message. */
  useEffect(() => {
    if (!open) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping, open])

  /** Focus initial + focus trap quand le panneau s'ouvre. */
  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    // Focus sur le champ de saisie après l'animation
    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open])

  /** Restaure le focus à la fermeture. */
  useEffect(() => {
    if (open) return
    lastFocusedRef.current?.focus?.()
    lastFocusedRef.current = null
  }, [open])

  /** Focus trap : Tab/Shift+Tab reste dans le panneau. */
  const handlePanelKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      const visible = Array.from(focusables).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      )
      if (visible.length === 0) return
      const first = visible[0]
      const last = visible[visible.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    []
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isTyping) return
      const userMsg: AIAssistantMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsTyping(true)
      try {
        const reply = await onSend(trimmed)
        const aiMsg: AIAssistantMessage = {
          role: 'assistant',
          content: reply,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
      } catch (err) {
        const aiMsg: AIAssistantMessage = {
          role: 'assistant',
          content:
            "Désolé, une erreur est survenue. Pouvez-vous reformuler votre question ?",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
        console.error('[AIAssistant] onSend error:', err)
      } finally {
        setIsTyping(false)
      }
    },
    [isTyping, onSend]
  )

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void sendMessage(input)
      }
    },
    [input, sendMessage]
  )

  const handleSuggestionClick = useCallback(
    (s: string) => {
      void sendMessage(s)
    },
    [sendMessage]
  )

  const inputDisabled = isTyping && disabledWhileTyping

  const suggestionsNode: ReactNode = useMemo(() => {
    if (suggestions.length === 0 || messages.length > 0) return null
    return (
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSuggestionClick(s)}
            disabled={isTyping}
            className="text-xs px-2.5 py-1 rounded-full border border-border bg-background/60 hover:bg-tech/10 hover:border-tech/40 hover:text-tech transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {s}
          </button>
        ))}
      </div>
    )
  }, [suggestions, messages.length, isTyping, handleSuggestionClick])

  return (
    <div className={cn('pointer-events-none', className)}>
      {/* ── Panneau de chat ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={handlePanelKeyDown}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            style={{
              width: `min(${PANEL_WIDTH_DESKTOP}px, calc(100vw - 2rem))`,
              height: `min(${PANEL_HEIGHT_DESKTOP}px, calc(100vh - 8rem))`,
            }}
            className={cn(
              'pointer-events-auto fixed bottom-20 right-4 z-50',
              'flex flex-col ds-glass rounded-xl shadow-2xl overflow-hidden',
              'border border-border/40'
            )}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border/40 bg-tech/10">
              <div className="h-8 w-8 rounded-md bg-tech/15 flex items-center justify-center text-tech">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-sm leading-tight truncate">
                  {title}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  IA pédagogique
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer l'assistant"
                className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Zone messages */}
            <div
              className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5"
              aria-live="polite"
              aria-label="Conversation"
            >
              {messages.length === 0 && !isTyping ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-4">
                  <div className="h-10 w-10 rounded-full bg-tech/10 flex items-center justify-center text-tech">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Bonjour 👋
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Posez-moi une question sur votre cours, un exercice ou une
                    notion difficile.
                  </p>
                </div>
              ) : null}

              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={`${m.timestamp.getTime()}-${i}`}
                    variants={MESSAGE_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className={cn(
                      'max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'self-end bg-primary text-primary-foreground rounded-br-sm'
                        : 'self-start bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p
                      className={cn(
                        'mt-1 text-[9px] uppercase tracking-wider opacity-60',
                        m.role === 'user' ? 'text-right' : 'text-left'
                      )}
                    >
                      {m.timestamp.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Indicateur de saisie */}
              <AnimatePresence>
                {isTyping ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="self-start bg-muted px-3 py-2.5 rounded-lg rounded-bl-sm flex items-center gap-1"
                    aria-label="L'assistant rédige une réponse"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        custom={i}
                        variants={DOT_VARIANTS}
                        animate="blink"
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70"
                      />
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions chips */}
            {suggestionsNode}

            {/* Zone de saisie */}
            <div className="shrink-0 border-t border-border/40 p-2.5 flex items-end gap-2 bg-background/40">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={placeholder}
                disabled={inputDisabled}
                rows={1}
                aria-label="Message à envoyer"
                className={cn(
                  'flex-1 resize-none max-h-28 min-h-[36px] px-3 py-2 text-sm rounded-md',
                  'bg-background/80 border border-border',
                  'placeholder:text-muted-foreground/70',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tech/50 focus-visible:border-tech/40',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'scrollbar-thin'
                )}
              />
              <button
                type="button"
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || inputDisabled}
                aria-label="Envoyer le message"
                className={cn(
                  'shrink-0 h-9 w-9 rounded-md flex items-center justify-center transition-colors',
                  'bg-tech text-tech-foreground hover:bg-tech/90',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bouton flottant ── */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fermer l\'assistant pédagogique' : 'Ouvrir l\'assistant pédagogique'}
        aria-expanded={open}
        initial={false}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'pointer-events-auto fixed bottom-4 right-4 z-50',
          'h-14 w-14 rounded-full flex items-center justify-center',
          'ds-glass border border-tech/30',
          'bg-tech text-tech-foreground shadow-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="sparkles"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Sparkles className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Pulse ring quand fermé */}
        {!open ? (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-tech"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : null}
      </motion.button>
    </div>
  )
}
