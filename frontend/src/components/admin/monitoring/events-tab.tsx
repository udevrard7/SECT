// events-tab.tsx — Onglet « Événements » (SECT-MONITORING-UI-2).
//
// Refonte visuelle « log console » : lignes de journal avec rail de
// sévérité, horodatage mono, chips console et détails techniques en
// bloc TERMINAL sombre (mon-terminal) — le langage salle des machines.
//
// LOGIQUE INTÉGRALEMENT CONSERVÉE de UI-1 : filtres backend
// (type/sévérité/statut/période) + pagination réelle (total = COUNT
// même WHERE — ADR-0011 §7), sélection multiple → action de masse
// (POST /api/monitoring/bulk), lignes dépliables révélant le champ
// `details` parsé (notes de résolution, escalade, payload worker).

'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { PulseSkeleton } from '@/components/ds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MonitoringEvent, Severity } from './types'
import { SeverityBadge, StatutBadge, TypeBadge } from './badges'
import { formatDate, formatTime, formatDuration, detailValueToString, parseEventDetails, DETAIL_SPECIAL_KEYS } from './utils'
import { useInvalidateMonitoring, useMonitoringEvents } from './use-monitoring'
import { bulkEventsAction, escalateEvent, ignoreEvent, resolveEvent } from './event-mutations'
import { BulkActionDialog, EscalateEventDialog, IgnoreEventDialog, ResolveEventDialog } from './event-dialogs'

const PAGE_SIZE = 50

/** Rail de sévérité (bord gauche coloré de chaque ligne) — littéral. */
const SEVERITY_RAIL: Record<Severity, string> = {
  INFO: 'border-l-zinc-300 dark:border-l-zinc-600',
  WARNING: 'border-l-warning',
  ERROR: 'border-l-destructive',
  CRITICAL: 'border-l-secondary',
}

