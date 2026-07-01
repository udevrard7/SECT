'use client'

import { useState, useCallback, useMemo } from 'react'
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
  Timer,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  ChevronDown,
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
import { PulseSkeleton } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
}

interface ServiceHealth {
  name: string
  type: MonitoringEvent['type']
  status: 'OPERATIONNEL' | 'DEGRADE' | 'INDISPONIBLE'
  uptime: number
  avgResponseTime: number
  lastIncident: string | null
  icon: React.ComponentType<{ className?: string }>
}

// Bug B2 (audit monitoring 2025) : types pour le healthcheck backend réel
interface ServiceStatus {
  name: string
  status: string
  uptime: string
  latency: number
  lastCheck: string
  lastError: string
}

interface HealthReport {
  services: ServiceStatus[]
  overall: string
  healthyCount: number
  totalCount: number
  checkedAt: string
}

interface AlertRule {
  id: string
  name: string
  metric: string
  threshold: number
  current: number
  enabled: boolean
  severite: MonitoringEvent['severite']
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
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    border: 'border-gray-200',
    darkBg: 'dark:bg-gray-800',
    darkColor: 'dark:text-gray-400',
    darkBorder: 'dark:border-gray-700',
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

// ─── Circular Health Gauge Component ───

function HealthGauge({ score, size = 180 }: { score: number; size?: number }) {
  const strokeWidth = 12
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const center = size / 2

  const getColor = (s: number) => {
    if (s >= 80) return { stroke: '#10b981', text: 'text-success-text', label: 'Excellent' }
    if (s >= 60) return { stroke: '#f59e0b', text: 'text-warning', label: 'Correct' }
    if (s >= 40) return { stroke: '#f97316', text: 'text-warning', label: 'Dégradé' }
    return { stroke: '#ef4444', text: 'text-destructive', label: 'Critique' }
  }

  const colorConfig = getColor(score)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colorConfig.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        {/* Glow effect */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colorConfig.stroke}
          strokeWidth={strokeWidth + 4}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          opacity="0.15"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${colorConfig.text} font-mono tabular-nums`}>{score}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
        <span className={`text-xs font-medium mt-1 ${colorConfig.text}`}>
          {colorConfig.label}
        </span>
      </div>
    </div>
  )
}

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

function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const statusConfig = SERVICE_STATUS_CONFIG[service.status]
  const Icon = service.icon

  return (
    <Card className={`${statusConfig.borderColor} ${statusConfig.darkBorderColor} transition-shadow hover:shadow-md`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${statusConfig.bgColor} ${statusConfig.darkBgColor}`}>
              <Icon className={`h-4.5 w-4.5 ${statusConfig.textColor} ${statusConfig.darkTextColor}`} />
            </div>
            <div>
              <h4 className="text-sm font-semibold leading-tight">{service.name}</h4>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`h-2 w-2 rounded-full ${statusConfig.dotColor} ${service.status === 'DEGRADE' ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-medium ${statusConfig.textColor} ${statusConfig.darkTextColor}`}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-3" />

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">Uptime</p>
            <p className={`font-semibold ${service.uptime >= 99 ? 'text-success-text' : service.uptime >= 95 ? 'text-warning' : 'text-destructive'}`}>
              {service.uptime.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Temps rép. moyen</p>
            <p className={`font-semibold ${service.avgResponseTime <= 200 ? 'text-success-text' : service.avgResponseTime <= 500 ? 'text-warning' : 'text-destructive'}`}>
              {service.avgResponseTime}ms
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground mb-0.5">Dernier incident</p>
            <p className="font-medium text-xs">
              {service.lastIncident ? getTimeAgo(service.lastIncident) : 'Aucun incident'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
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
                className="h-7 text-xs gap-1 border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
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

  // BUGFIX QUERY-MIGRATION-GROUP-A : migration de useEffect+fetch+useState
  // vers TanStack Query. Le cache survit au démontage → 0 refetch au retour,
  // 0 skeleton, navigation instantanée. Le polling 30s est géré par
  // refetchInterval (auto-cleanup au démontage, plus de fuite mémoire).
  const monitoringQuery = useQuery<{ events: MonitoringEvent[]; stats: MonitoringStats }>({
    queryKey: ['monitoring', typeFilter, severiteFilter, statutFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      if (severiteFilter && severiteFilter !== 'all') params.set('severite', severiteFilter)
      if (statutFilter && statutFilter !== 'all') params.set('statut', statutFilter)

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
  const stats = monitoringQuery.data?.stats ?? { activeCount: 0, criticalCount: 0, errorCount: 0 }
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

  // ─── Alert rules state ───
  const [alertRules, setAlertRules] = useState<AlertRule[]>([
    { id: '1', name: 'Temps de réponse API', metric: 'api_response_time', threshold: 2000, current: 145, enabled: true, severite: 'WARNING' },
    { id: '2', name: 'Erreurs base de données', metric: 'db_error_rate', threshold: 5, current: 0, enabled: true, severite: 'ERROR' },
    { id: '3', name: 'Taux d\'échec auth', metric: 'auth_failure_rate', threshold: 10, current: 2, enabled: true, severite: 'CRITICAL' },
    { id: '4', name: 'Latence évaluation', metric: 'eval_latency', threshold: 5000, current: 320, enabled: true, severite: 'WARNING' },
    { id: '5', name: 'Échecs paiement', metric: 'payment_failure_count', threshold: 3, current: 0, enabled: true, severite: 'CRITICAL' },
    { id: '6', name: 'CPU serveur', metric: 'system_cpu', threshold: 90, current: 34, enabled: true, severite: 'ERROR' },
  ])

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

  const uptimePercentage = healthData
    ? Math.round((healthData.healthyCount / Math.max(1, healthData.totalCount)) * 10000) / 100
    : events.length > 0
      ? Math.max(0, 100 - (activeCriticalEvents.length * 5 + activeErrorEvents.length * 2))
      : 0

  const avgResponseTime = healthData
    ? Math.round(healthData.services.reduce((sum: number, s: ServiceStatus) => sum + s.latency, 0) / Math.max(1, healthData.services.length))
    : events.length > 0
      ? Math.round(events.filter((e) => e.duree !== null).reduce((sum, e) => sum + (e.duree ?? 0), 0) / Math.max(1, events.filter((e) => e.duree !== null).length))
      : 0

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
          status: s.status,
          uptime: parseFloat(s.uptime) || 0,
          avgResponseTime: s.latency,
          lastIncident: s.lastError ? s.lastCheck : null,
          icon: iconMap[s.name] || Globe,
        }
      })
    }

    // Fallback : valeurs neutres si l'API health n'est pas disponible
    const services: ServiceHealth[] = [
      { name: 'API Gateway', type: 'API', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: Globe },
      { name: 'Base de données', type: 'DATABASE', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: Database },
      { name: 'Service d\'authentification', type: 'AUTH', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: Shield },
      { name: 'Moteur d\'évaluation', type: 'EVALUATION', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: ClipboardCheck },
      { name: 'Service de paiement', type: 'PAYMENT', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: CreditCard },
      { name: 'Proctoring IA', type: 'SYSTEM', status: 'OPERATIONNEL', uptime: 0, avgResponseTime: 0, lastIncident: null, icon: Server },
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
        service.uptime = Math.max(0, 99.98 - criticalEvents.length * 8 - errorEvents.length * 3)
        service.lastIncident = criticalEvents[0].createdAt
      } else if (errorEvents.length > 0) {
        service.status = 'DEGRADE'
        service.uptime = Math.max(90, 99.98 - errorEvents.length * 3 - warningEvents.length * 0.5)
        service.lastIncident = errorEvents[0].createdAt
      } else if (warningEvents.length > 0) {
        service.uptime = Math.max(95, 99.98 - warningEvents.length * 0.5)
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

  // ─── Computed: platform health score ───
  const platformHealthScore = Math.round(
    serviceHealths.reduce((acc, s) => {
      let score = s.uptime
      if (s.status === 'DEGRADE') score = Math.min(score, 75)
      if (s.status === 'INDISPONIBLE') score = Math.min(score, 30)
      return acc + score
    }, 0) / serviceHealths.length
  )

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
          details: { escalatedFrom: event.id, originalSeverite: event.severite },
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

  // ─── Toggle alert rule ───
  const handleToggleAlertRule = (ruleId: string) => {
    setAlertRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    )
    toast.success('Règle mise à jour', {
      description: 'La règle d\'alerte a été modifiée.',
    })
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
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <Activity className="h-7 w-7 text-success-text" />
            Monitoring & Santé Plateforme
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Surveillance en temps réel des services et événements système
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* ─── Health Status Cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Uptime Card */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <HeartPulse className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold font-mono tabular-nums">{uptimePercentage.toFixed(2)}%</p>
                <span className={`h-2.5 w-2.5 rounded-full ${uptimePercentage >= 99 ? 'bg-success' : uptimePercentage >= 95 ? 'bg-warning' : 'bg-destructive'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Card */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Timer className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Temps de réponse moyen</p>
              <p className="text-xl font-bold font-mono tabular-nums">{avgResponseTime}
                <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Errors Card */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Erreurs actives</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold font-mono tabular-nums">{stats.errorCount + stats.criticalCount}</p>
                <div className="flex gap-1 text-[10px]">
                  {stats.criticalCount > 0 && (
                    <Badge className="bg-secondary/10 text-secondary border-secondary/30 text-[10px] px-1 py-0 h-4">
                      {stats.criticalCount} critique{stats.criticalCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {stats.errorCount > 0 && (
                    <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1 py-0 h-4">
                      {stats.errorCount} erreur{stats.errorCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical Events Card */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
              <AlertOctagon className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Événements critiques</p>
              <p className="text-xl font-bold font-mono tabular-nums">{stats.criticalCount}</p>
            </div>
          </CardContent>
        </Card>
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
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
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
                      <TableHead className="w-[40px] font-display">
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
                      <TableHead className="w-[100px] font-display">Type</TableHead>
                      <TableHead className="w-[120px] font-display">Sévérité</TableHead>
                      <TableHead className="font-display">Message</TableHead>
                      <TableHead className="w-[110px] font-display">Source</TableHead>
                      <TableHead className="w-[90px] font-display">Durée</TableHead>
                      <TableHead className="w-[90px] font-display">Statut</TableHead>
                      <TableHead className="w-[130px] font-display">Créé le</TableHead>
                      <TableHead className="w-[100px] text-right font-display">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => (
                      <TableRow
                        key={event.id}
                        className="group"
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
                                  className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900"
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
                              <span className="text-xs text-gray-500 flex items-center gap-1">
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
            <Card className="lg:col-span-1">
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
                {isLoading ? (
                  <div className="flex items-center justify-center h-[180px] w-[180px]">
                    <Loader2 className="h-8 w-8 animate-spin text-success-text" />
                  </div>
                ) : (
                  <HealthGauge score={platformHealthScore} size={180} />
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
                  serviceHealths.map((service) => (
                    <ServiceHealthCard key={service.type} service={service} />
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 3: Alertes                                             */}
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

          {/* Alert Rules Configuration */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 font-display">
                  <Settings2 className="h-5 w-5 text-success-text" />
                  Règles d&apos;alertes
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configurez les seuils de déclenchement automatique des alertes
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {alertRules.map((rule) => {
                const isExceeded = rule.current >= rule.threshold
                const severityConfig = SEVERITY_CONFIG[rule.severite]

                return (
                  <Card
                    key={rule.id}
                    className={`transition-all ${isExceeded && rule.enabled ? `${severityConfig.border} ${severityConfig.darkBorder}` : 'border-border'} ${!rule.enabled ? 'opacity-60' : ''}`}
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
                              <span className="font-mono tabular-nums font-semibold text-foreground">{rule.threshold}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Actuel :</span>
                              <span className={`font-mono font-semibold ${isExceeded ? 'text-destructive' : 'text-success-text'}`}>
                                {rule.current}
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isExceeded ? 'bg-destructive' : rule.current >= rule.threshold * 0.75 ? 'bg-warning' : 'bg-success'
                              }`}
                              style={{ width: `${Math.min(100, (rule.current / rule.threshold) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => handleToggleAlertRule(rule.id)}
                          className="data-[state=checked]:bg-success"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Resolve Event Dialog ─── */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null)
            setResolveNotes('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
              Résoudre l&apos;événement
            </DialogTitle>
            <DialogDescription>
              Marquer cet événement comme résolu et ajouter des notes si nécessaire.
            </DialogDescription>
          </DialogHeader>

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

          <DialogFooter className="gap-2 sm:gap-0">
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
              className="bg-success hover:bg-success/90"
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Ban className="h-5 w-5 text-gray-500" />
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
              className="bg-gray-600 hover:bg-gray-700"
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
              className="bg-warning hover:bg-warning/90"
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
                  ? 'bg-success hover:bg-success/90 text-success-text'
                  : 'bg-warning hover:bg-warning/90'
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
