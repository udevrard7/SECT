'use client'

// ─────────────────────────────────────────────────────────────
// ParticipantsList — Panneau latéral affichant les participants
// d'une conversation avec badges "en ligne" + bouton DM (message privé).
//
// Utilise :
//   - useParticipants(conversationId) — liste enrichie (name, email, role)
//   - usePresence() — Set des userIDs en ligne (polling 10s)
//   - useCreateDirect() — démarre une conversation DM avec un participant
//
// Accessibilité :
//   - role="list" sur la liste
//   - aria-label "en ligne"/"hors ligne" sur les badges
//   - Boutons DM avec aria-label descriptif
// ─────────────────────────────────────────────────────────────

import { Users, MessageSquare, X } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useParticipants, usePresence, useCreateDirect } from '@/hooks/use-messagerie'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface ParticipantsListProps {
  conversationId: string
  currentUserId: string
  /** Callback appelé après la création d'un DM (pour naviguer vers la conversation). */
  onStartDirect?: (conversationId: string) => void
  /** Bouton fermer (pour le mode mobile/overlay). */
  onClose?: () => void
}

/** Couleur d'avatar selon le rôle (cohérent avec chat-window.tsx). */
function roleAvatarClass(role: string): string {
  switch (role) {
    case 'ETUDIANT':
      return 'bg-primary/10 text-primary'
    case 'ENSEIGNANT':
      return 'bg-secondary/10 text-secondary-foreground'
    case 'RESPONSABLE':
      return 'bg-gold/15 text-gold'
    case 'ADMIN':
      return 'bg-tech/15 text-tech'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** Initiales à partir d'un nom (max 2 caractères). */
function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function ParticipantsList({
  conversationId,
  currentUserId,
  onStartDirect,
  onClose,
}: ParticipantsListProps) {
  const { data: participants, isLoading } = useParticipants(conversationId)
  const { onlineSet } = usePresence()
  const createDirect = useCreateDirect()

  const handleStartDM = async (targetUserId: string, targetName: string) => {
    if (targetUserId === currentUserId) {
      toast.info('Vous ne pouvez pas vous envoyer un message à vous-même.')
      return
    }
    try {
      const conv = await createDirect.mutateAsync({ targetUserId })
      toast.success('Conversation privée ouverte', {
        description: `Vous pouvez maintenant échanger avec ${targetName}.`,
      })
      onStartDirect?.(conv.id)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de créer la conversation.',
      })
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-text" />
          <h3 className="text-sm font-semibold text-foreground">
            Participants
            {participants && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({participants.length})
              </span>
            )}
          </h3>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7"
            aria-label="Fermer la liste des participants"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* ── Liste des participants ── */}
      <div
        className="flex-1 overflow-y-auto p-2"
        role="list"
        aria-label="Liste des participants"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">Chargement…</p>
          </div>
        ) : !participants || participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              Aucun participant pour le moment.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {participants.map((p) => {
              const isOnline = onlineSet.has(p.userId)
              const isMe = p.userId === currentUserId
              const name = p.user?.name || 'Utilisateur'
              const role = p.user?.role || ''

              return (
                <li key={p.id} role="listitem">
                  <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors">
                    {/* Avatar + badge online */}
                    <div className="relative shrink-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback
                          className={cn(
                            'text-[10px] font-semibold',
                            roleAvatarClass(role)
                          )}
                        >
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Badge "en ligne" */}
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                          isOnline ? 'bg-success' : 'bg-muted-foreground/40'
                        )}
                        aria-label={isOnline ? 'En ligne' : 'Hors ligne'}
                        title={isOnline ? 'En ligne' : 'Hors ligne'}
                      />
                    </div>

                    {/* Nom + rôle */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {name}
                        {isMe && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (vous)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {isOnline ? (
                          <span className="text-success-text">En ligne</span>
                        ) : (
                          'Hors ligne'
                        )}
                        {role && ` · ${role.toLowerCase()}`}
                      </p>
                    </div>

                    {/* Bouton DM (sauf pour soi-même) */}
                    {!isMe && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartDM(p.userId, name)}
                        disabled={createDirect.isPending}
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Envoyer un message privé à ${name}`}
                        title={`Message privé à ${name}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
