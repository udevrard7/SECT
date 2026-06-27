'use client'

/**
 * PageCacheProvider — cache keep-alive des pages pour éviter le remontage
 * et le refetch systématique à chaque navigation.
 *
 * BUGFIX (KEEPALIVE-PAGES-1) : Next.js App Router avec catch-all route
 * [...slug] remonte AuthenticatedLayout → PageContent à chaque navigation.
 *
 * Solution : le cache (Map de pages) vit dans le Context au niveau Providers
 * (qui ne se remonte jamais). PageContent lit le cache depuis le Context
 * et rend TOUTES les pages (l'active en display:block, les autres en
 * display:none). Comme le cache est dans le Context (pas dans un useRef
 * local à PageContent), il survit au remontage de PageContent.
 *
 * registerPage ajoute une page au cache (crée l'élément React une seule fois).
 * Les pages restent montées → state préservé + polling actif.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface CachedPage {
  el: ReactNode
  lastUsed: number
}

interface PageCacheContextValue {
  cache: Map<string, CachedPage>
  /** Ajoute une page au cache (si pas déjà présente). Ne fait rien sinon. */
  registerPage: (pageId: string, el: ReactNode) => void
  /** Marque une page comme utilisée (LRU). */
  touchPage: (pageId: string) => void
}

const PageCacheContext = createContext<PageCacheContextValue | null>(null)

const MAX_CACHED_PAGES = 8

export function PageCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, CachedPage>>(new Map())

  const registerPage = useCallback((pageId: string, el: ReactNode) => {
    setCache((prev) => {
      if (prev.has(pageId)) return prev // déjà cachée, préserver
      const next = new Map(prev)
      next.set(pageId, { el, lastUsed: Date.now() })
      if (next.size > MAX_CACHED_PAGES) {
        let oldestKey: string | null = null
        let oldestTime = Infinity
        for (const [k, v] of next) {
          if (k !== pageId && v.lastUsed < oldestTime) {
            oldestTime = v.lastUsed
            oldestKey = k
          }
        }
        if (oldestKey) next.delete(oldestKey)
      }
      return next
    })
  }, [])

  const touchPage = useCallback((pageId: string) => {
    setCache((prev) => {
      if (!prev.has(pageId)) return prev
      const next = new Map(prev)
      next.get(pageId)!.lastUsed = Date.now()
      return next
    })
  }, [])

  return (
    <PageCacheContext.Provider value={{ cache, registerPage, touchPage }}>
      {children}
    </PageCacheContext.Provider>
  )
}

export function usePageCache() {
  const ctx = useContext(PageCacheContext)
  if (!ctx) {
    throw new Error('usePageCache must be used within PageCacheProvider')
  }
  return ctx
}
