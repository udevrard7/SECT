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
  Share2,
  Award,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { CertificateTemplateDialog } from './certificate-template-dialog'
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
  niveaux: string | null
  semestre: number | null
  creditsECTS: number | null
  volumeHeuresCM: number
  volumeHeuresTD: number
  volumeHeuresTP: number
  obligatoire: boolean
  actif: boolean
  createdAt: string
  filiere: { id: string; nom: string; code: string | null }
  filieresSuppl: { id: string; filiereId: string; filiere: { id: string; nom: string; code: string | null } }[]
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

// ─── Helper: get all filières for a UE (owner + supplementary) ───
function getAllFilieresForUE(ue: UEItem): { id: string; nom: string; code: string | null; isOwner: boolean }[] {
  const result = [{ id: ue.filiere.id, nom: ue.filiere.nom, code: ue.filiere.code, isOwner: true }]
  for (const suppl of ue.filieresSuppl) {
    result.push({ id: suppl.filiere.id, nom: suppl.filiere.nom, code: suppl.filiere.code, isOwner: false })
  }
  return result
}

// ─── Main Component ───

export function UnitesEnseignementPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [ues, setUes] = useState<UEItem[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([]) // Toutes les filières actives de l'établissement
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
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUE, setEditingUE] = useState<UEItem | null>(null)
  const [viewingUE, setViewingUE] = useState<UEItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UEItem | null>(null)
  const [templateUE, setTemplateUE] = useState<UEItem | null>(null)

  // ─── Add form state ───
  const [addCode, setAddCode] = useState('')
  const [addNom, setAddNom] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addFiliereId, setAddFiliereId] = useState('')
  const [addFiliereIdsSuppl, setAddFiliereIdsSuppl] = useState<Set<string>>(new Set())
  const [addNiveau, setAddNiveau] = useState('')
  const [addSemestre, setAddSemestre] = useState('')
  const [addCreditsECTS, setAddCreditsECTS] = useState('')
  const [addVolumeCM, setAddVolumeCM] = useState('0')
  const [addVolumeTD, setAddVolumeTD] = useState('0')
  const [addVolumeTP, setAddVolumeTP] = useState('0')
  const [addObligatoire, setAddObligatoire] = useState(true)
  const [addNiveaux, setAddNiveaux] = useState<Set<string>>(new Set())

  // ─── Edit form state ───
  const [editCode, setEditCode] = useState('')
  const [editNom, setEditNom] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editFiliereId, setEditFiliereId] = useState('')
  const [editFiliereIdsSuppl, setEditFiliereIdsSuppl] = useState<Set<string>>(new Set())
  const [editNiveau, setEditNiveau] = useState('')
  const [editSemestre, setEditSemestre] = useState('')
  const [editCreditsECTS, setEditCreditsECTS] = useState('')
  const [editVolumeCM, setEditVolumeCM] = useState('0')
  const [editVolumeTD, setEditVolumeTD] = useState('0')
  const [editVolumeTP, setEditVolumeTP] = useState('0')
  const [editObligatoire, setEditObligatoire] = useState(true)
  const [editNiveaux, setEditNiveaux] = useState<Set<string>>(new Set())

  // ─── Fetch all filières of the establishment ───
  // Le RESPONSABLE gère l'ensemble de l'établissement, pas une filière spécifique.
  // On charge donc TOUTES les filières actives de son établissement.
  const fetchFilieres = useCallback(async () => {
    try {
      // Fallback: utiliser etablissement.id si etablissementId est absent (session ancienne)
      const etablissementId = user?.etablissementId || user?.etablissement?.id
      if (!etablissementId) return
      const params = new URLSearchParams()
      params.set('etablissementId', etablissementId)
      params.set('actif', 'true')
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
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch UEs for the establishment ───
  // Le RESPONSABLE voit toutes les UEs de son établissement
  const fetchUEs = useCallback(async () => {
    setIsLoading(true)
    try {
      const etabId = user?.etablissementId || user?.etablissement?.id
      const params = new URLSearchParams()
      if (etabId) params.set('etablissementId', etabId)
      if (search) params.set('search', search)
      if (filiereFilter && filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (niveauFilter && niveauFilter !== 'all') params.set('niveau', niveauFilter)
      if (semestreFilter && semestreFilter !== 'all') params.set('semestre', semestreFilter)
      params.set('actif', 'true')

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
  }, [user?.etablissementId, user?.etablissement?.id, search, filiereFilter, niveauFilter, semestreFilter])

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
    setAddFiliereIdsSuppl(new Set())
    setAddNiveau('')
    setAddSemestre('')
    setAddCreditsECTS('')
    setAddVolumeCM('0')
    setAddVolumeTD('0')
    setAddVolumeTP('0')
    setAddObligatoire(true)
    setAddNiveaux(new Set())
    setAddDialogOpen(true)
  }

  // ─── Submit add ───
  const handleAddSubmit = async () => {
    if (!addCode || !addNom || !addFiliereId || !addNiveau) {
      toast.error('Champs manquants', {
        description: 'Le code, le nom, la filière propriétaire et le niveau sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const allNiveaux = new Set(addNiveaux)
      allNiveaux.add(addNiveau)
      const niveauxArray = Array.from(allNiveaux).sort(
        (a, b) => NIVEAUX.indexOf(a as typeof NIVEAUX[number]) - NIVEAUX.indexOf(b as typeof NIVEAUX[number])
      )

      const body: Record<string, unknown> = {
        code: addCode,
        nom: addNom,
        description: addDescription || null,
        filiereId: addFiliereId,
        filiereIdsSuppl: Array.from(addFiliereIdsSuppl).filter(id => id !== addFiliereId),
        niveau: addNiveau,
        niveaux: JSON.stringify(niveauxArray),
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
    setEditFiliereIdsSuppl(new Set(ue.filieresSuppl.map(s => s.filiereId)))
    setEditNiveau(ue.niveau)
    setEditSemestre(ue.semestre?.toString() ?? '')
    setEditCreditsECTS(ue.creditsECTS?.toString() ?? '')
    setEditVolumeCM(ue.volumeHeuresCM.toString())
    setEditVolumeTD(ue.volumeHeuresTD.toString())
    setEditVolumeTP(ue.volumeHeuresTP.toString())
    setEditObligatoire(ue.obligatoire)
    let loadedNiveaux = new Set<string>()
    if (ue.niveaux) {
      try {
        const parsed = JSON.parse(ue.niveaux)
        if (Array.isArray(parsed)) {
          loadedNiveaux = new Set(parsed)
        }
      } catch {
        loadedNiveaux = new Set([ue.niveau])
      }
    } else {
      loadedNiveaux = new Set([ue.niveau])
    }
    setEditNiveaux(loadedNiveaux)
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleEditSubmit = async () => {
    if (!editingUE) return
    if (!editCode || !editNom || !editFiliereId || !editNiveau) {
      toast.error('Champs manquants', {
        description: 'Le code, le nom, la filière propriétaire et le niveau sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const allNiveaux = new Set(editNiveaux)
      allNiveaux.add(editNiveau)
      const niveauxArray = Array.from(allNiveaux).sort(
        (a, b) => NIVEAUX.indexOf(a as typeof NIVEAUX[number]) - NIVEAUX.indexOf(b as typeof NIVEAUX[number])
      )

      const body: Record<string, unknown> = {
        code: editCode,
        nom: editNom,
        description: editDescription || null,
        filiereId: editFiliereId,
        filiereIdsSuppl: Array.from(editFiliereIdsSuppl).filter(id => id !== editFiliereId),
        niveau: editNiveau,
        niveaux: JSON.stringify(niveauxArray),
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
    // Capture the target BEFORE the dialog closes and sets deleteTarget to null
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      const res = await fetch(`/api/unites-enseignement/${target.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      toast.success('UE désactivée', {
        description: `${target.nom} a été désactivée avec succès.`,
      })
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
    filiereIdsSuppl, setFiliereIdsSuppl,
    niveau, setNiveau,
    niveaux, setNiveaux,
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
    filiereIdsSuppl: Set<string>; setFiliereIdsSuppl: (v: Set<string>) => void
    niveau: string; setNiveau: (v: string) => void
    niveaux: Set<string>; setNiveaux: (v: Set<string>) => void
    semestre: string; setSemestre: (v: string) => void
    creditsECTS: string; setCreditsECTS: (v: string) => void
    volumeCM: string; setVolumeCM: (v: string) => void
    volumeTD: string; setVolumeTD: (v: string) => void
    volumeTP: string; setVolumeTP: (v: string) => void
    obligatoire: boolean; setObligatoire: (v: boolean) => void
  }) => {
    // Filieres available for sharing: all establishment filières except the owner filière
    const availableSupplFilieres = filieres.filter(f => f.id !== filiereId)

    return (
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
            <Label>Filière propriétaire *</Label>
            <Select value={filiereId} onValueChange={(v) => {
              setFiliereId(v)
              // Remove the new owner from suppl set if present
              const next = new Set(filiereIdsSuppl)
              next.delete(v)
              setFiliereIdsSuppl(next)
            }}>
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
            <Label>Niveau principal *</Label>
            <Select value={niveau} onValueChange={(v) => {
              setNiveau(v)
              const next = new Set(niveaux)
              next.delete(niveau)
              next.add(v)
              setNiveaux(next)
            }}>
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

        {/* ─── Multi-filière sharing ─── */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Share2 className="h-4 w-4 text-teal-500" />
            Filières partagées
          </Label>
          <p className="text-xs text-muted-foreground">
            Partagez cette UE avec d&apos;autres filières (ex: Bureautique pour INFO et SEG)
          </p>
          {availableSupplFilieres.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableSupplFilieres.map((f) => {
                const isChecked = filiereIdsSuppl.has(f.id)
                return (
                  <label
                    key={f.id}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                      isChecked
                        ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
                        : 'text-muted-foreground border-muted hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const next = new Set(filiereIdsSuppl)
                        if (checked) next.add(f.id)
                        else next.delete(f.id)
                        setFiliereIdsSuppl(next)
                      }}
                    />
                    <span>{f.nom}{f.code ? ` (${f.code})` : ''}</span>
                  </label>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {filiereId ? 'Aucune autre filière disponible pour le partage' : 'Sélectionnez d\'abord une filière propriétaire'}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Niveaux concernés</Label>
          <p className="text-xs text-muted-foreground">Sélectionnez tous les niveaux qui partagent cette UE</p>
          <div className="flex flex-wrap gap-2">
            {NIVEAUX.map((n) => {
              const isChecked = niveaux.has(n) || n === niveau
              const isPrincipal = n === niveau
              return (
                <label
                  key={n}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                    isChecked
                      ? isPrincipal
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
                      : 'text-muted-foreground border-muted hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isPrincipal}
                    onCheckedChange={(checked) => {
                      const next = new Set(niveaux)
                      if (checked) next.add(n)
                      else next.delete(n)
                      setNiveaux(next)
                    }}
                  />
                  <span>{n}</span>
                  {isPrincipal && <span className="text-[10px] opacity-70">(principal)</span>}
                </label>
              )
            })}
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
  }

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
              : 'Commencez par ajouter des unités d\'enseignement à vos filières.'}
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
                <TableHead>Filière(s)</TableHead>
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
                const allFilieres = getAllFilieresForUE(ue)
                return (
                  <UETableRow
                    key={ue.id}
                    ue={ue}
                    isExpanded={isExpanded}
                    onToggle={toggleExpand}
                    onEdit={handleOpenEdit}
                    onDelete={setDeleteTarget}
                    onViewAffectations={handleViewAffectations}
                    onTemplate={(ue) => { setTemplateUE(ue); setTemplateDialogOpen(true) }}
                    totalHours={totalHours}
                    allFilieres={allFilieres}
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
              Créez une nouvelle unité d&apos;enseignement. Vous pouvez la partager entre plusieurs filières.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <UEForm
              mode="add"
              code={addCode} setCode={setAddCode}
              nom={addNom} setNom={setAddNom}
              description={addDescription} setDescription={setAddDescription}
              filiereId={addFiliereId} setFiliereId={setAddFiliereId}
              filiereIdsSuppl={addFiliereIdsSuppl} setFiliereIdsSuppl={setAddFiliereIdsSuppl}
              niveau={addNiveau} setNiveau={setAddNiveau}
              niveaux={addNiveaux} setNiveaux={setAddNiveaux}
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
              Modifiez les informations de l&apos;unité d&apos;enseignement et ses filières partagées.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <UEForm
              mode="edit"
              code={editCode} setCode={setEditCode}
              nom={editNom} setNom={setEditNom}
              description={editDescription} setDescription={setEditDescription}
              filiereId={editFiliereId} setFiliereId={setEditFiliereId}
              filiereIdsSuppl={editFiliereIdsSuppl} setFiliereIdsSuppl={setEditFiliereIdsSuppl}
              niveau={editNiveau} setNiveau={setEditNiveau}
              niveaux={editNiveaux} setNiveaux={setEditNiveaux}
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

      {/* ─── Certificate Template Dialog ─── */}
      <CertificateTemplateDialog
        ue={templateUE ? { id: templateUE.id, code: templateUE.code, nom: templateUE.nom } : null}
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
      />
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
  onTemplate,
  totalHours,
  allFilieres,
}: {
  ue: UEItem
  isExpanded: boolean
  onToggle: (ue: UEItem) => void
  onEdit: (ue: UEItem) => void
  onDelete: (ue: UEItem) => void
  onViewAffectations: (ue: UEItem) => void
  onTemplate: (ue: UEItem) => void
  totalHours: number
  allFilieres: { id: string; nom: string; code: string | null; isOwner: boolean }[]
}) {
  const parsedNiveaux = (() => {
    if (!ue.niveaux) return [ue.niveau]
    try {
      const arr = JSON.parse(ue.niveaux)
      return Array.isArray(arr) ? arr : [ue.niveau]
    } catch {
      return [ue.niveau]
    }
  })()

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        <TableCell>
          <button onClick={() => onToggle(ue)} className="p-1 hover:bg-muted rounded">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="font-mono text-sm font-medium">{ue.code}</TableCell>
        <TableCell className="font-medium">{ue.nom}</TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {allFilieres.map((f) => (
              <Badge
                key={f.id}
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  f.isOwner
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800'
                }`}
              >
                {f.isOwner && '★ '}{f.nom}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {parsedNiveaux.map((n: string) => (
              <Badge key={n} variant="secondary" className={`text-[10px] ${NIVEAU_COLORS[n] || ''}`}>
                {n}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>{ue.semestre ? `S${ue.semestre}` : '—'}</TableCell>
        <TableCell>{ue.creditsECTS ?? '—'}</TableCell>
        <TableCell>{totalHours}h</TableCell>
        <TableCell>
          {ue.obligatoire ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <span className="text-muted-foreground text-xs">Optionnel</span>
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary" className="text-xs">{ue._count.affectations}</Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onViewAffectations(ue)}
              className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-teal-600"
              title="Voir les affectations"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => onTemplate(ue)}
              className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-amber-600"
              title="Template de certificat"
            >
              <Award className="h-4 w-4" />
            </button>
            <button
              onClick={() => onEdit(ue)}
              className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-amber-600"
              title="Modifier"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(ue)}
              className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-red-600"
              title="Désactiver"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>

      {/* ─── Expanded row: affectations ─── */}
      {isExpanded && ue.affectations && (
        <TableRow>
          <TableCell colSpan={11} className="bg-muted/30 px-8 py-3">
            {ue.affectations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Affectations ({ue.affectations.length})</p>
                {ue.affectations.map((aff) => (
                  <div key={aff.id} className="flex items-center gap-3 text-sm">
                    <span className="font-medium">{aff.enseignant.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_SEANCE_LABELS[aff.typeSeance] || aff.typeSeance}
                    </Badge>
                    {aff.groupe && <span className="text-muted-foreground">Groupe {aff.groupe}</span>}
                    <span className="text-muted-foreground">{aff.volumeHeures}h</span>
                    <Badge className={`text-[10px] ${AFFECTATION_STATUT_COLORS[aff.statut] || ''}`}>
                      {aff.statut}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune affectation pour cette UE</p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
