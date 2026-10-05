'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Globe,
  Database,
  Shield,
  ClipboardCheck,
  CreditCard,
  Server,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock,
  Loader2,
  Eye,
  Ban,
  ArrowUpRight,
  Bell,
  BellRing,
  Settings2,
  Zap,
  HeartPulse,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  ChevronDown,
  Sparkles,
  Wrench,
  Cpu,
  HardDrive,
  Bot,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { StatCard, ProgressRing, EntityCard, PulseSkeleton, GlassModal } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'

// ─── Types ───

interface MonitoringEvent {
  id: string
  type: 'API' | 'DATABASE' | 'AUTH' | 'EVALUATION' | 'PAYMENT' | 'SYSTEM'
  severite: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  message: string
  details: Record<string, unknown> | null
  source: string | null
  duree: number | null
  statut: 'ACTIF' | 'RESOLU' | 'IGNORE'
  resoluLe: string | null
  resoluPar: string | null
  createdAt: string
  updatedAt: string
}

interface MonitoringStats {
  activeCount: number
  criticalCount: number
  errorCount: number
  // ADR-0011 §7 : stats étendues (alignement avec /api/stats/admin).
  warningCount: number
  resolvedToday: number
  resolved24h: number
}

// ADR-0011 §3 — types de GET /api/monitoring/overview (le « couteau suisse »).
interface OverviewScore {
  score: number
  verdict: 'BONNE_SANTE' | 'ATTENTION' | 'URGENT'
  breakdown: Array<{ label: string; detail: string; penalty: number }>
}

interface OverviewWorker {
  name: string
  label: string
  kind: 'periodique' | 'file'
  intervalLabel: string
  runs: number
  errors: number
  lastRunAt: string
  lastDurationMs: number
  lastError: string
  startedAt: string
}

interface OverviewData {
  score: OverviewScore
  kpis: {
    activeEvents: number
    criticalEvents: number
    errorEvents: number
    warningEvents: number
    resolvedToday: number
    resolved24h: number
    autorisationsEnAttente: number
    autorisationsActives: number
    etablissementsProteges: number
    verificationIdentite: number
  }
  runtime: {
    uptimeSeconds: number
    goVersion: string
    goroutines: number
    numCPU: number
    memAllocMB: number
    memSysMB: number
    numGC: number
    gcPauseTotalMs: number
  }
  db: { down: boolean; latencyMs: number; activeConns: number }
  storage: { configured: boolean; reachable: boolean; bucket: string }
  ai: { providersActifs: number }
  maintenance: { active: boolean; message: string }
  workers: OverviewWorker[]
  trend: Array<{ date: string; critical: number; error: number; warning: number; info: number }>
  generatedAt: string
}

interface ServiceHealth {
  name: string
  type: MonitoringEvent['type']
  status: 'OPERATIONNEL' | 'DEGRADE' | 'INDISPONIBLE'
  uptime: number
  avgResponseTime: number
  lastIncident: string | null
  lastError: string
  activeConns: number
  icon: LucideIcon
}

// Bug B2 (audit monitoring 2025) : types pour le healthcheck backend réel
// ADR-0011 : uptime est vide (plus de SLA hardcodé) + activeConns exposé.
interface ServiceStatus {
  name: string
  status: string
  uptime: string
  latency: number
  lastCheck: string
  lastError: string
  activeConns?: number
}

interface HealthReport {
  services: ServiceStatus[]
  overall: string
  healthyCount: number
  totalCount: number
  checkedAt: string
}

// ADR-0011 §5 : les 6 « règles d'alerte » MOCK (valeurs inventées, toggles
// sans backend) sont remplacées par des SEUILS SYSTÈME RÉELS dérivés de
// /api/monitoring/overview — lecture seule, aucune valeur fabriquée.
interface SystemThreshold {
  name: string
  threshold: number
  current: number
  severite: MonitoringEvent['severite']
  unit: string
  inverted?: boolean // true = « au-dessus du seuil » est le bon état (ex: providers IA)
  detail: string
}

// ─── Constants ───

const TYPE_ICONS: Record<MonitoringEvent['type'], React.ComponentType<{ className?: string }>> = {
  API: Globe,
  DATABASE: Database,
  AUTH: Shield,
  EVALUATION: ClipboardCheck,
  PAYMENT: CreditCard,
  SYSTEM: Server,
}

const TYPE_LABELS: Record<MonitoringEvent['type'], string> = {
  API: 'API',
  DATABASE: 'Base de données',
  AUTH: 'Authentification',
  EVALUATION: 'Évaluation',
  PAYMENT: 'Paiement',
  SYSTEM: 'Système',
}

const SEVERITY_CONFIG: Record<MonitoringEvent['severite'], { label: string; color: string; bg: string; border: string; darkBg: string; darkColor: string; darkBorder: string; icon: React.ComponentType<{ className?: string }> }> = {
  INFO: {
    label: 'Info',
    color: 'text-info',
    bg: 'bg-info/10',
    border: 'border-info/30',
    darkBg: 'dark:bg-info/40',
    darkColor: 'dark:text-info/80',
    darkBorder: 'dark:border-info/70',
    icon: Info,
  },
  WARNING: {
    label: 'Avertissement',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    darkBg: 'dark:bg-warning/40',
    darkColor: 'dark:text-warning/80',
    darkBorder: 'dark:border-warning/70',
    icon: AlertTriangle,
  },
  ERROR: {
    label: 'Erreur',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    darkBg: 'dark:bg-destructive/40',
    darkColor: 'dark:text-destructive/80',
    darkBorder: 'dark:border-destructive/70',
    icon: XCircle,
  },
  CRITICAL: {
    label: 'Critique',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    border: 'border-secondary/30',
    darkBg: 'dark:bg-secondary/40',
    darkColor: 'dark:text-secondary/80',
    darkBorder: 'dark:border-secondary/70',
    icon: AlertOctagon,
  },
}

const STATUS_CONFIG: Record<MonitoringEvent['statut'], { label: string; color: string; bg: string; border: string; darkBg: string; darkColor: string; darkBorder: string }> = {
  ACTIF: {
    label: 'Actif',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    darkBg: 'dark:bg-warning/40',
    darkColor: 'dark:text-warning/80',
    darkBorder: 'dark:border-warning/70',
  },
  RESOLU: {
    label: 'Résolu',
    color: 'text-success-text',
    bg: 'bg-success/10',
    border: 'border-success/30',
    darkBg: 'dark:bg-success/40',
    darkColor: 'dark:text-success-text/80',
    darkBorder: 'dark:border-success/70',
  },
  IGNORE: {
    label: 'Ignoré',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    darkBg: 'dark:bg-muted/80',
    darkColor: 'dark:text-muted-foreground',
    darkBorder: 'dark:border-border',
  },
}

