'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UserCheck,
  Plus,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  Send,
  Loader2,
  BookOpen,
  Users,
  PieChart,
  GraduationCap,
  AlertTriangle,
  Grid3X3,
  List,
  Filter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface AffectationItem {
  id: string
  enseignantId: string
  uniteEnseignementId: string
  typeSeance: 'CM' | 'TD' | 'TP'
  groupe: string | null
  volumeHeures: number
  anneeUniversitaire: string
  statut: 'PROVISOIRE' | 'VALIDEE' | 'PUBLIEE'
  commentaire: string | null
  createdAt: string
  updatedAt: string
  enseignant: {
    id: string
    name: string
    email: string
  }
  uniteEnseignement: {
    id: string
    code: string
    nom: string
    niveau: string
    filiere: {
      id: string
      nom: string
      code: string | null
      niveau: string | null
    }
  }
}

interface UEItem {
  id: string
  code: string
  nom: string
  niveau: string
  filiereId: string
  filiere: {
    id: string
    nom: string
    code: string | null
    niveau: string | null
  }
  volumeHeuresCM: number
  volumeHeuresTD: number
  volumeHeuresTP: number
  _count: {
    affectations: number
  }
}

interface EnseignantOption {
  id: string
  name: string
  email: string
}

interface FiliereOption {
  id: string
  nom: string
  code: string | null
  niveau: string | null
}

// ─── Badge helpers ───

function getTypeSeanceBadge(typeSeance: string): React.ReactNode {
  switch (typeSeance) {
    case 'CM':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">CM</Badge>
    case 'TD':
      return <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 text-xs">TD</Badge>
    case 'TP':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 text-xs">TP</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{typeSeance}</Badge>
  }
}

function getStatutBadge(statut: string): React.ReactNode {
  switch (statut) {
    case 'PROVISOIRE':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 text-xs">Provisoire</Badge>
    case 'VALIDEE':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">Validée</Badge>
    case 'PUBLIEE':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800 text-xs">Publiée</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{statut}</Badge>
  }
}

function getNiveauBadge(niveau: string): React.ReactNode {
  const isLicence = niveau.startsWith('L')
  return (
    <Badge className={`text-xs ${
      isLicence
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
        : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    }`}>
      {niveau}
    </Badge>
  )
}

// ─── Main Component ───

