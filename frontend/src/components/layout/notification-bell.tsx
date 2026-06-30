'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell,
  AlertTriangle,
  Info,
  CheckCheck,
  CheckCircle2,
  Eye,
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
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { PulseSkeleton } from '@/components/ds'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

// Unified notification item for display.
// N2: `source` distingue désormais 3 origines :
//  - 'alerte'            → /api/alertes (alertes personnelles + scopées, tous rôles)
//  - 'notification-admin' → /api/notifications/admin (notifs admin globales, ADMIN only)
//  - 'notification-me'    → /api/notifications/me (NotificationAdmin destinées au user via RLS)
interface UnifiedNotification {
  id: string
  titre: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: string
  lue: boolean
  createdAt: string
  categorie?: string
  source: 'alerte' | 'notification-admin' | 'notification-me'
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

// N7: tokens sémantiques "Savane EdTech" — JAMAIS de couleurs Tailwind directes.
function getSeverityIcon(severity: string, size = 'h-4 w-4') {
  switch (severity) {
    case 'CRITICAL':
      return <AlertTriangle className={`${size} text-destructive`} />
    case 'WARNING':
      return <AlertTriangle className={`${size} text-warning`} />
    case 'INFO':
      return <Info className={`${size} text-info`} />
    default:
      return <Info className={`${size} text-muted-foreground`} />
  }
}

function getSeverityBg(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-destructive/15'
    case 'WARNING': return 'bg-warning/15'
    case 'INFO': return 'bg-info/15'
    default: return 'bg-muted'
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

// ─── Convert NotificationAdmin to UnifiedNotification ───
// N2: le convertisseur est réutilisé pour /admin (source='notification-admin')
// et /me (source='notification-me').

function notificationAdminToUnified(
  n: NotificationAdminItem,
  source: 'notification-admin' | 'notification-me' = 'notification-admin',
): UnifiedNotification {
  return {
    id: n.id,
    titre: n.titre,
    description: n.message,
    severity: getPrioriteSeverity(n.priorite),
    type: n.categorie || n.type,
    lue: n.lu,
    createdAt: n.createdAt,
    categorie: n.categorie,
    source,
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

export function NotificationBell({ className }: { className?: string }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const unreadCount = notifications.filter((n) => !n.lue).length
  const criticalCount = notifications.filter((n) => n.severity === 'CRITICAL').length

  // Determine which API to use based on role
  const isAdmin = user?.role === 'ADMIN'

  // N6: ref pour gérer l'interval de polling adaptatif.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Fetch notifications ───
  // N2: pour TOUS les users (ADMIN et non-ADMIN), on fetch en parallèle :
  //   1. /api/alertes?lue=false&limit=20  (alertes personnelles + scopées)
  //   2. /api/notifications/me?lu=false&limit=20 (NotificationAdmin destinées au user via RLS)
  // Pour ADMIN uniquement, on ajoute :
  //   3. /api/notifications/admin?lu=false&limit=20 (notifs admin globales)
  // N3: plus de fallback `generateDynamicAlerts` — si une source retourne 0 résultat,
  //     on affiche simplement rien pour cette source.
  // Promise.allSettled pour qu'un échec d'une source ne bloque pas les autres.
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const alertesParams = new URLSearchParams({ lue: 'false', limit: '20' })
      const meParams = new URLSearchParams({ lu: 'false', limit: '20' })
      const adminParams = new URLSearchParams({ lu: 'false', limit: '20' })

      const fetchAlertes = async (): Promise<UnifiedNotification[]> => {
        const res = await fetch(`/api/alertes?${alertesParams.toString()}`)
        if (!res.ok) return []
        const data = await res.json()
        const items: AlerteItem[] = data.alertes ?? []
        return items.map(alerteToUnified)
      }

      const fetchMe = async (): Promise<UnifiedNotification[]> => {
        const res = await fetch(`/api/notifications/me?${meParams.toString()}`)
        if (!res.ok) return []
        const data = await res.json()
        const items: NotificationAdminItem[] = data.notifications ?? []
        return items.map((n) => notificationAdminToUnified(n, 'notification-me'))
      }

      const fetchAdmin = async (): Promise<UnifiedNotification[]> => {
        const res = await fetch(`/api/notifications/admin?${adminParams.toString()}`)
        if (!res.ok) return []
        const data = await res.json()
        const items: NotificationAdminItem[] = data.notifications ?? []
        return items.map((n) => notificationAdminToUnified(n, 'notification-admin'))
      }

      const tasks: Promise<UnifiedNotification[]>[] = [fetchAlertes(), fetchMe()]
      if (isAdmin) tasks.push(fetchAdmin())

      const results = await Promise.allSettled(tasks)

      // Merge + déduplication par id (first occurrence wins) + tri createdAt DESC
      const merged = new Map<string, UnifiedNotification>()
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        for (const n of r.value) {
          if (!merged.has(n.id)) merged.set(n.id, n)
        }
      }
      const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      setNotifications(sorted)
    } catch {
      setNotifications([])
    } finally {
      setIsLoading(false)
    }
  }, [user, isAdmin])

