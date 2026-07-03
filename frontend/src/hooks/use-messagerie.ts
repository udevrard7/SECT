// ─────────────────────────────────────────────────────────────
// Hooks TanStack Query pour le module Messagerie (chat temps réel + IA hybride).
// Cache + dedup + retry automatique + invalidation + optimistic updates.
// Pattern aligné sur src/hooks/use-resultats.ts et use-correction.ts.
//
// Le backend Go expose 15 endpoints REST + 1 stream SSE sous /api/messagerie.
// Voir worklog Task 6 (backend) pour le détail des routes et du hub SSE.
//
// Le stream SSE (useMessagerieStream) invalide les queries pertinentes quand
// un event arrive, pour garder le cache à jour sans polling. EventSource se
// reconnecte automatiquement (pas de retry manuel).
// ─────────────────────────────────────────────────────────────

'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useStreamingStore } from '@/stores/streaming-store'
import type {
  Conversation,
  ConversationListResult,
  ConversationParticipant,
  ConversationWithMeta,
  CreateDirectInput,
  Message,
  MessageListResult,
  MessageSignalement,
  PresenceResult,
  SendMessageInput,
  SignalMessageInput,
} from '@/types/messagerie'

// ─── Clés de cache ───

export const messagerieKeys = {
  all: ['messagerie'] as const,
  conversations: () => [...messagerieKeys.all, 'conversations'] as const,
  messages: (conversationId: string) =>
    [...messagerieKeys.all, 'messages', conversationId] as const,
  participants: (conversationId: string) =>
    [...messagerieKeys.all, 'participants', conversationId] as const,
  presence: () => [...messagerieKeys.all, 'presence'] as const,
}

