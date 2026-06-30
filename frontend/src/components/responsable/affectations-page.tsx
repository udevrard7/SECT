'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  Share2,
  Clock,
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
import { PulseSkeleton } from '@/components/ds'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
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
    niveaux: string | null
    filiere: {
      id: string
      nom: string
      code: string | null
    }
    filieresSuppl: { id: string; filiereId: string; filiere: { id: string; nom: string; code: string | null } }[]
  }
}

interface UEItem {
  id: string
  code: string
  nom: string
  niveau: string
  niveaux: string | null // JSON array of NiveauEtude values
  filiereId: string
  filiere: {
    id: string
    nom: string
    code: string | null
  }
  filieresSuppl: { id: string; filiereId: string; filiere: { id: string; nom: string; code: string | null } }[]
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
}

// ─── Badge helpers ───

function getTypeSeanceBadge(typeSeance: string): React.ReactNode {
  switch (typeSeance) {
    case 'CM':
      return <Badge className="bg-success/10 text-success-text border-success/30 text-xs">CM</Badge>
    case 'TD':
      return <Badge className="bg-success/10 text-success-text border-success/30 text-xs">TD</Badge>
    case 'TP':
      return <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">TP</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{typeSeance}</Badge>
  }
}

function getStatutBadge(statut: string): React.ReactNode {
  switch (statut) {
    case 'PROVISOIRE':
      return <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">Provisoire</Badge>
    case 'VALIDEE':
      return <Badge className="bg-success/10 text-success-text border-success/30 text-xs">Validée</Badge>
    case 'PUBLIEE':
      return <Badge className="bg-info/10 text-info border-info/30 text-xs">Publiée</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{statut}</Badge>
  }
}

function getNiveauBadge(niveau: string): React.ReactNode {
  const isLicence = niveau.startsWith('L')
  return (
    <Badge className={`text-xs ${
      isLicence
        ? 'bg-success/10 text-success-text border-success/30'
        : 'bg-warning/10 text-warning border-warning/30'
    }`}>
      {niveau}
    </Badge>
  )
}

// ─── Type seance checkbox styles ───

const TYPE_STYLES: Record<string, { checked: string; unchecked: string }> = {
  CM: {
    checked: 'border-success/30 bg-success/10',
    unchecked: 'border-muted hover:bg-muted/50',
  },
  TD: {
    checked: 'border-success/30 bg-success/10',
    unchecked: 'border-muted hover:bg-muted/50',
  },
  TP: {
    checked: 'border-warning/30 bg-warning/10',
    unchecked: 'border-muted hover:bg-muted/50',
  },
}

// ─── Current academic year (dynamic, ANNEE-COURANTE-NIVEAU-2) ───
// Avant : heuristique date système (septembre = rentrée) — fausse si calendrier
// custom ou année suivante pas encore créée. Désormais : fetch de l'année
// courante définie sur l'établissement (migration 000017) via
// /api/etablissements/{id}/annee-courante. Fallback sur l'heuristique si l'API
// échoue ou si aucune année courante n'est définie.
function currentAnneeUniversitaireHeuristic(): string {
  const now = new Date()
  const year = now.getFullYear()
  if (now.getMonth() >= 8) { // septembre (0-indexed, 8 = sept)
    return `${year}-${year + 1}`
  }
  return `${year - 1}-${year}`
}

// ─── Main Component ───

