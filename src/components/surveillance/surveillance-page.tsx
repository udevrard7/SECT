'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Shield, ShieldAlert, Eye, AlertTriangle, Camera, Monitor, Clock,
  User, Mail, ChevronDown, ChevronRight, Loader2, Search, ImageOff,
  X, FileText, Activity, RefreshCw, Download, Flag, Zap, TrendingUp,
  Users, Bell, CheckCircle2, Radio, BarChart3, Flame, ScanEye,
  Gauge, FileWarning, AlertOctagon, GitCompare, UserCheck,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid, AreaChart, Area,
} from 'recharts'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PulseSkeleton, StatCard } from '@/components/ds'
import { toast } from 'sonner'
import {
  type SurveillanceSession, type EpreuveOption, type SurveillanceStats,
  type LogEvent, type SeverityLevel, type SessionCapture,
  type FraudReport, type FraudReportEvent,
  type SimilarityReport, type SimilarityResponse,
  getEventTypeLabel, getSeverityLevel, EVENT_LABELS,
} from '@/lib/surveillance-types'
import { useSurveillanceWS } from '@/hooks/use-surveillance-ws'

// ─── Local alerte type ───
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

// ─── Identity photo type (verificationIdentite) ───
interface IdentityPhotoItem {
  id: string
  etudiantId: string
  epreuveId: string
  sessionId?: string
  url?: string
  r2Key?: string
  photoType: string
  imageHash?: string
  verifiedAt?: string
  verifiedBy?: string
  createdAt: string
}

// ─── Utility functions ───

function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getEventTypeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    FULLSCREEN_EXIT: <Monitor className="h-3.5 w-3.5" />,
    TAB_SWITCH: <ScanEye className="h-3.5 w-3.5" />,
    COPY_ATTEMPT: <FileText className="h-3.5 w-3.5" />,
    PASTE_ATTEMPT: <FileText className="h-3.5 w-3.5" />,
    DEVTOOLS_ATTEMPT: <Activity className="h-3.5 w-3.5" />,
    PRINTSCREEN_ATTEMPT: <Camera className="h-3.5 w-3.5" />,
    PRINT_ATTEMPT: <FileText className="h-3.5 w-3.5" />,
    ALT_TAB: <ScanEye className="h-3.5 w-3.5" />,
    INACTIVITY: <Clock className="h-3.5 w-3.5" />,
    SCREEN_CAPTURE: <Camera className="h-3.5 w-3.5" />,
    AUTO_SUBMIT: <CheckCircle2 className="h-3.5 w-3.5" />,
    MANUAL_SUBMIT: <CheckCircle2 className="h-3.5 w-3.5" />,
    FORCE_SUBMIT: <AlertTriangle className="h-3.5 w-3.5" />,
  }
  return icons[type] || <Bell className="h-3.5 w-3.5" />
}

function severityClasses(sev: SeverityLevel): string {
  switch (sev) {
    case 'high': return 'bg-destructive/15 text-destructive'
    case 'medium': return 'bg-warning/15 text-warning'
    case 'low': return 'bg-info/15 text-info'
    default: return 'bg-muted text-muted-foreground'
  }
}

function severityLabel(sev: SeverityLevel): string {
  return { high: 'Critique', medium: 'Important', low: 'Mineur', info: 'Info' }[sev]
}

function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = {
    NON_COMMENCEE: 'Non commencée', EN_COURS: 'En cours', SOUMISE: 'Soumise',
    CORRIGEE: 'Corrigée', RETOURNEE: 'Rendue', ABSENT: 'Absent', NON_SOUMIS: 'Non soumis',
  }
  return labels[statut] || statut
}

function getStatutClasses(statut: string): string {
  const cls: Record<string, string> = {
    EN_COURS: 'border-success/30 bg-success/10 text-success-text',
    SOUMISE: 'border-info/30 bg-info/10 text-info',
    CORRIGEE: 'border-primary/30 bg-primary/10 text-primary-text',
    RETOURNEE: 'border-primary/30 bg-primary/10 text-primary-text',
    ABSENT: 'border-destructive/30 bg-destructive/10 text-destructive',
    NON_SOUMIS: 'border-warning/30 bg-warning/10 text-warning',
    NON_COMMENCEE: 'border-border bg-muted text-muted-foreground',
  }
  return cls[statut] || 'border-border bg-muted text-muted-foreground'
}

