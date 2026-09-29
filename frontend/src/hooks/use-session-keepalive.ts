'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { withSessionLock } from '@/lib/session-lock'

/**
 * useSessionKeepAlive — maintient la session active en rafraîchissant
 * proactivement le token d'accès AVANT qu'il n'expire.
 *
 * SESSION-TIMEOUT-1 (ancien KEEPALIVE-1/FLICKER-FIX-1) :
 *
 * 1. Interval 10 min → 5 MIN. L'access token dure 15 min ; un check toutes
 *    les 5 min laisse une marge x3 (un check transient raté ne fait plus
 *    expirer le token avant le suivant). Chaque check réussi fait aussi
 *    glisser la fenêtre d'inactivité backend (30 min) — un utilisateur actif
 *    n'est jamais déconnecté.
 *
 * 2. Verrou multi-onglets (navigator.locks, cf. lib/session-lock.ts) : les
 *    checks concurrents sont sérialisés → plus jamais deux refresh simultanés
 *    du même token (cause historique de déconnexions en cascade).
 *
 * 3. RETRY réseau (backoff 8 s / 20 s, max 2) : avant, un check transient
 *    (backend indisponible, cold start Render) n'était PAS retenté avant
 *    10 min. Si le refresh avait été consommé côté backend mais la réponse
 *    perdue, le token du navigateur était périmé → déconnexion au check
 *    suivant. Désormais on retente immédiatement — la grâce backend (60 s)
 *    accepte le replay → le retry repart sur des tokens sains.
 *
 * 4. Le check reste SILENCIEUX (ne modifie PAS isLoading — 0 flash, cf.
 *    FLICKER-FIX-1) et ne déconnecte JAMAIS sur erreur réseau (KEEPALIVE-1) :
 *    seul un verdict « session invalide » confirmé par le backend (refresh
 *    token refusé) déclenche refreshSession (qui gère le logout).
 *
 * Monté dans AuthenticatedLayout (toutes les pages authentifiées).
 */
export function useSessionKeepAlive() {
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  /** Annule tous les retries réseau en attente. */
  const clearRetries = () => {
    retryTimeoutsRef.current.forEach((t) => clearTimeout(t))
    retryTimeoutsRef.current = []
  }

  /**
   * Check silencieux sous verrou multi-onglets.
   * Retourne 'ok' | 'invalid' | 'transient' pour piloter les retries.
   */
  const silentSessionCheck = async (): Promise<'ok' | 'invalid' | 'transient'> => {
    try {
      const res = await withSessionLock(() => fetch('/api/go-auth/session', { cache: 'no-store' }))
      const data = await res.json()
      if (data?.user) return 'ok'
      if (data?.transient) return 'transient'
      return 'invalid'
    } catch {
      return 'transient'
    }
  }

  /**
   * Check + retries réseau. Un verdict 'ok' ou 'invalid' est définitif :
   * on annule les retries restants. Un verdict 'transient' déclenche le
   * retry suivant (8 s puis 20 s — tous dans la fenêtre de grâce backend
   * de 60 s pour le cas « réponse perdue »).
   */
  const checkWithRetries = async (attempt = 0) => {
    const verdict = await silentSessionCheck()

    if (verdict === 'invalid') {
      // Session vraiment invalide (refresh token refusé par le backend) →
      // refreshSession gère le logout propre.
      clearRetries()
      refreshSession()
      return
    }

    if (verdict === 'transient' && attempt < 2) {
      const delay = attempt === 0 ? 8_000 : 20_000
      const t = setTimeout(() => {
        checkWithRetries(attempt + 1).catch(() => {})
      }, delay)
      retryTimeoutsRef.current.push(t)
      return // transitoire : on garde l'utilisateur connecté
    }
    // 'ok' (ou transient après épuisement des retries) : rien à faire.
    // Ne jamais déconnecter sur une erreur réseau.
  }

  useEffect(() => {
    if (!isAuthenticated) {
      clearRetries()
      return
    }

    // --- 1. Refresh périodique (toutes les 5 min) ---
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000

    const doRefresh = async () => {
      // Ne refresh que si l'onglet est visible (les onglets cachés seront
      // rattrapés par le visibilitychange au retour).
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        await checkWithRetries()
      }
    }

    intervalRef.current = setInterval(() => {
      doRefresh().catch(() => {})
    }, REFRESH_INTERVAL_MS)

    // --- 2. Refresh SILENCIEUX au refocus de l'onglet ---
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkWithRetries().catch(() => {})
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
      clearRetries()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, refreshSession])
}
