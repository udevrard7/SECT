'use client'

/**
 * AnneesAcademiquesSection — Gestion des années académiques.
 *
 * PROG-ACAD-CRITICAL-FIX-1 (BUG #10) : avant, il n'y avait aucune UI pour
 * gérer les années académiques (seulement GET list + POST). Maintenant :
 * CRUD complet avec création, modification, désactivation.
 *
 * ANNEE-COURANTE-FE-1 (Niveau 2) : exploitation des endpoints
 * `/api/etablissements/{id}/annee-courante` (GET + POST) issus de la
 * migration DB 000017. Ajouts :
 *   - Badge « Courante » sur l'année courante de l'établissement (+ ds-glow-gold).
 *   - Badge période calculé (Passée / Active / À venir) depuis dateDebut/dateFin.
 *   - Bouton « Définir comme courante » sur chaque année active non courante.
 *   - Suggestions auto à la création (libellé + dates) basées sur la dernière année.
 *   - Toast sonner avec action « Définir comme courante ? » après création si
 *     aucune année courante n'est définie.
 *   - Toggle « Afficher les années inactives » (cohérent avec /programme-academique).
 *
 * Endpoints :
 *   GET    /api/annees-academiques?etablissementId=X
 *   POST   /api/annees-academiques
 *   PATCH  /api/annees-academiques/{id}
 *   DELETE /api/annees-academiques/{id} (soft delete: actif=false)
 *   GET    /api/etablissements/{id}/annee-courante  → { anneeCourante: AnneeAcademiqueRef | null }
 *   POST   /api/etablissements/{id}/annee-courante  body { anneeId } → { message, etablissement }
 *
 * DS Savane EdTech : cards avec motif kente (ds-kente-top), lueur or sur
 * l'année courante (ds-glow-gold), PulseSkeleton, toasts sonner, animations
 * Framer Motion. Tokens sémantiques (bg-success/15, text-success-text,
 * border-info/30…) — jamais de hex brut.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, X, CalendarDays, Star, Power,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AnneeAcademique {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  etablissementId: string
  actif: boolean
  createdAt: string
  updatedAt: string
}

// Référence légère renvoyée par GET /api/etablissements/{id}/annee-courante.
// Mirroir du domain.AnneeAcademiqueRef côté backend (migration 000017).
interface AnneeAcademiqueRef {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  actif: boolean
}

interface Props {
  etablissementId: string
}

// ─── Helpers ───

type PeriodeStatut = 'past' | 'active' | 'future'

/** Calcule le statut de période d'une année (Passée/Active/À venir) vs now. */
function computePeriodeStatut(dateDebut: string, dateFin: string): PeriodeStatut {
  const now = new Date()
  const debut = new Date(dateDebut)
  const fin = new Date(dateFin)
  if (now > fin) return 'past'
  if (now < debut) return 'future'
  return 'active'
}

/** Badge période (Passée/Active/À venir) — calculé depuis les dates. */
function PeriodeBadge({ statut }: { statut: PeriodeStatut }) {
  if (statut === 'past') {
    return (
      <Badge className="bg-muted text-muted-foreground text-[10px] shrink-0">
        Passée
      </Badge>
    )
  }
  if (statut === 'active') {
    return (
      <Badge className="bg-success/15 text-success-text border-success/30 text-[10px] gap-1 shrink-0">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        Active
      </Badge>
    )
  }
  return (
    <Badge className="bg-info/15 text-info border-info/30 text-[10px] gap-1 shrink-0">
      <Calendar className="h-3 w-3" aria-hidden="true" />
      À venir
    </Badge>
  )
}

/**
 * Calcule les suggestions pour la prochaine année académique, basées sur
 * l'année existante avec la dateFin la plus récente.
 *
 * Ex : si la dernière année est 2025-2026 (dateDebut 2025-09-01),
 * suggère 2026-2027 avec dateDebut 2026-09-01 et dateFin 2027-08-31.
 *
 * Retourne null si la liste est vide ou si les dates sont inexploitables.
 */
function computeNextYearSuggestions(
  annees: AnneeAcademique[]
): { libelle: string; dateDebut: string; dateFin: string } | null {
  if (annees.length === 0) return null
  const sorted = [...annees].sort(
    (a, b) => new Date(b.dateFin).getTime() - new Date(a.dateFin).getTime()
  )
  const mostRecent = sorted[0]
  const lastYear = new Date(mostRecent.dateDebut).getFullYear()
  if (Number.isNaN(lastYear)) return null
  return {
    libelle: `${lastYear + 1}-${lastYear + 2}`,
    dateDebut: `${lastYear + 1}-09-01`,
    dateFin: `${lastYear + 2}-08-31`,
  }
}

// ─── Composant principal ───

