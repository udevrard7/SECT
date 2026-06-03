'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  Send,
  FileText,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Megaphone,
  Filter,
  Eye,
  EyeOff,
  Trash2,
  CheckCheck,
  LayoutList,
  LayoutGrid,
  Clock,
  User,
  Users,
  Loader2,
  Plus,
  Copy,
  Sparkles,
  Shield,
  Settings,
  CreditCard,
  BookOpen,
  Edit3,
  ArrowRight,
  Calendar,
  Tag,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ─── Types ───

interface DestinataireInfo {
  id: string
  name: string
  email: string
  role: string
}

interface NotificationItem {
  id: string
  type: string
  titre: string
  message: string
  destinataireId: string | null
  destinataireRole: string | null
  lu: boolean
  actionUrl: string | null
  actionLabel: string | null
  priorite: string
  categorie: string
  icone: string | null
  expireLe: string | null
  createdAt: string
  destinataire: DestinataireInfo | null
}

interface NotificationTemplate {
  id: string
  nom: string
  titre: string
  message: string
  type: string
  priorite: string
  categorie: string
  variables: string[]
}

// ─── Constants ───

const NOTIFICATION_TYPES = ['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'BROADCAST'] as const
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
const CATEGORIES = ['SYSTEME', 'ABONNEMENT', 'SECURITE', 'EVALUATION', 'COMPTE'] as const
const ROLES = ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'] as const

const TEMPLATES: NotificationTemplate[] = [
  {
    id: 'tpl-abonnement-expire',
    nom: 'Abonnement expire bientôt',
    titre: 'Votre abonnement expire le {{dateExpiration}}',
    message: 'Bonjour {{nom}}, votre abonnement {{planNom}} arrive à expiration le {{dateExpiration}}. Pensez à renouveler pour continuer à bénéficier de toutes les fonctionnalités de SECT.',
    type: 'WARNING',
    priorite: 'HAUTE',
    categorie: 'ABONNEMENT',
    variables: ['dateExpiration', 'nom', 'planNom'],
  },
  {
    id: 'tpl-resultat-disponible',
    nom: 'Résultat disponible',
    titre: 'Résultat disponible : {{epreuveTitre}}',
    message: 'Bonjour {{nom}}, les résultats de l\'épreuve "{{epreuveTitre}}" sont désormais disponibles. Consultez votre note et les commentaires de votre enseignant.',
    type: 'SUCCESS',
    priorite: 'NORMALE',
    categorie: 'EVALUATION',
    variables: ['nom', 'epreuveTitre'],
  },
  {
    id: 'tpl-alerte-securite',
    nom: 'Alerte de sécurité',
    titre: 'Alerte de sécurité détectée',
    message: 'Une activité suspecte a été détectée sur votre compte. Si vous n\'êtes pas à l\'origine de cette activité, veuillez modifier votre mot de passe immédiatement et contacter le support.',
    type: 'ERROR',
    priorite: 'URGENTE',
    categorie: 'SECURITE',
    variables: [],
  },
  {
    id: 'tpl-bienvenue',
    nom: 'Bienvenue sur SECT',
    titre: 'Bienvenue sur SECT, {{nom}} !',
    message: 'Bienvenue {{nom}} ! Votre compte a été créé avec succès. Découvrez toutes les fonctionnalités de la plateforme SECT pour gérer vos évaluations et suivre vos progrès.',
    type: 'INFO',
    priorite: 'NORMALE',
    categorie: 'COMPTE',
    variables: ['nom'],
  },
  {
    id: 'tpl-paiement-recu',
    nom: 'Paiement reçu',
    titre: 'Paiement reçu — {{montant}}',
    message: 'Nous avons bien reçu votre paiement de {{montant}} pour l\'abonnement {{planNom}}. Votre accès est maintenant actif jusqu\'au {{dateFin}}.',
    type: 'SUCCESS',
    priorite: 'NORMALE',
    categorie: 'ABONNEMENT',
    variables: ['montant', 'planNom', 'dateFin'],
  },
]

// ─── Utility Functions ───

function getTypeIcon(type: string) {
  switch (type) {
    case 'INFO':
      return <Info className="h-4 w-4" />
    case 'WARNING':
      return <AlertTriangle className="h-4 w-4" />
    case 'ERROR':
      return <XCircle className="h-4 w-4" />
    case 'SUCCESS':
      return <CheckCircle2 className="h-4 w-4" />
    case 'BROADCAST':
      return <Megaphone className="h-4 w-4" />
    default:
      return <Bell className="h-4 w-4" />
  }
}

function getTypeBadgeClasses(type: string) {
  switch (type) {
    case 'INFO':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
    case 'WARNING':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'ERROR':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
    case 'SUCCESS':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'BROADCAST':
      return 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
  }
}

function getTypeIconColor(type: string) {
  switch (type) {
    case 'INFO':
      return 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40'
    case 'WARNING':
      return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40'
    case 'ERROR':
      return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40'
    case 'SUCCESS':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40'
    case 'BROADCAST':
      return 'text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40'
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
  }
}

function getPriorityBadge(priorite: string) {
  switch (priorite) {
    case 'BASSE':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          Basse
        </Badge>
      )
    case 'NORMALE':
      return (
        <Badge className="bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
          Normale
        </Badge>
      )
    case 'HAUTE':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          Haute
        </Badge>
      )
    case 'URGENTE':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 animate-pulse">
          Urgente
        </Badge>
      )
    default:
      return <Badge variant="outline">{priorite}</Badge>
  }
}

