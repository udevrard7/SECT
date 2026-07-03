// ─────────────────────────────────────────────────────────────
// Types partagés pour le module Messagerie (chat temps réel + IA hybride).
// Miroir des types Go définis dans backend/internal/domain/messagerie.go.
// ─────────────────────────────────────────────────────────────

/** Type de salon de discussion */
export type ConversationType = 'IA' | 'CLASSE' | 'PROMO' | 'EQUIPE' | 'STAFF' | 'DIRECT'

/** Type de pièce jointe */
export type MessageAttachmentType = 'IMAGE' | 'FILE' | 'AUDIO'

/** Raison de signalement */
export type SignalementRaison = 'HARCELEMENT' | 'SPAM' | 'CONTENU_INAPPROPRIE' | 'AUTRE'

/** Statut de traitement d'un signalement */
export type SignalementStatut = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'REJETE'

// ─── Entités ───

export interface Conversation {
  id: string
  type: ConversationType
  titre?: string | null
  etablissementId?: string | null
  filiereId?: string | null
  niveau?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface ConversationParticipant {
  id: string
  conversationId: string
  userId: string
  lastReadAt?: string | null
  muted: boolean
  joinedAt: string
  leftAt?: string | null
  user?: MessageUserRef | null
}

export interface MessageUserRef {
  id: string
  name: string
  email: string
  role: string
}

export interface MessageRef {
  id: string
  contenu: string
  isIA: boolean
}

export interface MessageAttachment {
  id: string
  messageId: string
  type: MessageAttachmentType
  url: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  userId?: string | null
  isIA: boolean
  contenu: string
  contenuHtml?: string | null
  replyToId?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  createdAt: string
  user?: MessageUserRef | null
  replyTo?: MessageRef | null
  attachments?: MessageAttachment[]
}

export interface MessageSignalement {
  id: string
  messageId: string
  userId: string
  raison: SignalementRaison
  commentaire?: string | null
  statut: SignalementStatut
  resolvedAt?: string | null
  resolvedBy?: string | null
  createdAt: string
}

// ─── DTOs (réponses API) ───

export interface ConversationWithMeta extends Conversation {
  lastMessage?: Message | null
  unreadCount: number
  participantsCount: number
}

export interface ConversationListResult {
  conversations: ConversationWithMeta[]
  total: number
}

export interface MessageListResult {
  messages: Message[]
  nextCursor?: string | null
  hasMore: boolean
}

// ─── Inputs (payloads mutations) ───

export interface SendMessageInput {
  contenu: string
  replyToId?: string | null
  isIA?: boolean
}

export interface CreateDirectInput {
  targetUserId: string
  titre?: string | null
}

export interface SignalMessageInput {
  raison: SignalementRaison
  commentaire?: string | null
}

export interface MarkAsReadInput {
  lastReadAt: string
}

export interface SetMutedInput {
  muted: boolean
}

// ─── SSE events (reçus via EventSource /api/messagerie/stream) ───

export type MessagerieEventType = 'message_new' | 'message_edit' | 'message_delete' | 'typing' | 'read'

export interface MessagerieSSEEvent {
  type: MessagerieEventType
  data: Message | { conversationId: string; userId: string; isTyping: boolean } | { conversationId: string; userId: string }
}

// ─── Presence (système "en ligne") ───

export interface PresenceResult {
  online: string[]
  count: number
}
