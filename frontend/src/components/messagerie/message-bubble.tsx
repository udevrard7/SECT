'use client'

// ─────────────────────────────────────────────────────────────
// MessageBubble — Bulle de message individuelle.
//
// Affiche un message :
// - À droite si c'est moi (bg-primary, texte clair)
// - À gauche si c'est quelqu'un d'autre (bg-muted)
// - Style spécial pour l'IA (gradient gold/primary + icône Sparkles + markdown)
// - Avatar + nom si pas moi
// - Timestamp en petit
// - Indicateur "édité" si editedAt
// - Menu contextuel : répondre, éditer (si auteur), supprimer, signaler
// ─────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import {
  Sparkles,
  MoreVertical,
  Reply,
  Pencil,
  Trash2,
  Flag,
  ShieldAlert,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useState, useCallback, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ds'
import { MarkdownRenderer } from '@/components/exam-prep/markdown-renderer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { Message, SignalementRaison } from '@/types/messagerie'

export interface MessageBubbleProps {
  /** Le message à afficher */
  message: Message
  /** ID de l'utilisateur courant (pour déterminer si le message est à moi) */
  currentUserId: string
  /** Callback pour répondre au message */
  onReply?: (message: Message) => void
  /** Callback pour éditer le message (uniquement si l'utilisateur est l'auteur) */
  onEdit?: (message: Message) => void
  /** Callback pour supprimer le message */
  onDelete?: (message: Message) => void
  /** Callback pour signaler le message */
  onSignal?: (message: Message, raison: SignalementRaison) => void
  /** Index pour le stagger d'animation (ms) */
  index?: number
}

/** Formate un timestamp en horaire lisible (HH:mm) ou date relative. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  if (isToday(date)) return format(date, 'HH:mm', { locale: fr })
  if (isYesterday(date)) return `Hier, ${format(date, 'HH:mm', { locale: fr })}`
  return format(date, 'dd/MM/yyyy, HH:mm', { locale: fr })
}

/** Initiales d'un nom (max 2 caractères) pour l'avatar fallback. */
function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * MessageBubble — bulle de message avec style conditionnel (moi / autre / IA).
 *
 * Variants visuels :
 *  - "me"   : bg-primary text-primary-foreground, aligné à droite, coins arrondis br-sm
 *  - "ia"   : gradient gold→primary, icône Sparkles, contenu markdown, bordure gold
 *  - "other": bg-muted, aligné à gauche, avatar + nom, coins arrondis bl-sm
 *  - "deleted" : bg-muted/50 italic "Message supprimé" (soft-delete backend)
 *
 * Accessibilité :
 *  - role="article" sur la bulle
 *  - aria-label contient l'auteur + l'heure
 *  - Menu contextuel accessible via DropdownMenu (Radix)
 */
