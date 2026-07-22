'use client'

// ─────────────────────────────────────────────────────────────
// ConversationList — Liste des conversations (sidebar gauche).
//
// Affiche les conversations groupées par type :
// 1. Section "Assistant IA" (toujours en premier, conv IA privée)
// 2. Section "Salons" (CLASSE, PROMO, EQUIPE, STAFF)
// 3. Section "Messages directs" (DIRECT)
//
// Chaque item affiche : icône, titre, dernier message (tronqué),
// timestamp, badge non-lu.
//
// Si la conversation IA n'existe pas encore, propose un bouton
// "Démarrer une conversation avec l'IA" qui appelle useGetOrCreateIAPrivate.
// ─────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import {
  Sparkles,
  Users,
  GraduationCap,
  School,
  Shield,
  UserCircle,
  MessageCircle,
  MoreVertical,
  Trash2,
  LogOut,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ds'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useConversations,
  useGetOrCreateIAPrivate,
  useLeaveConversation,
} from '@/hooks/use-messagerie'
import { ConversationListSkeleton } from './messagerie-skeletons'
import { useConfirmDialog } from './confirm-dialog'
import type { ConversationType, ConversationWithMeta } from '@/types/messagerie'
import { toast } from 'sonner'

export interface ConversationListProps {
  /** ID de la conversation actuellement sélectionnée (highlight) */
  selectedId: string | null
  /** Callback quand l'utilisateur sélectionne une conversation */
  onSelect: (conversationId: string) => void
}

/** Métadonnées visuelles par type de conversation (icône + couleur). */
const TYPE_META: Record<
  ConversationType,
  { icon: typeof Sparkles; bgClass: string; textClass: string; label: string }
> = {
  IA: {
    icon: Sparkles,
    bgClass: 'bg-gold/15',
    textClass: 'text-gold',
    label: 'Assistant IA',
  },
  CLASSE: {
    icon: School,
    bgClass: 'bg-primary/10',
    textClass: 'text-primary-text',
    label: 'Classe',
  },
  PROMO: {
    icon: GraduationCap,
    bgClass: 'bg-info/15',
    textClass: 'text-info',
    label: 'Promo',
  },
  EQUIPE: {
    icon: Users,
    bgClass: 'bg-secondary/10',
    textClass: 'text-secondary-foreground',
    label: 'Équipe pédagogique',
  },
  STAFF: {
    icon: Shield,
    bgClass: 'bg-warning/10',
    textClass: 'text-warning',
    label: 'Staff',
  },
  DIRECT: {
    icon: UserCircle,
    bgClass: 'bg-muted',
    textClass: 'text-foreground',
    label: 'Message direct',
  },
}

/** Formate un timestamp en label relatif court (HH:mm / Hier / dd/MM). */
function formatRelativeDate(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  if (isToday(date)) return format(date, 'HH:mm', { locale: fr })
  if (isYesterday(date)) return 'Hier'
  return format(date, 'dd/MM', { locale: fr })
}