// ─── Fetch helper ───
// credentials: 'include' pour envoyer le cookie httpOnly (JWT refresh).
// En pratique les appels passent par le rewrite Vercel (same-origin), donc
// le cookie est envoyé même sans cette option, mais on reste explicite.

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Erreur ${res.status}`)
  }
  // Pour les réponses vides (204 No Content ou DELETE), res.json() échouerait.
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

// ─── 1. useConversations ───

/**
 * Liste des conversations de l'utilisateur courant (avec lastMessage,
 * unreadCount, participantsCount). staleTime 30s car le SSE invalide
 * automatiquement en cas de nouveau message.
 */
export function useConversations() {
  return useQuery<ConversationWithMeta[]>({
    queryKey: messagerieKeys.conversations(),
    queryFn: () =>
      fetchJSON<ConversationListResult>('/api/messagerie/conversations').then(
        (d) => d.conversations
      ),
    staleTime: 30 * 1000, // 30s
    // BUGFIX (MESSAGERIE-SSE-RENDER) : le SSE est bufferisé par le proxy
    // Render free tier (le handler envoie l'event hello mais le proxy
    // Cloudflare/Render ne flush pas → 'Hors ligne' permanent côté client).
    // Fallback : polling toutes les 15s pour rafraîchir lastMessage + unreadCount.
    // Le SSE reste tenté (useMessagerieStream) au cas où le backend est fixé.
    refetchInterval: 15 * 1000, // 15s
    refetchOnWindowFocus: true,
  })
}

// ─── 2. useMessages (infinite scroll avec cursor) ───

/**
 * Liste des messages d'une conversation avec pagination infinie (cursor DESC).
 * La première page contient les messages les plus récents ; getNextPageParam
 * retourne le curseur vers les messages plus anciens.
 *
 * Pour l'affichage, utiliser useFlattenedMessages qui inverse l'ordre pour
 * obtenir du plus ancien → plus récent (ordre ASC).
 */
export function useMessages(conversationId: string | null | undefined) {
  return useInfiniteQuery<
    MessageListResult,
    Error,
    InfiniteData<MessageListResult>,
    readonly unknown[],
    string | null
  >({
    queryKey: messagerieKeys.messages(conversationId ?? 'none'),
    queryFn: ({ pageParam }) => {
      const url = new URL(
        `/api/messagerie/conversations/${conversationId}/messages`,
        window.location.origin
      )
      if (pageParam) url.searchParams.set('cursor', pageParam)
      url.searchParams.set('limit', '30')
      return fetchJSON<MessageListResult>(url.toString())
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!conversationId,
    staleTime: 60 * 1000, // 1 min — le SSE invalide en cas de nouveau message
    // BUGFIX (MESSAGERIE-SSE-RENDER) : polling fallback (8s) car le SSE est
    // bufferisé par le proxy Render free tier. Le polling rafraîchit les
    // messages de la conversation ouverte pour simuler le temps réel.
    refetchInterval: !!conversationId ? 8 * 1000 : false, // 8s si conversation ouverte
  })
}

/**
 * Helper : aplatit toutes les pages de useMessages et inverse l'ordre
 * (les messages backend sont DESC, on veut ASC pour l'affichage).
 *
 * Retourne également hasMore et fetchNextPage pour le bouton "charger plus"
 * en haut de la conversation.
 */
export function useFlattenedMessages(conversationId: string | null | undefined) {
  const query = useMessages(conversationId)
  const messages: Message[] = []
  if (query.data) {
    for (const page of query.data.pages) {
      for (const msg of page.messages) {
        messages.push(msg)
      }
    }
  }
  // Les pages sont triées DESC (plus récent d'abord). On inverse pour
  // obtenir du plus ancien → plus récent (ordre d'affichage naturel).
  messages.reverse()
  return {
    messages,
    hasMore: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

// ─── 3. useSendMessage (optimistic update) ───

/**
 * Envoi d'un message dans une conversation, avec optimistic update :
 * le message est ajouté immédiatement à la liste (en première position
 * car les pages sont DESC), puis remplacé par la vraie réponse serveur.
 *
 * En cas d'erreur (réseau, validation, etc.), on rollback vers l'état
 * précédent via le context retourné par onMutate.
 *
 * Invalide aussi la liste des conversations (pour rafraîchir lastMessage).
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      fetchJSON<Message>(
        `/api/messagerie/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
      const previous = queryClient.getQueryData<
        InfiniteData<MessageListResult>
      >(messagerieKeys.messages(conversationId))
      // Optimistic message (temporaire, sera remplacé par la vraie réponse).
      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId,
        userId: 'me', // sera corrigé par la réponse
        isIA: false,
        contenu: input.contenu,
        createdAt: new Date().toISOString(),
        replyToId: input.replyToId ?? null,
      }
      queryClient.setQueryData<InfiniteData<MessageListResult>>(
        messagerieKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0
                ? { ...page, messages: [optimisticMsg, ...page.messages] }
                : page
            ),
          }
        }
      )
      return { previous }
    },
    onError: (_err, _input, context) => {
      // Rollback vers l'état précédent.
      if (context?.previous) {
        queryClient.setQueryData(
          messagerieKeys.messages(conversationId),
          context.previous
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      }) // refresh lastMessage
    },
  })
}

// ─── 4. useMarkAsRead ───

/**
 * Marque une conversation comme lue jusqu'à lastReadAt. Invalide la liste
 * des conversations pour rafraîchir unreadCount.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      lastReadAt,
    }: {
      conversationId: string
      lastReadAt: string
    }) =>
      fetchJSON<void>(
        `/api/messagerie/conversations/${conversationId}/lu`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadAt }),
        }
      ),
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      }) // refresh unreadCount
      // Invalide aussi les messages pour rafraîchir les flags "lu" si besoin.
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
    },
  })
}

// ─── 5. useCreateDirect ───

/**
 * Crée (ou récupère si elle existe déjà) une conversation DM entre l'utilisateur
 * courant et targetUserId. Invalide la liste des conversations.
 */
export function useCreateDirect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDirectInput) =>
      fetchJSON<Conversation>('/api/messagerie/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      })
    },
  })
}

// ─── 6. useGetOrCreateIAPrivate ───

/**
 * Récupère (ou crée) la conversation IA privée de l'utilisateur courant.
 * Une seule par utilisateur (contrainte UK côté backend). Invalide la liste
 * des conversations.
 */
export function useGetOrCreateIAPrivate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchJSON<Conversation>('/api/messagerie/conversations/ia-private', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      })
    },
  })
}

// ─── 7. useEditMessage ───

/**
 * Édite le contenu d'un message (POST → PATCH /api/messagerie/messages/{id}).
 * Invalide les messages de la conversation (pour rafraîchir editedAt + contenu).
 */
