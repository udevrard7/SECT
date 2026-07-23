'use client'

/**
 * use-install-prompt.ts — Hook pour gérer l'installation PWA.
 *
 * SECT-PWA-DESKTOP-1 : capture l'événement `beforeinstallprompt` (Chrome/Edge)
 * pour proposer l'installation SECT au bon moment, au lieu d'attendre que
 * l'utilisateur trouve l'option dans le menu navigateur.
 *
 * API :
 *   - canInstall (bool) : true si le navigateur permet l'installation
 *   - promptInstall () : déclenche le prompt natif (retourne 'accepted' | 'dismissed' | 'unavailable')
 *   - isInstalled (bool) : true si l'app est déjà installée (display-mode: standalone ou iOS standalone)
 *
 * Comportement :
 *   - Le navigateur ne déclenche beforeinstallprompt QUE si tous les critères
 *     Chrome installability sont réunis (manifest + SW + HTTPS + engagement)
 *   - Si l'utilisateur dismiss le prompt, Chrome ne le repropose pas avant 30j.
 *     On mémorise donc la date de dernier dismiss dans localStorage pour ne
 *     pas harceler l'utilisateur avec le bouton s'il a déjà dit non récemment.
 *   - On track l'event `appinstalled` pour analytics (observabilité adoption).
 */

import { useState, useEffect, useCallback } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  platforms: string[]
}

const DISMISS_COOLDOWN_DAYS = 30
const DISMISS_KEY = 'sect_pwa_install_dismissed_at'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // Chrome/Edge/Android : display-mode: standalone
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari : navigator.standalone (deprecated mais still works)
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true
  return false
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Lazy init : isStandalone() est sûr en SSR (retourne false) donc on peut
  // initialiser directement sans useEffect (évite le warning ESLint de cascading render).
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandalone())

  useEffect(() => {
    // Ne rien faire en SSR
    if (typeof window === 'undefined') return

    // Si déjà installé, on ne capture pas beforeinstallprompt
    if (isStandalone()) return

    const onBeforeInstallPrompt = (e: Event) => {
      // Empêcher le prompt auto (on veut le déclencher sur clic bouton)
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      // Analytics : l'utilisateur a installé l'app
      setIsInstalled(true)
      setDeferredPrompt(null)
      try {
        console.info('[PWA] SECT installé avec succès')
      } catch {
        // console peut être absent en prod
      }
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  // Vérifier si on est dans la période de cooldown après un dismiss
  const isWithinCooldown = useCallback((): boolean => {
    if (typeof window === 'undefined') return false
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY)
      if (!dismissedAt) return false
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24)
      return daysSince < DISMISS_COOLDOWN_DAYS
    } catch {
      return false
    }
  }, [])

  // canInstall : true si le navigateur a déclenché beforeinstallprompt ET
  // qu'on n'est pas dans le cooldown de 30j après un dismiss récent.
  const canInstall = !!deferredPrompt && !isInstalled && !isWithinCooldown()

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable'

    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'dismissed') {
        // Mémoriser la date de dismiss pour le cooldown
        try {
          localStorage.setItem(DISMISS_KEY, Date.now().toString())
        } catch {
          // localStorage peut échouer (mode privé)
        }
      }
      // Le prompt ne peut être utilisé qu'une fois → on le clear
      setDeferredPrompt(null)
      return choice.outcome
    } catch {
      return 'unavailable'
    }
  }, [deferredPrompt])

  return { canInstall, isInstalled, promptInstall }
}