export function AnneesAcademiquesSection({ etablissementId }: Props) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingAnnee, setEditingAnnee] = useState<AnneeAcademique | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AnneeAcademique | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // ─── Liste des années (TanStack Query) ───
  const anneesQuery = useQuery<AnneeAcademique[]>({
    queryKey: ['annees-academiques', etablissementId],
    queryFn: async () => {
      const res = await fetch(`/api/annees-academiques?etablissementId=${etablissementId}`)
      if (!res.ok) throw new Error('Failed to fetch annees')
      return (await res.json()) as AnneeAcademique[]
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const annees = anneesQuery.data ?? []
  const isRefreshing = anneesQuery.isFetching

  // ─── Année courante de l'établissement (migration 000017) ───
  const anneeCouranteQuery = useQuery<{ anneeCourante: AnneeAcademiqueRef | null }>({
    queryKey: ['annee-courante', etablissementId],
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${etablissementId}/annee-courante`)
      if (!res.ok) throw new Error('Failed to fetch annee courante')
      return (await res.json()) as { anneeCourante: AnneeAcademiqueRef | null }
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const anneeCouranteId = anneeCouranteQuery.data?.anneeCourante?.id ?? null

  // ─── Suggestions pour la création (prochaine année) ───
  const suggestions = useMemo(() => computeNextYearSuggestions(annees), [annees])

  // ─── Filtrage des inactives ───
  const hasInactive = annees.some((a) => !a.actif)
  const visibleAnnees = showInactive ? annees : annees.filter((a) => a.actif)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })
    queryClient.invalidateQueries({ queryKey: ['annee-courante', etablissementId] })
  }

  // ─── Mutation : définir l'année courante (POST /annee-courante) ───
  const setCurrentAnneeMutation = useMutation<void, Error, string>({
    mutationFn: async (anneeId: string) => {
      const res = await fetch(`/api/etablissements/${etablissementId}/annee-courante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anneeId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error || 'Échec de la mise à jour')
      }
    },
    onSuccess: () => {
      toast.success('Année courante mise à jour')
      queryClient.invalidateQueries({ queryKey: ['annee-courante', etablissementId] })
      queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : créer ───
  const createMutation = useMutation<
    AnneeAcademique,
    Error,
    { libelle: string; dateDebut: string; dateFin: string }
  >({
    mutationFn: async (input) => {
      const res = await fetch('/api/annees-academiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, etablissementId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error || 'Échec de la création')
      }
      return (await res.json()) as AnneeAcademique
    },
    onSuccess: (data) => {
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })
      // Proposition auto « Définir comme courante ? » si aucune courante définie.
      if (anneeCouranteId === null) {
        toast.success('Année académique créée', {
          description: 'Voulez-vous la définir comme année courante ?',
          action: {
            label: 'Définir',
            onClick: () => setCurrentAnneeMutation.mutate(data.id),
          },
        })
      } else {
        toast.success('Année académique créée')
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : modifier ───
  const updateMutation = useMutation<
    AnneeAcademique,
    Error,
    { id: string; input: Partial<{ libelle: string; dateDebut: string; dateFin: string }> }
  >({
    mutationFn: async ({ id, input }) => {
      const res = await fetch(`/api/annees-academiques/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error || 'Échec de la modification')
      }
      return (await res.json()) as AnneeAcademique
    },
    onSuccess: () => {
      toast.success('Année académique modifiée')
      setEditingAnnee(null)
      queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : désactiver ───
  const deleteMutation = useMutation<{ message?: string }, Error, string>({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/annees-academiques/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error || 'Échec de la désactivation')
      }
      return (await res.json().catch(() => ({}))) as { message?: string }
    },
    onSuccess: () => {
      toast.success('Année académique désactivée')
      setConfirmDelete(null)
      queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Loading ───
  if (anneesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary-text" />
            Années académiques
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (anneesQuery.isError) {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-text" />
          Années académiques
        </h3>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium">Erreur de chargement</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refresh()}>
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-text" />
          Années académiques
          <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary-text">
            {annees.length}
          </Badge>
        </h3>
        <div className="flex items-center gap-2">
          {/* Toggle « Afficher les années inactives » — cohérent avec
              /programme-academique. Par défaut masquées pour ne pas polluer
              la liste avec des années archivées. N'apparaît que s'il existe
              au moins une année inactive. */}
          {hasInactive && (
            <label
              htmlFor="show-inactive-annees"
              className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Afficher les années désactivées"
            >
              <Switch
                id="show-inactive-annees"
                checked={showInactive}
                onCheckedChange={setShowInactive}
                aria-label="Afficher les années inactives"
              />
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Afficher inactives</span>
            </label>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="gap-1.5"
            aria-label="Actualiser"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouvelle année</span>
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {annees.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-7 w-7 text-primary-text" />
            </div>
            <p className="mt-3 text-sm font-medium">Aucune année académique</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Créez votre première année académique pour organiser vos épreuves et affectations.
            </p>
          </CardContent>
        </Card>
      ) : visibleAnnees.length === 0 ? (
        // Toutes les années sont inactives et le toggle est off.
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Power className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              Toutes les années sont désactivées.
            </p>
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0"
              onClick={() => setShowInactive(true)}
            >
              Afficher les années inactives
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {visibleAnnees.map((annee, i) => {
              const isCourante = anneeCouranteId === annee.id
              const periode = computePeriodeStatut(annee.dateDebut, annee.dateFin)
              const isSettingCourante =
                setCurrentAnneeMutation.variables === annee.id &&
                setCurrentAnneeMutation.isPending

              return (
                <motion.div
                  key={annee.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  <Card
                    className={cn(
                      'h-full ds-kente-top transition-shadow',
                      !annee.actif && 'opacity-60',
                      isCourante && 'ds-glow-gold border-success/40'
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Row 1 : libellé + badge courante */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm truncate min-w-0">
                          {annee.libelle}
                        </p>
                        {isCourante && (
                          <Badge
                            role="status"
                            className="bg-success/15 text-success-text border-success/30 text-[10px] gap-1 shrink-0"
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Courante
                          </Badge>
                        )}
                      </div>

                      {/* Row 2 : dates + badge période */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground min-w-0 truncate">
                          {new Date(annee.dateDebut).toLocaleDateString('fr-FR')}
                          {' → '}
                          {new Date(annee.dateFin).toLocaleDateString('fr-FR')}
                        </p>
                        <PeriodeBadge statut={periode} />
                      </div>

                      {/* Row 3 : actions */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {annee.actif && !isCourante && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 gap-1 text-xs flex-1 justify-center"
                            onClick={() => setCurrentAnneeMutation.mutate(annee.id)}
                            disabled={setCurrentAnneeMutation.isPending}
                            aria-label={`Définir ${annee.libelle} comme année courante`}
                          >
                            {isSettingCourante ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Star className="h-3 w-3" aria-hidden="true" />
                            )}
                            <span className="truncate">Définir courante</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-7 gap-1 text-xs',
                            !(annee.actif && !isCourante) && 'flex-1 justify-center'
                          )}
                          onClick={() => setEditingAnnee(annee)}
                          aria-label={`Modifier ${annee.libelle}`}
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span
                            className={cn(
                              annee.actif && !isCourante ? 'hidden sm:inline' : 'inline'
                            )}
                          >
                            Modifier
                          </span>
                        </Button>
                        {annee.actif && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 text-xs text-destructive hover:text-destructive hover:bg-destructive/5"
                            onClick={() => setConfirmDelete(annee)}
                            aria-label={`Désactiver ${annee.libelle}`}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Dialog : créer */}
      {showForm && (
        <AnneeFormDialog
          title="Nouvelle année académique"
          suggestions={suggestions}
          onClose={() => setShowForm(false)}
          onSubmit={(input) => createMutation.mutate(input)}
          loading={createMutation.isPending}
        />
      )}

      {/* Dialog : modifier */}
      {editingAnnee && (
        <AnneeFormDialog
          title="Modifier l'année académique"
          initial={editingAnnee}
          onClose={() => setEditingAnnee(null)}
          onSubmit={(input) => updateMutation.mutate({ id: editingAnnee.id, input })}
          loading={updateMutation.isPending}
        />
      )}

      {/* Dialog : confirmer désactivation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Désactiver l'année académique ?"
          message={`« ${confirmDelete.libelle} » sera marquée comme inactive. Vous pourrez la réactiver si besoin.`}
          confirmLabel="Désactiver"
          loading={deleteMutation.isPending}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        />
      )}
    </div>
  )
}

// ─── Form Dialog (créer / modifier) ───

function AnneeFormDialog({
  title,
  initial,
  suggestions,
  onClose,
  onSubmit,
  loading,
}: {
  title: string
  initial?: AnneeAcademique
  /** Suggestions auto (mode création uniquement) : pré-remplit les champs
   *  avec la prochaine année académique calculée depuis la liste existante. */
  suggestions?: { libelle: string; dateDebut: string; dateFin: string } | null
  onClose: () => void
  onSubmit: (input: { libelle: string; dateDebut: string; dateFin: string }) => void
  loading: boolean
}) {
  // En mode édition (initial fourni) → on charge les valeurs de l'année.
  // En mode création (pas d'initial) → on utilise les suggestions si dispo.
  const [libelle, setLibelle] = useState(
    initial?.libelle ?? suggestions?.libelle ?? ''
  )
  const [dateDebut, setDateDebut] = useState(
    initial
      ? new Date(initial.dateDebut).toISOString().slice(0, 10)
      : suggestions?.dateDebut ?? ''
  )
  const [dateFin, setDateFin] = useState(
    initial
      ? new Date(initial.dateFin).toISOString().slice(0, 10)
      : suggestions?.dateFin ?? ''
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!libelle.trim() || !dateDebut || !dateFin) {
      toast.error('Tous les champs sont requis')
      return
    }
    if (new Date(dateDebut) >= new Date(dateFin)) {
      toast.error('La date de fin doit être après la date de début')
      return
    }
    onSubmit({ libelle: libelle.trim(), dateDebut, dateFin })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border p-6 ds-kente-top"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0" aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Libellé</label>
            <Input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="ex: 2025-2026"
              className="mt-1"
              autoFocus
            />
            {!initial && suggestions && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Suggestion basée sur la dernière année. Modifiable librement.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Date début</label>
              <Input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Date fin</label>
              <Input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {initial ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Confirm Dialog (désactiver) ───

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onClose,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel: string
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={loading} className="gap-1.5">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