  // Fetch on mount and when popover opens
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // N6: Polling adaptatif.
  //  - unreadCount > 0 → 30s  (vérifier souvent s'il y a du nouveau)
  //  - unreadCount === 0 → 5min (vérifier rarement si tout est lu)
  // L'interval est recréé quand unreadCount change (via le ref + cleanup).
  // Le polling ne s'exécute que si l'onglet est visible (économie ~70% tabs cachés).
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const delay = unreadCount > 0 ? 30000 : 300000

    intervalRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchNotifications()
      }
    }, delay)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchNotifications, unreadCount])

  // Re-fetch quand l'utilisateur revient sur l'onglet (1 seule fois)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fetchNotifications])

  // ─── Mark single as read ───
  // N2: route selon la source :
  //  - 'alerte'            → PATCH /api/alertes/{id}            (body: { action: 'marquer_lu' })
  //  - 'notification-me'   → PATCH /api/notifications/me/{id}   (body: {})
  //  - 'notification-admin'→ PATCH /api/notifications/admin/{id}(body: { action: 'marquer_lu' })
  const handleMarkAsRead = async (notification: UnifiedNotification) => {
    try {
      let apiPath: string
      let body: string

      if (notification.source === 'alerte') {
        apiPath = `/api/alertes/${notification.id}`
        body = JSON.stringify({ action: 'marquer_lu' })
      } else if (notification.source === 'notification-me') {
        apiPath = `/api/notifications/me/${notification.id}`
        body = JSON.stringify({})
      } else {
        apiPath = `/api/notifications/admin/${notification.id}`
        body = JSON.stringify({ action: 'marquer_lu' })
      }

      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
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
  // N5: batch par source — 1 requête batch pour les alertes + 1 batch pour les
  // notifs admin (ADMIN) + N PATCH /me/{id} pour les notifs destinées au user.
  const handleMarkAllAsRead = async () => {
    const unreadNotifs = notifications.filter((n) => !n.lue)
    if (unreadNotifs.length === 0) return

    const alerteNotifs = unreadNotifs.filter((n) => n.source === 'alerte')
    const adminNotifs = unreadNotifs.filter((n) => n.source === 'notification-admin')
    const meNotifs = unreadNotifs.filter((n) => n.source === 'notification-me')

    const tasks: Promise<Response>[] = []

    // 1. Alertes → 1 batch POST /api/alertes/mark-all-read
    if (alerteNotifs.length > 0) {
      tasks.push(
        fetch('/api/alertes/mark-all-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    // 2. NotificationAdmin globales (source=notification-admin) :
    //    - ADMIN → batch GET /api/notifications/admin?markAllRead=true (existant)
    //    - non-ADMIN (ne devrait pas arriver, /admin est RBAC) → fallback /me/{id}
    if (adminNotifs.length > 0) {
      if (isAdmin) {
        tasks.push(
          fetch('/api/notifications/admin?markAllRead=true&lu=false', { method: 'GET' }),
        )
      } else {
        for (const n of adminNotifs) {
          tasks.push(
            fetch(`/api/notifications/me/${n.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }),
          )
        }
      }
    }

    // 3. NotificationAdmin destinées au user (source=notification-me) → PATCH /me/{id}
    //    Généralement 1-2 notifs, pas besoin de batch backend.
    for (const n of meNotifs) {
      tasks.push(
        fetch(`/api/notifications/me/${n.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      )
    }

    try {
      const results = await Promise.allSettled(tasks)
      const anyOk = tasks.length === 0 || results.some((r) => r.status === 'fulfilled' && r.value.ok)
      if (anyOk) {
        setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })))
        toast.success('Toutes les notifications marquées comme lues')
      } else {
        toast.error('Erreur lors de la mise à jour')
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
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {/* Unread badge — N7: tokens sémantiques */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {/* Critical pulse indicator — N7 */}
          {criticalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60 opacity-75" />
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
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-destructive/15 text-destructive-foreground">
                {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-success-text hover:bg-success/10"
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
                <PulseSkeleton className="h-8 w-8 rounded-lg flex-shrink-0" variant="card" />
                <div className="flex-1 space-y-1.5">
                  <PulseSkeleton className="h-3.5 w-3/4" />
                  <PulseSkeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Empty state — N7: tokens success ─── */}
        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success-text" />
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
                    !notification.lue ? 'bg-success/5' : ''
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
                        <span className="flex-shrink-0 mt-1 h-2 w-2 rounded-full bg-success" />
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
                className="w-full text-xs text-success-text hover:bg-success/10"
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