export function AffectationsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [affectations, setAffectations] = useState<AffectationItem[]>([])
  const [unitesEnseignement, setUnitesEnseignement] = useState<UEItem[]>([])
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [niveauFilter, setNiveauFilter] = useState('all')
  const [enseignantSearch, setEnseignantSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [anneeFilter, setAnneeFilter] = useState('2024-2025')

  // ─── Matrix filter state ───
  const [matrixFiliereFilter, setMatrixFiliereFilter] = useState('all')
  const [matrixNiveauFilter, setMatrixNiveauFilter] = useState('all')

  // ─── Dialog state ───
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingAffectation, setEditingAffectation] = useState<AffectationItem | null>(null)

  // ─── Confirm dialog state ───
  const [confirmAction, setConfirmAction] = useState<{
    type: 'validate' | 'publish' | 'delete'
    affectation: AffectationItem
  } | null>(null)

  // ─── Add form state ───
  const [addEnseignantId, setAddEnseignantId] = useState('')
  const [addUEId, setAddUEId] = useState('')
  const [addTypeSeance, setAddTypeSeance] = useState<'CM' | 'TD' | 'TP'>('CM')
  const [addGroupe, setAddGroupe] = useState('')
  const [addVolumeHeures, setAddVolumeHeures] = useState('')
  const [addAnnee, setAddAnnee] = useState('2024-2025')
  const [addCommentaire, setAddCommentaire] = useState('')

  // ─── Edit form state ───
  const [editTypeSeance, setEditTypeSeance] = useState<'CM' | 'TD' | 'TP'>('CM')
  const [editGroupe, setEditGroupe] = useState('')
  const [editVolumeHeures, setEditVolumeHeures] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')

  // ─── Fetch filieres ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFilieres((data.filieres ?? []).map((f: FiliereOption) => ({
          id: f.id,
          nom: f.nom,
          code: f.code ?? null,
          niveau: f.niveau ?? null,
        })))
      }
    } catch {
      // Silent
    }
  }, [user?.id])

  // ─── Fetch affectations ───
  const fetchAffectations = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('responsableId', user.id)
      if (filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (niveauFilter !== 'all') params.set('niveau', niveauFilter)
      if (statutFilter !== 'all') params.set('statut', statutFilter)
      if (anneeFilter) params.set('anneeUniversitaire', anneeFilter)

      const res = await fetch(`/api/affectations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAffectations(data.affectations ?? [])
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, filiereFilter, niveauFilter, statutFilter, anneeFilter])

  // ─── Fetch UE list ───
  const fetchUEs = useCallback(async () => {
    if (!user?.id) return
    try {
      const params = new URLSearchParams()
      params.set('responsableId', user.id)
      params.set('actif', 'true')

      const res = await fetch(`/api/unites-enseignement?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUnitesEnseignement(data.unitesEnseignement ?? [])
      }
    } catch {
      // Silent
    }
  }, [user?.id])

  // ─── Fetch enseignants ───
  const fetchEnseignants = useCallback(async () => {
    if (!user?.etablissementId) return
    try {
      const params = new URLSearchParams()
      params.set('role', 'ENSEIGNANT')
      params.set('limit', '200')
      params.set('actif', 'true')
      if (user.etablissementId) params.set('etablissementId', user.etablissementId)

      const res = await fetch(`/api/users?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEnseignants((data.users ?? []).map((u: { id: string; name: string; email: string }) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        })))
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  useEffect(() => {
    fetchAffectations()
  }, [fetchAffectations])

  useEffect(() => {
    fetchUEs()
  }, [fetchUEs])

  useEffect(() => {
    fetchEnseignants()
  }, [fetchEnseignants])

  // ─── Filtered enseignants for select ───
  const filteredEnseignants = useMemo(() => {
    if (!enseignantSearch) return enseignants
    const searchLower = enseignantSearch.toLowerCase()
    return enseignants.filter(
      (e) => e.name.toLowerCase().includes(searchLower) || e.email.toLowerCase().includes(searchLower)
    )
  }, [enseignants, enseignantSearch])

  // ─── Filtered affectations for table ───
  const filteredAffectations = useMemo(() => {
    let result = affectations

    if (enseignantSearch) {
      const searchLower = enseignantSearch.toLowerCase()
      result = result.filter(
        (a) =>
          a.enseignant.name.toLowerCase().includes(searchLower) ||
          a.enseignant.email.toLowerCase().includes(searchLower)
      )
    }

    return result
  }, [affectations, enseignantSearch])

  // ─── Stats ───
  const totalAffectations = affectations.length
  const affectationsValidees = affectations.filter((a) => a.statut === 'VALIDEE' || a.statut === 'PUBLIEE').length
  const uesWithAffectation = new Set(affectations.map((a) => a.uniteEnseignementId)).size
  const totalUEs = unitesEnseignement.length
  const tauxCouverture = totalUEs > 0 ? Math.round((uesWithAffectation / totalUEs) * 100) : 0
  const enseignantsActifs = new Set(affectations.map((a) => a.enseignantId)).size

  // ─── Matrix data ───
  const matrixData = useMemo(() => {
    let ues = unitesEnseignement
    let affs = affectations

    if (matrixFiliereFilter !== 'all') {
      ues = ues.filter((ue) => ue.filiereId === matrixFiliereFilter)
      affs = affs.filter((a) => a.uniteEnseignement.filiere.id === matrixFiliereFilter)
    }
    if (matrixNiveauFilter !== 'all') {
      ues = ues.filter((ue) => ue.niveau === matrixNiveauFilter)
      affs = affs.filter((a) => a.uniteEnseignement.niveau === matrixNiveauFilter)
    }

    // Group UEs by filiere
    const grouped = ues.reduce<Record<string, UEItem[]>>((acc, ue) => {
      const key = ue.filiere.nom
      if (!acc[key]) acc[key] = []
      acc[key].push(ue)
      return acc
    }, {})

    // Build matrix rows
    const rows = ues.map((ue) => {
      const ueAffectations = affs.filter((a) => a.uniteEnseignementId === ue.id)
      const cm = ueAffectations.filter((a) => a.typeSeance === 'CM').map((a) => a.enseignant.name)
      const td = ueAffectations.filter((a) => a.typeSeance === 'TD').map((a) => a.enseignant.name)
      const tp = ueAffectations.filter((a) => a.typeSeance === 'TP').map((a) => a.enseignant.name)

      return {
        ue,
        cm,
        td,
        tp,
        hasCM: cm.length > 0 || ue.volumeHeuresCM === 0,
        hasTD: td.length > 0 || ue.volumeHeuresTD === 0,
        hasTP: tp.length > 0 || ue.volumeHeuresTP === 0,
      }
    })

    return { grouped, rows }
  }, [unitesEnseignement, affectations, matrixFiliereFilter, matrixNiveauFilter])

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setAddEnseignantId('')
    setAddUEId('')
    setAddTypeSeance('CM')
    setAddGroupe('')
    setAddVolumeHeures('')
    setAddAnnee(anneeFilter || '2024-2025')
    setAddCommentaire('')
    setAddDialogOpen(true)
  }

  // ─── Submit add ───
  const handleAddSubmit = async () => {
    if (!addEnseignantId) {
      toast.error('Champ manquant', { description: 'Sélectionnez un enseignant.' })
      return
    }
    if (!addUEId) {
      toast.error('Champ manquant', { description: 'Sélectionnez une unité d\'enseignement.' })
      return
    }
    if (!addVolumeHeures || parseFloat(addVolumeHeures) <= 0) {
      toast.error('Champ manquant', { description: 'Le volume horaire doit être un nombre positif.' })
      return
    }
    if (!addAnnee) {
      toast.error('Champ manquant', { description: 'L\'année universitaire est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/affectations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enseignantId: addEnseignantId,
          uniteEnseignementId: addUEId,
          typeSeance: addTypeSeance,
          groupe: addGroupe || null,
          volumeHeures: parseFloat(addVolumeHeures),
          anneeUniversitaire: addAnnee,
          commentaire: addCommentaire || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      toast.success('Affectation créée', { description: 'L\'affectation a été ajoutée avec succès.' })
      setAddDialogOpen(false)
      await fetchAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (affectation: AffectationItem) => {
    setEditingAffectation(affectation)
    setEditTypeSeance(affectation.typeSeance)
    setEditGroupe(affectation.groupe ?? '')
    setEditVolumeHeures(affectation.volumeHeures.toString())
    setEditCommentaire(affectation.commentaire ?? '')
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleEditSubmit = async () => {
    if (!editingAffectation) return

    if (!editVolumeHeures || parseFloat(editVolumeHeures) <= 0) {
      toast.error('Champ invalide', { description: 'Le volume horaire doit être un nombre positif.' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/affectations/${editingAffectation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeSeance: editTypeSeance,
          groupe: editGroupe || null,
          volumeHeures: parseFloat(editVolumeHeures),
          commentaire: editCommentaire || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la modification')
      }

      toast.success('Affectation modifiée', { description: 'Les modifications ont été enregistrées.' })
      setEditDialogOpen(false)
      setEditingAffectation(null)
      await fetchAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Validate affectation ───
  const handleValidate = async () => {
    if (!confirmAction) return
    try {
      const res = await fetch(`/api/affectations/${confirmAction.affectation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'VALIDEE' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la validation')
      }
      toast.success('Affectation validée', {
        description: `${confirmAction.affectation.enseignant.name} → ${confirmAction.affectation.uniteEnseignement.nom}`,
      })
      setConfirmAction(null)
      await fetchAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── Publish affectation ───
  const handlePublish = async () => {
    if (!confirmAction) return
    try {
      const res = await fetch(`/api/affectations/${confirmAction.affectation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'PUBLIEE' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la publication')
      }
      toast.success('Affectation publiée', {
        description: `${confirmAction.affectation.enseignant.name} → ${confirmAction.affectation.uniteEnseignement.nom}`,
      })
      setConfirmAction(null)
      await fetchAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── Delete affectation ───
  const handleDelete = async () => {
    if (!confirmAction) return
    try {
      const res = await fetch(`/api/affectations/${confirmAction.affectation.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      toast.success('Affectation supprimée', {
        description: 'L\'affectation a été supprimée avec succès.',
      })
      setConfirmAction(null)
      await fetchAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── UE label for select ───
  const getUELabel = (ue: UEItem) => {
    return `${ue.code} — ${ue.nom} (${ue.filiere.nom}, ${ue.niveau})`
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-emerald-600" />
            Affectations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Affectez les enseignants aux unités d&apos;enseignement et classes
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4" />
          Nouvelle affectation
        </Button>
      </div>

      {/* ─── Stats row ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total affectations</p>
              <p className="text-xl font-bold">{totalAffectations}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Validées</p>
              <p className="text-xl font-bold">{affectationsValidees}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <PieChart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux couverture</p>
              <p className="text-xl font-bold">{tauxCouverture}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enseignants actifs</p>
              <p className="text-xl font-bold">{enseignantsActifs}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Tabs ─── */}
      <Tabs defaultValue="table" className="space-y-4">
        <TabsList>
          <TabsTrigger value="table" className="gap-1.5">
            <List className="h-4 w-4" />
            Vue par affectation
          </TabsTrigger>
          <TabsTrigger value="matrix" className="gap-1.5">
            <Grid3X3 className="h-4 w-4" />
            Matrice d&apos;affectation
          </TabsTrigger>
        </TabsList>

        {/* ═══ Tab 1: Vue par affectation ═══ */}
        <TabsContent value="table" className="space-y-4">
          {/* ─── Filters ─── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un enseignant..."
                value={enseignantSearch}
                onChange={(e) => setEnseignantSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filiereFilter} onValueChange={setFiliereFilter}>
              <SelectTrigger className="w-[200px]">
                <GraduationCap className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Filière" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les filières</SelectItem>
                {filieres.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={niveauFilter} onValueChange={setNiveauFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="L1">L1</SelectItem>
                <SelectItem value="L2">L2</SelectItem>
                <SelectItem value="L3">L3</SelectItem>
                <SelectItem value="M1">M1</SelectItem>
                <SelectItem value="M2">M2</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="PROVISOIRE">Provisoire</SelectItem>
                <SelectItem value="VALIDEE">Validée</SelectItem>
                <SelectItem value="PUBLIEE">Publiée</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={anneeFilter}
              onChange={(e) => setAnneeFilter(e.target.value)}
              className="w-[140px]"
              placeholder="Année univ."
            />
          </div>

          {/* ─── Loading state ─── */}
          {isLoading && (
            <Card>
              <CardContent className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ─── Empty state ─── */}
          {!isLoading && filteredAffectations.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <UserCheck className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune affectation trouvée</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                {enseignantSearch || filiereFilter !== 'all' || niveauFilter !== 'all' || statutFilter !== 'all'
                  ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
                  : 'Commencez par affecter des enseignants aux unités d\'enseignement.'}
              </p>
              {!enseignantSearch && filiereFilter === 'all' && niveauFilter === 'all' && statutFilter === 'all' && (
                <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
                  <Plus className="h-4 w-4" />
                  Nouvelle affectation
                </Button>
              )}
            </div>
          )}

          {/* ─── Affectations table ─── */}
          {!isLoading && filteredAffectations.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Enseignant</TableHead>
                        <TableHead>Unité d&apos;enseignement</TableHead>
                        <TableHead>Filière</TableHead>
                        <TableHead>Niveau</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Groupe</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Année</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAffectations.map((affectation) => (
                        <TableRow key={affectation.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{affectation.enseignant.name}</p>
                              <p className="text-xs text-muted-foreground">{affectation.enseignant.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{affectation.uniteEnseignement.code}</p>
                              <p className="text-xs text-muted-foreground">{affectation.uniteEnseignement.nom}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {affectation.uniteEnseignement.filiere.nom}
                          </TableCell>
                          <TableCell>
                            {getNiveauBadge(affectation.uniteEnseignement.niveau)}
                          </TableCell>
                          <TableCell>
                            {getTypeSeanceBadge(affectation.typeSeance)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {affectation.groupe || '—'}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {affectation.volumeHeures}h
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {affectation.anneeUniversitaire}
                          </TableCell>
                          <TableCell>
                            {getStatutBadge(affectation.statut)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {affectation.statut === 'PROVISOIRE' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                                    onClick={() => handleOpenEdit(affectation)}
                                    title="Modifier"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                    onClick={() => setConfirmAction({ type: 'delete', affectation })}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950"
                                    onClick={() => setConfirmAction({ type: 'validate', affectation })}
                                    title="Valider"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    <span className="text-xs">Valider</span>
                                  </Button>
                                </>
                              )}
                              {affectation.statut === 'VALIDEE' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                                  onClick={() => setConfirmAction({ type: 'publish', affectation })}
                                  title="Publier"
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                  <span className="text-xs">Publier</span>
                                </Button>
                              )}
                              {affectation.statut === 'PUBLIEE' && (
                                <span className="text-xs text-muted-foreground px-2">—</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ Tab 2: Matrice d'affectation ═══ */}
        <TabsContent value="matrix" className="space-y-4">
          {/* ─── Matrix filters ─── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={matrixFiliereFilter} onValueChange={setMatrixFiliereFilter}>
              <SelectTrigger className="w-[220px]">
                <GraduationCap className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Filière" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les filières</SelectItem>
                {filieres.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={matrixNiveauFilter} onValueChange={setMatrixNiveauFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous niveaux</SelectItem>
                <SelectItem value="L1">L1</SelectItem>
                <SelectItem value="L2">L2</SelectItem>
                <SelectItem value="L3">L3</SelectItem>
                <SelectItem value="M1">M1</SelectItem>
                <SelectItem value="M2">M2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ─── Matrix empty state ─── */}
          {matrixData.rows.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <Grid3X3 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune unité d&apos;enseignement</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Aucune UE ne correspond à vos filtres. Créez des unités d&apos;enseignement dans vos filières pour voir la matrice.
              </p>
            </div>
          )}

          {/* ─── Matrix grid ─── */}
          {matrixData.rows.length > 0 && (
            <div className="space-y-6">
              {Object.entries(matrixData.grouped).map(([filiereNom, ues]) => {
                const filiereRows = matrixData.rows.filter((r) => r.ue.filiere.nom === filiereNom)
                return (
                  <Card key={filiereNom}>
                    <CardContent className="p-0">
                      <div className="px-4 py-3 border-b bg-muted/30">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-emerald-600" />
                          {filiereNom}
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Unité d&apos;enseignement</TableHead>
                              <TableHead className="w-[60px] text-center">Niveau</TableHead>
                              <TableHead className="text-center">CM</TableHead>
                              <TableHead className="text-center">TD</TableHead>
                              <TableHead className="text-center">TP</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filiereRows.map((row) => (
                              <TableRow key={row.ue.id}>
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-medium">{row.ue.code}</p>
                                    <p className="text-xs text-muted-foreground">{row.ue.nom}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {getNiveauBadge(row.ue.niveau)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <MatrixCell
                                    names={row.cm}
                                    needed={row.ue.volumeHeuresCM > 0}
                                    covered={row.hasCM}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MatrixCell
                                    names={row.td}
                                    needed={row.ue.volumeHeuresTD > 0}
                                    covered={row.hasTD}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MatrixCell
                                    names={row.tp}
                                    needed={row.ue.volumeHeuresTP > 0}
                                    covered={row.hasTP}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Add Affectation Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Nouvelle affectation
            </DialogTitle>
            <DialogDescription>
              Affectez un enseignant à une unité d&apos;enseignement.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label>Enseignant *</Label>
              <Select value={addEnseignantId} onValueChange={setAddEnseignantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un enseignant" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {enseignants.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Aucun enseignant disponible
                    </div>
                  ) : (
                    enseignants.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <div className="flex flex-col">
                          <span>{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.email}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unité d&apos;enseignement *</Label>
              <Select value={addUEId} onValueChange={setAddUEId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une UE" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {unitesEnseignement.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Aucune UE disponible
                    </div>
                  ) : (
                    unitesEnseignement.map((ue) => (
                      <SelectItem key={ue.id} value={ue.id}>
                        <div className="flex flex-col">
                          <span>{ue.code} — {ue.nom}</span>
                          <span className="text-xs text-muted-foreground">{ue.filiere.nom} • {ue.niveau}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type de séance *</Label>
                <Select value={addTypeSeance} onValueChange={(v) => setAddTypeSeance(v as 'CM' | 'TD' | 'TP')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CM">CM — Cours Magistral</SelectItem>
                    <SelectItem value="TD">TD — Travaux Dirigés</SelectItem>
                    <SelectItem value="TP">TP — Travaux Pratiques</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Groupe</Label>
                <Input
                  placeholder="Ex: Groupe A"
                  value={addGroupe}
                  onChange={(e) => setAddGroupe(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Volume horaire (h) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.5"
                  placeholder="Ex: 24"
                  value={addVolumeHeures}
                  onChange={(e) => setAddVolumeHeures(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Année universitaire *</Label>
                <Input
                  placeholder="Ex: 2024-2025"
                  value={addAnnee}
                  onChange={(e) => setAddAnnee(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Commentaire</Label>
              <Textarea
                placeholder="Commentaire optionnel..."
                value={addCommentaire}
                onChange={(e) => setAddCommentaire(e.target.value)}
                rows={3}
              />
            </div>
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
              Créer l&apos;affectation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Affectation Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-emerald-600" />
              Modifier l&apos;affectation
            </DialogTitle>
            <DialogDescription>
              {editingAffectation && (
                <span>
                  {editingAffectation.enseignant.name} → {editingAffectation.uniteEnseignement.code} ({editingAffectation.uniteEnseignement.nom})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Read-only display */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Enseignant</span>
                <span className="font-medium">{editingAffectation?.enseignant.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">UE</span>
                <span className="font-medium">{editingAffectation?.uniteEnseignement.code} — {editingAffectation?.uniteEnseignement.nom}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Filière</span>
                <span className="font-medium">{editingAffectation?.uniteEnseignement.filiere.nom}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type de séance</Label>
              <Select value={editTypeSeance} onValueChange={(v) => setEditTypeSeance(v as 'CM' | 'TD' | 'TP')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CM">CM — Cours Magistral</SelectItem>
                  <SelectItem value="TD">TD — Travaux Dirigés</SelectItem>
                  <SelectItem value="TP">TP — Travaux Pratiques</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Groupe</Label>
                <Input
                  placeholder="Ex: Groupe A"
                  value={editGroupe}
                  onChange={(e) => setEditGroupe(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Volume horaire (h)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.5"
                  value={editVolumeHeures}
                  onChange={(e) => setEditVolumeHeures(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Commentaire</Label>
              <Textarea
                placeholder="Commentaire optionnel..."
                value={editCommentaire}
                onChange={(e) => setEditCommentaire(e.target.value)}
                rows={3}
              />
            </div>
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

      {/* ─── Confirm Action Dialog ─── */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmAction?.type === 'validate' && <CheckCircle2 className="h-5 w-5 text-teal-600" />}
              {confirmAction?.type === 'publish' && <Send className="h-5 w-5 text-blue-600" />}
              {confirmAction?.type === 'delete' && <AlertTriangle className="h-5 w-5 text-red-600" />}
              {confirmAction?.type === 'validate' && 'Valider l\'affectation'}
              {confirmAction?.type === 'publish' && 'Publier l\'affectation'}
              {confirmAction?.type === 'delete' && 'Supprimer l\'affectation'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'validate' && (
                <>
                  Êtes-vous sûr de vouloir valider l&apos;affectation de{' '}
                  <strong>{confirmAction.affectation.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.affectation.uniteEnseignement.nom}</strong> ({confirmAction.affectation.typeSeance}) ?
                  L&apos;affectation passera au statut <em>Validée</em>.
                </>
              )}
              {confirmAction?.type === 'publish' && (
                <>
                  Êtes-vous sûr de vouloir publier l&apos;affectation de{' '}
                  <strong>{confirmAction.affectation.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.affectation.uniteEnseignement.nom}</strong> ({confirmAction.affectation.typeSeance}) ?
                  L&apos;affectation sera visible par l&apos;enseignant et passera au statut <em>Publiée</em>.
                </>
              )}
              {confirmAction?.type === 'delete' && (
                <>
                  Êtes-vous sûr de vouloir supprimer l&apos;affectation de{' '}
                  <strong>{confirmAction.affectation.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.affectation.uniteEnseignement.nom}</strong> ({confirmAction.affectation.typeSeance}) ?
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction?.type === 'validate') handleValidate()
                else if (confirmAction?.type === 'publish') handlePublish()
                else if (confirmAction?.type === 'delete') handleDelete()
              }}
              className={
                confirmAction?.type === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : confirmAction?.type === 'validate'
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-blue-600 hover:bg-blue-700'
              }
            >
              {confirmAction?.type === 'validate' && 'Valider'}
              {confirmAction?.type === 'publish' && 'Publier'}
              {confirmAction?.type === 'delete' && 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Matrix Cell Component ───

function MatrixCell({ names, needed, covered }: { names: string[]; needed: boolean; covered: boolean }) {
  // If this type of session is not needed (volume = 0), show "—"
  if (!needed) {
    return (
      <span className="text-xs text-muted-foreground">—</span>
    )
  }

  // If covered, show green
  if (covered) {
    return (
      <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2 py-1">
        {names.length > 0 ? (
          <div className="space-y-0.5">
            {names.map((name, i) => (
              <p key={i} className="text-xs font-medium text-emerald-800 dark:text-emerald-300">{name}</p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Affecté</p>
        )}
      </div>
    )
  }

  // Not covered — show red warning
  return (
    <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2 py-1">
      <p className="text-xs font-medium text-red-600 dark:text-red-400">Non affecté</p>
    </div>
  )
}
