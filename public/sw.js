/**
 * SECT Service Worker — Offline PWA.
 *
 * Stratégies de cache :
 *   - App shell (navigation GET) : network-first, fallback cache (pour
 *     que les mises à jour soient visibles, mais offline fonctionne).
 *   - Assets statiques (JS/CSS/fonts/images) : stale-while-revalidate
 *     (rapide + màj en arrière-plan).
 *   - API GET : network-first, fallback cache (données fraîches优先).
 *   - API POST/mutations : network-only (jamais de cache).
 *
 * Versionnement : incrémenter CACHE_VERSION à chaque déploiement majeure
 * pour invalider les anciens caches (le SW supprime les caches obsolètes
 * au activate).
 *
 * NB : Ce SW est volontairement minimal et robuste. Pas de pré-cache
 * exhaustif (les URLs Turbopack sont dynamiques) — on cache à la volée.
 */

const CACHE_VERSION = 'sect-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Ressources à pré-cacher à l'install (app shell minimal)
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
]

// ─── INSTALL : pré-cache l'app shell ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // best-effort : ignore les échecs individuels
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      )
    })
  )
  // Active le SW immédiatement (skip waiting)
  self.skipWaiting()
})

// ─── ACTIVATE : supprime les anciens caches ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      )
    })
  )
  // Prend le contrôle de tous les clients immédiatement
  self.clients.claim()
})

// ─── FETCH : stratégies de cache par type de requête ───
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Ignore les requêtes non-GET (mutations : jamais de cache)
  if (request.method !== 'GET') return

  // Ignore les requêtes cross-origin (analytics, fonts Google, etc.)
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Ignore les requêtes d'auth NextAuth (jamais de cache)
  if (url.pathname.startsWith('/api/auth')) return

  // ─── API GET : network-first, fallback cache ───
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache les réponses 200 pour réutilisation offline
          if (response.ok && response.status === 200) {
            const clone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          // Offline : tente le cache
          return caches.match(request).then((cached) => cached || Response.error())
        })
    )
    return
  }

  // ─── Navigation (pages HTML) : network-first, fallback cache + offline page ───
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache la page pour offline
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => {
          // Offline : retourne la page cachée, ou la racine pré-cachée
          return caches.match(request).then((cached) => cached || caches.match('/'))
        })
    )
    return
  }

  // ─── Assets statiques : stale-while-revalidate ───
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          // Cache les réponses valides (200 + opaque CORS pour les fonts)
          if (response.ok || response.status === 0) {
            const clone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached) // Offline : retourne le cache
      return cached || fetchPromise
    })
  )
})

// ─── MESSAGE : permet au client de forcer l'update du SW ───
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

// ─── PUSH : réception d'une notification push ───
self.addEventListener('push', (event) => {
  let payload
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'SECT', body: event.data ? event.data.text() : 'Nouvelle notification' }
  }

  const {
    title = 'SECT',
    body = '',
    url = '/dashboard',
    icon = '/favicon.png',
    badge = '/favicon-32x32.png',
    tag = 'sect-notification',
    data = {},
  } = payload

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { ...data, url },
    requireInteraction: false,
    vibrate: [100, 50, 100], // vibration courte
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ─── NOTIFICATIONCLICK : ouvre l'URL cible au clic ───
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre est déjà ouverte, la focalise et navigue
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Sinon ouvre une nouvelle fenêtre
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})

// ════════════════════════════════════════════════════════════════
// BACKGROUND SYNC — soumission d'examen en différé (offline)
// ════════════════════════════════════════════════════════════════

// ─── SYNC : déclenché quand le réseau revient (après sync.register) ───
self.addEventListener('sync', (event) => {
  if (event.tag === 'submit-exam') {
    event.waitUntil(flushSubmissionOutbox())
  }
})

// Lit l'IndexedDB outbox et POSTe les soumissions en attente
async function flushSubmissionOutbox() {
  try {
    const db = await openOutboxDB()
    const tx = db.transaction('outbox', 'readonly')
    const store = tx.objectStore('outbox')
    const items = await store.getAll()
    db.close()

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const res = await fetch(item.url, {
          method: item.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: item.body,
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Succès → supprime de l'outbox
        const db2 = await openOutboxDB()
        await db2.transaction('outbox', 'readwrite').objectStore('outbox').delete(item.id)
        db2.close()
        // Notifie le client que la soumission a réussi
        const clients = await self.clients.matchAll({ includeUncontrolled: true })
        clients.forEach((c) => c.postMessage({ type: 'SUBMISSION_SYNCED', id: item.id, url: item.url }))
      })
    )

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      // Retry : re-enregistre le sync pour les échecs restants
      const reg = await self.registration.sync.register('submit-exam')
      return reg
    }
  } catch (err) {
    console.error('[SW Background Sync] flushSubmissionOutbox failed:', err)
  }
}

// Helper : ouvre la DB IndexedDB de l'outbox
function openOutboxDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('sect-offline-outbox', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
