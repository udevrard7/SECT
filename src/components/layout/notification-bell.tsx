'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  AlertTriangle,
  Info,
  CheckCheck,
  CheckCircle2,
  Eye,
  Loader2,
  Clock,
  GraduationCap,
  ClipboardList,
  Shield,
  Zap,
  ExternalLink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { toast } from 'sonner'

// ─── Types ───

interface AlerteItem {
  id: string
  titre: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: 'PERFORMANCE' | 'FRAUDE' | 'SYSTEME' | 'RAPPEL' | 'CUSTOM'
  lue: boolean
  resolu: boolean
  filiereId: string | null
  epreuveId: string | null
  userId: string | null
  createdAt: string
  updatedAt: string
  filiere: { id: string; nom: string } | null
  epreuve: { id: string; titre: string } | null
  user: { id: string; name: string; email: string } | null
}

// ─── Utility functions ───

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return 'À l\'instant'
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD < 7) return `Il y a ${diffD}j`
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function getSeverityIcon(severity: string, size = 'h-4 w-4') {
  switch (severity) {
    case 'CRITICAL':
      return <AlertTriangle className={`${size} text-red-500`} />
    case 'WARNING':
      return <AlertTriangle className={`${size} text-amber-500`} />
    case 'INFO':
      return <Info className={`${size} text-sky-500`} />
    default:
      return <Info className={`${size} text-gray-500`} />
  }
}

function getSeverityBg(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-100 dark:bg-red-900/30'
    case 'WARNING': return 'bg-amber-100 dark:bg-amber-900/30'
    case 'INFO': return 'bg-sky-100 dark:bg-sky-900/30'
    default: return 'bg-gray-100 dark:bg-gray-800'
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'PERFORMANCE': return 'Performance'
    case 'FRAUDE': return 'Fraude'
    case 'SYSTEME': return 'Système'
    case 'RAPPEL': return 'Rappel'
    case 'CUSTOM': return 'Alerte'
    default: return type
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'PERFORMANCE': return <Zap className="h-3 w-3" />
    case 'FRAUDE': return <Shield className="h-3 w-3" />
    case 'SYSTEME': return <Info className="h-3 w-3" />
    case 'RAPPEL': return <Clock className="h-3 w-3" />
    case 'CUSTOM': return <Bell className="h-3 w-3" />
    default: return <Bell className="h-3 w-3" />
  }
}

// ─── Generate dynamic alerts from stats as fallback ───

function generateDynamicAlerts(stats: Record<string, unknown>): AlerteItem[] {
  const alerts: AlerteItem[] = []
  const now = new Date()

  const moyenne = stats.moyenneGenerale as number ?? 0
  if (moyenne > 0 && moyenne < 10) {
    alerts.push({
      id: 'dyn-perf-1',
      titre: 'Moyenne générale inférieure à 10/20',
      description: `La moyenne générale est de ${moyenne}/20. Une attention particulière est requise.`,
      severity: moyenne < 8 ? 'CRITICAL' : 'WARNING',
      type: 'PERFORMANCE',
      lue: false, resolu: false, filiereId: null, epreuveId: null, userId: null,
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - 3600000).toISOString(),
      filiere: null, epreuve: null, user: null,
    })
  }

  const statsAlertes = stats.alertes as Array<{ type: string; titre: string; description: string; severity: string }> ?? []
  statsAlertes.forEach((a, i) => {
    let type: AlerteItem['type'] = 'CUSTOM'
    if (a.type === 'taux_echec') type = 'PERFORMANCE'
    else if (a.type === 'corrections') type = 'RAPPEL'
    else if (a.type === 'fraude') type = 'FRAUDE'

    let severity: AlerteItem['severity'] = 'INFO'
    if (a.severity === 'critical') severity = 'CRITICAL'
    else if (a.severity === 'warning') severity = 'WARNING'

    alerts.push({
      id: `dyn-stats-${i}`, titre: a.titre, description: a.description,
      severity, type, lue: false, resolu: false,
      filiereId: null, epreuveId: null, userId: null,
      createdAt: new Date(now.getTime() - (i + 1) * 7200000).toISOString(),
      updatedAt: new Date(now.getTime() - (i + 1) * 7200000).toISOString(),
      filiere: null, epreuve: null, user: null,
    })
  })

  const nbEval = stats.nbEvaluations as number ?? 0
  if (nbEval > 0) {
    alerts.push({
      id: 'dyn-rappel-1', titre: 'Évaluations programmées',
      description: `${nbEval} évaluation(s) sont programmées.`,
      severity: 'INFO', type: 'RAPPEL', lue: false, resolu: false,
      filiereId: null, epreuveId: null, userId: null,
      createdAt: new Date(now.getTime() - 1800000).toISOString(),
      updatedAt: new Date(now.getTime() - 1800000).toISOString(),
      filiere: null, epreuve: null, user: null,
    })
  }

  alerts.push({
    id: 'dyn-sys-1', titre: 'Rapport hebdomadaire disponible',
    description: 'Le rapport statistique de la semaine est prêt.',
    severity: 'INFO', type: 'SYSTEME', lue: true, resolu: false,
    filiereId: null, epreuveId: null, userId: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
    updatedAt: new Date(now.getTime() - 86400000).toISOString(),
    filiere: null, epreuve: null, user: null,
  })

  return alerts
}

