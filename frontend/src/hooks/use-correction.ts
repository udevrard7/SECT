// ─────────────────────────────────────────────────────────────
// Hooks TanStack Query pour la page Correction.
// Cache + dedup + retry automatique + invalidation.
// Pattern aligné sur src/hooks/use-resultats.ts et use-dashboard.ts.
//
// Les mutations invalident correctionKeys.all pour rafraîchir
// automatiquement la liste des sessions après chaque action
// (save grade, AI grade, finalize, batch...).
// ─────────────────────────────────────────────────────────────

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CorrectionSession, EpreuveOption } from '@/types/correction'

// ─── Clés de cache ───

export const correctionKeys = {
  all: ['correction'] as const,
  epreuves: (enseignantId: string) => [...correctionKeys.all, 'epreuves', enseignantId] as const,
  sessions: (enseignantId: string, epreuveId: string) =>
    [...correctionKeys.all, 'sessions', enseignantId, epreuveId] as const,
}

// ─── Fetch helper (même pattern que use-resultats.ts) ───

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Erreur ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Types retournés par les API ───

interface EpreuvesResponse {
  epreuves: EpreuveOption[]
}

interface CorrectionSessionsResponse {
  sessions: CorrectionSession[]
}

export interface AiGradeResult {
  // P3-CORRECTION : le backend retourne 202 Accepted (async worker), pas
  // un résultat synchrone. Le frontend doit poller useCorrectionSessions
  // jusqu'à ce que noteIA soit non-null sur la reponse.
  status: string
  message: string
  jobCount?: number
  sessionId?: string
}

export interface FinalizeResult {
  score: number
  totalPossible: number
  percentage: number
  message: string
  statut: string
}

export interface BatchAiGradeResult {
  graded: number
  total: number
  errors?: string[]
  message: string
}

export interface BatchReturnResult {
  returned: number
  total: number
  message: string
}

// ─── Hooks GET ───

/**
 * Liste des épreuves éligibles à la correction (EN_COURS, TERMINEE, CLOTUREE)
 * pour un enseignant donné. Le filtre de statut est appliqué côté hook.
 */
export function useEpreuvesForCorrection(enseignantId: string | undefined) {
  return useQuery<EpreuveOption[]>({
    queryKey: correctionKeys.epreuves(enseignantId ?? ''),
    queryFn: async () => {
      const data = await fetchJSON<EpreuvesResponse>(`/api/epreuves?enseignantId=${enseignantId}`)
      return (data.epreuves ?? []).filter((e) =>
        ['EN_COURS', 'TERMINEE', 'CLOTUREE'].includes(e.statut)
      )
    },
    enabled: !!enseignantId,
    staleTime: 60_000, // 1 min
    placeholderData: (prev) => prev,
  })
}

/**
 * Liste des sessions de correction pour un enseignant + une épreuve.
 */
export function useCorrectionSessions(enseignantId: string | undefined, epreuveId: string | undefined) {
  return useQuery<CorrectionSession[]>({
    queryKey: correctionKeys.sessions(enseignantId ?? '', epreuveId ?? ''),
    queryFn: async () => {
      const data = await fetchJSON<CorrectionSessionsResponse>(
        `/api/correction?enseignantId=${enseignantId}&epreuveId=${epreuveId}`
      )
      return data.sessions ?? []
    },
    enabled: !!enseignantId && !!epreuveId,
    staleTime: 30_000, // 30 s (données plus volatiles que la liste d'épreuves)
    placeholderData: (prev) => prev,
    // P3-CORRECTION : polling IA — refetch toutes les 3s si au moins une
    // reponse a noteIA === null (worker en cours). Le worker CorrectionWorker
    // écrit noteIA + justificationIA quand il termine.
    refetchInterval: (query) => {
      const sessions = query.state.data
      if (!sessions) return false
      const hasPendingIA = sessions.some(s =>
        s.reponses?.some(r => r.noteIA === null && r.contenu)
      )
      return hasPendingIA ? 3000 : false
    },
  })
}

// ─── Hooks MUTATION ───
// Tous invalident correctionKeys.all en onSuccess pour rafraîchir la liste
// des sessions automatiquement (remplace les anciens `await fetchSessions()`).

/**
 * Correction IA unitaire : POST /api/correction/[sessionId]/ai-grade { questionId }
 */
export function useAiGrade() {
  const qc = useQueryClient()
  return useMutation<AiGradeResult, Error, { sessionId: string; questionId: string }>({
    mutationFn: ({ sessionId, questionId }) =>
      fetchJSON<AiGradeResult>(`/api/correction/${sessionId}/ai-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: correctionKeys.all })
    },
  })
}

/**
 * Sauvegarde / application d'une note : PATCH /api/correction/[sessionId]/ai-grade
 * { questionId, score, commentaire }
 * Utilisé pour : save manuel, apply AI suggestion, horizontal save.
 */
export function useSaveGrade() {
  const qc = useQueryClient()
  return useMutation<
    unknown,
    Error,
    { sessionId: string; questionId: string; score: number | null; commentaire: string | null }
  >({
    mutationFn: ({ sessionId, questionId, score, commentaire }) =>
      fetchJSON(`/api/correction/${sessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, score, commentaire }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: correctionKeys.all })
    },
  })
}

/**
 * Finalisation + retour copie : PATCH /api/correction/[sessionId]/ai-grade
 * { finalizeAll: true }
 */
export function useFinalizeSession() {
  const qc = useQueryClient()
  return useMutation<FinalizeResult, Error, { sessionId: string }>({
    mutationFn: ({ sessionId }) =>
      fetchJSON<FinalizeResult>(`/api/correction/${sessionId}/ai-grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalizeAll: true }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: correctionKeys.all })
    },
  })
}

/**
 * Correction IA batch d'une session : POST /api/correction/[sessionId]/ai-grade-batch
 */
export function useBatchAiGrade() {
  const qc = useQueryClient()
  return useMutation<BatchAiGradeResult, Error, { sessionId: string }>({
    mutationFn: ({ sessionId }) =>
      fetchJSON<BatchAiGradeResult>(`/api/correction/${sessionId}/ai-grade-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: correctionKeys.all })
    },
  })
}

/**
 * Retour batch des copies corrigées : POST /api/correction/retourner-batch { epreuveId }
 */
export function useBatchReturn() {
  const qc = useQueryClient()
  return useMutation<BatchReturnResult, Error, { epreuveId: string }>({
    mutationFn: ({ epreuveId }) =>
      fetchJSON<BatchReturnResult>('/api/correction/retourner-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epreuveId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: correctionKeys.all })
    },
  })
}

/**
 * Invalide toutes les queries correction (bouton refresh global).
 */
export function useRefreshCorrection() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: correctionKeys.all })
}
