'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  AlertTriangle,
  Shield,
  Zap,
  Clock,
  Settings,
  ClipboardList,
  UserCheck,
  CreditCard,
  Lock,
  Sparkles,
  CheckCheck,
  CheckCircle2,
  Eye,
  ExternalLink,
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

// Phase 3 : schéma aligné sur l'endpoint unifié /api/notifications/unified.
// La VIEW SQL backend fait l'UNION des 2 sources (Alerte + NotificationAdmin)
// et la RLS des tables sous-jacentes s'applique (l'utilisateur ne voit que ses
// notifs). Les IDs sont préfixés ('a-' pour alerte, 'n-' pour notification-admin)
// afin d'éviter les collisions entre sources lors du merge côté backend.
interface UnifiedNotification {
  id: string
  source: 'alerte' | 'notification-admin'
  titre: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: string
  lue: boolean
  createdAt: string
  destinataireId?: string
  destinataireRole?: string
  actionUrl?: string | null
  actionLabel?: string | null
  categorie?: string | null
  filiereId?: string | null
  epreuveId?: string | null
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

// N8 (Phase 3) : fusion severity + type en une seule icône Lucide.
// La couleur de l'icône suit la severity (tokens Savane EdTech — destructif /
// warning / info). L'icône du type n'est plus affichée séparément dans les
// métadonnées : seule la fusion (severity, type) s'affiche dans le cercle.
function getCategoryIcon(severity: string, type: string) {
  const colorClass =
    severity === 'CRITICAL'
      ? 'text-destructive'
      : severity === 'WARNING'
        ? 'text-warning'
        : 'text-info'
  const iconClass = `h-4 w-4 ${colorClass}`

  // default → Bell
  let Icon = Bell
  if (severity === 'CRITICAL' && type === 'FRAUDE') {
    Icon = Shield
  } else if (severity === 'CRITICAL') {
    Icon = AlertTriangle
  } else if (severity === 'WARNING' && type === 'PERFORMANCE') {
    Icon = Zap
  } else if (severity === 'WARNING' && type === 'RAPPEL') {
    Icon = Clock
  } else if (severity === 'WARNING') {
    Icon = AlertTriangle
  } else if (severity === 'INFO' && type === 'SYSTEME') {
    Icon = Settings
  } else if (severity === 'INFO' && type === 'EVALUATION') {
    Icon = ClipboardList
  } else if (severity === 'INFO' && type === 'COMPTE') {
    Icon = UserCheck
  } else if (severity === 'INFO' && type === 'ABONNEMENT') {
    Icon = CreditCard
  } else if (severity === 'INFO' && type === 'SECURITE') {
    Icon = Lock
  } else if (severity === 'INFO' && type === 'BROADCAST') {
    Icon = Sparkles
  }
  // INFO + *  → Bell (default)
  // default   → Bell (default)

  return <Icon className={iconClass} />
}

// ─── Main Component ───

export function NotificationBell({ className }: { className?: string }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // Compteur temps réel poussé par le SSE (null tant qu'aucun message reçu).
  const [sseUnreadCount, setSseUnreadCount] = useState<number | null>(null)

  const unreadCount = notifications.filter((n) => !n.lue).length
  const criticalCount = notifications.filter((n) => n.severity === 'CRITICAL').length
  // Le badge utilise le max du compteur fetched et du compteur SSE temps réel
  // pour éviter le clignotement pendant un refetch (le SSE reste stable pendant
  // que la liste se recharge).
  const displayUnreadCount = Math.max(unreadCount, sseUnreadCount ?? 0)

  // Rôle pour le routage admin (handleViewAll + handleMarkAllAsRead).
  // L'endpoint unifié gère tous les rôles côté fetch — isAdmin n'est plus
  // utilisé pour sélectionner des endpoints de lecture.
  const isAdmin = user?.role === 'ADMIN'

  // ─── Fetch notifications ───
  // Phase 3 : un seul fetch sur l'endpoint unifié. La VIEW SQL fait déjà l'UNION
  // des sources (Alerte + NotificationAdmin) avec la RLS qui filtre par user.
  // Les IDs sont préfixés ('a-' / 'n-') pour éviter les collisions.
  // Plus de Promise.allSettled multi-sources ni de merge Map côté frontend.
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/notifications/unified?lu=false&limit=20')
      if (res.ok) {
        const data = await res.json()
        const items: UnifiedNotification[] = data.notifications ?? []
        setNotifications(items)
      } else {
        setNotifications([])
      }
    } catch {
      setNotifications([])
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Fetch on mount and when popover opens
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // Phase 3 : SSE EventSource pour le compteur temps réel.
  // Le backend push le compteur de notifications non lues toutes les 15s +
  // heartbeat 45s. EventSource se reconnecte automatiquement en cas de
  // déconnexion (pas de gestion manuelle du retry).
  // Remplace le polling adaptatif setInterval (30s/5min) de la Phase 2.
  useEffect(() => {
    if (!user) return
    const eventSource = new EventSource('/api/notifications/stream')

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          data?: { unreadCount?: number }
        }
        const serverUnreadCount = parsed.data?.unreadCount
        if (typeof serverUnreadCount === 'number') {
          // Met à jour le state local du compteur non lu (temps réel)
          setSseUnreadCount(serverUnreadCount)
          // Si le compteur a augmenté, refetch la liste complète
          if (serverUnreadCount > unreadCount) {
            fetchNotifications()
          }
        }
      } catch {
        // ignore parse errors (heartbeats, commentaires SSE)
      }
    }

