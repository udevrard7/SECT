'use client'

// ─────────────────────────────────────────────────────────────
// ChatWindow — Zone de chat principale (header + messages + input).
//
// Affiche :
//  - Header : titre conversation + bouton retour (mobile) + bouton mute
//  - Messages : scroll vertical, infinite scroll vers le haut pour
//    charger l'historique (cursor pagination)
//  - Input : zone de saisie + bouton envoyer
//
// Hooks utilisés :
//  - useFlattenedMessages(conversationId) — messages + pagination
//  - useSendMessage(conversationId) — envoi (optimistic)
//  - useMarkAsRead() — marque lu à l'ouverture
//  - useSetMuted() — mute/unmute
//  - useConversations() — pour récupérer titre + type + muted
//
// Accessibilité :
//  - role="log" aria-live="polite" sur la zone des messages
//  - Auto-scroll vers le dernier message (avec préservation du scroll
//    lors du chargement de l'historique)
//  - Focus auto sur l'input à l'ouverture
// ─────────────────────────────────────────────────────────────

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type UIEvent,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Sparkles,
  Users,
  GraduationCap,
  School,
  Shield,
  UserCircle,
  AlertCircle,
  Loader2,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import {
  useConversations,
  useFlattenedMessages,
  useSendMessage,
  useMarkAsRead,
  useSetMuted,
  useEditMessage,
  useDeleteMessage,
  useSignalMessage,
} from '@/hooks/use-messagerie'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { ParticipantsList } from './participants-list'
import { ChatWindowSkeleton, MessagerieEmptyState } from './messagerie-skeletons'
import type {
  ConversationType,
  Message,
  SignalementRaison,
} from '@/types/messagerie'

export interface ChatWindowProps {
  /** ID de la conversation à afficher */
  conversationId: string
  /** Callback pour revenir à la liste (mobile uniquement) */
  onBack?: () => void
  /** Callback appelé après la création d'un DM depuis la liste des participants. */
  onStartDirect?: (conversationId: string) => void
}

/** Métadonnées visuelles par type de conversation. */
const TYPE_HEADER_META: Record<
  ConversationType,
  { icon: typeof Sparkles; bgClass: string; textClass: string }
> = {
  IA: { icon: Sparkles, bgClass: 'bg-gold/15', textClass: 'text-gold' },
  CLASSE: { icon: School, bgClass: 'bg-primary/10', textClass: 'text-primary-text' },
  PROMO: { icon: GraduationCap, bgClass: 'bg-info/15', textClass: 'text-info' },
  EQUIPE: { icon: Users, bgClass: 'bg-secondary/10', textClass: 'text-secondary-foreground' },
  STAFF: { icon: Shield, bgClass: 'bg-warning/10', textClass: 'text-warning' },
  DIRECT: { icon: UserCircle, bgClass: 'bg-muted', textClass: 'text-foreground' },
}

/**
 * ChatWindow — fenêtre de chat principale.
 *
 * Comportements :
 *  - Au montage/démarrage : marque la conversation comme lue jusqu'au
 *    dernier message (si unreadCount > 0).
 *  - Auto-scroll vers le bas à l'arrivée de nouveaux messages, SAUF si
 *    l'utilisateur a scrollé vers le haut pour lire l'historique.
 *  - Infinite scroll : quand scrollTop ≤ threshold, charge la page
 *    précédente (fetchNextPage). Préserve la position de scroll après
 *    le chargement (calcule l'offset de hauteur ajoutée).
 *  - Envoi : appelle useSendMessage.mutate(contenu). L'optimistic update
 *    est géré dans le hook.
 *  - Réponse à un message : state local replyTo, passé à MessageInput.
 */
