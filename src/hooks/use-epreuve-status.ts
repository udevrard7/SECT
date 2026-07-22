'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * useEpreuveStatus — polling dynamique du statut d'une épreuve en cours de
 * génération IA.
 *
 * IA-WORKER-1 : le polling s'active UNIQUEMENT si le statut est "EN_COURS",
 * toutes les 3 secondes. Dès que le statut passe à "TERMINE" ou "ERREUR",
 * le polling s'arrête automatiquement (refetchInterval retourne false).
 *
 * Usage :
 *   const { data, isPolling } = useEpreuveStatus(epreuveId, 'EN_COURS')
 *   // data.status = 'EN_COURS' | 'TERMINE' | 'ERREUR'
 *   // data.contenu = { questions, consignes, baremeTotal } (si TERMINE)
 */

export interface EpreuveStatus {
  status: 'EN_COURS' | 'TERMINE' | 'ERREUR' | 'BROUILLON'
  contenu?: {
    questions: unknown[]
    consignes: string
    baremeTotal: number
  }
  erreur?: string
  updatedAt?: string
}

export function useEpreuveStatus(epreuveId: string | null, initialStatus?: string) {
  const query = useQuery<EpreuveStatus>({
    queryKey: ['epreuve-status', epreuveId],
    queryFn: async () => {
      if (!epreuveId) throw new Error('epreuveId requis')
      const res = await fetch(`/api/epreuves/${epreuveId}/status`)
      if (!res.ok) throw new Error('Erreur lors du fetch du statut')
      return res.json()
    },
    enabled: !!epreuveId,
    // Le polling s'active UNIQUEMENT si le statut est EN_COURS
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status ?? initialStatus ?? 'EN_COURS'
      return currentStatus === 'EN_COURS' ? 3000 : false // 3s ou désactivé
    },
    refetchOnWindowFocus: false,
  })

  return {
    ...query,
    data: query.data,
    isPolling: query.data?.status === 'EN_COURS',
    isDone: query.data?.status === 'TERMINE',
    isError: query.data?.status === 'ERREUR',
  }
}
