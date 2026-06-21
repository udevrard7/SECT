'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  GraduationCap,
  Plus,
  BookMarked,
  Users,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  Edit3,
  Trash2,
  Eye,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  LayoutGrid,
  List,
  Share2,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

interface Props {
  defaultView?: 'overview' | 'detail'
}

interface FiliereItem {
  id: string
  nom: string
  code: string | null
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
  filieresSuppl?: { id: string; filiereId: string; filiere: { id: string; nom: string; code: string | null } }[]
}

interface AffectationItem {
  id: string
  enseignantId: string
  uniteEnseignementId: string
  typeSeance: string
  volumeHeures: number
  statut: string
  enseignant: { id: string; name: string; email: string }
  uniteEnseignement: {
    id: string
    code: string
    nom: string
    niveau: string // Fixed: was "nivel" in old code
    filiereId: string
    filiere: { id: string; nom: string; code: string | null }
  }
}

interface NiveauStats {
  key: string
  label: string
  shortLabel: string
  bgColor: string
  borderColor: string
  textColor: string
  darkBgColor: string
  darkBorderColor: string
  darkTextColor: string
  iconBg: string
  darkIconBg: string
  nbFilieres: number
  nbUEs: number
  nbEnseignants: number
  tauxCouverture: number
}

// ─── Constants ───

const ALL_NIVEAU_KEYS = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT'] as const

const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1 - Licence 1',
  L2: 'L2 - Licence 2',
  L3: 'L3 - Licence 3',
  M1: 'M1 - Master 1',
  M2: 'M2 - Master 2',
  DOCTORAT: 'Doctorat',
}