export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      contenu,
    }: {
      messageId: string
      contenu: string
    }) =>
      fetchJSON<Message>(`/api/messagerie/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
    },
  })
}

// ─── 8. useDeleteMessage ───

/**
 * Soft-delete d'un message (DELETE /api/messagerie/messages/{id}).
 * Le backend fait un soft-delete (deletedAt), le message reste visible avec
 * un marqueur "supprimé". Invalide les messages de la conversation.
 */
export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) =>
      fetchJSON<void>(`/api/messagerie/messages/${messageId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
    },
  })
}

// ─── 8a. useLeaveConversation (supprimer conversation pour moi) ───

/**
 * Quitte/supprime une conversation pour l'utilisateur courant
 * (DELETE /api/messagerie/conversations/{id}). La conversation disparaît de
 * la liste. Pour un DM, équivaut à "supprimer". Pour un salon collectif,
 * équivaut à "quitter le salon" (re-créable via EnsureAutoConversations).
 * Invalide la liste des conversations.
 */
export function useLeaveConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      fetchJSON<void>(`/api/messagerie/conversations/${conversationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      })
    },
  })
}

// ─── 8b. useClearConversation (vider conversation pour moi) ───

/**
 * Masque TOUS les messages d'une conversation pour l'utilisateur courant
 * (POST /api/messagerie/conversations/{id}/clear). Per-user : les autres
 * participants voient toujours les messages. Invalide les messages.
 */
export function useClearConversation(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchJSON<{ hiddenCount: number }>(
        `/api/messagerie/conversations/${conversationId}/clear`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
    },
  })
}

// ─── 8c. useHideMessages (sélection multiple + masquer pour moi) ───

/**
 * Masque une liste de messages pour l'utilisateur courant
 * (POST /api/messagerie/messages/hide). Per-user : les autres voient toujours
 * les messages. Invalide les messages de la conversation concernée.
 */
export function useHideMessages(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageIds: string[]) =>
      fetchJSON<{ count: number }>(`/api/messagerie/messages/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.messages(conversationId),
      })
    },
  })
}

// ─── 9. useSignalMessage ───

/**
 * Signale un message (HARCELEMENT, SPAM, CONTENU_INAPPROPRIE, AUTRE).
 * Pas d'invalidation : le signalement est traité async par les responsables.
 */
export function useSignalMessage() {
  return useMutation({
    mutationFn: ({
      messageId,
      input,
    }: {
      messageId: string
      input: SignalMessageInput
    }) =>
      fetchJSON<MessageSignalement>(
        `/api/messagerie/messages/${messageId}/signaler`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      ),
  })
}

// ─── 9b. useListSignalements (modération RESPONSABLE/ADMIN) ───

/**
 * Liste les signalements de messages (réservé RESPONSABLE/ADMIN).
 * Filtre optionnel par statut (OUVERT, EN_COURS, RESOLU, REJETE).
 * Polling 30s pour suivre les nouveaux signalements en temps quasi réel.
 */
export function useListSignalements(statut?: import('@/types/messagerie').SignalementStatut | null) {
  return useQuery<MessageSignalement[]>({
    queryKey: [...messagerieKeys.all, 'signalements', statut ?? 'all'],
    queryFn: () => {
      const url = new URL('/api/messagerie/signalements', window.location.origin)
      if (statut) url.searchParams.set('statut', statut)
      return fetchJSON<{ signalements: MessageSignalement[] }>(url.toString()).then(
        (d) => d.signalements
      )
    },
    refetchInterval: 30 * 1000, // 30s
    staleTime: 20 * 1000,
  })
}

// ─── 9c. useResolveSignalement (modération RESPONSABLE/ADMIN) ───

/**
 * Marque un signalement comme résolu ou rejeté (PATCH /api/messagerie/signalements/{id}).
 * Invalide la liste des signalements après action.
 */
