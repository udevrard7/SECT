'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  AlertTriangle,
  Info,
  Search,
  Filter,
  CheckCheck,
  CheckCircle2,
  Eye,
  Plus,
  Loader2,
  X,
  Shield,
  Clock,
  GraduationCap,
  ClipboardList,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { PulseSkeleton } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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

interface FiliereOption {
  id: string
  nom: string
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
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return <AlertTriangle className="h-5 w-5 text-destructive" />
    case 'WARNING':
      return <AlertTriangle className="h-5 w-5 text-warning" />
    case 'INFO':
      return <Info className="h-5 w-5 text-info" />
    default:
      return <Info className="h-5 w-5 text-muted-foreground" />
  }
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">Critique</Badge>
    case 'WARNING':
      return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">Attention</Badge>
    case 'INFO':
      return <Badge className="bg-info/15 text-info border-info/30 text-xs">Info</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{severity}</Badge>
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'PERFORMANCE':
      return <Badge className="bg-success/15 text-success-text border-success/30 text-xs">Performance</Badge>
    case 'FRAUDE':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">Fraude</Badge>
    case 'SYSTEME':
      return <Badge className="bg-muted text-muted-foreground border-border text-xs">Système</Badge>
    case 'RAPPEL':
      return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">Rappel</Badge>
    case 'CUSTOM':
      return <Badge className="bg-primary/15 text-primary-text border-primary/30 text-xs">Personnalisée</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>
  }
}

function getSeverityBorderColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'border-l-destructive'
    case 'WARNING': return 'border-l-warning'
    case 'INFO': return 'border-l-info'
    default: return 'border-l-border'
  }
}

// ─── Generate dynamic alerts from stats as fallback ───

function generateDynamicAlerts(stats: Record<string, unknown>): AlerteItem[] {
  const alerts: AlerteItem[] = []
  const now = new Date()

  // Low average score = PERFORMANCE alert
  const moyenne = stats.moyenneGenerale as number ?? 0
  if (moyenne > 0 && moyenne < 10) {
    alerts.push({
      id: 'dyn-perf-1',
      titre: 'Moyenne générale inférieure à 10/20',
      description: `La moyenne générale est de ${moyenne}/20. Une attention particulière est requise pour améliorer les résultats.`,
      severity: moyenne < 8 ? 'CRITICAL' : 'WARNING',
      type: 'PERFORMANCE',
      lue: false,
      resolu: false,
      filiereId: null,
      epreuveId: null,
      userId: null,
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - 3600000).toISOString(),
      filiere: null,
      epreuve: null,
      user: null,
    })
  }

  // Stats alertes from API
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
      id: `dyn-stats-${i}`,
      titre: a.titre,
      description: a.description,
      severity,
      type,
      lue: false,
      resolu: false,
      filiereId: null,
      epreuveId: null,
      userId: null,
      createdAt: new Date(now.getTime() - (i + 1) * 7200000).toISOString(),
      updatedAt: new Date(now.getTime() - (i + 1) * 7200000).toISOString(),
      filiere: null,
      epreuve: null,
      user: null,
    })
  })

  // Upcoming exams = RAPPEL alert
  const nbEval = stats.nbEvaluations as number ?? 0
  if (nbEval > 0) {
    alerts.push({
      id: 'dyn-rappel-1',
      titre: 'Évaluations programmées',
      description: `${nbEval} évaluation(s) sont programmées. Vérifiez les dates et la préparation des étudiants.`,
      severity: 'INFO',
      type: 'RAPPEL',
      lue: false,
      resolu: false,
      filiereId: null,
      epreuveId: null,
      userId: null,
      createdAt: new Date(now.getTime() - 1800000).toISOString(),
      updatedAt: new Date(now.getTime() - 1800000).toISOString(),
      filiere: null,
      epreuve: null,
      user: null,
    })
  }

  // System info
  alerts.push({
    id: 'dyn-sys-1',
    titre: 'Rapport hebdomadaire disponible',
    description: 'Le rapport statistique de la semaine est prêt. Consultez la section Rapports pour plus de détails.',
    severity: 'INFO',
    type: 'SYSTEME',
    lue: true,
    resolu: false,
    filiereId: null,
    epreuveId: null,
    userId: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
    updatedAt: new Date(now.getTime() - 86400000).toISOString(),
    filiere: null,
    epreuve: null,
    user: null,
  })

  return alerts
}

// ─── Main Component ───

