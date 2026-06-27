'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'

/**
 * useSessionKeepAlive — maintient la session active en rafraîchissant
 * proactivement le token d'accès AVANT qu'il n'expire.
 *
 * BUGFIX (FLICKER-FIX-1) : le refresh au visibilitychange déclenchait
 * refreshSession() qui set isLoading: true → re-render de
 * AuthenticatedLayout → remontage de PageContent → flash/clignotement.
 *
 * Fix : le refresh au refocus est maintenant SILENCIEUX — il ne modifie
 * PAS isLoading. On appelle directement l'API /api/go-auth/session sans
 * passer par refreshSession (qui set isLoading). Si la session est
 * invalide, on déclenche alors refreshSession (qui gère le logout).
 *
 * Le cleanup (return () => removeEventListener) est CRITIQUE : comme
 * AuthenticatedLayout se remonte à chaque navigation (catch-all route),
 * sans cleanup les listeners s'accumuleraient → dizaines de refresh
 * simultanés au retour sur l'onglet.
 *
 * Monté dans AuthenticatedLayout (toutes les pages authentifiées).
 */
export function useSessionKeepAlive() {
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    // --- 1. Refresh périodique (toutes les 10 min) ---
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

    const doRefresh = async () => {
      // Ne refresh que si l'onglet est visible
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        await silentSessionCheck()
      }
    }

    intervalRef.current = setInterval(doRefresh, REFRESH_INTERVAL_MS)

    // --- 2. Refresh SILENCIEUX au refocus de l'onglet ---
    // BUGFIX (FLICKER-FIX-1) : ne PAS appeler refreshSession() directement
    // car il set isLoading: true → re-render → flash. À la place, on fait
    // un check silencieux : si la session est encore valide, on ne touche
    // à rien. Si invalide, on appelle refreshSession (qui gère le logout).
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await silentSessionCheck()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // --- 3. Cleanup CRITIQUE ---
    // Sans ce cleanup, les listeners s'accumuleraient à chaque navigation
    // (AuthenticatedLayout se remonte) → fuite mémoire + refreshs multiples.
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, refreshSession])

  /**
   * Check silencieux de la session SANS modifier isLoading.
   * Appelle /api/go-auth/session en arrière-plan. Si l'utilisateur est
   * toujours valide, ne fait rien (0 re-render). Si invalide, déclenche
   * refreshSession (qui gère le logout proprement).
   */
  async function silentSessionCheck() {
    try {
      const res = await fetch('/api/go-auth/session')
      const data = await res.json()
      if (!data.user && !data.transient) {
        // Session vraiment invalide (pas transitoire) → logout propre
        refreshSession()
      }
      // Si data.user ou data.transient → ne rien faire (silencieux)
    } catch {
      // Erreur réseau → ne rien faire (silencieux, ne pas déconnecter)
    }
  }
}
