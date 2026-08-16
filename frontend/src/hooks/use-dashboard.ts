// ─────────────────────────────────────────────────────────────
// Hooks TanStack Query pour les dashboards (enseignant + étudiant)
// Cache + dedup + retry automatique + invalidation.
// Pattern aligné sur src/hooks/use-resultats.ts.
//
// Les stats retournées par /api/stats/* contiennent un champ `badges`
// au format "basique" (id, titre, description, unlocked, dateObtention).
// Le frontend IGNORE ce champ basique et utilise le hook useBadges (qui
// appelle /api/badges) pour récupérer les badges au format BadgeWithProgress
// attendu par BadgesCarousel.
// ─────────────────────────────────────────────────────────────

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { BadgeWithProgress } from '@/lib/badges-engine'

// ─── Clés de cache ───

export const dashboardKeys = {
  all: ['dashboard'] as const,
  enseignant: (userId: string) => [...dashboardKeys.all, 'enseignant', userId] as const,
  etudiant: (userId: string) => [...dashboardKeys.all, 'etudiant', userId] as const,
  badges: (userId: string) => [...dashboardKeys.all, 'badges', userId] as const,
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

// ─── Types retournés par les API stats ───

export interface PendingCorrection {
  sessionId: string
  etudiantNom: string
  etudiantEmail: string
  epreuveTitre: string
  questionType: 'QRC' | 'TRS'
  questionPreview: string
  submittedAt: string
}

export interface RecentEpreuve {
  id: string
  titre: string
  statut: string
  nbParticipants: number
  moyenne?: number
  date: string
}

export interface PerformanceData {
  titre: string
  moyenne: number
  tauxReussite: number
}

export interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

export interface EpreuveAVenirEnseignant {
  id: string
  titre: string
  date: string
  dateFin: string
  duree: number
  statut: string
  nbParticipants: number
}

export interface EnseignantStatsData {
  nbDocuments: number
  nbQuestionsTotal: number
  nbEpreuves: number
  nbEpreuvesActives: number
  nbCorrectionsEnAttente: number
  pendingCorrections: PendingCorrection[]
  recentEpreuves: RecentEpreuve[]
  performanceParEpreuve: PerformanceData[]
  evolutionMoyennes: EvolutionMoyenne[]
  epreuvesAVenir: EpreuveAVenirEnseignant[]
  // Le champ badges est présent dans l'API mais sera ignoré par le frontend
  // (cf. commentaire en tête de fichier). On le type en unknown pour le skip.
  badges?: unknown
}

export interface EpreuveAVenirEtudiant {
  id: string
  titre: string
  date: string
  dateFin: string
  duree: number
  enseignant: string
  nbQuestions: number
  totalPoints: number
}

export interface ResultatRecent {
  id: string
  epreuveId: string
  titre: string
  enseignant: string
  date: string
  score: number
  statut: 'SOUMISE' | 'CORRIGEE' | 'RETOURNEE'
  resultat: { scoreFinal: number; totalPossible: number } | null
}

export interface EvolutionScore {
  titre: string
  score: number
  date: string
}

export interface PerformanceType {
  type: 'QCU' | 'QCM' | 'QRC' | 'TRS'
  moyenne: number
  nbReponses: number
}

export interface SessionEnCours {
  id: string
  epreuveId: string
  epreuveTitre: string
  dateDebut: string
}

export interface EtudiantStatsData {
  nbEpreuvesAVenir: number
  nbEpreuvesTerminees: number
  moyenne: number
  meilleureNote: number
  epreuvesAVenir: EpreuveAVenirEtudiant[]
  resultatsRecents: ResultatRecent[]
  evolutionScores: EvolutionScore[]
  performanceParType: PerformanceType[]
  sessionEnCours: SessionEnCours | null
  // Le champ badges est présent dans l'API mais sera ignoré par le frontend.
  badges?: unknown
}

export interface BadgesResponse {
  badges: BadgeWithProgress[]
  stats: {
    total: number
    unlocked: number
    locked: number
    progress: number
  }
  newlyUnlocked: BadgeWithProgress[]
}

// ─── Hook: stats enseignant ───

export function useEnseignantDashboard(userId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.enseignant(userId ?? 'none'),
    queryFn: () => fetchJSON<EnseignantStatsData>('/api/stats/enseignant'),
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 min
    placeholderData: (prev) => prev,
  })
}

// ─── Hook: stats étudiant ───

export function useEtudiantDashboard(userId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.etudiant(userId ?? 'none'),
    queryFn: () => fetchJSON<EtudiantStatsData>('/api/stats/etudiant'),
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 min
    placeholderData: (prev) => prev,
  })
}

// ─── Hook: badges (format BadgeWithProgress) ───

export function useBadges(userId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.badges(userId ?? 'none'),
    queryFn: () => fetchJSON<BadgesResponse>('/api/badges'),
    enabled: !!userId,
    staleTime: 120 * 1000, // 2 min — les badges changent rarement
    placeholderData: (prev) => prev,
  })
}

// ─── Mutation: recalculer les badges (POST /api/badges) ───
// Invalide ensuite la query badges pour rafraîchir l'UI.
// `options.onSuccess` permet au consommateur de réagir aux badges nouvellement
// débloqués (notification, etc.) sans introduire de setState synchrone dans
// un useEffect (interdit par react-hooks/set-state-in-effect).

interface RecalculateBadgesOptions {
  onSuccess?: (data: BadgesResponse) => void
  onError?: (err: Error) => void
}

export function useRecalculateBadges(
  userId: string | undefined,
  options?: RecalculateBadgesOptions,
) {
  const queryClient = useQueryClient()
  return useMutation<BadgesResponse, Error, void>({
    mutationFn: () => fetchJSON<BadgesResponse>('/api/badges', { method: 'POST' }),
    onSuccess: (data) => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: dashboardKeys.badges(userId) })
      }
      options?.onSuccess?.(data)
    },
    onError: (err) => {
      options?.onError?.(err)
    },
  })
}

// ─── Hook: invalidation globale (bouton refresh) ───

export function useRefreshDashboard() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
  }, [queryClient])
}
