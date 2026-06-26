'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addToOutbox,
  flushOutbox,
  getOutboxCount,
  registerBackgroundSync,
  type OutboxItem,
} from '@/lib/offline-outbox'
import { toast } from 'sonner'

/**
 * useOfflineSubmission — Hook pour soumettre des actions offline-first.
 *
 * Pattern outbox :
 *   1. submitOffline(url, body) : si online, fetch direct. Si offline,
 *      stocke dans IndexedDB + register Background Sync + toast "Sauvegardé
 *      offline, sera soumis à la reconnexion".
 *   2. Le Service Worker rejoue automatiquement les requêtes au retour
 *      réseau (Background Sync, Android Chrome).
 *   3. Fallback iOS (pas de BG Sync) : on écoute l'événement `online`
 *      et on flush l'outbox manuellement.
 *   4. pendingCount : nombre de soumissions en attente (pour badge UI).
 *
 * Usage typique (soumission d'examen) :
 *   const { submitOffline, pendingCount } = useOfflineSubmission()
 *   await submitOffline('/api/sessions/123/submit', { responses: [...] }, {
 *     type: 'submit-exam',
 *     meta: { examTitle: 'Examen algo' },
 *   })
 */
export function useOfflineSubmission() {
  const [pendingCount, setPendingCount] = useState(0)
  // Init lazy (évite setState synchrone dans useEffect — règle React 19)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  // Init : pending count + écouteurs online/offline
  useEffect(() => {
    getOutboxCount().then(setPendingCount).catch(() => {})

    const handleOnline = () => {
      setIsOnline(true)
      // Fallback iOS : flush manuel au retour réseau
      flushOutbox()
        .then(({ success, failed }) => {
          if (success > 0) {
            toast.success(`${success} soumission(s) synchronisée(s)`, {
              description: failed > 0 ? `${failed} en échec, sera réessayée(s).` : undefined,
            })
            getOutboxCount().then(setPendingCount)
          }
        })
        .catch(() => {})
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Écoute les messages du SW (soumission syncée via Background Sync)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SUBMISSION_SYNCED') {
        toast.success('Soumission synchronisée', {
          description: 'Votre examen a été soumis avec succès.',
        })
        getOutboxCount().then(setPendingCount)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      navigator.serviceWorker?.removeEventListener('message', handleMessage)
    }
  }, [])

  /**
   * Soumet une requête offline-first.
   *
   * @param url endpoint API (relative)
   * @param body payload (sera JSON stringifié)
   * @param options type métier + meta pour l'outbox
   * @returns true si soumis online avec succès, false si mis en attente offline
   */
  const submitOffline = useCallback(
    async <T>(
      url: string,
      body: unknown,
      options: { type?: string; meta?: Record<string, unknown> } = {}
    ): Promise<{ synced: boolean; data?: T; error?: string }> => {
      const { type = 'submit-exam', meta } = options
      const bodyStr = JSON.stringify(body)

      // Online → fetch direct
      if (navigator.onLine) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
            credentials: 'same-origin',
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { synced: true, error: (err as { error?: string }).error ?? `HTTP ${res.status}` }
          }
          const data = await res.json().catch(() => undefined)
          return { synced: true, data: data as T }
        } catch (err) {
          // Erreur réseau inattendue → fallback offline
          console.warn('[OfflineSubmission] Fetch failed, falling back to outbox:', err)
        }
      }

      // Offline (ou fetch échoué) → stocker dans l'outbox
      try {
        await addToOutbox({
          url,
          method: 'POST',
          body: bodyStr,
          createdAt: Date.now(),
          type,
          meta,
        })

        // Tente d'enregistrer Background Sync (Android Chrome)
        const registered = await registerBackgroundSync(type)

        setPendingCount((c) => c + 1)

        toast.success('Sauvegardé hors ligne', {
          description: registered
            ? 'Sera soumis automatiquement à la reconnexion.'
            : 'Sera soumis à la reconnexion (gardez l\'app ouverte).',
          duration: 5000,
        })

        return { synced: false }
      } catch (err) {
        console.error('[OfflineSubmission] Outbox store failed:', err)
        return {
          synced: false,
          error: err instanceof Error ? err.message : 'Impossible de sauvegarder hors ligne',
        }
      }
    },
    []
  )

  return {
    submitOffline,
    pendingCount,
    isOnline,
  }
}
