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
  Sparkles,
  CreditCard,
  Lock,
  UserCheck,
  FileText,
  Settings,
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

interface NotificationAdminItem {
  id: string
  type: string
  titre: string
  message: string
  lu: boolean
  destinataireId: string | null
  destinataireRole: string | null
  actionUrl: string | null
  actionLabel: string | null
  priorite: string
  categorie: string
  icone: string | null
  expireLe: string | null
  createdAt: string
  destinataire: { id: string; name: string; email: string; role: string } | null
}

// Unified notification item for display
interface UnifiedNotification {
  id: string
  titre: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: string
  lue: boolean
  createdAt: string
  categorie?: string
  source: 'alerte' | 'notification-admin'
  filiere?: { id: string; nom: string } | null
  epreuve?: { id: string; titre: string } | null
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
    case 'INFO': return 'Info'
    case 'WARNING': return 'Attention'
    case 'ERROR': return 'Erreur'
    case 'SUCCESS': return 'Succès'
    case 'BROADCAST': return 'Diffusion'
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
    case 'ABONNEMENT': return <CreditCard className="h-3 w-3" />
    case 'SECURITE': return <Lock className="h-3 w-3" />
    case 'EVALUATION': return <ClipboardList className="h-3 w-3" />
    case 'COMPTE': return <UserCheck className="h-3 w-3" />
    case 'BROADCAST': return <Sparkles className="h-3 w-3" />
    default: return <Bell className="h-3 w-3" />
  }
}

