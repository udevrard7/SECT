// alerts-tab.tsx — Onglet « Alertes » (SECT-MONITORING-UI-1).
//
// DEUX sections, DEUX sources :
//   1. « Alertes actives » : requête DÉDIÉE (statut=ACTIF, 100 max) — la
//      correction majeure de la refonte : avant, cette file était calculée
//      depuis la liste Événements → elle se vidait si l'admin filtrait
//      statut=RESOLU ou changeait de page. Désormais insensible aux filtres.
//   2. « Règles d'alerte » persistées (ADR-0012) : cartes avec statut live
//      backend, tri (franchies > actives > système), jauge comparator-aware,
//      CRUD complet (dialogs dans rule-dialogs.tsx).

'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Bell,
  BellRing,
  CheckCircle2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { PulseSkeleton } from '@/components/ds'
import type { AlertingRule, MonitoringEvent, RulesData } from './types'
import { SEVERITY_PRIORITY } from './types'
import { comparatorLabel, getTimeAgo, ruleGauge } from './utils'
import { SeverityBadge, TypeBadge } from './badges'
import {
  useActiveAlerts,
  useInvalidateMonitoring,
  useMonitoringRules,
} from './use-monitoring'
import { escalateEvent, ignoreEvent, resolveEvent, saveRule, deleteRule, type RuleFormValues } from './event-mutations'
import {
  EscalateEventDialog,
  IgnoreEventDialog,
  ResolveEventDialog,
} from './event-dialogs'
import { CreateRuleDialog, DeleteRuleDialog, EditRuleDialog } from './rule-dialogs'

const EMPTY_FORM: RuleFormValues = {
  label: '',
  metric: '',
  comparator: 'SUP',
  threshold: 0,
  severite: 'WARNING',
  cooldownMinutes: 30,
  notifyInApp: true,
  notifySlack: true,
  notifyEmail: true,
}

