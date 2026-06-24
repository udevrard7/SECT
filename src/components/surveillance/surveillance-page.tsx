'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Shield,
  ShieldAlert,
  Eye,
  AlertTriangle,
  Camera,
  Monitor,
  Clock,
  User,
  Mail,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  ImageOff,
  Maximize2,
  X,
  Copy,
  Clipboard,
  FileText,
  Keyboard,
  Activity,
  LogOut,
  ExternalLink,
  RefreshCw,
  Download,
  Flag,
  Zap,
  TrendingUp,
  Users,
  Bell,
  CheckCircle2,
  Radio,
  BarChart3,
  Flame,
  ScanEye,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import {
  type SurveillanceSession,
  type EpreuveOption,
  type SurveillanceStats,
  type LogEvent,
  type SeverityLevel,
  getEventTypeLabel,
  getSeverityLevel,
  EVENT_LABELS,
} from '@/lib/surveillance-types'

// ─── Local alerte type (volet "Alertes système") ───
interface AlerteItem {
  id: string
  titre: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: 'PERFORMANCE' | 'FRAUDE' | 'SYSTEME' | 'RAPPEL' | 'CUSTOM'
  lue: boolean
  resolu: boolean
  createdAt: string
  filiere: { id: string; nom: string } | null
  epreuve: { id: string; titre: string } | null
  user: { id: string; name: string; email: string } | null
}

// ─── Utility functions ───

function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)
  if (diffMin < 1) return "À l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD < 7) return `Il y a ${diffD}j`
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getEventTypeIcon(type: string) {
  switch (type) {
    case 'FULLSCREEN_EXIT':
      return <Maximize2 className="h-3.5 w-3.5" />
    case 'TAB_SWITCH':
      return <ExternalLink className="h-3.5 w-3.5" />
    case 'COPY_ATTEMPT':
      return <Copy className="h-3.5 w-3.5" />
    case 'PASTE_ATTEMPT':
      return <Clipboard className="h-3.5 w-3.5" />
    case 'DEVTOOLS_ATTEMPT':
      return <Keyboard className="h-3.5 w-3.5" />
    case 'PRINTSCREEN_ATTEMPT':
      return <Camera className="h-3.5 w-3.5" />
    case 'PRINT_ATTEMPT':
      return <FileText className="h-3.5 w-3.5" />
    case 'ALT_TAB':
      return <LogOut className="h-3.5 w-3.5" />
    case 'INACTIVITY':
      return <Clock className="h-3.5 w-3.5" />
    case 'SCREEN_CAPTURE':
      return <Camera className="h-3.5 w-3.5" />
    case 'AUTO_SUBMIT':
    case 'MANUAL_SUBMIT':
    case 'FORCE_SUBMIT':
      return <Activity className="h-3.5 w-3.5" />
    default:
      return <AlertTriangle className="h-3.5 w-3.5" />
  }
}

function severityClasses(sev: SeverityLevel): string {
  switch (sev) {
    case 'high':
      return 'bg-destructive/15 text-rose-300 border-rose-500/40 sv-glow-rose'
    case 'medium':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40 sv-glow-amber'
    case 'low':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/40'
    default:
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 sv-glow-cyan'
  }
}

function severityLabel(sev: SeverityLevel): string {
  return { high: 'Critique', medium: 'Important', low: 'Mineur', info: 'Info' }[
    sev
  ]
}

function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = {
    EN_COURS: 'En cours',
    SOUMISE: 'Soumise',
    CORRIGEE: 'Corrigée',
    RETOURNEE: 'Rendue',
    NON_SOUMIS: 'Non soumise',
  }
  return labels[statut] || statut
}

function getStatutClasses(statut: string): string {
  switch (statut) {
    case 'EN_COURS':
      return 'bg-success/15 text-emerald-300 border-emerald-500/40 sv-glow-emerald'
    case 'SOUMISE':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    case 'CORRIGEE':
    case 'RETOURNEE':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
    default:
      return 'bg-violet-500/15 text-violet-300 border-violet-500/40'
  }
}

function riskLevelClasses(level: string): {
  text: string
  bg: string
  label: string
} {
  switch (level) {
    case 'critical':
      return {
        text: 'text-rose-300',
        bg: 'bg-destructive/100',
        label: 'Critique',
      }
    case 'high':
      return {
        text: 'text-amber-300',
        bg: 'bg-amber-500',
        label: 'Élevé',
      }
    case 'moderate':
      return {
        text: 'text-violet-300',
        bg: 'bg-violet-500',
        label: 'Modéré',
      }
    default:
      return {
        text: 'text-emerald-300',
        bg: 'bg-success/100',
        label: 'Sûr',
      }
  }
}

// ─── Debounce hook ───
function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════

