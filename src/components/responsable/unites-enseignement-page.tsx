'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookMarked,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  BookOpen,
  UserCheck,
  Hash,
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

// ─── Types ───

interface FiliereOption {
  id: string
  nom: string
  code: string | null
}

interface AffectationItem {
  id: string
  enseignantId: string
  enseignant: { id: string; name: string; email: string }
  typeSeance: string
  groupe: string | null
  volumeHeures: number
  anneeUniversitaire: string
  statut: string
  commentaire: string | null
}

interface UEItem {
  id: string
  code: string
  nom: string
  description: string | null
  filiereId: string
  niveau: string
  semestre: number | null
  creditsECTS: number | null
  volumeHeuresCM: number
  volumeHeuresTD: number
  volumeHeuresTP: number
  obligatoire: boolean
  actif: boolean
  createdAt: string
  filiere: { id: string; nom: string; code: string | null }
  _count: { affectations: number }
  affectations?: AffectationItem[]
}

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT'] as const
const SEMESTRES = [1, 2] as const

const TYPE_SEANCE_LABELS: Record<string, string> = {
  CM: 'Cours Magistral',
  TD: 'Travaux Dirigés',
  TP: 'Travaux Pratiques',
}

const AFFECTATION_STATUT_COLORS: Record<string, string> = {
  PROVISOIRE: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  VALIDEE: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  PUBLIEE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
}