function getPrioriteSeverity(priorite: string): 'CRITICAL' | 'WARNING' | 'INFO' {
  switch (priorite) {
    case 'URGENTE': return 'CRITICAL'
    case 'HAUTE': return 'WARNING'
    default: return 'INFO'
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

// ─── Convert NotificationAdmin to UnifiedNotification ───

function notificationAdminToUnified(n: NotificationAdminItem): UnifiedNotification {
  return {
    id: n.id,
    titre: n.titre,
    description: n.message,
    severity: getPrioriteSeverity(n.priorite),
    type: n.categorie || n.type,
    lue: n.lu,
    createdAt: n.createdAt,
    categorie: n.categorie,
    source: 'notification-admin',
  }
}

// ─── Convert AlerteItem to UnifiedNotification ───

function alerteToUnified(a: AlerteItem): UnifiedNotification {
  return {
    id: a.id,
    titre: a.titre,
    description: a.description,
    severity: a.severity,
    type: a.type,
    lue: a.lue,
    createdAt: a.createdAt,
    source: 'alerte',
    filiere: a.filiere,
    epreuve: a.epreuve,
  }
}

// ─── Main Component ───

export function NotificationBell() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUsingFallback, setIsUsingFallback] = useState(false)

  const unreadCount = notifications.filter((n) => !n.lue).length
  const criticalCount = notifications.filter((n) => n.severity === 'CRITICAL').length

  // Determine which API to use based on role
  const isAdmin = user?.role === 'ADMIN'

  // ─── Fetch notifications ───
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      if (isAdmin) {
        // ADMIN: fetch from NotificationAdmin API with RBAC filtering
        const params = new URLSearchParams({ lu: 'false', limit: '20' })
        const res = await fetch(`/api/notifications/admin?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          const items: NotificationAdminItem[] = data.notifications ?? []
          if (items.length > 0 || data.total > 0) {
            setNotifications(items.map(notificationAdminToUnified))
            setIsUsingFallback(false)
          } else {
            setNotifications([])
            setIsUsingFallback(false)
          }
        } else {
          setNotifications([])
          setIsUsingFallback(false)
        }
      } else {
        // RESPONSABLE/ENSEIGNANT/ETUDIANT: fetch from Alerte API with RBAC filtering
        const params = new URLSearchParams({ lue: 'false', limit: '20' })
        const res = await fetch(`/api/alertes?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          const items: AlerteItem[] = data.alertes ?? []
          if (items.length > 0 || data.total > 0) {
            setNotifications(items.map(alerteToUnified))
            setIsUsingFallback(false)
          } else {
            await loadFallbackAlerts()
          }
        } else {
          await loadFallbackAlerts()
        }
      }
    } catch {
      if (!isAdmin) {
        await loadFallbackAlerts()
      } else {
        setNotifications([])
        setIsUsingFallback(false)
      }
    } finally {
      setIsLoading(false)
    }
  }, [user, isAdmin])

  const loadFallbackAlerts = async () => {
    try {
      const filiereParam = user?.filiereId || ''
      const res = await fetch(`/api/stats/responsable${filiereParam ? `?filiereId=${filiereParam}` : ''}`)
      if (res.ok) {
        const stats = await res.json()
        setNotifications(generateDynamicAlerts(stats).map(alerteToUnified))
        setIsUsingFallback(true)
      } else {
        setNotifications([])
        setIsUsingFallback(true)
      }
    } catch {
      setNotifications([])
      setIsUsingFallback(true)
    }
  }

  // Fetch on mount and when popover opens
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // ─── Mark single as read ───
  const handleMarkAsRead = async (notification: UnifiedNotification) => {
    if (isUsingFallback) {
      setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, lue: true } : n))
      return
    }
    try {
      const apiPath = notification.source === 'notification-admin'
        ? `/api/notifications/admin/${notification.id}`
        : `/api/alertes/${notification.id}`

      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marquer_lu' }),
      })

      if (res.ok) {
        setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, lue: true } : n))
      } else {
        toast.error('Impossible de marquer comme lu')
      }
    } catch {
      toast.error('Impossible de marquer comme lu')
    }
  }

  // ─── Mark all as read ───
  const handleMarkAllAsRead = async () => {
    const unreadNotifs = notifications.filter((n) => !n.lue)
    if (unreadNotifs.length === 0) return

    if (isUsingFallback) {
      setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })))
      toast.success('Toutes les notifications marquées comme lues')
      return
    }

    try {
      if (isAdmin) {
        // Use the markAllRead query param for admin notifications
        const res = await fetch('/api/notifications/admin?markAllRead=true&lu=false', { method: 'GET' })
        if (res.ok) {
          setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })))
          toast.success('Toutes les notifications marquées comme lues')
        }
      } else {
        await Promise.all(
          unreadNotifs.map((n) =>
            fetch(`/api/alertes/${n.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'marquer_lu' }),
            })
          )
        )
        setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })))
        toast.success('Toutes les notifications marquées comme lues')
      }
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  // ─── Navigate to notifications page ───
  const handleViewAll = () => {
    setOpen(false)
    if (isAdmin) {
      router.push(PAGE_ROUTES.notifications)
    } else {
      router.push(PAGE_ROUTES.alertes)
    }
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
        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="mt-3 text-sm font-medium">Aucune notification</p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              Vous êtes à jour ! Toutes les notifications ont été lues.
            </p>
          </div>
        )}

        {/* ─── Notification list ─── */}
        {!isLoading && notifications.length > 0 && (
          <ScrollArea className="max-h-96">
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer ${
                    !notification.lue ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                  }`}
                  onClick={() => {
                    if (!notification.lue) handleMarkAsRead(notification)
                  }}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${getSeverityBg(notification.severity)}`}>
                    {getSeverityIcon(notification.severity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <p className={`text-sm leading-tight ${!notification.lue ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                        {notification.titre}
                      </p>
                      {!notification.lue && (
                        <span className="flex-shrink-0 mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {getTypeIcon(notification.type)}
                        {getTypeLabel(notification.type)}
                      </span>
                      {notification.filiere && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <GraduationCap className="h-2.5 w-2.5" />
                          {notification.filiere.nom}
                        </span>
                      )}
                      {notification.epreuve && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <ClipboardList className="h-2.5 w-2.5" />
                          {notification.epreuve.titre}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeDate(notification.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* ─── Footer ─── */}
        {notifications.length > 0 && (
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
