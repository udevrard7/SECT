'use client'

/**
 * PageCacheProvider — cache keep-alive des pages pour éviter le remontage
 * et le refetch systématique à chaque navigation.
 *
 * BUGFIX (KEEPALIVE-PAGES-1) : Next.js App Router avec catch-all route
 * [...slug] remonte AuthenticatedLayout → PageContent à chaque navigation.
 * Le cache useRef dans PageContent était perdu à chaque remontage.
 *
 * Solution : le cache vit dans Providers (qui ne se remonte jamais) via
 * un Context. PageContent consomme le cache et y enregistre ses pages.
 * Les pages restent montées en display:none, retrouvant leur state au retour.
 */

import { createContext, useContext, useRef, useState, type ReactNode } from 'react'

interface CachedPage {
  el: ReactNode
  lastUsed: number
}

interface PageCacheContextValue {
  cache: Map<string, CachedPage>
  /** Ajoute/met à jour une page dans le cache. Si createEl est fourni et que
   *  la page n'est pas encore cachée, l'élément React est créé et stocké. */
  touch: (pageId: string, createEl?: () => ReactNode) => void
}

const PageCacheContext = createContext<PageCacheContextValue | null>(null)

const MAX_CACHED_PAGES = 8

export function PageCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, CachedPage>>(new Map())

  const touch = (pageId: string, createEl?: () => ReactNode) => {
    setCache((prev) => {
      const next = new Map(prev)
      if (next.has(pageId)) {
        // Page déjà cachée : juste update lastUsed (el déjà présent)
        next.get(pageId)!.lastUsed = Date.now()
      } else if (createEl) {
        // Nouvelle page : créer l'élément React une seule fois
        next.set(pageId, {
          el: createEl(),
          lastUsed: Date.now(),
        })
      }
      // Évicter la plus ancienne si dépassement
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
  }

  return (
    <PageCacheContext.Provider value={{ cache, touch }}>
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
