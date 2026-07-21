/**
 * Outbox offline — Stockage IndexedDB des requêtes en attente de sync.
 *
 * Pattern "outbox" : quand l'utilisateur soumet une action offline
 * (ex: soumettre un examen sans réseau), on stocke la requête dans
 * IndexedDB et on enregistre un Background Sync. Quand le réseau
 * revient, le Service Worker lit l'outbox et rejoue les requêtes.
 *
 * Fallback iOS : Safari ne supporte pas Background Sync. On écoute
 * donc aussi l'événement `online` côté client pour flush l'outbox
 * manuellement (voir useOfflineSubmission).
 *
 * Structure IndexedDB :
 *   DB: sect-offline-outbox
 *   Store: outbox (keyPath: id, autoIncrement)
 *   Record: { id, url, method, body, createdAt, type }
 */

const DB_NAME = 'sect-offline-outbox'
const DB_VERSION = 1
const STORE = 'outbox'

// ─── Types ───

export interface OutboxItem {
  id?: number
  url: string
  method: string
  body: string // JSON stringifié
  createdAt: number
  /** Type métier pour filtrer/retry sélectif (ex: 'submit-exam') */
  type: string
  /** Métadonnées affichables (titre, session…) pour l'UI */
  meta?: Record<string, unknown>
}

// ─── Ouverture DB ───

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non supporté'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Opérations CRUD ───

/** Ajoute une requête à l'outbox. Retourne l'id généré. */
export async function addToOutbox(item: Omit<OutboxItem, 'id'>): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.add(item as OutboxItem)
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Récupère tous les items en attente (triés par date). */
export async function getOutboxItems(): Promise<OutboxItem[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const items = (req.result as OutboxItem[]).sort((a, b) => a.createdAt - b.createdAt)
      resolve(items)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Supprime un item de l'outbox (après sync réussie). */
export async function removeFromOutbox(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Compte les items en attente (pour badge UI). */
export async function getOutboxCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

// ─── Flush manuel (fallback iOS / online event) ───

/**
 * Rejoue toutes les requêtes de l'outbox. Utilisé par le fallback online
 * (Safari ne supporte pas Background Sync). Retourne le nombre de succès.
 *
 * Le Service Worker utilise sa propre implémentation de flush (dans sw.js)
 * pour le Background Sync ; cette fonction est pour le fallback client.
 */
export async function flushOutbox(): Promise<{ success: number; failed: number }> {
  const items = await getOutboxItems()
  let success = 0
  let failed = 0

  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body,
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (item.id !== undefined) await removeFromOutbox(item.id)
      success++
    } catch {
      failed++
      // Garde l'item pour retry ultérieur
    }
  }

  return { success, failed }
}

// ─── Enregistrement Background Sync ───

/**
 * Enregistre un tag Background Sync. Le SW déclenchera le handler 'sync'
 * quand le réseau reviendra.
 *
 * @returns true si enregistré, false si non supporté (iOS Safari)
 */
export async function registerBackgroundSync(tag: string = 'submit-exam'): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready
    // Cast : 'sync' n'est pas dans les types DOM standards (expérimental,
    // non supporté iOS Safari). On vérifie sa présence à runtime.
    const syncManager = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync
    if (syncManager) {
      await syncManager.register(tag)
      return true
    }
  } catch (err) {
    console.warn('[Outbox] Background Sync register failed:', err)
  }
  return false
}
