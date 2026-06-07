'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
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
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    border: 'border-blue-200',
    darkBg: 'dark:bg-blue-900/40',
    darkColor: 'dark:text-blue-300',
    darkBorder: 'dark:border-blue-800',
    icon: Info,
  },
  WARNING: {
    label: 'Avertissement',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    darkBg: 'dark:bg-amber-900/40',
    darkColor: 'dark:text-amber-300',
    darkBorder: 'dark:border-amber-800',
    icon: AlertTriangle,
  },
  ERROR: {
    label: 'Erreur',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-200',
    darkBg: 'dark:bg-red-900/40',
    darkColor: 'dark:text-red-300',
    darkBorder: 'dark:border-red-800',
    icon: XCircle,
  },
  CRITICAL: {
    label: 'Critique',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    border: 'border-purple-200',
    darkBg: 'dark:bg-purple-900/40',
    darkColor: 'dark:text-purple-300',
    darkBorder: 'dark:border-purple-800',
    icon: AlertOctagon,
  },
}

const STATUS_CONFIG: Record<MonitoringEvent['statut'], { label: string; color: string; bg: string; border: string; darkBg: string; darkColor: string; darkBorder: string }> = {
  ACTIF: {
    label: 'Actif',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    border: 'border-orange-200',
    darkBg: 'dark:bg-orange-900/40',
    darkColor: 'dark:text-orange-300',
    darkBorder: 'dark:border-orange-800',
  },
  RESOLU: {
    label: 'Résolu',
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    darkBg: 'dark:bg-emerald-900/40',
    darkColor: 'dark:text-emerald-300',
    darkBorder: 'dark:border-emerald-800',
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
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    darkBgColor: 'dark:bg-emerald-950/20',
    darkBorderColor: 'dark:border-emerald-800',
    textColor: 'text-emerald-700',
    darkTextColor: 'dark:text-emerald-300',
  },
  DEGRADE: {
    label: 'Dégradé',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    darkBgColor: 'dark:bg-amber-950/20',
    darkBorderColor: 'dark:border-amber-800',
    textColor: 'text-amber-700',
    darkTextColor: 'dark:text-amber-300',
  },
  INDISPONIBLE: {
    label: 'Indisponible',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    darkBgColor: 'dark:bg-red-950/20',
    darkBorderColor: 'dark:border-red-800',
    textColor: 'text-red-700',
    darkTextColor: 'dark:text-red-300',
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
    if (s >= 80) return { stroke: '#10b981', text: 'text-emerald-600 dark:text-emerald-400', label: 'Excellent' }
    if (s >= 60) return { stroke: '#f59e0b', text: 'text-amber-600 dark:text-amber-400', label: 'Correct' }
    if (s >= 40) return { stroke: '#f97316', text: 'text-orange-600 dark:text-orange-400', label: 'Dégradé' }
    return { stroke: '#ef4444', text: 'text-red-600 dark:text-red-400', label: 'Critique' }
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
        <span className={`text-4xl font-bold ${colorConfig.text}`}>
          {score}
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
            <p className={`font-semibold ${service.uptime >= 99 ? 'text-emerald-600 dark:text-emerald-400' : service.uptime >= 95 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              {service.uptime.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Temps rép. moyen</p>
            <p className={`font-semibold ${service.avgResponseTime <= 200 ? 'text-emerald-600 dark:text-emerald-400' : service.avgResponseTime <= 500 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
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
                className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => onResolve(event)}
              >
                <CheckCircle2 className="h-3 w-3" />
                Résoudre
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
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

  // ─── Data state ───
  const [events, setEvents] = useState<MonitoringEvent[]>([])
  const [stats, setStats] = useState<MonitoringStats>({ activeCount: 0, criticalCount: 0, errorCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [severiteFilter, setSeveriteFilter] = useState<string>('all')
  const [statutFilter, setStatutFilter] = useState<string>('all')

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

  // ─── Fetch monitoring data ───
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      if (severiteFilter && severiteFilter !== 'all') params.set('severite', severiteFilter)
      if (statutFilter && statutFilter !== 'all') params.set('statut', statutFilter)

      const res = await fetch(`/api/monitoring?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events ?? [])
        setStats(data.stats ?? { activeCount: 0, criticalCount: 0, errorCount: 0 })
        setLastRefresh(new Date())
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [typeFilter, severiteFilter, statutFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Auto-refresh every 30 seconds ───
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchData()
      }, 30000)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [autoRefresh, fetchData])

  // ─── Computed: filtered events ───
  const filteredEvents = events.filter((e) => {
    const matchSearch =
      !search ||
      e.message.toLowerCase().includes(search.toLowerCase()) ||
      (e.source && e.source.toLowerCase().includes(search.toLowerCase()))
    return matchSearch
  })

  // ─── Computed: health metrics from events data ───
  const activeErrorEvents = events.filter((e) => e.statut === 'ACTIF' && e.severite === 'ERROR')
  const activeCriticalEvents = events.filter((e) => e.statut === 'ACTIF' && e.severite === 'CRITICAL')

  const uptimePercentage = events.length > 0
    ? Math.max(0, 100 - (activeCriticalEvents.length * 5 + activeErrorEvents.length * 2))
    : 99.98

  const avgResponseTime = events.length > 0
    ? Math.round(events.filter((e) => e.duree !== null).reduce((sum, e) => sum + (e.duree ?? 0), 0) / Math.max(1, events.filter((e) => e.duree !== null).length))
    : 142

  // ─── Computed: service health from monitoring events ───
  const computeServiceHealth = useCallback((): ServiceHealth[] => {
    const services: ServiceHealth[] = [
      { name: 'API Gateway', type: 'API', status: 'OPERATIONNEL', uptime: 99.98, avgResponseTime: 142, lastIncident: null, icon: Globe },
      { name: 'Base de données', type: 'DATABASE', status: 'OPERATIONNEL', uptime: 99.95, avgResponseTime: 23, lastIncident: null, icon: Database },
      { name: 'Service d\'authentification', type: 'AUTH', status: 'OPERATIONNEL', uptime: 99.99, avgResponseTime: 89, lastIncident: null, icon: Shield },
      { name: 'Moteur d\'évaluation', type: 'EVALUATION', status: 'OPERATIONNEL', uptime: 99.90, avgResponseTime: 320, lastIncident: null, icon: ClipboardCheck },
      { name: 'Service de paiement', type: 'PAYMENT', status: 'OPERATIONNEL', uptime: 99.97, avgResponseTime: 210, lastIncident: null, icon: CreditCard },
      { name: 'Proctoring IA', type: 'SYSTEM', status: 'OPERATIONNEL', uptime: 99.85, avgResponseTime: 450, lastIncident: null, icon: Server },
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
      await fetchData()
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
      await fetchData()
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
      await fetchData()
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Activity className="h-7 w-7 text-emerald-600" />
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
              className="data-[state=checked]:bg-emerald-600"
            />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto-refresh 30s
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setIsLoading(true); fetchData() }}
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
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <HeartPulse className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{uptimePercentage.toFixed(2)}%</p>
                <span className={`h-2.5 w-2.5 rounded-full ${uptimePercentage >= 99 ? 'bg-emerald-500' : uptimePercentage >= 95 ? 'bg-amber-500' : 'bg-red-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Card */}
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <Timer className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Temps de réponse moyen</p>
              <p className="text-xl font-bold">
                {avgResponseTime}
                <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Errors Card */}
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Erreurs actives</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{stats.errorCount + stats.criticalCount}</p>
                <div className="flex gap-1 text-[10px]">
                  {stats.criticalCount > 0 && (
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800 text-[10px] px-1 py-0 h-4">
                      {stats.criticalCount} critique{stats.criticalCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {stats.errorCount > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 text-[10px] px-1 py-0 h-4">
                      {stats.errorCount} erreur{stats.errorCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical Events Card */}
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <AlertOctagon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Événements critiques</p>
              <p className="text-xl font-bold">{stats.criticalCount}</p>
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
              <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 text-[10px] px-1.5 py-0 h-4 ml-1">
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
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <Activity className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun événement trouvé</h3>
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

          {/* Events Table */}
          {!isLoading && filteredEvents.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead className="w-[120px]">Sévérité</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[110px]">Source</TableHead>
                      <TableHead className="w-[90px]">Durée</TableHead>
                      <TableHead className="w-[90px]">Statut</TableHead>
                      <TableHead className="w-[130px]">Créé le</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => (
                      <TableRow key={event.id} className="group">
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
                          <span className="text-sm font-mono">
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
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {event.statut === 'ACTIF' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
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
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
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
          {/* Platform Health Score + Summary */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Health Gauge Card */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HeartPulse className="h-5 w-5 text-emerald-600" />
                  Santé globale
                </CardTitle>
                <CardDescription>
                  Score de santé de la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-4">
                {isLoading ? (
                  <div className="flex items-center justify-center h-[180px] w-[180px]">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                  </div>
                ) : (
                  <HealthGauge score={platformHealthScore} size={180} />
                )}
                <div className="mt-4 grid grid-cols-3 gap-4 w-full text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {serviceHealths.filter((s) => s.status === 'OPERATIONNEL').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Opérationnels</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {serviceHealths.filter((s) => s.status === 'DEGRADE').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Dégradés</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">
                      {serviceHealths.filter((s) => s.status === 'INDISPONIBLE').length}
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
                          <Skeleton className="h-9 w-9 rounded-lg" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                        <Skeleton className="h-px w-full" />
                        <div className="grid grid-cols-2 gap-3">
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
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
          {/* Active Alerts Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BellRing className="h-5 w-5 text-emerald-600" />
                Alertes actives
                {activeAlerts.length > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
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
                      <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-5 w-16" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-8 w-48" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : activeAlerts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">Aucune alerte active</h3>
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
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-teal-600" />
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
                              <span className="font-mono font-semibold text-foreground">{rule.threshold}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Actuel :</span>
                              <span className={`font-mono font-semibold ${isExceeded ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {rule.current}
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isExceeded ? 'bg-red-500' : rule.current >= rule.threshold * 0.75 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (rule.current / rule.threshold) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => handleToggleAlertRule(rule.id)}
                          className="data-[state=checked]:bg-emerald-600"
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
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
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
              className="bg-emerald-600 hover:bg-emerald-700"
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
              <ArrowUpRight className="h-5 w-5 text-amber-500" />
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
                <ArrowUpRight className="h-4 w-4 text-amber-500" />
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800 text-xs">
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
              className="bg-amber-600 hover:bg-amber-700"
            >
              Escalader au niveau critique
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
