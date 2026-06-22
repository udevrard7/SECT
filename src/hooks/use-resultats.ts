// ─────────────────────────────────────────────────────────────
// Hooks TanStack Query pour les Résultats & Analyses
// Cache + dedup + retry automatique + invalidation
// ─────────────────────────────────────────────────────────────

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type {
  EpreuveSummary,
  ExamResultsResponse,
  OverviewResponse,
} from '@/types/resultats'

// ─── Clés de cache ───

export const resultatsKeys = {
  all: ['resultats'] as const,
  epreuves: (enseignantId: string) => [...resultatsKeys.all, 'epreuves', enseignantId] as const,
  overview: (enseignantId: string) => [...resultatsKeys.all, 'overview', enseignantId] as const,
  examResults: (epreuveId: string, page?: number, limit?: number) =>
    [...resultatsKeys.all, 'exam', epreuveId, { page, limit }] as const,
}

// ─── Fetch helper ───

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Erreur ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Hook: liste des épreuves terminées/clôturées (léger) ───

export function useEpreuvesTerminees(enseignantId: string | undefined | null) {
  return useQuery({
    queryKey: resultatsKeys.epreuves(enseignantId ?? 'none'),
    queryFn: () =>
      fetchJSON<{ epreuves: EpreuveSummary[] }>(
        `/api/epreuves?enseignantId=${enseignantId}&statut=TERMINEE,CLOTUREE&select=summary`
      ).then((d) => d.epreuves),
    enabled: !!enseignantId,
    staleTime: 5 * 60 * 1000, // 5 min — la liste ne change pas souvent
    placeholderData: (prev) => prev,
  })
}

// ─── Hook: overview cross-exam ───

export function useResultatsOverview(enseignantId: string | undefined | null) {
  return useQuery({
    queryKey: resultatsKeys.overview(enseignantId ?? 'none'),
    queryFn: () => fetchJSON<OverviewResponse>('/api/resultats/overview'),
    enabled: !!enseignantId,
    staleTime: 2 * 60 * 1000, // 2 min
    placeholderData: (prev) => prev,
  })
}

// ─── Hook: résultats d'une épreuve (avec pagination optionnelle) ───

export function useExamResults(
  epreuveId: string | undefined | null,
  options?: { page?: number; limit?: number; enabled?: boolean }
) {
  const { page, limit, enabled = true } = options ?? {}
  return useQuery({
    queryKey: resultatsKeys.examResults(epreuveId ?? 'none', page, limit),
    queryFn: () => {
      const params = new URLSearchParams({ epreuveId: epreuveId! })
      if (page) params.set('page', String(page))
      if (limit) params.set('limit', String(limit))
      return fetchJSON<ExamResultsResponse>(`/api/resultats?${params.toString()}`)
    },
    enabled: !!epreuveId && enabled,
    staleTime: 60 * 1000, // 1 min
    placeholderData: (prev) => prev, // garde les anciennes données pendant le refetch
  })
}

// ─── Hook: invalidation manuelle (bouton refresh) ───

export function useRefreshResultats() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: resultatsKeys.all })
  }, [queryClient])
}
