import { create } from 'zustand'

/**
 * streamingStore — contenu IA partiel en cours de génération (streaming SSE).
 *
 * MESSAGERIE-STREAMING : quand un utilisateur mentionne @assistant dans un
 * salon collectif, le backend streame la réponse token par token via l'event
 * SSE "ia_streaming". Ce store conserve le contenu accumulé par conversation,
 * pour que le composant chat affiche une bulle IA temporaire qui se remplit
 * en temps réel (UX type ChatGPT).
 *
 * Quand le message IA final est persisté (event "message_new" avec isIA=true),
 * le hook useMessagerieStream appelle clearStreaming() — la bulle temporaire
 * disparaît, remplacée par le message persisté (via l'invalidation query).
 *
 * État : map conversationId → { userMsgId, content, startedAt }
 * - une seule réponse IA en streaming par conversation à la fois
 * - startedAt permet de nettoyer les streams orphelins (>30s sans update)
 */

interface StreamingState {
  userMsgId: string
  content: string
  startedAt: number
}

interface StreamingStore {
  // Map conversationId → StreamingState
  streams: Record<string, StreamingState>
  // setStreaming met à jour le contenu accumulé pour une conversation.
  setStreaming: (conversationId: string, userMsgId: string, content: string) => void
  // clearStreaming supprime le stream d'une conversation (quand le message
  // final arrive ou en cas d'erreur).
  clearStreaming: (conversationId: string) => void
}

export const useStreamingStore = create<StreamingStore>((set) => ({
  streams: {},
  setStreaming: (conversationId, userMsgId, content) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [conversationId]: {
          userMsgId,
          content,
          startedAt: state.streams[conversationId]?.startedAt ?? Date.now(),
        },
      },
    })),
  clearStreaming: (conversationId) =>
    set((state) => {
      if (!state.streams[conversationId]) return state
      const next = { ...state.streams }
      delete next[conversationId]
      return { streams: next }
    }),
}))

/**
 * useStreamingContent — hook helper pour récupérer le contenu streaming d'une
 * conversation donnée. Retourne null si aucun stream en cours.
 */
export function useStreamingContent(conversationId: string | undefined): string | null {
  return useStreamingStore((s) =>
    conversationId && s.streams[conversationId] ? s.streams[conversationId].content : null
  )
}
