'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SECT-ANNEE-MERGE-1 : AnneeAcademiquePage — page unique fusionnant les 2
// modules « Années académiques » (ex-section embarquée dans
// /programme-academique) et « Clôture de l'année » (ex-page /cloture-annee).
//
// Objectif : regrouper dans une seule page /annee-academique la gestion du
// cycle annuel d'un établissement :
//   - Onglet « Années »  → AnneesAcademiquesSection (CRUD complet, filtre
//                          période, comptes, réactivation, hard-delete safe).
//   - Onglet « Clôture » → ClotureAnneePage (workflow 5 étapes, sync route,
//                          overrides, historique des batches).
//
// Raccourcis cross-tab :
//   - Le bouton « Créer une année » (empty state du sélecteur « Année à
//     clôturer ») et le lien « Créer l'année suivante » dans ClotureAnneePage
//     basculent vers l'onglet « Années » via la prop `onSwitchToAnnees`
//     (passée ici). Voir cloture-annee-page.tsx pour le détail du pattern
//     (fallback router.push('/programme-academique') si pas de prop — utile
//     pour les tests E2E qui montent ClotureAnneePage seule).
//
// Badge « Action requise » sur l'onglet Clôture :
//   - Calculé depuis `anneeCourante.dateFin` (GET /api/etablissements/{id}/
//     annee-courante). Si la date de fin de l'année courante est dans le
//     passé, l'année doit être clôturée → on affiche un point d'exclamation
//     rouge sur le trigger « Clôture ». Réutilise les clés TanStack Query
//     `['annees-academiques', etabId]` et `['annee-courante', etabId]` (cache
//     partagé avec AnneesAcademiquesSection → 0 refetch au switch d'onglet).
//
// État au switch d'onglet :
//   - Radix Tabs démonte le TabsContent inactif par défaut. L'état interne
//     de ClotureAnneePage (step, batchId, overrides…) est donc réinitialisé
//     au switch. Le batch async continue en DB côté backend ; au retour sur
//     l'onglet, l'utilisateur doit relancer manuellement la clôture (le
//     polling ne reprend pas automatiquement car batchId est local state).
//     Comportement validé par l'utilisateur (spec SECT-ANNEE-MERGE-1).
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarClock } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'
import { AnneesAcademiquesSection } from './annees-academiques-section'
import { ClotureAnneePage } from './cloture-annee-page'

// ─── Types locaux (miroir léger des réponses API) ───
// On déclare les types minimaux nécessaires au calcul du badge « Action
// requise ». On ne réutilise pas ceux de `annees-academiques-section.tsx`
// (privés au module) pour garder le couplage faible.

interface AnneeAcademiqueRef {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  actif: boolean
}

interface AnneeAcademique {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  etablissementId: string
  actif: boolean
}

type TabValue = 'annees' | 'cloture'

export function AnneeAcademiquePage() {
  // ASSISTANCE-MODE-FRONTEND : user.etablissementId contient l'ID de
  // l'établissement actif pour le RESPONSABLE ET pour l'ADMIN en mode
  // assistance (cf. lib/routes.ts → getEffectiveRole). L'ADMIN global sans
  // etablissementId voit etabId=null → l'onglet « Années » est masqué (la
  // section exige un etablissementId) et l'onglet « Clôture » affiche sa
  // garde interne « Aucun établissement actif » (voir cloture-annee-page.tsx).
  const { user } = useAuthStore()
  const etabId = user?.etablissementId ?? null

  const [activeTab, setActiveTab] = useState<TabValue>('annees')

  // ─── Années académiques + année courante (pour le badge « Action requise ») ───
  // Cache partagé avec AnneesAcademiquesSection et ClotureAnneePage : mêmes
  // queryKey → 0 refetch au switch d'onglet, 0 flash. staleTime 60s cohérent
  // avec annees-academiques-section.tsx.
  const anneesQuery = useQuery<AnneeAcademique[]>({
    queryKey: ['annees-academiques', etabId],
    queryFn: async () => {
      if (!etabId) return []
      const res = await fetch(
        `/api/annees-academiques?etablissementId=${encodeURIComponent(etabId)}`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) throw new Error('Failed to fetch annees')
      return (await res.json()) as AnneeAcademique[]
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const anneeCouranteQuery = useQuery<{ anneeCourante: AnneeAcademiqueRef | null }>({
    queryKey: ['annee-courante', etabId],
    queryFn: async () => {
      if (!etabId) return { anneeCourante: null }
      const res = await fetch(`/api/etablissements/${etabId}/annee-courante`, {
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('Failed to fetch annee courante')
      return (await res.json()) as { anneeCourante: AnneeAcademiqueRef | null }
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Badge « Action requise » ───
  // L'année courante a une dateFin dans le passé → elle doit être clôturée.
  // On évite d'afficher le badge s'il n'y a pas d'année courante (null) ou si
  // la dateFin est invalide (NaN → false). Le badge est purement indicatif :
  // il n'empêche pas de naviguer sur l'onglet « Années ».
  const anneeCourante = anneeCouranteQuery.data?.anneeCourante ?? null
  const hasActionRequired = (() => {
    if (!anneeCourante) return false
    const fin = new Date(anneeCourante.dateFin)
    if (Number.isNaN(fin.getTime())) return false
    return fin.getTime() < Date.now()
  })()

  // Silence le lint sur `anneesQuery` : la query est déclarée pour partager
  // le cache TanStack avec AnneesAcademiquesSection (les mutations de
  // création/édition/suppression invalident `['annees-academiques', etabId]`
  // côté section, et cette query profite du refresh au prochain switch
  // d'onglet). On ne consomme pas directement `anneesQuery.data` ici.
  void anneesQuery

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="annees" className="gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Années
          </TabsTrigger>
          <TabsTrigger value="cloture" className="gap-1.5 relative">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Clôture
            {hasActionRequired && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold h-4 min-w-4 px-1"
                title="L'année courante est terminée — clôture à effectuer"
                aria-label="Action requise : clôture de l'année courante à effectuer"
              >
                !
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="annees" className="mt-6">
          {etabId ? (
            <AnneesAcademiquesSection etablissementId={etabId} />
          ) : (
            // Garde cohérente avec l'ancien bloc {etabId && <AnneesAcademiquesSection />}
            // dans programme-academique-page.tsx : si l'utilisateur n'a pas
            // d'établissement actif (ADMIN global hors assistance), on
            // n'affiche rien plutôt que de planter la section (qui ferait un
            // fetch /api/annees-academiques?etablissementId= → 400/401).
            <div className="text-sm text-muted-foreground">
              Aucun établissement actif. Sélectionnez un établissement via le
              sélecteur d&apos;assistance pour gérer ses années académiques.
            </div>
          )}
        </TabsContent>

        <TabsContent value="cloture" className="mt-6">
          {/* SECT-ANNEE-MERGE-1 : onSwitchToAnnees permet à ClotureAnneePage
              de basculer vers l'onglet « Années » quand l'utilisateur clique
              sur « Créer une année » (empty state) ou « Créer l'année
              suivante » (raccourci), sans navigation router. La page
              ClotureAnneePage garde un fallback router.push pour le cas où
              elle serait montée hors de ce wrapper (tests E2E, etc.). */}
          <ClotureAnneePage onSwitchToAnnees={() => setActiveTab('annees')} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
