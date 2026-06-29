'use client'

/**
 * AnneesAcademiquesSection — Gestion des années académiques.
 *
 * PROG-ACAD-CRITICAL-FIX-1 (BUG #10) : avant, il n'y avait aucune UI pour
 * gérer les années académiques (seulement GET list + POST). Maintenant :
 * CRUD complet avec création, modification, désactivation.
 *
 * Endpoints :
 *   GET    /api/annees-academiques?etablissementId=X
 *   POST   /api/annees-academiques
 *   PATCH  /api/annees-academiques/{id}
 *   DELETE /api/annees-academiques/{id} (soft delete: actif=false)
 *
 * DS Savane EdTech : cards avec motif kente, StatCard, PulseSkeleton,
 * toasts sonner, animations Framer Motion.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, X, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

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

interface Props {
  etablissementId: string
}

export function AnneesAcademiquesSection({ etablissementId }: Props) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingAnnee, setEditingAnnee] = useState<AnneeAcademique | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AnneeAcademique | null>(null)

  // ─── Liste des années (TanStack Query) ───
  const anneesQuery = useQuery<AnneeAcademique[]>({
    queryKey: ['annees-academiques', etablissementId],
    queryFn: async () => {
      const res = await fetch(`/api/annees-academiques?etablissementId=${etablissementId}`)
      if (!res.ok) throw new Error('Failed to fetch annees')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const annees = anneesQuery.data ?? []
  const isRefreshing = anneesQuery.isFetching

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['annees-academiques', etablissementId] })

  // ─── Mutation : créer ───
  const createMutation = useMutation({
    mutationFn: async (input: { libelle: string; dateDebut: string; dateFin: string }) => {
      const res = await fetch('/api/annees-academiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, etablissementId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Échec de la création')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Année académique créée')
      setShowForm(false)
      refresh()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : modifier ───
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<{ libelle: string; dateDebut: string; dateFin: string }> }) => {
      const res = await fetch(`/api/annees-academiques/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Échec de la modification')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Année académique modifiée')
      setEditingAnnee(null)
      refresh()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : désactiver ───
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/annees-academiques/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Échec de la désactivation')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Année académique désactivée')
      setConfirmDelete(null)
      refresh()
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
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-text" />
          Années académiques
          <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary-text">
            {annees.length}
          </Badge>
        </h3>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="gap-1.5"
            aria-label="Actualiser"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {annees.map((annee, i) => (
              <motion.div
                key={annee.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
              >
                <Card className={`h-full ${!annee.actif ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{annee.libelle}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(annee.dateDebut).toLocaleDateString('fr-FR')}
                          {' → '}
                          {new Date(annee.dateFin).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <Badge
                        variant={annee.actif ? 'default' : 'secondary'}
                        className={`text-[10px] shrink-0 ${annee.actif ? 'bg-success/15 text-success-text' : 'bg-muted'}`}
                      >
                        {annee.actif ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs flex-1"
                        onClick={() => setEditingAnnee(annee)}
                      >
                        <Pencil className="h-3 w-3" />
                        Modifier
                      </Button>
                      {annee.actif && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/5"
                          onClick={() => setConfirmDelete(annee)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Dialog : créer */}
      {showForm && (
        <AnneeFormDialog
          title="Nouvelle année académique"
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
  onClose,
  onSubmit,
  loading,
}: {
  title: string
  initial?: AnneeAcademique
  onClose: () => void
  onSubmit: (input: { libelle: string; dateDebut: string; dateFin: string }) => void
  loading: boolean
}) {
  const [libelle, setLibelle] = useState(initial?.libelle ?? '')
  const [dateDebut, setDateDebut] = useState(
    initial ? new Date(initial.dateDebut).toISOString().slice(0, 10) : ''
  )
  const [dateFin, setDateFin] = useState(
    initial ? new Date(initial.dateFin).toISOString().slice(0, 10) : ''
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
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
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