const SERVICE_STATUS_CONFIG: Record<ServiceHealth['status'], { label: string; dotColor: string; bgColor: string; borderColor: string; darkBgColor: string; darkBorderColor: string; textColor: string; darkTextColor: string }> = {
  OPERATIONNEL: {
    label: 'Opérationnel',
    dotColor: 'bg-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    darkBgColor: 'dark:bg-success/20',
    darkBorderColor: 'dark:border-success/70',
    textColor: 'text-success-text',
    darkTextColor: 'dark:text-success-text/80',
  },
  DEGRADE: {
    label: 'Dégradé',
    dotColor: 'bg-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    darkBgColor: 'dark:bg-warning/20',
    darkBorderColor: 'dark:border-warning/70',
    textColor: 'text-warning',
    darkTextColor: 'dark:text-warning/80',
  },
  INDISPONIBLE: {
    label: 'Indisponible',
    dotColor: 'bg-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    darkBgColor: 'dark:bg-destructive/20',
    darkBorderColor: 'dark:border-destructive/70',
    textColor: 'text-destructive',
    darkTextColor: 'dark:text-destructive/80',
  },
}

// ─── Utility Functions ───

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

// ADR-0011 : uptime lisible du process backend (onglet Système).
function formatUptimeLong(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} j ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

function getTimeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'À l\'instant'
  if (diffMins < 60) return `Il y a ${diffMins}min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  return `Il y a ${diffDays}j`
}

// ─── HealthGauge supprimé : remplacé par ProgressRing (Design System Savane) ───

// ─── Severity Badge ───

function SeverityBadge({ severite }: { severite: MonitoringEvent['severite'] }) {
  const config = SEVERITY_CONFIG[severite]
  const isCriticalOrError = severite === 'CRITICAL' || severite === 'ERROR'

  return (
    <Badge
      className={`${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder} text-xs font-medium gap-1 ${
        isCriticalOrError ? 'animate-pulse' : ''
      }`}
    >
      <config.icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ─── Type Badge ───

function TypeBadge({ type }: { type: MonitoringEvent['type'] }) {
  const Icon = TYPE_ICONS[type]
  return (
    <Badge variant="outline" className="text-xs font-medium gap-1">
      <Icon className="h-3 w-3" />
      {TYPE_LABELS[type]}
    </Badge>
  )
}

// ─── Status Badge ───

function StatutBadge({ statut }: { statut: MonitoringEvent['statut'] }) {
  const config = STATUS_CONFIG[statut]
  return (
    <Badge
      className={`${config.bg} ${config.color} ${config.border} ${config.darkBg} ${config.darkColor} ${config.darkBorder} text-xs font-medium`}
    >
      {config.label}
    </Badge>
  )
}

// ─── Service Health Card ───

function ServiceHealthCard({ service, index = 0 }: { service: ServiceHealth; index?: number }) {
  const statusConfig = SERVICE_STATUS_CONFIG[service.status]
  const statusVariant: 'success' | 'warning' | 'danger' =
    service.status === 'OPERATIONNEL' ? 'success' : service.status === 'DEGRADE' ? 'warning' : 'danger'

  return (
    <EntityCard
      title={service.name}
      subtitle={TYPE_LABELS[service.type]}
      thumbnailIcon={service.icon}
      badge={{ label: statusConfig.label, variant: statusVariant }}
      index={index}
    >
      {/* ADR-0011 : plus d'uptime % fabriqué — latence mesurée, connexions
          DB réelles et dernière erreur du healthcheck backend. */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-0.5">Latence mesurée</p>
          <p className={`font-semibold font-mono tabular-nums ${service.avgResponseTime <= 200 ? 'text-success-text' : service.avgResponseTime <= 500 ? 'text-warning' : 'text-destructive'}`}>
            {service.avgResponseTime}ms
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">
            {service.type === 'DATABASE' ? 'Connexions actives' : 'Dernier incident'}
          </p>
          <p className="font-semibold font-mono tabular-nums">
            {service.type === 'DATABASE'
              ? service.activeConns
              : service.lastIncident
                ? getTimeAgo(service.lastIncident)
                : '—'}
          </p>
        </div>
        {service.lastError && (
          <div className="col-span-2">
            <p className="text-muted-foreground mb-0.5">Dernière erreur</p>
            <p className="font-medium text-xs text-destructive line-clamp-2" title={service.lastError}>
              {service.lastError}
            </p>
          </div>
        )}
      </div>
    </EntityCard>
  )
}

// ─── Alert Card ───

function AlertCard({
  event,
  onResolve,
  onEscalate,
  onIgnore,
}: {
  event: MonitoringEvent
  onResolve: (event: MonitoringEvent) => void
  onEscalate: (event: MonitoringEvent) => void
  onIgnore: (event: MonitoringEvent) => void
}) {
  const config = SEVERITY_CONFIG[event.severite]
  const SeverityIcon = config.icon

  const getSuggestedAction = (ev: MonitoringEvent): string => {
    if (ev.severite === 'CRITICAL') return 'Intervention immédiate requise — vérifier le service et redémarrer si nécessaire'
    if (ev.severite === 'ERROR') return 'Analyser les logs et corriger la cause racine'
    if (ev.severite === 'WARNING') return 'Surveiller l\'évolution et envisager une action préventive'
    return 'Information à consulter — aucune action immédiate nécessaire'
  }

  return (
    <Card className={`${config.border} ${config.darkBorder} transition-all hover:shadow-sm`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg} ${config.darkBg}`}>
            <SeverityIcon className={`h-4.5 w-4.5 ${config.color} ${config.darkColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severite={event.severite} />
              <TypeBadge type={event.type} />
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {getTimeAgo(event.createdAt)}
              </span>
            </div>
            <h4 className="text-sm font-medium mt-1.5 leading-snug">{event.message}</h4>
            {event.source && (
              <p className="text-xs text-muted-foreground mt-1">Source : {event.source}</p>
            )}
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 inline mr-1" />
              {getSuggestedAction(event)}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-success/30 text-success-text hover:bg-success/10"
                onClick={() => onResolve(event)}
              >
                <CheckCircle2 className="h-3 w-3" />
                Résoudre
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-warning/30 text-warning hover:bg-warning/10"
                onClick={() => onEscalate(event)}
              >
                <ArrowUpRight className="h-3 w-3" />
                Escalader
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border text-muted-foreground hover:bg-muted"
                onClick={() => onIgnore(event)}
              >
                <Ban className="h-3 w-3" />
                Ignorer
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ───

export function MonitoringPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // ─── Data state ───
  const [autoRefresh, setAutoRefresh] = useState(true)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [severiteFilter, setSeveriteFilter] = useState<string>('all')
  const [statutFilter, setStatutFilter] = useState<string>('all')
  // ADR-0011 §7 — pagination + fenêtre temporelle.
  const [page, setPage] = useState(1)
  const [sinceHours, setSinceHours] = useState<string>('all')
  const pageSize = 50

  // BUGFIX QUERY-MIGRATION-GROUP-A : migration de useEffect+fetch+useState
  // vers TanStack Query. Le cache survit au démontage → 0 refetch au retour,
  // 0 skeleton, navigation instantanée. Le polling 30s est géré par
  // refetchInterval (auto-cleanup au démontage, plus de fuite mémoire).
  const monitoringQuery = useQuery<{ events: MonitoringEvent[]; stats: MonitoringStats; total: number; page: number; pageSize: number }>({
    queryKey: ['monitoring', typeFilter, severiteFilter, statutFilter, sinceHours, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      if (severiteFilter && severiteFilter !== 'all') params.set('severite', severiteFilter)
      if (statutFilter && statutFilter !== 'all') params.set('statut', statutFilter)
      // ADR-0011 §7 : fenêtre temporelle + pagination backend.
      if (sinceHours !== 'all') params.set('since', sinceHours)
      params.set('page', String(page))
      params.set('limit', String(pageSize))

      const res = await fetch(`/api/monitoring?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch monitoring data')
      return res.json()
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    // Auto-refresh 30s conditionnel (autoRefresh toggle). Auto-cleanup au démontage.
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })

  const events = monitoringQuery.data?.events ?? []
  const stats = monitoringQuery.data?.stats ?? { activeCount: 0, criticalCount: 0, errorCount: 0, warningCount: 0, resolvedToday: 0, resolved24h: 0 }
  const totalEvents = monitoringQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEvents / pageSize))

  // ADR-0011 §7 : tout changement de filtre ramène à la page 1.
  useEffect(() => {
    setPage(1)
  }, [typeFilter, severiteFilter, statutFilter, sinceHours])
  const lastRefresh =
    monitoringQuery.dataUpdatedAt > 0 ? new Date(monitoringQuery.dataUpdatedAt) : new Date()

  // Local state pour le bouton "Actualiser" : préserve le comportement
  // d'origine où le bouton force isLoading=true le temps du refetch manuel
  // (sans déclencher les skeletons pendant le polling 30s en arrière-plan).
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const isLoading = monitoringQuery.isLoading || isManualRefreshing

  // Helper pour invalider le cache après mutation (resolve/ignore/escalade).
  const refreshData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['monitoring'] })
  }

  // Bouton "Actualiser" : force un refetch manuel et un état loading local.
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true)
    try {
      await monitoringQuery.refetch()
    } finally {
      setIsManualRefreshing(false)
    }
  }

  // ─── Dialog state ───
  const [resolveTarget, setResolveTarget] = useState<MonitoringEvent | null>(null)
  const [ignoreTarget, setIgnoreTarget] = useState<MonitoringEvent | null>(null)
  const [escalateTarget, setEscalateTarget] = useState<MonitoringEvent | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Computed: filtered events ───
  const filteredEvents = events.filter((e) => {
    const matchSearch =
      !search ||
      e.message.toLowerCase().includes(search.toLowerCase()) ||
      (e.source && e.source.toLowerCase().includes(search.toLowerCase()))
    return matchSearch
  })

  // ─── Bulk selection state (déclaré après filteredEvents car selectableEvents en dépend) ───
  // Sélection multiple pour action de masse (résoudre/ignorer plusieurs événements).
  // Seuls les événements ACTIF sont sélectionnables (les RESOLU/IGNORE ne peuvent plus
  // changer de statut). La sélection est réinitialisée à chaque refetch car les
  // événements traités disparaissent de la liste filtrée.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'resoudre' | 'ignorer' | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  // Événements ACTIF sélectionnables parmi les événements filtrés.
  const selectableEvents = useMemo(
    () => filteredEvents.filter((e) => e.statut === 'ACTIF'),
    [filteredEvents]
  )
  const allSelectableSelected =
    selectableEvents.length > 0 && selectableEvents.every((e) => selectedIds.has(e.id))
  const someSelectableSelected = selectableEvents.some((e) => selectedIds.has(e.id))

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableEvents.map((e) => e.id)))
    }
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

  // ─── Bulk action handler ───
  // Appelle POST /api/monitoring/bulk { ids, action } puis invalide le cache.
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    setBulkSubmitting(true)
    try {
      const res = await fetch('/api/monitoring/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selectedIds],
          action: bulkAction,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erreur lors de l'action de masse")
      }
      const data = await res.json()
      const actionLabel = bulkAction === 'resoudre' ? 'résolus' : 'ignorés'
      toast.success('Action de masse terminée', {
        description: `${data.updated} événement(s) ${actionLabel} sur ${data.total} sélectionné(s).`,
      })
      setBulkDialogOpen(false)
      setBulkAction(null)
      clearSelection()
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : "Impossible d'effectuer l'action de masse.",
      })
    } finally {
      setBulkSubmitting(false)
    }
  }

  // ─── Computed: health metrics from events data ───
  const activeErrorEvents = events.filter((e) => e.statut === 'ACTIF' && e.severite === 'ERROR')
  const activeCriticalEvents = events.filter((e) => e.statut === 'ACTIF' && e.severite === 'CRITICAL')

  // Bug B2 (audit monitoring 2025) : fetch real health data from backend
  // au lieu d'afficher des valeurs hardcodées (99.98%, 142ms, etc.)
  const healthQuery = useQuery({
    queryKey: ['monitoring-health'],
    queryFn: async () => {
      const res = await fetch('/api/monitoring/health')
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })

  const healthData: HealthReport | null = healthQuery.data ?? null

  // ─── ADR-0011 §3 — vue système complète (le « couteau suisse ») ───
  // Score santé BACKEND (même formule que la carte du dashboard admin),
  // runtime Go, workers, DB, R2, IA, maintenance, tendance 7 jours.
  const overviewQuery = useQuery<OverviewData>({
    queryKey: ['monitoring-overview'],
    queryFn: async () => {
      const res = await fetch('/api/monitoring/overview')
      if (!res.ok) throw new Error('Failed to fetch overview')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
  const overview: OverviewData | null = overviewQuery.data ?? null

  // ADR-0011 §5 — seuils système RÉELS (remplacent les 6 règles mock) :
  // dérivés des mesures d'overview, lecture seule, zéro valeur fabriquée.
  const systemThresholds: SystemThreshold[] = useMemo(() => {
    const o = overview
    const k = o?.kpis
    const workersInError = (o?.workers ?? []).filter((w) => w.lastError).length
    return [
      {
        name: 'Événements critiques actifs',
        threshold: 1,
        current: k?.criticalEvents ?? 0,
        severite: 'CRITICAL',
        unit: '',
        detail: 'Tolérance zéro — un critique actif exige une action',
      },
      {
        name: 'Erreurs actives',
        threshold: 5,
        current: k?.errorEvents ?? 0,
        severite: 'ERROR',
        unit: '',
        detail: 'Au-delà de 5 erreurs actives, investiguer la cause racine',
      },
      {
        name: 'Backlog autorisations',
        threshold: 5,
        current: k?.autorisationsEnAttente ?? 0,
        severite: 'WARNING',
        unit: '',
        detail: 'Demandes d\'assistance en attente de validation',
      },
      {
        name: 'Latence base de données',
        threshold: 1000,
        current: o?.db.latencyMs ?? 0,
        severite: 'WARNING',
        unit: ' ms',
        detail: 'Ping Neon mesuré à chaque rafraîchissement',
      },
      {
        name: 'Fournisseurs IA actifs',
        threshold: 1,
        current: o?.ai.providersActifs ?? 0,
        severite: 'ERROR',
        unit: '',
        inverted: true,
        detail: 'Au moins 1 provider actif requis (génération + correction)',
      },
      {
        name: 'Workers en erreur',
        threshold: 1,
        current: workersInError,
        severite: 'ERROR',
        unit: '',
        inverted: true,
        detail: 'Workers périodiques dont la dernière exécution a échoué',
      },
    ]
  }, [overview])

  // ─── Computed: service health from real backend healthcheck ───
  const computeServiceHealth = useCallback((): ServiceHealth[] => {
    // Bug B2 fix : utilise les vraies données du backend si disponibles
    if (healthData && healthData.services) {
      return healthData.services.map((s: ServiceStatus) => {
        const iconMap: Record<string, typeof Globe> = {
          'API': Globe,
          'DATABASE': Database,
          'AUTH': Shield,
          'EVALUATION': ClipboardCheck,
          'PAYMENT': CreditCard,
          'SYSTEM': Server,
        }
        return {
          name: s.name,
          type: s.name.includes('Base') ? 'DATABASE' : s.name.includes('Auth') ? 'AUTH' : s.name.includes('éval') ? 'EVALUATION' : s.name.includes('Paiement') ? 'PAYMENT' : s.name.includes('Proctoring') ? 'SYSTEM' : 'API',
          status: s.status as ServiceHealth['status'],
          // ADR-0011 : uptime factice supprimé (le backend ne renvoie plus de
          // SLA hardcodé) — on affiche latence mesurée + connexions + erreurs.
          uptime: 0,
          avgResponseTime: s.latency,
          lastIncident: s.lastError ? s.lastCheck : null,
          lastError: s.lastError || '',
          activeConns: s.activeConns ?? 0,
          icon: iconMap[s.name] || Globe,
        }
      })
    }

    // Fallback : valeurs neutres si l'API health n'est pas disponible
    const services: ServiceHealth[] = [
      { name: 'API Gateway', type: 'API', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: Globe },
      { name: 'Base de données', type: 'DATABASE', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: Database },
      { name: 'Service d\'authentification', type: 'AUTH', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: Shield },
      { name: 'Moteur d\'évaluation', type: 'EVALUATION', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: ClipboardCheck },
      { name: 'Service de paiement', type: 'PAYMENT', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: CreditCard },
      { name: 'Proctoring IA', type: 'SYSTEM', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, lastError: '', activeConns: 0, icon: Server },
    ]

    // Adjust service health based on active events
    for (const service of services) {
      const serviceActiveEvents = events.filter(
        (e) => e.type === service.type && e.statut === 'ACTIF'
      )
      const criticalEvents = serviceActiveEvents.filter((e) => e.severite === 'CRITICAL')
      const errorEvents = serviceActiveEvents.filter((e) => e.severite === 'ERROR')
      const warningEvents = serviceActiveEvents.filter((e) => e.severite === 'WARNING')

      if (criticalEvents.length > 0) {
        service.status = 'INDISPONIBLE'
        service.lastError = criticalEvents[0].message
        service.lastIncident = criticalEvents[0].createdAt
      } else if (errorEvents.length > 0) {
        service.status = 'DEGRADE'
        service.lastError = errorEvents[0].message
        service.lastIncident = errorEvents[0].createdAt
      } else if (warningEvents.length > 0) {
        service.lastIncident = warningEvents[0].createdAt
      }

      // Adjust response time based on events
      const avgDur = serviceActiveEvents.length > 0
        ? serviceActiveEvents.filter((e) => e.duree !== null).reduce((s, e) => s + (e.duree ?? 0), 0) / Math.max(1, serviceActiveEvents.filter((e) => e.duree !== null).length)
        : 0

      if (avgDur > 0) {
        service.avgResponseTime = Math.round((service.avgResponseTime + avgDur) / 2)
      }
    }

    return services
  }, [events])

  const serviceHealths = computeServiceHealth()

  // ─── Computed: active alerts (sorted by priority) ───
  const priorityOrder: Record<MonitoringEvent['severite'], number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 }
  const activeAlerts = events
    .filter((e) => e.statut === 'ACTIF' && (e.severite === 'CRITICAL' || e.severite === 'ERROR' || e.severite === 'WARNING'))
    .sort((a, b) => priorityOrder[a.severite] - priorityOrder[b.severite])

  // ─── Resolve event ───
  const handleResolve = async () => {
    if (!resolveTarget) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/monitoring/${resolveTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resoudre',
          resoluPar: user?.email ?? 'admin',
          // ADR-0011 §5 : notes désormais PERSISTÉES (fusionnées dans
          // details.resolutionNotes côté backend — avant : toast only).
          notes: resolveNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la résolution')
      }
      toast.success('Événement résolu', {
        description: `L'événement a été marqué comme résolu.${resolveNotes ? ` Notes : ${resolveNotes}` : ''}`,
      })
      setResolveTarget(null)
      setResolveNotes('')
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de résoudre l\'événement.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Ignore event ───
  const handleIgnore = async () => {
    if (!ignoreTarget) return
    try {
      const res = await fetch(`/api/monitoring/${ignoreTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'ignorance')
      }
      toast.success('Événement ignoré', {
        description: 'L\'événement a été marqué comme ignoré.',
      })
      setIgnoreTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'ignorer l\'événement.',
      })
    }
  }

  // ─── Escalate event ───
  const handleEscalate = async (event: MonitoringEvent) => {
    try {
      const res = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: event.type,
          severite: 'CRITICAL',
          message: `[ESCALADE] ${event.message}`,
          source: event.source || 'Système',
          // ADR-0011 §5 : le backend attend une STRING (colonne TEXT) —
          // avant : objet JSON envoyé tel quel → 400 « JSON invalide »
          // SYSTÉMATIQUE sur le bouton Escalader.
          details: JSON.stringify({ escalatedFrom: event.id, originalSeverite: event.severite }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'escalade')
      }
      toast.success('Événement escaladé', {
        description: 'L\'événement a été escaladé au niveau CRITIQUE.',
      })
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'escalader l\'événement.',
      })
    }
  }

  // ─── Quick ignore from alert card ───
  const handleIgnoreFromAlert = (event: MonitoringEvent) => {
    setIgnoreTarget(event)
  }

  // ─── Quick resolve from alert card ───
  const handleResolveFromAlert = (event: MonitoringEvent) => {
    setResolveTarget(event)
    setResolveNotes('')
  }

  // ─── Quick escalate from alert card ───
  const handleEscalateFromAlert = (event: MonitoringEvent) => {
    setEscalateTarget(event)
  }

  return (
    <div className="space-y-6">
      {/* ═══ Header avec bande kente + motif savane ═══ */}
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div className="ds-kente-pattern border-b border-border bg-card">
          <div className="ds-kente-strip" aria-hidden="true" />
          <div className="px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <Activity className="h-6 w-6" />
                  </span>
                  Monitoring plateforme
                  <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Surveillance en temps réel des services et événements système
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="auto-refresh"
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    className="data-[state=checked]:bg-success"
                  />
                  <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
                    Auto-refresh 30s
                  </Label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { void handleManualRefresh() }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Dernière màj : {lastRefresh.toLocaleTimeString('fr-FR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ KPI StatCards (Design System Savane) ═══ */}
      {/* ADR-0011 : le Score santé est le MÊME que la carte du dashboard
          admin (calculé backend, /api/monitoring/overview) — alignement. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Score santé"
          value={`${overview?.score.score ?? '—'}`}
          suffix={overview ? '%' : ''}
          icon={HeartPulse}
          accent={
            (overview?.score.score ?? 0) >= 80 ? 'success' : (overview?.score.score ?? 0) >= 50 ? 'warning' : 'danger'
          }
          loading={overviewQuery.isLoading}
          index={0}
          hint={
            overview
              ? overview.score.verdict === 'BONNE_SANTE'
                ? 'Plateforme en bonne santé'
                : overview.score.verdict === 'ATTENTION'
                  ? 'Attention requise'
                  : 'Action urgente requise'
              : 'Score backend partagé avec le dashboard'
          }
        />
        <StatCard
          label="Événements actifs"
          value={stats.activeCount}
          icon={Activity}
          accent="warning"
          loading={isLoading}
          index={1}
          hint={`${stats.warningCount ?? 0} avertissements`}
        />
        <StatCard
          label="Critiques"
          value={stats.criticalCount}
          icon={AlertOctagon}
          accent="danger"
          loading={isLoading}
          index={2}
          hint="Action urgente requise"
        />
        <StatCard
          label="Erreurs"
          value={stats.errorCount}
          icon={XCircle}
          accent="secondary"
          loading={isLoading}
          index={3}
          hint="Erreurs actives"
        />
        <StatCard
          label="Résolus (24 h)"
          value={stats.resolved24h ?? 0}
          icon={CheckCircle2}
          accent="success"
          loading={isLoading}
          index={4}
          hint={`${stats.resolvedToday ?? 0} aujourd'hui`}
        />
      </div>

      {/* ─── Main Tabs ─── */}
      <Tabs defaultValue="evenements" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evenements" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Événements
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            État des services
          </TabsTrigger>
          <TabsTrigger value="systeme" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Système
          </TabsTrigger>
          <TabsTrigger value="alertes" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Alertes
            {activeAlerts.length > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 h-4 ml-1">
                {activeAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 1: Événements                                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="evenements" className="space-y-4">
          {/* Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par message ou source..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <Globe className="h-3.5 w-3.5 mr-1 shrink-0" />
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
            <Select value={severiteFilter} onValueChange={setSeveriteFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <AlertTriangle className="h-3.5 w-3.5 mr-1 shrink-0" />
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
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <Filter className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="ACTIF">Actif</SelectItem>
                <SelectItem value="RESOLU">Résolu</SelectItem>
                <SelectItem value="IGNORE">Ignoré</SelectItem>
              </SelectContent>
            </Select>
            {/* ADR-0011 §7 : fenêtre temporelle (backend filtre createdAt). */}
            <Select value={sinceHours} onValueChange={setSinceHours}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Clock className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tout l'historique</SelectItem>
                <SelectItem value="24">24 dernières heures</SelectItem>
                <SelectItem value="168">7 derniers jours</SelectItem>
                <SelectItem value="720">30 derniers jours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <PulseSkeleton className="h-4 w-16" />
                  <PulseSkeleton className="h-4 w-20" />
                  <PulseSkeleton className="h-4 flex-1" />
                  <PulseSkeleton className="h-4 w-24" />
                  <PulseSkeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredEvents.length === 0 && (
            <div className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed py-16 relative overflow-hidden">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <Activity className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucun événement trouvé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                {search || typeFilter !== 'all' || severiteFilter !== 'all' || statutFilter !== 'all'
                  ? 'Aucun résultat ne correspond à vos filtres.'
                  : 'Aucun événement de monitoring enregistré. La plateforme fonctionne normalement.'}
              </p>
              {(search || typeFilter !== 'all' || severiteFilter !== 'all' || statutFilter !== 'all') && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearch('')
                    setTypeFilter('all')
                    setSeveriteFilter('all')
                    setStatutFilter('all')
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          )}

          {/* Bulk action toolbar — visible uniquement quand au moins 1 événement est sélectionné */}
          {selectedIds.size > 0 && !isLoading && (
            <div className="flex flex-col gap-3 rounded-lg border border-info/30 bg-info/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info/15">
                  <CheckCircle2 className="h-4 w-4 text-info" />
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
                  <CheckCircle2 className="h-4 w-4" />
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
                  <Ban className="h-4 w-4" />
                  Ignorer ({selectedIds.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={bulkSubmitting}
                  onClick={clearSelection}
                >
                  Annuler la sélection
                </Button>
              </div>
            </div>
          )}

          {/* Events Table */}
          {!isLoading && filteredEvents.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
                        <Checkbox
                          checked={
                            selectableEvents.length === 0
                              ? false
                              : allSelectableSelected
                              ? true
                              : someSelectableSelected
                              ? 'indeterminate'
                              : false
                          }
                          onCheckedChange={toggleSelectAll}
                          aria-label="Sélectionner tous les événements actifs"
                          disabled={selectableEvents.length === 0}
                        />
                      </TableHead>
                      <TableHead className="w-[100px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Type</TableHead>
                      <TableHead className="w-[120px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Sévérité</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Message</TableHead>
                      <TableHead className="w-[110px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Source</TableHead>
                      <TableHead className="w-[90px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Durée</TableHead>
                      <TableHead className="w-[90px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Statut</TableHead>
                      <TableHead className="w-[130px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Créé le</TableHead>
                      <TableHead className="w-[100px] text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => (
                      <TableRow
                        key={event.id}
                        className={`group hover:bg-accent/50 transition-colors ${selectedIds.has(event.id) ? 'bg-primary/5' : ''}`}
                        data-selected={selectedIds.has(event.id)}
                      >
                        <TableCell>
                          {event.statut === 'ACTIF' ? (
                            <Checkbox
                              checked={selectedIds.has(event.id)}
                              onCheckedChange={() => toggleSelectOne(event.id)}
                              aria-label={`Sélectionner l'événement ${event.message.slice(0, 40)}`}
                            />
                          ) : (
                            <span className="block w-[16px]" />
                          )}
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={event.type} />
                        </TableCell>
                        <TableCell>
                          <SeverityBadge severite={event.severite} />
                        </TableCell>
                        <TableCell>
                          <p className="text-sm max-w-xs truncate" title={event.message}>
                            {event.message}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {event.source || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono tabular-nums">
                            {formatDuration(event.duree)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatutBadge statut={event.statut} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(event.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            {event.statut === 'ACTIF' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                                  onClick={() => {
                                    setResolveTarget(event)
                                    setResolveNotes('')
                                  }}
                                  title="Résoudre"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                                  onClick={() => setIgnoreTarget(event)}
                                  title="Ignorer"
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {event.statut === 'RESOLU' && (
                              <span className="text-xs text-success-text flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Résolu
                                {event.resoluPar && (
                                  <span className="text-muted-foreground">par {event.resoluPar}</span>
                                )}
                              </span>
                            )}
                            {event.statut === 'IGNORE' && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Ban className="h-3 w-3" />
                                Ignoré
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ADR-0011 §7 — pagination backend (total = COUNT réel, même WHERE). */}
          {!isLoading && totalEvents > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {totalEvents} événement{totalEvents > 1 ? 's' : ''} au total — page {page}/{totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page <= 1 || monitoringQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page >= totalPages || monitoringQuery.isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 2: État des services                                   */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="services" className="space-y-6">
          {/* Bug B2 fix (audit monitoring 2025) : healthcheck backend réel maintenant implémenté */}
          <div className="rounded-lg border border-success/30 bg-success/10 p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <p className="text-xs text-success">
              Les valeurs de santé des services sont issues de <strong>vrais healthchecks backend</strong> (ping DB, requêtes de test sur chaque service).
              Actualisation toutes les 30 secondes {autoRefresh ? '(activée)' : '(désactivée)'}.
              {healthData && ` Dernier check : ${new Date(healthData.checkedAt).toLocaleTimeString('fr-FR')}.`}
            </p>
          </div>
          {/* Platform Health Score + Summary */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Health Gauge Card */}
            <Card className="lg:col-span-1 ds-kente-top">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg font-display">
                  <HeartPulse className="h-5 w-5 text-success-text" />
                  Santé globale
                </CardTitle>
                <CardDescription>
                  Score de santé de la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-4">
                {/* ADR-0011 : le « Santé globale » affiche le MÊME score backend
                    que la carte du dashboard admin (formule unique — avant :
                    pseudo-uptime = % services OK, divergent du dashboard). */}
                {overviewQuery.isLoading ? (
                  <div className="flex items-center justify-center h-[180px] w-[180px]">
                    <Loader2 className="h-8 w-8 animate-spin text-success-text" />
                  </div>
                ) : (
                  <>
                    <ProgressRing
                      value={overview?.score.score ?? 0}
                      size={180}
                      strokeWidth={14}
                      accent={
                        (overview?.score.score ?? 0) >= 80 ? 'success' : (overview?.score.score ?? 0) >= 50 ? 'warning' : 'danger'
                      }
                      sublabel={`${healthData?.healthyCount ?? 0}/${healthData?.totalCount ?? 6} services`}
                      showPercent
                    />
                    {/* Breakdown du score backend (même source que le dashboard) */}
                    {overview && overview.score.breakdown.some((c) => c.penalty < 0) && (
                      <div className="mt-3 w-full space-y-1" aria-label="Composantes du score santé">
                        {overview.score.breakdown
                          .filter((c) => c.penalty < 0)
                          .sort((a, b) => a.penalty - b.penalty)
                          .slice(0, 3)
                          .map((c) => (
                            <div key={c.label} className="flex items-center justify-between text-[11px] px-2">
                              <span className="text-muted-foreground truncate">{c.label}</span>
                              <span className="font-semibold text-destructive shrink-0 ml-2">{c.penalty}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
                <div className="mt-4 grid grid-cols-3 gap-4 w-full text-center">
                  <div>
                    <p className="text-lg font-bold text-success-text font-mono tabular-nums">{serviceHealths.filter((s) => s.status === 'OPERATIONNEL').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Opérationnels</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-warning font-mono tabular-nums">{serviceHealths.filter((s) => s.status === 'DEGRADE').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Dégradés</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive font-mono tabular-nums">{serviceHealths.filter((s) => s.status === 'INDISPONIBLE').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Indisponibles</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Service Health Grid */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-2.5">
                          <PulseSkeleton className="h-9 w-9 rounded-lg" />
                          <div className="space-y-1.5">
                            <PulseSkeleton className="h-4 w-32" />
                            <PulseSkeleton className="h-3 w-20" />
                          </div>
                        </div>
                        <PulseSkeleton className="h-px w-full" />
                        <div className="grid grid-cols-2 gap-3">
                          <PulseSkeleton className="h-8 w-full" />
                          <PulseSkeleton className="h-8 w-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  serviceHealths.map((service, i) => (
                    <ServiceHealthCard key={service.type} service={service} index={i} />
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 4: Système — le couteau suisse (ADR-0011)              */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="systeme" className="space-y-6">
          {overviewQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-24 w-full" variant="card" />
              ))}
            </div>
          ) : !overview ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                  <AlertTriangle className="h-8 w-8 text-warning" />
                </div>
                <h3 className="mt-3 text-lg font-semibold font-display tracking-tight">Vue système indisponible</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Impossible de récupérer la vue système (/api/monitoring/overview). Réessayez.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => { void overviewQuery.refetch() }}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ─── Ligne 1 : runtime Go + infrastructure ─── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Runtime Go */}
                <Card className="ds-kente-top">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-display">
                      <Cpu className="h-4 w-4 text-primary-text" />
                      Processus backend
                    </CardTitle>
                    <CardDescription>Runtime Go — mesures en direct</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-mono font-semibold">{formatUptimeLong(overview.runtime.uptimeSeconds)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Version Go</span>
                      <span className="font-mono font-semibold">{overview.runtime.goVersion}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Goroutines</span>
                      <span className={`font-mono font-semibold ${overview.runtime.goroutines > 500 ? 'text-warning' : ''}`}>
                        {overview.runtime.goroutines}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">CPU logiques</span>
                      <span className="font-mono font-semibold">{overview.runtime.numCPU}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Mémoire allouée</span>
                      <span className="font-mono font-semibold">{overview.runtime.memAllocMB.toFixed(1)} Mo</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Mémoire système</span>
                      <span className="font-mono font-semibold">{overview.runtime.memSysMB.toFixed(1)} Mo</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cycles GC</span>
                      <span className="font-mono font-semibold">
                        {overview.runtime.numGC} <span className="text-muted-foreground text-xs">({overview.runtime.gcPauseTotalMs.toFixed(0)} ms cumulés)</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Infrastructure */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-display">
                      <HardDrive className="h-4 w-4 text-primary-text" />
                      Infrastructure
                    </CardTitle>
                    <CardDescription>DB, stockage, IA, maintenance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Database className="h-3.5 w-3.5" /> Base Neon
                      </span>
                      <span className={`font-mono font-semibold ${overview.db.down ? 'text-destructive' : 'text-success-text'}`}>
                        {overview.db.down ? 'INDISPONIBLE' : `${overview.db.latencyMs} ms`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Connexions DB actives</span>
                      <span className="font-mono font-semibold">{overview.db.activeConns}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <HardDrive className="h-3.5 w-3.5" /> Stockage R2
                      </span>
                      <span className={`font-mono font-semibold ${overview.storage.reachable ? 'text-success-text' : overview.storage.configured ? 'text-warning' : 'text-destructive'}`}>
                        {overview.storage.configured
                          ? overview.storage.reachable
                            ? `Joignable (${overview.storage.bucket || 'bucket'})`
                            : 'Configuré, injoignable'
                          : 'Non configuré'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Bot className="h-3.5 w-3.5" /> Providers IA
                      </span>
                      <span className={`font-mono font-semibold ${overview.ai.providersActifs > 0 ? 'text-success-text' : 'text-destructive'}`}>
                        {overview.ai.providersActifs} actif{overview.ai.providersActifs > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Mode maintenance</span>
                      <span className={`font-semibold ${overview.maintenance.active ? 'text-warning' : 'text-success-text'}`}>
                        {overview.maintenance.active ? 'ACTIF' : 'Inactif'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Établissements proctoring</span>
                      <span className="font-mono font-semibold">{overview.kpis.etablissementsProteges}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Vérification d&apos;identité</span>
                      <span className="font-mono font-semibold">{overview.kpis.verificationIdentite}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Tendance 7 jours */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-display">
                      <TrendingUp className="h-4 w-4 text-primary-text" />
                      Tendance (7 jours)
                    </CardTitle>
                    <CardDescription>Événements créés par jour et sévérité</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.trend}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(value: number | string, name: string) => [value, SEVERITY_CONFIG[name as MonitoringEvent['severite']]?.label ?? name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => SEVERITY_CONFIG[value as MonitoringEvent['severite']]?.label ?? value} />
                        <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critique" />
                        <Bar dataKey="error" stackId="a" fill="#f59e0b" name="Erreur" />
                        <Bar dataKey="warning" stackId="a" fill="#eab308" name="Avertissement" />
                        <Bar dataKey="info" stackId="a" fill="#14b8a6" name="Info" />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      NB : les événements RESOLU de plus de 24 h sont purgés — les jours passés sous-comptent les événements résolus entre-temps.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* ─── Ligne 2 : workers (registre ADR-0011 §4) ─── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <Wrench className="h-4 w-4 text-primary-text" />
                    Workers ({overview.workers.length})
                  </CardTitle>
                  <CardDescription>
                    Tâches de fond de la plateforme — les 7 workers périodiques sont instrumentés (durée, erreurs, panic-safe) ;
                    les 6 workers de file traitent les jobs à la demande (leur état métier vit dans les tables de jobs).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Worker</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Type</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Intervalle</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display text-right">Exécutions</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display text-right">Erreurs</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">Dernier run</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display text-right">Durée</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">État</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.workers.map((wk) => {
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
                              <TableCell className="text-xs font-mono text-muted-foreground">{wk.intervalLabel}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm">{wk.runs}</TableCell>
                              <TableCell className={`text-right font-mono tabular-nums text-sm ${wk.errors > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                {wk.errors}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {wk.lastRunAt ? getTimeAgo(wk.lastRunAt) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                                {wk.lastDurationMs > 0 ? `${wk.lastDurationMs} ms` : '—'}
                              </TableCell>
                              <TableCell>
                                {inError ? (
                                  <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]" title={wk.lastError}>
                                    Erreur
                                  </Badge>
                                ) : neverRan ? (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">En attente</Badge>
                                ) : wk.runs > 0 ? (
                                  <Badge className="bg-success/10 text-success-text border-success/30 text-[10px]">
                                    {wk.kind === 'file' ? 'Écoute' : 'Actif'}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Écoute</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* ─── Ligne 3 : breakdown du score ─── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <HeartPulse className="h-4 w-4 text-success-text" />
                    Décomposition du score santé ({overview.score.score}/100)
                  </CardTitle>
                  <CardDescription>
                    Formule backend unique — la même que la carte « Santé plateforme » du dashboard admin (ADR-0011)
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
                        <span className={`font-mono font-semibold shrink-0 ml-3 ${c.penalty < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {c.penalty < 0 ? c.penalty : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 5: Alertes                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="alertes" className="space-y-6">
          {/* MONITORING-FIX-M6 : disclaimer règles non persistées */}
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              Les règles d'alerte ci-dessous sont prédéfinies et non persistées. La désactivation d'une règle est temporaire (perdue au rechargement).
              La persistance des règles d'alerte (table AlertRule + endpoints CRUD) est prévue dans une prochaine version.
            </p>
          </div>
          {/* Active Alerts Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 font-display">
                <BellRing className="h-5 w-5 text-success-text" />
                Alertes actives
                {activeAlerts.length > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                    {activeAlerts.length}
                  </Badge>
                )}
              </h2>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
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
            ) : activeAlerts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle2 className="h-8 w-8 text-success-text" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold font-display tracking-tight">Aucune alerte active</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Tous les systèmes fonctionnent normalement. Aucune action requise.
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
                      onResolve={handleResolveFromAlert}
                      onEscalate={handleEscalateFromAlert}
                      onIgnore={handleIgnoreFromAlert}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <Separator />

          {/* Seuils système réels (ADR-0011) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 font-display">
                  <Settings2 className="h-5 w-5 text-success-text" />
                  Seuils système
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  État des seuils de déclenchement — mesuré en direct, aucune valeur simulée
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {systemThresholds.map((rule) => {
                // inverted : la bonne santé est current >= threshold (ex: providers IA)
                const isBreached = rule.inverted
                  ? rule.current < rule.threshold
                  : rule.current >= rule.threshold
                const severityConfig = SEVERITY_CONFIG[rule.severite]
                const fillPct = rule.inverted
                  ? Math.min(100, (rule.current / Math.max(1, rule.threshold)) * 100)
                  : Math.min(100, (rule.current / Math.max(1, rule.threshold)) * 100)

                return (
                  <Card
                    key={rule.name}
                    className={`transition-all ${isBreached ? `${severityConfig.border} ${severityConfig.darkBorder}` : 'border-border'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium">{rule.name}</h4>
                            <SeverityBadge severite={rule.severite} />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                            <div className="flex items-center gap-1">
                              <span>Seuil :</span>
                              <span className="font-mono tabular-nums font-semibold text-foreground">
                                {rule.inverted ? '≥ ' : '< '}{rule.threshold}{rule.unit}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Actuel :</span>
                              <span className={`font-mono font-semibold ${isBreached ? 'text-destructive' : 'text-success-text'}`}>
                                {rule.current}{rule.unit}
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isBreached ? 'bg-destructive' : 'bg-success'}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">{rule.detail}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Resolve Event Dialog (GlassModal DS) ─── */}
      <GlassModal
        open={!!resolveTarget}
        onClose={() => {
          setResolveTarget(null)
          setResolveNotes('')
        }}
        title="Résoudre l'événement"
        description="Marquer cet événement comme résolu et ajouter des notes si nécessaire."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setResolveTarget(null)
                setResolveNotes('')
              }}
            >
              Annuler
            </Button>
            <Button
              className="bg-success hover:bg-success/90 text-success-text ds-shimmer"
              onClick={handleResolve}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Résolution...
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
        {resolveTarget && (
          <div className="space-y-4">
            {/* Event summary */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <TypeBadge type={resolveTarget.type} />
                <SeverityBadge severite={resolveTarget.severite} />
              </div>
              <p className="text-sm">{resolveTarget.message}</p>
              {resolveTarget.source && (
                <p className="text-xs text-muted-foreground">Source : {resolveTarget.source}</p>
              )}
            </div>

            {/* Resolution notes */}
            <div className="space-y-2">
              <Label htmlFor="resolve-notes">Notes de résolution (optionnel)</Label>
              <Textarea
                id="resolve-notes"
                placeholder="Décrivez la résolution ou les actions entreprises..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}
      </GlassModal>

      {/* ─── Ignore Event Confirmation ─── */}
      <AlertDialog
        open={!!ignoreTarget}
        onOpenChange={(open) => {
          if (!open) setIgnoreTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-muted-foreground" />
              Ignorer l&apos;événement
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir ignorer cet événement ? Il sera marqué comme ignoré et n&apos;apparaîtra plus dans les alertes actives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {ignoreTarget && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2">
                <TypeBadge type={ignoreTarget.type} />
                <SeverityBadge severite={ignoreTarget.severite} />
              </div>
              <p className="text-sm">{ignoreTarget.message}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleIgnore}
              className="bg-muted hover:bg-muted/80 ds-shimmer"
            >
              Ignorer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Escalate Event Confirmation ─── */}
      <AlertDialog
        open={!!escalateTarget}
        onOpenChange={(open) => {
          if (!open) setEscalateTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-warning" />
              Escalader l&apos;événement
            </AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;événement sera escaladé au niveau <strong>CRITIQUE</strong>. Un nouvel événement de monitoring sera créé avec la sévérité CRITICAL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {escalateTarget && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2">
                <TypeBadge type={escalateTarget.type} />
                <SeverityBadge severite={escalateTarget.severite} />
                <ArrowUpRight className="h-4 w-4 text-warning" />
                <Badge className="bg-secondary/10 text-secondary border-secondary/30 text-xs">
                  CRITICAL
                </Badge>
              </div>
              <p className="text-sm">{escalateTarget.message}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (escalateTarget) handleEscalate(escalateTarget)
                setEscalateTarget(null)
              }}
              className="bg-warning hover:bg-warning/90 ds-shimmer"
            >
              Escalader au niveau critique
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk action confirmation dialog — action de masse sur plusieurs événements */}
      <AlertDialog
        open={bulkDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBulkDialogOpen(false)
            setBulkAction(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {bulkAction === 'resoudre' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success-text" />
                  Résoudre {selectedIds.size} événement{selectedIds.size > 1 ? 's' : ''} ?
                </>
              ) : (
                <>
                  <Ban className="h-5 w-5 text-warning" />
                  Ignorer {selectedIds.size} événement{selectedIds.size > 1 ? 's' : ''}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'resoudre'
                ? `Cette action marquera ${selectedIds.size} événement(s) comme résolu(s) d'un seul coup. Les événements seront marqués avec votre identité (${user?.email ?? 'admin'}).`
                : `Cette action marquera ${selectedIds.size} événement(s) comme ignoré(s). Ils resteront en base mais seront masqués des alertes actives.`}
              <br />
              <span className="text-xs text-muted-foreground mt-1 block">
                Seuls les événements ACTIF seront affectés ({selectableEvents.length} sélectionnables).
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSubmitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={
                bulkAction === 'resoudre'
                  ? 'bg-success hover:bg-success/90 text-success-text ds-shimmer'
                  : 'bg-warning hover:bg-warning/90 ds-shimmer'
              }
              disabled={bulkSubmitting}
              onClick={handleBulkAction}
            >
              {bulkSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Traitement…
                </>
              ) : bulkAction === 'resoudre' ? (
                `Oui, résoudre ${selectedIds.size} événement(s)`
              ) : (
                `Oui, ignorer ${selectedIds.size} événement(s)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
