'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/**
 * ServiceWorkerRegister — Enregistre le Service Worker pour le PWA offline.
 *
 * Monté une fois dans le layout racine (côté client). N'enregistre le SW
 * qu'en production (process.env.NODE_ENV === 'production') pour éviter
 * de cacher les assets en dev (Turbopack HMR).
 *
 * SECT-PWA-AUDIT-1 : au lieu de recharger automatiquement la page quand un
 * nouveau SW est activé (controllerchange), on affiche un toast "Nouvelle
 * version disponible — recharger ?" avec un bouton. L'utilisateur garde le
 * contrôle et ne perd pas son travail en cours.
 */
export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

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
          setUpdateAvailable(true)
        }

        // Écoute les nouvelles versions
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouveau SW installé → toast au lieu de skip waiting auto
              setUpdateAvailable(true)
            }
          })
        })

        // Quand le contrôleur change (après que l'utilisateur a cliqué
        // "Recharger"), reload la page.
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

  // Toast "Nouvelle version disponible" avec bouton Recharger
  useEffect(() => {
    if (!updateAvailable) return
    const toastId = toast.info('Nouvelle version disponible', {
      description: 'Une mise à jour de SECT est prête à être installée.',
      duration: Infinity, // persistant jusqu'à action
      action: {
        label: 'Recharger',
        onClick: () => {
          // Demande au SW d'activer la nouvelle version
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg?.waiting) {
              reg.waiting.postMessage('SKIP_WAITING')
            } else {
              window.location.reload()
            }
          })
        },
      },
      cancel: {
        label: 'Plus tard',
        onClick: () => setUpdateAvailable(false),
      },
    })
    return () => { toast.dismiss(toastId) }
  }, [updateAvailable])

  return null
}