// ─── Main Component ───

export function NotificationBell() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [alertes, setAlertes] = useState<AlerteItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUsingFallback, setIsUsingFallback] = useState(false)

  const unreadCount = alertes.filter((a) => !a.lue).length
  const criticalCount = alertes.filter((a) => a.severity === 'CRITICAL' && !a.resolu).length

  // ─── Fetch alertes ───
  const fetchAlertes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ lue: 'false', limit: '20' })
      const res = await fetch(`/api/alertes?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const items = data.alertes ?? []
        if (items.length > 0 || data.total > 0) {
          setAlertes(items)
          setIsUsingFallback(false)
        } else {
          await loadFallbackAlerts()
        }
      } else {
        await loadFallbackAlerts()
      }
    } catch {
      await loadFallbackAlerts()
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadFallbackAlerts = async () => {
    try {
      const filiereParam = user?.filiereId || ''
      const res = await fetch(`/api/stats/responsable${filiereParam ? `?filiereId=${filiereParam}` : ''}`)
      if (res.ok) {
        const stats = await res.json()
        setAlertes(generateDynamicAlerts(stats))
        setIsUsingFallback(true)
      } else {
        setAlertes([])
        setIsUsingFallback(true)
      }
    } catch {
      setAlertes([])
      setIsUsingFallback(true)
    }
  }

  // Fetch on mount and when popover opens
  useEffect(() => {
    fetchAlertes()
  }, [fetchAlertes])

  useEffect(() => {
    if (open) {
      fetchAlertes()
    }
  }, [open, fetchAlertes])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchAlertes, 60000)
    return () => clearInterval(interval)
  }, [fetchAlertes])

  // ─── Mark single as read ───
  const handleMarkAsRead = async (alerte: AlerteItem) => {
    if (isUsingFallback) {
      setAlertes((prev) => prev.map((a) => a.id === alerte.id ? { ...a, lue: true } : a))
      return
    }
    try {
      await fetch(`/api/alertes/${alerte.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marquer_lue' }),
      })
      setAlertes((prev) => prev.map((a) => a.id === alerte.id ? { ...a, lue: true } : a))
    } catch {
      toast.error('Impossible de marquer comme lu')
    }
  }

  // ─── Mark all as read ───
  const handleMarkAllAsRead = async () => {
    const unreadAlertes = alertes.filter((a) => !a.lue)
    if (unreadAlertes.length === 0) return

    if (isUsingFallback) {
      setAlertes((prev) => prev.map((a) => ({ ...a, lue: true })))
      toast.success('Toutes les notifications marquées comme lues')
      return
    }

    try {
      await Promise.all(
        unreadAlertes.map((a) =>
          fetch(`/api/alertes/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'marquer_lue' }),
          })
        )
      )
      setAlertes((prev) => prev.map((a) => ({ ...a, lue: true })))
      toast.success('Toutes les notifications marquées comme lues')
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  // ─── Navigate to alertes page ───
  const handleViewAll = () => {
    setOpen(false)
    router.push(PAGE_ROUTES.alertes)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {/* Critical pulse indicator */}
          {criticalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 p-0" align="end" sideOffset={8}>
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Tout lire
              </Button>
            )}
          </div>
        </div>

        {/* ─── Loading ─── */}
        {isLoading && (
          <div className="px-4 py-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Empty state ─── */}
        {!isLoading && alertes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="mt-3 text-sm font-medium">Aucune notification</p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              Vous êtes à jour ! Toutes les alertes ont été lues.
            </p>
          </div>
        )}

        {/* ─── Notification list ─── */}
        {!isLoading && alertes.length > 0 && (
          <ScrollArea className="max-h-96">
            <div className="divide-y">
              {alertes.map((alerte) => (
                <div
                  key={alerte.id}
                  className={`flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer ${
                    !alerte.lue ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                  }`}
                  onClick={() => {
                    if (!alerte.lue) handleMarkAsRead(alerte)
                  }}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${getSeverityBg(alerte.severity)}`}>
                    {getSeverityIcon(alerte.severity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <p className={`text-sm leading-tight ${!alerte.lue ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                        {alerte.titre}
                      </p>
                      {!alerte.lue && (
                        <span className="flex-shrink-0 mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {alerte.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {getTypeIcon(alerte.type)}
                        {getTypeLabel(alerte.type)}
                      </span>
                      {alerte.filiere && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <GraduationCap className="h-2.5 w-2.5" />
                          {alerte.filiere.nom}
                        </span>
                      )}
                      {alerte.epreuve && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <ClipboardList className="h-2.5 w-2.5" />
                          {alerte.epreuve.titre}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeDate(alerte.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* ─── Footer ─── */}
        {alertes.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={handleViewAll}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Voir toutes les notifications
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
