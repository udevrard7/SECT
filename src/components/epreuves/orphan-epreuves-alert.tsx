'use client'

/**
 * OrphanEpreuvesAlert
 *
 * Banner alert shown on the Épreuves page when the current user has epreuves
 * that are NOT attached to any UE (uniteEnseignementId = null). Such epreuves
 * cannot produce certificates for their students.
 *
 * Fetches GET /api/epreuves/orphelines on mount and when `refreshKey` changes
 * (so callers can refresh after an action). Renders nothing when there are 0
 * orphelines, or while loading.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useAuthStore } from '@/stores/auth-store'

interface Orpheline {
  id: string
  titre: string
  niveau: string | null
  noteTotal: number
  createdAt: string
  filiere: { id: string; nom: string; code: string | null } | null
  enseignant: { id: string; name: string } | null
  sessionsCount: number
}

export function OrphanEpreuvesAlert({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user } = useAuthStore()
  const [orphelines, setOrphelines] = useState<Orpheline[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const fetchOrphelines = useCallback(async () => {
    try {
      const res = await fetch('/api/epreuves/orphelines', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setOrphelines(Array.isArray(data.orphelines) ? data.orphelines : [])
      }
    } catch {
      // silent — the banner is non-blocking
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrphelines()
  }, [fetchOrphelines, refreshKey])

  // Don't render while loading or when there are no orphans
  if (loading || orphelines.length === 0) return null

  const totalSessions = orphelines.reduce((sum, o) => sum + o.sessionsCount, 0)

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300/60 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-950/30 p-4"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {orphelines.length} épreuve{orphelines.length > 1 ? 's' : ''} sans Unité d&apos;Enseignement
              </p>
              <Badge
                variant="outline"
                className="border-amber-400/50 bg-amber-100/60 text-amber-800 dark:border-amber-600/40 dark:bg-amber-900/40 dark:text-amber-300"
              >
                {totalSessions} session{totalSessions > 1 ? 's' : ''} impactée{totalSessions > 1 ? 's' : ''}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/80">
              Ces épreuves ne sont rattachées à aucune UE : leurs sessions ne peuvent pas générer de
              certificats. Assignez-leur une UE pour corriger cela.
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-xs">{open ? 'Masquer' : 'Détails'}</span>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <ul className="mt-3 space-y-1.5 border-t border-amber-300/40 pt-3 dark:border-amber-700/40">
            {orphelines.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900 dark:text-amber-200"
              >
                <span className="font-medium truncate max-w-[280px]">{o.titre}</span>
                {o.filiere && (
                  <span className="text-amber-700/80 dark:text-amber-400/70">
                    {o.filiere.code ?? o.filiere.nom}
                  </span>
                )}
                {o.niveau && (
                  <span className="text-amber-700/80 dark:text-amber-400/70">{o.niveau}</span>
                )}
                <span className="text-amber-700/70 dark:text-amber-400/60">
                  {o.sessionsCount} session{o.sessionsCount > 1 ? 's' : ''}
                </span>
                {user?.role !== 'ENSEIGNANT' && o.enseignant && (
                  <span className="text-amber-700/70 dark:text-amber-400/60">
                    · {o.enseignant.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** Small inline version: just a count badge, for compact UI areas. */
export function OrphanEpreuvesBadge({ refreshKey = 0 }: { refreshKey?: number }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/epreuves/orphelines', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setCount(d.count ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (count === 0) return null
  return (
    <Badge
      variant="outline"
      className="border-amber-400/50 bg-amber-100/60 text-amber-800 dark:border-amber-600/40 dark:bg-amber-900/40 dark:text-amber-300"
    >
      {count} orpheline{count > 1 ? 's' : ''}
    </Badge>
  )
}
