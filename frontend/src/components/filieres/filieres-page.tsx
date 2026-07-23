'use client'

// ════════════════════════════════════════════════════════════════════
// FilieresPage — Refonte "Savane EdTech"
// ════════════════════════════════════════════════════════════════════
// Module de gestion des filières (CRUD + bulk + export + dependencies).
//
// Identité visuelle "Savane EdTech" :
//   - Palette africaine : vert lime (primary), terre cuite (secondary),
//     bleu nuit (sidebar), or (gold) — déjà remappée dans globals.css.
//   - Motif kente subtil sur header + cards (classes ds-kente-* du DS).
//   - Composants DS : StatCard, EntityCard, PulseSkeleton, GlassModal.
//   - Icônes Lucide évoquant l'Afrique/l'éducation : GraduationCap, Users,
//     Building2, BookOpen, Sparkles, Leaf.
//
// Backend matché :
//   GET    /api/filieres                  → { filieres: FiliereItem[] }
//   GET    /api/filieres/{id}             → FiliereDetail (avec etudiants[])
//   GET    /api/filieres/{id}/dependencies → { etudiantsCount, uesCount,
//                                              epreuvesCount, canDelete }
//   GET    /api/filieres/export           → CSV binaire
//   POST   /api/filieres                  → { filiere: FiliereItem } (201)
//   PATCH  /api/filieres/{id}             → FiliereItem (partial update)
//   PATCH  /api/filieres/bulk             → { updated: number,
//                                              filieres: FiliereItem[] }
//   DELETE /api/filieres/{id}             → { message, filiere, dependencies }
// ════════════════════════════════════════════════════════════════════

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
  X,
  AlertTriangle,
  Leaf,
  Sparkles,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StatCard, EntityCard, PulseSkeleton, GlassModal } from '@/components/ds'
import { toast } from 'sonner'

// ─── Types (alignés sur le backend) ───

interface FiliereItem {
  id: string
  nom: string
  code: string | null
  etablissementId: string
  responsableId: string | null
  description: string | null
  nbEtudiants: number | null
  actif: boolean
  createdAt: string
  updatedAt: string
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

interface DeleteDependencies {
  etudiantsCount: number
  uesCount: number
  epreuvesCount: number
  canDelete: boolean
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
  const [deleteDependencies, setDeleteDependencies] =
    useState<DeleteDependencies | null>(null)
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

  // ─── Bulk selection state ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionDialog, setBulkActionDialog] = useState<BulkAction | null>(
    null
  )
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  // ─── Determine user role ───
  const isResponsable = user?.role === 'RESPONSABLE'