export function EventsTab({
  autoRefresh,
  userEmail,
}: {
  autoRefresh: boolean
  userEmail: string
}) {
  // ─── Filtres (tout changement de filtre ramène à la page 1) ───
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [severiteFilter, setSeveriteFilter] = useState('all')
  const [statutFilter, setStatutFilter] = useState('all')
  const [sinceHours, setSinceHours] = useState('all')
  const [page, setPage] = useState(1)
  const changeFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }

  const query = useMonitoringEvents(
    { type: typeFilter, severite: severiteFilter, statut: statutFilter, sinceHours, page, pageSize: PAGE_SIZE },
    autoRefresh
  )
  const events = query.data?.events ?? []
  const totalEvents = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE))
  const invalidate = useInvalidateMonitoring()

  // Refresh manuel : état loading local pour ne pas flasher les skeletons
  // pendant le polling d'arrière-plan.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const isLoading = query.isLoading || isManualRefreshing

  // ─── Recherche locale (message + source) sur la page courante ───
  const filteredEvents = useMemo(() => {
    if (!search) return events
    const q = search.toLowerCase()
    return events.filter(
      (e) => e.message.toLowerCase().includes(q) || (e.source ?? '').toLowerCase().includes(q)
    )
  }, [events, search])

  const hasActiveFilters =
    search !== '' || typeFilter !== 'all' || severiteFilter !== 'all' || statutFilter !== 'all' || sinceHours !== 'all'

  // ─── Lignes dépliables (details parsés) ───
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Sélection multiple (événements ACTIF uniquement) ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectableEvents = useMemo(() => filteredEvents.filter((e) => e.statut === 'ACTIF'), [filteredEvents])
  const allSelected = selectableEvents.length > 0 && selectableEvents.every((e) => selectedIds.has(e.id))
  const someSelected = selectableEvents.some((e) => selectedIds.has(e.id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableEvents.map((e) => e.id)))
  }
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  // ─── Dialogs mutations ───
  const [resolveTarget, setResolveTarget] = useState<MonitoringEvent | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [ignoreTarget, setIgnoreTarget] = useState<MonitoringEvent | null>(null)
  const [escalateTarget, setEscalateTarget] = useState<MonitoringEvent | null>(null)
  const [bulkAction, setBulkAction] = useState<'resoudre' | 'ignorer' | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const afterMutation = async () => {
    setSelectedIds(new Set())
    await invalidate()
  }

  const handleResolve = async () => {
    if (!resolveTarget) return
    setSubmitting(true)
    const ok = await resolveEvent(resolveTarget, resolveNotes, userEmail)
    setSubmitting(false)
    if (ok) {
      setResolveTarget(null)
      setResolveNotes('')
      await afterMutation()
    }
  }

  const handleIgnore = async () => {
    if (!ignoreTarget) return
    const ok = await ignoreEvent(ignoreTarget)
    if (ok) {
      setIgnoreTarget(null)
      await afterMutation()
    }
  }

  const handleEscalate = async () => {
    if (!escalateTarget) return
    const ok = await escalateEvent(escalateTarget)
    if (ok) {
      setEscalateTarget(null)
      await afterMutation()
    }
  }

  const handleBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    setBulkSubmitting(true)
    const res = await bulkEventsAction([...selectedIds], bulkAction)
    setBulkSubmitting(false)
    if (res.ok) {
      setBulkDialogOpen(false)
      setBulkAction(null)
      await afterMutation()
    }
  }

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setSeveriteFilter('all')
    setStatutFilter('all')
    setSinceHours('all')
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* ─── Toolbar console ─── */}
      <div className="rounded-xl border bg-card p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:inline">
            Flux
          </span>
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Rechercher (message, source)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 font-mono text-xs"
              aria-label="Rechercher un événement"
            />
          </div>
          <Select value={typeFilter} onValueChange={changeFilter(setTypeFilter)}>
            <SelectTrigger className="h-9 w-full font-mono text-xs sm:w-[150px]" aria-label="Filtrer par type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="API">API</SelectItem>
              <SelectItem value="DATABASE">Base de données</SelectItem>
              <SelectItem value="AUTH">Authentification</SelectItem>
              <SelectItem value="EVALUATION">Évaluation</SelectItem>
              <SelectItem value="PAYMENT">Paiement</SelectItem>
              <SelectItem value="SYSTEM">Système</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severiteFilter} onValueChange={changeFilter(setSeveriteFilter)}>
            <SelectTrigger className="h-9 w-full font-mono text-xs sm:w-[150px]" aria-label="Filtrer par sévérité">
              <SelectValue placeholder="Sévérité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sévérités</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARNING">Avertissement</SelectItem>
              <SelectItem value="ERROR">Erreur</SelectItem>
              <SelectItem value="CRITICAL">Critique</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statutFilter} onValueChange={changeFilter(setStatutFilter)}>
            <SelectTrigger className="h-9 w-full font-mono text-xs sm:w-[140px]" aria-label="Filtrer par statut">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="ACTIF">Actif</SelectItem>
              <SelectItem value="RESOLU">Résolu</SelectItem>
              <SelectItem value="IGNORE">Ignoré</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sinceHours} onValueChange={changeFilter(setSinceHours)}>
            <SelectTrigger className="h-9 w-full font-mono text-xs sm:w-[170px]" aria-label="Fenêtre temporelle">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tout l&apos;historique</SelectItem>
              <SelectItem value="24">24 dernières heures</SelectItem>
              <SelectItem value="168">7 derniers jours</SelectItem>
              <SelectItem value="720">30 derniers jours</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(hasActiveFilters || totalEvents > 0) && !isLoading && (
          <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {totalEvents} résultat(s){hasActiveFilters ? ' · filtres actifs' : ''} · page {page}/{totalPages}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] uppercase tracking-wider" onClick={resetFilters}>
                Réinitialiser
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ─── Skeleton (lignes console) ─── */}
      {isLoading && (
        <div className="space-y-1.5 rounded-xl border p-2" aria-busy="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-1.5">
              <PulseSkeleton className="h-3.5 w-3.5 shrink-0" />
              <PulseSkeleton className="h-3.5 w-14 shrink-0" />
              <PulseSkeleton className="h-3.5 w-16 shrink-0" />
              <PulseSkeleton className="h-3.5 w-20 shrink-0" />
              <PulseSkeleton className="h-3.5 flex-1" />
              <PulseSkeleton className="hidden h-3.5 w-14 shrink-0 md:block" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success-text" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-mono text-sm font-semibold uppercase tracking-[0.12em]">Aucun événement</h3>
          <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Aucun résultat ne correspond à vos filtres sur cette page.'
              : 'Aucun événement de monitoring enregistré. La plateforme fonctionne normalement.'}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-4 font-mono text-xs uppercase tracking-wider" onClick={resetFilters}>
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      )}

      {/* ─── Bulk toolbar ─── */}
      {selectedIds.size > 0 && !isLoading && (
        <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info/15 font-mono text-[11px] font-bold text-info">
              {selectedIds.size}
            </span>
            <span className="font-mono text-xs uppercase tracking-wider">
              Sélection — action de masse
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-success/40 font-mono text-[11px] uppercase tracking-wider text-success-text hover:bg-success/10 hover:text-success-text"
              disabled={bulkSubmitting}
              onClick={() => {
                setBulkAction('resoudre')
                setBulkDialogOpen(true)
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Résoudre
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-warning/40 font-mono text-[11px] uppercase tracking-wider text-warning hover:bg-warning/10 hover:text-warning"
              disabled={bulkSubmitting}
              onClick={() => {
                setBulkAction('ignorer')
                setBulkDialogOpen(true)
              }}
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Ignorer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-[11px] uppercase tracking-wider"
              disabled={bulkSubmitting}
              onClick={clearSelection}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ─── Log console (lignes dépliables) ─── */}
      {!isLoading && filteredEvents.length > 0 && (
        <div className="overflow-hidden rounded-xl border" aria-label="Journal des événements de monitoring">
          {/* En-têtes de colonnes (desktop) — col-start explicites : les colonnes
              masquées (Source < lg, Durée < xl) ne décalent PAS les suivantes. */}
          <div
            className="hidden grid-cols-[28px_26px_78px_100px_minmax(0,1fr)_100px_84px_88px_104px] items-center gap-2 border-b bg-muted/50 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid"
          >
            <span>
              <Checkbox
                checked={selectableEvents.length === 0 ? false : allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Sélectionner tous les événements actifs de la page"
                disabled={selectableEvents.length === 0}
              />
            </span>
            <span aria-hidden="true" />
            <span>Heure</span>
            <span>Sévérité</span>
            <span>Message</span>
            <span className="hidden lg:block lg:col-start-6">Source</span>
            <span className="hidden xl:block xl:col-start-7">Durée</span>
            <span className="md:col-start-8">Statut</span>
            <span className="md:col-start-9 md:text-right">Actions</span>
          </div>
          <div className="divide-y">
            {filteredEvents.map((event) => (
              <EventLogRow
                key={event.id}
                event={event}
                expanded={expandedIds.has(event.id)}
                onToggleExpanded={() => toggleExpanded(event.id)}
                selected={selectedIds.has(event.id)}
                selectable={event.statut === 'ACTIF'}
                onToggleSelect={() => toggleSelectOne(event.id)}
                onResolve={() => {
                  setResolveTarget(event)
                  setResolveNotes('')
                }}
                onIgnore={() => setIgnoreTarget(event)}
                onEscalate={() => setEscalateTarget(event)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Pagination backend (ADR-0011 §7) ─── */}
      {!isLoading && totalEvents > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {totalEvents} événement(s) · {PAGE_SIZE}/page
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[11px] uppercase tracking-wider"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Précédent
            </Button>
            <span className="px-1 font-mono text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[11px] uppercase tracking-wider"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant →
            </Button>
          </div>
        </div>
      )}

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
        submitting={submitting}
      />
      <IgnoreEventDialog target={ignoreTarget} onClose={() => setIgnoreTarget(null)} onConfirm={handleIgnore} />
      <EscalateEventDialog target={escalateTarget} onClose={() => setEscalateTarget(null)} onConfirm={handleEscalate} />
      <BulkActionDialog
        open={bulkDialogOpen}
        count={selectedIds.size}
        action={bulkAction}
        selectableCount={selectableEvents.length}
        userEmail={userEmail}
        onClose={() => {
          setBulkDialogOpen(false)
          setBulkAction(null)
        }}
        onConfirm={handleBulk}
        submitting={bulkSubmitting}
      />
    </div>
  )
}

// ─── Ligne de log + panneau terminal dépliable ───

function EventLogRow({
  event,
  expanded,
  onToggleExpanded,
  selected,
  selectable,
  onToggleSelect,
  onResolve,
  onIgnore,
  onEscalate,
}: {
  event: MonitoringEvent
  expanded: boolean
  onToggleExpanded: () => void
  selected: boolean
  selectable: boolean
  onToggleSelect: () => void
  onResolve: () => void
  onIgnore: () => void
  onEscalate: () => void
}) {
  const details = parseEventDetails(event)
  const resolutionNotes = details && typeof details.resolutionNotes === 'string' ? details.resolutionNotes : null
  const escalatedFrom = details && typeof details.escalatedFrom === 'string' ? details.escalatedFrom : null
  const originalSeverite =
    details && typeof details.originalSeverite === 'string' ? details.originalSeverite : null
  const genericEntries = details
    ? Object.entries(details).filter(([k]) => !DETAIL_SPECIAL_KEYS.has(k))
    : []
  const hasDetails = !!details || (!!event.details && event.details.trim() !== '')

  return (
    <div className={selected ? 'bg-primary/[0.06]' : undefined}>
      <div
        className={`flex flex-col gap-1.5 border-l-2 px-3 py-2.5 transition-colors md:grid md:grid-cols-[28px_26px_78px_100px_minmax(0,1fr)_100px_84px_88px_104px] md:items-center md:gap-x-2 md:gap-y-0 md:py-2 ${
          SEVERITY_RAIL[event.severite]
        } ${selected ? 'bg-primary/[0.06]' : 'hover:bg-accent/40'}`}
      >
        {/* Ligne méta (mobile) — aplatie en cellules de grille au desktop */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:contents">
          {selectable ? (
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={`Sélectionner l'événement ${event.message.slice(0, 40)}`}
            />
          ) : (
            <span className="block w-[16px]" aria-hidden="true" />
          )}
          {hasDetails ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-controls={`details-${event.id}`}
              aria-label={expanded ? 'Masquer les détails' : 'Afficher les détails'}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span aria-hidden="true" className="w-6" />
          )}

          {/* Horodatage */}
          <span
            className="font-mono text-[11px] leading-none tabular-nums text-muted-foreground md:col-start-3"
            title={formatDate(event.createdAt)}
          >
            {formatTime(event.createdAt)}
          </span>

          {/* Sévérité */}
          <span className="md:col-start-4">
            <SeverityBadge severite={event.severite} pulse={event.statut === 'ACTIF'} />
          </span>

          {/* Type — mobile uniquement (les chips portent l'info au desktop
              via le panneau dépliable) */}
          <span className="md:hidden">
            <TypeBadge type={event.type} />
          </span>

          {/* Statut */}
          <span className="ml-auto md:ml-0 md:col-start-8">
            <StatutBadge statut={event.statut} />
          </span>
        </div>

        {/* Message */}
        <p className="min-w-0 truncate text-sm md:col-start-5" title={event.message}>
          {event.message}
        </p>

        {/* Source */}
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground lg:block lg:col-start-6" title={event.source ?? undefined}>
          {event.source || '—'}
        </span>

        {/* Durée */}
        <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground xl:block xl:col-start-7">
          {formatDuration(event.duree)}
        </span>

        {/* Actions */}
        <div className="flex items-center justify-end gap-0.5 md:col-start-9">
          {event.statut === 'ACTIF' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                onClick={onResolve}
                title="Résoudre"
                aria-label={`Résoudre : ${event.message.slice(0, 40)}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"
                onClick={onIgnore}
                title="Ignorer"
                aria-label={`Ignorer : ${event.message.slice(0, 40)}`}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-warning hover:text-warning hover:bg-warning/10"
                onClick={onEscalate}
                title="Escalader au niveau critique"
                aria-label={`Escalader : ${event.message.slice(0, 40)}`}
              >
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
          {event.statut === 'RESOLU' && (
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-success-text"
              title={event.resoluPar ? `Résolu par ${event.resoluPar}` : undefined}
            >
              ✓ Traité
            </span>
          )}
          {event.statut === 'IGNORE' && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Ignoré</span>
          )}
        </div>
      </div>

      {/* ─── Panneau terminal (détails) ─── */}
      {expanded && (
        <div id={`details-${event.id}`} className="mon-terminal border-t border-white/[0.06] px-4 py-3.5 text-zinc-300">
          <p className="mb-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-lime-400/80">
            ▍Détails · {event.id.slice(0, 8)}…
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Type</p>
              <p className="mt-0.5 text-xs">
                <TypeBadge type={event.type} />
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Créé le</p>
              <p className="mt-0.5 font-mono text-[11px]">{formatDate(event.createdAt)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Mis à jour</p>
              <p className="mt-0.5 font-mono text-[11px]">{formatDate(event.updatedAt)}</p>
            </div>
            {event.statut === 'RESOLU' && (
              <>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Résolu le</p>
                  <p className="mt-0.5 font-mono text-[11px]">{formatDate(event.resoluLe)}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Résolu par</p>
                  <p className="mt-0.5 font-mono text-[11px] text-lime-400/90">{event.resoluPar || '—'}</p>
                </div>
              </>
            )}
          </div>

          {resolutionNotes && (
            <div className="mt-3 rounded-lg border border-lime-400/25 bg-lime-400/[0.07] p-2.5">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-lime-400">
                Notes de résolution
              </p>
              <p className="text-sm text-zinc-200">{resolutionNotes}</p>
            </div>
          )}

          {escalatedFrom && (
            <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-2.5">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-400">
                Escalade manuelle
              </p>
              <p className="font-mono text-[11px] text-zinc-300">
                escaladé depuis <span className="break-all text-amber-300/90">{escalatedFrom}</span>
                {originalSeverite && <> · sévérité d&apos;origine : {originalSeverite}</>}
              </p>
            </div>
          )}

          {genericEntries.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Payload technique
              </p>
              <dl className="overflow-hidden rounded-lg border border-white/[0.08]">
                {genericEntries.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(110px,auto)_1fr] gap-3 border-b border-white/[0.05] px-2.5 py-1.5 last:border-b-0">
                    <dt className="break-all font-mono text-[11px] text-lime-400/70">{key}</dt>
                    <dd className="break-all font-mono text-[11px] text-zinc-300">{detailValueToString(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {!details && event.details && event.details.trim() !== '' && (
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Détails (brut)
              </p>
              <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-2.5 font-mono text-[11px] text-zinc-300">
                {event.details}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