export function AlertesPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [lueFilter, setLueFilter] = useState('all')

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Detail sheet state ───
  const [selectedAlerte, setSelectedAlerte] = useState<AlerteItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // ─── Form state ───
  const [formTitre, setFormTitre] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSeverity, setFormSeverity] = useState('INFO')
  const [formType, setFormType] = useState('CUSTOM')
  const [formFiliereId, setFormFiliereId] = useState('')

  // ─── Bulk action loading ───
  const [bulkLoading, setBulkLoading] = useState(false)

  // ─── Query keys (stables pour setQueryData optimiste) ───
  const alertesQueryKey = ['alertes', user?.id, search, severityFilter, typeFilter, lueFilter] as const
  const filieresQueryKey = ['alertes-filieres', user?.id] as const

  // ─── Fetch alertes (TanStack Query) ───
  // BUGFIX (QUERY-CACHE-2) : migration de useEffect+fetch vers TanStack Query.
  // Le queryKey inclut les filtres car l'API les prend en query params → refetch
  // automatique. La logique de fallback (stats dynamiques) est conservée dans
  // le queryFn ; isUsingFallback est dérivé du résultat.
  const alertesQuery = useQuery<{ alertes: AlerteItem[]; isUsingFallback: boolean }>({
    queryKey: alertesQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (severityFilter && severityFilter !== 'all') params.set('severity', severityFilter)
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      if (lueFilter === 'true') params.set('lue', 'true')
      else if (lueFilter === 'false') params.set('lue', 'false')

      const loadFallback = async (): Promise<{ alertes: AlerteItem[]; isUsingFallback: boolean }> => {
        try {
          const filiereParam = user?.filiereId || ''
          const res = await fetch(`/api/stats/responsable${filiereParam ? `?filiereId=${filiereParam}` : ''}`)
          if (res.ok) {
            const stats = await res.json()
            const dynamicAlerts = generateDynamicAlerts(stats)
            return { alertes: dynamicAlerts, isUsingFallback: true }
          }
          return { alertes: [], isUsingFallback: true }
        } catch {
          return { alertes: [], isUsingFallback: true }
        }
      }

      try {
        const res = await fetch(`/api/alertes?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          const items = data.alertes ?? []
          if (items.length > 0 || data.total > 0) {
            return { alertes: items, isUsingFallback: false }
          }
          return await loadFallback()
        }
        return await loadFallback()
      } catch {
        return await loadFallback()
      }
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Fetch filieres (TanStack Query) ───
  const filieresQuery = useQuery<{ filieres: FiliereOption[] }>({
    queryKey: filieresQueryKey,
    queryFn: async () => {
      const res = await fetch('/api/filieres')
      if (!res.ok) throw new Error('Failed to fetch filieres')
      const data = await res.json()
      return { filieres: (data.filieres ?? []).map((f: { id: string; nom: string }) => ({ id: f.id, nom: f.nom })) }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const alertes = alertesQuery.data?.alertes ?? []
  const isUsingFallback = alertesQuery.data?.isUsingFallback ?? false
  const isLoading = alertesQuery.isLoading
  const filieres = filieresQuery.data?.filieres ?? []
  const refreshAlertes = () => queryClient.invalidateQueries({ queryKey: ['alertes', user?.id] })

  // Helper pour update optimiste du cache alertes (préserve les setAlertes originaux)
  const updateAlertesCache = (updater: (prev: AlerteItem[]) => AlerteItem[]) => {
    queryClient.setQueryData<{ alertes: AlerteItem[]; isUsingFallback: boolean }>(
      alertesQueryKey,
      (old) => ({
        alertes: updater(old?.alertes ?? []),
        isUsingFallback: old?.isUsingFallback ?? false,
      }),
    )
  }

  // ─── Computed stats ───
  const totalCount = alertes.length
  const nonLuesCount = alertes.filter((a) => !a.lue).length
  const critiquesCount = alertes.filter((a) => a.severity === 'CRITICAL' && !a.resolu).length

  // ─── Filtered alertes ───
  const filteredAlertes = alertes.filter((a) => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (lueFilter === 'true' && !a.lue) return false
    if (lueFilter === 'false' && a.lue) return false
    if (search) {
      const s = search.toLowerCase()
      return a.titre.toLowerCase().includes(s) || a.description.toLowerCase().includes(s)
    }
    return true
  })

  // ─── Mark as read ───
  const handleMarkAsRead = async (alerte: AlerteItem) => {
    if (isUsingFallback) {
      updateAlertesCache((prev) => prev.map((a) => a.id === alerte.id ? { ...a, lue: true } : a))
      toast.success('Alerte marquée comme lue')
      return
    }
    try {
      const res = await fetch(`/api/alertes/${alerte.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lue: true }),
      })
      if (!res.ok) throw new Error('Erreur')
      updateAlertesCache((prev) => prev.map((a) => a.id === alerte.id ? { ...a, lue: true } : a))
      toast.success('Alerte marquée comme lue')
    } catch {
      toast.error('Erreur', { description: 'Impossible de marquer l\'alerte comme lue.' })
    }
  }

  // ─── Mark as resolved ───
  const handleMarkAsResolved = async (alerte: AlerteItem) => {
    if (isUsingFallback) {
      updateAlertesCache((prev) => prev.map((a) => a.id === alerte.id ? { ...a, resolu: true, lue: true } : a))
      toast.success('Alerte résolue')
      return
    }
    try {
      const res = await fetch(`/api/alertes/${alerte.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolu: true, lue: true }),
      })
      if (!res.ok) throw new Error('Erreur')
      updateAlertesCache((prev) => prev.map((a) => a.id === alerte.id ? { ...a, resolu: true, lue: true } : a))
      toast.success('Alerte résolue')
    } catch {
      toast.error('Erreur', { description: 'Impossible de résoudre l\'alerte.' })
    }
  }

  // ─── Mark all as read ───
  const handleMarkAllAsRead = async () => {
    setBulkLoading(true)
    try {
      if (isUsingFallback) {
        updateAlertesCache((prev) => prev.map((a) => ({ ...a, lue: true })))
        toast.success('Toutes les alertes marquées comme lues')
        return
      }
      const unreadAlertes = alertes.filter((a) => !a.lue)
      await Promise.all(
        unreadAlertes.map((a) =>
          fetch(`/api/alertes/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lue: true }),
          })
        )
      )
      updateAlertesCache((prev) => prev.map((a) => ({ ...a, lue: true })))
      toast.success('Toutes les alertes marquées comme lues')
    } catch {
      toast.error('Erreur', { description: 'Impossible de marquer toutes les alertes comme lues.' })
    } finally {
      setBulkLoading(false)
    }
  }

  // ─── Mark all as resolved ───
  const handleMarkAllAsResolved = async () => {
    setBulkLoading(true)
    try {
      if (isUsingFallback) {
        updateAlertesCache((prev) => prev.map((a) => ({ ...a, resolu: true, lue: true })))
        toast.success('Toutes les alertes résolues')
        return
      }
      const unresolvedAlertes = alertes.filter((a) => !a.resolu)
      await Promise.all(
        unresolvedAlertes.map((a) =>
          fetch(`/api/alertes/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolu: true, lue: true }),
          })
        )
      )
      updateAlertesCache((prev) => prev.map((a) => ({ ...a, resolu: true, lue: true })))
      toast.success('Toutes les alertes résolues')
    } catch {
      toast.error('Erreur', { description: 'Impossible de résoudre toutes les alertes.' })
    } finally {
      setBulkLoading(false)
    }
  }

  // ─── View details ───
  const handleViewDetail = (alerte: AlerteItem) => {
    setSelectedAlerte(alerte)
    setDetailOpen(true)
    if (!alerte.lue) {
      handleMarkAsRead(alerte)
    }
  }

  // ─── Create alert ───
  const handleCreateAlerte = async () => {
    if (!formTitre || !formDescription) {
      toast.error('Champs manquants', { description: 'Le titre et la description sont obligatoires.' })
      return
    }

    setIsSubmitting(true)
    try {
      if (isUsingFallback) {
        const newAlerte: AlerteItem = {
          id: `custom-${Date.now()}`,
          titre: formTitre,
          description: formDescription,
          severity: formSeverity as AlerteItem['severity'],
          type: formType as AlerteItem['type'],
          lue: false,
          resolu: false,
          filiereId: formFiliereId || null,
          epreuveId: null,
          userId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          filiere: formFiliereId ? filieres.find((f) => f.id === formFiliereId) ?? null : null,
          epreuve: null,
          user: null,
        }
        updateAlertesCache((prev) => [newAlerte, ...prev])
        toast.success('Alerte créée')
      } else {
        const res = await fetch('/api/alertes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titre: formTitre,
            description: formDescription,
            severity: formSeverity,
            type: formType,
            filiereId: formFiliereId || null,
          }),
        })
        if (!res.ok) throw new Error('Erreur')
        toast.success('Alerte créée')
        await refreshAlertes()
      }
      setCreateDialogOpen(false)
      resetForm()
    } catch {
      toast.error('Erreur', { description: 'Impossible de créer l\'alerte.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormTitre('')
    setFormDescription('')
    setFormSeverity('INFO')
    setFormType('CUSTOM')
    setFormFiliereId('')
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Bell className="h-7 w-7 text-success-text" />
            Alertes et Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivez les alertes importantes de vos filières
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={bulkLoading || nonLuesCount === 0}
            className="border-success/40 text-success-text hover:bg-success/10"
          >
            {bulkLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1" />}
            Tout marquer comme lu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsResolved}
            disabled={bulkLoading}
            className="border-info/40 text-info hover:bg-info/10"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Tout résoudre
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm()
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle alerte
          </Button>
        </div>
      </div>

      {/* ─── Stats cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <Bell className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total alertes</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
              <Eye className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Non lues</p>
              <p className="text-xl font-bold font-mono tabular-nums">{nonLuesCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/15">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Critiques</p>
              <p className="text-xl font-bold font-mono tabular-nums">{critiquesCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filter toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une alerte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Sévérité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="CRITICAL">Critique</SelectItem>
              <SelectItem value="WARNING">Attention</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="PERFORMANCE">Performance</SelectItem>
              <SelectItem value="FRAUDE">Fraude</SelectItem>
              <SelectItem value="SYSTEME">Système</SelectItem>
              <SelectItem value="RAPPEL">Rappel</SelectItem>
              <SelectItem value="CUSTOM">Personnalisée</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lueFilter} onValueChange={setLueFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Lue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="false">Non lues</SelectItem>
              <SelectItem value="true">Lues</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Results count ─── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{filteredAlertes.length}</span> alerte{filteredAlertes.length !== 1 ? 's' : ''} trouvée{filteredAlertes.length !== 1 ? 's' : ''}
        </p>
        {isUsingFallback && (
          <Badge variant="outline" className="text-xs text-warning border-warning/40">
            <Zap className="h-3 w-3 mr-1" />
            Données dynamiques
          </Badge>
        )}
      </div>

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-start gap-4 p-4">
                <PulseSkeleton className="h-10 w-10" variant="card" />
                <div className="flex-1 space-y-2">
                  <PulseSkeleton className="h-5 w-64" />
                  <PulseSkeleton className="h-4 w-96" />
                  <div className="flex gap-2">
                    <PulseSkeleton className="h-5 w-20" />
                    <PulseSkeleton className="h-5 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filteredAlertes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <Bell className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold">Aucune alerte trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || severityFilter !== 'all' || typeFilter !== 'all' || lueFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Aucune alerte active pour le moment. Tout semble fonctionner correctement.'}
          </p>
          {!search && severityFilter === 'all' && typeFilter === 'all' && lueFilter === 'all' && (
            <Button
              className="mt-6"
              onClick={() => {
                resetForm()
                setCreateDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Créer une alerte
            </Button>
          )}
        </div>
      )}

      {/* ─── Alert cards list ─── */}
      {!isLoading && filteredAlertes.length > 0 && (
        <div className="space-y-3 max-h-[calc(100vh-380px)] overflow-y-auto pr-1 custom-scrollbar">
          {filteredAlertes.map((alerte) => (
            <Card
              key={alerte.id}
              className={`border-l-4 ${getSeverityBorderColor(alerte.severity)} transition-shadow hover:shadow-md ds-lift ${!alerte.lue ? 'bg-success/5' : ''}`}
            >
              <CardContent className="flex items-start gap-4 p-4">
                {/* Severity icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getSeverityIcon(alerte.severity)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display font-semibold text-sm">{alerte.titre}</h3>
                      {!alerte.lue && (
                        <span className="h-2 w-2 rounded-full bg-success flex-shrink-0" title="Non lue" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {getSeverityBadge(alerte.severity)}
                      {getTypeBadge(alerte.type)}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {alerte.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {alerte.filiere && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GraduationCap className="h-3 w-3 text-success-text" />
                        {alerte.filiere.nom}
                      </span>
                    )}
                    {alerte.epreuve && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ClipboardList className="h-3 w-3 text-info" />
                        {alerte.epreuve.titre}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeDate(alerte.createdAt)}
                    </span>
                    {alerte.resolu && (
                      <Badge className="bg-info/15 text-info border-info/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Résolue
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {!alerte.lue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-success-text hover:bg-success/10"
                      onClick={() => handleMarkAsRead(alerte)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Lu
                    </Button>
                  )}
                  {!alerte.resolu && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-info hover:bg-info/10"
                      onClick={() => handleMarkAsResolved(alerte)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Résoudre
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewDetail(alerte)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Détail
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create Alert Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) setCreateDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <Bell className="h-5 w-5 text-success-text" />
              Nouvelle alerte
            </DialogTitle>
            <DialogDescription>
              Créez une alerte personnalisée pour vos filières.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="alerte-titre">Titre *</Label>
              <Input
                id="alerte-titre"
                placeholder="Ex: Taux d'échec élevé en mathématiques"
                value={formTitre}
                onChange={(e) => setFormTitre(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alerte-description">Description *</Label>
              <Textarea
                id="alerte-description"
                placeholder="Décrivez l'alerte en détail..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="alerte-severity">Sévérité</Label>
                <Select value={formSeverity} onValueChange={setFormSeverity}>
                  <SelectTrigger id="alerte-severity">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="WARNING">Attention</SelectItem>
                    <SelectItem value="CRITICAL">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alerte-type">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger id="alerte-type">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERFORMANCE">Performance</SelectItem>
                    <SelectItem value="FRAUDE">Fraude</SelectItem>
                    <SelectItem value="SYSTEME">Système</SelectItem>
                    <SelectItem value="RAPPEL">Rappel</SelectItem>
                    <SelectItem value="CUSTOM">Personnalisée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="alerte-filiere">Filière associée</Label>
              <Select value={formFiliereId} onValueChange={setFormFiliereId}>
                <SelectTrigger id="alerte-filiere">
                  <SelectValue placeholder="Aucune filière" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune filière</SelectItem>
                  {filieres.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateAlerte}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer l&apos;alerte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Sheet ─── */}
      <Sheet open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setSelectedAlerte(null) } }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedAlerte && getSeverityIcon(selectedAlerte.severity)}
              Détail de l&apos;alerte
            </SheetTitle>
            <SheetDescription>
              Informations complètes sur l&apos;alerte
            </SheetDescription>
          </SheetHeader>

          {selectedAlerte && (
            <div className="mt-6 space-y-4">
              {/* Title & badges */}
              <div>
                <h3 className="text-lg font-display font-semibold">{selectedAlerte.titre}</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getSeverityBadge(selectedAlerte.severity)}
                  {getTypeBadge(selectedAlerte.type)}
                  {selectedAlerte.resolu ? (
                    <Badge className="bg-info/15 text-info border-info/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Résolue
                    </Badge>
                  ) : (
                    <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">
                      En cours
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* Description */}
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="mt-1 text-sm">{selectedAlerte.description}</p>
              </div>

              {/* Related entities */}
              {selectedAlerte.filiere && (
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-success-text" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Filière</Label>
                    <p className="text-sm font-medium">{selectedAlerte.filiere.nom}</p>
                  </div>
                </div>
              )}

              {selectedAlerte.epreuve && (
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-info" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Épreuve</Label>
                    <p className="text-sm font-medium">{selectedAlerte.epreuve.titre}</p>
                  </div>
                </div>
              )}

              {selectedAlerte.user && (
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Utilisateur concerné</Label>
                    <p className="text-sm font-medium">{selectedAlerte.user.name} ({selectedAlerte.user.email})</p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Timestamps */}
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Créée : {new Date(selectedAlerte.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Dernière mise à jour : {new Date(selectedAlerte.updatedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
                </span>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {!selectedAlerte.lue && (
                  <Button
                    onClick={() => {
                      handleMarkAsRead(selectedAlerte)
                      setSelectedAlerte({ ...selectedAlerte, lue: true })
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Marquer comme lue
                  </Button>
                )}
                {!selectedAlerte.resolu && (
                  <Button
                    variant="outline"
                    className="border-info/40 text-info hover:bg-info/10"
                    onClick={() => {
                      handleMarkAsResolved(selectedAlerte)
                      setSelectedAlerte({ ...selectedAlerte, resolu: true, lue: true })
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marquer comme résolue
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => { setDetailOpen(false); setSelectedAlerte(null) }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
