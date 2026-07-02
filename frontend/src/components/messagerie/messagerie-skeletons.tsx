'use client'

// ─────────────────────────────────────────────────────────────
// Skeletons pour le module Messagerie.
// Utilise PulseSkeleton du Design System (animation CSS pure,
// respecte prefers-reduced-motion).
// ─────────────────────────────────────────────────────────────

import { PulseSkeleton } from '@/components/ds'
import { Sparkles, MessageCircle, Users } from 'lucide-react'

/**
 * Skeleton d'un item de conversation dans la sidebar.
 * Avatar cercle + 2 lignes de texte (titre + dernier message).
 */
function ConversationItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <PulseSkeleton className="h-10 w-10 shrink-0" variant="circle" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <PulseSkeleton className="h-3.5 w-2/3" />
          <PulseSkeleton className="h-3 w-8" />
        </div>
        <PulseSkeleton className="h-3 w-full" />
      </div>
    </div>
  )
}

/**
 * Skeleton de la sidebar (liste des conversations).
 * Header + 5 items factices.
 */
export function ConversationListSkeleton() {
  return (
    <div className="flex w-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <PulseSkeleton className="h-4 w-32" />
      </div>
      {/* Section "Assistant IA" */}
      <div className="px-4 pt-3 pb-1">
        <PulseSkeleton className="h-3 w-20" />
      </div>
      <ConversationItemSkeleton />
      {/* Section "Salons" */}
      <div className="px-4 pt-3 pb-1">
        <PulseSkeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <ConversationItemSkeleton key={i} />
      ))}
      {/* Section "Messages directs" */}
      <div className="px-4 pt-3 pb-1">
        <PulseSkeleton className="h-3 w-28" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <ConversationItemSkeleton key={`dm-${i}`} />
      ))}
    </div>
  )
}

/**
 * Bulle de message factice (côté reçu, à gauche).
 */
function MessageBubbleSkeleton({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <div className={`flex gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {align === 'left' && <PulseSkeleton className="h-8 w-8 shrink-0" variant="circle" />}
      <div className={`max-w-[70%] space-y-2 ${align === 'right' ? 'items-end' : ''}`}>
        {align === 'left' && <PulseSkeleton className="h-3 w-20" />}
        <PulseSkeleton
          className="h-12 w-48 rounded-2xl"
          variant={align === 'right' ? 'default' : 'default'}
        />
        <PulseSkeleton className="h-2.5 w-10" />
      </div>
    </div>
  )
}

/**
 * Skeleton de la fenêtre de chat (zone messages + input).
 */
export function ChatWindowSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <PulseSkeleton className="h-9 w-9" variant="circle" />
        <div className="flex-1 space-y-1.5">
          <PulseSkeleton className="h-3.5 w-32" />
          <PulseSkeleton className="h-2.5 w-20" />
        </div>
        <PulseSkeleton className="h-7 w-7 rounded-md" />
      </div>
      {/* Messages */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
      </div>
      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <PulseSkeleton className="h-9 flex-1" />
        <PulseSkeleton className="h-9 w-9" variant="circle" />
      </div>
    </div>
  )
}

/**
 * Skeleton complet du panneau messagerie (sidebar + chat).
 * Utilisé pendant le chargement initial des conversations.
 */
export function MessagerieSkeleton() {
  return (
    <div className="flex w-full">
      <div className="hidden w-72 shrink-0 border-r border-border sm:flex sm:flex-col">
        <ConversationListSkeleton />
      </div>
      <ChatWindowSkeleton />
    </div>
  )
}

/**
 * État vide (pas de conversation sélectionnée).
 * Affiche un watermark kente subtil + icône + message.
 */
export function MessagerieEmptyState({
  icon = 'chat',
  title = 'Aucune conversation',
  message = 'Vos conversations apparaîtront ici.',
}: {
  icon?: 'chat' | 'ia' | 'users'
  title?: string
  message?: string
}) {
  const Icon = icon === 'ia' ? Sparkles : icon === 'users' ? Users : MessageCircle
  const iconColor =
    icon === 'ia'
      ? 'bg-gold/15 text-gold'
      : icon === 'users'
        ? 'bg-info/15 text-info'
        : 'bg-primary/10 text-primary-text'

  return (
    <div className="ds-kente-watermark relative flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full ${iconColor}`}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