export function ChatWindow({ conversationId, onBack, onStartDirect }: ChatWindowProps) {
  const user = useAuthStore((s) => s.user)
  const currentUserId = user?.id ?? ''
  const [showParticipants, setShowParticipants] = useState(false)

  const { data: conversations } = useConversations()
  const conversation = conversations?.find((c) => c.id === conversationId)

  const {
    messages,
    hasMore,
    isFetchingNextPage,
    fetchNextPage,
    isLoading,
    isError,
    error,
  } = useFlattenedMessages(conversationId)

  const sendMessage = useSendMessage(conversationId)
  const markAsRead = useMarkAsRead()
  const setMuted = useSetMuted()
  const editMessage = useEditMessage(conversationId)
  const deleteMessage = useDeleteMessage(conversationId)
  const signalMessage = useSignalMessage()

  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isAtBottomRef = useRef<boolean>(true)
  const hasMarkedReadRef = useRef<boolean>(false)

  const convType: ConversationType = conversation?.type ?? 'DIRECT'
  const headerMeta = TYPE_HEADER_META[convType]
  const HeaderIcon = headerMeta.icon
  const isMuted = false // TODO: brancher sur participant.muted quand useParticipants retournera muted
  const isIAConv = convType === 'IA'

  // ── Mark-as-read à l'ouverture (une seule fois par conversation) ──
  useEffect(() => {
    if (hasMarkedReadRef.current) return
    if (!conversation || conversation.unreadCount === 0) {
      hasMarkedReadRef.current = true
      return
    }
    const lastMsg = conversation.lastMessage
    const lastReadAt = lastMsg?.createdAt ?? new Date().toISOString()
    markAsRead.mutate({ conversationId, lastReadAt })
    hasMarkedReadRef.current = true
  }, [conversation, conversationId, markAsRead])

  // ── Reset du flag mark-as-read quand on change de conversation ──
  useEffect(() => {
    hasMarkedReadRef.current = false
  }, [conversationId])

  // ── Auto-scroll vers le bas si l'utilisateur est "en bas" ──
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom('auto')
    }
  }, [messages, scrollToBottom])

  // ── Détection de la position de scroll pour l'infinite scroll ──
  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      isAtBottomRef.current = isBottom

      // Infinite scroll : si on est près du haut, charger la page précédente
      if (el.scrollTop < 60 && hasMore && !isFetchingNextPage) {
        prevScrollHeightRef.current = el.scrollHeight
        void fetchNextPage()
      }
    },
    [hasMore, isFetchingNextPage, fetchNextPage]
  )

  // ── Après chargement de l'historique : préserver la position de scroll ──
  useEffect(() => {
    if (!isFetchingNextPage && prevScrollHeightRef.current > 0) {
      const el = scrollRef.current
      if (el) {
        const newScrollHeight = el.scrollHeight
        const diff = newScrollHeight - prevScrollHeightRef.current
        el.scrollTop = el.scrollTop + diff
        prevScrollHeightRef.current = 0
      }
    }
  }, [isFetchingNextPage])

  // ── Scroll initial au bas après le premier chargement ──
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      isAtBottomRef.current = true
      scrollToBottom('auto')
    }
  }, [messages.length, isLoading, scrollToBottom])

  // ── Handlers ──
  const handleSend = useCallback(
    (contenu: string) => {
      sendMessage.mutate({
        contenu,
        replyToId: replyTo?.id ?? null,
      })
      setReplyTo(null)
    },
    [sendMessage, replyTo]
  )

  const handleReply = useCallback((msg: Message) => {
    setReplyTo(msg)
    setEditingMessage(null)
  }, [])

  const handleEdit = useCallback((msg: Message) => {
    setEditingMessage(msg)
    setReplyTo(null)
  }, [])

  const handleEditSubmit = useCallback(
    (contenu: string) => {
      if (!editingMessage) return
      editMessage.mutate({
        messageId: editingMessage.id,
        contenu,
      })
      setEditingMessage(null)
    },
    [editingMessage, editMessage]
  )

  const handleDelete = useCallback(
    (msg: Message) => {
      // Confirmation simple via window.confirm (suffisant pour MVP)
      if (typeof window !== 'undefined') {
        const ok = window.confirm(
          'Supprimer ce message ? Cette action est définitive (soft-delete côté serveur).'
        )
        if (!ok) return
      }
      deleteMessage.mutate(msg.id)
    },
    [deleteMessage]
  )

  const handleSignal = useCallback(
    (msg: Message, raison: SignalementRaison) => {
      signalMessage.mutate({
        messageId: msg.id,
        input: { raison },
      })
    },
    [signalMessage]
  )

  const handleToggleMute = useCallback(() => {
    setMuted.mutate({ conversationId, muted: !isMuted })
  }, [setMuted, conversationId, isMuted])

  // ── États de chargement / erreur ──
  if (isLoading) {
    return <ChatWindowSkeleton />
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Erreur lors du chargement des messages
          </p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Veuillez réessayer plus tard.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Zone chat (header + messages + input) ── */}
      <div className="flex min-w-0 flex-1 flex-col min-h-0">
      {/* ── Header : retour (mobile) + avatar + titre + mute + participants ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-3 py-2.5 sm:px-4">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-8 w-8 shrink-0 sm:hidden"
            aria-label="Retour à la liste des conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className={cn(headerMeta.bgClass, headerMeta.textClass)}>
            <HeaderIcon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {conversation?.titre || headerMeta.icon.name}
            </h2>
            {isIAConv && (
              <Badge variant="gold" size="sm">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                IA
              </Badge>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {conversation
              ? `${conversation.participantsCount} participant${conversation.participantsCount > 1 ? 's' : ''}`
              : 'Chargement…'}
          </p>
        </div>
        {/* Bouton participants (visible uniquement sur les salons collectifs, pas sur l'IA privée) */}
        {!isIAConv && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowParticipants((v) => !v)}
            className={cn('h-8 w-8 shrink-0', showParticipants && 'bg-accent')}
            aria-label="Afficher les participants"
            aria-pressed={showParticipants}
          >
            <Users className="h-4 w-4" />
          </Button>
        )}
        {/* Bouton mute (visible uniquement sur les salons/Direct, pas sur l'IA privée) */}
        {!isIAConv && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleMute}
            disabled={setMuted.isPending}
            className="h-8 w-8 shrink-0"
            aria-label={isMuted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
            aria-pressed={isMuted}
          >
            {isMuted ? (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* ── Zone messages : scrollable + infinite scroll ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
        role="log"
        aria-live="polite"
        aria-label="Messages de la conversation"
        aria-busy={isFetchingNextPage}
      >
        <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
          {/* Bouton "charger plus" en haut (infinite scroll) */}
          <div className="flex justify-center">
            {hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="h-7 gap-1 text-xs text-muted-foreground"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Chargement…
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Charger les messages précédents
                  </>
                )}
              </Button>
            ) : messages.length > 0 ? (
              <p className="text-[10px] text-muted-foreground/60">
                Début de la conversation
              </p>
            ) : null}
          </div>

          {/* Liste des messages (du plus ancien au plus récent) */}
          {messages.length === 0 ? (
            <MessagerieEmptyState
              icon={isIAConv ? 'ia' : 'chat'}
              title={
                isIAConv
                  ? 'Démarrez votre conversation avec l\'IA'
                  : 'Aucun message'
              }
              message={
                isIAConv
                  ? 'Posez une question pédagogique pour commencer.'
                  : 'Soyez le premier à envoyer un message.'
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={currentUserId}
                  currentUserRole={user?.role}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSignal={handleSignal}
                  index={i}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Indicateur "IA rédige…" (à brancher au SSE typing plus tard) */}
          {sendMessage.isPending && isIAConv && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm border border-gold/30 bg-gold/5 px-3 py-2"
              aria-label="L'IA rédige une réponse"
            >
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <div className="flex items-center gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-gold/70"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.1,
                      repeat: Infinity,
                      delay: i * 0.18,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Zone de saisie ── */}
      <MessageInput
        onSend={editingMessage ? handleEditSubmit : handleSend}
        isSending={sendMessage.isPending || editMessage.isPending}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        autoFocus
        conversationId={conversationId}
        placeholder={
          editingMessage
            ? 'Éditez votre message…'
            : isIAConv
              ? 'Posez votre question à l\'IA…'
              : 'Écrivez votre message…'
        }
      />

      {/* Hint édition (petit bandeau si on est en mode édition) */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-warning/30 bg-warning/5 px-3 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium text-warning-foreground">
                Édition du message
              </p>
              <button
                type="button"
                onClick={() => setEditingMessage(null)}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Annuler
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>{/* ── Fin zone chat (header + messages + input) ── */}

      {/* ── Panneau participants (right sidebar, desktop uniquement) ── */}
      {showParticipants && !isIAConv && (
        <div className="hidden w-56 shrink-0 border-l border-border sm:flex sm:flex-col">
          <ParticipantsList
            conversationId={conversationId}
            currentUserId={currentUserId}
            onStartDirect={(convId) => {
              setShowParticipants(false)
              onStartDirect?.(convId)
            }}
            onClose={() => setShowParticipants(false)}
          />
        </div>
      )}
    </div>
  )
}
