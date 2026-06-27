'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GraduationCap,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  Power,
  PowerOff,
  Users,
  Building2,
  UserCheck,
  BookOpen,
  Loader2,
  UserCircle,
  LayoutGrid,
  List,
  Download,
  MoreHorizontal,
  CheckSquare,
  Square,
  X,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { PulseSkeleton } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

// ─── Types ───

interface FiliereItem {
  id: string
  nom: string
  code: string | null
  etablissementId: string
  description: string | null
  nbEtudiants: number | null
  actif: boolean
  createdAt: string
  etablissement: { id: string; nom: string }
  responsable: { id: string; name: string; email: string } | null
  _count: { etudiants: number }
}

interface FiliereDetail extends FiliereItem {
  etudiants: Array<{
    id: string
    name: string
    email: string
    actif: boolean
    createdAt: string
  }>
}

interface EtablissementOption {
  id: string
  nom: string
}

interface ResponsableOption {
  id: string
  name: string
  email: string
}

type ViewMode = 'card' | 'table'
type BulkAction = 'activate' | 'deactivate' | 'delete'

// ─── Utility functions ───

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ─── Debounce hook ───

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ─── Main Component ───

export function FilieresPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // ─── Data state ───
  // (Migration useEffect+fetch → useQuery. Voir plus bas.)

  // ─── View mode ───
  const [viewMode, setViewMode] = useState<ViewMode>('card')

  // ─── Filter state ───
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)
  const [etablissementFilter, setEtablissementFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingFiliere, setEditingFiliere] = useState<FiliereItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiliereItem | null>(null)
  const [deleteDependencies, setDeleteDependencies] = useState<{ epreuves: number; etudiants: number; unitesEnseignement: number } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ─── Detail view state ───
  const [detailFiliere, setDetailFiliere] = useState<FiliereDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // ─── Form state ───
  const [formNom, setFormNom] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formEtablissementId, setFormEtablissementId] = useState('')
  const [formResponsableId, setFormResponsableId] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formNbEtudiants, setFormNbEtudiants] = useState('')
  const [formActif, setFormActif] = useState(true)

  // ─── Options state ───
  // (Migration useEffect+fetch → useQuery. Voir plus bas.)

  // ─── Bulk selection state ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionDialog, setBulkActionDialog] = useState<BulkAction | null>(null)
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  // ─── Determine if user is Responsable ───
  const isResponsable = user?.role === 'RESPONSABLE'
  const isAdmin = user?.role === 'ADMIN'

  // ─── Fetch filieres (TanStack Query) ───
  // Migration useEffect+fetch → useQuery. Le cache survit au démontage :
  // 0 refetch au retour navigation. staleTime 60s. Le filtrage se fait côté
  // serveur (queryKey inclut debouncedSearch + filtres + isResponsable).
  const filieresQuery = useQuery<{ filieres: FiliereItem[] }>({
    queryKey: ['filieres', debouncedSearch, etablissementFilter, statusFilter, isResponsable, user?.id],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (etablissementFilter && etablissementFilter !== 'all') params.set('etablissementId', etablissementFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      if (isResponsable && user?.id) {
        params.set('responsableId', user.id)
      }

      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (!res.ok) {
        // 403 = rôle non autorisé (ex: enseignant qui n'a pas accès aux filières)
        // Retourner un tableau vide au lieu de crasher
        if (res.status === 403) return { filieres: [] }
        throw new Error('Failed to fetch filieres')
      }
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const filieres = filieresQuery.data?.filieres ?? []
  const isLoading = filieresQuery.isLoading

  // Helper pour invalider le cache après mutation (create/update/delete/toggle/bulk)
  const refreshFilieres = () => queryClient.invalidateQueries({ queryKey: ['filieres'] })

  // ─── Auto-generate filière code suggestion ───
  const suggestedFiliereCode = useMemo(() => {
    if (formNom && !formCode && !editingFiliere) {
      const words = formNom.trim().split(/\s+/)
      const code = words.length >= 2
        ? words.map((w) => w[0]).join('').toUpperCase().substring(0, 4)
        : formNom.substring(0, 4).toUpperCase()
      const existingCodes = new Set(filieres.map((f) => f.code).filter(Boolean))
      let candidate = code
      let suffix = 1
      while (existingCodes.has(candidate)) {
        candidate = `${code}${suffix}`
        suffix++
      }
      return candidate
    }
    return ''
  }, [formNom, formCode, editingFiliere, filieres])

  // ─── Fetch etablissements & responsables (TanStack Query) ───
  // Options pour les dropdowns du formulaire. One-shot (deps []), staleTime
  // 5 min car ces données changent rarement.
  const optionsQuery = useQuery<{
    etablissements: EtablissementOption[]
    responsables: ResponsableOption[]
  }>({
    queryKey: ['filieres-options'],
    queryFn: async () => {
      const [etabRes, respRes] = await Promise.all([
        fetch('/api/etablissements'),
        fetch('/api/users?role=RESPONSABLE&limit=100'),
      ])
      const etablissements: EtablissementOption[] = []
      const responsables: ResponsableOption[] = []
      // 403 = rôle non autorisé → tableau vide (pas de crash)
      if (etabRes.ok) {
        const data = await etabRes.json()
        etablissements.push(...(data.etablissements ?? []).map((e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })))
      }
      if (respRes.ok) {
        const data = await respRes.json()
        responsables.push(...(data.users ?? []).map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email })))
      }
      return { etablissements, responsables }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etablissements = optionsQuery.data?.etablissements ?? []
  const responsables = optionsQuery.data?.responsables ?? []

  // ─── Clear selection when filieres change ───
  useEffect(() => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      const currentIds = new Set(filieres.map((f) => f.id))
      for (const id of newSet) {
        if (!currentIds.has(id)) newSet.delete(id)
      }
      return newSet
    })
  }, [filieres])

  // ─── Stats ───
  const totalFilieres = filieres.length
  const totalEtudiants = filieres.reduce((acc, f) => acc + (f._count?.etudiants ?? 0), 0)
  const actifCount = filieres.filter((f) => f.actif).length
  const withResponsable = filieres.filter((f) => f.responsable).length

  // ─── Selection helpers ───
  const allSelected = filieres.length > 0 && selectedIds.size === filieres.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filieres.map((f) => f.id)))
    }
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingFiliere(null)
    setFormNom('')
    setFormCode('')
    setFormEtablissementId(user?.etablissementId ?? '')
    setFormResponsableId(user?.etablissementId ? (user?.id ?? '') : '')
    setFormDescription('')
    setFormNbEtudiants('')
    setFormActif(true)
    setCreateDialogOpen(true)
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (filiere: FiliereItem) => {
    setEditingFiliere(filiere)
    setFormNom(filiere.nom)
    setFormCode(filiere.code ?? '')
    setFormEtablissementId(filiere.etablissementId)
    setFormResponsableId(filiere.responsable?.id ?? '')
    setFormDescription(filiere.description ?? '')
    setFormNbEtudiants(filiere.nbEtudiants?.toString() ?? '')
    setFormActif(filiere.actif)
    setCreateDialogOpen(true)
  }

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!formNom) {
      toast.error('Nom manquant', { description: 'Le nom de la filière est obligatoire.' })
      return
    }
    if (!formEtablissementId) {
      toast.error('Établissement manquant', { description: 'L\'établissement est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        nom: formNom,
        code: formCode || null,
        etablissementId: formEtablissementId,
        responsableId: formResponsableId || null,
        description: formDescription || null,
        nbEtudiants: formNbEtudiants ? parseInt(formNbEtudiants, 10) : null,
        actif: formActif,
      }

      if (editingFiliere) {
        const res = await fetch(`/api/filieres/${editingFiliere.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la modification')
        }
        toast.success('Filière modifiée', { description: `${formNom} a été mise à jour.` })
      } else {
        const res = await fetch('/api/filieres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Filière créée', { description: `${formNom} a été ajoutée.` })
      }

      setCreateDialogOpen(false)
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle active ───
  const handleToggleActive = async (filiere: FiliereItem) => {
    try {
      const res = await fetch(`/api/filieres/${filiere.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !filiere.actif }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success(filiere.actif ? 'Filière désactivée' : 'Filière activée', {
        description: `${filiere.nom} est maintenant ${filiere.actif ? 'inactive' : 'active'}.`,
      })
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de modifier le statut.' })
    }
  }

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/filieres/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      const data = await res.json()
      const deps = data.dependencies
      toast.success('Filière supprimée', {
        description: deps
          ? `${deleteTarget.nom} a été désactivée (${deps.etudiants} étudiant(s), ${deps.epreuves} épreuve(s) affecté(s)).`
          : `${deleteTarget.nom} a été désactivée.`,
      })
      setDeleteTarget(null)
      setDeleteDependencies(null)
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de supprimer la filière.' })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Open delete confirmation with dependency check ───
  const handleOpenDelete = async (filiere: FiliereItem) => {
    setDeleteTarget(filiere)
    // Fetch dependencies by getting the filiere detail
    try {
      const res = await fetch(`/api/filieres/${filiere.id}`)
      if (res.ok) {
        const data = await res.json()
        // The API now returns dependency counts in the delete response
        // But for preview, we can estimate from available data
        setDeleteDependencies({
          epreuves: 0, // Will be populated from actual DELETE response
          etudiants: data._count?.etudiants ?? data.etudiants?.length ?? 0,
          unitesEnseignement: 0,
        })
      }
    } catch {
      setDeleteDependencies(null)
    }
  }

  // ─── View detail ───
  const handleViewDetail = async (filiere: FiliereItem) => {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const res = await fetch(`/api/filieres/${filiere.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailFiliere(data)
      }
    } catch {
      // Silent
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Bulk operations ───
  const handleBulkAction = async () => {
    if (!bulkActionDialog || selectedIds.size === 0) return
    setIsBulkProcessing(true)
    try {
      const res = await fetch('/api/filieres/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action: bulkActionDialog,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'opération')
      }
      const data = await res.json()
      const actionLabels = {
        activate: 'activée(s)',
        deactivate: 'désactivée(s)',
        delete: 'supprimée(s)',
      }
      toast.success('Opération réussie', {
        description: `${data.updated} filière(s) ${actionLabels[bulkActionDialog]}.`,
      })
      setSelectedIds(new Set())
      setBulkActionDialog(null)
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  // ─── CSV Export ───
  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (etablissementFilter && etablissementFilter !== 'all') params.set('etablissementId', etablissementFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      if (isResponsable && user?.id) {
        params.set('responsableId', user.id)
      }

      const res = await fetch(`/api/filieres/export?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur lors de l\'export')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `filieres_export_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Export réussi', { description: 'Le fichier CSV a été téléchargé.' })
    } catch {
      toast.error('Erreur', { description: 'Impossible d\'exporter les données.' })
    }
  }

  // ─── Bulk action labels ───
  const bulkActionLabels: Record<BulkAction, string> = {
    activate: 'Activer',
    deactivate: 'Désactiver',
    delete: 'Supprimer',
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-success-text" />
            Gestion des Filières
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isResponsable
              ? 'Gérez les filières dont vous êtes responsable'
              : 'Organisez et gérez les filières et formations'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Exporter en CSV</TooltipContent>
          </Tooltip>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle filière
          </Button>
        </div>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <GraduationCap className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total filières</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalFilieres}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/15">
              <Users className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total étudiants</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <BookOpen className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actives</p>
              <p className="text-xl font-bold font-mono tabular-nums">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
              <UserCheck className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec responsable</p>
              <p className="text-xl font-bold font-mono tabular-nums">{withResponsable}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Bulk Action Toolbar ─── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-success/5 p-3">
          <span className="text-sm font-medium font-mono tabular-nums">
            {selectedIds.size} filière(s) sélectionnée(s)
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('activate')}
            className="border-success/40 text-success-text hover:bg-success/10"
          >
            <Power className="h-3.5 w-3.5" />
            Activer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('deactivate')}
          >
            <PowerOff className="h-3.5 w-3.5" />
            Désactiver
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('delete')}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ─── Search/Filter Toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une filière..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
          {searchInput && debouncedSearch !== searchInput && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Select value={etablissementFilter} onValueChange={setEtablissementFilter}>
          <SelectTrigger className="w-[200px]">
            <Building2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Établissement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les établissements</SelectItem>
            {etablissements.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="inactif">Inactif</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => { if (value) setViewMode(value as ViewMode) }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="card" aria-label="Vue cartes">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Vue tableau">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <PulseSkeleton className="h-5 w-40" />
                      <PulseSkeleton className="h-4 w-24" />
                    </div>
                    <PulseSkeleton className="h-6 w-20" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <PulseSkeleton className="h-3 w-32" />
                    <PulseSkeleton className="h-3 w-24" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <PulseSkeleton className="h-8 w-20" />
                    <PulseSkeleton className="h-8 w-20" />
                    <PulseSkeleton className="h-8 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border">
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        )
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filieres.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <GraduationCap className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucune filière trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {searchInput || etablissementFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par créer votre première filière.'}
          </p>
          {!searchInput && etablissementFilter === 'all' && statusFilter === 'all' && (
            <Button className="mt-6" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Créer une filière
            </Button>
          )}
        </div>
      )}

      {/* ─── Card View ─── */}
      {!isLoading && filieres.length > 0 && viewMode === 'card' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filieres.map((filiere) => (
            <Card key={filiere.id} className={`group transition-shadow hover:shadow-md ds-lift ${selectedIds.has(filiere.id) ? 'ring-2 ring-success/30 border-success/40' : ''}`}>
              <CardContent className="flex flex-col gap-4 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Checkbox
                      checked={selectedIds.has(filiere.id)}
                      onCheckedChange={() => toggleSelect(filiere.id)}
                      className="mt-1"
                      aria-label={`Sélectionner ${filiere.nom}`}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-display font-semibold leading-tight">{filiere.nom}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {filiere.code && (
                          <Badge variant="outline" className="text-xs font-mono">
                            {filiere.code}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {filiere.actif ? (
                    <Badge className="bg-success/15 text-success-text border-success/30 text-xs whitespace-nowrap">Actif</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border-border text-xs whitespace-nowrap">Inactif</Badge>
                  )}
                </div>

                {/* Etablissement */}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 text-success-text" />
                  {filiere.etablissement?.nom ?? '—'}
                </div>

                {/* Responsable */}
                <div className="flex items-center gap-1.5 text-sm">
                  {filiere.responsable ? (
                    <>
                      <UserCircle className="h-3.5 w-3.5 text-info" />
                      <span className="text-muted-foreground">{filiere.responsable.name}</span>
                    </>
                  ) : (
                    <>
                      <UserCircle className="h-3.5 w-3.5 text-warning" />
                      <span className="text-warning text-xs italic">Non assigné</span>
                    </>
                  )}
                </div>

                {/* Student count */}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 bg-success/10 text-success-text">
                    <Users className="h-3 w-3" />
                    <span className="font-mono tabular-nums">{filiere._count?.etudiants ?? 0}</span> étudiant{(filiere._count?.etudiants ?? 0) > 1 ? 's' : ''}
                  </Badge>
                  {filiere.nbEtudiants && (
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">
                      (prévus : {filiere.nbEtudiants})
                    </span>
                  )}
                </div>

                {/* Description */}
                {filiere.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {filiere.description}
                  </p>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(filiere)}
                    className="border-success/40 text-success-text hover:bg-success/10"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleToggleActive(filiere)}>
                        {filiere.actif ? (
                          <>
                            <PowerOff className="h-4 w-4" />
                            Désactiver
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4" />
                            Activer
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewDetail(filiere)}>
                        <Eye className="h-4 w-4" />
                        Détails
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleOpenDelete(filiere)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Table View ─── */}
      {!isLoading && filieres.length > 0 && viewMode === 'table' && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected
                      }
                    }}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Sélectionner tout"
                  />
                </TableHead>
                <TableHead>Nom</TableHead>
                <TableHead className="hidden md:table-cell">Code</TableHead>
                <TableHead className="hidden sm:table-cell">Établissement</TableHead>
                <TableHead className="hidden lg:table-cell">Responsable</TableHead>
                <TableHead>Étudiants</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filieres.map((filiere) => (
                <TableRow
                  key={filiere.id}
                  className={selectedIds.has(filiere.id) ? 'bg-success/5' : ''}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(filiere.id)}
                      onCheckedChange={() => toggleSelect(filiere.id)}
                      aria-label={`Sélectionner ${filiere.nom}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{filiere.nom}</p>
                      {filiere.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{filiere.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {filiere.code ? (
                      <Badge variant="outline" className="font-mono text-xs">{filiere.code}</Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {filiere.etablissement?.nom ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {filiere.responsable ? (
                      <span className="text-sm">{filiere.responsable.name}</span>
                    ) : (
                      <span className="text-xs text-warning italic">Non assigné</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1 text-xs font-mono tabular-nums">
                      <Users className="h-3 w-3" />
                      {filiere._count?.etudiants ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {filiere.actif ? (
                      <Badge className="bg-success/15 text-success-text border-success/30 text-xs">Actif</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border text-xs">Inactif</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEdit(filiere)}>
                          <Edit3 className="h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewDetail(filiere)}>
                          <Eye className="h-4 w-4" />
                          Détails
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(filiere)}>
                          {filiere.actif ? (
                            <>
                              <PowerOff className="h-4 w-4" />
                              Désactiver
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4" />
                              Activer
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleOpenDelete(filiere)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Create/Edit Filiere Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) setCreateDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <GraduationCap className="h-5 w-5 text-success-text" />
              {editingFiliere ? 'Modifier la filière' : 'Nouvelle filière'}
            </DialogTitle>
            <DialogDescription>
              {editingFiliere ? 'Modifiez les informations de la filière.' : 'Remplissez les informations pour créer une nouvelle filière.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="filiere-nom">Nom *</Label>
              <Input
                id="filiere-nom"
                placeholder="Ex: Licence Informatique"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="filiere-code">Code</Label>
                {suggestedFiliereCode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-success-text hover:text-success-text"
                    onClick={() => setFormCode(suggestedFiliereCode)}
                  >
                    Auto: {suggestedFiliereCode}
                  </Button>
                )}
              </div>
              <Input
                id="filiere-code"
                placeholder="Ex: L3-INFO"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
            </div>

            {!user?.etablissementId && (
            <div className="space-y-2">
              <Label htmlFor="filiere-etablissement">Établissement *</Label>
              <Select value={formEtablissementId} onValueChange={setFormEtablissementId}>
                <SelectTrigger id="filiere-etablissement">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  {etablissements.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {!user?.etablissementId && (
            <div className="space-y-2">
              <Label htmlFor="filiere-responsable">Responsable</Label>
              <Select value={formResponsableId} onValueChange={setFormResponsableId}>
                <SelectTrigger id="filiere-responsable">
                  <SelectValue placeholder="Sélectionner un responsable" />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="filiere-description">Description</Label>
              <Textarea
                id="filiere-description"
                placeholder="Description de la filière..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="filiere-nbetudiants">Nb étudiants (prévu)</Label>
                <Input
                  id="filiere-nbetudiants"
                  type="number"
                  min="0"
                  placeholder="Ex: 120"
                  value={formNbEtudiants}
                  onChange={(e) => setFormNbEtudiants(e.target.value)}
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filiere-actif"
                    checked={formActif}
                    onCheckedChange={(checked) => setFormActif(checked === true)}
                  />
                  <Label htmlFor="filiere-actif" className="cursor-pointer">
                    Filière active
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFiliere ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteDependencies(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Supprimer la filière
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.nom}</strong> ?
                </p>
                <p className="text-warning">
                  Cette action désactivera la filière (suppression logique). Les données associées ne seront pas perdues.
                </p>
                {deleteDependencies && (deleteDependencies.etudiants > 0 || deleteDependencies.epreuves > 0 || deleteDependencies.unitesEnseignement > 0) && (
                  <div className="rounded-lg bg-warning/10 p-3 text-sm space-y-1">
                    <p className="font-display font-medium text-warning">Dépendances trouvées :</p>
                    {deleteDependencies.etudiants > 0 && (
                      <p className="text-warning">• <span className="font-mono tabular-nums">{deleteDependencies.etudiants}</span> étudiant(s) inscrit(s)</p>
                    )}
                    {deleteDependencies.epreuves > 0 && (
                      <p className="text-warning">• <span className="font-mono tabular-nums">{deleteDependencies.epreuves}</span> épreuve(s) associée(s)</p>
                    )}
                    {deleteDependencies.unitesEnseignement > 0 && (
                      <p className="text-warning">• <span className="font-mono tabular-nums">{deleteDependencies.unitesEnseignement}</span> unité(s) d'enseignement</p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Action Confirmation Dialog ─── */}
      <AlertDialog open={!!bulkActionDialog} onOpenChange={(open) => { if (!open) setBulkActionDialog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display tracking-tight">
              {bulkActionDialog === 'delete' && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {bulkActionDialog === 'activate' && <Power className="h-5 w-5 text-success-text" />}
              {bulkActionDialog === 'deactivate' && <PowerOff className="h-5 w-5 text-warning" />}
              Confirmation d&apos;action groupée
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkActionDialog === 'delete'
                ? `Êtes-vous sûr de vouloir supprimer (désactiver) ${selectedIds.size} filière(s) ? Les étudiants et données associées ne seront pas perdus.`
                : `Êtes-vous sûr de vouloir ${bulkActionDialog === 'activate' ? 'activer' : 'désactiver'} ${selectedIds.size} filière(s) ?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={bulkActionDialog === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
              onClick={handleBulkAction}
              disabled={isBulkProcessing}
            >
              {isBulkProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {bulkActionDialog ? bulkActionLabels[bulkActionDialog] : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Detail View Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={(open) => {
        if (!open) {
          setDetailOpen(false)
          setDetailFiliere(null)
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <GraduationCap className="h-5 w-5 text-success-text" />
              {detailFiliere?.nom ?? 'Détails de la filière'}
            </DialogTitle>
            <DialogDescription>
              Informations détaillées et étudiants inscrits
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-4 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {detailFiliere && !detailLoading && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6">
                {/* Info section */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailFiliere.code && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Code :</span>
                      <Badge variant="outline" className="font-mono">{detailFiliere.code}</Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-success-text" />
                    <span className="text-muted-foreground">Établissement :</span>
                    <span className="font-medium">{detailFiliere.etablissement?.nom ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Statut :</span>
                    {detailFiliere.actif ? (
                      <Badge className="bg-success/15 text-success-text border-success/30">Actif</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border">Inactif</Badge>
                    )}
                  </div>
                  {detailFiliere.responsable && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCircle className="h-3.5 w-3.5 text-info" />
                      <span className="text-muted-foreground">Responsable :</span>
                      <span className="font-medium">{detailFiliere.responsable.name}</span>
                      <span className="text-muted-foreground">({detailFiliere.responsable.email})</span>
                    </div>
                  )}
                  {!detailFiliere.responsable && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCircle className="h-3.5 w-3.5 text-warning" />
                      <span className="text-warning italic">Aucun responsable assigné</span>
                    </div>
                  )}
                  {detailFiliere.nbEtudiants && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-info" />
                      <span className="text-muted-foreground">Étudiants prévus :</span>
                      <span className="font-medium font-mono tabular-nums">{detailFiliere.nbEtudiants}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Créée le :</span>
                    <span>{formatDateFR(detailFiliere.createdAt)}</span>
                  </div>
                </div>

                {detailFiliere.description && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-display font-semibold mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailFiliere.description}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Etudiants section */}
                <div>
                  <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-success-text" />
                    Étudiants inscrits (<span className="font-mono tabular-nums">{detailFiliere.etudiants?.length ?? 0}</span>)
                  </h3>
                  {(!detailFiliere.etudiants || detailFiliere.etudiants.length === 0) ? (
                    <p className="text-sm text-muted-foreground py-2">Aucun étudiant inscrit dans cette filière.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {detailFiliere.etudiants.map((etudiant) => (
                        <div key={etudiant.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center text-xs font-bold text-success-text font-mono tabular-nums">
                              {etudiant.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{etudiant.name}</p>
                              <p className="text-xs text-muted-foreground">{etudiant.email}</p>
                            </div>
                          </div>
                          {etudiant.actif ? (
                            <Badge className="bg-success/15 text-success-text border-success/30 text-xs">Actif</Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground border-border text-xs">Inactif</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