export function useResolveSignalement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      signalementId,
      statut,
    }: {
      signalementId: string
      statut: import('@/types/messagerie').SignalementStatut
    }) =>
      fetchJSON<MessageSignalement>(
        `/api/messagerie/signalements/${signalementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...messagerieKeys.all, 'signalements'],
      })
    },
  })
}

// ─── 10. useSetMuted ───

/**
 * Active/désactive la mise en sourdine d'une conversation (mute).
 * Invalide la liste des conversations pour rafraîchir le flag muted.
 */
export function useSetMuted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      muted,
    }: {
      conversationId: string
      muted: boolean
    }) =>
      fetchJSON<void>(
        `/api/messagerie/conversations/${conversationId}/mute`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagerieKeys.conversations(),
      })
    },
  })
}

// ─── 11. useParticipants ───

/**
 * Liste les participants d'une conversation (id, userId, lastReadAt, muted,
 * joinedAt, leftAt, user). Enrichi avec les infos utilisateur (name, email, role)
 * via LEFT JOIN côté backend. staleTime 60s.
 */
export function useParticipants(conversationId: string | null | undefined) {
  return useQuery<ConversationParticipant[]>({
    queryKey: messagerieKeys.participants(conversationId ?? 'none'),
    queryFn: () =>
      fetchJSON<{ participants: ConversationParticipant[] }>(
        `/api/messagerie/conversations/${conversationId}/participants`
      ).then((d) => d.participants),
    enabled: !!conversationId,
    staleTime: 60 * 1000,
    // BUGFIX (MESSAGERIE-SSE-RENDER) : polling fallback (20s) car le SSE est
    // bufferisé par le proxy Render free tier. Rafraîchit les participants
    // pour mettre à jour les badges "en ligne" et les nouveaux inscrits.
    refetchInterval: 20 * 1000,
  })
}

// ─── 12. usePresence (système "en ligne") ───

/**
 * Poll l'endpoint /api/messagerie/presence toutes les 10s et retourne un Set
 * des userIDs actuellement en ligne (activité < 45s côté backend).
 *
 * Utilisé pour afficher les badges "en ligne" à côté des participants et
 * dans la liste des conversations.
 *
 * Note : le backend met à jour la présence à chaque appel à
 * /api/messagerie/conversations (polling 15s). Un user est "en ligne" s'il
 * a pollé au moins une fois dans les dernières 45s.
 */
export function usePresence() {
  const query = useQuery<PresenceResult>({
    queryKey: messagerieKeys.presence(),
    queryFn: () => fetchJSON<PresenceResult>('/api/messagerie/presence'),
    refetchInterval: 10 * 1000, // 10s
    staleTime: 8 * 1000, // 8s
  })

  // Convertir en Set pour O(1) lookup.
  const onlineSet = new Set<string>(query.data?.online ?? [])
  return {
    onlineSet,
    onlineCount: query.data?.count ?? 0,
    isLoading: query.isLoading,
  }
}

// ─── Hook SSE : useMessagerieStream ───
//
// Ouvre une connexion SSE (EventSource) vers /api/messagerie/stream et invalide
// les queries pertinentes quand un event arrive. EventSource se reconnecte
// automatiquement en cas de déconnexion (pas de retry manuel).
//
// IMPORTANT : EventSource ne supporte pas les headers Authorization. Les
// cookies httpOnly sont envoyés automatiquement (withCredentials: true pour
// sécuriser l'envoi). Le backend doit autoriser CORS avec credentials
// (déjà configuré dans le middleware CORS existant).
//
// Le hook retourne { isConnected } pour afficher un indicateur "temps réel"
// dans l'UI. Peut être étendu pour afficher les "typing indicators" via
// l'event 'typing'.
//
// BUGFIX (MESSAGERIE-SSE-RENDER) : sur Render free tier, le proxy
// Cloudflare/Render bufferise les réponses SSE — le handler backend envoie
// bien l'event 'hello' + flush, mais le proxy ne le transmet pas au client
// → EventSource.onerror déclenche → isConnected = false → 'Hors ligne'
// permanent dans l'UI, même si le polling (refetchInterval sur
// useConversations/useMessages) fonctionne et rafraîchit les données.
//
// Solution : isConnected repose désormais sur le succès du fetch de
// /api/messagerie/conversations (healthcheck polling) plutôt que sur le
// SSE. Si le fetch réussit, on est 'connecté' (les données sont à jour via
// polling). Le SSE reste tenté en parallèle au cas où le backend/proxy est
// fixé (il invalidera les queries plus rapidement quand il marche).

export function useMessagerieStream() {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)

  // Healthcheck polling : confirme que le backend est joignable et que les
  // données sont synchronisées (via les refetchInterval de useConversations /
  // useMessages). Si le fetch réussit, on marque 'connecté'.
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const checkConnection = async () => {
      try {
        // Invalide les conversations pour forcer un refetch (le polling
        // régulier garantit que les nouveautés sont récupérées).
        await queryClient.refetchQueries({
          queryKey: messagerieKeys.conversations(),
        })
        if (!cancelled) setIsConnected(true)
      } catch {
        if (!cancelled) setIsConnected(false)
      } finally {
        if (!cancelled) {
          // Recheck dans 20s (plus lent que le refetchInterval de
          // useConversations pour éviter la redondance, mais assez fréquent
          // pour basculer isConnected en cas de panne réseau).
          timeoutId = setTimeout(checkConnection, 20 * 1000)
        }
      }
    }

    // Premier check immédiat (après un court délai pour laisser les queries
    // initiales se poser).
    timeoutId = setTimeout(checkConnection, 1500)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [queryClient])

  // Tentative SSE en parallèle (best-effort). Si le proxy Render le laisse
  // passer, on invalide plus rapidement les queries à l'arrivée d'un event.
  // Si le SSE échoue (cas Render free tier), le healthcheck polling ci-dessus
  // garantit isConnected = true et la fraîcheur des données.
  useEffect(() => {
    // Côté navigateur uniquement (Next.js SSR-safe).
    if (typeof window === 'undefined') return
    if (typeof EventSource === 'undefined') return

    const eventSource = new EventSource('/api/messagerie/stream', {
      withCredentials: true,
    })

    // Note : on NE PASSE PAS isConnected à false sur onerror, car le SSE
    // peut échouer à cause du proxy Render même si le backend est joignable
    // via polling. isConnected est piloté par le healthcheck polling.
    eventSource.onopen = () => {
      // SSE connecté → bonus, mais isConnected déjà géré par le healthcheck.
    }

    // Event : édition d'un message.
    eventSource.addEventListener('message_edit', (e) => {
      try {
        const msg = JSON.parse(e.data) as Message
        queryClient.invalidateQueries({
          queryKey: messagerieKeys.messages(msg.conversationId),
        })
      } catch {
        // ignore
      }
    })

    // Event : suppression d'un message. Le payload ne contient que
    // conversationId + messageId (le message est soft-deleté).
    eventSource.addEventListener('message_delete', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          conversationId: string
          messageId: string
        }
        queryClient.invalidateQueries({
          queryKey: messagerieKeys.messages(data.conversationId),
        })
      } catch {
        // ignore
      }
    })

    // Event : "ia_streaming" — contenu IA partiel en cours de génération.
    // MESSAGERIE-STREAMING : le backend broadcaste le contenu accumulé pour
    // chaque token reçu du provider. On met à jour le store streamingStore
    // (consommé par le composant chat pour afficher une bulle IA temporaire).
    eventSource.addEventListener('ia_streaming', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          conversationId: string
          userMsgId: string
          content: string
        }
        // Import dynamique pour éviter une dépendance circulaire au top-level.
        // Le store est simple (Zustand) et mis à jour à chaque chunk.
        useStreamingStore.getState().setStreaming(data.conversationId, data.userMsgId, data.content)
      } catch {
        // ignore parse errors
      }
    })

    // Event : "message_new" — quand le message IA final arrive, on clear le
    // contenu streaming de cette conversation (la bulle temporaire est
    // remplacée par le message persisté via l'invalidation query).
    eventSource.addEventListener('message_new', (e) => {
      try {
        const msg = JSON.parse(e.data) as Message
        if (msg.isIA) {
          useStreamingStore.getState().clearStreaming(msg.conversationId)
        }
        queryClient.invalidateQueries({
          queryKey: messagerieKeys.messages(msg.conversationId),
        })
        queryClient.invalidateQueries({
          queryKey: messagerieKeys.conversations(),
        })
      } catch {
        // ignore parse errors (heartbeats, commentaires SSE)
      }
    })

    return () => {
      eventSource.close()
    }
  }, [queryClient])

  return { isConnected }
}
