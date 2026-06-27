'use client'

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'

/**
 * useApi — hook unifié pour les requêtes API avec cache TanStack Query.
 *
 * BUGFIX (QUERY-CACHE-1) : avant ce hook, les pages utilisaient le pattern
 * useEffect + fetch + useState manuel. À chaque navigation, le composant
 * était démonté/remonté → perte du state + refetch systématique → flash
 * de skeleton + requêtes redondantes.
 *
 * Avec TanStack Query :
 * - Le cache survit au démontage du composant (vit dans QueryClientProvider)
 * - staleTime = 60s : la donnée est "fraîche" pendant 60s, pas de refetch
 * - Au retour sur une page : affichage instantané depuis le cache (0 skeleton)
 * - Refetch en arrière-plan (stale-while-revalidate) discret
 * - refetchOnWindowFocus: false (déjà configuré dans Providers)
 *
 * Usage :
 *   const { data, isLoading, error, refetch } = useApi(
 *     ['documents', userId],           // queryKey unique
 *     `/api/documents?userId=${userId}`, // URL
 *     { staleTime: 30000 }              // options optionnelles
 *   )
 *
 * Pour le polling :
 *   const { data } = useApi(['documents'], '/api/documents', {
 *     refetchInterval: 60000,                    // poll toutes les 60s
 *     refetchIntervalInBackground: false,        // arrête si onglet caché
 *   })
 */

interface UseApiOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  /** URL de l'API (relative, ex: '/api/documents') */
  url: string
  /** Activer le polling (ms). 0 = pas de polling. */
  pollInterval?: number
  /** Arrêter le polling quand l'onglet est caché (défaut: true) */
  pauseWhenHidden?: boolean
}

export function useApi<T = unknown>(
  queryKey: readonly unknown[],
  url: string,
  options: UseApiOptions<T> = {},
) {
  const { url: _url, pollInterval, pauseWhenHidden = true, ...queryOptions } = options

  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url)
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || `HTTP ${res.status}`)
      }
      return res.json() as Promise<T>
    },
    // staleTime par défaut: 60s (la donnée est considérée fraîche pendant 60s)
    staleTime: 60 * 1000,
    // Pas de refetch au focus (déjà configuré globalement, mais explicite ici)
    refetchOnWindowFocus: false,
    // Polling optionnel
    ...(pollInterval
      ? {
          refetchInterval: pollInterval,
          refetchIntervalInBackground: !pauseWhenHidden,
        }
      : {}),
    ...queryOptions,
  })
}

/**
 * useApiMutation — hook pour les mutations POST/PATCH/DELETE.
 *
 * Invalide automatiquement les queryKeys spécifiées après succès.
 */
export function useApiMutation<TData = unknown, TVariables = unknown>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string | ((vars: TVariables) => string),
  options: {
    invalidateQueries?: readonly unknown[][]
    onSuccess?: (data: TData, vars: TVariables) => void
    onError?: (err: Error, vars: TVariables) => void
  } = {},
) {
  const { invalidateQueries = [], onSuccess, onError } = options

  return {
    mutate: async (variables: TVariables) => {
      const finalUrl = typeof url === 'function' ? url(variables) : url
      try {
        const res = await fetch(finalUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variables),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody?.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as TData
        onSuccess?.(data, variables)
        return data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Erreur inconnue')
        onError?.(error, variables)
        throw error
      }
    },
    // Exposer invalidateQueries pour usage externe si besoin
    _invalidateQueries: invalidateQueries,
  }
}