function riskLevelClasses(level: string): { bg: string; text: string; label: string; border: string } {
  switch (level) {
    case 'critical': return { bg: 'bg-destructive', text: 'text-destructive', label: 'Critique', border: 'border-l-destructive' }
    case 'high': return { bg: 'bg-warning', text: 'text-warning', label: 'Élevé', border: 'border-l-warning' }
    case 'moderate': return { bg: 'bg-info', text: 'text-info', label: 'Modéré', border: 'border-l-info' }
    default: return { bg: 'bg-success', text: 'text-success-text', label: 'Sûr', border: 'border-l-success' }
  }
}

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
  const queryClient = useQueryClient()
  const [alertes, setAlertes] = useState<AlerteItem[]>([])
  const [isLive, setIsLive] = useState(true)
  // UX-IMPROVE : epreuveId démarre à '' (vide) au lieu de 'all'. Les données
  // de surveillance ne s'affichent qu'après que l'utilisateur sélectionne une
  // épreuve ET une date. Avant, toutes les sessions étaient chargées d'un coup
  // (jusqu'à 200) → scroll infini sur la page.
  const [epreuveId, setEpreuveId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [severity, setSeverity] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput)
  const [activeTab, setActiveTab] = useState<'sessions' | 'analysis' | 'alertes' | 'similarite'>('sessions')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [detailSession, setDetailSession] = useState<SurveillanceSession | null>(null)
  const [screenshotViewer, setScreenshotViewer] = useState<{ events: LogEvent[]; index: number } | null>(null)
  const [flagging, setFlagging] = useState<string | null>(null)
  const [capturesViewer, setCapturesViewer] = useState<{ sessionId: string; captures: SessionCapture[]; index: number } | null>(null)
  const [capturesLoading, setCapturesLoading] = useState(false)
  const [fraudReport, setFraudReport] = useState<FraudReport | null>(null)
  const [fraudReportLoading, setFraudReportLoading] = useState(false)
  const [similarityDetail, setSimilarityDetail] = useState<SimilarityReport | null>(null)

  // ─── Identity photos state (verificationIdentite) ──────────────────
  const [identityPhotos, setIdentityPhotos] = useState<IdentityPhotoItem[]>([])
  const [identityPhotosLoading, setIdentityPhotosLoading] = useState(false)
  const [verifyingPhotoId, setVerifyingPhotoId] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════════
  // OPT-7 : WebSocket temps réel pour surveillance.
  // Quand le WS est connecté, le polling est désactivé.
  // Quand il est déconnecté, on retombe sur le polling 30s (fallback).
  // ═══════════════════════════════════════════════════════════════
  const { connectionStatus } = useSurveillanceWS({
    epreuveIds: epreuveId && epreuveId !== 'all' ? [epreuveId] : [],
    enabled: isLive && !!user?.id,
    userId: user?.id,
  })
  const isWSConnected = connectionStatus === 'connected'

  // ═══════════════════════════════════════════════════════════════
  // DATA FETCHING (BUGFIX QUERY-MIGRATION-1 : TanStack Query)
  // ═══════════════════════════════════════════════════════════════
  //
  // NOTE : le queryKey inclut les filtres (epreuveId, severity, typeFilter,
  // debouncedSearch) car l'API /api/surveillance les prend en query params
  // (comme les deps du useCallback original). Quand un filtre change, la
  // query est recréée et refetch automatiquement.
  //
  // Polling : refetchInterval: isLive ? 30000 : false. Préserve le bouton
  // Pause/Live — si isLive est false, aucun refetch. refetchIntervalInBackground:
  // false arrête le polling si l'onglet est caché (économie réseau).
  // UX-IMPROVE : la query n'est enabled que si epreuveId ET selectedDate sont
  // renseignés. Avant, la query se lançait immédiatement avec epreuveId='all'
  // → toutes les sessions chargées d'un coup.
  const sessionsQuery = useQuery<{ sessions: SurveillanceSession[]; epreuves: EpreuveOption[] }>({
    queryKey: ['surveillance-sessions', user?.id, epreuveId, selectedDate, severity, typeFilter, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (epreuveId) params.set('epreuveId', epreuveId)
      // UX-IMPROVE : envoyer la date sélectionnée comme plage de 24h.
      // dateDebut = date 00:00, dateFin = date 23:59:59.
      if (selectedDate) {
        params.set('dateDebut', `${selectedDate}T00:00:00Z`)
        params.set('dateFin', `${selectedDate}T23:59:59Z`)
      }
      if (severity !== 'all') params.set('severity', severity)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/surveillance?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    // UX-IMPROVE : enabled seulement si epreuve ET date sont sélectionnés.
    enabled: !!user?.id && !!epreuveId && !!selectedDate,
    staleTime: 5 * 1000, // 5s : la surveillance est temps-réel, on accepte un refetch rapide au retour
    refetchOnWindowFocus: false,
    refetchInterval: isWSConnected ? false : (isLive ? 30000 : false),
    refetchIntervalInBackground: false,
  })

  const sessions = sessionsQuery.data?.sessions ?? []
  const loading = sessionsQuery.isLoading
  const error = sessionsQuery.error
    ? 'Impossible de charger les données de surveillance.'
    : null
  // dataUpdatedAt est mis à jour à chaque fetch réussi (initial + polling).
  const lastRefresh = sessionsQuery.dataUpdatedAt > 0 ? new Date(sessionsQuery.dataUpdatedAt) : null

  // UX-IMPROVE : query séparée pour les options d'épreuves (dropdown). Toujours
  // enabled (pas besoin de filtres). Utilise optionsOnly=true pour ne pas
  // fetcher les sessions.
  const epreuvesQuery = useQuery<{ epreuves: EpreuveOption[] }>({
    queryKey: ['surveillance-epreuves-options', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/surveillance?optionsOnly=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { epreuves: data.epreuves ?? [] }
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 1min : les options d'épreuves changent rarement
    refetchOnWindowFocus: false,
  })
  const epreuves = epreuvesQuery.data?.epreuves ?? []

  const statsQuery = useQuery<SurveillanceStats>({
    queryKey: ['surveillance-stats', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/surveillance/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: isWSConnected ? false : (isLive ? 30000 : false),
    refetchIntervalInBackground: false,
  })

  const stats = statsQuery.data ?? null

  // FIX-5 : query pour les rapports de similarité (onglet Similarité)
  const similarityQuery = useQuery<SimilarityResponse>({
    queryKey: ['surveillance-similarities', user?.id, epreuveId],
    queryFn: async () => {
      const res = await fetch(`/api/surveillance/${epreuveId}/similarities`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled: !!user?.id && !!epreuveId && epreuveId !== 'all',
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const similarityReports = similarityQuery.data?.reports ?? []
  const seuilSimilarite = similarityQuery.data?.seuilSimilarite ?? 0.85

  // Helpers pour invalider le cache après mutation (flag, refresh manuel).
  const refreshSessions = () =>
    queryClient.invalidateQueries({ queryKey: ['surveillance-sessions', user?.id] })
  const refreshStats = () =>
    queryClient.invalidateQueries({ queryKey: ['surveillance-stats', user?.id] })

  // fetchAlertes conservé tel quel (useCallback + useEffect). Non concerné
  // par la migration QUERY-MIGRATION-1 (pas de polling, chargement one-shot).
  const fetchAlertes = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/alertes?limit=50')
      if (!res.ok) return
      const data = await res.json()
      setAlertes(data.alertes || [])
    } catch (err) { console.error('Fetch alertes error:', err) }
  }, [user?.id])

  useEffect(() => { fetchAlertes() }, [fetchAlertes])

  const handleFlag = async (sessionId: string) => {
    setFlagging(sessionId)
    try {
      const res = await fetch(`/api/surveillance/${sessionId}/flag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) toast.info('Cette session a déjà été signalée.')
        else throw new Error(data.error || 'Erreur')
      } else {
        toast.success('Session signalée — alerte fraude créée', { description: data.alerte?.titre })
        // BUGFIX (QUERY-MIGRATION-1) : optimist update via setQueryData sur
        // le cache TanStack Query. Équivalent fonctionnel du setSessions()
        // original — l'UI se met à jour instantanément sans attendre le
        // prochain polling. Si le queryKey actif n'est pas en cache (cas
        // rare), le callback reçoit undefined et on retourne undefined
        // (pas d'update, le prochain refetch corrigera).
        queryClient.setQueryData<{ sessions: SurveillanceSession[]; epreuves: EpreuveOption[] }>(
          ['surveillance-sessions', user?.id, epreuveId, selectedDate, severity, typeFilter, debouncedSearch],
          (old) => old
            ? { ...old, sessions: old.sessions.map((s) => (s.id === sessionId ? { ...s, flagged: true } : s)) }
            : old,
        )
        fetchAlertes()
      }
    } catch (err) { console.error('Flag error:', err); toast.error('Impossible de signaler la session') }
    finally { setFlagging(null) }
  }

  const handleAlerteAction = async (alerteId: string, action: 'marquer_lue' | 'resoudre') => {
    try {
      const res = await fetch(`/api/alertes/${alerteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      setAlertes((prev) => prev.map((a) => (a.id === alerteId ? data.alerte : a)))
      toast.success(action === 'resoudre' ? 'Alerte résolue' : 'Alerte marquée comme lue')
    } catch (err) { console.error('Alerte action error:', err); toast.error('Action impossible') }
  }

  // ─── Load identity photos via /api/sessions/{id}/identity-photos ───
  const handleViewIdentityPhotos = async (sessionId: string) => {
    setIdentityPhotosLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/identity-photos`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setIdentityPhotos(data.photos ?? [])
    } catch (err) {
      console.error('Identity photos fetch error:', err)
      setIdentityPhotos([])
    } finally {
      setIdentityPhotosLoading(false)
    }
  }

  // ─── Verify an identity photo ──────────────────────────────────────
  const handleVerifyIdentityPhoto = async (photoId: string) => {
    setVerifyingPhotoId(photoId)
    try {
      const res = await fetch(`/api/identity-photos/${photoId}/verify`, { method: 'PATCH' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success('Photo d\'identité vérifiée')
      // Update local state
      setIdentityPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, verifiedAt: new Date().toISOString(), verifiedBy: user?.id } : p))
    } catch (err) {
      console.error('Verify identity photo error:', err)
      toast.error('Impossible de vérifier la photo')
    } finally {
      setVerifyingPhotoId(null)
    }
  }

  const handleExportCSV = () => {
    const rows: string[] = [['Étudiant', 'Email', 'Épreuve', 'Statut', 'Alertes', 'Pénalité', 'Score risque', 'Niveau risque', 'Date début', 'Date fin'].join(';')]
    for (const s of sessions) {
      rows.push([(s.etudiant?.name ?? '—'), (s.etudiant?.email ?? ''), (s.epreuve?.titre ?? '—'), s.statut, s.alertes, s.totalPenalite, s.riskScore ?? 0, s.riskLevel ?? 'safe', s.dateDebut ? formatDateTime(s.dateDebut) : '', s.dateFin ? formatDateTime(s.dateFin) : ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    }
    const csv = '\ufeff' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `surveillance_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export CSV téléchargé')
  }

  // ─── Load fraud report via /api/surveillance/{sessionId}/rapport-fraude ───
  const handleViewFraudReport = async (sessionId: string) => {
    setFraudReportLoading(true)
    try {
      const res = await fetch(`/api/surveillance/${sessionId}/rapport-fraude`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: FraudReport = await res.json()
      setFraudReport(data)
    } catch (err) {
      console.error('Fraud report fetch error:', err)
      toast.error('Impossible de charger le rapport de fraude.')
    } finally {
      setFraudReportLoading(false)
    }
  }

  // ─── Load captures from R2 via /api/sessions/{id}/captures ───
  const handleViewCaptures = async (sessionId: string) => {
    setCapturesLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/captures`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const captures: SessionCapture[] = data.captures ?? []
      if (captures.length === 0) {
        toast.info('Aucune capture disponible pour cette session.')
        setCapturesLoading(false)
        return
      }
      setCapturesViewer({ sessionId, captures, index: 0 })
    } catch (err) {
      console.error('Captures fetch error:', err)
      toast.error('Impossible de charger les captures.')
    } finally {
      setCapturesLoading(false)
    }
  }

  const derivedKpis = useMemo(() => {
    const activeSessions = sessions.filter((s) => s.statut === 'EN_COURS').length
    const totalAlerts = sessions.reduce((sum, s) => sum + s.alertes, 0)
    const totalPenalite = sessions.reduce((sum, s) => sum + s.totalPenalite, 0)
    const flagged = sessions.filter((s) => s.flagged).length
    return { activeSessions, totalAlerts, totalPenalite, flagged }
  }, [sessions])

  const kpis = stats?.kpis ?? {
    totalSessions: sessions.length, activeSessions: derivedKpis.activeSessions,
    sessionsWithAlerts: sessions.filter((s) => s.alertes > 0).length, totalAlerts: derivedKpis.totalAlerts,
    totalPenalite: derivedKpis.totalPenalite, flaggedSessions: derivedKpis.flagged, screenshots: 0,
  }
  const alertesNonLues = alertes.filter((a) => !a.lue).length

  return (
    <div className="space-y-6">
      {/* ─── Hero canonique ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
              <ShieldAlert className="h-6 w-6 text-primary-text" />
            </div>
            {isLive && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-success border-2 border-background" />
              </span>
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Surveillance &amp; Alertes</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Centre de contrôle anti-fraude en temps réel</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${isLive ? (isWSConnected ? 'bg-success/15 text-success-text' : 'bg-warning/15 text-warning') : 'bg-muted text-muted-foreground'}`}>
                <Radio className="h-3 w-3" />
                {isLive ? (isWSConnected ? 'Live WS' : 'Live (polling)') : 'Pause'}
                {isLive && isWSConnected && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                {isLive && !isWSConnected && connectionStatus === 'connecting' && <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
              </span>
              {lastRefresh && <span className="text-muted-foreground">MAJ : {formatTime(lastRefresh.toISOString())}</span>}
              {alertesNonLues > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-destructive">
                  <Bell className="h-3 w-3" />
                  {alertesNonLues} alerte{alertesNonLues > 1 ? 's' : ''} non lue{alertesNonLues > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsLive((v) => !v)} className="gap-1.5">
            {isLive ? <><span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live</> : <><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Pause</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refreshSessions(); refreshStats(); fetchAlertes() }} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={sessions.length === 0} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* ─── KPI Grid ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Monitor} label="Sessions actives" value={kpis.activeSessions} hint={`${kpis.totalSessions} au total`} accent="success" loading={loading} index={0} />
        <StatCard icon={AlertTriangle} label="Alertes fraude" value={kpis.totalAlerts} hint={`${kpis.sessionsWithAlerts} sessions concernées`} accent="warning" loading={loading} index={1} />
        <StatCard icon={Zap} label="Pénalités totales" value={kpis.totalPenalite} hint="points déduits" accent="secondary" loading={loading} index={2} />
        <StatCard icon={Flag} label="Sessions signalées" value={kpis.flaggedSessions} hint={`${kpis.screenshots} captures`} accent="danger" loading={loading} index={3} />
      </div>

      {/* ─── Onglets ─── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'sessions' | 'analysis' | 'alertes' | 'similarite')}>
        <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
          <TabsTrigger value="sessions" className="gap-1.5">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Sessions surveillées</span>
            <span className="sm:hidden">Sessions</span>
            {sessions.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-primary/15 px-1 text-[10px] font-bold text-primary-text font-mono tabular-nums">{sessions.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analyse fraude</span>
            <span className="sm:hidden">Analyse</span>
          </TabsTrigger>
          <TabsTrigger value="similarite" className="gap-1.5">
            <GitCompare className="h-4 w-4" />
            <span className="hidden sm:inline">Similarité copies</span>
            <span className="sm:hidden">Similarité</span>
            {similarityReports.filter(r => r.flagged).length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-destructive/15 px-1 text-[10px] font-bold text-destructive font-mono tabular-nums">{similarityReports.filter(r => r.flagged).length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="alertes" className="gap-1.5">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alertes système</span>
            <span className="sm:hidden">Alertes</span>
            {alertesNonLues > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-destructive/15 px-1 text-[10px] font-bold text-destructive font-mono tabular-nums">{alertesNonLues}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-5">
          <SessionsTab sessions={sessions} epreuves={epreuves} loading={loading} error={error}
            filters={{ epreuveId, setEpreuveId, selectedDate, setSelectedDate, severity, setSeverity, typeFilter, setTypeFilter, searchInput, setSearchInput }}
            expandedSession={expandedSession} setExpandedSession={setExpandedSession}
            onOpenDetail={setDetailSession} onFlag={handleFlag} flagging={flagging}
            onOpenScreenshot={(events, index) => setScreenshotViewer({ events, index })} />
        </TabsContent>
        <TabsContent value="analysis" className="mt-5"><AnalysisTab stats={stats} loading={loading} /></TabsContent>
        <TabsContent value="similarite" className="mt-5">
          <SimilarityTab
            reports={similarityReports}
            seuilSimilarite={seuilSimilarite}
            loading={similarityQuery.isLoading}
            epreuveId={epreuveId}
            onOpenDetail={setSimilarityDetail}
          />
        </TabsContent>
        <TabsContent value="alertes" className="mt-5"><AlertesTab alertes={alertes} loading={loading} onAction={handleAlerteAction} /></TabsContent>
      </Tabs>

      {/* ─── Panneau de détail (Sheet) ─── */}
      <DetailSheet session={detailSession} onClose={() => { setDetailSession(null); setIdentityPhotos([]) }} onFlag={handleFlag} flagging={flagging}
        onOpenScreenshot={(events, index) => setScreenshotViewer({ events, index })}
        onViewCaptures={handleViewCaptures} capturesLoading={capturesLoading}
        onViewFraudReport={handleViewFraudReport} fraudReportLoading={fraudReportLoading}
        onViewIdentityPhotos={handleViewIdentityPhotos} identityPhotos={identityPhotos} identityPhotosLoading={identityPhotosLoading}
        onVerifyIdentityPhoto={handleVerifyIdentityPhoto} verifyingPhotoId={verifyingPhotoId} />

      {/* ─── Visionneuse de captures (ancien logEvents) ─── */}
      {screenshotViewer && (
        <ScreenshotViewer events={screenshotViewer.events} index={screenshotViewer.index}
          onClose={() => setScreenshotViewer(null)}
          onIndexChange={(index) => setScreenshotViewer({ events: screenshotViewer.events, index })} />
      )}

      {/* ─── Visionneuse de captures R2 ─── */}
      {capturesViewer && (
        <CapturesViewer
          captures={capturesViewer.captures}
          index={capturesViewer.index}
          onClose={() => setCapturesViewer(null)}
          onIndexChange={(i) => setCapturesViewer({ ...capturesViewer, index: i })}
        />
      )}

      {/* ─── Rapport de fraude (Dialog) ─── */}
      {fraudReport && (
        <FraudReportDialog report={fraudReport} onClose={() => setFraudReport(null)} />
      )}

      {/* ─── Similarité détail (Dialog) FIX-5 ─── */}
      {similarityDetail && (
        <SimilarityDetailDialog report={similarityDetail} seuilSimilarite={seuilSimilarite} onClose={() => setSimilarityDetail(null)} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════

// ─── Sessions Tab ───
function SessionsTab({ sessions, epreuves, loading, error, filters, expandedSession, setExpandedSession, onOpenDetail, onFlag, flagging, onOpenScreenshot }: {
  sessions: SurveillanceSession[]; epreuves: EpreuveOption[]; loading: boolean; error: string | null
  filters: { epreuveId: string; setEpreuveId: (v: string) => void; selectedDate: string; setSelectedDate: (v: string) => void; severity: string; setSeverity: (v: string) => void; typeFilter: string; setTypeFilter: (v: string) => void; searchInput: string; setSearchInput: (v: string) => void }
  expandedSession: string | null; setExpandedSession: (v: string | null) => void
  onOpenDetail: (s: SurveillanceSession) => void; onFlag: (id: string) => void; flagging: string | null
  onOpenScreenshot: (events: LogEvent[], index: number) => void
}) {
  // UX-IMPROVE : vérifier si les filtres obligatoires (épreuve + date) sont sélectionnés.
  const filtersReady = filters.epreuveId !== '' && filters.selectedDate !== ''

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <Card><CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Épreuve <span className="text-destructive">*</span></label>
            <Select value={filters.epreuveId} onValueChange={filters.setEpreuveId}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez une épreuve" /></SelectTrigger>
              <SelectContent>{epreuves.map((ep) => (<SelectItem key={ep.id} value={ep.id}>{ep.titre} ({ep.totalAlerts} alertes)</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date <span className="text-destructive">*</span></label>
            <Input
              type="date"
              value={filters.selectedDate}
              onChange={(e) => filters.setSelectedDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sévérité</label>
            <Select value={filters.severity} onValueChange={filters.setSeverity}>
              <SelectTrigger><SelectValue placeholder="Toutes sévérités" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes sévérités</SelectItem><SelectItem value="high">Critique</SelectItem><SelectItem value="medium">Important</SelectItem><SelectItem value="low">Mineur</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type d&apos;événement</label>
            <Select value={filters.typeFilter} onValueChange={filters.setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Tous les types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les types</SelectItem>{Object.entries(EVENT_LABELS).map(([type, label]) => (<SelectItem key={type} value={type}>{label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Rechercher un étudiant</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input value={filters.searchInput} onChange={(e) => filters.setSearchInput(e.target.value)} placeholder="Nom ou email..." className="pl-8" />
            </div>
          </div>
        </div>
      </CardContent></Card>

      {/* UX-IMPROVE : prompt de sélection si filtres obligatoires manquants */}
      {!filtersReady ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-info/10"><ScanEye className="h-10 w-10 text-info" /></div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Sélectionnez une épreuve et une date</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Pour consulter les données de surveillance, choisissez d&apos;abord une épreuve et une date dans les filtres ci-dessus.
            Cela permet de cibler les sessions pertinentes et d&apos;éviter le chargement de toutes les sessions d&apos;un coup.
          </p>
        </CardContent></Card>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>
      ) : loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <PulseSkeleton key={i} variant="card" className="h-32" />)}</div>
      ) : sessions.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"><Shield className="h-10 w-10 text-primary-text" /></div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucune session à surveiller</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Aucune session trouvée pour cette épreuve à la date sélectionnée.</p>
        </CardContent></Card>
      ) : (
        /* UX-IMPROVE : max-height + scroll au lieu de scroll infini sur la page.
           La liste fait au max calc(100vh - 400px) — le header + filtres + tabs
           prennent ~400px. Le scroll est interne à la liste, pas sur la page. */
        <div className="max-h-[calc(100vh-400px)] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {sessions.map((session, idx) => (
            <SessionCard key={session.id} session={session} expanded={expandedSession === session.id} onToggle={() => setExpandedSession(expandedSession === session.id ? null : session.id)} onOpenDetail={() => onOpenDetail(session)} onFlag={() => onFlag(session.id)} flagging={flagging === session.id} onOpenScreenshot={onOpenScreenshot} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Session Card ───
function SessionCard({ session, expanded, onToggle, onOpenDetail, onFlag, flagging, onOpenScreenshot, index }: {
  session: SurveillanceSession; expanded: boolean; onToggle: () => void; onOpenDetail: () => void; onFlag: () => void; flagging: boolean
  onOpenScreenshot: (events: LogEvent[], index: number) => void; index: number
}) {
  const risk = riskLevelClasses(session.riskLevel ?? 'safe')
  const score = session.riskScore ?? 0
  const isLive = session.statut === 'EN_COURS'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.25 }}>
      <div className={`overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all ds-lift ${risk.border} border-l-4`}>
        <div className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onToggle} className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded}>
                  {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                <h3 className="truncate font-display font-semibold tracking-tight">{(session.etudiant?.name ?? '—')}</h3>
                <Badge variant="outline" className={`text-xs ${getStatutClasses(session.statut)}`}>
                  {isLive && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
                  {getStatutLabel(session.statut)}
                </Badge>
                {session.flagged && (<Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30"><Flag className="mr-1 h-3 w-3" />Signalée</Badge>)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{(session.etudiant?.email ?? '')}</span>
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{(session.epreuve?.titre ?? '—')}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{session.dateDebut ? formatDateTime(session.dateDebut) : '—'}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="text-center"><p className="text-xs text-muted-foreground">Alertes</p><p className="text-lg font-bold font-mono tabular-nums text-warning">{session.alertes}</p></div>
                <div className="text-center"><p className="text-xs text-muted-foreground">Pénalité</p><p className="text-lg font-bold font-mono tabular-nums text-secondary">{session.totalPenalite}</p></div>
              </div>
              <div className="w-28">
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted-foreground">Risque</span><span className={`font-bold font-mono tabular-nums ${risk.text}`}>{score}</span></div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted"><div className={`absolute inset-y-0 left-0 rounded-full ${risk.bg}`} style={{ width: `${score}%` }} /></div>
                <p className={`mt-0.5 text-center text-xs font-medium ${risk.text}`}>{risk.label}</p>
              </div>
            </div>
          </div>
          {expanded && (
            <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {session.fraudEvents.length > 0 && (<Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30"><Flame className="mr-1 h-3 w-3" />{session.fraudEvents.length} fraude{session.fraudEvents.length > 1 ? 's' : ''}</Badge>)}
                {session.screenshotEvents.length > 0 && (<button onClick={() => onOpenScreenshot(session.screenshotEvents, 0)} className="inline-flex" aria-label="Voir les captures"><Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30 hover:bg-info/20"><Camera className="mr-1 h-3 w-3" />{session.screenshotEvents.length} capture{session.screenshotEvents.length > 1 ? 's' : ''}</Badge></button>)}
                {session.submissionEvents.length > 0 && (<Badge variant="outline" className="text-xs bg-success/10 text-success-text border-success/30"><Activity className="mr-1 h-3 w-3" />{session.submissionEvents.length} soumission{session.submissionEvents.length > 1 ? 's' : ''}</Badge>)}
              </div>
              {session.logEvents.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Derniers événements</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin pr-2">
                    {session.logEvents.slice(-8).reverse().map((evt, i) => {
                      const sev = getSeverityLevel(evt.type)
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${severityClasses(sev)}`}>{getEventTypeIcon(evt.type)}</span>
                          <span className="font-medium">{getEventTypeLabel(evt.type)}</span>
                          {evt.penalite ? <span className="text-secondary">-{evt.penalite} pts</span> : null}
                          <span className="ml-auto text-muted-foreground">{formatTime(evt.timestamp)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">Aucun événement enregistré.</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={onOpenDetail} className="gap-1.5"><ScanEye className="h-3.5 w-3.5" /> Détails complets</Button>
                {!session.flagged && (<Button size="sm" variant="outline" onClick={onFlag} disabled={flagging} className="gap-1.5 text-destructive hover:bg-destructive/5 border-destructive/30"><Flag className="h-3.5 w-3.5" /> Signaler</Button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Analysis Tab ───
function AnalysisTab({ stats, loading }: { stats: SurveillanceStats | null; loading: boolean }) {
  if (loading && !stats) return (<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map((i) => <PulseSkeleton key={i} variant="card" className="h-64" />)}</div>)
  if (!stats || stats.kpis.totalSessions === 0) return (<Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/50" /><p className="text-muted-foreground">Pas encore assez de données pour l&apos;analyse.</p></CardContent></Card>)
  const maxFraud = Math.max(...stats.fraudByType.map((f) => f.count), 1)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card><CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2"><Flame className="h-5 w-5 text-destructive" /><h3 className="font-display font-semibold tracking-tight">Répartition des fraudes</h3></div>
        {stats.fraudByType.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Aucune fraude détectée. 🎉</p> : (
          <div className="space-y-2.5">{stats.fraudByType.map((f, i) => (
            <div key={f.type}>
              <div className="mb-1 flex items-center justify-between text-xs"><span>{f.label}</span><span className="font-bold font-mono tabular-nums text-destructive">{f.count}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-warning to-destructive" style={{ width: `${(f.count / maxFraud) * 100}%` }} /></div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Card><CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-text" /><h3 className="font-display font-semibold tracking-tight">Activité (7 jours)</h3></div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={stats.timeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs><linearGradient id="alertsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7ED321" stopOpacity={0.4} /><stop offset="95%" stopColor="#7ED321" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fill: 'rgba(100,116,139,0.6)', fontSize: 11 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}` }} />
            <YAxis tick={{ fill: 'rgba(100,116,139,0.6)', fontSize: 11 }} allowDecimals={false} />
            <RechartsTooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', color: '#1e293b' }} labelFormatter={(v) => new Date(v).toLocaleDateString('fr-FR')} />
            <Area type="monotone" dataKey="alerts" name="Alertes" stroke="#7ED321" strokeWidth={2} fill="url(#alertsGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary-text" /><h3 className="font-display font-semibold tracking-tight">Top étudiants par alertes</h3></div>
        {stats.topStudents.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucune alerte enregistrée.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{stats.topStudents.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold font-mono tabular-nums ${i === 0 ? 'bg-gold/20 text-gold' : i === 1 ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/70'}`}>{i + 1}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{s.name}</p><p className="truncate text-xs text-muted-foreground">{s.email}</p></div>
              <div className="text-right"><p className="text-sm font-bold font-mono tabular-nums text-destructive">{s.alertes}</p><p className="text-xs text-secondary">-{s.penalite} pts</p></div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
    </div>
  )
}

// ─── Alertes Tab ───
function AlertesTab({ alertes, loading, onAction }: { alertes: AlerteItem[]; loading: boolean; onAction: (id: string, action: 'marquer_lue' | 'resoudre') => void }) {
  if (loading && alertes.length === 0) return (<div className="space-y-2">{[1, 2, 3].map((i) => <PulseSkeleton key={i} variant="card" className="h-20" />)}</div>)
  if (alertes.length === 0) return (<Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><CheckCircle2 className="mb-3 h-12 w-12 text-success-text/60" /><p className="text-muted-foreground">Aucune alerte système.</p></CardContent></Card>)
  const sevConfig = {
    CRITICAL: { icon: <AlertTriangle className="h-4 w-4" />, label: 'Critique', classes: 'border-destructive/30 bg-destructive/10 text-destructive' },
    WARNING: { icon: <AlertTriangle className="h-4 w-4" />, label: 'Attention', classes: 'border-warning/30 bg-warning/10 text-warning' },
    INFO: { icon: <Bell className="h-4 w-4" />, label: 'Info', classes: 'border-info/30 bg-info/10 text-info' },
  }
  return (
    <div className="space-y-2">{alertes.map((a, idx) => {
      const cfg = sevConfig[a.severity] ?? sevConfig.INFO
      return (
        <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }}
          className={`rounded-xl border border-border/60 bg-card p-4 shadow-sm ${!a.lue ? 'border-l-4 border-l-primary' : ''}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${cfg.classes}`}>{cfg.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className={`text-sm ${!a.lue ? 'font-bold' : 'font-medium text-muted-foreground'}`}>{a.titre}</h4>
                {!a.lue && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                {a.resolu && <Badge variant="outline" className="text-xs bg-success/10 text-success-text border-success/30"><CheckCircle2 className="mr-1 h-3 w-3" />Résolue</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/60">
                <span>{formatRelativeDate(a.createdAt)}</span>
                {a.epreuve && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{a.epreuve.titre}</span>}
                {a.filiere && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{a.filiere.nom}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {!a.lue && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAction(a.id, 'marquer_lue')}>Marquer lue</Button>}
              {!a.resolu && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-success-text hover:bg-success/10" onClick={() => onAction(a.id, 'resoudre')}>Résoudre</Button>}
            </div>
          </div>
        </motion.div>
      )
    })}</div>
  )
}

// ─── Detail Sheet ───
function DetailSheet({ session, onClose, onFlag, flagging, onOpenScreenshot, onViewCaptures, capturesLoading, onViewFraudReport, fraudReportLoading, onViewIdentityPhotos, identityPhotos, identityPhotosLoading, onVerifyIdentityPhoto, verifyingPhotoId }: {
  session: SurveillanceSession | null; onClose: () => void; onFlag: (id: string) => void; flagging: string | null
  onOpenScreenshot: (events: LogEvent[], index: number) => void
  onViewCaptures: (sessionId: string) => void; capturesLoading: boolean
  onViewFraudReport: (sessionId: string) => void; fraudReportLoading: boolean
  onViewIdentityPhotos: (sessionId: string) => void; identityPhotos: IdentityPhotoItem[]; identityPhotosLoading: boolean
  onVerifyIdentityPhoto: (photoId: string) => void; verifyingPhotoId: string | null
}) {
  return (
    <Sheet open={!!session} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto scrollbar-thin sm:max-w-2xl">
        {session && (<>
          <SheetHeader>
            <SheetTitle>Détails de surveillance</SheetTitle>
            <SheetDescription>{(session.etudiant?.name ?? '—')} — {(session.epreuve?.titre ?? '—')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Alertes</p><p className="text-2xl font-bold font-mono tabular-nums text-warning">{session.alertes}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Pénalité</p><p className="text-2xl font-bold font-mono tabular-nums text-secondary">{session.totalPenalite}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Risque</p><p className={`text-2xl font-bold font-mono tabular-nums ${riskLevelClasses(session.riskLevel ?? 'safe').text}`}>{session.riskScore ?? 0}</p></CardContent></Card>
            </div>
            <Card><CardContent className="space-y-2 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Statut</span><Badge variant="outline" className={getStatutClasses(session.statut)}>{getStatutLabel(session.statut)}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{(session.etudiant?.email ?? '')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Début</span><span>{formatDateTime(session.dateDebut)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fin</span><span>{formatDateTime(session.dateFin)}</span></div>
              {session.score !== null && <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-bold text-success-text">{session.score}/20</span></div>}
            </CardContent></Card>
            {/* ─── Captures R2 (nouveau) ─── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-medium"><Camera className="h-4 w-4 text-info" />Captures d&apos;écran (R2)</h4>
                <Button size="sm" variant="outline" onClick={() => onViewCaptures(session.id)} disabled={capturesLoading} className="gap-1.5 text-xs">
                  {capturesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  Voir les captures
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Les captures sont stockées dans R2 et accessibles via des URL présignées.</p>
            </div>
            {/* ─── Identité (verificationIdentite) ─── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-medium"><UserCheck className="h-4 w-4 text-success-text" />Photos d&apos;identité</h4>
                <Button size="sm" variant="outline" onClick={() => onViewIdentityPhotos(session.id)} disabled={identityPhotosLoading} className="gap-1.5 text-xs">
                  {identityPhotosLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                  Voir les photos
                </Button>
              </div>
              {identityPhotos.length > 0 ? (
                <div className="space-y-3">
                  {/* Pre-exam photo (main) */}
                  {identityPhotos.filter((p) => p.photoType === 'pre-exam').map((photo) => (
                    <div key={photo.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                      {photo.url ? (
                        <img src={photo.url} alt="Photo d'identité pré-examen" className="h-20 w-20 rounded-lg border object-cover" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted"><ImageOff className="h-6 w-6 text-muted-foreground/40" /></div>
                      )}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30">Pré-examen</Badge>
                          {photo.verifiedAt ? (
                            <Badge variant="outline" className="text-xs bg-success/10 text-success-text border-success/30"><CheckCircle2 className="mr-1 h-3 w-3" />Vérifiée</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">En attente</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(photo.createdAt)}</p>
                        {!photo.verifiedAt && (
                          <Button size="sm" variant="outline" onClick={() => onVerifyIdentityPhoto(photo.id)} disabled={verifyingPhotoId === photo.id} className="mt-1 gap-1 text-xs text-success-text hover:bg-success/5 border-success/30">
                            {verifyingPhotoId === photo.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                            Vérifier l&apos;identité
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Mid-exam photos (thumbnail strip) */}
                  {identityPhotos.filter((p) => p.photoType === 'mid-exam').length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Photos pendant l&apos;examen ({identityPhotos.filter((p) => p.photoType === 'mid-exam').length})</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {identityPhotos.filter((p) => p.photoType === 'mid-exam').map((photo) => (
                          <div key={photo.id} className="relative shrink-0">
                            {photo.url ? (
                              <img src={photo.url} alt={`Photo ${photo.photoType}`} className="h-14 w-14 rounded-md border object-cover" />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted"><ImageOff className="h-4 w-4 text-muted-foreground/40" /></div>
                            )}
                            {photo.verifiedAt && <CheckCircle2 className="absolute -right-1 -top-1 h-3.5 w-3.5 text-success-text" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune photo d&apos;identité disponible pour cette session.</p>
              )}
            </div>
            {session.screenshotEvents.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium"><Camera className="h-4 w-4 text-info" />Captures (logEvents) ({session.screenshotEvents.length})</h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {session.screenshotEvents.slice(0, 12).map((evt, i) => (
                    <button key={i} onClick={() => onOpenScreenshot(session.screenshotEvents, i)} className="group relative aspect-video overflow-hidden rounded-lg border border-border/60 bg-muted" aria-label={`Capture ${i + 1}`}>
                      {evt.thumbnail ? <img src={evt.thumbnail} alt={`Capture ${i + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-6 w-6 text-muted-foreground/40" /></div>}
                      <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 text-xs">{formatTime(evt.timestamp)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-primary-text" />Journal complet ({session.logEvents.length})</h4>
              <ScrollArea className="h-72 rounded-lg border border-border/40 bg-muted/20 p-2">
                <div className="space-y-1.5">
                  {[...session.logEvents].reverse().map((evt, i) => {
                    const sev = getSeverityLevel(evt.type)
                    return (
                      <div key={i} className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-2 text-xs">
                        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${severityClasses(sev)}`}>{getEventTypeIcon(evt.type)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between"><span className="font-medium">{getEventTypeLabel(evt.type)}</span><span className="text-muted-foreground">{formatTime(evt.timestamp)}</span></div>
                          {evt.details && <p className="mt-0.5 text-muted-foreground">{evt.details}</p>}
                          {evt.penalite ? <span className="mt-0.5 inline-block text-secondary">Pénalité : -{evt.penalite} pts</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
            <div className="flex gap-2 pb-6">
              {session.alertes > 0 && (
                <Button onClick={() => onViewFraudReport(session.id)} disabled={fraudReportLoading} variant="outline" className="flex-1 gap-2 text-warning hover:bg-warning/5 border-warning/30">
                  {fraudReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
                  Rapport de fraude
                </Button>
              )}
              {!session.flagged && (<Button onClick={() => onFlag(session.id)} disabled={flagging === session.id} variant="outline" className="flex-1 gap-2 text-destructive hover:bg-destructive/5 border-destructive/30">{flagging === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}Signaler cette session</Button>)}
            </div>
          </div>
        </>)}
      </SheetContent>
    </Sheet>
  )
}

// ─── Screenshot Viewer ───
function ScreenshotViewer({ events, index, onClose, onIndexChange }: {
  events: LogEvent[]; index: number; onClose: () => void; onIndexChange: (index: number) => void
}) {
  const current = events[index]
  if (!current) return null
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle className="flex items-center justify-between gap-2"><span>Capture {index + 1} / {events.length}</span><span className="text-xs font-normal text-muted-foreground">{current.timestamp && formatDateTime(current.timestamp)}</span></DialogTitle></DialogHeader>
        <div className="relative flex items-center justify-center">
          {current.thumbnail ? <img src={current.thumbnail} alt={`Capture ${index + 1}`} className="max-h-[60vh] w-auto rounded-lg border border-border/60" /> : <div className="flex h-64 w-full items-center justify-center rounded-lg border border-border/60 bg-muted"><ImageOff className="h-12 w-12 text-muted-foreground/40" /></div>}
          {events.length > 1 && (<>
            <Button size="icon" variant="outline" onClick={() => onIndexChange((index - 1 + events.length) % events.length)} className="absolute left-2" aria-label="Capture précédente"><ChevronRight className="h-4 w-4 rotate-180" /></Button>
            <Button size="icon" variant="outline" onClick={() => onIndexChange((index + 1) % events.length)} className="absolute right-2" aria-label="Capture suivante"><ChevronRight className="h-4 w-4" /></Button>
          </>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Captures Viewer (R2) ───
function CapturesViewer({ captures, index, onClose, onIndexChange }: {
  captures: SessionCapture[]; index: number; onClose: () => void; onIndexChange: (index: number) => void
}) {
  const current = captures[index]
  if (!current) return null

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Capture #{current.captureIndex} — {index + 1} / {captures.length}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {formatDateTime(current.createdAt)}
              {current.fileSize ? ` • ${formatFileSize(current.fileSize)}` : ''}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center">
          {current.url ? (
            <img
              src={current.url}
              alt={`Capture #${current.captureIndex}`}
              className="max-h-[60vh] w-auto rounded-lg border border-border/60"
            />
          ) : (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border border-border/60 bg-muted">
              <ImageOff className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">Image non disponible (R2 non configuré)</p>
            </div>
          )}
          {captures.length > 1 && (<>
            <Button size="icon" variant="outline" onClick={() => onIndexChange((index - 1 + captures.length) % captures.length)} className="absolute left-2" aria-label="Capture précédente"><ChevronRight className="h-4 w-4 rotate-180" /></Button>
            <Button size="icon" variant="outline" onClick={() => onIndexChange((index + 1) % captures.length)} className="absolute right-2" aria-label="Capture suivante"><ChevronRight className="h-4 w-4" /></Button>
          </>)}
        </div>
        {/* Thumbnails strip */}
        {captures.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {captures.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onIndexChange(i)}
                className={`shrink-0 rounded-md border-2 transition-all ${
                  i === index ? 'border-primary ring-1 ring-primary/30' : 'border-border/60 opacity-60 hover:opacity-100'
                }`}
                aria-label={`Capture #${c.captureIndex}`}
              >
                {c.url ? (
                  <img src={c.url} alt={`Miniature #${c.captureIndex}`} className="h-12 w-20 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-20 items-center justify-center rounded bg-muted">
                    <Camera className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Fraud Report Dialog ───
function FraudReportDialog({ report, onClose }: {
  report: FraudReport; onClose: () => void
}) {
  const { session, etudiant, epreuve, events, summary, captures } = report

  // Risk gauge color
  const riskGaugeColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-destructive'
      case 'high': return 'text-warning'
      case 'moderate': return 'text-info'
      default: return 'text-success-text'
    }
  }
  const riskGaugeBg = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-destructive'
      case 'high': return 'bg-warning'
      case 'moderate': return 'bg-info'
      default: return 'bg-success'
    }
  }
  const riskLabel = (level: string) => {
    switch (level) {
      case 'critical': return 'Critique'
      case 'high': return 'Élevé'
      case 'moderate': return 'Modéré'
      default: return 'Sûr'
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-warning" />
            Rapport de fraude
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ─── Student + Exam info ─── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><User className="h-4 w-4" />Étudiant</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <p className="font-medium">{etudiant.name}</p>
                <p className="text-muted-foreground">{etudiant.email}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Épreuve</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <p className="font-medium">{epreuve.titre}</p>
                <p className="text-muted-foreground">Durée : {epreuve.duree} min</p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Risk Score Gauge ─── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-6">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" className={riskGaugeBg(summary.riskLevel)} strokeWidth="8"
                      strokeDasharray={`${summary.riskScore * 2.64} 264`} strokeLinecap="round" />
                  </svg>
                  <span className={`absolute text-2xl font-bold font-mono tabular-nums ${riskGaugeColor(summary.riskLevel)}`}>{summary.riskScore}</span>
                </div>
                <div className="space-y-1">
                  <p className={`text-lg font-bold ${riskGaugeColor(summary.riskLevel)}`}>Risque {riskLabel(summary.riskLevel)}</p>
                  <p className="text-sm text-muted-foreground">Score de risque calculé sur 100</p>
                  {!report.rapportFraudeEnabled && (
                    <p className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Rapport de fraude non activé dans les paramètres de sécurité</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Summary Stats ─── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Alertes</p><p className="text-2xl font-bold font-mono tabular-nums text-warning">{summary.totalAlertes}</p></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Pénalité</p><p className="text-2xl font-bold font-mono tabular-nums text-secondary">-{summary.totalPenalite}</p></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Haute sévérité</p><p className="text-2xl font-bold font-mono tabular-nums text-destructive">{summary.highSeverity}</p></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Moyenne sévérité</p><p className="text-2xl font-bold font-mono tabular-nums text-warning">{summary.mediumSeverity}</p></CardContent></Card>
          </div>

          {/* ─── Event Type Breakdown ─── */}
          {Object.keys(summary.eventTypeBreakdown).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" />Répartition par type</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {Object.entries(summary.eventTypeBreakdown).sort(([, a], [, b]) => b - a).map(([type, count]) => {
                    const maxCount = Math.max(...Object.values(summary.eventTypeBreakdown))
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 text-xs font-medium truncate">{getEventTypeLabel(type)}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${riskGaugeBg(getSeverityLevel(type) === 'high' ? 'high' : getSeverityLevel(type) === 'medium' ? 'moderate' : 'safe')}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold font-mono tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Timeline of Events ─── */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />Chronologie des événements ({events.length})</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucun événement de fraude enregistré.</p>
              ) : (
                <ScrollArea className="max-h-64">
                  <div className="space-y-1.5">
                    {[...events].reverse().map((evt, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-2 text-xs">
                        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${severityClasses(evt.severity as SeverityLevel)}`}>{getEventTypeIcon(evt.type)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{getEventTypeLabel(evt.type)}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[10px] px-1.5 ${severityClasses(evt.severity as SeverityLevel)}`}>{evt.severity === 'high' ? 'Critique' : evt.severity === 'medium' ? 'Important' : evt.severity === 'low' ? 'Mineur' : 'Info'}</Badge>
                              <span className="text-muted-foreground">{evt.timestamp ? formatTime(evt.timestamp) : '—'}</span>
                            </div>
                          </div>
                          {evt.details && <p className="mt-0.5 text-muted-foreground">{evt.details}</p>}
                          {evt.penalite > 0 && <span className="mt-0.5 inline-block text-secondary">Pénalité : -{evt.penalite} pts</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* ─── Captures List ─── */}
          {captures.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Camera className="h-4 w-4" />Captures d&apos;écran ({captures.length})</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {captures.map((cap) => (
                    <div key={cap.id} className="flex flex-col items-center rounded-lg border border-border/60 bg-muted/30 p-2 text-center">
                      <Camera className="h-6 w-6 text-muted-foreground/40" />
                      <p className="mt-1 text-xs text-muted-foreground">#{cap.captureIndex}</p>
                      <p className="text-[10px] text-muted-foreground">{cap.createdAt ? formatDateTime(cap.createdAt) : '—'}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Note with penalty ─── */}
          {session.noteTotal !== undefined && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Note finale (avec pénalité)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{session.noteTotal.toFixed(1)}</span>
                      <span className="text-lg text-muted-foreground">/{session.noteMax}</span>
                    </div>
                  </div>
                  {summary.totalPenalite > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pénalité appliquée</p>
                      <p className="text-lg font-bold text-secondary">-{summary.totalPenalite} pts</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Generated at ─── */}
          <p className="text-center text-xs text-muted-foreground">
            Rapport généré le {formatDateTime(report.generatedAt)}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Similarity Tab (FIX-5) ───
function SimilarityTab({ reports, seuilSimilarite, loading, epreuveId, onOpenDetail }: {
  reports: SimilarityReport[]; seuilSimilarite: number; loading: boolean; epreuveId: string
  onOpenDetail: (r: SimilarityReport) => void
}) {
  if (!epreuveId || epreuveId === 'all') {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <GitCompare className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">Sélectionnez une épreuve pour voir les similarités entre copies.</p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <PulseSkeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    )
  }

  const flaggedCount = reports.filter(r => r.flagged).length

  return (
    <div className="space-y-4">
      {/* ─── KPIs similarité ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Paires analysées</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{reports.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Paires suspectes</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-destructive">{flaggedCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Seuil de similarité</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-warning">{(seuilSimilarite * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success-text/60" />
            <p className="mt-3 text-sm text-muted-foreground">Aucune similarité détectée pour cette épreuve.</p>
            <p className="mt-1 text-xs text-muted-foreground">Le worker analyse les copies après la clôture de l&apos;épreuve.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const simPct = (report.globalSimilarity * 100).toFixed(1)
            const isAboveThreshold = report.flagged
            return (
              <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${isAboveThreshold ? 'border-destructive/50 bg-destructive/5' : 'border-border hover:border-primary/30'}`}
                  onClick={() => onOpenDetail(report)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Similarity score circle */}
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="8" />
                          <circle cx="50" cy="50" r="42" fill="none"
                            className={isAboveThreshold ? 'text-destructive' : report.globalSimilarity >= 0.5 ? 'text-warning' : 'text-success'}
                            strokeWidth="8"
                            strokeDasharray={`${report.globalSimilarity * 264} 264`}
                            strokeLinecap="round"
                            style={{ stroke: 'currentColor' }}
                          />
                        </svg>
                        <span className={`absolute text-sm font-bold font-mono tabular-nums ${isAboveThreshold ? 'text-destructive' : report.globalSimilarity >= 0.5 ? 'text-warning' : 'text-success-text'}`}>
                          {simPct}%
                        </span>
                      </div>

                      {/* Student pair info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">
                            {report.etudiantANom || report.etudiantAId.slice(0, 8)} ↔ {report.etudiantBNom || report.etudiantBId.slice(0, 8)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {isAboveThreshold && (
                            <Badge variant="destructive" className="text-[10px] px-1.5">Suspect</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {report.questionSimilarities?.length || 0} questions comparées
                          </span>
                        </div>
                      </div>

                      {/* Similarity bar */}
                      <div className="hidden sm:block w-24">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isAboveThreshold ? 'bg-destructive' : report.globalSimilarity >= 0.5 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${report.globalSimilarity * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Similarity Detail Dialog (FIX-5) ───
function SimilarityDetailDialog({ report, seuilSimilarite, onClose }: {
  report: SimilarityReport; seuilSimilarite: number; onClose: () => void
}) {
  const isAboveThreshold = report.flagged

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-warning" />
            Similarité entre copies
            {isAboveThreshold && <Badge variant="destructive" className="ml-2">Au-dessus du seuil</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ─── Student pair ─── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><User className="h-4 w-4" />Étudiant A</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <p className="font-medium">{report.etudiantANom || '—'}</p>
                {report.etudiantAEmail && <p className="text-muted-foreground">{report.etudiantAEmail}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><User className="h-4 w-4" />Étudiant B</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <p className="font-medium">{report.etudiantBNom || '—'}</p>
                {report.etudiantBEmail && <p className="text-muted-foreground">{report.etudiantBEmail}</p>}
              </CardContent>
            </Card>
          </div>

          {/* ─── Global similarity gauge ─── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-6">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      className={isAboveThreshold ? 'text-destructive' : 'text-warning'}
                      strokeWidth="8"
                      strokeDasharray={`${report.globalSimilarity * 264} 264`}
                      strokeLinecap="round"
                      style={{ stroke: 'currentColor' }}
                    />
                  </svg>
                  <span className={`absolute text-2xl font-bold font-mono tabular-nums ${isAboveThreshold ? 'text-destructive' : 'text-warning'}`}>
                    {(report.globalSimilarity * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="space-y-1">
                  <p className={`text-lg font-bold ${isAboveThreshold ? 'text-destructive' : 'text-warning'}`}>
                    {isAboveThreshold ? 'Similarité suspecte' : 'Similarité détectée'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Seuil : {(seuilSimilarite * 100).toFixed(0)}% — Similarité globale pondérée par le barème
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Question-by-question breakdown ─── */}
          {report.questionSimilarities && report.questionSimilarities.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Détail par question ({report.questionSimilarities.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {report.questionSimilarities.map((qs, i) => {
                      const simPct = (qs.similarity * 100).toFixed(1)
                      const isHigh = qs.similarity >= seuilSimilarite
                      const typeLabel: Record<string, string> = {
                        QCU: 'QCU', QCM: 'QCM', QRC: 'QRC', CODE: 'Code', TRS: 'Transcription', REFLEXION: 'Réflexion'
                      }
                      return (
                        <div key={i} className={`rounded-md border p-3 ${isHigh ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">Q{i + 1}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5">{typeLabel[qs.type] || qs.type}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full ${isHigh ? 'bg-destructive' : qs.similarity >= 0.5 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${qs.similarity * 100}%` }} />
                              </div>
                              <span className={`text-xs font-bold font-mono tabular-nums ${isHigh ? 'text-destructive' : ''}`}>{simPct}%</span>
                            </div>
                          </div>
                          {(qs.answerA || qs.answerB) && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="rounded bg-muted/40 p-2">
                                <p className="text-[10px] text-muted-foreground mb-0.5">Étudiant A</p>
                                <p className="text-xs break-words">{qs.answerA || '—'}</p>
                              </div>
                              <div className="rounded bg-muted/40 p-2">
                                <p className="text-[10px] text-muted-foreground mb-0.5">Étudiant B</p>
                                <p className="text-xs break-words">{qs.answerB || '—'}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