const NIVEAU_COLORS: Record<string, string> = {
  L1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  L2: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  L3: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  M1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  M2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  DOCTORAT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const NIVEAU_CONFIG = [
  {
    key: 'L1', label: 'L1 - Licence 1ère année', shortLabel: 'L1',
    bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-700',
    darkBgColor: 'dark:bg-emerald-950/30', darkBorderColor: 'dark:border-emerald-800',
    darkTextColor: 'dark:text-emerald-300', iconBg: 'bg-emerald-100', darkIconBg: 'dark:bg-emerald-900/40',
  },
  {
    key: 'L2', label: 'L2 - Licence 2ème année', shortLabel: 'L2',
    bgColor: 'bg-teal-50', borderColor: 'border-teal-200', textColor: 'text-teal-700',
    darkBgColor: 'dark:bg-teal-950/30', darkBorderColor: 'dark:border-teal-800',
    darkTextColor: 'dark:text-teal-300', iconBg: 'bg-teal-100', darkIconBg: 'dark:bg-teal-900/40',
  },
  {
    key: 'L3', label: 'L3 - Licence 3ème année', shortLabel: 'L3',
    bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200', textColor: 'text-cyan-700',
    darkBgColor: 'dark:bg-cyan-950/30', darkBorderColor: 'dark:border-cyan-800',
    darkTextColor: 'dark:text-cyan-300', iconBg: 'bg-cyan-100', darkIconBg: 'dark:bg-cyan-900/40',
  },
  {
    key: 'M1', label: 'M1 - Master 1ère année', shortLabel: 'M1',
    bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700',
    darkBgColor: 'dark:bg-amber-950/30', darkBorderColor: 'dark:border-amber-800',
    darkTextColor: 'dark:text-amber-300', iconBg: 'bg-amber-100', darkIconBg: 'dark:bg-amber-900/40',
  },
  {
    key: 'M2', label: 'M2 - Master 2ème année', shortLabel: 'M2',
    bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-700',
    darkBgColor: 'dark:bg-orange-950/30', darkBorderColor: 'dark:border-orange-800',
    darkTextColor: 'dark:text-orange-300', iconBg: 'bg-orange-100', darkIconBg: 'dark:bg-orange-900/40',
  },
  {
    key: 'DOCTORAT', label: 'Doctorat', shortLabel: 'Doctorat',
    bgColor: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-700',
    darkBgColor: 'dark:bg-purple-950/30', darkBorderColor: 'dark:border-purple-800',
    darkTextColor: 'dark:text-purple-300', iconBg: 'bg-purple-100', darkIconBg: 'dark:bg-purple-900/40',
  },
]

const TYPE_SEANCE_LABELS: Record<string, string> = {
  CM: 'Cours Magistral', TD: 'Travaux Dirigés', TP: 'Travaux Pratiques',
}

const AFFECTATION_STATUT_COLORS: Record<string, string> = {
  PROVISOIRE: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  VALIDEE: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  PUBLIEE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
}

// ─── Utility Functions ───

function getCoverageColor(rate: number) {
  if (rate >= 80) return { bar: 'bg-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700', darkText: 'dark:text-emerald-300' }
  if (rate >= 50) return { bar: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700', darkText: 'dark:text-amber-300' }
  return { bar: 'bg-red-500', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700', darkText: 'dark:text-red-300' }
}

// ─── Helper: get all filières for a UE (owner + supplementary) ───
function getAllFilieresForUE(ue: UEItem): { id: string; nom: string; code: string | null; isOwner: boolean }[] {
  const result = [{ id: ue.filiere.id, nom: ue.filiere.nom, code: ue.filiere.code, isOwner: true }]
  for (const suppl of ue.filieresSuppl ?? []) {
    result.push({ id: suppl.filiere.id, nom: suppl.filiere.nom, code: suppl.filiere.code, isOwner: false })
  }
  return result
}

function getCoverageBadge(rate: number) {
  if (rate >= 80) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Bien couvert</Badge>
  if (rate >= 50) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 text-xs"><Info className="h-3 w-3 mr-1" />Partiel</Badge>
  return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Insuffisant</Badge>
}

// ─── Main Component ───

export function ProgrammeAcademiquePage({ defaultView = 'overview' }: Props = {}) {
  const user = useAuthStore((s) => s.user)

  // ─── View state ───
  const [activeView, setActiveView] = useState<'overview' | 'detail'>(defaultView)
  const [tabNiveau, setTabNiveau] = useState('all')

  // ─── Data state ───
  const [filieres, setFilieres] = useState<FiliereItem[]>([])
  const [ues, setUEs] = useState<UEItem[]>([])
  const [affectations, setAffectations] = useState<AffectationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state (detail view) ───
  const [search, setSearch] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
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

  // ─── Multi-filière sharing state ───
  const [addFiliereIdsSuppl, setAddFiliereIdsSuppl] = useState<Set<string>>(new Set())
  const [editFiliereIdsSuppl, setEditFiliereIdsSuppl] = useState<Set<string>>(new Set())

  // ─── Data Fetching ───

  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.etablissementId || user?.etablissement?.id) params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      params.set('actif', 'true')
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFilieres((data.filieres ?? []).map((f: FiliereItem) => ({ id: f.id, nom: f.nom, code: f.code ?? null })))
      }
    } catch { /* silent */ }
  }, [user?.etablissementId, user?.etablissement?.id])

  const fetchUEs = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.etablissementId || user?.etablissement?.id) params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      params.set('actif', 'true')
      const res = await fetch(`/api/unites-enseignement?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUEs(data.unitesEnseignement ?? [])
      }
    } catch { /* silent */ }
  }, [user?.etablissementId, user?.etablissement?.id])

  const fetchAffectations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.etablissementId || user?.etablissement?.id) params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      const res = await fetch(`/api/affectations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAffectations(data.affectations ?? [])
      }
    } catch { /* silent */ }
  }, [user?.etablissementId, user?.etablissement?.id])

  const fetchAllData = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchFilieres(), fetchUEs(), fetchAffectations()])
    setIsLoading(false)
  }, [fetchFilieres, fetchUEs, fetchAffectations])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  // ─── Computed: Niveau stats ───

  const niveauStats = useMemo((): NiveauStats[] => {
    return NIVEAU_CONFIG.map((config) => {
      const uesAtNiveau = ues.filter((ue) => ue.niveau === config.key)
      const filiereIdsWithUEs = new Set<string>()
      uesAtNiveau.forEach((ue) => {
        filiereIdsWithUEs.add(ue.filiereId)
        ue.filieresSuppl?.forEach((s) => filiereIdsWithUEs.add(s.filiereId))
      })
      const filieresAtNiveau = filieres.filter((f) => filiereIdsWithUEs.has(f.id))
      const ueIdsAtNiveau = new Set(uesAtNiveau.map((ue) => ue.id))
      const affectationsAtNiveau = affectations.filter((a) => ueIdsAtNiveau.has(a.uniteEnseignementId))
      const enseignantIds = new Set(affectationsAtNiveau.map((a) => a.enseignantId))
      const uesWithAffectation = uesAtNiveau.filter(
        (ue) => ue._count?.affectations > 0 || affectationsAtNiveau.some((a) => a.uniteEnseignementId === ue.id)
      )
      const tauxCouverture = uesAtNiveau.length > 0 ? Math.round((uesWithAffectation.length / uesAtNiveau.length) * 100) : 0
      return {
        key: config.key, label: config.label, shortLabel: config.shortLabel,
        bgColor: config.bgColor, borderColor: config.borderColor, textColor: config.textColor,
        darkBgColor: config.darkBgColor, darkBorderColor: config.darkBorderColor, darkTextColor: config.darkTextColor,
        iconBg: config.iconBg, darkIconBg: config.darkIconBg,
        nbFilieres: filieresAtNiveau.length, nbUEs: uesAtNiveau.length,
        nbEnseignants: enseignantIds.size, tauxCouverture,
      }
    })
  }, [filieres, ues, affectations])

  // ─── Computed: Filière × Niveau Matrix (includes DOCTORAT) ───

  const matrixData = useMemo(() => {
    return filieres.map((filiere) => {
      const row: { filiere: FiliereItem; niveaux: Record<string, { nbUEs: number; tauxCouverture: number }> } = { filiere, niveaux: {} }
      ALL_NIVEAU_KEYS.forEach((niveau) => {
        const uesAtFN = ues.filter((ue) => {
          if (ue.niveau !== niveau) return false
          if (ue.filiereId === filiere.id) return true
          // Also include UEs shared with this filière
          if (ue.filieresSuppl?.some((s) => s.filiereId === filiere.id)) return true
          return false
        })
        const uesWithAff = uesAtFN.filter(
          (ue) => ue._count?.affectations > 0 || affectations.some((a) => a.uniteEnseignementId === ue.id)
        )
        row.niveaux[niveau] = {
          nbUEs: uesAtFN.length,
          tauxCouverture: uesAtFN.length > 0 ? Math.round((uesWithAff.length / uesAtFN.length) * 100) : -1,
        }
      })
      return row
    })
  }, [filieres, ues, affectations])

  // ─── Computed: Global coverage ───

  const globalCoverage = useMemo(() => {
    if (ues.length === 0) return 0
    const uesWithAff = ues.filter(
      (ue) => ue._count?.affectations > 0 || affectations.some((a) => a.uniteEnseignementId === ue.id)
    )
    return Math.round((uesWithAff.length / ues.length) * 100)
  }, [ues, affectations])

  // ─── Computed: Filtered UEs (detail view) ───

  const filteredUEs = useMemo(() => {
    return ues.filter((ue) => {
      if (tabNiveau !== 'all' && ue.niveau !== tabNiveau) return false
      if (filiereFilter !== 'all' && ue.filiereId !== filiereFilter && !ue.filieresSuppl?.some((s) => s.filiereId === filiereFilter)) return false
      if (semestreFilter !== 'all') {
        const s = parseInt(semestreFilter, 10)
        if (ue.semestre !== s) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const filiereNames = [ue.filiere.nom, ...(ue.filieresSuppl?.map((s) => s.filiere.nom) ?? [])]
        return ue.code.toLowerCase().includes(q) || ue.nom.toLowerCase().includes(q) || filiereNames.some((n) => n.toLowerCase().includes(q))
      }
      return true
    })
  }, [ues, tabNiveau, filiereFilter, semestreFilter, search])

  // ─── Suggested UE code ───

  const suggestedCode = useMemo(() => {
    if (!addFiliereId || !addNiveau) return ''
    const filiere = filieres.find((f) => f.id === addFiliereId)
    if (!filiere) return ''
    const code = filiere.code || filiere.nom.substring(0, 3).toUpperCase()
    const existingCount = ues.filter((ue) => ue.filiereId === addFiliereId && ue.niveau === addNiveau).length
    return `UE-${code}-${addNiveau}${String(existingCount + 1).padStart(2, '0')}`
  }, [addFiliereId, addNiveau, filieres, ues])

  // ─── Matrix interaction: click cell → switch to detail + set filter ───

  const handleMatrixCellClick = (niveau: string) => {
    setTabNiveau(niveau)
    setActiveView('detail')
  }

  // ─── Matrix interaction: click "—" → open add dialog pre-filled ───

  const handleMatrixEmptyClick = (niveau: string, filiereId: string) => {
    handleOpenAdd(niveau, filiereId)
  }

  // ─── Open add dialog ───

  const handleOpenAdd = (prefillNiveau?: string, prefillFiliereId?: string) => {
    setAddCode('')
    setAddNom('')
    setAddDescription('')
    setAddFiliereId(prefillFiliereId ?? (filieres.length === 1 ? filieres[0].id : ''))
    setAddNiveau(prefillNiveau ?? '')
    setAddSemestre('')
    setAddCreditsECTS('')
    setAddVolumeCM('0')
    setAddVolumeTD('0')
    setAddVolumeTP('0')
    setAddObligatoire(true)
    setAddFiliereIdsSuppl(new Set())
    setAddDialogOpen(true)
  }

  // ─── Submit add ───

  const handleAddSubmit = async () => {
    if (!addCode || !addNom || !addFiliereId || !addNiveau) {
      toast.error('Champs manquants', { description: 'Le code, le nom, la filière et le niveau sont obligatoires.' })
      return
    }
    setIsSubmitting(true)
    try {
      const body = {
        code: addCode, nom: addNom, filiereId: addFiliereId, niveau: addNiveau,
        semestre: addSemestre ? parseInt(addSemestre) : null,
        description: addDescription || null,
        creditsECTS: addCreditsECTS ? parseInt(addCreditsECTS) : null,
        volumeHeuresCM: parseInt(addVolumeCM) || 0,
        volumeHeuresTD: parseInt(addVolumeTD) || 0,
        volumeHeuresTP: parseInt(addVolumeTP) || 0,
        obligatoire: addObligatoire,
        filiereIdsSuppl: Array.from(addFiliereIdsSuppl).filter(id => id !== addFiliereId),
      }
      const res = await fetch('/api/unites-enseignement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur lors de la création') }
      toast.success('UE créée', { description: `${addNom} a été ajoutée au niveau ${NIVEAU_LABELS[addNiveau] ?? addNiveau}.` })
      setAddDialogOpen(false)
      await fetchAllData()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally { setIsSubmitting(false) }
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
    setEditFiliereIdsSuppl(new Set(ue.filieresSuppl?.map(s => s.filiereId) ?? []))
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───

  const handleEditSubmit = async () => {
    if (!editingUE || !editCode || !editNom || !editFiliereId || !editNiveau) {
      toast.error('Champs manquants', { description: 'Le code, le nom, la filière et le niveau sont obligatoires.' })
      return
    }
    setIsSubmitting(true)
    try {
      const body = {
        code: editCode, nom: editNom, filiereId: editFiliereId, niveau: editNiveau,
        semestre: editSemestre ? parseInt(editSemestre) : null,
        description: editDescription || null,
        creditsECTS: editCreditsECTS ? parseInt(editCreditsECTS) : null,
        volumeHeuresCM: parseInt(editVolumeCM) || 0,
        volumeHeuresTD: parseInt(editVolumeTD) || 0,
        volumeHeuresTP: parseInt(editVolumeTP) || 0,
        obligatoire: editObligatoire,
        filiereIdsSuppl: Array.from(editFiliereIdsSuppl).filter(id => id !== editFiliereId),
      }
      const res = await fetch(`/api/unites-enseignement/${editingUE.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur lors de la modification') }
      toast.success('UE modifiée', { description: `${editNom} a été mise à jour.` })
      setEditDialogOpen(false)
      setEditingUE(null)
      await fetchAllData()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally { setIsSubmitting(false) }
  }

  // ─── Soft delete ───

  const handleDelete = async () => {
    // Capture the target BEFORE the dialog closes and sets deleteTarget to null
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      const res = await fetch(`/api/unites-enseignement/${target.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur lors de la suppression') }
      toast.success('UE désactivée', { description: `${target.nom} a été désactivée avec succès.` })
      await fetchAllData()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
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

  // ─── Toggle expand row ───

  const toggleExpand = async (ue: UEItem) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(ue.id)) {
      newExpanded.delete(ue.id)
    } else {
      newExpanded.add(ue.id)
      if (!ue.affectations) {
        try {
          const res = await fetch(`/api/unites-enseignement/${ue.id}`)
          if (res.ok) {
            const data = await res.json()
            setUEs((prev) => prev.map((u) => u.id === ue.id ? { ...u, affectations: data.uniteEnseignement.affectations } : u))
          }
        } catch { /* silent */ }
      }
    }
    setExpandedRows(newExpanded)
  }

  // ─── Stats ───

  const nbNiveauxActifs = niveauStats.filter((s) => s.nbUEs > 0).length
  const nbEnseignants = new Set(affectations.map((a) => a.enseignantId)).size

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-emerald-600" />
            Programme académique
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue d&apos;ensemble et gestion des unités d&apos;enseignement
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg bg-muted p-1">
            <button
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeView === 'overview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveView('overview')}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Vue d&apos;ensemble</span>
            </button>
            <button
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeView === 'detail' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveView('detail')}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Gestion des UEs</span>
            </button>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleOpenAdd()}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouvelle UE</span>
          </Button>
        </div>
      </div>

      {/* ─── Stats Row (always visible) ─── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="flex items-center gap-3 p-4"><Skeleton className="h-10 w-10 rounded-lg" /><div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-12" /></div></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40"><Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Niveaux actifs</p>
                <p className="text-xl font-bold">{nbNiveauxActifs}<span className="text-sm text-muted-foreground font-normal"> / 6</span></p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40"><BookMarked className="h-5 w-5 text-teal-600 dark:text-teal-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total UEs</p>
                <p className="text-xl font-bold">{ues.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40"><Users className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Enseignants affectés</p>
                <p className="text-xl font-bold">{nbEnseignants}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/40"><GraduationCap className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Couverture globale</p>
                <p className="text-xl font-bold">{globalCoverage}%</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── OVERVIEW VIEW ─── */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Niveau Cards */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
              Distribution par niveau
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 space-y-3"><Skeleton className="h-5 w-16" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /><Skeleton className="h-2 w-full" /></CardContent></Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {niveauStats.map((stat) => {
                  const coverage = getCoverageColor(stat.tauxCouverture)
                  return (
                    <Card
                      key={stat.key}
                      className={`group cursor-pointer transition-all hover:shadow-md border-l-4 ${stat.borderColor} ${stat.darkBorderColor}`}
                      onClick={() => handleMatrixCellClick(stat.key)}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.iconBg} ${stat.darkIconBg}`}>
                            <Layers className={`h-4 w-4 ${stat.textColor} ${stat.darkTextColor}`} />
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <h3 className={`text-sm font-bold ${stat.textColor} ${stat.darkTextColor}`}>{stat.shortLabel}</h3>
                        <p className="text-xs text-muted-foreground leading-tight line-clamp-2">{stat.label}</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1"><GraduationCap className="h-3 w-3" />Filières</span>
                            <span className="font-semibold">{stat.nbFilieres}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1"><BookMarked className="h-3 w-3" />UEs</span>
                            <span className="font-semibold">{stat.nbUEs}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Enseignants</span>
                            <span className="font-semibold">{stat.nbEnseignants}</span>
                          </div>
                        </div>
                        {stat.nbUEs > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Couverture</span>
                              <span className={`font-semibold ${coverage.text} ${coverage.darkText}`}>{stat.tauxCouverture}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${coverage.bar}`} style={{ width: `${stat.tauxCouverture}%` }} />
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Aucune UE</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Filière × Niveau Matrix (includes DOCTORAT) */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-teal-600" />
              Matrice Filière × Niveau
            </h2>
            {isLoading ? (
              <Card><CardContent className="p-6 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
            ) : filieres.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                  <Layers className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Aucune filière trouvée</h3>
                <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                  Vous n&apos;avez aucune filière assignée. La matrice sera disponible une fois vos filières configurées.
                </p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Filière</TableHead>
                          {ALL_NIVEAU_KEYS.map((niveau) => (
                            <TableHead key={niveau} className="text-center min-w-[100px]">{niveau}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matrixData.map((row) => (
                          <TableRow key={row.filiere.id}>
                            <TableCell className="sticky left-0 bg-background z-10 font-medium">
                              <div className="flex items-center gap-2">
                                <GraduationCap className="h-4 w-4 text-emerald-600" />
                                <div>
                                  <p className="text-sm font-medium">{row.filiere.nom}</p>
                                  {row.filiere.code && <p className="text-xs text-muted-foreground font-mono">{row.filiere.code}</p>}
                                </div>
                              </div>
                            </TableCell>
                            {ALL_NIVEAU_KEYS.map((niveau) => {
                              const cell = row.niveaux[niveau]
                              if (!cell || cell.nbUEs === 0) {
                                return (
                                  <TableCell key={niveau} className="text-center">
                                    <button
                                      className="inline-flex items-center justify-center w-full h-8 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                      title={`Ajouter une UE en ${NIVEAU_LABELS[niveau] ?? niveau} pour ${row.filiere.nom}`}
                                      onClick={() => handleMatrixEmptyClick(niveau, row.filiere.id)}
                                    >
                                      —
                                    </button>
                                  </TableCell>
                                )
                              }
                              const coverage = getCoverageColor(cell.tauxCouverture)
                              return (
                                <TableCell key={niveau} className="text-center">
                                  <button
                                    className={`inline-flex flex-col items-center justify-center w-full h-12 rounded-md transition-colors cursor-pointer ${coverage.bg} hover:opacity-80`}
                                    title={`${cell.nbUEs} UE${cell.nbUEs > 1 ? 's' : ''} en ${niveau} — Couverture : ${cell.tauxCouverture}%`}
                                    onClick={() => handleMatrixCellClick(niveau)}
                                  >
                                    <span className={`text-sm font-bold ${coverage.text} ${coverage.darkText}`}>{cell.nbUEs} UE{cell.nbUEs > 1 ? 's' : ''}</span>
                                    <span className={`text-xs ${coverage.text} ${coverage.darkText}`}>{cell.tauxCouverture}%</span>
                                  </button>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── DETAIL VIEW ─── */}
      {activeView === 'detail' && (
        <div className="space-y-4">
          {/* Filters */}
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
                <SelectValue placeholder="Filière" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les filières</SelectItem>
                {filieres.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nom}{f.code ? ` (${f.code})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={semestreFilter} onValueChange={setSemestreFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Semestre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous semestres</SelectItem>
                <SelectItem value="1">S1</SelectItem>
                <SelectItem value="2">S2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Niveau Tabs */}
          <Tabs value={tabNiveau} onValueChange={setTabNiveau}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="all" className="text-xs sm:text-sm">Tous</TabsTrigger>
              {ALL_NIVEAU_KEYS.map((n) => (
                <TabsTrigger key={n} value={n} className="text-xs sm:text-sm">{n}</TabsTrigger>
              ))}
            </TabsList>

            {ALL_NIVEAU_KEYS.map((niveau) => (
              <TabsContent key={niveau} value={niveau}>
                {isLoading ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                          <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-40" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : filteredUEs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                      <BookMarked className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">Aucune UE trouvée</h3>
                    <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                      {(search || filiereFilter !== 'all' || semestreFilter !== 'all')
                        ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
                        : `Aucune unité d'enseignement en ${NIVEAU_LABELS[niveau] ?? niveau}. Commencez par en ajouter.`}
                    </p>
                    {!search && filiereFilter === 'all' && semestreFilter === 'all' && (
                      <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleOpenAdd(niveau)}>
                        <Plus className="h-4 w-4" />Ajouter une UE
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead className="hidden md:table-cell">Nom</TableHead>
                          <TableHead className="hidden lg:table-cell">Filière</TableHead>
                          <TableHead>Sem.</TableHead>
                          <TableHead>ECTS</TableHead>
                          <TableHead className="hidden sm:table-cell">Vol.</TableHead>
                          <TableHead>Obl.</TableHead>
                          <TableHead className="text-center hidden sm:table-cell">Aff.</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUEs.map((ue) => {
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
                              totalHours={totalHours}
                              allFilieres={allFilieres}
                            />
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            ))}
            <TabsContent value="all">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="rounded-lg border">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                        <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-40" />
                        <Skeleton className="h-5 w-12 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : filteredUEs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                    <BookMarked className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">Aucune unité d&apos;enseignement trouvée</h3>
                  <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                    {search || filiereFilter !== 'all' || semestreFilter !== 'all'
                      ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
                      : 'Commencez par ajouter des unités d\'enseignement à vos filières.'}
                  </p>
                  {!search && filiereFilter === 'all' && semestreFilter === 'all' && (
                    <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleOpenAdd()}>
                      <Plus className="h-4 w-4" />Ajouter une UE
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="hidden md:table-cell">Nom</TableHead>
                        <TableHead className="hidden lg:table-cell">Filière</TableHead>
                        <TableHead>Niveau</TableHead>
                        <TableHead>Sem.</TableHead>
                        <TableHead>ECTS</TableHead>
                        <TableHead className="hidden sm:table-cell">Vol.</TableHead>
                        <TableHead>Obl.</TableHead>
                        <TableHead className="text-center hidden sm:table-cell">Aff.</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUEs.map((ue) => {
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
                            totalHours={totalHours}
                            allFilieres={allFilieres}
                          />
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ─── Add UE Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-emerald-600" />
              Nouvelle unité d&apos;enseignement
            </DialogTitle>
            <DialogDescription>Créez une nouvelle unité d&apos;enseignement dans vos filières.</DialogDescription>
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
              filieres={filieres}
              suggestedCode={suggestedCode}
              filiereIdsSuppl={addFiliereIdsSuppl} setFiliereIdsSuppl={setAddFiliereIdsSuppl}
            />
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer l&apos;UE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit UE Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-amber-600" />
              Modifier l&apos;UE
            </DialogTitle>
            <DialogDescription>Modifiez les informations de l&apos;unité d&apos;enseignement.</DialogDescription>
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
              filieres={filieres}
              filiereIdsSuppl={editFiliereIdsSuppl} setFiliereIdsSuppl={setEditFiliereIdsSuppl}
            />
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Affectations Dialog ─── */}
      <Dialog open={affectationsDialogOpen} onOpenChange={(open) => { if (!open) setAffectationsDialogOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-600" />
              Affectations — {viewingUE?.code} {viewingUE?.nom}
            </DialogTitle>
            <DialogDescription>Enseignants affectés à cette unité d&apos;enseignement</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewingUE?.affectations && viewingUE.affectations.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enseignant</TableHead>
                      <TableHead>Type séance</TableHead>
                      <TableHead>Heures</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingUE.affectations.map((aff) => (
                      <TableRow key={aff.id}>
                        <TableCell className="font-medium">{aff.enseignant.name}</TableCell>
                        <TableCell>{TYPE_SEANCE_LABELS[aff.typeSeance] || aff.typeSeance}</TableCell>
                        <TableCell>{aff.volumeHeures}h</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${AFFECTATION_STATUT_COLORS[aff.statut] || ''}`}>{aff.statut}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">Aucune affectation pour cette UE</p>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAffectationsDialogOpen(false)}>Fermer</Button>
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
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── UE Form Sub-component ───

function UEForm({
  mode, code, setCode, nom, setNom, description, setDescription,
  filiereId, setFiliereId, niveau, setNiveau, semestre, setSemestre,
  creditsECTS, setCreditsECTS, volumeCM, setVolumeCM, volumeTD, setVolumeTD,
  volumeTP, setVolumeTP, obligatoire, setObligatoire, filieres, suggestedCode,
  filiereIdsSuppl, setFiliereIdsSuppl,
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
  filieres: FiliereItem[]
  suggestedCode?: string
  filiereIdsSuppl: Set<string>; setFiliereIdsSuppl: (v: Set<string>) => void
}) {
  return (
    <div className="space-y-4">
      {/* Filière + Niveau */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Filière *</Label>
          <Select value={filiereId} onValueChange={(v) => {
            setFiliereId(v)
            const next = new Set(filiereIdsSuppl)
            next.delete(v)
            setFiliereIdsSuppl(next)
          }}>
            <SelectTrigger><SelectValue placeholder="Sélectionner une filière" /></SelectTrigger>
            <SelectContent>
              {filieres.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nom}{f.code ? ` (${f.code})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Niveau *</Label>
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger><SelectValue placeholder="Sélectionner un niveau" /></SelectTrigger>
            <SelectContent>
              {ALL_NIVEAU_KEYS.map((n) => (
                <SelectItem key={n} value={n}>{NIVEAU_LABELS[n]}</SelectItem>
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
        {(() => {
          const availableSupplFilieres = filieres.filter(f => f.id !== filiereId)
          return availableSupplFilieres.length > 0 ? (
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
              {filiereId ? 'Aucune autre filière disponible pour le partage' : 'Sélectionnez d\'abord une filière'}
            </p>
          )
        })()}
      </div>

      {/* Code + Nom */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${mode}-code`}>Code UE *</Label>
            {mode === 'add' && suggestedCode && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-emerald-600 hover:text-emerald-700" onClick={() => setCode(suggestedCode)}>
                Auto: {suggestedCode}
              </Button>
            )}
          </div>
          <Input id={`${mode}-code`} placeholder="Ex: UE-INF301" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${mode}-nom`}>Nom UE *</Label>
          <Input id={`${mode}-nom`} placeholder="Ex: Algorithmique avancée" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor={`${mode}-desc`}>Description</Label>
        <Textarea id={`${mode}-desc`} placeholder="Description de l'UE (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      {/* Semestre + ECTS + Obligatoire */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Semestre</Label>
          <Select value={semestre} onValueChange={setSemestre}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non défini</SelectItem>
              <SelectItem value="1">Semestre 1</SelectItem>
              <SelectItem value="2">Semestre 2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${mode}-ects`}>Crédits ECTS</Label>
          <Input id={`${mode}-ects`} type="number" min="0" placeholder="Ex: 6" value={creditsECTS} onChange={(e) => setCreditsECTS(e.target.value)} />
        </div>
        <div className="space-y-2 flex items-end">
          <div className="flex items-center gap-2 pb-2">
            <Checkbox id={`${mode}-obligatoire`} checked={obligatoire} onCheckedChange={(checked) => setObligatoire(checked === true)} />
            <Label htmlFor={`${mode}-obligatoire`} className="cursor-pointer">Obligatoire</Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* Volume horaire */}
      <div>
        <Label className="text-sm font-medium flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-500" />
          Volume horaire
        </Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${mode}-cm`} className="text-xs text-muted-foreground">Heures CM</Label>
            <Input id={`${mode}-cm`} type="number" min="0" value={volumeCM} onChange={(e) => setVolumeCM(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-td`} className="text-xs text-muted-foreground">Heures TD</Label>
            <Input id={`${mode}-td`} type="number" min="0" value={volumeTD} onChange={(e) => setVolumeTD(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-tp`} className="text-xs text-muted-foreground">Heures TP</Label>
            <Input id={`${mode}-tp`} type="number" min="0" value={volumeTP} onChange={(e) => setVolumeTP(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── UE Table Row Sub-component ───

function UETableRow({
  ue, isExpanded, onToggle, onEdit, onDelete, onViewAffectations, totalHours, allFilieres,
}: {
  ue: UEItem
  isExpanded: boolean
  onToggle: (ue: UEItem) => void
  onEdit: (ue: UEItem) => void
  onDelete: (ue: UEItem) => void
  onViewAffectations: (ue: UEItem) => void
  
  totalHours: number
  allFilieres: { id: string; nom: string; code: string | null; isOwner: boolean }[]
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onToggle(ue)}>
        <TableCell>
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-sm font-medium">{ue.code}</TableCell>
        <TableCell className="hidden md:table-cell font-medium">{ue.nom}</TableCell>
        <TableCell className="hidden lg:table-cell text-sm">
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
                {!f.isOwner && <Share2 className="h-2.5 w-2.5 mr-0.5" />}{f.isOwner && '★ '}{f.nom}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <Badge className={`text-xs ${NIVEAU_COLORS[ue.niveau] || ''}`}>{ue.niveau}</Badge>
        </TableCell>
        <TableCell className="text-sm">{ue.semestre ? `S${ue.semestre}` : '—'}</TableCell>
        <TableCell className="text-sm">{ue.creditsECTS ?? '—'}</TableCell>
        <TableCell className="hidden sm:table-cell text-sm">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-500" />{totalHours}h</span>
        </TableCell>
        <TableCell>
          {ue.obligatoire ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">Obl.</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">Opt.</Badge>
          )}
        </TableCell>
        <TableCell className="text-center hidden sm:table-cell">
          <Badge variant="secondary" className={`text-xs ${ue._count.affectations > 0 ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {ue._count.affectations}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950" onClick={() => onEdit(ue)}>
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950" onClick={() => onViewAffectations(ue)}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => onDelete(ue)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {/* Expanded: inline affectations */}
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={10}>
            <div className="py-2 pl-8">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">Affectations ({ue._count.affectations})</span>
                <Badge className={`text-xs ${NIVEAU_COLORS[ue.niveau] || ''}`}>{ue.niveau}</Badge>
                <div className="flex items-center gap-1">
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
                      {!f.isOwner && <Share2 className="h-2.5 w-2.5 mr-0.5" />}{f.isOwner && '★ '}{f.nom}
                    </Badge>
                  ))}
                </div>
              </div>
              {ue.affectations && ue.affectations.length > 0 ? (
                <div className="rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Enseignant</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Heures</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ue.affectations.map((aff) => (
                        <TableRow key={aff.id}>
                          <TableCell className="text-sm">{aff.enseignant.name}</TableCell>
                          <TableCell className="text-sm">{TYPE_SEANCE_LABELS[aff.typeSeance] || aff.typeSeance}</TableCell>
                          <TableCell className="text-sm">{aff.volumeHeures}h</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${AFFECTATION_STATUT_COLORS[aff.statut] || ''}`}>{aff.statut}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune affectation enregistrée</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