export function AffectationsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const etabId = user?.etablissementId || user?.etablissement?.id

  // ─── Filter state ───
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [niveauFilter, setNiveauFilter] = useState('all')
  const [enseignantSearch, setEnseignantSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  // ANNEE-COURANTE-NIVEAU-2 : anneeFilter initialisé vide, puis setté par
  // useEffect après fetch de l'année courante DB. Fallback heuristique si échec.
  const [anneeFilter, setAnneeFilter] = useState('')
  const [anneeFilterInitialized, setAnneeFilterInitialized] = useState(false)

  // ─── Matrix filter state ───
  const [matrixFiliereFilter, setMatrixFiliereFilter] = useState('all')
  const [matrixNiveauFilter, setMatrixNiveauFilter] = useState('all')

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Les 4 ressources sont indépendantes → 4 useQuery séparés.
  // Les filtres d'affectations sont dans le queryKey pour refetch automatique.
  const affectationsQuery = useQuery<{ affectations: AffectationItem[] }>({
    queryKey: ['affectations', etabId, filiereFilter, niveauFilter, statutFilter, anneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('etablissementId', etabId!)
      if (filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (niveauFilter !== 'all') params.set('niveau', niveauFilter)
      if (statutFilter !== 'all') params.set('statut', statutFilter)
      if (anneeFilter) params.set('anneeUniversitaire', anneeFilter)

      const res = await fetch(`/api/affectations?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch affectations')
      return res.json()
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const filieresQuery = useQuery<{ filieres: FiliereOption[] }>({
    queryKey: ['filieres', etabId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (etabId) params.set('etablissementId', etabId)
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch filieres')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const uesQuery = useQuery<{ unitesEnseignement: UEItem[] }>({
    queryKey: ['affectations-ues', etabId],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('etablissementId', etabId!)
      params.set('actif', 'true')
      const res = await fetch(`/api/unites-enseignement?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch UEs')
      return res.json()
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const enseignantsQuery = useQuery<{
    users: Array<{ id: string; name: string; email: string }>
  }>({
    queryKey: ['affectations-enseignants', etabId],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('role', 'ENSEIGNANT')
      params.set('limit', '200')
      params.set('actif', 'true')
      params.set('etablissementId', etabId!)
      const res = await fetch(`/api/users?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch enseignants')
      return res.json()
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ANNEE-COURANTE-NIVEAU-2 : fetch des années académiques DB pour peupler le
  // Select (remplace l'Input texte libre). On récupère aussi l'année courante
  // définie sur l'établissement pour initialiser le filtre par défaut.
  const anneesQuery = useQuery<{ annees: Array<{ id: string; libelle: string; actif: boolean }> }>({
    queryKey: ['affectations-annees', etabId],
    queryFn: async () => {
      const res = await fetch(`/api/annees-academiques?etablissementId=${etabId}`)
      if (!res.ok) throw new Error('Failed to fetch annees')
      const data = await res.json()
      // L'API retourne un array direct (pas wrappé dans {annees:...})
      const arr = Array.isArray(data) ? data : (data.annees ?? data.anneesAcademiques ?? [])
      return { annees: arr }
    },
    enabled: !!etabId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const anneeCouranteQuery = useQuery<{ anneeCourante: { id: string; libelle: string } | null }>({
    queryKey: ['annee-courante', etabId],
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${etabId}/annee-courante`)
      if (!res.ok) throw new Error('Failed to fetch annee courante')
      return res.json()
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const annees = anneesQuery.data?.annees ?? []
  const anneeCouranteLibelle = anneeCouranteQuery.data?.anneeCourante?.libelle ?? null

  // Initialise anneeFilter une seule fois : année courante DB > fallback heuristique.
  useEffect(() => {
    if (anneeFilterInitialized) return
    // Priorité 1 : année courante définie sur l'établissement
    if (anneeCouranteLibelle) {
      setAnneeFilter(anneeCouranteLibelle)
      setAnneeFilterInitialized(true)
      return
    }
    // Priorité 2 : si la query année courante a fini de charger et est null,
    // fallback heuristique date système (pour ne pas rester bloqué sans filtre).
    if (!anneeCouranteQuery.isLoading && anneeCouranteLibelle === null) {
      setAnneeFilter(currentAnneeUniversitaireHeuristic())
      setAnneeFilterInitialized(true)
    }
  }, [anneeCouranteLibelle, anneeCouranteQuery.isLoading, anneeFilterInitialized])

  const affectations = affectationsQuery.data?.affectations ?? []

  const filieres = useMemo(
    () =>
      (filieresQuery.data?.filieres ?? []).map((f) => ({
        id: f.id,
        nom: f.nom,
        code: f.code ?? null,
      })),
    [filieresQuery.data],
  )
  const unitesEnseignement = uesQuery.data?.unitesEnseignement ?? []
  const enseignants = useMemo(
    () =>
      (enseignantsQuery.data?.users ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
      })),
    [enseignantsQuery.data],
  )
  const isLoading = affectationsQuery.isLoading

  // Helper pour invalider le cache après mutation (create/update/delete/validate).
  const refreshAffectations = async () => {
    await queryClient.invalidateQueries({ queryKey: ['affectations'] })
  }

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

  // AFFECTATIONS-FIX-A12 : query dependencies pour preview suppression.
  // Se déclenche uniquement quand l'utilisateur ouvre le dialog de suppression
  // (confirmAction.type === 'delete'). Retourne le nb d'épreuves + sessions
  // liés au couple (enseignant, UE) de l'affectation ciblée.
  const deleteDepsQuery = useQuery<{
    epreuves: number
    sessions: number
    canDelete: boolean
  }>({
    queryKey: ['affectation-dependencies', confirmAction?.affectation.id],
    queryFn: async () => {
      const res = await fetch(`/api/affectations/${confirmAction!.affectation.id}/dependencies`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Failed to fetch dependencies')
      }
      return res.json()
    },
    enabled: confirmAction?.type === 'delete' && !!confirmAction?.affectation.id,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Add form state ───
  const [addEnseignantId, setAddEnseignantId] = useState('')
  const [addUEId, setAddUEId] = useState('')
  const [addTypeSeances, setAddTypeSeances] = useState<Set<string>>(new Set(['CM']))
  const [addGroupe, setAddGroupe] = useState('')
  const [addVolumeHeures, setAddVolumeHeures] = useState('')
  const [addAnnee, setAddAnnee] = useState('')
  const [addCommentaire, setAddCommentaire] = useState('')

  // ─── Edit form state ───
  const [editTypeSeance, setEditTypeSeance] = useState<'CM' | 'TD' | 'TP'>('CM')
  const [editGroupe, setEditGroupe] = useState('')
  const [editVolumeHeures, setEditVolumeHeures] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')

  // ─── Batch validate state ───
  const [isBatchValidating, setIsBatchValidating] = useState(false)

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
  // AFFECTATIONS-FIX-A13 : séparé VALIDEE / PUBLIEE pour éviter le label
  // ambigu "Validées" qui comptait aussi les publiées. Désormais 2 counts
  // distincts + un count combiné "confirmées" pour la carte.
  const totalAffectations = affectations.length
  const affectationsValidees = affectations.filter((a) => a.statut === 'VALIDEE').length
  const affectationsPubliees = affectations.filter((a) => a.statut === 'PUBLIEE').length
  const affectationsConfirmees = affectationsValidees + affectationsPubliees
  const uesWithAffectation = new Set(affectations.map((a) => a.uniteEnseignementId)).size
  const totalUEs = unitesEnseignement.length
  const tauxCouverture = totalUEs > 0 ? Math.round((uesWithAffectation / totalUEs) * 100) : 0
  const enseignantsActifs = new Set(affectations.map((a) => a.enseignantId)).size
  const totalVolume = affectations.reduce((sum, a) => sum + a.volumeHeures, 0)

  // ─── Teaching load data ───
  const teachingLoadData = useMemo(() => {
    return enseignants.map((ens) => {
      const ensAffectations = affectations.filter(a => a.enseignantId === ens.id)
      const totalCM = ensAffectations.filter(a => a.typeSeance === 'CM').reduce((sum, a) => sum + a.volumeHeures, 0)
      const totalTD = ensAffectations.filter(a => a.typeSeance === 'TD').reduce((sum, a) => sum + a.volumeHeures, 0)
      const totalTP = ensAffectations.filter(a => a.typeSeance === 'TP').reduce((sum, a) => sum + a.volumeHeures, 0)
      const total = totalCM + totalTD + totalTP
      const nbUEs = new Set(ensAffectations.map(a => a.uniteEnseignementId)).size
      const provisoires = ensAffectations.filter(a => a.statut === 'PROVISOIRE').length
      const validees = ensAffectations.filter(a => a.statut === 'VALIDEE').length
      const publiees = ensAffectations.filter(a => a.statut === 'PUBLIEE').length
      return {
        enseignant: ens,
        totalCM,
        totalTD,
        totalTP,
        total,
        nbUEs,
        provisoires,
        validees,
        publiees,
      }
    }).filter(e => e.total > 0).sort((a, b) => b.total - a.total)
  }, [enseignants, affectations])

  // ─── Matrix data ───
  const matrixData = useMemo(() => {
    let ues = unitesEnseignement
    let affs = affectations

    if (matrixFiliereFilter !== 'all') {
      ues = ues.filter((ue) => ue.filiereId === matrixFiliereFilter || ue.filieresSuppl?.some(s => s.filiereId === matrixFiliereFilter))
      affs = affs.filter((a) => a.uniteEnseignement.filiere.id === matrixFiliereFilter || a.uniteEnseignement.filieresSuppl?.some(s => s.filiereId === matrixFiliereFilter))
    }
    if (matrixNiveauFilter !== 'all') {
      ues = ues.filter((ue) => {
        if (ue.niveau === matrixNiveauFilter) return true
        // Also check niveaux JSON array
        if (ue.niveaux) {
          try {
            const niveauxList = JSON.parse(ue.niveaux) as string[]
            return niveauxList.includes(matrixNiveauFilter)
          } catch { return false }
        }
        return false
      })
      affs = affs.filter((a) => {
        const ue = a.uniteEnseignement
        if (ue.niveau === matrixNiveauFilter) return true
        // Also check niveaux JSON array
        try {
          const niveauxList = ue.niveaux ? JSON.parse(ue.niveaux as string) as string[] : []
          return niveauxList.includes(matrixNiveauFilter)
        } catch { return false }
      })
    }

    // Group UEs by filiere (including shared filières)
    const grouped = ues.reduce<Record<string, UEItem[]>>((acc, ue) => {
      // Add to owner filière group
      const ownerKey = ue.filiere?.nom ?? 'Sans filière'
      if (!acc[ownerKey]) acc[ownerKey] = []
      acc[ownerKey].push(ue)
      // Also add to shared filière groups
      for (const suppl of ue.filieresSuppl ?? []) {
        const sharedKey = suppl.filiere?.nom ?? 'Autre'
        if (!acc[sharedKey]) acc[sharedKey] = []
        acc[sharedKey].push(ue)
      }
      return acc
    }, {})

    // Build matrix rows
    const rows = ues.map((ue) => {
      const ueAffectations = affs.filter((a) => a.uniteEnseignementId === ue.id)
      const cm = ueAffectations.filter((a) => a.typeSeance === 'CM').map((a) => a.enseignant?.name ?? '—')
      const td = ueAffectations.filter((a) => a.typeSeance === 'TD').map((a) => a.enseignant?.name ?? '—')
      const tp = ueAffectations.filter((a) => a.typeSeance === 'TP').map((a) => a.enseignant?.name ?? '—')

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

  // ─── Auto-check types when UE selection changes ───
  useEffect(() => {
    if (addUEId) {
      const ue = unitesEnseignement.find((u) => u.id === addUEId)
      if (ue) {
        const autoTypes = new Set<string>()
        if (ue.volumeHeuresCM > 0) autoTypes.add('CM')
        if (ue.volumeHeuresTD > 0) autoTypes.add('TD')
        if (ue.volumeHeuresTP > 0) autoTypes.add('TP')
        if (autoTypes.size > 0) setAddTypeSeances(autoTypes)
      }
      // Auto-fill volume when only one type is selected
      const selectedUE = unitesEnseignement.find((u) => u.id === addUEId)
      if (selectedUE && addTypeSeances.size === 1) {
        const onlyType = Array.from(addTypeSeances)[0]
        if (onlyType === 'CM' && selectedUE.volumeHeuresCM > 0) setAddVolumeHeures(selectedUE.volumeHeuresCM.toString())
        else if (onlyType === 'TD' && selectedUE.volumeHeuresTD > 0) setAddVolumeHeures(selectedUE.volumeHeuresTD.toString())
        else if (onlyType === 'TP' && selectedUE.volumeHeuresTP > 0) setAddVolumeHeures(selectedUE.volumeHeuresTP.toString())
      } else if (addTypeSeances.size > 1) {
        setAddVolumeHeures('')
      }
    }
  }, [addUEId, unitesEnseignement])

  // ─── Auto-fill volume when type selection changes ───
  useEffect(() => {
    if (!addUEId || addTypeSeances.size !== 1) return
    const selectedUE = unitesEnseignement.find((u) => u.id === addUEId)
    if (!selectedUE) return
    const onlyType = Array.from(addTypeSeances)[0]
    if (onlyType === 'CM' && selectedUE.volumeHeuresCM > 0) setAddVolumeHeures(selectedUE.volumeHeuresCM.toString())
    else if (onlyType === 'TD' && selectedUE.volumeHeuresTD > 0) setAddVolumeHeures(selectedUE.volumeHeuresTD.toString())
    else if (onlyType === 'TP' && selectedUE.volumeHeuresTP > 0) setAddVolumeHeures(selectedUE.volumeHeuresTP.toString())
  }, [addTypeSeances])

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setAddEnseignantId('')
    setAddUEId('')
    setAddTypeSeances(new Set(['CM']))
    setAddGroupe('')
    setAddVolumeHeures('')
    setAddAnnee(anneeFilter || currentAnneeUniversitaireHeuristic())
    setAddCommentaire('')
    setAddDialogOpen(true)
  }

  // ─── Submit add (batch) ───
  const handleAddSubmit = async () => {
    if (!addEnseignantId) {
      toast.error('Champ manquant', { description: 'Sélectionnez un enseignant.' })
      return
    }
    if (!addUEId) {
      toast.error('Champ manquant', { description: 'Sélectionnez une unité d\'enseignement.' })
      return
    }
    if (addTypeSeances.size === 0) {
      toast.error('Champ manquant', { description: 'Sélectionnez au moins un élément d\'enseignement.' })
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
      // Get the selected UE to determine volume per type
      const selectedUE = unitesEnseignement.find((ue) => ue.id === addUEId)

      // Create one affectation per selected typeSeance
      const results = await Promise.allSettled(
        Array.from(addTypeSeances).map(async (typeSeance) => {
          // Auto-determine volume from UE if available
          let volume = parseFloat(addVolumeHeures)
          if (selectedUE && addTypeSeances.size > 1) {
            if (typeSeance === 'CM') volume = selectedUE.volumeHeuresCM || volume
            else if (typeSeance === 'TD') volume = selectedUE.volumeHeuresTD || volume
            else if (typeSeance === 'TP') volume = selectedUE.volumeHeuresTP || volume
          }

          const res = await fetch('/api/affectations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enseignantId: addEnseignantId,
              uniteEnseignementId: addUEId,
              typeSeance,
              groupe: addGroupe || null,
              volumeHeures: volume,
              anneeUniversitaire: addAnnee,
              commentaire: addCommentaire || null,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Erreur pour ${typeSeance}`)
          }
          return typeSeance
        })
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (succeeded > 0) {
        toast.success('Affectation(s) créée(s)', {
          description: `${succeeded} affectation(s) ajoutée(s) avec succès.${failed > 0 ? ` ${failed} en échec.` : ''}`,
        })
        setAddDialogOpen(false)
        await refreshAffectations()
      } else {
        toast.error('Erreur', { description: 'Aucune affectation n\'a pu être créée.' })
      }
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
      await refreshAffectations()
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
      await refreshAffectations()
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
      await refreshAffectations()
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
      await refreshAffectations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── Batch validate all PROVISOIRE ───
  const handleBatchValidate = async () => {
    const provisoires = affectations.filter(a => a.statut === 'PROVISOIRE')
    if (provisoires.length === 0) return
    setIsBatchValidating(true)
    try {
      const results = await Promise.allSettled(
        provisoires.map(a =>
          fetch(`/api/affectations/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statut: 'VALIDEE' }),
          })
        )
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      if (succeeded > 0) {
        toast.success('Validation en lot', {
          description: `${succeeded} affectation(s) validée(s).${failed > 0 ? ` ${failed} en échec.` : ''}`,
        })
        await refreshAffectations()
      } else {
        toast.error('Erreur', { description: 'Aucune affectation n\'a pu être validée.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Erreur lors de la validation en lot.' })
    } finally {
      setIsBatchValidating(false)
    }
  }

  // ─── UE label for select ───
  const getUELabel = (ue: UEItem) => {
    const niveauxDisplay = ue.niveaux ? (() => { try { return JSON.parse(ue.niveaux) as string[] } catch { return [ue.niveau] } })() : [ue.niveau]
    const allFilieres = [ue.filiere?.nom ?? '—', ...(ue.filieresSuppl ?? []).map(s => s.filiere?.nom ?? '—')]
    return `${ue.code} — ${ue.nom} (${allFilieres.join(', ')}, ${niveauxDisplay.join('/')})`
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <UserCheck className="h-7 w-7 text-success-text" />
            Affectations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Affectez les enseignants aux unités d&apos;enseignement et classes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {affectations.filter(a => a.statut === 'PROVISOIRE').length > 0 && (
            <Button
              variant="outline"
              className="border-success/30 text-success-text hover:bg-success/10"
              onClick={handleBatchValidate}
              disabled={isBatchValidating}
            >
              {isBatchValidating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Valider tout ({affectations.filter(a => a.statut === 'PROVISOIRE').length})
            </Button>
          )}
          <Button className="bg-success hover:bg-success/90" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4" />
            Nouvelle affectation
          </Button>
        </div>
      </div>

      {/* ─── Stats row ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <UserCheck className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total affectations</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalAffectations}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
            </div>
            <div>
              {/* AFFECTATIONS-FIX-A13 : label précis + sous-détail V/P */}
              <p className="text-xs text-muted-foreground">Confirmées</p>
              <p className="text-xl font-bold font-mono tabular-nums">{affectationsConfirmees}</p>
              <p className="text-xs text-muted-foreground/80">
                {affectationsValidees} valid. · {affectationsPubliees} publ.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <PieChart className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux couverture</p>
              <p className="text-xl font-bold font-mono tabular-nums">{tauxCouverture}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Users className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enseignants actifs</p>
              <p className="text-xl font-bold font-mono tabular-nums">{enseignantsActifs}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <Clock className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Volume total</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalVolume}h</p>
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
          <TabsTrigger value="load" className="gap-1.5">
            <Users className="h-4 w-4" />
            Charge d&apos;enseignement
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
            {/* ANNEE-COURANTE-NIVEAU-2 : Select bindé sur les années DB
                (remplace l'Input texte libre). Default = année courante. */}
            <Select value={anneeFilter} onValueChange={setAnneeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Année univ." />
              </SelectTrigger>
              <SelectContent>
                {annees.length === 0 && anneeFilter && (
                  <SelectItem value={anneeFilter}>{anneeFilter}</SelectItem>
                )}
                {annees.map((a) => (
                  <SelectItem key={a.id} value={a.libelle}>
                    {a.libelle}{a.libelle === anneeCouranteLibelle ? ' · courante' : ''}
                  </SelectItem>
                ))}
                {/* Fallback : si anneeFilter (heuristique) n'est pas dans la DB,
                    on l'affiche quand même pour ne pas perdre le filtre. */}
                {anneeFilter && !annees.some((a) => a.libelle === anneeFilter) && (
                  <SelectItem value={anneeFilter}>{anneeFilter} (hors DB)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ─── Loading state ─── */}
          {isLoading && (
            <Card>
              <CardContent className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <PulseSkeleton className="h-5 w-32" />
                    <PulseSkeleton className="h-5 w-40" />
                    <PulseSkeleton className="h-5 w-20" />
                    <PulseSkeleton className="h-5 w-16" />
                    <PulseSkeleton className="h-5 w-20" />
                    <PulseSkeleton className="h-5 w-16" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ─── Empty state ─── */}
          {!isLoading && filteredAffectations.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <UserCheck className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucune affectation trouvée</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                {enseignantSearch || filiereFilter !== 'all' || niveauFilter !== 'all' || statutFilter !== 'all'
                  ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
                  : 'Commencez par affecter des enseignants aux unités d\'enseignement.'}
              </p>
              {!enseignantSearch && filiereFilter === 'all' && niveauFilter === 'all' && statutFilter === 'all' && (
                <Button className="mt-6 bg-success hover:bg-success/90" onClick={handleOpenAdd}>
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
                        <TableHead className="font-display">Enseignant</TableHead>
                        <TableHead className="font-display">Unité d&apos;enseignement</TableHead>
                        <TableHead className="font-display">Filière</TableHead>
                        <TableHead className="font-display">Niveau</TableHead>
                        <TableHead className="font-display">Type</TableHead>
                        <TableHead className="font-display">Groupe</TableHead>
                        <TableHead className="font-display">Volume</TableHead>
                        <TableHead className="font-display">Année</TableHead>
                        <TableHead className="font-display">Statut</TableHead>
                        <TableHead className="text-right font-display">Actions</TableHead>
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
                            <div className="flex flex-wrap gap-1">
                              <Badge className="bg-success/10 text-success-text border-success/30 text-xs">
                                {affectation.uniteEnseignement?.filiere?.nom ?? '—'}
                              </Badge>
                              {affectation.uniteEnseignement.filieresSuppl?.map((s) => (
                                <Badge key={s.id} className="bg-success/10 text-success-text border-success/30 text-xs">
                                  <Share2 className="h-3 w-3 mr-1" />
                                  {s.filiere?.nom ?? '—'}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const nivArr = affectation.uniteEnseignement.niveaux
                                ? (() => { try { return JSON.parse(affectation.uniteEnseignement.niveaux) as string[] } catch { return [affectation.uniteEnseignement.niveau] } })()
                                : [affectation.uniteEnseignement.niveau]
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {nivArr.map((n) => <span key={n}>{getNiveauBadge(n)}</span>)}
                                </div>
                              )
                            })()}
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
                                    className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                                    onClick={() => handleOpenEdit(affectation)}
                                    title="Modifier"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setConfirmAction({ type: 'delete', affectation })}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-success-text hover:text-success-text hover:bg-success/10"
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
                                  className="h-8 px-2 text-info hover:text-info hover:bg-info/10"
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

        {/* ═══ Tab 3: Charge d'enseignement ═══ */}
        <TabsContent value="load" className="space-y-4">
          {teachingLoadData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <Users className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucune charge d&apos;enseignement</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Les charges apparaîtront une fois les enseignants affectés aux UEs.
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-display">Enseignant</TableHead>
                        <TableHead className="text-center font-display">UEs</TableHead>
                        <TableHead className="text-center font-display">CM</TableHead>
                        <TableHead className="text-center font-display">TD</TableHead>
                        <TableHead className="text-center font-display">TP</TableHead>
                        <TableHead className="text-center font-display">Total</TableHead>
                        <TableHead className="font-display">Statuts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teachingLoadData.map((row) => (
                        <TableRow key={row.enseignant.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{row.enseignant.name}</p>
                              <p className="text-xs text-muted-foreground">{row.enseignant.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">{row.nbUEs}</TableCell>
                          <TableCell className="text-center">
                            {row.totalCM > 0 ? <Badge className="bg-success/10 text-success-text text-xs">{row.totalCM}h</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.totalTD > 0 ? <Badge className="bg-success/10 text-success-text text-xs">{row.totalTD}h</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.totalTP > 0 ? <Badge className="bg-warning/10 text-warning text-xs">{row.totalTP}h</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-bold text-base font-mono tabular-nums">{row.total}h</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {row.provisoires > 0 && <Badge className="bg-warning/10 text-warning text-xs">{row.provisoires} prov.</Badge>}
                              {row.validees > 0 && <Badge className="bg-success/10 text-success-text text-xs">{row.validees} valid.</Badge>}
                              {row.publiees > 0 && <Badge className="bg-info/10 text-info text-xs">{row.publiees} publ.</Badge>}
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <Grid3X3 className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucune unité d&apos;enseignement</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Aucune UE ne correspond à vos filtres. Créez des unités d&apos;enseignement dans vos filières pour voir la matrice.
              </p>
            </div>
          )}

          {/* ─── Matrix grid ─── */}
          {matrixData.rows.length > 0 && (
            <div className="space-y-6">
              {Object.entries(matrixData.grouped).map(([filiereNom, ues]) => {
                const filiereRows = matrixData.rows.filter((r) => r.ue.filiere.nom === filiereNom || r.ue.filieresSuppl?.some(s => s.filiere.nom === filiereNom))
                return (
                  <Card key={filiereNom}>
                    <CardContent className="p-0">
                      <div className="px-4 py-3 border-b bg-muted/30">
                        <h3 className="font-display font-semibold tracking-tight text-sm flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-success-text" />
                          {filiereNom}
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px] font-display">Unité d&apos;enseignement</TableHead>
                              <TableHead className="w-[60px] text-center font-display">Niveau</TableHead>
                              <TableHead className="text-center font-display">CM</TableHead>
                              <TableHead className="text-center font-display">TD</TableHead>
                              <TableHead className="text-center font-display">TP</TableHead>
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
                                  {(() => {
                                    const nivArr = row.ue.niveaux
                                      ? (() => { try { return JSON.parse(row.ue.niveaux) as string[] } catch { return [row.ue.niveau] } })()
                                      : [row.ue.niveau]
                                    return (
                                      <div className="flex flex-col items-center gap-0.5">
                                        {nivArr.map((n) => <span key={n}>{getNiveauBadge(n)}</span>)}
                                      </div>
                                    )
                                  })()}
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
              <UserCheck className="h-5 w-5 text-success-text" />
              Nouvelle affectation
            </DialogTitle>
            <DialogDescription>
              Affectez un enseignant à une unité d&apos;enseignement pour un ou plusieurs éléments.
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
                          <span className="text-xs text-muted-foreground">{[ue.filiere?.nom ?? '—', ...(ue.filieresSuppl ?? []).map(s => s.filiere?.nom ?? '—')].join(', ')} • {ue.niveaux ? (() => { try { return (JSON.parse(ue.niveaux) as string[]).join('/') } catch { return ue.niveau } })() : ue.niveau}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Éléments d&apos;enseignement *</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'CM', label: 'CM — Cours Magistral', volKey: 'volumeHeuresCM', color: 'CM' as const },
                  { value: 'TD', label: 'TD — Travaux Dirigés', volKey: 'volumeHeuresTD', color: 'TD' as const },
                  { value: 'TP', label: 'TP — Travaux Pratiques', volKey: 'volumeHeuresTP', color: 'TP' as const },
                ].map((type) => {
                  const selectedUE = unitesEnseignement.find((ue) => ue.id === addUEId)
                  const vol = selectedUE ? (selectedUE[type.volKey as keyof UEItem] as number) : 0
                  const isChecked = addTypeSeances.has(type.value)
                  const styles = TYPE_STYLES[type.color]
                  return (
                    <label
                      key={type.value}
                      className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        isChecked ? styles.checked : styles.unchecked
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const next = new Set(addTypeSeances)
                          if (checked) next.add(type.value)
                          else if (next.size > 1) next.delete(type.value) // keep at least one
                          setAddTypeSeances(next)
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{type.value}</span>
                        <span className="block text-xs text-muted-foreground">{vol}h</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Groupe</Label>
              <Input
                placeholder="Ex: Groupe A"
                value={addGroupe}
                onChange={(e) => setAddGroupe(e.target.value)}
              />
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
              className="bg-success hover:bg-success/90"
              onClick={handleAddSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {addTypeSeances.size > 1 ? `Créer ${addTypeSeances.size} affectations` : 'Créer l\'affectation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Affectation Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-success-text" />
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
                <span className="font-medium">{editingAffectation ? [editingAffectation.uniteEnseignement?.filiere?.nom ?? '—', ...(editingAffectation.uniteEnseignement?.filieresSuppl ?? []).map(s => s.filiere?.nom ?? '—')].join(', ') : ''}</span>
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
              className="bg-success hover:bg-success/90"
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
              {confirmAction?.type === 'validate' && <CheckCircle2 className="h-5 w-5 text-success-text" />}
              {confirmAction?.type === 'publish' && <Send className="h-5 w-5 text-info" />}
              {confirmAction?.type === 'delete' && <AlertTriangle className="h-5 w-5 text-destructive" />}
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
                  {/* AFFECTATIONS-FIX-A12 : preview des dépendances (épreuves + sessions) */}
                  {deleteDepsQuery.isLoading ? (
                    <span className="block mt-2 text-xs text-muted-foreground">Chargement des dépendances…</span>
                  ) : deleteDepsQuery.error ? (
                    <span className="block mt-2 text-xs text-muted-foreground">(dépendances indisponibles)</span>
                  ) : deleteDepsQuery.data && (deleteDepsQuery.data.epreuves > 0 || deleteDepsQuery.data.sessions > 0) ? (
                    <span className="block mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
                      <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />
                      Attention : cet enseignant a{' '}
                      <strong>{deleteDepsQuery.data.epreuves}</strong> épreuve(s)
                      {deleteDepsQuery.data.sessions > 0 && (
                        <> et <strong>{deleteDepsQuery.data.sessions}</strong> session(s) étudiant</>
                      )}{' '}
                      sur cette UE. La suppression de l&apos;affectation ne supprimera pas ces évaluations, mais l&apos;enseignant ne sera plus officiellement affecté à cette UE.
                    </span>
                  ) : deleteDepsQuery.data ? (
                    <span className="block mt-2 text-xs text-success-text">
                      ✓ Aucune épreuve ni session liée à cette affectation — suppression sans impact.
                    </span>
                  ) : null}
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
                  ? 'bg-destructive hover:bg-destructive/90'
                  : confirmAction?.type === 'validate'
                    ? 'bg-success hover:bg-success/90'
                    : 'bg-info hover:bg-info/90'
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
      <div className="rounded-md bg-success/10 border border-success/30 px-2 py-1">
        {names.length > 0 ? (
          <div className="space-y-0.5">
            {names.map((name, i) => (
              <p key={i} className="text-xs font-medium text-success-text">{name}</p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-success-text">Affecté</p>
        )}
      </div>
    )
  }

  // Not covered — show red warning
  return (
    <div className="rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1">
      <p className="text-xs font-medium text-destructive">Non affecté</p>
    </div>
  )
}