export function SurveillancePage() {
  const { user } = useAuthStore()

  // ─── État global ───
  const [sessions, setSessions] = useState<SurveillanceSession[]>([])
  const [epreuves, setEpreuves] = useState<EpreuveOption[]>([])
  const [stats, setStats] = useState<SurveillanceStats | null>(null)
  const [alertes, setAlertes] = useState<AlerteItem[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isLive, setIsLive] = useState(true)

  // ─── Filtres ───
  const [epreuveId, setEpreuveId] = useState<string>('all')
  const [severity, setSeverity] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput)

  // ─── UI state ───
  const [activeTab, setActiveTab] = useState<'sessions' | 'analysis' | 'alertes'>(
    'sessions'
  )
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [detailSession, setDetailSession] = useState<SurveillanceSession | null>(
    null
  )
  const [screenshotViewer, setScreenshotViewer] = useState<{
    events: LogEvent[]
    index: number
  } | null>(null)
  const [flagging, setFlagging] = useState<string | null>(null)

  // ─── AbortController ref pour éviter les race conditions ───
  const abortRef = useRef<AbortController | null>(null)

  // ─── Fetch principal (sessions + epreuves) ───
  const fetchSessions = useCallback(
    async (silent = false) => {
      if (!user?.id) return
      // Annule la requête précédente
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      if (!silent) setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (epreuveId && epreuveId !== 'all')
          params.set('epreuveId', epreuveId)
        if (severity && severity !== 'all') params.set('severity', severity)
        if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
        if (debouncedSearch) params.set('search', debouncedSearch)

        const res = await fetch(`/api/surveillance?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setSessions(data.sessions || [])
        setEpreuves(data.epreuves || [])
        setLastRefresh(new Date())
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Fetch surveillance error:', err)
        setError('Impossible de charger les données de surveillance.')
        if (!silent) toast.error('Erreur de chargement')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [user?.id, epreuveId, severity, typeFilter, debouncedSearch]
  )

  // ─── Fetch stats ───
  const fetchStats = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/surveillance/stats')
      if (!res.ok) return
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Fetch stats error:', err)
    }
  }, [user?.id])

  // ─── Fetch alertes ───
  const fetchAlertes = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/alertes?limit=50')
      if (!res.ok) return
      const data = await res.json()
      setAlertes(data.alertes || [])
    } catch (err) {
      console.error('Fetch alertes error:', err)
    }
  }, [user?.id])

  // ─── Effet : fetch au montage + quand filtres changent ───
  useEffect(() => {
    fetchSessions()
    return () => abortRef.current?.abort()
  }, [fetchSessions])

  // ─── Effet : fetch stats + alertes au montage ───
  useEffect(() => {
    fetchStats()
    fetchAlertes()
  }, [fetchStats, fetchAlertes])

  // ─── Effet : polling live toutes les 30s ───
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => {
      fetchSessions(true)
      fetchStats()
    }, 30000)
    return () => clearInterval(interval)
  }, [isLive, fetchSessions, fetchStats])

  // ─── Action : flaguer une session ───
  const handleFlag = async (sessionId: string) => {
    setFlagging(sessionId)
    try {
      const res = await fetch(`/api/surveillance/${sessionId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.info('Cette session a déjà été signalée.')
        } else {
          throw new Error(data.error || 'Erreur')
        }
      } else {
        toast.success('Session signalée — alerte fraude créée', {
          description: data.alerte?.titre,
        })
        // Met à jour l'état local
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, flagged: true } : s))
        )
        // Rafraîchit les alertes
        fetchAlertes()
      }
    } catch (err) {
      console.error('Flag error:', err)
      toast.error('Impossible de signaler la session')
    } finally {
      setFlagging(null)
    }
  }

  // ─── Action : marquer une alerte comme lue/résolue ───
  const handleAlerteAction = async (
    alerteId: string,
    action: 'marquer_lue' | 'resoudre'
  ) => {
    try {
      const res = await fetch(`/api/alertes/${alerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      setAlertes((prev) =>
        prev.map((a) => (a.id === alerteId ? data.alerte : a))
      )
      toast.success(
        action === 'resoudre' ? 'Alerte résolue' : 'Alerte marquée comme lue'
      )
    } catch (err) {
      console.error('Alerte action error:', err)
      toast.error('Action impossible')
    }
  }

  // ─── Export CSV du journal ───
  const handleExportCSV = () => {
    const rows: string[] = [
      [
        'Étudiant',
        'Email',
        'Épreuve',
        'Statut',
        'Alertes',
        'Pénalité',
        'Score risque',
        'Niveau risque',
        'Date début',
        'Date fin',
      ].join(';'),
    ]
    for (const s of sessions) {
      rows.push(
        [
          s.etudiant.name,
          s.etudiant.email,
          s.epreuve.titre,
          s.statut,
          s.alertes,
          s.totalPenalite,
          s.riskScore ?? 0,
          s.riskLevel ?? 'safe',
          s.dateDebut ? formatDateTime(s.dateDebut) : '',
          s.dateFin ? formatDateTime(s.dateFin) : '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(';')
      )
    }
    const csv = '\ufeff' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `surveillance_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Export CSV téléchargé')
  }

  // ─── Stats dérivées (fallback si stats pas encore chargées) ───
  const derivedKpis = useMemo(() => {
    const activeSessions = sessions.filter((s) => s.statut === 'EN_COURS').length
    const totalAlerts = sessions.reduce((sum, s) => sum + s.alertes, 0)
    const totalPenalite = sessions.reduce(
      (sum, s) => sum + s.totalPenalite,
      0
    )
    const flagged = sessions.filter((s) => s.flagged).length
    return { activeSessions, totalAlerts, totalPenalite, flagged }
  }, [sessions])

  const kpis = stats?.kpis ?? {
    totalSessions: sessions.length,
    activeSessions: derivedKpis.activeSessions,
    sessionsWithAlerts: sessions.filter((s) => s.alertes > 0).length,
    totalAlerts: derivedKpis.totalAlerts,
    totalPenalite: derivedKpis.totalPenalite,
    flaggedSessions: derivedKpis.flagged,
    screenshots: 0,
  }

  const alertesNonLues = alertes.filter((a) => !a.lue).length

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="sv-gaming space-y-6">
      {/* ─── Header ─── */}
      <header className="ds-kente-pattern sv-card sv-border-flow relative overflow-hidden p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 sv-glow-violet">
                <ShieldAlert className="h-7 w-7 text-white" />
              </div>
              {isLive && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="sv-live-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-success/100" />
                </span>
              )}
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                Surveillance &amp; Alertes
              </h1>
              <p className="mt-1 text-sm text-violet-200/70">
                Centre de contrôle anti-fraude en temps réel
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-emerald-300">
                  <Radio className="h-3 w-3 sv-live-dot" />
                  {isLive ? 'Live' : 'Pause'}
                </span>
                {lastRefresh && (
                  <span className="text-violet-200/50">
                    MAJ : {formatTime(lastRefresh.toISOString())}
                  </span>
                )}
                {alertesNonLues > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-rose-300 sv-glow-rose">
                    <Bell className="h-3 w-3" />
                    {alertesNonLues} alerte{alertesNonLues > 1 ? 's' : ''} non lue
                    {alertesNonLues > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLive((v) => !v)}
              className="sv-focus border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:text-violet-100"
              aria-label={isLive ? 'Mettre en pause le live' : 'Activer le live'}
            >
              {isLive ? (
                <>
                  <span className="sv-live-dot mr-1.5 h-2 w-2 rounded-full bg-emerald-400" />
                  Live
                </>
              ) : (
                <>
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
                  Pause
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchSessions()
                fetchStats()
                fetchAlertes()
              }}
              className="sv-focus border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:text-violet-100"
              aria-label="Rafraîchir les données"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Actualiser
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={sessions.length === 0}
              className="sv-focus border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-fuchsia-100"
              aria-label="Exporter en CSV"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      {/* ─── KPI Grid ─── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Monitor className="h-5 w-5" />}
          label="Sessions actives"
          value={kpis.activeSessions}
          sub={`${kpis.totalSessions} au total`}
          color="emerald"
          loading={loading}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Alertes fraude"
          value={kpis.totalAlerts}
          sub={`${kpis.sessionsWithAlerts} sessions concernées`}
          color="amber"
          loading={loading}
        />
        <KpiCard
          icon={<Zap className="h-5 w-5" />}
          label="Pénalités totales"
          value={kpis.totalPenalite}
          sub="points déduits"
          color="fuchsia"
          loading={loading}
        />
        <KpiCard
          icon={<Flag className="h-5 w-5" />}
          label="Sessions signalées"
          value={kpis.flaggedSessions}
          sub={`${kpis.screenshots} captures`}
          color="rose"
          loading={loading}
        />
      </section>

      {/* ─── Onglets ─── */}
      <nav
        className="flex flex-wrap gap-1 rounded-xl border border-violet-500/20 bg-violet-500/5 p-1"
        role="tablist"
        aria-label="Sections de surveillance"
      >
        <TabButton
          active={activeTab === 'sessions'}
          onClick={() => setActiveTab('sessions')}
          icon={<Eye className="h-4 w-4" />}
          label="Sessions surveillées"
          count={sessions.length}
        />
        <TabButton
          active={activeTab === 'analysis'}
          onClick={() => setActiveTab('analysis')}
          icon={<BarChart3 className="h-4 w-4" />}
          label="Analyse fraude"
        />
        <TabButton
          active={activeTab === 'alertes'}
          onClick={() => setActiveTab('alertes')}
          icon={<Bell className="h-4 w-4" />}
          label="Alertes système"
          count={alertesNonLues > 0 ? alertesNonLues : undefined}
        />
      </nav>

      {/* ─── Contenu des onglets ─── */}
      {activeTab === 'sessions' && (
        <SessionsTab
          sessions={sessions}
          epreuves={epreuves}
          loading={loading}
          error={error}
          filters={{
            epreuveId,
            setEpreuveId,
            severity,
            setSeverity,
            typeFilter,
            setTypeFilter,
            searchInput,
            setSearchInput,
          }}
          expandedSession={expandedSession}
          setExpandedSession={setExpandedSession}
          onOpenDetail={setDetailSession}
          onFlag={handleFlag}
          flagging={flagging}
          onOpenScreenshot={(events, index) =>
            setScreenshotViewer({ events, index })
          }
        />
      )}

      {activeTab === 'analysis' && (
        <AnalysisTab stats={stats} loading={loading} />
      )}

      {activeTab === 'alertes' && (
        <AlertesTab
          alertes={alertes}
          loading={loading}
          onAction={handleAlerteAction}
        />
      )}

      {/* ─── Panneau de détail (Sheet) ─── */}
      <DetailSheet
        session={detailSession}
        onClose={() => setDetailSession(null)}
        onFlag={handleFlag}
        flagging={flagging}
        onOpenScreenshot={(events, index) =>
          setScreenshotViewer({ events, index })
        }
      />

      {/* ─── Visionneuse de captures ─── */}
      {screenshotViewer && (
        <ScreenshotViewer
          events={screenshotViewer.events}
          index={screenshotViewer.index}
          onClose={() => setScreenshotViewer(null)}
          onIndexChange={(index) =>
            setScreenshotViewer({ events: screenshotViewer.events, index })
          }
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════

// ─── KPI Card ───
function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub: string
  color: 'emerald' | 'amber' | 'fuchsia' | 'rose' | 'violet' | 'cyan'
  loading: boolean
}) {
  const colorMap = {
    emerald: 'text-emerald-300 sv-glow-emerald',
    amber: 'text-amber-300 sv-glow-amber',
    fuchsia: 'text-fuchsia-300 sv-glow-fuchsia',
    rose: 'text-rose-300 sv-glow-rose',
    violet: 'text-violet-300 sv-glow-violet',
    cyan: 'text-cyan-300 sv-glow-cyan',
  }
  const bgMap = {
    emerald: 'bg-success/15',
    amber: 'bg-amber-500/15',
    fuchsia: 'bg-fuchsia-500/15',
    rose: 'bg-destructive/15',
    violet: 'bg-violet-500/15',
    cyan: 'bg-cyan-500/15',
  }
  return (
    <div className="sv-kpi p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-violet-200/60">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-8 w-20 rounded sv-skeleton" />
          ) : (
            <p className="mt-1 bg-gradient-to-br from-white to-violet-200 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              {value}
            </p>
          )}
          <p className="mt-1 truncate text-xs text-violet-200/50">{sub}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bgMap[color]} ${colorMap[color]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Tab Button ───
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`sv-focus inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4 ${
        active
          ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg sv-glow-violet'
          : 'text-violet-200/70 hover:bg-violet-500/10 hover:text-violet-100'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(' ')[0]}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
            active
              ? 'bg-white/25 text-white'
              : 'bg-destructive/30 text-rose-200 sv-glow-rose'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Sessions Tab ───
function SessionsTab({
  sessions,
  epreuves,
  loading,
  error,
  filters,
  expandedSession,
  setExpandedSession,
  onOpenDetail,
  onFlag,
  flagging,
  onOpenScreenshot,
}: {
  sessions: SurveillanceSession[]
  epreuves: EpreuveOption[]
  loading: boolean
  error: string | null
  filters: {
    epreuveId: string
    setEpreuveId: (v: string) => void
    severity: string
    setSeverity: (v: string) => void
    typeFilter: string
    setTypeFilter: (v: string) => void
    searchInput: string
    setSearchInput: (v: string) => void
  }
  expandedSession: string | null
  setExpandedSession: (v: string | null) => void
  onOpenDetail: (s: SurveillanceSession) => void
  onFlag: (id: string) => void
  flagging: string | null
  onOpenScreenshot: (events: LogEvent[], index: number) => void
}) {
  return (
    <div className="space-y-4">
      {/* ─── Barre de filtres ─── */}
      <div className="sv-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Épreuve */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-violet-200/70">
              Épreuve
            </label>
            <Select
              value={filters.epreuveId}
              onValueChange={filters.setEpreuveId}
            >
              <SelectTrigger className="sv-focus border-violet-500/30 bg-violet-500/5 text-violet-100">
                <SelectValue placeholder="Toutes les épreuves" />
              </SelectTrigger>
              <SelectContent className="dark border-violet-500/40">
                <SelectItem value="all">Toutes les épreuves</SelectItem>
                {epreuves.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    {ep.titre} ({ep.totalAlerts} alertes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sévérité */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-violet-200/70">
              Sévérité
            </label>
            <Select
              value={filters.severity}
              onValueChange={filters.setSeverity}
            >
              <SelectTrigger className="sv-focus border-violet-500/30 bg-violet-500/5 text-violet-100">
                <SelectValue placeholder="Toutes sévérités" />
              </SelectTrigger>
              <SelectContent className="dark border-violet-500/40">
                <SelectItem value="all">Toutes sévérités</SelectItem>
                <SelectItem value="high">Critique</SelectItem>
                <SelectItem value="medium">Important</SelectItem>
                <SelectItem value="low">Mineur</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type d'événement */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-violet-200/70">
              Type d&apos;événement
            </label>
            <Select
              value={filters.typeFilter}
              onValueChange={filters.setTypeFilter}
            >
              <SelectTrigger className="sv-focus border-violet-500/30 bg-violet-500/5 text-violet-100">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent className="dark border-violet-500/40">
                <SelectItem value="all">Tous les types</SelectItem>
                {Object.entries(EVENT_LABELS).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recherche */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-violet-200/70">
              Rechercher un étudiant
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300/50" />
              <Input
                value={filters.searchInput}
                onChange={(e) => filters.setSearchInput(e.target.value)}
                placeholder="Nom ou email..."
                className="sv-focus border-violet-500/30 bg-violet-500/5 pl-8 text-violet-100 placeholder:text-violet-300/40"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Erreur ─── */}
      {error && (
        <div className="sv-card border-rose-500/40 bg-destructive/100/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      {/* ─── Liste des sessions ─── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="sv-card h-32 p-4">
              <div className="sv-skeleton h-full w-full rounded" />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="sv-card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
            <Shield className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-display font-semibold tracking-tight text-violet-100">
            Aucune session à surveiller
          </h3>
          <p className="mt-1 max-w-sm text-sm text-violet-200/60">
            Les sessions d&apos;évaluation apparaîtront ici dès qu&apos;un
            étudiant commencera une épreuve.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, idx) => (
            <SessionCard
              key={session.id}
              session={session}
              expanded={expandedSession === session.id}
              onToggle={() =>
                setExpandedSession(
                  expandedSession === session.id ? null : session.id
                )
              }
              onOpenDetail={() => onOpenDetail(session)}
              onFlag={() => onFlag(session.id)}
              flagging={flagging === session.id}
              onOpenScreenshot={onOpenScreenshot}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Session Card ───
function SessionCard({
  session,
  expanded,
  onToggle,
  onOpenDetail,
  onFlag,
  flagging,
  onOpenScreenshot,
  index,
}: {
  session: SurveillanceSession
  expanded: boolean
  onToggle: () => void
  onOpenDetail: () => void
  onFlag: () => void
  flagging: boolean
  onOpenScreenshot: (events: LogEvent[], index: number) => void
  index: number
}) {
  const risk = riskLevelClasses(session.riskLevel ?? 'safe')
  const score = session.riskScore ?? 0
  const isLive = session.statut === 'EN_COURS'

  return (
    <div
      className="sv-card sv-slide-in overflow-hidden"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Bande de risque à gauche */}
      <div className="flex">
        <div
          className={`w-1.5 shrink-0 ${risk.bg}`}
          style={{
            boxShadow:
              score >= 70
                ? '0 0 12px rgba(244,63,94,0.6)'
                : score >= 40
                ? '0 0 10px rgba(245,158,11,0.5)'
                : '0 0 8px rgba(16,185,129,0.4)',
          }}
          aria-hidden
        />

        <div className="min-w-0 flex-1 p-4">
          {/* En-tête */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onToggle}
                  className="sv-focus flex items-center gap-1.5 rounded text-left"
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? 'Réduire les détails'
                      : 'Développer les détails'
                  }
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-violet-300" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-violet-300" />
                  )}
                </button>
                <h3 className="truncate font-display font-semibold tracking-tight text-violet-50">
                  {session.etudiant.name}
                </h3>
                <Badge
                  variant="outline"
                  className={`${getStatutClasses(session.statut)} border text-xs`}
                >
                  {isLive && (
                    <span className="sv-live-dot mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                  {getStatutLabel(session.statut)}
                </Badge>
                {session.flagged && (
                  <Badge className="border border-rose-500/40 bg-destructive/15 text-xs text-rose-300 sv-glow-rose">
                    <Flag className="mr-1 h-3 w-3" />
                    Signalée
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-violet-200/60">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {session.etudiant.email}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {session.epreuve.titre}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {session.dateDebut
                    ? formatDateTime(session.dateDebut)
                    : '—'}
                </span>
              </div>
            </div>

            {/* Score de risque + métriques */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-xs text-violet-200/60">Alertes</p>
                  <p className="text-lg font-bold text-amber-300">
                    {session.alertes}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-violet-200/60">Pénalité</p>
                  <p className="text-lg font-bold text-fuchsia-300">
                    {session.totalPenalite}
                  </p>
                </div>
              </div>

              {/* Risk meter */}
              <div className="w-28">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-violet-200/60">Risque</span>
                  <span className={`font-bold ${risk.text}`}>{score}</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-violet-950/50">
                  <div
                    className={`sv-bar absolute inset-y-0 left-0 ${risk.bg}`}
                    style={{
                      width: `${score}%`,
                      boxShadow:
                        score >= 70
                          ? '0 0 8px rgba(244,63,94,0.6)'
                          : '0 0 6px rgba(168,85,247,0.4)',
                    }}
                  />
                </div>
                <p className={`mt-0.5 text-center text-xs font-medium ${risk.text}`}>
                  {risk.label}
                </p>
              </div>
            </div>
          </div>

          {/* Détails repliables */}
          {expanded && (
            <div className="sv-slide-in mt-4 space-y-3 border-t border-violet-500/20 pt-4">
              {/* Raccourcis événements */}
              <div className="flex flex-wrap items-center gap-2">
                {session.fraudEvents.length > 0 && (
                  <Badge className="border border-rose-500/40 bg-destructive/100/10 text-xs text-rose-300">
                    <Flame className="mr-1 h-3 w-3" />
                    {session.fraudEvents.length} fraude
                    {session.fraudEvents.length > 1 ? 's' : ''}
                  </Badge>
                )}
                {session.screenshotEvents.length > 0 && (
                  <button
                    onClick={() => onOpenScreenshot(session.screenshotEvents, 0)}
                    className="sv-focus inline-flex"
                    aria-label="Voir les captures d'écran"
                  >
                    <Badge className="border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-300 hover:bg-cyan-500/20">
                      <Camera className="mr-1 h-3 w-3" />
                      {session.screenshotEvents.length} capture
                      {session.screenshotEvents.length > 1 ? 's' : ''}
                    </Badge>
                  </button>
                )}
                {session.submissionEvents.length > 0 && (
                  <Badge className="border border-emerald-500/40 bg-success/100/10 text-xs text-emerald-300">
                    <Activity className="mr-1 h-3 w-3" />
                    {session.submissionEvents.length} soumission
                    {session.submissionEvents.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {/* Timeline des derniers événements (5 max) */}
              {session.logEvents.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-violet-200/60">
                    Derniers événements
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto sv-scroll pr-2">
                    {session.logEvents.slice(-8).reverse().map((evt, i) => {
                      const sev = getSeverityLevel(evt.type)
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md bg-violet-500/5 px-2 py-1.5 text-xs"
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded ${severityClasses(sev)}`}
                          >
                            {getEventTypeIcon(evt.type)}
                          </span>
                          <span className="font-medium text-violet-100">
                            {getEventTypeLabel(evt.type)}
                          </span>
                          {evt.penalite ? (
                            <span className="text-fuchsia-300">
                              -{evt.penalite} pts
                            </span>
                          ) : null}
                          <span className="ml-auto text-violet-200/40">
                            {formatTime(evt.timestamp)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-violet-200/50">
                  Aucun événement enregistré.
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenDetail}
                  className="sv-focus border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                >
                  <ScanEye className="mr-1.5 h-3.5 w-3.5" />
                  Détails complets
                </Button>
                {!session.flagged && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onFlag}
                    disabled={flagging}
                    className="sv-focus border-rose-500/40 bg-destructive/100/10 text-rose-200 hover:bg-destructive/100/20"
                  >
                    {flagging ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Flag className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Signaler
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Analysis Tab ───
function AnalysisTab({
  stats,
  loading,
}: {
  stats: SurveillanceStats | null
  loading: boolean
}) {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="sv-card h-64 p-4">
            <div className="sv-skeleton h-full w-full rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats || stats.kpis.totalSessions === 0) {
    return (
      <div className="sv-card flex flex-col items-center justify-center p-12 text-center">
        <BarChart3 className="mb-3 h-12 w-12 text-violet-300/50" />
        <p className="text-violet-200/70">
          Pas encore assez de données pour l&apos;analyse.
        </p>
      </div>
    )
  }

  const maxFraud = Math.max(...stats.fraudByType.map((f) => f.count), 1)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Répartition des fraudes par type */}
      <div className="sv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Flame className="h-5 w-5 text-rose-300" />
          <h3 className="font-display font-semibold tracking-tight text-violet-50">
            Répartition des fraudes
          </h3>
        </div>
        {stats.fraudByType.length === 0 ? (
          <p className="py-8 text-center text-sm text-violet-200/50">
            Aucune fraude détectée. 🎉
          </p>
        ) : (
          <div className="space-y-2.5">
            {stats.fraudByType.map((f, i) => (
              <div key={f.type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-violet-100">{f.label}</span>
                  <span className="font-bold text-rose-300">{f.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-violet-950/50">
                  <div
                    className="sv-bar h-full rounded-full bg-gradient-to-r from-violet-500 to-rose-500"
                    style={{
                      width: `${(f.count / maxFraud) * 100}%`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline 7 jours */}
      <div className="sv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-fuchsia-300" />
          <h3 className="font-display font-semibold tracking-tight text-violet-50">Activité (7 jours)</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={stats.timeline}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="alertsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="rgb(217 70 239)"
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor="rgb(217 70 239)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(168,85,247,0.1)"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(216,180,254,0.6)', fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getDate()}/${d.getMonth() + 1}`
              }}
            />
            <YAxis
              tick={{ fill: 'rgba(216,180,254,0.6)', fontSize: 11 }}
              allowDecimals={false}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(30,10,50,0.95)',
                border: '1px solid rgba(168,85,247,0.4)',
                borderRadius: '8px',
                color: '#f0e7ff',
              }}
              labelFormatter={(v) => {
                const d = new Date(v)
                return d.toLocaleDateString('fr-FR')
              }}
            />
            <Area
              type="monotone"
              dataKey="alerts"
              name="Alertes"
              stroke="rgb(217 70 239)"
              strokeWidth={2}
              fill="url(#alertsGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top étudiants */}
      <div className="sv-card p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-violet-300" />
          <h3 className="font-display font-semibold tracking-tight text-violet-50">
            Top étudiants par alertes
          </h3>
        </div>
        {stats.topStudents.length === 0 ? (
          <p className="py-6 text-center text-sm text-violet-200/50">
            Aucune alerte enregistrée.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stats.topStudents.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg bg-violet-500/5 p-3"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${
                    i === 0
                      ? 'bg-amber-500/20 text-amber-300 sv-glow-amber'
                      : i === 1
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-violet-500/10 text-violet-300/70'
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-violet-50">
                    {s.name}
                  </p>
                  <p className="truncate text-xs text-violet-200/50">
                    {s.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-rose-300">
                    {s.alertes}
                  </p>
                  <p className="text-xs text-fuchsia-300/70">
                    -{s.penalite} pts
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Alertes Tab ───
function AlertesTab({
  alertes,
  loading,
  onAction,
}: {
  alertes: AlerteItem[]
  loading: boolean
  onAction: (id: string, action: 'marquer_lue' | 'resoudre') => void
}) {
  if (loading && alertes.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="sv-card h-20 p-4">
            <div className="sv-skeleton h-full w-full rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (alertes.length === 0) {
    return (
      <div className="sv-card flex flex-col items-center justify-center p-12 text-center">
        <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-300/60" />
        <p className="text-violet-200/70">Aucune alerte système.</p>
      </div>
    )
  }

  const sevConfig = {
    CRITICAL: {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Critique',
      classes: 'border-rose-500/40 bg-destructive/15 text-rose-300 sv-glow-rose',
    },
    WARNING: {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Attention',
      classes: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    },
    INFO: {
      icon: <Bell className="h-4 w-4" />,
      label: 'Info',
      classes: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
    },
  }

  return (
    <div className="space-y-2">
      {alertes.map((a, idx) => {
        const cfg = sevConfig[a.severity] ?? sevConfig.INFO
        return (
          <div
            key={a.id}
            className={`sv-card sv-slide-in p-4 ${!a.lue ? 'border-l-2 border-l-violet-500' : ''}`}
            style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${cfg.classes}`}
              >
                {cfg.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4
                    className={`text-sm ${!a.lue ? 'font-bold text-violet-50' : 'font-medium text-violet-200/80'}`}
                  >
                    {a.titre}
                  </h4>
                  {!a.lue && (
                    <span className="h-2 w-2 rounded-full bg-violet-400 sv-glow-violet" />
                  )}
                  {a.resolu && (
                    <Badge className="border border-emerald-500/40 bg-success/15 text-xs text-emerald-300">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Résolue
                    </Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-violet-200/60">
                  {a.description}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-violet-200/40">
                  <span>{formatRelativeDate(a.createdAt)}</span>
                  {a.epreuve && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {a.epreuve.titre}
                    </span>
                  )}
                  {a.filiere && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {a.filiere.nom}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {!a.lue && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="sv-focus h-7 px-2 text-xs text-violet-200 hover:bg-violet-500/15"
                    onClick={() => onAction(a.id, 'marquer_lue')}
                  >
                    Marquer lue
                  </Button>
                )}
                {!a.resolu && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="sv-focus h-7 px-2 text-xs text-emerald-300 hover:bg-success/15"
                    onClick={() => onAction(a.id, 'resoudre')}
                  >
                    Résoudre
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Detail Sheet ───
function DetailSheet({
  session,
  onClose,
  onFlag,
  flagging,
  onOpenScreenshot,
}: {
  session: SurveillanceSession | null
  onClose: () => void
  onFlag: (id: string) => void
  flagging: string | null
  onOpenScreenshot: (events: LogEvent[], index: number) => void
}) {
  return (
    <Sheet open={!!session} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="border-violet-500/30 bg-violet-950 text-violet-50 sv-scroll w-full overflow-y-auto sm:max-w-2xl">
        {session && (
          <>
            <SheetHeader>
              <SheetTitle className="bg-gradient-to-r from-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                Détails de surveillance
              </SheetTitle>
              <SheetDescription className="text-violet-200/60">
                {session.etudiant.name} — {session.epreuve.titre}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              {/* Métriques */}
              <div className="grid grid-cols-3 gap-3">
                <div className="sv-card p-3 text-center">
                  <p className="text-xs text-violet-200/60">Alertes</p>
                  <p className="text-2xl font-bold text-amber-300">
                    {session.alertes}
                  </p>
                </div>
                <div className="sv-card p-3 text-center">
                  <p className="text-xs text-violet-200/60">Pénalité</p>
                  <p className="text-2xl font-bold text-fuchsia-300">
                    {session.totalPenalite}
                  </p>
                </div>
                <div className="sv-card p-3 text-center">
                  <p className="text-xs text-violet-200/60">Risque</p>
                  <p
                    className={`text-2xl font-bold ${riskLevelClasses(session.riskLevel ?? 'safe').text}`}
                  >
                    {session.riskScore ?? 0}
                  </p>
                </div>
              </div>

              {/* Infos session */}
              <div className="sv-card space-y-2 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-violet-200/60">Statut</span>
                  <Badge
                    variant="outline"
                    className={getStatutClasses(session.statut)}
                  >
                    {getStatutLabel(session.statut)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-violet-200/60">Email</span>
                  <span className="text-violet-100">{session.etudiant.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-violet-200/60">Début</span>
                  <span className="text-violet-100">
                    {formatDateTime(session.dateDebut)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-violet-200/60">Fin</span>
                  <span className="text-violet-100">
                    {formatDateTime(session.dateFin)}
                  </span>
                </div>
                {session.score !== null && (
                  <div className="flex justify-between">
                    <span className="text-violet-200/60">Score</span>
                    <span className="font-bold text-emerald-300">
                      {session.score}/20
                    </span>
                  </div>
                )}
              </div>

              {/* Captures d'écran */}
              {session.screenshotEvents.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-100">
                    <Camera className="h-4 w-4 text-cyan-300" />
                    Captures ({session.screenshotEvents.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {session.screenshotEvents.slice(0, 12).map((evt, i) => (
                      <button
                        key={i}
                        onClick={() => onOpenScreenshot(session.screenshotEvents, i)}
                        className="sv-focus group relative aspect-video overflow-hidden rounded-lg border border-violet-500/30 bg-violet-950/50"
                        aria-label={`Capture ${i + 1}`}
                      >
                        {evt.thumbnail ? (
                          <img
                            src={evt.thumbnail}
                            alt={`Capture ${i + 1}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageOff className="h-6 w-6 text-violet-300/40" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 rounded bg-violet-950/80 px-1 text-xs text-violet-200">
                          {formatTime(evt.timestamp)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline complète */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-100">
                  <Activity className="h-4 w-4 text-violet-300" />
                  Journal complet ({session.logEvents.length})
                </h4>
                <ScrollArea className="h-72 rounded-lg border border-violet-500/20 bg-violet-950/30 p-2">
                  <div className="space-y-1.5">
                    {[...session.logEvents].reverse().map((evt, i) => {
                      const sev = getSeverityLevel(evt.type)
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-2 rounded-md bg-violet-500/5 px-2 py-2 text-xs"
                        >
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${severityClasses(sev)}`}
                          >
                            {getEventTypeIcon(evt.type)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-violet-100">
                                {getEventTypeLabel(evt.type)}
                              </span>
                              <span className="text-violet-200/40">
                                {formatTime(evt.timestamp)}
                              </span>
                            </div>
                            {evt.details && (
                              <p className="mt-0.5 text-violet-200/50">
                                {evt.details}
                              </p>
                            )}
                            {evt.penalite ? (
                              <span className="mt-0.5 inline-block text-fuchsia-300">
                                Pénalité : -{evt.penalite} pts
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pb-6">
                {!session.flagged && (
                  <Button
                    onClick={() => onFlag(session.id)}
                    disabled={flagging === session.id}
                    className="sv-focus flex-1 border border-rose-500/40 bg-destructive/15 text-rose-200 hover:bg-destructive/100/25"
                  >
                    {flagging === session.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Flag className="mr-2 h-4 w-4" />
                    )}
                    Signaler cette session
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Screenshot Viewer (Dialog plein écran) ───
function ScreenshotViewer({
  events,
  index,
  onClose,
  onIndexChange,
}: {
  events: LogEvent[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}) {
  const current = events[index]
  if (!current) return null

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-violet-500/30 bg-violet-950 text-violet-50 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-violet-100">
            <span>
              Capture {index + 1} / {events.length}
            </span>
            <span className="text-xs font-normal text-violet-200/60">
              {current.timestamp && formatDateTime(current.timestamp)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center">
          {current.thumbnail ? (
            <img
              src={current.thumbnail}
              alt={`Capture ${index + 1}`}
              className="max-h-[60vh] w-auto rounded-lg border border-violet-500/30"
            />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-lg border border-violet-500/30 bg-violet-950/50">
              <ImageOff className="h-12 w-12 text-violet-300/40" />
            </div>
          )}

          {events.length > 1 && (
            <>
              <Button
                size="icon"
                variant="outline"
                onClick={() =>
                  onIndexChange((index - 1 + events.length) % events.length)
                }
                className="sv-focus absolute left-2 border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                aria-label="Capture précédente"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => onIndexChange((index + 1) % events.length)}
                className="sv-focus absolute right-2 border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                aria-label="Capture suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
