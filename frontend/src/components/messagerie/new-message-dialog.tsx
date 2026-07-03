'use client'

// ─────────────────────────────────────────────────────────────
// NewMessageDialog — Dialog pour démarrer une nouvelle conversation
// privée (DM) avec un utilisateur de l'établissement.
//
// Fonctionnement :
//   1. L'utilisateur tape un nom/email dans le champ de recherche.
//   2. La recherche est debouncée (300ms) via TanStack Query.
//   3. Les résultats (limités à 10) sont affichés avec avatar + nom + rôle.
//   4. Au clic sur un user, useCreateDirect crée la conversation DM et
//      le dialog se ferme. Le callback onStartDirect permet de naviguer
//      vers la nouvelle conversation.
//
// Règles de DM (gérées côté backend par CreateDirect usecase) :
//   - ETUDIANT : ne peut DM que ses enseignants (CanStudentDMEnseignant).
//   - ENSEIGNANT/RESPONSABLE : peut DM tout user de son établissement.
//   - ADMIN : peut DM tout user.
//
// Le backend renverra une erreur 403 si le DM n'est pas autorisé → toast.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useCreateDirect } from '@/hooks/use-messagerie'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface NewMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Callback appelé après la création du DM (pour naviguer vers la conversation). */
  onStartDirect?: (conversationId: string) => void
}

/** User léger retourné par /api/users?search=... */
interface SearchUser {
  id: string
  name: string
  email: string
  role: string
  actif: boolean
}

/** Couleur d'avatar selon le rôle. */
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

function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function NewMessageDialog({
  open,
  onOpenChange,
  onStartDirect,
}: NewMessageDialogProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const user = useAuthStore((s) => s.user)
  const createDirect = useCreateDirect()

  // Debounce 300ms sur la recherche.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Recherche d'utilisateurs via TanStack Query (évite les setState
  // synchrones dans useEffect → pas de cascading renders).
  const { data: results, isFetching } = useQuery<SearchUser[]>({
    queryKey: ['new-message-search', debouncedSearch, user?.etablissementId],
    queryFn: async () => {
      if (!debouncedSearch || !user?.etablissementId) return []
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: '1',
        limit: '10',
        etablissementId: user.etablissementId,
      })
      const res = await fetch(`/api/users?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erreur recherche')
      const data = await res.json()
      // Filtrer : exclure soi-même et les comptes inactifs.
      return (data.users ?? []).filter(
        (u: SearchUser) => u.id !== user.id && u.actif !== false
      )
    },
    enabled: open && !!debouncedSearch && !!user?.etablissementId,
    staleTime: 30 * 1000,
  })

  // Wrapper onOpenChange : reset la recherche à la fermeture (évite les
  // setState synchrones dans useEffect → pas de cascading renders).
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSearch('')
        setDebouncedSearch('')
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  const handleSelectUser = useCallback(
    async (targetUser: SearchUser) => {
      try {
        const conv = await createDirect.mutateAsync({
          targetUserId: targetUser.id,
        })
        toast.success('Conversation privée ouverte', {
          description: `Vous pouvez maintenant échanger avec ${targetUser.name}.`,
        })
        onOpenChange(false)
        onStartDirect?.(conv.id)
      } catch (err) {
        toast.error('Impossible de créer la conversation', {
          description:
            err instanceof Error
              ? err.message
              : 'Une erreur est survenue. Vérifiez que vous êtes autorisé à contacter cet utilisateur.',
          duration: 6000,
        })
      }
    },
    [createDirect, onOpenChange, onStartDirect]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary-text" />
            Nouveau message privé
          </DialogTitle>
        </DialogHeader>

        {/* Champ de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            autoFocus
            className="w-full rounded-lg border border-border bg-background pl-9 pr-9 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Résultats */}
        <div className="max-h-72 overflow-y-auto">
          {isFetching ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">Recherche…</p>
            </div>
          ) : !debouncedSearch ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                Tapez un nom ou un email pour rechercher un utilisateur de votre
                établissement.
              </p>
            </div>
          ) : !results || results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">
                Aucun utilisateur trouvé pour « {debouncedSearch} ».
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => handleSelectUser(u)}
                    disabled={createDirect.isPending}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          'text-[10px] font-semibold',
                          roleAvatarClass(u.role)
                        )}
                      >
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {u.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {u.email} · {u.role.toLowerCase()}
                      </p>
                    </div>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Note sur les règles DM */}
        {user?.role === 'ETUDIANT' && (
          <p className="text-[10px] text-muted-foreground/80 italic">
            Vous pouvez envoyer un message privé à vos enseignants ou aux autres
            étudiants de votre établissement.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
