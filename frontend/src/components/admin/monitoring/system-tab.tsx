// system-tab.tsx — Onglet « Système » : le couteau suisse admin (ADR-0011 §3,
// refonte SECT-MONITORING-UI-1, harmonisation console SECT-MONITORING-UI-2).
//
// Une seule source : GET /api/monitoring/overview. Améliorations refonte :
//   - Infrastructure expose les KPIs sécurité complets (autorisations en
//     attente/actives — composantes du score — en plus des établissements) ;
//   - workers : filtre par type + recherche, colonne « Démarré » (startedAt),
//     erreur copiable ;
//   - endpoints p50/p95 : recherche + tri par colonne (total/erreurs/p95) ;
//   - horodatage backend (generatedAt) affiché — plus de « dernière màj »
//     client exclusive.

'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  Copy,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  HeartPulse,
  Search,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
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
import type { EndpointsWindow, EndpointStat, OverviewData } from './types'
import { formatTime, formatUptimeLong, getTimeAgo } from './utils'
import { useEndpointsStats } from './use-monitoring'

export function SystemTab({
  overview,
  overviewLoading,
  autoRefresh,
  onRetryOverview,
}: {
  overview: OverviewData | null
  overviewLoading: boolean
  autoRefresh: boolean
  onRetryOverview: () => void
}) {
  const [endpointsWindow, setEndpointsWindow] = useState<EndpointsWindow>('24h')
  const endpointsQuery = useEndpointsStats(endpointsWindow, autoRefresh)
  const endpointsData = endpointsQuery.data ?? null

  if (overviewLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <PulseSkeleton key={i} className="h-24 w-full" variant="card" />
        ))}
      </div>
    )
  }

  if (!overview) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <Wrench className="h-8 w-8 text-warning" aria-hidden="true" />
          </div>
          <h3 className="mt-3 font-mono text-sm font-semibold uppercase tracking-[0.12em]">Vue système indisponible</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Impossible de récupérer la vue système (/api/monitoring/overview). Réessayez.
          </p>
          <Button variant="outline" className="mt-4" onClick={onRetryOverview}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Ligne 1 : runtime Go + infrastructure + tendance ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RuntimeCard overview={overview} />
        <InfrastructureCard overview={overview} />
        <TrendCard overview={overview} />
      </div>

      {/* ─── Ligne 2 : workers (registre ADR-0011 §4) ─── */}
      <WorkersCard overview={overview} />

      {/* ─── Ligne 3 : endpoints API p50/p95 (ADR-0012 §3) ─── */}
      <EndpointsCard
        endpointsData={endpointsData}
        loading={endpointsQuery.isLoading}
        window={endpointsWindow}
        onWindowChange={setEndpointsWindow}
      />

      {/* ─── Ligne 4 : décomposition du score ─── */}
      <ScoreBreakdownCard overview={overview} />

      <p className="text-[11px] text-muted-foreground text-right">
        Vue générée par le backend à {formatTime(overview.generatedAt)} (UTC){' '}
        {overview.runtime.goVersion} · process démarré depuis{' '}
        {formatUptimeLong(overview.runtime.uptimeSeconds)}.
      </p>
    </div>
  )
}

// ─── Runtime Go ───

function RuntimeCard({ overview }: { overview: OverviewData }) {
  const r = overview.runtime
  return (
    <Card className="ds-kente-top">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <Cpu className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
          Processus backend
        </CardTitle>
        <CardDescription className="font-mono text-[10px] uppercase tracking-wider">
          Runtime Go — mesures en direct
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Row label="Uptime" value={formatUptimeLong(r.uptimeSeconds)} mono />
        <Row label="Version Go" value={r.goVersion} mono />
        <Row
          label="Goroutines"
          value={String(r.goroutines)}
          mono
          valueClass={r.goroutines > 500 ? 'text-warning' : undefined}
        />
        <Row label="CPU logiques" value={String(r.numCPU)} mono />
        <Row label="Mémoire allouée" value={`${r.memAllocMB.toFixed(1)} Mo`} mono />
        <Row label="Mémoire système" value={`${r.memSysMB.toFixed(1)} Mo`} mono />
        <Row
          label="Cycles GC"
          value={`${r.numGC} (${r.gcPauseTotalMs.toFixed(0)} ms cumulés)`}
          mono
        />
      </CardContent>
    </Card>
  )
}

