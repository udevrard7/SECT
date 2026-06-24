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
