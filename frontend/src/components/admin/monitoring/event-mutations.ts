// event-mutations.ts — Mutations événements + règles avec toasts (SECT-MONITORING-UI-1).
//
// Fonctions pures appelées par les dialogs (les composants gardent leur état
// local de cible ; les mutations centralisent fetch + gestion d'erreur + toast).
//
// Contrat backend :
//   PATCH  /api/monitoring/{id}   { action:'resoudre', resoluPar?, notes? }
//        → notes fusionnées dans details.resolutionNotes (ADR-0011 §5)
//   DELETE /api/monitoring/{id}   → statut IGNORE
//   POST   /api/monitoring        { type, severite, message, source?, details }
//        → details string OU objet (colonne TEXT normalisée backend)
//   POST   /api/monitoring/bulk   { ids[≤100], action:'resoudre'|'ignorer' }
//   POST   /api/monitoring/rules  (création — metric du catalogue obligatoire)
//   PUT    /api/monitoring/rules/{id} (partiel ; metric IMMUTABLE)
//   DELETE /api/monitoring/rules/{id} (403 sur règle système)

import { toast } from 'sonner'
import type { AlertingRule, MonitoringEvent } from './types'

async function readError(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({}))
  return (err as { error?: string }).error || fallback
}

/** Résout un événement (PATCH). Retourne true en cas de succès. */
export async function resolveEvent(event: MonitoringEvent, notes: string, resolvedBy: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/monitoring/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resoudre',
        // Le backend force resoluPar à claims.Email (anti-forgery) — on envoie
        // l'identité courante par cohérence.
        resoluPar: resolvedBy,
        notes: notes || undefined,
      }),
    })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de la résolution'))
    toast.success('Événement résolu', {
      description: `« ${event.message.slice(0, 80)}${event.message.length > 80 ? '…' : ''} » marqué résolu.${notes ? ` Notes : ${notes}` : ''}`,
    })
    return true
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible de résoudre l\u2019événement.',
    })
    return false
  }
}

/** Ignore un événement (DELETE → statut IGNORE, soft-delete). */
export async function ignoreEvent(event: MonitoringEvent): Promise<boolean> {
  try {
    const res = await fetch(`/api/monitoring/${event.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de l\u2019ignorance'))
    toast.success('Événement ignoré', {
      description: 'Il restera en base mais disparaîtra des alertes actives.',
    })
    return true
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible d\u2019ignorer l\u2019événement.',
    })
    return false
  }
}

/** Escalade un événement au niveau CRITIQUE (POST — nouveau MonitoringEvent). */
export async function escalateEvent(event: MonitoringEvent): Promise<boolean> {
  try {
    const res = await fetch('/api/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: event.type,
        severite: 'CRITICAL',
        message: `[ESCALADE] ${event.message}`,
        source: event.source || 'Système',
        // Backend (ADR-0011 §5) : string OU objet acceptés, normalisés en TEXT.
        details: JSON.stringify({ escalatedFrom: event.id, originalSeverite: event.severite }),
      }),
    })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de l\u2019escalade'))
    toast.success('Événement escaladé', {
      description: 'Un nouvel événement CRITIQUE a été créé et notifié aux ADMIN actifs.',
    })
    return true
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible d\u2019escalader l\u2019événement.',
    })
    return false
  }
}

/** Action de masse (max 100 ids — validé backend). */
export async function bulkEventsAction(
  ids: string[],
  action: 'resoudre' | 'ignorer'
): Promise<{ ok: boolean; updated: number; total: number }> {
  try {
    const res = await fetch('/api/monitoring/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de l\u2019action de masse'))
    const data = (await res.json()) as { updated: number; total: number }
    const actionLabel = action === 'resoudre' ? 'résolu(s)' : 'ignoré(s)'
    toast.success('Action de masse terminée', {
      description: `${data.updated} événement(s) ${actionLabel} sur ${data.total} sélectionné(s).`,
    })
    return { ok: true, updated: data.updated, total: data.total }
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible d\u2019effectuer l\u2019action de masse.',
    })
    return { ok: false, updated: 0, total: ids.length }
  }
}

export interface RuleFormValues {
  label: string
  metric: string
  comparator: AlertingRule['comparator']
  threshold: number
  severite: AlertingRule['severite']
  cooldownMinutes: number
  notifyInApp: boolean
  notifyDiscord: boolean
  notifySlack: boolean
  notifyEmail: boolean
}

/** Crée (POST) ou met à jour (PUT) une règle. metric ignoré en édition. */
export async function saveRule(form: RuleFormValues, existingId?: string): Promise<boolean> {
  const isEdit = !!existingId
  try {
    const res = await fetch(isEdit ? `/api/monitoring/rules/${existingId}` : '/api/monitoring/rules', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: form.label,
        comparator: form.comparator,
        threshold: Number(form.threshold),
        severite: form.severite,
        cooldownMinutes: Number(form.cooldownMinutes),
        notifyInApp: form.notifyInApp,
        notifyDiscord: form.notifyDiscord,
        notifySlack: form.notifySlack,
        notifyEmail: form.notifyEmail,
        ...(isEdit ? {} : { metric: form.metric }),
      }),
    })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de l\u2019enregistrement'))
    toast.success(isEdit ? 'Règle mise à jour' : 'Règle créée', {
      description: `« ${form.label} » ${isEdit ? 'est enregistrée' : 'est désormais surveillée'} (évaluée par le worker toutes les 2 min).`,
    })
    return true
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible d\u2019enregistrer la règle.',
    })
    return false
  }
}

/** Supprime une règle custom (403 backend sur règle système). */
export async function deleteRule(rule: AlertingRule): Promise<boolean> {
  try {
    const res = await fetch(`/api/monitoring/rules/${rule.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await readError(res, 'Erreur lors de la suppression'))
    toast.success('Règle supprimée', { description: `« ${rule.label} » ne déclenchera plus d\u2019alerte.` })
    return true
  } catch (err) {
    toast.error('Erreur', {
      description: err instanceof Error ? err.message : 'Impossible de supprimer la règle.',
    })
    return false
  }
}
