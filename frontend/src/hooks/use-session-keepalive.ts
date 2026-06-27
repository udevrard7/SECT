'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'

/**
 * useSessionKeepAlive — maintient la session active en rafraîchissant
 * proactivement le token d'accès AVANT qu'il n'expire.
 *
 * BUGFIX (KEEPALIVE-1) : avant ce hook, le refresh n'était déclenché que
 * réactivement (au montage du layout). En cas d'inactivité, l'access token
 * (15 min) expirait sans être renouvelé, et la prochaine navigation
 * déclenchait un refresh qui pouvait échouer (cold start Render) → logout.
 *
 * Stratégie :
 *  1. Refresh périodique toutes les 10 minutes (avant l'expiration à 15 min)
 *     → renouvelle l'access token tant que le refresh token (7j) est valide.
 *  2. Refresh au refocus de l'onglet (visibilitychange → visible) → couvre
 *     le cas où l'utilisateur revient après une absence (le token a pu
 *     expirer pendant ce temps).
 *  3. L'interval est suspendu quand l'onglet est caché (économie + évite
 *     de réveiller inutilement le backend).
 *  4. Le refresh est "silencieux" : grâce au fix de la route session +
 *     auth-store, une erreur transitoire ne déconnecte PAS l'utilisateur.
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
    // L'access token expire à 15 min. On refresh à 10 min pour avoir une
    // marge de sécurité. Si le refresh échoue (transitoire), le token
    // courant est encore valide 5 min → on réessaiera au prochain cycle.
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

    const doRefresh = () => {
      // Ne refresh que si l'onglet est visible (évite de réveiller le
      // backend inutilement quand l'utilisateur est sur un autre onglet).
      // Le refresh au refocus (ci-dessous) couvre le retour d'onglet.
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshSession()
      }
    }

    intervalRef.current = setInterval(doRefresh, REFRESH_INTERVAL_MS)

    // --- 2. Refresh au refocus de l'onglet ---
    // Quand l'utilisateur revient sur l'onglet après une absence, le token
    // a pu expirer. On refresh immédiatement pour éviter qu'une navigation
    // ne déclenche un refresh qui pourrait échouer.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // --- 3. Cleanup ---
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, refreshSession])
}
