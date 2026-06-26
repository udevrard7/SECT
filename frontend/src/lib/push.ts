/**
 * Utilitaires Push Notifications (côté serveur).
 *
 * Utilise web-push (RFC 8291 + VAPID RFC 8292) pour envoyer des
 * notifications push aux appareils abonnés.
 *
 * Flow :
 *   1. Le client demande la permission + s'abonne via PushManager (clé
 *      publique VAPID récupérée via /api/push/vapid-public-key).
 *   2. Le client envoie sa subscription (endpoint + p256dh + auth) à
 *      /api/push/subscribe qui la stocke en DB (PushSubscription).
 *   3. Côté serveur, quand un événement métier le justifie (nouvel examen,
 *      correction finalisée, badge débloqué…), on appelle sendPushToUser()
 *      qui récupère toutes les subscriptions de l'utilisateur et envoie
 *      la notification via web-push.
 *
 * Configuration : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT dans .env.
 */

import webpush from 'web-push'
import { db } from '@/lib/db'

// Configure web-push avec les clés VAPID (une seule fois)
let configured = false
function configureWebPush() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@sect.app'

  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY doivent être définis dans .env')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  /** URL à ouvrir au clic (relative, ex: /mes-resultats) */
  url?: string
  /** Icône (relative, ex: /favicon.png) — défaut /favicon.png */
  icon?: string
  /** Badge (icône monochrome pour Android status bar) */
  badge?: string
  /** Tag pour grouper/remplacer des notifications identiques */
  tag?: string
  /** Données arbitraires (accessibles dans notificationclick) */
  data?: Record<string, unknown>
}

/**
 * Envoie une notification push à toutes les subscriptions d'un utilisateur.
 *
 * @param userId l'utilisateur cible
 * @param payload le contenu de la notification
 * @returns nombre de notifications envoyées avec succès (les subscriptions
 *          invalides/expirées sont automatiquement supprimées de la DB)
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    configureWebPush()
  } catch (err) {
    console.warn('[Push] Configuration VAPID manquante, push ignoré:', err instanceof Error ? err.message : err)
    return 0
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) return 0

  const notification = {
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/dashboard',
    icon: payload.icon ?? '/favicon.png',
    badge: payload.badge ?? '/favicon-32x32.png',
    tag: payload.tag,
    data: payload.data,
  }

  const message = JSON.stringify(notification)

  // Envoie en parallèle, supprime les subscriptions expirées
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message,
          {
            TTL: 60 * 60 * 24, // 24h
            urgency: 'normal',
            topic: payload.tag,
          }
        )
        return { ok: true, endpoint: sub.endpoint }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 (endpoint expiré) ou 410 (gone) → supprimer la subscription
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {})
          return { ok: false, endpoint: sub.endpoint, removed: true }
        }
        throw err
      }
    })
  )

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
  return successCount
}

/**
 * Envoie une notification push à plusieurs utilisateurs (ex: tous les étudiants
 * d'une filière). Utilise sendPushToUser en parallèle.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const results = await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)))
  return results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0)
}