  // ─── Fetch filieres (TanStack Query) ───
  const filieresQuery = useQuery<{ filieres: FiliereItem[] }>({
    queryKey: [
      'filieres',
      debouncedSearch,
      etablissementFilter,
      statusFilter,
      isResponsable,
      user?.id,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (etablissementFilter && etablissementFilter !== 'all')
        params.set('etablissementId', etablissementFilter)
      if (statusFilter && statusFilter !== 'all')
        params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      if (isResponsable && user?.id) {
        params.set('responsableId', user.id)
      }

      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (!res.ok) {
        if (res.status === 403) return { filieres: [] }
        throw new Error('Failed to fetch filieres')
      }
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // useMemo pour stabiliser filieres (évite boucle useEffect)
  const filieres = useMemo(
    () => filieresQuery.data?.filieres ?? [],
    [filieresQuery.data]
  )
  const isLoading = filieresQuery.isLoading

  const refreshFilieres = () =>
    queryClient.invalidateQueries({ queryKey: ['filieres'] })

  // ─── Auto-generate filière code suggestion ───
  const suggestedFiliereCode = useMemo(() => {
    if (formNom && !formCode && !editingFiliere) {
      const words = formNom.trim().split(/\s+/)
      const code =
        words.length >= 2
          ? words
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .substring(0, 4)
          : formNom.substring(0, 4).toUpperCase()
      const existingCodes = new Set(
        filieres.map((f) => f.code).filter(Boolean)
      )
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
      if (etabRes.ok) {
        const data = await etabRes.json()
        etablissements.push(
          ...(data.etablissements ?? []).map(
            (e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })
          )
        )
      }
      if (respRes.ok) {
        const data = await respRes.json()
        responsables.push(
          ...(data.users ?? []).map(
            (u: { id: string; name: string; email: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
            })
          )
        )
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
  const totalEtudiants = filieres.reduce(
    (acc, f) => acc + (f._count?.etudiants ?? 0),
    0
  )
  const actifCount = filieres.filter((f) => f.actif).length
  const inactifCount = totalFilieres - actifCount

  // ─── Selection helpers ───
  const allSelected =
    filieres.length > 0 && selectedIds.size === filieres.length
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
    // Validation frontend : nom obligatoire
    if (!formNom.trim()) {
      toast.error('Nom manquant', {
        description: 'Le nom de la filière est obligatoire.',
      })
      return
    }
    if (!formEtablissementId) {
      toast.error('Établissement manquant', {
        description: "L'établissement est obligatoire.",
      })
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
        nbEtudiants: formNbEtudiants
          ? parseInt(formNbEtudiants, 10)
          : null,
        actif: formActif,
      }

      if (editingFiliere) {
        // PATCH /api/filieres/{id} → bare FiliereItem (partial update)
        const res = await fetch(`/api/filieres/${editingFiliere.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la modification')
        }
        toast.success('Filière modifiée', {
          description: `${formNom} a été mise à jour.`,
        })
      } else {
        // POST /api/filieres → { filiere: FiliereItem } (201)
        const res = await fetch('/api/filieres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Filière créée', {
          description: `${formNom} a été ajoutée.`,
        })
      }

      setCreateDialogOpen(false)
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', {
        description:
          err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
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
      toast.success(
        filiere.actif ? 'Filière désactivée' : 'Filière activée',
        {
          description: `${filiere.nom} est maintenant ${
            filiere.actif ? 'inactive' : 'active'
          }.`,
        }
      )
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', {
        description:
          err instanceof Error
            ? err.message
            : 'Impossible de modifier le statut.',
      })
    }
  }

  // ─── Delete ───
  // Le bouton "Supprimer" fait un HARD DELETE (DELETE ?hard=true) si canDelete=true
  // (pas d'étudiants/UEs actifs). Sinon, il fait un soft-delete (actif=false) avec
  // un warning. Le bouton "Désactiver" (handleToggleActive) fait juste un toggle.
  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const canHardDelete = deleteDependencies?.canDelete === true
      // DELETE ?hard=true → hard delete (DELETE réel en DB)
      // DELETE (sans param) → soft delete (actif=false)
      const url = canHardDelete
        ? `/api/filieres/${deleteTarget.id}?hard=true`
        : `/api/filieres/${deleteTarget.id}`

      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      const data = await res.json()

      if (data.hardDelete) {
        // Hard delete réussi
        toast.success('Filière supprimée définitivement', {
          description: data.message || `${deleteTarget.nom} a été supprimée de la base.`,
        })
      } else {
        // Soft delete (désactivation)
        const deps = data.dependencies
        toast.success('Filière désactivée', {
          description: deps
            ? `${deleteTarget.nom} a été désactivée (${deps.etudiantsCount} étudiant(s), ${deps.epreuvesCount} épreuve(s), ${deps.uesCount} UE(s) affecté(s)). Suppression définitive impossible : dépendances actives.`
            : `${deleteTarget.nom} a été désactivée.`,
        })
      }
      setDeleteTarget(null)
      setDeleteDependencies(null)
      refreshFilieres()
    } catch (err) {
      toast.error('Erreur', {
        description:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer la filière.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Open delete confirmation with dependency check ───
  // GET /api/filieres/{id}/dependencies → { etudiantsCount, uesCount,
  //   epreuvesCount, canDelete }. canDelete=false désactive le bouton de
  //   confirmation.
  const handleOpenDelete = async (filiere: FiliereItem) => {
    setDeleteTarget(filiere)
    setDeleteDependencies(null)
    try {
      const res = await fetch(`/api/filieres/${filiere.id}/dependencies`)
      if (res.ok) {
        const deps = await res.json()
        setDeleteDependencies(deps)
      }
    } catch {
      setDeleteDependencies(null)
    }
  }

  // ─── View detail ───
  // GET /api/filieres/{id} → FiliereDetail (avec etudiants[])
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
  // PATCH /api/filieres/bulk → { updated: number, filieres: FiliereItem[] }
  // Affiche `updated` (peut différer de selectedIds.size) dans le toast.
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
        throw new Error(err.error || "Erreur lors de l'opération")
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
      toast.error('Erreur', {
        description:
          err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  // ─── CSV Export ───
  // GET /api/filieres/export → CSV binaire
  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (etablissementFilter && etablissementFilter !== 'all')
        params.set('etablissementId', etablissementFilter)
      if (statusFilter && statusFilter !== 'all')
        params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      if (isResponsable && user?.id) {
        params.set('responsableId', user.id)
      }

      const res = await fetch(`/api/filieres/export?${params.toString()}`)
      if (!res.ok) throw new Error("Erreur lors de l'export")

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `filieres_export_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Export réussi', {
        description: 'Le fichier CSV a été téléchargé.',
      })
    } catch {
      toast.error('Erreur', {
        description: "Impossible d'exporter les données.",
      })
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
      {/* ═══ Header avec bande kante + motif savane ═══ */}
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div className="ds-kente-pattern border-b border-border bg-card">
          {/* Bande kente tricolore (vert/terre/or) — signature africaine */}
          <div className="ds-kente-strip" aria-hidden="true" />
          <div className="px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <GraduationCap className="h-6 w-6" />
                  </span>
                  Filières
                  <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isResponsable
                    ? 'Gérez les filières dont vous êtes responsable'
                    : 'Organisez et gérez les filières et formations de votre établissement'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCSV}
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Exporter</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exporter en CSV</TooltipContent>
                </Tooltip>
                <Button onClick={handleOpenCreate} className="ds-shimmer">
                  <Plus className="h-4 w-4" />
                  Nouvelle filière
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Stats : 4 StatCard (Total, Actives, Inactives, Étudiants) ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total filières"
          value={totalFilieres}
          icon={GraduationCap}
          accent="primary"
          loading={isLoading}
          index={0}
          hint="Toutes filières confondues"
        />
        <StatCard
          label="Actives"
          value={actifCount}
          icon={Leaf}
          accent="success"
          loading={isLoading}
          index={1}
          hint="Filières opérationnelles"
        />
        <StatCard
          label="Inactives"
          value={inactifCount}
          icon={AlertTriangle}
          accent="warning"
          loading={isLoading}
          index={2}
          hint="Filières suspendues"
        />
        <StatCard
          label="Étudiants"
          value={totalEtudiants}
          icon={Users}
          accent="info"
          loading={isLoading}
          index={3}
          hint="Inscriptions totales"
        />
      </div>

      {/* ═══ Bulk Action Toolbar ═══ */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium font-mono tabular-nums">
            {selectedIds.size} filière(s) sélectionnée(s)
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('activate')}
            className="border-primary/40 text-primary-text hover:bg-primary/10"
          >
            <Power className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activer</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('deactivate')}
            className="border-warning/40 text-warning hover:bg-warning/10"
          >
            <PowerOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Désactiver</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('delete')}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Supprimer</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Annuler la sélection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ═══ Search / Filter Toolbar ═══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une filière..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Rechercher une filière"
          />
          {searchInput && debouncedSearch !== searchInput && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Select
          value={etablissementFilter}
          onValueChange={setEtablissementFilter}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <Building2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Établissement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les établissements</SelectItem>
            {etablissements.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[130px]">
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
          onValueChange={(value) => {
            if (value) setViewMode(value as ViewMode)
          }}
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

      {/* ═══ Loading state ═══ */}
      {isLoading &&
        (viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="ds-kente-top">
                <CardContent className="p-0">
                  <PulseSkeleton className="aspect-video w-full rounded-none" variant="card" />
                  <div className="p-4 space-y-3">
                    <PulseSkeleton className="h-5 w-3/4" />
                    <PulseSkeleton className="h-4 w-1/2" />
                    <div className="flex gap-2 pt-2">
                      <PulseSkeleton className="h-8 w-20" />
                      <PulseSkeleton className="h-8 w-20" />
                      <PulseSkeleton className="h-8 w-20" />
                    </div>
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
        ))}

      {/* ═══ Empty state ═══ */}
      {!isLoading && filieres.length === 0 && (
        <div className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <GraduationCap className="h-10 w-10 text-primary-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">
            Aucune filière trouvée
          </h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {searchInput ||
            etablissementFilter !== 'all' ||
            statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par créer votre première filière.'}
          </p>
          {!searchInput &&
            etablissementFilter === 'all' &&
            statusFilter === 'all' && (
              <Button className="mt-6" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Créer une filière
              </Button>
            )}
        </div>
      )}

      {/* ═══ Card View (EntityCard) ═══ */}
      {!isLoading &&
        filieres.length > 0 &&
        viewMode === 'card' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filieres.map((filiere, i) => {
              const etudiantsCount = filiere._count?.etudiants ?? 0
              return (
                <div
                  key={filiere.id}
                  className={
                    selectedIds.has(filiere.id)
                      ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background rounded-lg'
                      : ''
                  }
                >
                  <EntityCard
                    title={filiere.nom}
                    subtitle={filiere.etablissement?.nom ?? '—'}
                    thumbnailIcon={GraduationCap}
                    badge={{
                      label: filiere.actif ? 'Actif' : 'Inactif',
                      variant: filiere.actif ? 'success' : 'warning',
                    }}
                    index={i}
                  >
                    {/* Checkbox + code badge */}
                    <div className="flex items-center justify-between mb-2 -mt-1">
                      <Checkbox
                        checked={selectedIds.has(filiere.id)}
                        onCheckedChange={() => toggleSelect(filiere.id)}
                        aria-label={`Sélectionner ${filiere.nom}`}
                      />
                      {filiere.code && (
                        <Badge
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          {filiere.code}
                        </Badge>
                      )}
                    </div>

                    {/* Responsable */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {filiere.responsable ? (
                        <>
                          <UserCheck className="h-3 w-3 text-info" />
                          <span className="truncate">
                            {filiere.responsable.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <UserCircle className="h-3 w-3 text-warning" />
                          <span className="italic text-warning">
                            Non assigné
                          </span>
                        </>
                      )}
                    </div>

                    {/* Students count */}
                    <div className="flex items-center gap-1.5 text-xs mt-1">
                      <Users className="h-3 w-3 text-primary-text" />
                      <span className="font-mono tabular-nums font-semibold">
                        {etudiantsCount}
                      </span>
                      <span className="text-muted-foreground">
                        étudiant{etudiantsCount > 1 ? 's' : ''}
                      </span>
                      {filiere.nbEtudiants !== null &&
                        filiere.nbEtudiants !== undefined && (
                          <span className="text-muted-foreground/70">
                            / {filiere.nbEtudiants} prévus
                          </span>
                        )}
                    </div>

                    {/* Description */}
                    {filiere.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
                        {filiere.description}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(filiere)}
                        className="h-7 text-xs border-primary/30 text-primary-text hover:bg-primary/10"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span className="hidden sm:inline">Modifier</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewDetail(filiere)}
                        className="h-7 w-7 p-0"
                        aria-label={`Voir les détails de ${filiere.nom}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleActive(filiere)}
                        className="h-7 w-7 p-0"
                        aria-label={
                          filiere.actif
                            ? `Désactiver ${filiere.nom}`
                            : `Activer ${filiere.nom}`
                        }
                      >
                        {filiere.actif ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDelete(filiere)}
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Supprimer ${filiere.nom}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </EntityCard>
                </div>
              )
            })}
          </div>
        )}

      {/* ═══ Table View ═══ */}
      {!isLoading &&
        filieres.length > 0 &&
        viewMode === 'table' && (
          <div className="rounded-lg border ds-kente-top overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el) {
                          ;(
                            el as HTMLButtonElement & {
                              indeterminate?: boolean
                            }
                          ).indeterminate = someSelected
                        }
                      }}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tout"
                    />
                  </TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden md:table-cell">Code</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Établissement
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Responsable
                  </TableHead>
                  <TableHead>Étudiants</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filieres.map((filiere) => (
                  <TableRow
                    key={filiere.id}
                    className={
                      selectedIds.has(filiere.id) ? 'bg-primary/5' : ''
                    }
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
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {filiere.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {filiere.code ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {filiere.code}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {filiere.etablissement?.nom ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {filiere.responsable ? (
                        <span className="text-sm">
                          {filiere.responsable.name}
                        </span>
                      ) : (
                        <span className="text-xs text-warning italic">
                          Non assigné
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="gap-1 text-xs font-mono tabular-nums"
                      >
                        <Users className="h-3 w-3" />
                        {filiere._count?.etudiants ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {filiere.actif ? (
                        <Badge className="bg-primary/15 text-primary-text border-primary/30 text-xs">
                          Actif
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-border text-xs">
                          Inactif
                        </Badge>
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
                          <DropdownMenuItem
                            onClick={() => handleOpenEdit(filiere)}
                          >
                            <Edit3 className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleViewDetail(filiere)}
                          >
                            <Eye className="h-4 w-4" />
                            Détails
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(filiere)}
                          >
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

      {/* ═══ Footer ═══ */}
      {!isLoading && filieres.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>
            <span className="font-mono tabular-nums font-semibold text-primary-text">
              {filieres.length}
            </span>{' '}
            filière(s) affichée(s)
            {selectedIds.size > 0 && (
              <span className="ml-2">
                ·{' '}
                <span className="font-mono tabular-nums">
                  {selectedIds.size}
                </span>{' '}
                sélectionnée(s)
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <Leaf className="h-3 w-3 text-primary-text" />
            Savane EdTech
          </span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          Dialogs
          ════════════════════════════════════════════════════════════════ */}

      {/* ─── Create/Edit Filiere Dialog (GlassModal) ─── */}
      <GlassModal
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title={editingFiliere ? 'Modifier la filière' : 'Nouvelle filière'}
        description={
          editingFiliere
            ? 'Modifiez les informations de la filière.'
            : 'Remplissez les informations pour créer une nouvelle filière.'
        }
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingFiliere ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <div className="ds-kente-pattern -m-5 p-5 space-y-4">
          {/* Nom */}
          <div className="space-y-2">
            <Label htmlFor="filiere-nom">
              Nom <span className="text-destructive">*</span>
            </Label>
            <Input
              id="filiere-nom"
              placeholder="Ex: Licence Informatique"
              value={formNom}
              onChange={(e) => setFormNom(e.target.value)}
              required
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="filiere-code">Code</Label>
              {suggestedFiliereCode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary-text hover:text-primary-text"
                  onClick={() => setFormCode(suggestedFiliereCode)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
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

          {/* Établissement (si l'utilisateur n'a pas déjà un établissement) */}
          {!user?.etablissementId && (
            <div className="space-y-2">
              <Label htmlFor="filiere-etablissement">
                Établissement <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formEtablissementId}
                onValueChange={setFormEtablissementId}
              >
                <SelectTrigger id="filiere-etablissement">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  {etablissements.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Responsable (si l'utilisateur n'a pas déjà un établissement) */}
          {!user?.etablissementId && (
            <div className="space-y-2">
              <Label htmlFor="filiere-responsable">Responsable</Label>
              <Select
                value={formResponsableId}
                onValueChange={setFormResponsableId}
              >
                <SelectTrigger id="filiere-responsable">
                  <SelectValue placeholder="Sélectionner un responsable" />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
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

          {/* Nb étudiants + Actif */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="filiere-nbetudiants">
                Nb étudiants (prévu)
              </Label>
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
      </GlassModal>

      {/* ─── Delete Confirmation Dialog (AlertDialog) ─── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteDependencies(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {deleteDependencies?.canDelete
                ? 'Supprimer définitivement'
                : 'Désactiver la filière'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Êtes-vous sûr de vouloir supprimer{' '}
                  <strong>{deleteTarget?.nom}</strong> ?
                </p>

                {/* Explication du type d'action */}
                {deleteDependencies?.canDelete ? (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm border border-destructive/20">
                    <p className="text-destructive font-medium flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Suppression DÉFINITIVE
                    </p>
                    <p className="text-destructive/80 mt-1">
                      La filière sera <strong>supprimée de la base de données</strong>.
                      Cette action est <strong>irréversible</strong>.
                      Les épreuves associées seront archivées (soft-delete).
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-warning/10 p-3 text-sm border border-warning/20">
                    <p className="text-warning font-medium flex items-center gap-2">
                      <PowerOff className="h-4 w-4" />
                      Désactivation (suppression logique)
                    </p>
                    <p className="text-warning/80 mt-1">
                      La filière sera <strong>désactivée</strong> (actif=false) mais
                      <strong> pas supprimée</strong>. Pour la supprimer définitivement,
                      transférez ou désactivez d'abord les étudiants et UEs liés.
                    </p>
                  </div>
                )}

                {deleteDependencies &&
                  (deleteDependencies.etudiantsCount > 0 ||
                    deleteDependencies.epreuvesCount > 0 ||
                    deleteDependencies.uesCount > 0) && (
                    <div className="rounded-lg bg-warning/10 p-3 text-sm space-y-1">
                      <p className="font-display font-medium text-warning">
                        Dépendances trouvées :
                      </p>
                      {deleteDependencies.etudiantsCount > 0 && (
                        <p className="text-warning">
                          •{' '}
                          <span className="font-mono tabular-nums">
                            {deleteDependencies.etudiantsCount}
                          </span>{' '}
                          étudiant(s) inscrit(s)
                        </p>
                      )}
                      {deleteDependencies.epreuvesCount > 0 && (
                        <p className="text-warning">
                          •{' '}
                          <span className="font-mono tabular-nums">
                            {deleteDependencies.epreuvesCount}
                          </span>{' '}
                          épreuve(s) associée(s)
                        </p>
                      )}
                      {deleteDependencies.uesCount > 0 && (
                        <p className="text-warning">
                          •{' '}
                          <span className="font-mono tabular-nums">
                            {deleteDependencies.uesCount}
                          </span>{' '}
                          unité(s) d&lsquo;enseignement
                        </p>
                      )}
                    </div>
                  )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                deleteDependencies?.canDelete
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-warning hover:bg-warning/90'
              }
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {deleteDependencies?.canDelete
                ? 'Supprimer définitivement'
                : 'Désactiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Action Confirmation Dialog (AlertDialog) ─── */}
      <AlertDialog
        open={!!bulkActionDialog}
        onOpenChange={(open) => {
          if (!open) setBulkActionDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display tracking-tight">
              {bulkActionDialog === 'delete' && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              {bulkActionDialog === 'activate' && (
                <Power className="h-5 w-5 text-primary-text" />
              )}
              {bulkActionDialog === 'deactivate' && (
                <PowerOff className="h-5 w-5 text-warning" />
              )}
              Confirmation d&lsquo;action groupée
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkActionDialog === 'delete'
                ? `Êtes-vous sûr de vouloir supprimer (désactiver) ${selectedIds.size} filière(s) ? Les étudiants et données associées ne seront pas perdus.`
                : `Êtes-vous sûr de vouloir ${
                    bulkActionDialog === 'activate'
                      ? 'activer'
                      : 'désactiver'
                  } ${selectedIds.size} filière(s) ?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                bulkActionDialog === 'delete'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : ''
              }
              onClick={handleBulkAction}
              disabled={isBulkProcessing}
            >
              {isBulkProcessing && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {bulkActionDialog ? bulkActionLabels[bulkActionDialog] : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Detail View Dialog (Dialog pour largeur max-w-3xl) ─── */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false)
            setDetailFiliere(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <GraduationCap className="h-5 w-5 text-primary-text" />
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
              <div className="ds-kente-pattern -mx-6 px-6 py-4 space-y-6">
                {/* Info section */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailFiliere.code && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Code :</span>
                      <Badge variant="outline" className="font-mono">
                        {detailFiliere.code}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-primary-text" />
                    <span className="text-muted-foreground">
                      Établissement :
                    </span>
                    <span className="font-medium">
                      {detailFiliere.etablissement?.nom ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Statut :</span>
                    {detailFiliere.actif ? (
                      <Badge className="bg-primary/15 text-primary-text border-primary/30">
                        Actif
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border">
                        Inactif
                      </Badge>
                    )}
                  </div>
                  {detailFiliere.responsable ? (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCheck className="h-3.5 w-3.5 text-info" />
                      <span className="text-muted-foreground">
                        Responsable :
                      </span>
                      <span className="font-medium">
                        {detailFiliere.responsable.name}
                      </span>
                      <span className="text-muted-foreground">
                        ({detailFiliere.responsable.email})
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCircle className="h-3.5 w-3.5 text-warning" />
                      <span className="text-warning italic">
                        Aucun responsable assigné
                      </span>
                    </div>
                  )}
                  {detailFiliere.nbEtudiants !== null &&
                    detailFiliere.nbEtudiants !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-3.5 w-3.5 text-info" />
                        <span className="text-muted-foreground">
                          Étudiants prévus :
                        </span>
                        <span className="font-medium font-mono tabular-nums">
                          {detailFiliere.nbEtudiants}
                        </span>
                      </div>
                    )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Créée le :</span>
                    <span>{formatDateFR(detailFiliere.createdAt)}</span>
                  </div>
                  {detailFiliere.updatedAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        Modifiée le :
                      </span>
                      <span>{formatDateFR(detailFiliere.updatedAt)}</span>
                    </div>
                  )}
                </div>

                {detailFiliere.description && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-display font-semibold mb-2">
                        Description
                      </h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {detailFiliere.description}
                      </p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Etudiants section */}
                <div>
                  <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary-text" />
                    Étudiants inscrits (
                    <span className="font-mono tabular-nums">
                      {detailFiliere.etudiants?.length ?? 0}
                    </span>
                    )
                  </h3>
                  {!detailFiliere.etudiants ||
                  detailFiliere.etudiants.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Aucun étudiant inscrit dans cette filière.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {detailFiliere.etudiants.map((etudiant) => (
                        <div
                          key={etudiant.id}
                          className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary-text font-mono tabular-nums shrink-0">
                              {etudiant.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {etudiant.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {etudiant.email}
                              </p>
                            </div>
                          </div>
                          {etudiant.actif ? (
                            <Badge className="bg-primary/15 text-primary-text border-primary/30 text-xs shrink-0">
                              Actif
                            </Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground border-border text-xs shrink-0">
                              Inactif
                            </Badge>
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