export function AlertsTab({
  autoRefresh,
  userEmail,
}: {
  autoRefresh: boolean
  userEmail: string
}) {
  const alertsQuery = useActiveAlerts(autoRefresh)
  const rulesQuery = useMonitoringRules(autoRefresh)
  const invalidate = useInvalidateMonitoring()

  const alertsData = alertsQuery.data
  const activeAlerts = useMemo(() => {
    const list = (alertsData?.events ?? []).filter(
      (e) => e.severite === 'CRITICAL' || e.severite === 'ERROR' || e.severite === 'WARNING'
    )
    return [...list].sort((a, b) => SEVERITY_PRIORITY[a.severite] - SEVERITY_PRIORITY[b.severite])
  }, [alertsData])

  const rulesData: RulesData | null = rulesQuery.data ?? null
  const rules = useMemo(() => {
    const list = rulesData?.rules ?? []
    // Tri : franchies d'abord, puis actives, puis désactivées.
    return [...list].sort((a, b) => {
      const score = (r: AlertingRule) => (r.violated && r.enabled ? 0 : r.enabled ? 1 : 2)
      return score(a) - score(b) || a.label.localeCompare(b.label)
    })
  }, [rulesData])

  // ─── Dialogs événements (file active) ───
  const [resolveTarget, setResolveTarget] = useState<MonitoringEvent | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [ignoreTarget, setIgnoreTarget] = useState<MonitoringEvent | null>(null)
  const [escalateTarget, setEscalateTarget] = useState<MonitoringEvent | null>(null)

  const handleResolve = async () => {
    if (!resolveTarget) return
    const ok = await resolveEvent(resolveTarget, resolveNotes, userEmail)
    if (ok) {
      setResolveTarget(null)
      setResolveNotes('')
      await invalidate()
    }
  }
  const handleIgnore = async () => {
    if (!ignoreTarget) return
    const ok = await ignoreEvent(ignoreTarget)
    if (ok) {
      setIgnoreTarget(null)
      await invalidate()
    }
  }
  const handleEscalate = async () => {
    if (!escalateTarget) return
    const ok = await escalateEvent(escalateTarget)
    if (ok) {
      setEscalateTarget(null)
      await invalidate()
    }
  }

  // ─── Dialogs règles ───
  const [editRule, setEditRule] = useState<AlertingRule | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AlertingRule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleFormValues>(EMPTY_FORM)
  const [ruleSubmitting, setRuleSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const patchForm = (patch: Partial<RuleFormValues>) => setRuleForm((f) => ({ ...f, ...patch }))

  // Ouverture des dialogs : hydratation directe du formulaire (pas d'effet —
  // pattern react-hooks/set-state-in-effect évité).
  const openEdit = (rule: AlertingRule) => {
    setEditRule(rule)
    setRuleForm({
      label: rule.label,
      metric: rule.metric,
      comparator: rule.comparator,
      threshold: rule.threshold,
      severite: rule.severite,
      cooldownMinutes: rule.cooldownMinutes,
      notifyInApp: rule.notifyInApp,
      notifySlack: rule.notifySlack,
      notifyEmail: rule.notifyEmail,
    })
  }

  const openCreate = () => {
    setCreateOpen(true)
    setRuleForm({ ...EMPTY_FORM, metric: rulesData?.metrics[0]?.key ?? 'errors_actifs' })
  }

  const handleSaveRule = async () => {
    setRuleSubmitting(true)
    const ok = await saveRule(ruleForm, editRule?.id)
    setRuleSubmitting(false)
    if (ok) {
      setEditRule(null)
      setCreateOpen(false)
      await invalidate()
    }
  }

  const handleDeleteRule = async () => {
    if (!deleteTarget) return
    setRuleSubmitting(true)
    const ok = await deleteRule(deleteTarget)
    setRuleSubmitting(false)
    if (ok) {
      setDeleteTarget(null)
      await invalidate()
    }
  }

  const handleToggleRule = async (rule: AlertingRule, enabled: boolean) => {
    setTogglingId(rule.id)
    try {
      // PUT partiel { enabled } — backend clear breachedSince à la désactivation.
      const res = await fetch(`/api/monitoring/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Erreur lors de la modification')
      }
      toast.success(enabled ? 'Règle activée' : 'Règle désactivée', {
        description: `« ${rule.label} » ${enabled ? 'surveille à nouveau' : 'ne déclenchera plus d\u2019alerte'}.`,
      })
      await invalidate()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de modifier la règle.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  const channels = rulesData?.channels

  return (
    <div className="space-y-6">
      {/* ─── Bandeau canaux (état réel — dégradation honnête ADR-0012) ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden="true" />
          <div className="space-y-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <p>
              RÈGLES <span className="font-semibold text-foreground">PERSISTÉES</span> · ÉVALUÉES
              CÔTÉ BACKEND TOUTES LES 2 MIN (WORKER D&apos;ALERTING) · FRANCHISSEMENT →
              ÉVÉNEMENT IN-APP + CANAUX ACTIVÉS
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 normal-case">
              <span className="inline-flex items-center gap-1">
                {channels?.slackConfigured ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-success-text" aria-hidden="true" /> Slack configuré
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" /> Slack non configuré (SLACK_WEBHOOK_URL)
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                {channels?.emailTo ? (
                  channels.emailReady ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-success-text" aria-hidden="true" /> Email → {channels.emailTo}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" /> Email → {channels.emailTo} (expédition inactive — configurer RESEND_API_KEY ou SMTP)
                    </>
                  )
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" /> Email dédié non configuré (ALERTING_EMAIL_TO)
                  </>
                )}
              </span>
            </p>
          </div>
        </div>
        <Button size="sm" className="shrink-0 ds-shimmer" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Nouvelle règle
        </Button>
      </div>

      {/* ─── Alertes actives (requête dédiée) ─── */}
      <section aria-label="Alertes actives">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.16em]">
            <BellRing className="h-4 w-4 text-primary-text" aria-hidden="true" />
            Alertes actives
            {activeAlerts.length > 0 && (
              <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                {activeAlerts.length}
              </span>
            )}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            CRITICAL &gt; ERREUR &gt; AVERTISSEMENT · {autoRefresh ? 'AUTO 30 S' : 'MANUEL'}
          </span>
        </div>

        {alertsQuery.isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-start gap-3">
                  <PulseSkeleton className="h-9 w-9 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <PulseSkeleton className="h-5 w-20" />
                      <PulseSkeleton className="h-5 w-16" />
                    </div>
                    <PulseSkeleton className="h-4 w-3/4" />
                    <PulseSkeleton className="h-8 w-48" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : alertsQuery.isError ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="h-7 w-7 text-warning" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted-foreground">
                Impossible de charger la file d&apos;alertes actives.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void alertsQuery.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
              </Button>
            </CardContent>
          </Card>
        ) : activeAlerts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success-text" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-lg font-semibold font-display tracking-tight">Aucune alerte active</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Aucun événement CRITIQUE, ERREUR ou AVERTISSEMENT actif. Les règles d&apos;alerte
                continuent de surveiller en arrière-plan.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3 pr-4">
              {activeAlerts.map((event) => (
                <AlertCard
                  key={event.id}
                  event={event}
                  onResolve={() => {
                    setResolveTarget(event)
                    setResolveNotes('')
                  }}
                  onEscalate={() => setEscalateTarget(event)}
                  onIgnore={() => setIgnoreTarget(event)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </section>

      <Separator />

      {/* ─── Règles persistées (ADR-0012) ─── */}
      <section aria-label="Règles d'alerte">
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.16em]">
              <Settings2 className="h-4 w-4 text-primary-text" aria-hidden="true" />
              Règles d&apos;alerte
              {rulesData && (
                <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                  {rules.filter((r) => r.violated && r.enabled).length}/{rules.length} franchie(s)
                </span>
              )}
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Persistées en base · évaluées backend · seuils et canaux modifiables · zéro valeur simulée
            </p>
          </div>
        </div>

        {rulesQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <PulseSkeleton className="h-5 w-2/3 mb-2" />
                  <PulseSkeleton className="h-4 w-1/2 mb-3" />
                  <PulseSkeleton className="h-1.5 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : rulesQuery.isError ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="h-7 w-7 text-warning" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted-foreground">
                Impossible de charger les règles (/api/monitoring/rules).
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void rulesQuery.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                toggling={togglingId === rule.id}
                onToggle={(enabled) => void handleToggleRule(rule, enabled)}
                onEdit={() => openEdit(rule)}
                onDelete={() => setDeleteTarget(rule)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Dialogs ─── */}
      <ResolveEventDialog
        target={resolveTarget}
        notes={resolveNotes}
        onNotesChange={setResolveNotes}
        onClose={() => {
          setResolveTarget(null)
          setResolveNotes('')
        }}
        onConfirm={handleResolve}
        submitting={false}
      />
      <IgnoreEventDialog target={ignoreTarget} onClose={() => setIgnoreTarget(null)} onConfirm={handleIgnore} />
      <EscalateEventDialog
        target={escalateTarget}
        onClose={() => setEscalateTarget(null)}
        onConfirm={handleEscalate}
      />
      <EditRuleDialog
        rule={editRule}
        form={ruleForm}
        onChange={patchForm}
        onClose={() => setEditRule(null)}
        onConfirm={handleSaveRule}
        submitting={ruleSubmitting}
      />
      <CreateRuleDialog
        open={createOpen}
        form={ruleForm}
        onChange={patchForm}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleSaveRule}
        submitting={ruleSubmitting}
        rulesData={rulesData}
      />
      <DeleteRuleDialog
        rule={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRule}
        submitting={ruleSubmitting}
      />
    </div>
  )
}

// ─── Carte alerte active ───

function AlertCard({
  event,
  onResolve,
  onEscalate,
  onIgnore,
}: {
  event: MonitoringEvent
  onResolve: () => void
  onEscalate: () => void
  onIgnore: () => void
}) {
  const getSuggestedAction = (ev: MonitoringEvent): string => {
    if (ev.severite === 'CRITICAL') return 'Intervention immédiate requise — vérifier le service et redémarrer si nécessaire'
    if (ev.severite === 'ERROR') return 'Analyser les logs et corriger la cause racine'
    if (ev.severite === 'WARNING') return "Surveiller l'évolution et envisager une action préventive"
    return 'Information à consulter — aucune action immédiate nécessaire'
  }

  return (
    <Card className="transition-all hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <SeverityBadge severite={event.severite} pulse />
              <TypeBadge type={event.type} />
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {getTimeAgo(event.createdAt)}
              </span>
            </div>
            <h4 className="text-sm font-medium mt-1.5 leading-snug">{event.message}</h4>
            {event.source && <p className="text-xs text-muted-foreground mt-1">Source : {event.source}</p>}
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 inline mr-1" aria-hidden="true" />
              {getSuggestedAction(event)}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-success/30 text-success-text hover:bg-success/10"
                onClick={onResolve}
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Résoudre
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-warning/30 text-warning hover:bg-warning/10"
                onClick={onEscalate}
              >
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                Escalader
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border text-muted-foreground hover:bg-muted"
                onClick={onIgnore}
              >
                <Ban className="h-3 w-3" aria-hidden="true" />
                Ignorer
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Carte règle persistée ───

function RuleCard({
  rule,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: AlertingRule
  toggling: boolean
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isBreached = rule.violated && rule.enabled
  const { fillPct, tone } = ruleGauge(rule)
  const barColor = tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-success'

  return (
    <Card
      className={`transition-all ${!rule.enabled ? 'opacity-60' : isBreached ? 'border-destructive/40 dark:border-destructive/70' : 'border-border'}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-medium">{rule.label}</h4>
              <SeverityBadge severite={rule.severite} />
              {rule.isSystem && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  système
                </Badge>
              )}
              {isBreached && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  Franchie{rule.breachedSince ? ` depuis ${getTimeAgo(rule.breachedSince)}` : ''}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground" title={rule.description ?? undefined}>
              {rule.metricLabel}
              {rule.lastNotifiedAt ? ` · notifiée ${getTimeAgo(rule.lastNotifiedAt)}` : ''}
              {` · cooldown ${rule.cooldownMinutes} min`}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
              <div className="flex items-center gap-1">
                <span>Seuil :</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {comparatorLabel(rule.comparator)} {rule.threshold}
                  {rule.unit}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span>Actuel :</span>
                <span className={`font-mono font-semibold ${isBreached ? 'text-destructive' : 'text-success-text'}`}>
                  {rule.currentValue}
                  {rule.unit}
                </span>
              </div>
            </div>
            {/* Jauge comparator-aware (utils.ruleGauge) */}
            <div
              className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden"
              role="meter"
              aria-valuenow={Math.round(fillPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progression de ${rule.label} vers son seuil`}
            >
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${fillPct}%` }} />
            </div>
            {/* Canaux */}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className={`inline-flex items-center gap-0.5 ${rule.notifyInApp ? 'text-foreground' : 'line-through opacity-50'}`}>
                <Bell className="h-3 w-3" aria-hidden="true" /> in-app
              </span>
              <span className={`inline-flex items-center gap-0.5 ${rule.notifySlack ? 'text-foreground' : 'line-through opacity-50'}`}>
                <Zap className="h-3 w-3" aria-hidden="true" /> Slack
              </span>
              <span className={`inline-flex items-center gap-0.5 ${rule.notifyEmail ? 'text-foreground' : 'line-through opacity-50'}`}>
                <MessageSquare className="h-3 w-3" aria-hidden="true" /> email
              </span>
            </div>
            {rule.description && <p className="mt-1.5 text-[11px] text-muted-foreground">{rule.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Switch
              checked={rule.enabled}
              disabled={toggling}
              onCheckedChange={onToggle}
              aria-label={`${rule.enabled ? 'Désactiver' : 'Activer'} la règle ${rule.label}`}
            />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} aria-label={`Modifier la règle ${rule.label}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              {!rule.isSystem && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={onDelete}
                  aria-label={`Supprimer la règle ${rule.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