export function MessageBubble({
  message,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onSignal,
  index = 0,
}: MessageBubbleProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const isMe = !message.isIA && message.userId === currentUserId
  const isIA = message.isIA
  const isDeleted = !!message.deletedAt
  const isEdited = !!message.editedAt && !isDeleted
  const authorName = message.user?.name ?? (isIA ? 'Assistant IA' : 'Utilisateur')

  const handleReply = useCallback(() => {
    onReply?.(message)
    setIsMenuOpen(false)
  }, [onReply, message])

  const handleEdit = useCallback(() => {
    onEdit?.(message)
    setIsMenuOpen(false)
  }, [onEdit, message])

  const handleDelete = useCallback(() => {
    onDelete?.(message)
    setIsMenuOpen(false)
  }, [onDelete, message])

  const handleSignal = useCallback(
    (raison: SignalementRaison) => {
      onSignal?.(message, raison)
      setIsMenuOpen(false)
    },
    [onSignal, message]
  )

  // Bloque le menu contextuel natif pour ouvrir le DropdownMenu Radix.
  const handleContextMenu = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (isDeleted) return
    e.preventDefault()
    setIsMenuOpen(true)
  }, [isDeleted])

  // ── Message supprimé (soft-delete) ──
  if (isDeleted) {
    return (
      <div
        className={cn(
          'flex w-full gap-2',
          isMe ? 'justify-end' : 'justify-start'
        )}
      >
        {!isMe && (
          <Avatar className="h-8 w-8 shrink-0 opacity-50">
            <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
              {isIA ? <Sparkles className="h-3.5 w-3.5" /> : getInitials(authorName)}
            </AvatarFallback>
          </Avatar>
        )}
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-3.5 py-2 text-xs italic text-muted-foreground',
            isMe
              ? 'rounded-br-sm bg-primary/10'
              : 'rounded-bl-sm bg-muted/50'
          )}
        >
          Message supprimé
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        'group relative flex w-full gap-2',
        isMe ? 'justify-end' : 'justify-start'
      )}
      onContextMenu={handleContextMenu}
      role="article"
      aria-label={`Message de ${authorName} à ${formatTimestamp(message.createdAt)}`}
    >
      {/* Avatar (uniquement pour les messages reçus, pas les miens) */}
      {!isMe && (
        <Avatar className="h-8 w-8 shrink-0 self-end">
          <AvatarFallback
            className={cn(
              'text-[10px] font-medium',
              isIA
                ? 'bg-gold/20 text-gold'
                : 'bg-info/15 text-info-foreground'
            )}
          >
            {isIA ? <Sparkles className="h-3.5 w-3.5" /> : getInitials(authorName)}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          'flex max-w-[75%] flex-col gap-1',
          isMe ? 'items-end' : 'items-start'
        )}
      >
        {/* En-tête : auteur + badge IA + timestamp */}
        {!isMe && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs font-medium text-foreground">
              {authorName}
            </span>
            {isIA && (
              <Badge variant="gold" size="sm">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                IA
              </Badge>
            )}
          </div>
        )}

        {/* Citation du message auquel on répond */}
        {message.replyTo && (
          <div
            className={cn(
              'max-w-full rounded-md border-l-2 px-2 py-1 text-xs text-muted-foreground',
              isIA
                ? 'border-gold bg-gold/5'
                : 'border-primary/40 bg-primary/5'
            )}
          >
            <span className="font-medium text-foreground">
              {message.replyTo.isIA ? 'Assistant IA' : 'Réponse à'}
              {' : '}
            </span>
            <span className="line-clamp-2">
              {message.replyTo.contenu}
            </span>
          </div>
        )}

        {/* Bulle du message */}
        <div
          className={cn(
            'relative rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
            isMe && 'rounded-br-sm bg-primary text-primary-foreground',
            isIA &&
              'rounded-bl-sm border border-gold/30 bg-gradient-to-br from-gold/10 via-primary/5 to-primary/10 text-foreground',
            !isMe && !isIA && 'rounded-bl-sm bg-muted text-foreground'
          )}
        >
          {/* Contenu : markdown pour l'IA, texte brut sinon */}
          {isIA ? (
            <MarkdownRenderer
              content={message.contenuHtml || message.contenu}
              className="text-sm"
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.contenu}</p>
          )}

          {/* Menu contextuel (icône ⋮ au hover) */}
          {!isDeleted && (
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'absolute -top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100',
                    'focus-visible:opacity-100',
                    isMe ? '-left-6' : '-right-6'
                  )}
                  aria-label="Actions sur le message"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isMe ? 'end' : 'start'} sideOffset={4}>
                {onReply && (
                  <DropdownMenuItem onClick={handleReply}>
                    <Reply className="h-3.5 w-3.5" />
                    Répondre
                  </DropdownMenuItem>
                )}
                {isMe && onEdit && (
                  <DropdownMenuItem onClick={handleEdit}>
                    <Pencil className="h-3.5 w-3.5" />
                    Éditer
                  </DropdownMenuItem>
                )}
                {isMe && onDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </DropdownMenuItem>
                )}
                {!isMe && onSignal && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleSignal('HARCELEMENT')}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Harcèlement
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleSignal('SPAM')}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      Spam
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleSignal('CONTENU_INAPPROPRIE')}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      Contenu inapproprié
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleSignal('AUTRE')}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      Autre
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Timestamp + indicateur "édité" */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground',
            isMe && 'flex-row-reverse'
          )}
        >
          <time dateTime={message.createdAt}>
            {formatTimestamp(message.createdAt)}
          </time>
          {isEdited && (
            <span className="italic opacity-70">(édité)</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
