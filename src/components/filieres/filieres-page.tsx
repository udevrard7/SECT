'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  GraduationCap,
  Plus,
  Search,
  Filter,
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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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

// ─── Utility functions ───



function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Main Component ───

export function FilieresPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [filieres, setFilieres] = useState<FiliereItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [etablissementFilter, setEtablissementFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingFiliere, setEditingFiliere] = useState<FiliereItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiliereItem | null>(null)

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
  const [etablissements, setEtablissements] = useState<EtablissementOption[]>([])
  const [responsables, setResponsables] = useState<ResponsableOption[]>([])

  // ─── Determine if user is Responsable ───
  const isResponsable = user?.role === 'RESPONSABLE'

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

  // ─── Fetch filieres ───
  const fetchFilieres = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (etablissementFilter && etablissementFilter !== 'all') params.set('etablissementId', etablissementFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      // If user is RESPONSABLE, filter to only their filieres
      if (isResponsable && user?.id) {
        params.set('responsableId', user.id)
      }

      const res = await fetch(`/api/filieres?${params.toString()}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setFilieres(data.filieres ?? [])
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [search, etablissementFilter, statusFilter, isResponsable, user?.id])

  // ─── Fetch etablissements & responsables ───
  const fetchOptions = useCallback(async () => {
    try {
      const [etabRes, respRes] = await Promise.all([
        fetch('/api/etablissements', { headers: getAuthHeaders() }),
        fetch('/api/users?role=RESPONSABLE&limit=100', { headers: getAuthHeaders() }),
      ])
      if (etabRes.ok) {
        const data = await etabRes.json()
        setEtablissements((data.etablissements ?? []).map((e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })))
      }
      if (respRes.ok) {
        const data = await respRes.json()
        setResponsables((data.users ?? []).map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email })))
      }
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  // ─── Stats ───
  const totalFilieres = filieres.length
  const totalEtudiants = filieres.reduce((acc, f) => acc + (f._count?.etudiants ?? 0), 0)
  const actifCount = filieres.filter((f) => f.actif).length
  const withResponsable = filieres.filter((f) => f.responsable).length

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingFiliere(null)
    setFormNom('')
    setFormCode('')
    // Auto-fill for RESPONSABLE: always their own établissement
    setFormEtablissementId(user?.etablissementId ?? '')
    // Auto-fill responsableId for RESPONSABLE users
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
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Filière créée', { description: `${formNom} a été ajoutée.` })
      }

      setCreateDialogOpen(false)
      await fetchFilieres()
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ actif: !filiere.actif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(filiere.actif ? 'Filière désactivée' : 'Filière activée', {
        description: `${filiere.nom} est maintenant ${filiere.actif ? 'inactive' : 'active'}.`,
      })
      await fetchFilieres()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/filieres/${deleteTarget.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Filière supprimée', { description: `${deleteTarget.nom} a été désactivée.` })
      setDeleteTarget(null)
      await fetchFilieres()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer la filière.' })
    }
  }

  // ─── View detail ───
  const handleViewDetail = async (filiere: FiliereItem) => {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const res = await fetch(`/api/filieres/${filiere.id}`, { headers: getAuthHeaders() })
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

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-emerald-600" />
            Gestion des Filières
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isResponsable
              ? 'Gérez les filières dont vous êtes responsable'
              : 'Organisez et gérez les filières et formations'}
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle filière
        </Button>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total filières</p>
              <p className="text-xl font-bold">{totalFilieres}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total étudiants</p>
              <p className="text-xl font-bold">{totalEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actives</p>
              <p className="text-xl font-bold">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec responsable</p>
              <p className="text-xl font-bold">{withResponsable}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search/Filter Toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une filière..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-muted" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-32 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-8 w-20 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filieres.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <GraduationCap className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune filière trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || etablissementFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par créer votre première filière.'}
          </p>
          {!search && etablissementFilter === 'all' && statusFilter === 'all' && (
            <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Créer une filière
            </Button>
          )}
        </div>
      )}

      {/* ─── Filiere card grid ─── */}
      {!isLoading && filieres.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filieres.map((filiere) => (
            <Card key={filiere.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold leading-tight">{filiere.nom}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {filiere.code && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {filiere.code}
                        </Badge>
                      )}

                    </div>
                  </div>
                  {filiere.actif ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs whitespace-nowrap">Actif</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs whitespace-nowrap">Inactif</Badge>
                  )}
                </div>

                {/* Etablissement */}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  {filiere.etablissement?.nom ?? '—'}
                </div>

                {/* Responsable */}
                <div className="flex items-center gap-1.5 text-sm">
                  {filiere.responsable ? (
                    <>
                      <UserCircle className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="text-muted-foreground">{filiere.responsable.name}</span>
                    </>
                  ) : (
                    <>
                      <UserCircle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400 text-xs italic">Non assigné</span>
                    </>
                  )}
                </div>

                {/* Student count */}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <Users className="h-3 w-3" />
                    {filiere._count?.etudiants ?? 0} étudiant{(filiere._count?.etudiants ?? 0) > 1 ? 's' : ''}
                  </Badge>
                  {filiere.nbEtudiants && (
                    <span className="text-xs text-muted-foreground">
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(filiere)}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(filiere)}
                  >
                    {filiere.actif ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5" />
                        Désactiver
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5" />
                        Activer
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetail(filiere)}
                    className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Détails
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create/Edit Filiere Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) setCreateDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
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
                    className="h-6 text-xs text-emerald-600 hover:text-emerald-700"
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
              className="bg-emerald-600 hover:bg-emerald-700"
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
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la filière</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.nom}</strong> ?
              Cette action désactivera la filière (suppression logique). Les étudiants associés ne seront pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Supprimer
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
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
              {detailFiliere?.nom ?? 'Détails de la filière'}
            </DialogTitle>
            <DialogDescription>
              Informations détaillées et étudiants inscrits
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-4 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
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
                    <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-muted-foreground">Établissement :</span>
                    <span className="font-medium">{detailFiliere.etablissement?.nom ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Statut :</span>
                    {detailFiliere.actif ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Actif</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">Inactif</Badge>
                    )}
                  </div>
                  {detailFiliere.responsable && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCircle className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-muted-foreground">Responsable :</span>
                      <span className="font-medium">{detailFiliere.responsable.name}</span>
                      <span className="text-muted-foreground">({detailFiliere.responsable.email})</span>
                    </div>
                  )}
                  {!detailFiliere.responsable && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <UserCircle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400 italic">Aucun responsable assigné</span>
                    </div>
                  )}
                  {detailFiliere.nbEtudiants && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-muted-foreground">Étudiants prévus :</span>
                      <span className="font-medium">{detailFiliere.nbEtudiants}</span>
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
                      <h3 className="text-sm font-semibold mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailFiliere.description}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Etudiants section */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Étudiants inscrits ({detailFiliere.etudiants?.length ?? 0})
                  </h3>
                  {(!detailFiliere.etudiants || detailFiliere.etudiants.length === 0) ? (
                    <p className="text-sm text-muted-foreground py-2">Aucun étudiant inscrit dans cette filière.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {detailFiliere.etudiants.map((etudiant) => (
                        <div key={etudiant.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {etudiant.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{etudiant.name}</p>
                              <p className="text-xs text-muted-foreground">{etudiant.email}</p>
                            </div>
                          </div>
                          {etudiant.actif ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">Actif</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
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