/** Item individuel d'une conversation dans la liste. */
function ConversationItem({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: ConversationWithMeta
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const meta = TYPE_META[conversation.type]
  const Icon = meta.icon
  const lastMsg = conversation.lastMessage
  const unread = conversation.unreadCount > 0
  const [menuOpen, setMenuOpen] = useState(false)
  const leaveMutation = useLeaveConversation()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const handleLeave = async () => {
    const isDirect = conversation.type === 'DIRECT'
    // Ferme le menu dropdown avant d'ouvrir la modale (évite le chevauchement).
    setMenuOpen(false)
    const ok = await confirm({
      title: isDirect ? 'Supprimer cette conversation ?' : 'Quitter ce salon ?',
      description: isDirect
        ? "Cette conversation sera supprimée de votre liste. L'autre participant la conservera."
        : 'Vous ne recevrez plus les messages de ce salon. Vous pourrez le rejoindre à nouveau via la liste.',
      confirmLabel: isDirect ? 'Supprimer pour moi' : 'Quitter le salon',
      cancelLabel: 'Annuler',
      destructive: true,
    })
    if (!ok) return
    leaveMutation.mutate(conversation.id, {
      onSuccess: () => {
        toast.success(
          isDirect ? 'Conversation supprimée' : 'Salon quitté',
          { description: 'La conversation a été retirée de votre liste.' }
        )
      },
      onError: (err) => {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Impossible de supprimer la conversation.',
        })
      },
    })
  }

  return (
    <div
      className={cn(
        'group relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/20'
          : 'hover:bg-accent/50'
      )}
      onClick={() => onSelect(conversation.id)}
      role="button"
      tabIndex={0}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`${meta.label} ${conversation.titre ?? ''}, ${unread ? `${conversation.unreadCount} non lus` : 'à jour'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(conversation.id)
        }
      }}
    >
      {/* Icône / avatar */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          meta.bgClass
        )}
      >
        <Icon className={cn('h-5 w-5', meta.textClass)} />
      </div>

      {/* Titre + dernier message */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-sm',
              unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
            )}
          >
            {conversation.titre || meta.label}
          </p>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatRelativeDate(lastMsg?.createdAt ?? conversation.updatedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-xs',
              unread ? 'text-foreground/80' : 'text-muted-foreground'
            )}
          >
            {lastMsg ? (
              <>
                {lastMsg.isIA && <Sparkles className="mr-1 inline h-2.5 w-2.5 text-gold" />}
                {lastMsg.contenu}
              </>
            ) : (
              <span className="italic opacity-60">Aucun message</span>
            )}
          </p>
          {/* Badge non-lu */}
          {unread && (
            <span
              className={cn(
                'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                conversation.type === 'IA'
                  ? 'bg-gold text-warning-foreground'
                  : 'bg-primary text-primary-foreground'
              )}
              aria-label={`${conversation.unreadCount} messages non lus`}
            >
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Menu contextuel (supprimer / quitter) */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Actions sur la conversation"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            variant="destructive"
            onClick={handleLeave}
            disabled={leaveMutation.isPending}
          >
            {conversation.type === 'DIRECT' ? (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer pour moi
              </>
            ) : (
              <>
                <LogOut className="h-3.5 w-3.5" />
                Quitter le salon
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modale de confirmation in-app (remplace window.confirm) */}
      {confirmDialog}
    </div>
  )
}

/** Section header avec titre + compteur. */
function SectionHeader({
  title,
  count,
}: {
  title: string
  count?: number
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-muted-foreground/70">{count}</span>
      )}
    </div>
  )
}

/**
 * ConversationList — liste des conversations groupées par type.
 *
 * Récupère les conversations via useConversations() et les groupe :
 *  - "Assistant IA" : conv type=IA (0 ou 1)
 *  - "Salons" : CLASSE, PROMO, EQUIPE, STAFF
 *  - "Messages directs" : DIRECT
 *
 * Si la conv IA n'existe pas encore, affiche un CTA "Démarrer avec l'IA"
 * qui appelle useGetOrCreateIAPrivate (mutation POST /conversations/ia-private).
 */
export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const { data: conversations, isLoading, isError, error } = useConversations()
  const iaMutation = useGetOrCreateIAPrivate()

  if (isLoading) {
    return <ConversationListSkeleton />
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">
          Impossible de charger les conversations
        </p>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : 'Veuillez réessayer plus tard.'}
        </p>
      </div>
    )
  }

  // Groupement par type
  const iaConv = conversations?.find((c) => c.type === 'IA') ?? null
  const salons = conversations?.filter((c) =>
    (['CLASSE', 'PROMO', 'EQUIPE', 'STAFF'] as ConversationType[]).includes(c.type)
  ) ?? []
  const directs = conversations?.filter((c) => c.type === 'DIRECT') ?? []

  const hasAnyConv = !!iaConv || salons.length > 0 || directs.length > 0

  return (
    <div
      className="flex h-full flex-col overflow-y-auto scrollbar-thin"
      role="listbox"
      aria-label="Liste des conversations"
    >
      {/* Section 1 : Assistant IA */}
      <SectionHeader title="Assistant IA" count={iaConv ? 1 : 0} />
      {iaConv ? (
        <ConversationItem
          conversation={iaConv}
          isSelected={selectedId === iaConv.id}
          onSelect={onSelect}
        />
      ) : (
        <div className="px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => iaMutation.mutate()}
            disabled={iaMutation.isPending}
            className="w-full justify-start gap-2 border-gold/30 bg-gold/5 text-gold hover:bg-gold/10 hover:text-gold"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {iaMutation.isPending
              ? 'Création en cours…'
              : 'Démarrer une conversation avec l\'IA'}
          </Button>
        </div>
      )}

      {/* Section 2 : Salons collectifs */}
      {salons.length > 0 && (
        <>
          <SectionHeader title="Salons" count={salons.length} />
          {salons.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              isSelected={selectedId === c.id}
              onSelect={onSelect}
            />
          ))}
        </>
      )}

      {/* Section 3 : Messages directs */}
      {directs.length > 0 && (
        <>
          <SectionHeader title="Messages directs" count={directs.length} />
          {directs.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              isSelected={selectedId === c.id}
              onSelect={onSelect}
            />
          ))}
        </>
      )}

      {/* État vide : aucune conversation */}
      {!hasAnyConv && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Aucune conversation
          </p>
          <p className="text-xs text-muted-foreground">
            Démarrez une discussion avec l'assistant IA ou vos camarades.
          </p>
        </div>
      )}

      {/* Footer : compteur total */}
      {hasAnyConv && (
        <div className="mt-auto border-t border-border px-4 py-2 text-[10px] text-muted-foreground/70">
          {conversations?.length ?? 0} conversation
          {(conversations?.length ?? 0) > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
