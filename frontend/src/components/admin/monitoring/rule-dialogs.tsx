// rule-dialogs.tsx — Dialogs règles d'alerte (ADR-0012, SECT-MONITORING-UI-1).
//
// Contrôle total par props : l'état (règle éditée / création / suppression)
// vit dans alerts-tab ; les validations backend (label 3-120, threshold ≥ 0,
// cooldown 1-1440, métrique du catalogue, metric immuable en PUT) sont
// rappelées en disabled côté client mais TOUJOURS vérifiées serveur.

import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { GlassModal } from '@/components/ds'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bell, MessageSquare, Zap } from 'lucide-react'
import type { AlertingRule, RulesData } from './types'
import type { RuleFormValues } from './event-mutations'

/** Champs communs édition/création — children en slot pour la métrique. */
function RuleFormFields({
  form,
  onChange,
  rulesData,
}: {
  form: RuleFormValues
  onChange: (patch: Partial<RuleFormValues>) => void
  rulesData: RulesData | null
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Comparateur</Label>
          <Select
            value={form.comparator}
            onValueChange={(v) => onChange({ comparator: v as RuleFormValues['comparator'] })}
          >
            <SelectTrigger aria-label="Comparateur">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(rulesData?.comparators ?? []).map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-threshold">Seuil</Label>
          <Input
            id="rule-threshold"
            type="number"
            min={0}
            step="any"
            value={form.threshold}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Sévérité de l&apos;alerte</Label>
          <Select
            value={form.severite}
            onValueChange={(v) => onChange({ severite: v as RuleFormValues['severite'] })}
          >
            <SelectTrigger aria-label="Sévérité">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARNING">Avertissement</SelectItem>
              <SelectItem value="ERROR">Erreur</SelectItem>
              <SelectItem value="CRITICAL">Critique</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-cooldown">Cooldown (min)</Label>
          <Input
            id="rule-cooldown"
            type="number"
            min={1}
            max={1440}
            value={form.cooldownMinutes}
            onChange={(e) => onChange({ cooldownMinutes: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground">Anti-spam notifications — 1 à 1440 min.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Canaux de notification</Label>
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label className="flex items-center justify-between text-sm cursor-pointer" htmlFor="rule-inapp">
            <span className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" /> Événement in-app (file Alertes)
            </span>
            <Checkbox
              id="rule-inapp"
              checked={form.notifyInApp}
              onCheckedChange={(v) => onChange({ notifyInApp: v === true })}
            />
          </label>
          <label className="flex items-center justify-between text-sm cursor-pointer" htmlFor="rule-slack">
            <span className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" /> Slack (webhook)
            </span>
            <Checkbox
              id="rule-slack"
              checked={form.notifySlack}
              onCheckedChange={(v) => onChange({ notifySlack: v === true })}
            />
          </label>
          <label className="flex items-center justify-between text-sm cursor-pointer" htmlFor="rule-email">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Email dédié
            </span>
            <Checkbox
              id="rule-email"
              checked={form.notifyEmail}
              onCheckedChange={(v) => onChange({ notifyEmail: v === true })}
            />
          </label>
        </div>
      </div>
    </>
  )
}

export function EditRuleDialog({
  rule,
  form,
  onChange,
  onClose,
  onConfirm,
  submitting,
}: {
  rule: AlertingRule | null
  form: RuleFormValues
  onChange: (patch: Partial<RuleFormValues>) => void
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <GlassModal
      open={!!rule}
      onClose={onClose}
      title="Modifier la règle"
      description={
        rule
          ? `${rule.metricLabel} — la métrique est immuable (supprimer et recréer pour changer).`
          : ''
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            className="ds-shimmer"
            onClick={onConfirm}
            disabled={submitting || form.label.trim().length < 3 || form.label.length > 120}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Enregistrer
              </>
            )}
          </Button>
        </>
      }
    >
      {rule && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-rule-label">Libellé</Label>
            <Input
              id="edit-rule-label"
              value={form.label}
              onChange={(e) => onChange({ label: e.target.value })}
              maxLength={120}
            />
            <p className="text-[11px] text-muted-foreground">3 à 120 caractères (validé côté backend).</p>
          </div>
          <RuleFormFields form={form} onChange={onChange} rulesData={null} />
        </div>
      )}
    </GlassModal>
  )
}

export function CreateRuleDialog({
  open,
  form,
  onChange,
  onClose,
  onConfirm,
  submitting,
  rulesData,
}: {
  open: boolean
  form: RuleFormValues
  onChange: (patch: Partial<RuleFormValues>) => void
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
  rulesData: RulesData | null
}) {
  const selectedMetric = (rulesData?.metrics ?? []).find((m) => m.key === form.metric)
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Nouvelle règle d'alerte"
      description="Choisissez une métrique réelle du catalogue backend — aucune valeur ne sera inventée."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            className="ds-shimmer"
            onClick={onConfirm}
            disabled={submitting || !form.metric || form.label.trim().length < 3 || form.label.length > 120}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Créer la règle
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-rule-label">Libellé</Label>
          <Input
            id="new-rule-label"
            placeholder="ex : Backlog d'autorisations trop élevé"
            value={form.label}
            onChange={(e) => onChange({ label: e.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label>Métrique surveillée</Label>
          <Select value={form.metric} onValueChange={(v) => onChange({ metric: v })}>
            <SelectTrigger aria-label="Métrique">
              <SelectValue placeholder="Choisir une métrique" />
            </SelectTrigger>
            <SelectContent>
              {(rulesData?.metrics ?? []).map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                  {m.unit ? ` (${m.unit.trim()})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMetric && (
            <p className="text-[11px] text-muted-foreground">{selectedMetric.description}</p>
          )}
        </div>
        <RuleFormFields form={form} onChange={onChange} rulesData={rulesData} />
      </div>
    </GlassModal>
  )
}

export function DeleteRuleDialog({
  rule,
  onClose,
  onConfirm,
  submitting,
}: {
  rule: AlertingRule | null
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <AlertDialog open={!!rule} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Supprimer la règle ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            « {rule?.label} » sera définitivement supprimée et ne déclenchera plus d&apos;alerte.
            Les règles système ne sont pas supprimables (désactivables uniquement).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground ds-shimmer"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Suppression…
              </>
            ) : (
              'Supprimer définitivement'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
