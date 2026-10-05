// event-dialogs.tsx — Dialogs événements (SECT-MONITORING-UI-1).
//
// Composants contrôlés « muets » : l'état de cible vit dans l'onglet hôte
// (events-tab / alerts-tab), les mutations dans event-mutations.ts.

import { Ban, ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GlassModal } from '@/components/ds'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import type { MonitoringEvent } from './types'
import { SeverityBadge, TypeBadge } from './badges'
import { formatDate } from './utils'

/** Résumé d'un événement (partagé par les 3 dialogs). */
function EventSummary({ event }: { event: MonitoringEvent }) {
  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        <TypeBadge type={event.type} />
        <SeverityBadge severite={event.severite} />
        <span className="text-xs text-muted-foreground ml-auto">{formatDate(event.createdAt)}</span>
      </div>
      <p className="text-sm">{event.message}</p>
      {event.source && (
        <p className="text-xs text-muted-foreground">Source : {event.source}</p>
      )}
    </div>
  )
}

export function ResolveEventDialog({
  target,
  notes,
  onNotesChange,
  onClose,
  onConfirm,
  submitting,
}: {
  target: MonitoringEvent | null
  notes: string
  onNotesChange: (notes: string) => void
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <GlassModal
      open={!!target}
      onClose={() => {
        onClose()
      }}
      title="Résoudre l'événement"
      description="Marquer cet événement comme résolu — les notes sont persistées dans l'événement (auditable)."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            className="bg-success hover:bg-success/90 text-success-text ds-shimmer"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Résolution…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Résoudre
              </>
            )}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          <EventSummary event={target} />
          <div className="space-y-2">
            <Label htmlFor="resolve-notes">Notes de résolution (optionnel)</Label>
            <Textarea
              id="resolve-notes"
              placeholder="Décrivez la résolution ou les actions entreprises…"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              Les notes sont fusionnées dans le champ <code className="font-mono">details.resolutionNotes</code> — visibles dans la ligne dépliable de l&apos;événement.
            </p>
          </div>
        </div>
      )}
    </GlassModal>
  )
}

export function IgnoreEventDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: MonitoringEvent | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-muted-foreground" />
            Ignorer l&apos;événement
          </AlertDialogTitle>
          <AlertDialogDescription>
            L&apos;événement sera marqué <strong>IGNORE</strong> : il restera en base (historique) mais
            disparaîtra des alertes actives et du score santé.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {target && <EventSummary event={target} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-muted hover:bg-muted/80 ds-shimmer">
            Ignorer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function EscalateEventDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: MonitoringEvent | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-warning" />
            Escalader au niveau critique
          </AlertDialogTitle>
          <AlertDialogDescription>
            Un <strong>nouvel événement CRITICAL</strong> sera créé (traçabilité conservée : référence à
            l&apos;événement d&apos;origine) et les ADMIN actifs seront notifiés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {target && (
          <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={target.type} />
              <SeverityBadge severite={target.severite} />
              <ArrowUpRight className="h-4 w-4 text-warning" aria-hidden="true" />
              <Badge className="bg-secondary/10 text-secondary border-secondary/30 text-xs">CRITICAL</Badge>
            </div>
            <p className="text-sm">{target.message}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-warning hover:bg-warning/90 text-warning-foreground ds-shimmer"
          >
            Escalader
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function BulkActionDialog({
  open,
  count,
  action,
  selectableCount,
  userEmail,
  onClose,
  onConfirm,
  submitting,
}: {
  open: boolean
  count: number
  action: 'resoudre' | 'ignorer' | null
  selectableCount: number
  userEmail: string
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {action === 'resoudre' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success-text" />
                Résoudre {count} événement{count > 1 ? 's' : ''} ?
              </>
            ) : (
              <>
                <Ban className="h-5 w-5 text-warning" />
                Ignorer {count} événement{count > 1 ? 's' : ''} ?
              </>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action === 'resoudre'
              ? `Les événements seront marqués RESOLU d'un seul coup, signés « ${userEmail} » (résolution en une transaction atomique).`
              : 'Les événements seront marqués IGNORE — conservés en base, masqués des alertes actives.'}
            <br />
            <span className="text-xs text-muted-foreground mt-1 block">
              Seuls les événements ACTIF sont affectés ({selectableCount} sélectionnables, max 100 par requête).
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className={
              action === 'resoudre'
                ? 'bg-success hover:bg-success/90 text-success-text ds-shimmer'
                : 'bg-warning hover:bg-warning/90 text-warning-foreground ds-shimmer'
            }
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Traitement…
              </>
            ) : action === 'resoudre' ? (
              `Oui, résoudre ${count} événement(s)`
            ) : (
              `Oui, ignorer ${count} événement(s)`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