function getCategoryLabel(categorie: string) {
  switch (categorie) {
    case 'SYSTEME':
      return 'Système'
    case 'ABONNEMENT':
      return 'Abonnement'
    case 'SECURITE':
      return 'Sécurité'
    case 'EVALUATION':
      return 'Évaluation'
    case 'COMPTE':
      return 'Compte'
    default:
      return categorie
  }
}

function getCategoryIcon(categorie: string) {
  switch (categorie) {
    case 'SYSTEME':
      return <Settings className="h-3.5 w-3.5" />
    case 'ABONNEMENT':
      return <CreditCard className="h-3.5 w-3.5" />
    case 'SECURITE':
      return <Shield className="h-3.5 w-3.5" />
    case 'EVALUATION':
      return <BookOpen className="h-3.5 w-3.5" />
    case 'COMPTE':
      return <User className="h-3.5 w-3.5" />
    default:
      return <Tag className="h-3.5 w-3.5" />
  }
}

function getRoleLabel(role: string | null) {
  if (!role) return 'Tous'
  switch (role) {
    case 'ADMIN':
      return 'Administrateurs'
    case 'RESPONSABLE':
      return 'Responsables'
    case 'ENSEIGNANT':
      return 'Enseignants'
    case 'ETUDIANT':
      return 'Étudiants'
    default:
      return role
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(dateStr: string) {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'À l\'instant'
  if (minutes < 60) return `Il y a ${minutes} min`
  if (hours < 24) return `Il y a ${hours}h`
  if (days < 7) return `Il y a ${days}j`
  return formatDateTime(dateStr)
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// ─── Main Component ───

export function NotificationsAdminPage() {
  const { user } = useAuthStore()

  // ─── Data state ───
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [filterType, setFilterType] = useState('all')
  const [filterLu, setFilterLu] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterCategorie, setFilterCategorie] = useState('all')

  // ─── View state ───
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // ─── Tab state ───
  const [activeTab, setActiveTab] = useState('notifications')

  // ─── Broadcast form state ───
  const [formTitre, setFormTitre] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formType, setFormType] = useState('BROADCAST')
  const [formPriorite, setFormPriorite] = useState('NORMALE')
  const [formCategorie, setFormCategorie] = useState('SYSTEME')
  const [formDestinataireRole, setFormDestinataireRole] = useState('')
  const [formExpireLe, setFormExpireLe] = useState('')
  const [formActionUrl, setFormActionUrl] = useState('')
  const [formActionLabel, setFormActionLabel] = useState('')
  const [formIcone, setFormIcone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Template dialog state ───
  const [editTemplateOpen, setEditTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null)
  const [templateFormNom, setTemplateFormNom] = useState('')
  const [templateFormTitre, setTemplateFormTitre] = useState('')
  const [templateFormMessage, setTemplateFormMessage] = useState('')
  const [templateFormType, setTemplateFormType] = useState('INFO')
  const [templateFormPriorite, setTemplateFormPriorite] = useState('NORMALE')
  const [templateFormCategorie, setTemplateFormCategorie] = useState('SYSTEME')
  const [templates, setTemplates] = useState<NotificationTemplate[]>([...TEMPLATES])

  // ─── Delete confirmation state ───
  const [deleteTarget, setDeleteTarget] = useState<NotificationItem | null>(null)
  const [deleteAllReadOpen, setDeleteAllReadOpen] = useState(false)

  // ─── Stats ───
  const broadcastCount = notifications.filter((n) => n.type === 'BROADCAST').length
  const todayNotifications = notifications.filter((n) => {
    const today = new Date()
    const created = new Date(n.createdAt)
    return (
      created.getDate() === today.getDate() &&
      created.getMonth() === today.getMonth() &&
      created.getFullYear() === today.getFullYear()
    )
  }).length
  const readCount = notifications.filter((n) => n.lu).length
  const readRate = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0

  // ─── Fetch notifications ───
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') params.set('type', filterType)
      if (filterLu !== 'all') params.set('lu', filterLu === 'lues' ? 'true' : 'false')
      if (filterRole !== 'all') params.set('destinataireRole', filterRole)
      if (filterCategorie !== 'all') params.set('categorie', filterCategorie)

      const res = await fetch(`/api/notifications/admin?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setTotalCount(data.total ?? 0)
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [filterType, filterLu, filterRole, filterCategorie])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // ─── Toggle message expand ───
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ─── Mark as read/unread ───
  const handleToggleRead = async (notification: NotificationItem) => {
    const action = notification.lu ? 'marquer_non_lu' : 'marquer_lu'
    try {
      const res = await fetch(`/api/notifications/admin/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(notification.lu ? 'Marquée comme non lue' : 'Marquée comme lue', {
        description: notification.titre,
      })
      await fetchNotifications()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Mark all as read ───
  const handleMarkAllRead = async () => {
    try {
      const params = new URLSearchParams({ markAllRead: 'true' })
      if (filterType !== 'all') params.set('type', filterType)
      if (filterRole !== 'all') params.set('destinataireRole', filterRole)
      if (filterCategorie !== 'all') params.set('categorie', filterCategorie)

      const res = await fetch(`/api/notifications/admin?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur')
      toast.success('Toutes marquées comme lues', {
        description: `${unreadCount} notification${unreadCount > 1 ? 's' : ''} mise${unreadCount > 1 ? 's' : ''} à jour.`,
      })
      await fetchNotifications()
    } catch {
      toast.error('Erreur', { description: 'Impossible de tout marquer comme lu.' })
    }
  }

  // ─── Delete single notification ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/notifications/admin/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Notification supprimée', {
        description: deleteTarget.titre,
      })
      setDeleteTarget(null)
      await fetchNotifications()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer la notification.' })
    }
  }

  // ─── Delete all read ───
  const handleDeleteAllRead = async () => {
    try {
      const readNotifications = notifications.filter((n) => n.lu)
      await Promise.all(
        readNotifications.map((n) =>
          fetch(`/api/notifications/admin/${n.id}`, { method: 'DELETE' })
        )
      )
      toast.success('Notifications lues supprimées', {
        description: `${readNotifications.length} notification${readNotifications.length > 1 ? 's' : ''} supprimée${readNotifications.length > 1 ? 's' : ''}.`,
      })
      setDeleteAllReadOpen(false)
      await fetchNotifications()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer les notifications.' })
    }
  }

  // ─── Broadcast notification ───
  const handleBroadcast = async () => {
    if (!formTitre || !formMessage) {
      toast.error('Champs manquants', {
        description: 'Le titre et le message sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        titre: formTitre,
        message: formMessage,
        type: formType,
        priorite: formPriorite,
        categorie: formCategorie,
      }

      if (formDestinataireRole) {
        body.destinataireRole = formDestinataireRole
      }
      if (formExpireLe) {
        body.expireLe = formExpireLe
      }
      if (formActionUrl) {
        body.actionUrl = formActionUrl
        body.actionLabel = formActionLabel || 'Voir'
      }
      if (formIcone) {
        body.icone = formIcone
      }

      const res = await fetch('/api/notifications/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la diffusion')
      }

      toast.success('Notification diffusée', {
        description: `"${formTitre}" a été envoyée avec succès.`,
      })

      // Reset form
      setFormTitre('')
      setFormMessage('')
      setFormType('BROADCAST')
      setFormPriorite('NORMALE')
      setFormCategorie('SYSTEME')
      setFormDestinataireRole('')
      setFormExpireLe('')
      setFormActionUrl('')
      setFormActionLabel('')
      setFormIcone('')

      await fetchNotifications()
      setActiveTab('notifications')
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Use template ───
  const handleUseTemplate = (template: NotificationTemplate) => {
    setFormTitre(template.titre)
    setFormMessage(template.message)
    setFormType(template.type)
    setFormPriorite(template.priorite)
    setFormCategorie(template.categorie)
    setFormDestinataireRole('')
    setFormExpireLe('')
    setFormActionUrl('')
    setFormActionLabel('')
    setFormIcone('')
    setActiveTab('diffuser')
    toast.info('Modèle appliqué', {
      description: `Le modèle "${template.nom}" a été pré-rempli.`,
    })
  }

  // ─── Open edit template dialog ───
  const handleOpenEditTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template)
    setTemplateFormNom(template.nom)
    setTemplateFormTitre(template.titre)
    setTemplateFormMessage(template.message)
    setTemplateFormType(template.type)
    setTemplateFormPriorite(template.priorite)
    setTemplateFormCategorie(template.categorie)
    setEditTemplateOpen(true)
  }

  // ─── Save edited template ───
  const handleSaveTemplate = () => {
    if (!editingTemplate || !templateFormNom || !templateFormTitre || !templateFormMessage) {
      toast.error('Champs manquants', {
        description: 'Le nom, le titre et le message sont obligatoires.',
      })
      return
    }

    setTemplates((prev) =>
      prev.map((t) =>
        t.id === editingTemplate.id
          ? {
              ...t,
              nom: templateFormNom,
              titre: templateFormTitre,
              message: templateFormMessage,
              type: templateFormType,
              priorite: templateFormPriorite,
              categorie: templateFormCategorie,
              variables: extractVariables(templateFormMessage),
            }
          : t
      )
    )

    toast.success('Modèle mis à jour', {
      description: `"${templateFormNom}" a été modifié.`,
    })
    setEditTemplateOpen(false)
  }

  // ─── Extract {{variables}} from message ───
  const extractVariables = (message: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g
    const vars: string[] = []
    let match
    while ((match = regex.exec(message)) !== null) {
      if (!vars.includes(match[1])) {
        vars.push(match[1])
      }
    }
    return vars
  }

  // ─── Broadcast stats from recent broadcasts ───
  const recentBroadcasts = notifications.filter((n) => n.type === 'BROADCAST').slice(0, 10)

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Bell className="h-7 w-7 text-emerald-600" />
            Centre de Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les notifications et diffusions de la plateforme
          </p>
        </div>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <EyeOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Non lues</p>
              <p className="text-xl font-bold">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <Megaphone className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diffusions envoyées</p>
              <p className="text-xl font-bold">{broadcastCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <CheckCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux de lecture</p>
              <p className="text-xl font-bold">{readRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/40">
              <Clock className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aujourd&apos;hui</p>
              <p className="text-xl font-bold">{todayNotifications}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Content Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="diffuser" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Diffuser
          </TabsTrigger>
          <TabsTrigger value="modeles" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Modèles
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Notifications ─── */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Filter toolbar */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              {/* Type filter */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {NOTIFICATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === 'INFO' ? 'Info' : t === 'WARNING' ? 'Avertissement' : t === 'ERROR' ? 'Erreur' : t === 'SUCCESS' ? 'Succès' : 'Diffusion'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Read status filter */}
              <Select value={filterLu} onValueChange={setFilterLu}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="non-lues">Non lues</SelectItem>
                  <SelectItem value="lues">Lues</SelectItem>
                </SelectContent>
              </Select>

              {/* Role filter */}
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Users className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Destinataire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {getRoleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Category filter */}
              <Select value={filterCategorie} onValueChange={setFilterCategorie}>
                <SelectTrigger className="w-full sm:w-[170px]">
                  <Tag className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {getCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1" />

              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('card')}
                  title="Vue cartes"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('list')}
                  title="Vue liste"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck className="h-4 w-4" />
                Tout marquer comme lu
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                onClick={() => setDeleteAllReadOpen(true)}
                disabled={notifications.filter((n) => n.lu).length === 0}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer les lues
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {totalCount} notification{totalCount > 1 ? 's' : ''}
                {unreadCount > 0 && ` — ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <Bell className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune notification</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Aucune notification ne correspond à vos filtres. Essayez de modifier les critères ou créez une nouvelle diffusion.
              </p>
              <Button
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setActiveTab('diffuser')}
              >
                <Send className="h-4 w-4" />
                Créer une diffusion
              </Button>
            </div>
          )}

          {/* Card view */}
          {!isLoading && notifications.length > 0 && viewMode === 'card' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {notifications.map((notif) => {
                const isExpanded = expandedIds.has(notif.id)
                const isLong = notif.message.length > 150
                return (
                  <Card
                    key={notif.id}
                    className={`transition-all hover:shadow-md cursor-pointer group ${
                      !notif.lu
                        ? 'border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10'
                        : 'border-l-4 border-l-transparent'
                    }`}
                    onClick={() => {
                      if (!notif.lu) handleToggleRead(notif)
                      if (notif.actionUrl) {
                        // Navigate if actionUrl exists
                        // In this SPA, we don't navigate away
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Type icon */}
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getTypeIconColor(notif.type)}`}>
                          {getTypeIcon(notif.type)}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Title row */}
                          <div className="flex items-start gap-2">
                            <h4 className="font-semibold text-sm leading-tight flex-1">
                              {!notif.lu && (
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5 mt-1.5 float-left" />
                              )}
                              {notif.titre}
                            </h4>
                            <div className="flex items-center gap-1 shrink-0">
                              {getPriorityBadge(notif.priorite)}
                            </div>
                          </div>

                          {/* Type & Category badges */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 ${getTypeBadgeClasses(notif.type)}`}>
                              {notif.type}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {getCategoryIcon(notif.categorie)}
                              <span className="ml-0.5">{getCategoryLabel(notif.categorie)}</span>
                            </Badge>
                            {notif.destinataireRole && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                <Users className="h-2.5 w-2.5 mr-0.5" />
                                {getRoleLabel(notif.destinataireRole)}
                              </Badge>
                            )}
                          </div>

                          {/* Message */}
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {isExpanded || !isLong ? notif.message : truncateText(notif.message, 150)}
                            {isLong && (
                              <button
                                className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleExpand(notif.id)
                                }}
                              >
                                {isExpanded ? 'Voir moins' : 'Voir plus'}
                              </button>
                            )}
                          </p>

                          {/* Action button */}
                          {notif.actionUrl && notif.actionLabel && (
                            <div className="pt-1">
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-emerald-600 dark:text-emerald-400"
                                onClick={(e) => {
                                  e.stopPropagation()
                                }}
                              >
                                {notif.actionLabel}
                                <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(notif.createdAt)}
                              </span>
                              {notif.destinataire && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {notif.destinataire.name}
                                </span>
                              )}
                              {notif.expireLe && (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                  <Calendar className="h-3 w-3" />
                                  Expire {formatDate(notif.expireLe)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleRead(notif)
                                }}
                                title={notif.lu ? 'Marquer non lue' : 'Marquer lue'}
                              >
                                {notif.lu ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteTarget(notif)
                                }}
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* List view */}
          {!isLoading && notifications.length > 0 && viewMode === 'list' && (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Type</TableHead>
                      <TableHead>Titre</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Destinataire</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((notif) => (
                      <TableRow
                        key={notif.id}
                        className={`group cursor-pointer ${
                          !notif.lu ? 'bg-emerald-50/50 dark:bg-emerald-950/10 font-medium' : ''
                        }`}
                        onClick={() => {
                          if (!notif.lu) handleToggleRead(notif)
                        }}
                      >
                        <TableCell>
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${getTypeIconColor(notif.type)}`}>
                            {getTypeIcon(notif.type)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${getTypeBadgeClasses(notif.type)}`}>
                            {notif.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[250px]">
                            <p className="text-sm font-medium truncate">{notif.titre}</p>
                            <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getPriorityBadge(notif.priorite)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs">
                            {getCategoryIcon(notif.categorie)}
                            {getCategoryLabel(notif.categorie)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {notif.destinataire
                              ? notif.destinataire.name
                              : notif.destinataireRole
                              ? getRoleLabel(notif.destinataireRole)
                              : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeTime(notif.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleRead(notif)
                              }}
                              title={notif.lu ? 'Marquer non lue' : 'Marquer lue'}
                            >
                              {notif.lu ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(notif)
                              }}
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

        {/* ─── Tab 2: Diffuser (Broadcast) ─── */}
        <TabsContent value="diffuser" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="h-5 w-5 text-emerald-600" />
                  Nouvelle diffusion
                </CardTitle>
                <CardDescription>
                  Créez et envoyez une notification à vos utilisateurs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Titre */}
                <div className="space-y-2">
                  <Label htmlFor="notif-titre">Titre *</Label>
                  <Input
                    id="notif-titre"
                    placeholder="Titre de la notification"
                    value={formTitre}
                    onChange={(e) => setFormTitre(e.target.value)}
                  />
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="notif-message">Message *</Label>
                  <Textarea
                    id="notif-message"
                    placeholder="Contenu de la notification. Utilisez {{variable}} pour les modèles dynamiques."
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    rows={5}
                    className="resize-y"
                  />
                  {formMessage.includes('{{') && (
                    <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Variables détectées : {extractVariables(formMessage).map((v) => `{{${v}}}`).join(', ')}
                    </p>
                  )}
                </div>

                {/* Type & Priorité */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTIFICATION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            <span className="flex items-center gap-1.5">
                              {getTypeIcon(t)}
                              {t === 'INFO' ? 'Info' : t === 'WARNING' ? 'Avertissement' : t === 'ERROR' ? 'Erreur' : t === 'SUCCESS' ? 'Succès' : 'Diffusion'}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priorité</Label>
                    <Select value={formPriorite} onValueChange={setFormPriorite}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p === 'BASSE' ? 'Basse' : p === 'NORMALE' ? 'Normale' : p === 'HAUTE' ? 'Haute' : 'Urgente'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Catégorie & Destinataire */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Catégorie</Label>
                    <Select value={formCategorie} onValueChange={setFormCategorie}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {getCategoryLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Destinataires</Label>
                    <Select value={formDestinataireRole} onValueChange={setFormDestinataireRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tous les rôles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les rôles</SelectItem>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {getRoleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Expiration */}
                <div className="space-y-2">
                  <Label htmlFor="notif-expire">Date d&apos;expiration</Label>
                  <Input
                    id="notif-expire"
                    type="datetime-local"
                    value={formExpireLe}
                    onChange={(e) => setFormExpireLe(e.target.value)}
                  />
                </div>

                <Separator />

                {/* Action URL & Label */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Action (optionnel)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="notif-action-url">URL de l&apos;action</Label>
                      <Input
                        id="notif-action-url"
                        placeholder="/page-cible"
                        value={formActionUrl}
                        onChange={(e) => setFormActionUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notif-action-label">Libellé du bouton</Label>
                      <Input
                        id="notif-action-label"
                        placeholder="Voir les détails"
                        value={formActionLabel}
                        onChange={(e) => setFormActionLabel(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Icon */}
                <div className="space-y-2">
                  <Label htmlFor="notif-icone">Icône (optionnel)</Label>
                  <Input
                    id="notif-icone"
                    placeholder="Nom de l'icône Lucide (ex: Bell, AlertTriangle)"
                    value={formIcone}
                    onChange={(e) => setFormIcone(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFormTitre('')
                    setFormMessage('')
                    setFormType('BROADCAST')
                    setFormPriorite('NORMALE')
                    setFormCategorie('SYSTEME')
                    setFormDestinataireRole('')
                    setFormExpireLe('')
                    setFormActionUrl('')
                    setFormActionLabel('')
                    setFormIcone('')
                  }}
                >
                  Réinitialiser
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleBroadcast}
                  disabled={isSubmitting || !formTitre || !formMessage}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSubmitting ? 'Envoi en cours...' : 'Diffuser'}
                </Button>
              </CardFooter>
            </Card>

            {/* Preview */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Eye className="h-5 w-5 text-teal-600" />
                    Aperçu
                  </CardTitle>
                  <CardDescription>
                    Aperçu en temps réel de la notification
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getTypeIconColor(formType)}`}>
                        {getTypeIcon(formType)}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          {formTitre ? (
                            <h4 className="font-semibold text-sm">{formTitre}</h4>
                          ) : (
                            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                          )}
                          {getPriorityBadge(formPriorite)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${getTypeBadgeClasses(formType)}`}>
                            {formType}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {getCategoryIcon(formCategorie)}
                            <span className="ml-0.5">{getCategoryLabel(formCategorie)}</span>
                          </Badge>
                          {formDestinataireRole && formDestinataireRole !== 'all' && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              <Users className="h-2.5 w-2.5 mr-0.5" />
                              {getRoleLabel(formDestinataireRole)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {formMessage || 'Le contenu de votre notification apparaîtra ici...'}
                        </p>
                        {formActionUrl && formActionLabel && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-emerald-600 dark:text-emerald-400"
                          >
                            {formActionLabel}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          À l&apos;instant
                          {formExpireLe && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">
                              · Expire {formatDate(formExpireLe)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent broadcasts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Megaphone className="h-5 w-5 text-teal-600" />
                    Diffusions récentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recentBroadcasts.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Aucune diffusion envoyée pour le moment.
                    </div>
                  ) : (
                    <ScrollArea className="max-h-80">
                      <div className="space-y-3">
                        {recentBroadcasts.map((broadcast) => (
                          <div
                            key={broadcast.id}
                            className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getTypeIconColor(broadcast.type)}`}>
                              <Megaphone className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate">{broadcast.titre}</p>
                                {getPriorityBadge(broadcast.priorite)}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {broadcast.message}
                              </p>
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {broadcast.destinataireRole ? getRoleLabel(broadcast.destinataireRole) : 'Tous'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatRelativeTime(broadcast.createdAt)}
                                </span>
                                <span className="flex items-center gap-1">
                                  {broadcast.lu ? (
                                    <Eye className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <EyeOff className="h-3 w-3 text-amber-500" />
                                  )}
                                  {broadcast.lu ? 'Lue' : 'Non lue'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── Tab 3: Modèles (Templates) ─── */}
        <TabsContent value="modeles" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className="transition-shadow hover:shadow-md flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getTypeIconColor(template.type)}`}>
                        {getTypeIcon(template.type)}
                      </div>
                      {template.nom}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1">
                  {/* Template titre */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Titre</p>
                    <p className="text-sm font-medium">{template.titre}</p>
                  </div>

                  {/* Template message */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Message</p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {template.message}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={`text-[10px] px-1.5 py-0 ${getTypeBadgeClasses(template.type)}`}>
                      {template.type}
                    </Badge>
                    {getPriorityBadge(template.priorite)}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {getCategoryIcon(template.categorie)}
                      <span className="ml-0.5">{getCategoryLabel(template.categorie)}</span>
                    </Badge>
                  </div>

                  {/* Variables */}
                  {template.variables.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Sparkles className="h-3 w-3 text-teal-500" />
                      {template.variables.map((v) => (
                        <code key={v} className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex items-center gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Utiliser
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenEditTemplate(template)}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Create custom template hint */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
              <Plus className="h-7 w-7 text-teal-500 dark:text-teal-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold">Besoin d&apos;un nouveau modèle ?</h3>
            <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">
              Créez une diffusion et réutilisez-la comme modèle pour vos futures notifications.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
              onClick={() => setActiveTab('diffuser')}
            >
              <Send className="h-3.5 w-3.5" />
              Créer une diffusion
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la notification</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la notification &ldquo;{deleteTarget?.titre}&rdquo; ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete All Read Confirmation Dialog ─── */}
      <AlertDialog open={deleteAllReadOpen} onOpenChange={setDeleteAllReadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer toutes les notifications lues</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer toutes les notifications marquées comme lues ? Cette action est irréversible et supprimera {notifications.filter((n) => n.lu).length} notification{notifications.filter((n) => n.lu).length > 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteAllReadOpen(false)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteAllRead}
            >
              Supprimer tout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Edit Template Dialog ─── */}
      <Dialog open={editTemplateOpen} onOpenChange={setEditTemplateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-emerald-600" />
              Modifier le modèle
            </DialogTitle>
            <DialogDescription>
              Modifiez les champs du modèle de notification. Les variables sont entre double accolades.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="tpl-nom">Nom du modèle</Label>
              <Input
                id="tpl-nom"
                value={templateFormNom}
                onChange={(e) => setTemplateFormNom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-titre">Titre</Label>
              <Input
                id="tpl-titre"
                value={templateFormTitre}
                onChange={(e) => setTemplateFormTitre(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-message">Message</Label>
              <Textarea
                id="tpl-message"
                value={templateFormMessage}
                onChange={(e) => setTemplateFormMessage(e.target.value)}
                rows={5}
                className="resize-y"
              />
              {templateFormMessage.includes('{{') && (
                <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Variables : {extractVariables(templateFormMessage).map((v) => `{{${v}}}`).join(', ')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={templateFormType} onValueChange={setTemplateFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select value={templateFormPriorite} onValueChange={setTemplateFormPriorite}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p === 'BASSE' ? 'Basse' : p === 'NORMALE' ? 'Normale' : p === 'HAUTE' ? 'Haute' : 'Urgente'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={templateFormCategorie} onValueChange={setTemplateFormCategorie}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {getCategoryLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setEditTemplateOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSaveTemplate}
              disabled={!templateFormNom || !templateFormTitre || !templateFormMessage}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