    eventSource.onerror = () => {
      // EventSource se reconnecte automatiquement, pas besoin de gestion manuelle.
    }

    return () => {
      eventSource.close()
    }
  }, [user, fetchNotifications, unreadCount])

  // Re-fetch quand l'utilisateur revient sur l'onglet (complément au SSE).
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
  // Phase 3 : route selon le préfixe de l'ID (au lieu de la `source`).
  //  - 'a-' → PATCH /api/alertes/{id.slice(2)}        body { action: 'marquer_lu' }
  //  - 'n-' → PATCH /api/notifications/me/{id.slice(2)}  body {}
  const handleMarkAsRead = async (notification: UnifiedNotification) => {
    try {
      let apiPath: string
      let body: string

      if (notification.id.startsWith('a-')) {
        apiPath = `/api/alertes/${notification.id.slice(2)}`
        body = JSON.stringify({ action: 'marquer_lu' })
      } else {
        // 'n-' → notification-admin destinée au user via RLS
        apiPath = `/api/notifications/me/${notification.id.slice(2)}`
        body = JSON.stringify({})
      }

      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, lue: true } : n)),
        )
        // Optimistic : décrémenter le compteur SSE pour garder le badge à jour
        // en attendant le prochain push SSE (~15s).
        setSseUnreadCount((prev) => Math.max(0, (prev ?? 0) - 1))
      } else {
        toast.error('Impossible de marquer comme lu')
      }
    } catch {
      toast.error('Impossible de marquer comme lu')
    }
  }

  // ─── Mark all as read ───
  // Phase 3 : 2 endpoints batch en parallèle + fallback /me/{id} pour les
  // notifs 'n-' destinées au user (non-ADMIN).
  //  - Alertes (préfixe 'a-') → 1 batch POST /api/alertes/mark-all-read
  //  - NotificationAdmin (préfixe 'n-') :
  //      • ADMIN → 1 batch POST /api/notifications/admin/mark-all-read
  //      • non-ADMIN → N PATCH /api/notifications/me/{id.slice(2)} (body {})
  const handleMarkAllAsRead = async () => {
    const unreadNotifs = notifications.filter((n) => !n.lue)
    if (unreadNotifs.length === 0) return

    const alerteNotifs = unreadNotifs.filter((n) => n.id.startsWith('a-'))
    const adminNotifs = unreadNotifs.filter((n) => n.id.startsWith('n-'))

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

    // 2. NotificationAdmin :
    //    - ADMIN → 1 batch POST /api/notifications/admin/mark-all-read
    //    - non-ADMIN → N PATCH /api/notifications/me/{id.slice(2)}
    if (adminNotifs.length > 0) {
      if (isAdmin) {
        tasks.push(
          fetch('/api/notifications/admin/mark-all-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      } else {
        for (const n of adminNotifs) {
          tasks.push(
            fetch(`/api/notifications/me/${n.id.slice(2)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }),
          )
        }
      }
    }

    try {
      const results = await Promise.allSettled(tasks)
      const anyOk =
        tasks.length === 0 ||
        results.some((r) => r.status === 'fulfilled' && r.value.ok)
      if (anyOk) {
        setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })))
        // Optimistic : remettre le compteur SSE à 0 (le prochain push confirmera).
        setSseUnreadCount(0)
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
          {/* Unread badge — N7: tokens sémantiques. Phase 3 : max(fetched, SSE). */}
          {displayUnreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
              {displayUnreadCount > 9 ? '9+' : displayUnreadCount}
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
                  {/* Icon — N8: une seule icône (severity + type fusionnés) */}
                  <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${getSeverityBg(notification.severity)}`}>
                    {getCategoryIcon(notification.severity, notification.type)}
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
                      {/* N8 : label textuel du type uniquement (plus d'icône séparée) */}
                      <span className="text-[10px] text-muted-foreground">
                        {getTypeLabel(notification.type)}
                      </span>
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
