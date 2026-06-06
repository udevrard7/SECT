'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

// ─── Types ───

interface LogEvent {
  type: string
  timestamp: string
  details?: string
  penalite?: number
  imageLength?: number
  thumbnail?: string
}

interface SurveillanceSession {
  id: string
  statut: string
  dateDebut: string | null
  dateFin: string | null
  score: number | null
  penalite: number
  alertes: number
  etudiant: { id: string; name: string; email: string }
  epreuve: {
    id: string
    titre: string
    statut: string
    dateDebut: string
    dateFin: string
    proctoringActif: boolean
  }
  logEvents: LogEvent[]
  fraudEvents: LogEvent[]
  screenshotEvents: LogEvent[]
  submissionEvents: LogEvent[]
  totalPenalite: number
}

interface EpreuveOption {
  id: string
  titre: string
  statut: string
  dateDebut: string
  dateFin: string
  proctoringActif: boolean
  totalAlerts: number
  sessionsWithAlerts: number
  totalSessions: number
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

function formatTime(date: string): string {
  const d = new Date(date)
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    FULLSCREEN_EXIT: 'Sortie plein écran',
    TAB_SWITCH: 'Changement d\'onglet',
    COPY_ATTEMPT: 'Tentative de copie',
    PASTE_ATTEMPT: 'Tentative de collage',
    DEVTOOLS_ATTEMPT: 'Outils de développement',
    PRINTSCREEN_ATTEMPT: 'Capture d\'écran',
    PRINT_ATTEMPT: 'Tentative d\'impression',
    ALT_TAB: 'Alt+Tab détecté',
    INACTIVITY: 'Inactivité détectée',
    SCREEN_CAPTURE: 'Capture périodique',
    AUTO_SUBMIT: 'Soumission automatique',
    MANUAL_SUBMIT: 'Soumission manuelle',
    FORCE_SUBMIT: 'Soumission forcée',
  }
  return labels[type] || type
}

function getEventTypeIcon(type: string) {
  switch (type) {
    case 'FULLSCREEN_EXIT': return <Maximize2 className="h-3.5 w-3.5" />
    case 'TAB_SWITCH': return <ExternalLink className="h-3.5 w-3.5" />
    case 'COPY_ATTEMPT': return <Copy className="h-3.5 w-3.5" />
    case 'PASTE_ATTEMPT': return <Clipboard className="h-3.5 w-3.5" />
    case 'DEVTOOLS_ATTEMPT': return <Keyboard className="h-3.5 w-3.5" />
    case 'PRINTSCREEN_ATTEMPT': return <Camera className="h-3.5 w-3.5" />
    case 'PRINT_ATTEMPT': return <FileText className="h-3.5 w-3.5" />
    case 'ALT_TAB': return <LogOut className="h-3.5 w-3.5" />
    case 'INACTIVITY': return <Clock className="h-3.5 w-3.5" />
    case 'SCREEN_CAPTURE': return <Camera className="h-3.5 w-3.5" />
    case 'AUTO_SUBMIT':
    case 'MANUAL_SUBMIT':
    case 'FORCE_SUBMIT': return <Activity className="h-3.5 w-3.5" />
    default: return <AlertTriangle className="h-3.5 w-3.5" />
  }
}

function getEventTypeBadgeClasses(type: string): string {
  if (['AUTO_SUBMIT', 'MANUAL_SUBMIT', 'FORCE_SUBMIT'].includes(type)) {
    return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
  }
  if (type === 'SCREEN_CAPTURE') {
    return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'
  }
  if (type === 'FULLSCREEN_EXIT' || type === 'TAB_SWITCH') {
    return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
  }
  return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
}

