/**
 * exam-answers-cache — Stockage IndexedDB des réponses d'examen en cours.
 *
 * BUGFIX (EXAM-OFFLINE-1) : avant ce module, les réponses de l'étudiant
 * pendant un examen étaient stockées uniquement en mémoire React (useState).
 * En cas de micro-coupure internet + refresh/fermeture accidentelle de
 * l'onglet, toutes les réponses non sauvegardées étaient perdues.
 *
 * Maintenant : chaque réponse est persistée en IndexedDB dès qu'elle est
 * saisie. Au remontage de PassationPage (refresh, retour sur la page),
 * les réponses sont restaurées depuis IndexedDB.
 *
 * De plus, saveAnswers() tente d'envoyer au serveur. Si le réseau est
 * coupé, les réponses restent en IndexedDB et un retry automatique est
 * programmé au retour du réseau (online event).
 *
 * Structure IndexedDB :
 *   DB: sect-exam-answers
 *   Store: answers (keyPath: 'sessionId_questionId')
 *   Record: { sessionId, questionId, value, updatedAt }
 */

const DB_NAME = 'sect-exam-answers'
const DB_VERSION = 2
const STORE = 'answers'
const SNAPSHOT_STORE = 'exam-snapshots'

interface CachedAnswer {
  /** Clé composite : `${sessionId}_${questionId}` */
  id: string
  sessionId: string
  questionId: string
  value: string
  updatedAt: number
}

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
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      // OPT-10: add snapshot store (version 2)
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function makeKey(sessionId: string, questionId: string): string {
  return `${sessionId}_${questionId}`
}

/**
 * Sauvegarde une réponse en IndexedDB (instantané, non-bloquant).
 * Écrase la valeur précédente pour la même question.
 */
export async function cacheAnswer(
  sessionId: string,
  questionId: string,
  value: string,
): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const record: CachedAnswer = {
        id: makeKey(sessionId, questionId),
        sessionId,
        questionId,
        value,
        updatedAt: Date.now(),
      }
      store.put(record)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Silent fail — IndexedDB peut être indisponible (mode privé, etc.)
  }
}

/**
 * Récupère toutes les réponses cachées pour une session donnée.
 * Utilisé au remontage de PassationPage pour restaurer l'état.
 */
export async function getCachedAnswers(
  sessionId: string,
): Promise<Record<string, string>> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.getAll()
      req.onsuccess = () => {
        const records = req.result as CachedAnswer[]
        const answers: Record<string, string> = {}
        for (const r of records) {
          if (r.sessionId === sessionId) {
            answers[r.questionId] = r.value
          }
        }
        db.close()
        resolve(answers)
      }
      req.onerror = () => {
        db.close()
        reject(req.error)
      }
    })
  } catch {
    return {}
  }
}

/**
 * Supprime toutes les réponses cachées pour une session (après submit réussi).
 */
export async function clearCachedAnswers(sessionId: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.getAll()
      req.onsuccess = () => {
        const records = req.result as CachedAnswer[]
        for (const r of records) {
          if (r.sessionId === sessionId) {
            store.delete(r.id)
          }
        }
      }
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Silent fail
  }
}

/**
 * Compte les réponses cachées pour une session (pour debug/UX).
 */
export async function getCachedAnswersCount(sessionId: string): Promise<number> {
  try {
    const answers = await getCachedAnswers(sessionId)
    return Object.keys(answers).length
  } catch {
    return 0
  }
}

// ─── Exam State Snapshot (OPT-10) ───

interface ExamSnapshot {
  /** Key: epreuveId */
  id: string
  epreuveId: string
  userId: string
  epreuve: any
  questions: any[]
  session: any
  reponses: Record<string, string>
  activeCodeLanguages: Record<string, any>
  timeRemaining: number
  fullscreenExitCount: number
  totalAlertCount: number
  penalite: number
  savedAt: number
}

export async function saveExamSnapshot(snapshot: Omit<ExamSnapshot, 'savedAt' | 'id'>): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
      const store = tx.objectStore(SNAPSHOT_STORE)
      const record: ExamSnapshot = {
        ...snapshot,
        id: snapshot.epreuveId,
        savedAt: Date.now(),
      }
      store.put(record)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Silent fail — IndexedDB peut être indisponible
  }
}

export async function getExamSnapshot(epreuveId: string): Promise<ExamSnapshot | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
      const store = tx.objectStore(SNAPSHOT_STORE)
      const req = store.get(epreuveId)
      req.onsuccess = () => {
        db.close()
        resolve(req.result || null)
      }
      req.onerror = () => {
        db.close()
        reject(req.error)
      }
    })
  } catch {
    return null
  }
}

export async function clearExamSnapshot(epreuveId: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
      const store = tx.objectStore(SNAPSHOT_STORE)
      store.delete(epreuveId)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Silent fail
  }
}

/**
 * Vérifie si un snapshot est récent (moins de maxAgeMs millisecondes).
 * Utilisé pour décider si on peut utiliser le cache ou si on doit fetcher.
 */
export function isSnapshotFresh(snapshot: ExamSnapshot | null, maxAgeMs: number = 5 * 60 * 1000): boolean {
  if (!snapshot) return false
  return Date.now() - snapshot.savedAt < maxAgeMs
}
