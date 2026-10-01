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
  StudentSession,
  EtudiantOverviewResponse,
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
        // SECT-ANNEE-HISTOIRE-2 : vue archive — toutes les années explicites.
        `/api/epreuves?enseignantId=${enseignantId}&statut=TERMINEE,CLOTUREE&select=summary&anneeAcademiqueId=all`
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

// ─── Étudiant : tous ses résultats ───
// SECT-ANNEE-DETTES-4 : anneeAcademiqueId optionnel — même contrat serveur
// que /api/epreuves ('' = défaut backend = année courante ; 'all' = toutes
// les années, vue historique ; ID explicite = override).
export function useMesResultats(
  etudiantId: string | undefined | null,
  anneeAcademiqueId?: string
) {
  return useQuery({
    queryKey: [...resultatsKeys.all, 'mes-resultats', etudiantId ?? 'none', anneeAcademiqueId ?? ''],
    queryFn: () => {
      const params = new URLSearchParams({ etudiantId: etudiantId! })
      if (anneeAcademiqueId) params.set('anneeAcademiqueId', anneeAcademiqueId)
      return fetchJSON<{ resultats: StudentSession[] }>(
        `/api/resultats?${params.toString()}`
      ).then((d) => d.resultats)
    },
    enabled: !!etudiantId,
    staleTime: 60 * 1000, // 1 min
    placeholderData: (prev) => prev,
  })
}

// ─── Étudiant : overview cross-exam ───
// SECT-ANNEE-DETTES-4 : anneeAcademiqueId optionnel — miroir useMesResultats
// (l'overview suit la même année que la liste pour rester cohérent).
export function useEtudiantOverview(
  etudiantId: string | undefined | null,
  anneeAcademiqueId?: string
) {
  return useQuery({
    queryKey: [...resultatsKeys.all, 'etudiant-overview', etudiantId ?? 'none', anneeAcademiqueId ?? ''],
    queryFn: () =>
      fetchJSON<EtudiantOverviewResponse>(
        anneeAcademiqueId
          ? `/api/resultats/etudiant-overview?anneeAcademiqueId=${encodeURIComponent(anneeAcademiqueId)}`
          : '/api/resultats/etudiant-overview'
      ),
    enabled: !!etudiantId,
    staleTime: 2 * 60 * 1000, // 2 min
    placeholderData: (prev) => prev,
  })
}

// ─── Étudiant : validations UE (progression par UE) ───
// SECT-ANNEE-DETTES-5 : expose l'historique des validations UE — alimente le
// « Relevé par année » (sessions all groupées + validations groupées) et le
// sélecteur d'année de mes-certificats. Même contrat serveur que
// useMesResultats ('' = défaut backend = année courante ; 'all' = toutes les
// années ; ID explicite = override). La réponse embarque désormais
// anneeAcademiqueId + anneeLibelle par ligne (backend DTTES-5).
export interface MesValidationUE {
  id: string
  etudiantId: string
  uniteEnseignementId: string
  anneeAcademiqueId?: string | null
  anneeLibelle?: string | null
  statut: 'EN_COURS' | 'VALIDEE' | 'NON_VALIDEE'
  moyenneUE: number
  noteNormale?: number | null
  noteRattrapage?: number | null
  noteFinale: number
  nbEpreuvesTotal: number
  nbEpreuvesCompletees: number
  dateValidation?: string | null
  uniteEnseignement?: {
    id: string
    code: string
    nom: string
    creditsECTS?: number | null
  } | null
  certificats?: Array<{ id: string; type?: string; statut?: string }>
}

export function useMesValidationsUE(
  etudiantId: string | undefined | null,
  anneeAcademiqueId?: string
) {
  return useQuery({
    queryKey: [...resultatsKeys.all, 'validations-ue', etudiantId ?? 'none', anneeAcademiqueId ?? ''],
    queryFn: () => {
      const params = new URLSearchParams({ etudiantId: etudiantId! })
      if (anneeAcademiqueId) params.set('anneeAcademiqueId', anneeAcademiqueId)
      return fetchJSON<{ validations: MesValidationUE[] }>(
        `/api/validations-ue?${params.toString()}`
      ).then((d) => d.validations ?? [])
    },
    enabled: !!etudiantId,
    staleTime: 60 * 1000, // 1 min
    placeholderData: (prev) => prev,
  })
}
