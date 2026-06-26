'use client'

import { useEffect } from 'react'

/**
 * ServiceWorkerRegister — Enregistre le Service Worker pour le PWA offline.
 *
 * Monté une fois dans le layout racine (côté client). N'enregistre le SW
 * qu'en production (process.env.NODE_ENV === 'production') pour éviter
 * de cacher les assets en dev (Turbopack HMR).
 *
 * Au succès, log une info. En cas d'erreur, log non-bloquant (l'app
 * fonctionne sans SW, juste sans offline).
 *
 * Gère aussi le cycle de mise à jour : si un nouveau SW est activé
 * (controllerchange), recharge la page une fois pour prendre en compte
 * les nouveaux assets.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // En dev, on n'enregistre pas le SW (conflit avec HMR Turbopack)
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        // Nouveau SW en attente → notifie pour activation
        if (registration.waiting) {
          registration.waiting.postMessage('SKIP_WAITING')
        }

        // Écoute les nouvelles versions
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouveau SW installé → skip waiting pour activation immédiate
              newWorker.postMessage('SKIP_WAITING')
            }
          })
        })

        // Recharge la page quand le contrôleur change (nouveau SW actif)
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          window.location.reload()
        })

        console.info('[PWA] Service Worker enregistré')
      } catch (error) {
        console.warn('[PWA] Échec enregistrement Service Worker:', error)
      }
    }

    // Enregistre après le load pour ne pas bloquer le first paint
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