const NIVEAU_COLORS: Record<string, string> = {
  L1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  L2: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  L3: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  M1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  M2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  DOCTORAT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

// ─── Main Component ───

export function UnitesEnseignementPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [ues, setUes] = useState<UEItem[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [niveauFilter, setNiveauFilter] = useState('all')
  const [semestreFilter, setSemestreFilter] = useState('all')

  // ─── Expanded rows ───
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // ─── Dialog state ───
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [affectationsDialogOpen, setAffectationsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUE, setEditingUE] = useState<UEItem | null>(null)
  const [viewingUE, setViewingUE] = useState<UEItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UEItem | null>(null)

  // ─── Add form state ───
  const [addCode, setAddCode] = useState('')
  const [addNom, setAddNom] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addFiliereId, setAddFiliereId] = useState('')
  const [addNiveau, setAddNiveau] = useState('')
  const [addSemestre, setAddSemestre] = useState('')
  const [addCreditsECTS, setAddCreditsECTS] = useState('')
  const [addVolumeCM, setAddVolumeCM] = useState('0')
  const [addVolumeTD, setAddVolumeTD] = useState('0')
  const [addVolumeTP, setAddVolumeTP] = useState('0')
  const [addObligatoire, setAddObligatoire] = useState(true)

  // ─── Edit form state ───
  const [editCode, setEditCode] = useState('')
  const [editNom, setEditNom] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editFiliereId, setEditFiliereId] = useState('')
  const [editNiveau, setEditNiveau] = useState('')
  const [editSemestre, setEditSemestre] = useState('')
  const [editCreditsECTS, setEditCreditsECTS] = useState('')
  const [editVolumeCM, setEditVolumeCM] = useState('0')
  const [editVolumeTD, setEditVolumeTD] = useState('0')
  const [editVolumeTP, setEditVolumeTP] = useState('0')
  const [editObligatoire, setEditObligatoire] = useState(true)

  // ─── Fetch filieres for this responsable ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const filieresData = (data.filieres ?? []).map((f: FiliereOption) => ({
          id: f.id,
          nom: f.nom,
          code: f.code ?? null,
        }))
        setFilieres(filieresData)
      }
    } catch {
      // Silent
    }
  }, [user?.id])

  // ─── Fetch UEs ───
  const fetchUEs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
      if (search) params.set('search', search)
      if (filiereFilter && filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (niveauFilter && niveauFilter !== 'all') params.set('niveau', niveauFilter)
      if (semestreFilter && semestreFilter !== 'all') params.set('semestre', semestreFilter)

      const res = await fetch(`/api/unites-enseignement?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUes((data.unitesEnseignement ?? []) as UEItem[])
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, search, filiereFilter, niveauFilter, semestreFilter])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  useEffect(() => {
    fetchUEs()
  }, [fetchUEs])

  // ─── Stats ───
  const totalUEs = ues.length
  const uesAvecAffectation = ues.filter((ue) => ue._count.affectations > 0).length
  const volumeTotal = ues.reduce(
    (sum, ue) => sum + ue.volumeHeuresCM + ue.volumeHeuresTD + ue.volumeHeuresTP,
    0
  )
  const tauxCouverture = totalUEs > 0 ? Math.round((uesAvecAffectation / totalUEs) * 100) : 0

  // ─── Toggle expand row ───
  const toggleExpand = async (ue: UEItem) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(ue.id)) {
      newExpanded.delete(ue.id)
    } else {
      newExpanded.add(ue.id)
      // Fetch affectations if not already loaded
      if (!ue.affectations) {
        try {
          const res = await fetch(`/api/unites-enseignement/${ue.id}`)
          if (res.ok) {
            const data = await res.json()
            setUes((prev) =>
              prev.map((u) =>
                u.id === ue.id ? { ...u, affectations: data.uniteEnseignement.affectations } : u
              )
            )
          }
        } catch {
          // Silent
        }
      }
    }
    setExpandedRows(newExpanded)
  }

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setAddCode('')
    setAddNom('')
    setAddDescription('')
    setAddFiliereId(filieres.length === 1 ? filieres[0].id : '')
    setAddNiveau('')
    setAddSemestre('')
    setAddCreditsECTS('')
    setAddVolumeCM('0')
    setAddVolumeTD('0')
    setAddVolumeTP('0')
    setAddObligatoire(true)
    setAddDialogOpen(true)
  }

  // ─── Submit add ───
  const handleAddSubmit = async () => {
    if (!addCode || !addNom || !addFiliereId || !addNiveau) {
      toast.error('Champs manquants', {
        description: 'Le code, le nom, la filière et le niveau sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        code: addCode,
        nom: addNom,
        description: addDescription || null,
        filiereId: addFiliereId,
        niveau: addNiveau,
        semestre: addSemestre ? parseInt(addSemestre) : null,
        creditsECTS: addCreditsECTS ? parseInt(addCreditsECTS) : null,
        volumeHeuresCM: parseInt(addVolumeCM) || 0,
        volumeHeuresTD: parseInt(addVolumeTD) || 0,
        volumeHeuresTP: parseInt(addVolumeTP) || 0,
        obligatoire: addObligatoire,
      }

      const res = await fetch('/api/unites-enseignement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      toast.success('UE créée', { description: `${addNom} a été ajoutée avec succès.` })
      setAddDialogOpen(false)
      await fetchUEs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (ue: UEItem) => {
    setEditingUE(ue)
    setEditCode(ue.code)
    setEditNom(ue.nom)
    setEditDescription(ue.description ?? '')
    setEditFiliereId(ue.filiereId)
    setEditNiveau(ue.niveau)
    setEditSemestre(ue.semestre?.toString() ?? '')
    setEditCreditsECTS(ue.creditsECTS?.toString() ?? '')
    setEditVolumeCM(ue.volumeHeuresCM.toString())
    setEditVolumeTD(ue.volumeHeuresTD.toString())
    setEditVolumeTP(ue.volumeHeuresTP.toString())
    setEditObligatoire(ue.obligatoire)
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleEditSubmit = async () => {
    if (!editingUE) return
    if (!editCode || !editNom || !editFiliereId || !editNiveau) {
      toast.error('Champs manquants', {
        description: 'Le code, le nom, la filière et le niveau sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        code: editCode,
        nom: editNom,
        description: editDescription || null,
        filiereId: editFiliereId,
        niveau: editNiveau,
        semestre: editSemestre ? parseInt(editSemestre) : null,
        creditsECTS: editCreditsECTS ? parseInt(editCreditsECTS) : null,
        volumeHeuresCM: parseInt(editVolumeCM) || 0,
        volumeHeuresTD: parseInt(editVolumeTD) || 0,
        volumeHeuresTP: parseInt(editVolumeTP) || 0,
        obligatoire: editObligatoire,
      }

      const res = await fetch(`/api/unites-enseignement/${editingUE.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la modification')
      }

      toast.success('UE modifiée', { description: `${editNom} a été mise à jour.` })
      setEditDialogOpen(false)
      setEditingUE(null)
      await fetchUEs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Soft delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/unites-enseignement/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      toast.success('UE désactivée', {
        description: `${deleteTarget.nom} a été désactivée avec succès.`,
      })
      setDeleteTarget(null)
      await fetchUEs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    }
  }

  // ─── View affectations ───
  const handleViewAffectations = async (ue: UEItem) => {
    try {
      const res = await fetch(`/api/unites-enseignement/${ue.id}`)
      if (res.ok) {
        const data = await res.json()
        setViewingUE({ ...ue, affectations: data.uniteEnseignement.affectations })
        setAffectationsDialogOpen(true)
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les affectations.' })
    }
  }

  // ─── UE Form Component ───
  const UEForm = ({
    mode,
    code, setCode,
    nom, setNom,
    description, setDescription,
    filiereId, setFiliereId,
    niveau, setNiveau,
    semestre, setSemestre,
    creditsECTS, setCreditsECTS,
    volumeCM, setVolumeCM,
    volumeTD, setVolumeTD,
    volumeTP, setVolumeTP,
    obligatoire, setObligatoire,
  }: {
    mode: 'add' | 'edit'
    code: string; setCode: (v: string) => void
    nom: string; setNom: (v: string) => void
    description: string; setDescription: (v: string) => void
    filiereId: string; setFiliereId: (v: string) => void
    niveau: string; setNiveau: (v: string) => void
    semestre: string; setSemestre: (v: string) => void
    creditsECTS: string; setCreditsECTS: (v: string) => void
    volumeCM: string; setVolumeCM: (v: string) => void
    volumeTD: string; setVolumeTD: (v: string) => void
    volumeTP: string; setVolumeTP: (v: string) => void
    obligatoire: boolean; setObligatoire: (v: boolean) => void
  }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${mode}-code`}>Code *</Label>
          <Input
            id={`${mode}-code`}
            placeholder="Ex: UE-INF301"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${mode}-nom`}>Nom *</Label>
          <Input
            id={`${mode}-nom`}
            placeholder="Ex: Algorithmique avancée"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${mode}-description`}>Description</Label>
        <Textarea
          id={`${mode}-description`}
          placeholder="Description de l'UE (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Filière *</Label>
          <Select value={filiereId} onValueChange={setFiliereId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une filière" />
            </SelectTrigger>
            <SelectContent>
              {filieres.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nom}{f.code ? ` (${f.code})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Niveau *</Label>
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un niveau" />
            </SelectTrigger>
            <SelectContent>
              {NIVEAUX.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Semestre</Label>
          <Select value={semestre} onValueChange={setSemestre}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non défini</SelectItem>
              {SEMESTRES.map((s) => (
                <SelectItem key={s} value={s.toString()}>
                  Semestre {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${mode}-ects`}>Crédits ECTS</Label>
          <Input
            id={`${mode}-ects`}
            type="number"
            min="0"
            placeholder="Ex: 6"
            value={creditsECTS}
            onChange={(e) => setCreditsECTS(e.target.value)}
          />
        </div>
        <div className="space-y-2 flex items-end">
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id={`${mode}-obligatoire`}
              checked={obligatoire}
              onCheckedChange={(checked) => setObligatoire(checked === true)}
            />
            <Label htmlFor={`${mode}-obligatoire`} className="cursor-pointer">
              Obligatoire
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-500" />
          Volume horaire
        </Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${mode}-cm`} className="text-xs text-muted-foreground">Heures CM</Label>
            <Input
              id={`${mode}-cm`}
              type="number"
              min="0"
              value={volumeCM}
              onChange={(e) => setVolumeCM(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-td`} className="text-xs text-muted-foreground">Heures TD</Label>
            <Input
              id={`${mode}-td`}
              type="number"
              min="0"
              value={volumeTD}
              onChange={(e) => setVolumeTD(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-tp`} className="text-xs text-muted-foreground">Heures TP</Label>
            <Input
              id={`${mode}-tp`}
              type="number"
              min="0"
              value={volumeTP}
              onChange={(e) => setVolumeTP(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <BookMarked className="h-7 w-7 text-emerald-600" />
            Unités d&apos;enseignement
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les matières et unités d&apos;enseignement de vos filières
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4" />
          Ajouter une UE
        </Button>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <BookMarked className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total UEs</p>
              <p className="text-xl font-bold">{totalUEs}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <UserCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">UEs avec affectation</p>
              <p className="text-xl font-bold">{uesAvecAffectation}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Volume total</p>
              <p className="text-xl font-bold">{volumeTotal}h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux de couverture</p>
              <p className="text-xl font-bold">{tauxCouverture}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par code ou nom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filiereFilter} onValueChange={setFiliereFilter}>
          <SelectTrigger className="w-[200px]">
            <BookOpen className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Filière" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les filières</SelectItem>
            {filieres.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nom}{f.code ? ` (${f.code})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={niveauFilter} onValueChange={setNiveauFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous niveaux</SelectItem>
            {NIVEAUX.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={semestreFilter} onValueChange={setSemestreFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Semestre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous semestres</SelectItem>
            {SEMESTRES.map((s) => (
              <SelectItem key={s} value={s.toString()}>S{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-3">
          <div className="rounded-lg border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && ues.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookMarked className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune unité d&apos;enseignement trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || filiereFilter !== 'all' || niveauFilter !== 'all' || semestreFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par ajouter des unités d&apos;enseignement à vos filières.'}
          </p>
          {!search && filiereFilter === 'all' && niveauFilter === 'all' && semestreFilter === 'all' && (
            <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
              <Plus className="h-4 w-4" />
              Ajouter une UE
            </Button>
          )}
        </div>
      )}

      {/* ─── UE Table ─── */}
      {!isLoading && ues.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Filière</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Semestre</TableHead>
                <TableHead>ECTS</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Obligatoire</TableHead>
                <TableHead className="text-center">Affect.</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ues.map((ue) => {
                const isExpanded = expandedRows.has(ue.id)
                const totalHours = ue.volumeHeuresCM + ue.volumeHeuresTD + ue.volumeHeuresTP
                return (
                  <UETableRow
                    key={ue.id}
                    ue={ue}
                    isExpanded={isExpanded}
                    onToggle={toggleExpand}
                    onEdit={handleOpenEdit}
                    onDelete={setDeleteTarget}
                    onViewAffectations={handleViewAffectations}
                    totalHours={totalHours}
                  />
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Add UE Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-emerald-600" />
              Ajouter une UE
            </DialogTitle>
            <DialogDescription>
              Créez une nouvelle unité d&apos;enseignement dans vos filières.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <UEForm
              mode="add"
              code={addCode} setCode={setAddCode}
              nom={addNom} setNom={setAddNom}
              description={addDescription} setDescription={setAddDescription}
              filiereId={addFiliereId} setFiliereId={setAddFiliereId}
              niveau={addNiveau} setNiveau={setAddNiveau}
              semestre={addSemestre} setSemestre={setAddSemestre}
              creditsECTS={addCreditsECTS} setCreditsECTS={setAddCreditsECTS}
              volumeCM={addVolumeCM} setVolumeCM={setAddVolumeCM}
              volumeTD={addVolumeTD} setVolumeTD={setAddVolumeTD}
              volumeTP={addVolumeTP} setVolumeTP={setAddVolumeTP}
              obligatoire={addObligatoire} setObligatoire={setAddObligatoire}
            />
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleAddSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer l&apos;UE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit UE Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-amber-600" />
              Modifier l&apos;UE
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de l&apos;unité d&apos;enseignement.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <UEForm
              mode="edit"
              code={editCode} setCode={setEditCode}
              nom={editNom} setNom={setEditNom}
              description={editDescription} setDescription={setEditDescription}
              filiereId={editFiliereId} setFiliereId={setEditFiliereId}
              niveau={editNiveau} setNiveau={setEditNiveau}
              semestre={editSemestre} setSemestre={setEditSemestre}
              creditsECTS={editCreditsECTS} setCreditsECTS={setEditCreditsECTS}
              volumeCM={editVolumeCM} setVolumeCM={setEditVolumeCM}
              volumeTD={editVolumeTD} setVolumeTD={setEditVolumeTD}
              volumeTP={editVolumeTP} setVolumeTP={setEditVolumeTP}
              obligatoire={editObligatoire} setObligatoire={setEditObligatoire}
            />
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleEditSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Affectations Dialog ─── */}
      <Dialog open={affectationsDialogOpen} onOpenChange={(open) => { if (!open) setAffectationsDialogOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-teal-600" />
              Affectations — {viewingUE?.code} {viewingUE?.nom}
            </DialogTitle>
            <DialogDescription>
              Enseignants affectés à cette unité d&apos;enseignement
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {viewingUE?.affectations && viewingUE.affectations.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enseignant</TableHead>
                      <TableHead>Type séance</TableHead>
                      <TableHead>Groupe</TableHead>
                      <TableHead>Heures</TableHead>
                      <TableHead>Année</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingUE.affectations.map((aff) => (
                      <TableRow key={aff.id}>
                        <TableCell className="font-medium">{aff.enseignant.name}</TableCell>
                        <TableCell>{TYPE_SEANCE_LABELS[aff.typeSeance] || aff.typeSeance}</TableCell>
                        <TableCell>{aff.groupe || '—'}</TableCell>
                        <TableCell>{aff.volumeHeures}h</TableCell>
                        <TableCell>{aff.anneeUniversitaire}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${AFFECTATION_STATUT_COLORS[aff.statut] || ''}`}>
                            {aff.statut}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserCheck className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune affectation pour cette UE</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAffectationsDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver l&apos;UE</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir désactiver l&apos;UE <strong>{deleteTarget?.code} — {deleteTarget?.nom}</strong> ?
              Elle ne sera pas supprimée définitivement mais ne sera plus visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── UE Table Row with expandable affectations ───

function UETableRow({
  ue,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onViewAffectations,
  totalHours,
}: {
  ue: UEItem
  isExpanded: boolean
  onToggle: (ue: UEItem) => void
  onEdit: (ue: UEItem) => void
  onDelete: (ue: UEItem) => void
  onViewAffectations: (ue: UEItem) => void
  totalHours: number
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onToggle(ue)}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono text-sm font-medium">{ue.code}</TableCell>
        <TableCell className="font-medium">{ue.nom}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{ue.filiere.nom}</TableCell>
        <TableCell>
          <Badge className={`text-xs ${NIVEAU_COLORS[ue.niveau] || ''}`}>
            {ue.niveau}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">{ue.semestre ? `S${ue.semestre}` : '—'}</TableCell>
        <TableCell className="text-sm">{ue.creditsECTS ?? '—'}</TableCell>
        <TableCell className="text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            {totalHours}h
          </span>
        </TableCell>
        <TableCell>
          {ue.obligatoire ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">
              Oblig.
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Opt.
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge
            variant="secondary"
            className={`text-xs ${
              ue._count.affectations > 0
                ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {ue._count.affectations}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              onClick={() => onEdit(ue)}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950"
              onClick={() => onViewAffectations(ue)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => onDelete(ue)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded row - Affectations */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={11} className="bg-muted/30 p-0">
            <ExpandedAffectations ue={ue} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ─── Expanded Affectations Panel ───

function ExpandedAffectations({ ue }: { ue: UEItem }) {
  const [affectations, setAffectations] = useState<AffectationItem[] | null>(ue.affectations ?? null)
  const [loading, setLoading] = useState(!ue.affectations)

  useEffect(() => {
    if (!ue.affectations) {
      const fetchAffectations = async () => {
        try {
          const res = await fetch(`/api/unites-enseignement/${ue.id}`)
          if (res.ok) {
            const data = await res.json()
            setAffectations(data.uniteEnseignement.affectations)
          }
        } catch {
          // Silent
        } finally {
          setLoading(false)
        }
      }
      fetchAffectations()
    }
  }, [ue.id, ue.affectations])

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (!affectations || affectations.length === 0) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Hash className="h-4 w-4" />
        Aucune affectation pour cette UE
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Enseignant</TableHead>
              <TableHead>Type séance</TableHead>
              <TableHead>Groupe</TableHead>
              <TableHead>Heures</TableHead>
              <TableHead>Année</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {affectations.map((aff) => (
              <TableRow key={aff.id}>
                <TableCell className="font-medium text-sm">{aff.enseignant.name}</TableCell>
                <TableCell className="text-sm">{TYPE_SEANCE_LABELS[aff.typeSeance] || aff.typeSeance}</TableCell>
                <TableCell className="text-sm">{aff.groupe || '—'}</TableCell>
                <TableCell className="text-sm">{aff.volumeHeures}h</TableCell>
                <TableCell className="text-sm">{aff.anneeUniversitaire}</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${AFFECTATION_STATUT_COLORS[aff.statut] || ''}`}>
                    {aff.statut}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