function getSeverityLevel(type: string): 'high' | 'medium' | 'low' | 'info' {
  const high = ['FULLSCREEN_EXIT', 'TAB_SWITCH', 'DEVTOOLS_ATTEMPT']
  const medium = ['COPY_ATTEMPT', 'PASTE_ATTEMPT', 'PRINTSCREEN_ATTEMPT', 'PRINT_ATTEMPT', 'ALT_TAB']
  const low = ['INACTIVITY']
  if (high.includes(type)) return 'high'
  if (medium.includes(type)) return 'medium'
  if (low.includes(type)) return 'low'
  return 'info'
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

function getStatutBadgeClasses(statut: string): string {
  switch (statut) {
    case 'EN_COURS': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    case 'SOUMISE': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    case 'CORRIGEE': return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
    case 'RETOURNEE': return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
    case 'NON_SOUMIS': return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

// ─── Main Component ───

export function SurveillancePage() {
  const user = useAuthStore((s) => s.user)

  // ─── State ───
  const [epreuves, setEpreuves] = useState<EpreuveOption[]>([])
  const [selectedEpreuveId, setSelectedEpreuveId] = useState<string>('')
  const [sessions, setSessions] = useState<SurveillanceSession[]>([])
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [screenshotDialogOpen, setScreenshotDialogOpen] = useState(false)
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const url = selectedEpreuveId
        ? `/api/surveillance?enseignantId=${user.id}&epreuveId=${selectedEpreuveId}`
        : `/api/surveillance?enseignantId=${user.id}`
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
        setSessions(data.sessions ?? [])
      } else {
        console.error('[surveillance] Failed to fetch:', res.status)
        toast.error('Erreur de chargement', {
          description: 'Impossible de charger les données de surveillance.',
        })
      }
    } catch (err) {
      console.error('[surveillance] Error:', err)
      toast.error('Erreur réseau', {
        description: 'Impossible de contacter le serveur.',
      })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, selectedEpreuveId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Filtered sessions ───
  const filteredSessions = sessions.filter((s) => {
    if (!searchFilter) return true
    const q = searchFilter.toLowerCase()
    return (
      s.etudiant.name.toLowerCase().includes(q) ||
      s.etudiant.email.toLowerCase().includes(q)
    )
  }).filter((s) => {
    if (eventFilter === 'all') return true
    if (eventFilter === 'fraud') return s.fraudEvents.length > 0
    if (eventFilter === 'screenshots') return s.screenshotEvents.length > 0
    if (eventFilter === 'alerts') return s.alertes > 0
    return true
  })

  // ─── Global stats ───
  const totalSessions = filteredSessions.length
  const totalAlerts = filteredSessions.reduce((sum, s) => sum + s.alertes, 0)
  const totalFraud = filteredSessions.reduce((sum, s) => sum + s.fraudEvents.length, 0)
  const totalScreenshots = filteredSessions.reduce((sum, s) => sum + s.screenshotEvents.length, 0)

  // ─── Screenshot viewer ───
  const openScreenshot = (thumbnail: string) => {
    setSelectedScreenshot(thumbnail)
    setScreenshotDialogOpen(true)
  }

  // ─── Render event row ───
  const renderEventRow = (event: LogEvent, index: number) => {
    const severity = getSeverityLevel(event.type)
    const isScreenshot = event.type === 'SCREEN_CAPTURE'
    const isSubmission = ['AUTO_SUBMIT', 'MANUAL_SUBMIT', 'FORCE_SUBMIT'].includes(event.type)

    return (
      <div
        key={index}
        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
          severity === 'high'
            ? 'border-rose-200 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/20'
            : severity === 'medium'
            ? 'border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10'
            : isScreenshot
            ? 'border-sky-200 bg-sky-50/30 dark:border-sky-800 dark:bg-sky-950/10'
            : 'border-border bg-background'
        }`}
      >
        {/* Event type badge */}
        <div className="shrink-0 mt-0.5">
          <Badge variant="outline" className={`text-[10px] gap-1 ${getEventTypeBadgeClasses(event.type)}`}>
            {getEventTypeIcon(event.type)}
            {getEventTypeLabel(event.type)}
          </Badge>
        </div>

        {/* Event details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(event.timestamp)}
            </span>
            {event.penalite && event.penalite > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5">
                -{event.penalite} pt{event.penalite > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {event.details && (
            <p className="text-xs text-muted-foreground mt-1">{event.details}</p>
          )}
          {/* Screenshot thumbnail */}
          {isScreenshot && event.thumbnail && (
            <button
              onClick={() => openScreenshot(event.thumbnail!)}
              className="mt-2 relative group"
            >
              <img
                src={event.thumbnail}
                alt={`Capture d'écran - ${formatTime(event.timestamp)}`}
                className="h-20 rounded-md border border-border object-cover shadow-sm transition-opacity group-hover:opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye className="h-5 w-5 text-white" />
              </div>
            </button>
          )}
          {isScreenshot && !event.thumbnail && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ImageOff className="h-3.5 w-3.5" />
              Capture non disponible
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Render session card ───
  const renderSessionCard = (session: SurveillanceSession) => {
    const isExpanded = expandedSessionId === session.id
    const hasAlerts = session.alertes > 0

    return (
      <Card key={session.id} className={`transition-all ${hasAlerts ? 'border-amber-300 dark:border-amber-800' : ''}`}>
        <button
          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
          className="w-full text-left"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  hasAlerts
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-emerald-100 dark:bg-emerald-900/30'
                }`}>
                  <User className={`h-5 w-5 ${
                    hasAlerts
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{session.etudiant.name}</p>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${getStatutBadgeClasses(session.statut)}`}>
                      {getStatutLabel(session.statut)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{session.etudiant.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {session.alertes > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-6">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {session.alertes}
                  </Badge>
                )}
                {session.fraudEvents.length > 0 && (
                  <Badge className="text-[10px] h-6 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                    <Shield className="h-3 w-3 mr-0.5" />
                    {session.fraudEvents.length}
                  </Badge>
                )}
                {session.screenshotEvents.length > 0 && (
                  <Badge className="text-[10px] h-6 bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800">
                    <Camera className="h-3 w-3 mr-0.5" />
                    {session.screenshotEvents.length}
                  </Badge>
                )}
                {session.penalite > 0 && (
                  <Badge className="text-[10px] h-6 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">
                    -{session.penalite} pts
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Session time info */}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {session.dateDebut && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Début : {formatDateTime(session.dateDebut)}
                </span>
              )}
              {session.dateFin && (
                <span>Fin : {formatDateTime(session.dateFin)}</span>
              )}
            </div>
          </CardContent>
        </button>

        {/* Expanded: Event details */}
        {isExpanded && (
          <div className="border-t px-4 pb-4 pt-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Journal des événements</h4>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {session.logEvents.length} événement{session.logEvents.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {session.logEvents.length === 0 ? (
              <div className="text-center py-6">
                <Shield className="h-8 w-8 mx-auto text-emerald-500 dark:text-emerald-400" />
                <p className="mt-2 text-sm text-muted-foreground">Aucun événement de surveillance enregistré</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="space-y-2 pr-1">
                  {/* Show fraud events first */}
                  {session.fraudEvents.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-3.5 w-3.5 text-rose-500" />
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                          Alertes anti-fraude ({session.fraudEvents.length})
                        </span>
                      </div>
                      {session.fraudEvents.map((event, idx) => renderEventRow(event, idx))}
                    </>
                  )}

                  {/* Show screenshots */}
                  {session.screenshotEvents.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mt-4 mb-2">
                        <Camera className="h-3.5 w-3.5 text-sky-500" />
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                          Captures d&apos;écran ({session.screenshotEvents.length})
                        </span>
                      </div>
                      {session.screenshotEvents.map((event, idx) => renderEventRow(event, idx))}
                    </>
                  )}

                  {/* Show submission events */}
                  {session.submissionEvents.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mt-4 mb-2">
                        <Activity className="h-3.5 w-3.5 text-teal-500" />
                        <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                          Soumission
                        </span>
                      </div>
                      {session.submissionEvents.map((event, idx) => renderEventRow(event, idx))}
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </Card>
    )
  }

  // ─── Main Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          Surveillance des épreuves
        </h1>
        <p className="text-muted-foreground mt-1">
          Consultez les alertes anti-fraude et captures d&apos;écran des sessions de vos étudiants
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Monitor className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSessions}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAlerts}</p>
                <p className="text-xs text-muted-foreground">Alertes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/30">
                <Shield className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalFraud}</p>
                <p className="text-xs text-muted-foreground">Fraude</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <Camera className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalScreenshots}</p>
                <p className="text-xs text-muted-foreground">Captures</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Epreuve selector */}
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">Épreuve</Label>
              <Select
                value={selectedEpreuveId}
                onValueChange={setSelectedEpreuveId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Toutes les épreuves" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les épreuves</SelectItem>
                  {epreuves.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="flex items-center gap-2">
                        {e.titre}
                        {e.totalAlerts > 0 && (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1 ml-1">
                            {e.totalAlerts}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Event type filter */}
            <div className="w-full sm:w-48 space-y-1">
              <Label className="text-xs font-medium">Filtrer par</Label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les événements</SelectItem>
                  <SelectItem value="alerts">Avec alertes</SelectItem>
                  <SelectItem value="fraud">Fraude uniquement</SelectItem>
                  <SelectItem value="screenshots">Captures uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="w-full sm:w-64 space-y-1">
              <Label className="text-xs font-medium">Rechercher</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nom ou email..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-48 rounded bg-muted" />
                  <div className="h-3 w-32 rounded bg-muted" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-muted" />
                <div className="h-5 w-12 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <Shield className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune session trouvée</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                {selectedEpreuveId
                  ? 'Aucune session de surveillance pour cette épreuve.'
                  : 'Sélectionnez une épreuve ou modifiez vos filtres.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => renderSessionCard(session))}
        </div>
      )}

      {/* Screenshot viewer dialog */}
      <Dialog open={screenshotDialogOpen} onOpenChange={setScreenshotDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Capture d&apos;écran</DialogTitle>
          </DialogHeader>
          {selectedScreenshot && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => setScreenshotDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <img
                src={selectedScreenshot}
                alt="Capture d'écran agrandie"
                className="w-full h-auto rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
