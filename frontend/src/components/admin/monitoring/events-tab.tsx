// events-tab.tsx — Onglet « Événements » (SECT-MONITORING-UI-1).
//
// Flux complet : filtres backend (type/sévérité/statut/période) + pagination
// réelle (total = COUNT même WHERE — ADR-0011 §7), sélection multiple →
// action de masse (POST /api/monitoring/bulk), et LIGNES DÉPLIABLES qui
// révèlent le champ `details` parsé (notes de résolution, escalade, payload
// worker) + resoluLe/resoluPar + identifiant — avant, ces données backend
// n'étaient jamais affichées.

'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  Globe,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { MonitoringEvent } from './types'
import { SeverityBadge, StatutBadge, TypeBadge } from './badges'
import { formatDate, formatDuration, detailValueToString, parseEventDetails, DETAIL_SPECIAL_KEYS } from './utils'
import { useInvalidateMonitoring, useMonitoringEvents } from './use-monitoring'
import { bulkEventsAction, escalateEvent, ignoreEvent, resolveEvent } from './event-mutations'
import { BulkActionDialog, EscalateEventDialog, IgnoreEventDialog, ResolveEventDialog } from './event-dialogs'

const PAGE_SIZE = 50

export function EventsTab({
  autoRefresh,
  userEmail,
}: {
  autoRefresh: boolean
  userEmail: string
}) {
  // ─── Filtres (tout changement de filtre ramène à la page 1 — sans effet :
  // le reset se fait dans le setter, pas dans un useEffect) ───
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

  return (
    <div className="space-y-4">
      {/* ─── Toolbar filtres ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="relative sm:col-span-2 xl:col-span-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Rechercher (message, source)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Rechercher un événement"
          />
        </div>
        <Select value={typeFilter} onValueChange={changeFilter(setTypeFilter)}>
          <SelectTrigger className="w-full" aria-label="Filtrer par type">
            <Globe className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
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
          <SelectTrigger className="w-full" aria-label="Filtrer par sévérité">
            <AlertTriangle className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
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
          <SelectTrigger className="w-full" aria-label="Filtrer par statut">
            <Filter className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
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
          <SelectTrigger className="w-full" aria-label="Fenêtre temporelle">
            <Clock className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
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

      {/* Compteur contexte + reset */}
      {hasActiveFilters && !isLoading && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {totalEvents} résultat(s) pour les filtres actifs — page {page}/{totalPages}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setSearch('')
              setTypeFilter('all')
              setSeveriteFilter('all')
              setStatutFilter('all')
              setSinceHours('all')
              setPage(1)
            }}
          >
            Réinitialiser les filtres
          </Button>
        </div>
      )}

      {/* ─── Skeleton ─── */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <PulseSkeleton className="h-4 w-6" />
              <PulseSkeleton className="h-4 w-20" />
              <PulseSkeleton className="h-4 flex-1" />
              <PulseSkeleton className="h-4 w-24" />
              <PulseSkeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filteredEvents.length === 0 && (
        <div className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed py-16 relative overflow-hidden">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-10 w-10 text-success-text" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucun événement trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Aucun résultat ne correspond à vos filtres sur cette page.'
              : 'Aucun événement de monitoring enregistré. La plateforme fonctionne normalement.'}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
                setSeveriteFilter('all')
                setStatutFilter('all')
                setSinceHours('all')
                setPage(1)
              }}
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      )}

      {/* ─── Bulk toolbar ─── */}
      {selectedIds.size > 0 && !isLoading && (
        <div className="flex flex-col gap-3 rounded-lg border border-info/30 bg-info/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info/15">
              <CheckCircle2 className="h-4 w-4 text-info" aria-hidden="true" />
            </span>
            <span className="font-medium">
              {selectedIds.size} événement{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <span className="text-muted-foreground">— action de masse</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-success/40 text-success-text hover:bg-success/10 hover:text-success-text"
              disabled={bulkSubmitting}
              onClick={() => {
                setBulkAction('resoudre')
                setBulkDialogOpen(true)
              }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Résoudre ({selectedIds.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              disabled={bulkSubmitting}
              onClick={() => {
                setBulkAction('ignorer')
                setBulkDialogOpen(true)
              }}
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Ignorer ({selectedIds.size})
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" disabled={bulkSubmitting} onClick={clearSelection}>
              Annuler la sélection
            </Button>
          </div>
        </div>
      )}

      {/* ─── Table événements ─── */}
      {!isLoading && filteredEvents.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectableEvents.length === 0 ? false : allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tous les événements actifs de la page"
                      disabled={selectableEvents.length === 0}
                    />
                  </TableHead>
                  <TableHead className="w-[36px] sr-only">Détails</TableHead>
                  <TableHead className="w-[110px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Type
                  </TableHead>
                  <TableHead className="w-[130px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Sévérité
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Message
                  </TableHead>
                  <TableHead className="w-[110px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Source
                  </TableHead>
                  <TableHead className="w-[80px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Durée
                  </TableHead>
                  <TableHead className="w-[90px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Statut
                  </TableHead>
                  <TableHead className="w-[130px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Créé le
                  </TableHead>
                  <TableHead className="w-[96px] text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <EventRow
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
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ─── Pagination backend (ADR-0011 §7) ─── */}
      {!isLoading && totalEvents > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {totalEvents} événement{totalEvents > 1 ? 's' : ''} au total — page {page}/{totalPages} · {PAGE_SIZE} par page
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </Button>
            <span className="text-xs font-mono tabular-nums text-muted-foreground px-1">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant
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
      <IgnoreEventDialog
        target={ignoreTarget}
        onClose={() => setIgnoreTarget(null)}
        onConfirm={handleIgnore}
      />
      <EscalateEventDialog
        target={escalateTarget}
        onClose={() => setEscalateTarget(null)}
        onConfirm={handleEscalate}
      />
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

// ─── Ligne d'événement + panneau dépliable ───

function EventRow({
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
    <>
      <TableRow
        className={`group transition-colors ${selected ? 'bg-primary/5' : 'hover:bg-accent/50'}`}
        data-selected={selected}
      >
        <TableCell>
          {selectable ? (
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={`Sélectionner l'événement ${event.message.slice(0, 40)}`}
            />
          ) : (
            <span className="block w-[16px]" />
          )}
        </TableCell>
        <TableCell>
          {hasDetails && (
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
          )}
        </TableCell>
        <TableCell>
          <TypeBadge type={event.type} />
        </TableCell>
        <TableCell>
          <SeverityBadge severite={event.severite} pulse={event.statut === 'ACTIF'} />
        </TableCell>
        <TableCell>
          <p className="text-sm max-w-xs truncate" title={event.message}>
            {event.message}
          </p>
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">{event.source || '—'}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm font-mono tabular-nums">{formatDuration(event.duree)}</span>
        </TableCell>
        <TableCell>
          <StatutBadge statut={event.statut} />
        </TableCell>
        <TableCell>
          <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            {event.statut === 'ACTIF' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                  onClick={onResolve}
                  title="Résoudre"
                  aria-label={`Résoudre : ${event.message.slice(0, 40)}`}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                  onClick={onIgnore}
                  title="Ignorer"
                  aria-label={`Ignorer : ${event.message.slice(0, 40)}`}
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-warning hover:text-warning hover:bg-warning/10"
                  onClick={onEscalate}
                  title="Escalader au niveau critique"
                  aria-label={`Escalader : ${event.message.slice(0, 40)}`}
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
            {event.statut === 'RESOLU' && (
              <span className="text-xs text-success-text flex items-center gap-1" title={event.resoluPar ? `Résolu par ${event.resoluPar}` : undefined}>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Résolu
              </span>
            )}
            {event.statut === 'IGNORE' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Ban className="h-3 w-3" aria-hidden="true" />
                Ignoré
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={10} className="p-0">
            <div id={`details-${event.id}`} className="px-4 py-3 sm:px-6 space-y-3">
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Identifiant</p>
                  <p className="font-mono text-[11px] break-all">{event.id}</p>
                </div>
                {event.statut === 'RESOLU' && (
                  <>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Résolu le</p>
                      <p className="font-medium">{formatDate(event.resoluLe)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Résolu par</p>
                      <p className="font-medium">{event.resoluPar || '—'}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-muted-foreground mb-0.5">Mis à jour</p>
                  <p className="font-medium">{formatDate(event.updatedAt)}</p>
                </div>
              </div>

              {resolutionNotes && (
                <div className="rounded-lg border border-success/30 bg-success/10 p-2.5 dark:bg-success/20">
                  <p className="text-[11px] font-semibold text-success-text uppercase tracking-wide mb-1">
                    Notes de résolution
                  </p>
                  <p className="text-sm">{resolutionNotes}</p>
                </div>
              )}

              {escalatedFrom && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 dark:bg-warning/20">
                  <p className="text-[11px] font-semibold text-warning uppercase tracking-wide mb-1">
                    Escalade manuelle
                  </p>
                  <p className="text-xs">
                    Escaladé depuis{' '}
                    <code className="font-mono text-[11px] break-all">{escalatedFrom}</code>
                    {originalSeverite && (
                      <>
                        {' '}
                        (sévérité d&apos;origine :{' '}
                        <Badge variant="outline" className="text-[10px] mx-0.5">
                          {originalSeverite}
                        </Badge>
                        )
                      </>
                    )}
                  </p>
                </div>
              )}

              {genericEntries.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Détails techniques
                  </p>
                  <dl className="rounded-lg border divide-y">
                    {genericEntries.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(120px,auto)_1fr] gap-3 px-2.5 py-1.5">
                        <dt className="font-mono text-[11px] text-muted-foreground break-all">{key}</dt>
                        <dd className="text-xs font-mono break-all">{detailValueToString(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {!details && event.details && event.details.trim() !== '' && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Détails (brut)
                  </p>
                  <p className="rounded-lg border p-2.5 text-xs font-mono break-all bg-muted/50">
                    {event.details}
                  </p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
