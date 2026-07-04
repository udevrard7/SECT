'use client'

// ─────────────────────────────────────────────────────────────
// ModerationPanel — Dialog de modération des messages signalés.
//
// Réservé RESPONSABLE/ADMIN. Affiche la liste des signalements avec :
//   - Filtre par statut (Tous, OUVERT, EN_COURS, RESOLU, REJETE)
//   - Pour chaque signalement : message signalé, auteur, signalé par,
//     raison, commentaire, date
//   - Actions : Marquer EN_COURS, RESOLU, REJETE + Masquer le message
//     (soft-delete via useDeleteMessage)
//
// Utilise :
//   - useListSignalements(statut) — liste avec polling 30s
//   - useResolveSignalement() — change le statut
//   - useDeleteMessage() — soft-delete du message signalé
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ds'
import {
  ShieldAlert,
  Flag,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from './confirm-dialog'
import {
  useListSignalements,
  useResolveSignalement,
  useDeleteMessage,
} from '@/hooks/use-messagerie'
import type {
  MessageSignalement,
  SignalementStatut,
  SignalementRaison,
} from '@/types/messagerie'

export interface ModerationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Libellés des raisons de signalement. */
const RAISON_LABELS: Record<SignalementRaison, string> = {
  HARCELEMENT: 'Harcèlement',
  SPAM: 'Spam',
  CONTENU_INAPPROPRIE: 'Contenu inapproprié',
  AUTRE: 'Autre',
}

/** Libellés + couleurs des statuts de signalement. */
const STATUT_META: Record<
  SignalementStatut,
  { label: string; variant: 'danger' | 'warning' | 'success' | 'default' }
> = {
  OUVERT: { label: 'Ouvert', variant: 'danger' },
  EN_COURS: { label: 'En cours', variant: 'warning' },
  RESOLU: { label: 'Résolu', variant: 'success' },
  REJETE: { label: 'Rejeté', variant: 'default' },
}

/** Formate une date ISO en date lisible. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type FilterStatut = 'ALL' | SignalementStatut

const FILTER_TABS: { key: FilterStatut; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'OUVERT', label: 'Ouverts' },
  { key: 'EN_COURS', label: 'En cours' },
  { key: 'RESOLU', label: 'Résolus' },
  { key: 'REJETE', label: 'Rejetés' },
]

export function ModerationPanel({ open, onOpenChange }: ModerationPanelProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterStatut>('OUVERT')

  const statutParam = filter === 'ALL' ? null : filter
  const { data: signalements, isLoading } = useListSignalements(statutParam)
  const resolveSignalement = useResolveSignalement()
  // useDeleteMessage nécessite un conversationId, mais on n'a pas accès à la
  // conversation du message signalé ici. On utilise fetch direct.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Modale de confirmation in-app (remplace window.confirm natif).
  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const handleResolve = useCallback(
    async (signalementId: string, statut: SignalementStatut) => {
      try {
        await resolveSignalement.mutateAsync({ signalementId, statut })
        toast.success('Signalement mis à jour', {
          description: `Statut : ${STATUT_META[statut].label}`,
        })
      } catch (err) {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Échec de la mise à jour.',
        })
      }
    },
    [resolveSignalement]
  )

  const handleDeleteMessage = useCallback(
    async (messageId: string, signalementId?: string) => {
      // Modale in-app (remplace window.confirm natif navigateur).
      const ok = await confirm({
        title: 'Masquer ce message ?',
        description:
          'Le message sera soft-deleté pour TOUS les utilisateurs. Si un signalement est associé, il sera automatiquement résolu.',
        confirmLabel: 'Masquer le message',
        cancelLabel: 'Annuler',
        destructive: true,
      })
      if (!ok) return
      setDeletingId(messageId)
      try {
        const res = await fetch(`/api/messagerie/messages/${messageId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || `Erreur ${res.status}`)
        }
        // MESSAGERIE-MODERATION-AUTO : résoudre automatiquement le signalement
        // associé (statut RESOLU) pour le retirer de la liste "Ouverts".
        if (signalementId) {
          try {
            await resolveSignalement.mutateAsync({
              signalementId,
              statut: 'RESOLU',
            })
          } catch {
            // Best-effort : si la résolution échoue, le message est quand même
            // soft-deleté. Le signalement sera filtré côté backend (ListSignalements
            // exclut les OUVERT/EN_COURS dont le message est deletedAt IS NOT NULL).
          }
        }
        toast.success('Message masqué', {
          description: 'Le message a été soft-deleté et le signalement résolu.',
        })
        // Invalider toutes les queries messagerie (messages + signalements).
        queryClient.invalidateQueries({ queryKey: ['messagerie'] })
      } catch (err) {
        toast.error('Erreur', {
          description: err instanceof Error ? err.message : 'Impossible de masquer le message.',
        })
      } finally {
        setDeletingId(null)
      }
    },
    [confirm, queryClient, resolveSignalement]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Modération des messages
            {signalements && signalements.length > 0 && (
              <Badge variant="danger" size="sm">
                {signalements.length}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Filtres par statut */}
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Note de rétention */}
        <p className="shrink-0 text-[10px] text-muted-foreground/70 italic">
          Les signalements résolus et rejetés sont automatiquement supprimés après 7 jours.
        </p>

        {/* Liste des signalements */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !signalements || signalements.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-success/50" />
              <p className="text-sm text-muted-foreground">
                Aucun signalement dans cette catégorie.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {signalements.map((s) => {
                const statutMeta = STATUT_META[s.statut]
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    {/* En-tête : raison + statut + date */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Flag className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-xs font-semibold text-foreground">
                          {RAISON_LABELS[s.raison]}
                        </span>
                        <Badge variant={statutMeta.variant} size="sm">
                          {statutMeta.label}
                        </Badge>
                      </div>
                      <time className="text-[10px] text-muted-foreground">
                        {formatDate(s.createdAt)}
                      </time>
                    </div>

                    {/* Commentaire du signalant */}
                    {s.commentaire && (
                      <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-2">
                        « {s.commentaire} »
                      </p>
                    )}

                    {/* Métadonnées : message ID, signalé par */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>
                        Message : <code className="font-mono">{s.messageId.slice(0, 8)}…</code>
                      </span>
                      <span>
                        Signalé par : <code className="font-mono">{s.userId.slice(0, 8)}…</code>
                      </span>
                      {s.resolvedAt && (
                        <span>Résolu le : {formatDate(s.resolvedAt)}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {s.statut === 'OUVERT' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(s.id, 'EN_COURS')}
                          disabled={resolveSignalement.isPending}
                          className="h-7 text-xs"
                        >
                          <Clock className="h-3 w-3" />
                          En cours
                        </Button>
                      )}
                      {s.statut !== 'RESOLU' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(s.id, 'RESOLU')}
                          disabled={resolveSignalement.isPending}
                          className="h-7 text-xs text-success border-success/40 hover:bg-success/10"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Résoudre
                        </Button>
                      )}
                      {s.statut !== 'REJETE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(s.id, 'REJETE')}
                          disabled={resolveSignalement.isPending}
                          className="h-7 text-xs text-muted-foreground"
                        >
                          <XCircle className="h-3 w-3" />
                          Rejeter
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteMessage(s.messageId, s.id)}
                        disabled={deletingId === s.messageId}
                        className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        {deletingId === s.messageId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Masquer le message
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>

      {/* Modale de confirmation in-app (rendue via portail, par-dessus le Dialog) */}
      {confirmDialog}
    </Dialog>
  )
}
