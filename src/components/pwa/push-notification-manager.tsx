'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, BellOff, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

/**
 * PushNotificationManager — Gère l'abonnement push côté client.
 *
 * Flow :
 *   1. Au montage, vérifie si le navigateur supporte les push + si le SW est prêt.
 *   2. Si permission = 'default', affiche un bouton "Activer les notifications".
 *   3. Au clic : demande la permission, s'abonne via PushManager.subscribe
 *      (clé publique VAPID récupérée via /api/push/vapid-public-key), envoie
 *      la subscription à /api/push/subscribe.
 *   4. Si permission = 'granted', affiche un check "Notifications activées".
 *   5. Si permission = 'denied', affiche un message "Bloqué — modifier dans
 *      les paramètres du navigateur".
 *
 * Monté dans le layout authentifié (visible sur toutes les pages).
 * En production uniquement (les push ne marchent pas en dev sans HTTPS + SW).
 */
export function PushNotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribing, setSubscribing] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    // Push nécessite : Service Worker + PushManager + Notifications
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    setSupported(isSupported)

    if (isSupported) {
      setPermission(Notification.permission)
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setSubscribing(true)
    try {
      // 1. Demander la permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        toast.info('Notifications refusées', {
          description: 'Vous pouvez les réactiver dans les paramètres du navigateur.',
        })
        return
      }

      // 2. Récupérer la clé publique VAPID
      const vapidRes = await fetch('/api/push/vapid-public-key')
      if (!vapidRes.ok) {
        throw new Error('VAPID non configuré')
      }
      const { publicKey } = await vapidRes.json()

      // 3. Convertir la clé VAPID (base64url) en Uint8Array pour PushManager
      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      // 4. S'abonner via PushManager (attend que le SW soit prêt)
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // RFC 8030 : les push doivent toujours afficher une notif
        applicationServerKey,
      })

      // 5. Envoyer la subscription au serveur pour stockage en DB
      const subJson = subscription.toJSON()
      const subscribeRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      })

      if (!subscribeRes.ok) {
        throw new Error('Échec enregistrement abonnement')
      }

      toast.success('Notifications activées', {
        description: 'Vous recevrez les alertes : nouveaux examens, résultats, badges.',
        icon: <Check className="h-4 w-4" />,
      })
    } catch (err) {
      console.error('[Push] Subscribe failed:', err)
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'activer les notifications.',
      })
    } finally {
      setSubscribing(false)
    }
  }, [supported])

  // Non supporté → ne rien afficher
  if (!supported) return null

  // Déjà accordé → petit indicateur discret
  if (permission === 'granted') {
    return null // silencieux : on ne pollue pas l'UI une fois activé
  }

  // Refusé → message discret
  if (permission === 'denied') {
    return null // silencieux : l'utilisateur a refusé, on ne insiste pas
  }

  // Permission 'default' → bouton d'activation
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={subscribe}
      disabled={subscribing}
      className="gap-1.5 text-xs"
      aria-label="Activer les notifications push"
    >
      <Bell className="h-3.5 w-3.5" />
      {subscribing ? 'Activation…' : 'Notifications'}
    </Button>
  )
}

// Convertit une clé base64url en ArrayBuffer (requis par PushManager.subscribe).
// Retourne un ArrayBuffer (et non Uint8Array) car le type DOM BufferSource
// attend un ArrayBuffer typé correctement par les lib TS 5.7+.
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i)
  }
  return output.buffer as ArrayBuffer
}
