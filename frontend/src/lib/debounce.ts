/**
 * debounce — creates a debounced version of a function that delays invocation
 * until `delay` ms have elapsed since the last call. Useful for batching
 * rapid API calls (e.g., auto-save during exam).
 *
 * OPT-9 : utilisé par passation-page.tsx pour coalescer les saves rapides.
 * Quand un étudiant navigue rapidement entre les questions, on ne veut pas
 * envoyer 10 requêtes en 2 secondes mais plutôt attendre qu'il s'arrête
 * puis envoyer 1 seule requête avec toutes les réponses accumulées.
 */

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timeoutId = null
      if (lastArgs) {
        fn(...lastArgs)
        lastArgs = null
      }
    }, delay)
  }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
      lastArgs = null
    }
  }

  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
      if (lastArgs) {
        fn(...lastArgs)
        lastArgs = null
      }
    }
  }

  return debounced
}