// ─── Infrastructure + KPIs sécurité ───

function InfrastructureCard({ overview }: { overview: OverviewData }) {
  const { db, storage, ai, maintenance, kpis } = overview
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <HardDrive className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
          Infrastructure
        </CardTitle>
        <CardDescription className="font-mono text-[10px] uppercase tracking-wider">
          DB, stockage, IA, maintenance, sécurité
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Row
          label="Base Neon"
          icon={<Database className="h-3.5 w-3.5" aria-hidden="true" />}
          value={db.down ? 'INDISPONIBLE' : `${db.latencyMs} ms · ${db.activeConns} conn. actives`}
          mono
          valueClass={db.down ? 'text-destructive' : 'text-success-text'}
        />
        <Row
          label="Stockage R2"
          icon={<HardDrive className="h-3.5 w-3.5" aria-hidden="true" />}
          value={
            storage.configured
              ? storage.reachable
                ? `Joignable (${storage.bucket || 'bucket'})`
                : 'Configuré, injoignable'
              : 'Non configuré'
          }
          mono
          valueClass={
            storage.reachable ? 'text-success-text' : storage.configured ? 'text-warning' : 'text-destructive'
          }
        />
        <Row
          label="Providers IA"
          icon={<Bot className="h-3.5 w-3.5" aria-hidden="true" />}
          value={`${ai.providersActifs} actif${ai.providersActifs > 1 ? 's' : ''}`}
          mono
          valueClass={ai.providersActifs > 0 ? 'text-success-text' : 'text-destructive'}
        />
        <Row
          label="Mode maintenance"
          value={maintenance.active ? 'ACTIF' : 'Inactif'}
          valueClass={maintenance.active ? 'text-warning' : 'text-success-text'}
        />
        <Row
          label="Autorisations en attente"
          value={String(kpis.autorisationsEnAttente)}
          mono
          valueClass={kpis.autorisationsEnAttente >= 10 ? 'text-destructive font-semibold' : kpis.autorisationsEnAttente > 0 ? 'text-warning' : undefined}
        />
        <Row label="Autorisations actives" value={String(kpis.autorisationsActives)} mono />
        <Row label="Établissements proctoring" value={String(kpis.etablissementsProteges)} mono />
        <Row label="Vérification d'identité" value={String(kpis.verificationIdentite)} mono />
      </CardContent>
    </Card>
  )
}

// ─── Tendance 7 jours ───

function TrendCard({ overview }: { overview: OverviewData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <TrendingUp className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
          Tendance (7 jours)
        </CardTitle>
        <CardDescription className="font-mono text-[10px] uppercase tracking-wider">
          Événements créés par jour et sévérité
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <TrendChart data={overview.trend} />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          NB : les événements RESOLU de plus de 24 h sont purgés — les jours passés sous-comptent les
          événements résolus entre-temps.
        </p>
      </CardContent>
    </Card>
  )
}

// Chart lazy — évite de charger recharts dans le bundle initial de /monitoring.
const TrendChartLazy = dynamic(
  () =>
    import('./trend-chart').then((m) => m.TrendChart),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Chargement du graphique…
      </div>
    ),
    ssr: false,
  }
)

function TrendChart({ data }: { data: OverviewData['trend'] }) {
  return <TrendChartLazy data={data} />
}

// ─── Workers ───

