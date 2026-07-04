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
  CheckSquare,
  Trash2,
  X,
  Eraser,
} from 'lucide-react'
import { toast } from 'sonner'
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
  useHideMessages,
  useClearConversation,
} from '@/hooks/use-messagerie'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { ParticipantsList } from './participants-list'
import { ChatWindowSkeleton, MessagerieEmptyState } from './messagerie-skeletons'
import { useConfirmDialog } from './confirm-dialog'
import { useStreamingContent } from '@/stores/streaming-store'
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())
  // Modale de confirmation in-app (remplace les window.confirm natifs qui
  // ouvraient une fenêtre système extérieure à l'app).
  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const { data: conversations } = useConversations()
  const conversation = conversations?.find((c) => c.id === conversationId)

  // MESSAGERIE-STREAMING : contenu IA partiel en cours de génération (salon
  // collectif avec @assistant). Affiché comme une bulle IA temporaire qui se
  // remplit en temps réel. Remplacé par le message persisté quand il arrive.
  const streamingContent = useStreamingContent(conversationId)

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
  const hideMessages = useHideMessages(conversationId)
  const clearConversation = useClearConversation(conversationId)

  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isAtBottomRef = useRef<boolean>(true)
  // BUGFIX (MESSAGERIE-BADGE-UNREAD-2) : l'ancien code utilisait un booléen
  // global `hasMarkedReadRef` reset par un effet séparé dépendant de
  // [conversationId]. Au changement de conversation, l'effet mark-as-read
  // s'exécutait AVANT l'effet de reset (ordre de déclaration des effets React)
  // → voyait le ref à true (de la conv précédente) → ne marquait jamais la
  // nouvelle conversation comme lue → le badge "non lus" restait affiché.
  // Fix : tracker par (conversationId, lastMessageId) au lieu d'un booléen.
  // Le ref ne matchera plus la nouvelle conversation → le mark-as-read se
  // déclenche correctement. Bonus : si un nouveau message arrive pendant que
  // la conv est ouverte, lastMessageId change → on re-marque comme lu (le
  // badge ne remonte pas).
  const markedConvIdRef = useRef<string | null>(null)
  const markedMsgIdRef = useRef<string | null>(null)

  const convType: ConversationType = conversation?.type ?? 'DIRECT'
  const headerMeta = TYPE_HEADER_META[convType]
  const HeaderIcon = headerMeta.icon
  const isMuted = false // TODO: brancher sur participant.muted quand useParticipants retournera muted
  const isIAConv = convType === 'IA'

  // ── Mark-as-read à l'ouverture + sur nouveaux messages ──
  // Se déclenche quand :
  //  - on ouvre une conversation avec unreadCount > 0
  //  - un nouveau message arrive dans la conversation ouverte (lastMessage.id
  //    change via polling/SSE) → on re-marque pour que le badge ne remonte pas.
  // Ne se déclenche PAS si :
  //  - conversation encore en chargement (undefined) → on attend
  //  - déjà marqué pour cette conv + ce lastMessage → évite les appels en boucle
  //  - unreadCount === 0 → on note juste les refs sans appel API
  useEffect(() => {
    if (!conversation) return
    const lastMsgId = conversation.lastMessage?.id ?? null
    if (
      markedConvIdRef.current === conversationId &&
      markedMsgIdRef.current === lastMsgId
    ) {
      return
    }
    if (conversation.unreadCount === 0) {
      markedConvIdRef.current = conversationId
      markedMsgIdRef.current = lastMsgId
      return
    }
    const lastMsg = conversation.lastMessage
    const lastReadAt = lastMsg?.createdAt ?? new Date().toISOString()
    markAsRead.mutate({ conversationId, lastReadAt })
    markedConvIdRef.current = conversationId
    markedMsgIdRef.current = lastMsgId
  }, [conversation, conversationId, markAsRead])

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
    async (msg: Message) => {
      // Modale in-app (remplace window.confirm natif navigateur).
      const ok = await confirm({
        title: 'Supprimer ce message ?',
        description:
          msg.userId === currentUserId
            ? 'Cette action est définitive : le message sera masqué (soft-delete) pour tous les participants.'
            : 'En tant que modérateur, vous allez masquer ce message (soft-delete) pour tous les participants.',
        confirmLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        destructive: true,
      })
      if (!ok) return
      deleteMessage.mutate(msg.id)
    },
    [confirm, deleteMessage, currentUserId]
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

  // ── Sélection multiple + suppression "pour moi" ──
  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v)
    setSelectedMsgIds(new Set())
  }, [])

  const toggleSelectMessage = useCallback((msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) {
        next.delete(msgId)
      } else {
        next.add(msgId)
      }
      return next
    })
  }, [])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedMsgIds.size === 0) return
    const count = selectedMsgIds.size
    // Modale in-app (remplace confirm natif).
    const ok = await confirm({
      title: `Masquer ${count} message(s) ?`,
      description:
        'Ces messages seront masqués pour vous uniquement. Les autres participants les verront toujours.',
      confirmLabel: 'Masquer pour moi',
      cancelLabel: 'Annuler',
      destructive: true,
    })
    if (!ok) return
    hideMessages.mutate(Array.from(selectedMsgIds), {
      onSuccess: () => {
        toast.success('Messages masqués', {
          description: `${count} message(s) masqué(s) pour vous.`,
        })
        setSelectedMsgIds(new Set())
        setSelectMode(false)
      },
      onError: (err) => {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Impossible de masquer les messages.',
        })
      },
    })
  }, [confirm, selectedMsgIds, hideMessages])

  const handleClearConversation = useCallback(async () => {
    // Modale in-app (remplace confirm natif).
    const ok = await confirm({
      title: 'Vider toute la conversation ?',
      description:
        'Tous les messages seront masqués pour vous uniquement. Les autres participants les verront toujours.',
      confirmLabel: 'Vider pour moi',
      cancelLabel: 'Annuler',
      destructive: true,
    })
    if (!ok) return
    clearConversation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success('Conversation vidée', {
          description: `${data.hiddenCount} message(s) masqué(s) pour vous.`,
        })
      },
      onError: (err) => {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Impossible de vider la conversation.',
        })
      },
    })
  }, [confirm, clearConversation])

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
        {/* Bouton sélection multiple (masquer plusieurs messages pour moi) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSelectMode}
          className={cn('h-8 w-8 shrink-0', selectMode && 'bg-accent')}
          aria-label="Sélectionner des messages"
          aria-pressed={selectMode}
          title="Sélectionner des messages à masquer"
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
        {/* Bouton vider conversation (tout masquer pour moi) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClearConversation}
          disabled={clearConversation.isPending || messages.length === 0}
          className="h-8 w-8 shrink-0"
          aria-label="Vider la conversation pour moi"
          title="Vider la conversation pour moi"
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Barre d'action sélection multiple (visible si selectMode) ── */}
      {selectMode && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-3 py-1.5">
          <span className="text-xs font-medium text-foreground">
            {selectedMsgIds.size > 0
              ? `${selectedMsgIds.size} message(s) sélectionné(s)`
              : 'Sélectionnez les messages à masquer'}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={selectedMsgIds.size === 0 || hideMessages.isPending}
              className="h-7 text-xs"
            >
              <Trash2 className="h-3 w-3" />
              Masquer ({selectedMsgIds.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleSelectMode}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3" />
              Annuler
            </Button>
          </div>
        </div>
      )}

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
                <div key={msg.id} className="flex items-start gap-2">
                  {selectMode && !msg.deletedAt && (
                    <button
                      type="button"
                      onClick={() => toggleSelectMessage(msg.id)}
                      className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        selectedMsgIds.has(msg.id)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/50'
                      )}
                      aria-label={selectedMsgIds.has(msg.id) ? 'Désélectionner' : 'Sélectionner ce message'}
                      aria-pressed={selectedMsgIds.has(msg.id)}
                    >
                      {selectedMsgIds.has(msg.id) && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <MessageBubble
                      message={msg}
                      currentUserId={currentUserId}
                      currentUserRole={user?.role}
                      onReply={selectMode ? undefined : handleReply}
                      onEdit={selectMode ? undefined : handleEdit}
                      onDelete={selectMode ? undefined : handleDelete}
                      onSignal={selectMode ? undefined : handleSignal}
                      index={i}
                    />
                  </div>
                </div>
              ))}
            </AnimatePresence>
          )}

          {/* MESSAGERIE-STREAMING : bulle IA temporaire qui se remplit en temps réel.
              Affichée quand @assistant génère une réponse en salon collectif.
              Remplacée par le message persisté quand l'event message_new arrive. */}
          {streamingContent && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 self-start max-w-[85%] sm:max-w-[75%]"
              aria-label="L'assistant IA rédige une réponse"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 border border-gold/30">
                <Sparkles className="h-4 w-4 text-gold" />
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-gold/30 bg-gold/5 px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-semibold text-gold">Assistant IA</span>
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-gold/70"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {streamingContent}
                  {/* Curseur clignotant pour indiquer que la réponse continue */}
                  <span className="inline-block w-1.5 h-3.5 bg-gold/70 ml-0.5 align-text-bottom animate-pulse" />
                </p>
              </div>
            </motion.div>
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

      {/* Modale de confirmation in-app (remplace les window.confirm natifs) */}
      {confirmDialog}
    </div>
  )
}