function WorkersCard({ overview }: { overview: OverviewData }) {
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const workers = useMemo(() => {
    let list = overview.workers
    if (kindFilter !== 'all') list = list.filter((w) => w.kind === kindFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (w) => w.label.toLowerCase().includes(q) || w.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [overview.workers, kindFilter, search])

  const inErrorCount = overview.workers.filter((w) => w.lastError).length

  const copyError = async (error: string) => {
    try {
      await navigator.clipboard.writeText(error)
      toast.success('Erreur copiée dans le presse-papiers')
    } catch {
      toast.error('Copie impossible — sélectionnez le texte manuellement')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              <Wrench className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
              Workers ({overview.workers.length})
              {inErrorCount > 0 && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  {inErrorCount} en erreur
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl font-mono text-[10px] uppercase tracking-wider">
              Tâches de fond — périodiques instrumentés (durée, erreurs, panic-safe) · files à la demande
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="h-8 w-36 pl-7 text-xs"
                aria-label="Rechercher un worker"
              />
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-32 text-xs" aria-label="Filtrer les workers par type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                <SelectItem value="periodique">Périodiques</SelectItem>
                <SelectItem value="file">Files</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <Th>Worker</Th>
                <Th>Type</Th>
                <Th>Intervalle</Th>
                <Th className="text-right">Exécutions</Th>
                <Th className="text-right">Erreurs</Th>
                <Th>Dernier run</Th>
                <Th className="text-right">Durée</Th>
                <Th>Démarré</Th>
                <Th>État</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((wk) => {
                const inError = !!wk.lastError
                const neverRan = wk.kind === 'periodique' && wk.runs === 0
                return (
                  <TableRow key={wk.name} className={inError ? 'bg-destructive/5' : undefined}>
                    <TableCell>
                      <p className="text-sm font-medium">{wk.label}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{wk.name}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {wk.kind === 'periodique' ? 'Périodique' : 'File'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {wk.intervalLabel}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">{wk.runs}</TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums text-sm ${wk.errors > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                    >
                      {wk.errors}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {wk.lastRunAt ? getTimeAgo(wk.lastRunAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {wk.lastDurationMs > 0 ? `${wk.lastDurationMs} ms` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {wk.startedAt ? getTimeAgo(wk.startedAt) : '—'}
                    </TableCell>
                    <TableCell>
                      {inError ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] gap-1 bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => void copyError(wk.lastError)}
                          title={wk.lastError}
                          aria-label={`Copier l'erreur du worker ${wk.label}`}
                        >
                          Erreur
                          <Copy className="h-2.5 w-2.5" aria-hidden="true" />
                        </Button>
                      ) : neverRan ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          En attente
                        </Badge>
                      ) : wk.runs > 0 ? (
                        <Badge className="bg-success/10 text-success-text border-success/30 text-[10px]">
                          {wk.kind === 'file' ? 'Écoute' : 'Actif'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Écoute
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {workers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Aucun worker ne correspond au filtre.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Endpoints p50/p95 ───

type SortKey = 'total' | 'errors' | 'p95Ms'

function EndpointsCard({
  endpointsData,
  loading,
  window,
  onWindowChange,
}: {
  endpointsData: import('./types').EndpointsData | null
  loading: boolean
  window: EndpointsWindow
  onWindowChange: (w: EndpointsWindow) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  const endpoints = useMemo(() => {
    let list = [...(endpointsData?.endpoints ?? [])]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (ep) => ep.route.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortDir === 'asc' ? diff : -diff
    })
    return list
  }, [endpointsData, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              <Gauge className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
              Endpoints API — latence p50/p95
            </CardTitle>
            <CardDescription className="font-mono text-[10px] uppercase tracking-wider">
              Échantillonnage réel /api (routes normalisées) · fenêtre sélectionnable · rétention 7 j
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Route…"
                className="h-8 w-32 pl-7 text-xs"
                aria-label="Rechercher une route"
              />
            </div>
            <Select value={window} onValueChange={(v) => onWindowChange(v as EndpointsWindow)}>
              <SelectTrigger className="w-24 h-8 text-xs" aria-label="Fenêtre temporelle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 heure</SelectItem>
                <SelectItem value="24h">24 heures</SelectItem>
                <SelectItem value="7d">7 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <PulseSkeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : endpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Gauge className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              {search
                ? 'Aucune route ne correspond à la recherche sur cette fenêtre.'
                : 'Aucune requête échantillonnée sur cette fenêtre.'}
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <Th>Endpoint</Th>
                  <SortHeaderTh label="Requêtes" k="total" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortHeaderTh label="Erreurs 5xx" k="errors" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <Th className="text-right">p50</Th>
                  <SortHeaderTh label="p95" k="p95Ms" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <Th className="text-right">Moy</Th>
                  <Th className="text-right">Max</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((ep: EndpointStat) => {
                  const slow = ep.p95Ms > 3000
                  return (
                    <TableRow key={`${ep.method} ${ep.route}`} className={ep.errors > 0 ? 'bg-destructive/5' : undefined}>
                      <TableCell>
                        <p className="text-xs font-medium truncate max-w-72" title={`${ep.method} ${ep.route}`}>
                          <span className="font-mono text-muted-foreground mr-1.5">{ep.method}</span>
                          {ep.route}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">{ep.total}</TableCell>
                      <TableCell
                        className={`text-right font-mono tabular-nums text-sm ${ep.errors > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                      >
                        {ep.errors > 0 ? `${ep.errors} (${(ep.errorRate * 100).toFixed(1)} %)` : '0'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">{ep.p50Ms} ms</TableCell>
                      <TableCell className={`text-right font-mono tabular-nums text-sm font-semibold ${slow ? 'text-warning' : ''}`}>
                        {ep.p95Ms} ms{slow ? ' ⚠' : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                        {ep.avgMs} ms
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                        {ep.maxMs} ms
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          p95 &gt; 3 s mis en évidence — les patterns {"{id}"} regroupent les requêtes d&apos;une même
          route (UUID normalisés). Tri par colonne cliquable.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Décomposition du score ───

function ScoreBreakdownCard({ overview }: { overview: OverviewData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <HeartPulse className="h-3.5 w-3.5 text-success-text" aria-hidden="true" />
          Décomposition du score ({overview.score.score}/100)
        </CardTitle>
        <CardDescription className="font-mono text-[10px] uppercase tracking-wider">
          Formule backend unique — même source que le panneau héro et le dashboard (ADR-0011)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {overview.score.breakdown.map((c) => (
            <div
              key={c.label}
              className={`flex items-center justify-between rounded-lg border p-2.5 ${c.penalty < 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">{c.detail}</p>
              </div>
              <span
                className={`font-mono font-semibold shrink-0 ml-3 ${c.penalty < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {c.penalty < 0 ? c.penalty : '—'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Petits helpers partagés ───

function Row({
  label,
  value,
  icon,
  mono,
  valueClass,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  mono?: boolean
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className={`font-semibold shrink-0 ${mono ? 'font-mono tabular-nums' : ''} ${valueClass ?? ''}`}>
        {value}
      </span>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead
      className={`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display ${className}`}
    >
      {children}
    </TableHead>
  )
}

/** En-tête de colonne triable (endpoints) — composant de niveau module
 *  (pas créé au render), aria-sort posé sur le <th> (rôle supporté). */
function SortHeaderTh({
  label,
  k,
  activeKey,
  dir,
  onToggle,
}: {
  label: string
  k: SortKey
  activeKey: SortKey
  dir: 'asc' | 'desc'
  onToggle: (k: SortKey) => void
}) {
  const isActive = activeKey === k
  return (
    <TableHead
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display"
    >
      <button
        type="button"
        onClick={() => onToggle(k)}
        aria-label={`Trier par ${label.toLowerCase()}`}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {!isActive ? (
          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
        ) : dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  )
}
