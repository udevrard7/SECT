'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
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
  ChevronDown,
  Lock,
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
  // SECT-AFFECTATION-PUBLISH-ENRICH-1 : horodatage de publication (RFC3339 UTC,
  // nullable tant que statut != PUBLIEE). Permet d'afficher « Publiée le … »
  // côté UI sans refetch.
  publishedAt?: string
  publishedById?: string
  publishedBy?: { id: string; name: string }
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

// SECT-AFFECTATION-PUBLISH-ENRICH-1 : formatage « Publiée le DD/MM/YYYY à HH:mm »
// depuis une date ISO (RFC3339 UTC). Retourne '' si la date est vide/invalide.
// Format FR court — lisible pour un responsable pédagogique.
function formatPublishedDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Abidjan',
  }).format(d)
}

// SECT-AFFECTATION-PUBLISH-ENRICH-1 : détermine le message d'erreur à afficher
// quand le backend retourne 409 (affectation verrouillée car PUBLIEE). Si la
// response contient un message d'erreur explicite, on l'utilise ; sinon on
// retourne le message par défaut.
function affectationLockedMessage(serverMsg?: string): string {
  if (serverMsg && serverMsg.trim() !== '') return serverMsg
  return 'Cette affectation est publiée — repassez-la en PROVISOIRE pour la modifier'
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

// ─── SECT-AFFECTATIONS-GROUPED-1 : groupement d'affichage ───
// Une « affectation » métier = 1..n lignes DB (une par élément CM/TD/TP).
// Le groupement fusionne les lignes partageant (enseignant, UE, groupe, année)
// en une seule entrée UI. Le schéma DB reste inchangé (1 ligne par élément),
// conformément au standard métier (service d'enseignement par composant).

interface AffectationGroup {
  key: string
  enseignant: AffectationItem['enseignant']
  uniteEnseignement: AffectationItem['uniteEnseignement']
  groupe: string | null
  anneeUniversitaire: string
  items: AffectationItem[]
  byType: Partial<Record<'CM' | 'TD' | 'TP', AffectationItem>>
  totalVolume: number
  // Statut de groupe = statut le moins avancé de ses éléments (une seule
  // ligne PROVISOIRE suffit à considérer le groupe provisoire).
  statut: 'PROVISOIRE' | 'VALIDEE' | 'PUBLIEE'
  publishedAt?: string
  publishedBy?: { id: string; name: string }
}

function computeGroupStatut(items: AffectationItem[]): AffectationGroup['statut'] {
  let statut: AffectationGroup['statut'] = 'PUBLIEE'
  for (const it of items) {
    if (it.statut === 'PROVISOIRE') return 'PROVISOIRE'
    if (it.statut === 'VALIDEE') statut = 'VALIDEE'
  }
  return statut
}

function groupAffectations(affectations: AffectationItem[]): AffectationGroup[] {
  const map = new Map<string, AffectationGroup>()
  for (const a of affectations) {
    const key = `${a.enseignantId}|${a.uniteEnseignementId}|${a.groupe ?? ''}|${a.anneeUniversitaire}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        enseignant: a.enseignant,
        uniteEnseignement: a.uniteEnseignement,
        groupe: a.groupe,
        anneeUniversitaire: a.anneeUniversitaire,
        items: [],
        byType: {},
        totalVolume: 0,
        statut: 'PROVISOIRE',
      }
      map.set(key, g)
    }
    g.items.push(a)
    g.byType[a.typeSeance] = a
    g.totalVolume += a.volumeHeures
  }
  const groups = Array.from(map.values())
  for (const g of groups) {
    g.statut = computeGroupStatut(g.items)
    // publishedAt le plus récent du groupe (affichage « Publiée le … »)
    const published = g.items.filter((it) => it.publishedAt)
    if (published.length > 0) {
      g.publishedAt = published.reduce(
        (max, it) => (it.publishedAt! > max ? it.publishedAt! : max),
        published[0].publishedAt!,
      )
      g.publishedBy = published.find((it) => it.publishedBy)?.publishedBy
    }
  }
  return groups
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
    // SECT-AFFECTATIONS-GROUPED-1 : le filtre statut s'applique côté client sur
    // le statut de GROUPE (le filtrage serveur retournerait des groupes
    // « partiels » — uniquement les lignes du statut filtré).
    queryKey: ['affectations', etabId, filiereFilter, niveauFilter, anneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('etablissementId', etabId!)
      if (filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (niveauFilter !== 'all') params.set('niveau', niveauFilter)
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
  // SECT-AFFECTATIONS-GROUPED-1 : édition au niveau du groupe.
  const [editingGroup, setEditingGroup] = useState<AffectationGroup | null>(null)

  // ─── SECT-AFFECTATIONS-GROUPED-1 : lignes dépliables (détail par élément) ───
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set())
  const toggleExpanded = (key: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ─── Confirm dialog state (niveau groupe) ───
  const [confirmAction, setConfirmAction] = useState<{
    type: 'validate' | 'publish' | 'delete'
    group: AffectationGroup
    // itemId défini = suppression d'un seul élément du groupe (vue dépliée)
    itemId?: string
  } | null>(null)

  // AFFECTATIONS-FIX-A12 + SECT-AFFECTATIONS-GROUPED-1 : dependencies pour
  // preview suppression — au niveau groupe (somme sur les éléments) ou élément
  // unique (itemId défini, suppression depuis la vue dépliée).
  const deleteDepsQuery = useQuery<{
    epreuves: number
    sessions: number
    canDelete: boolean
  }>({
    queryKey: ['affectation-dependencies', confirmAction?.group.key, confirmAction?.itemId ?? 'all'],
    queryFn: async () => {
      const items = confirmAction?.itemId
        ? confirmAction.group.items.filter((it) => it.id === confirmAction.itemId)
        : confirmAction!.group.items
      const results = await Promise.all(
        items.map(async (it) => {
          const res = await fetch(`/api/affectations/${it.id}/dependencies`)
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.error ?? 'Failed to fetch dependencies')
          }
          return res.json() as Promise<{ epreuves: number; sessions: number; canDelete: boolean }>
        }),
      )
      return {
        epreuves: results.reduce((s, r) => s + (r.epreuves ?? 0), 0),
        sessions: results.reduce((s, r) => s + (r.sessions ?? 0), 0),
        canDelete: results.every((r) => r.canDelete),
      }
    },
    enabled: confirmAction?.type === 'delete' && !!confirmAction?.group.key,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Add form state ───
  const [addEnseignantId, setAddEnseignantId] = useState('')
  const [addUEId, setAddUEId] = useState('')
  const [addTypeSeances, setAddTypeSeances] = useState<Set<string>>(new Set(['CM']))
  const [addGroupe, setAddGroupe] = useState('')
  // SECT-AFFECTATIONS-VOL-AUTO-2 : volume par élément (CM/TD/TP), pré-rempli
  // depuis les volumes de l'UE — le champ volume unique disparaît.
  const [addVolumes, setAddVolumes] = useState<Record<'CM' | 'TD' | 'TP', string>>({
    CM: '',
    TD: '',
    TP: '',
  })
  const [addAnnee, setAddAnnee] = useState('')
  const [addCommentaire, setAddCommentaire] = useState('')

  // SECT-AFFECTATIONS-VOL-AUTO-2 : total calculé des volumes saisis.
  const addTotalVolume = useMemo(
    () =>
      Array.from(addTypeSeances).reduce(
        (sum, t) => sum + (parseFloat(addVolumes[t as 'CM' | 'TD' | 'TP']) || 0),
        0,
      ),
    [addTypeSeances, addVolumes],
  )

  // ─── Edit form state (niveau groupe — SECT-AFFECTATIONS-GROUPED-1) ───
  const [editVolumes, setEditVolumes] = useState<Record<string, string>>({})
  const [editGroupe, setEditGroupe] = useState('')
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

  // ─── SECT-AFFECTATIONS-GROUPED-1 : groupes (enseignant, UE, groupe, année) ───
  // Fusion d'affichage : les lignes partageant (enseignant, UE, groupe, année)
  // sont affichées en une seule entrée (une ligne DB par élément CM/TD/TP).
  const affectationGroups = useMemo(() => groupAffectations(affectations), [affectations])

  const filteredGroups = useMemo(() => {
    let result = affectationGroups

    if (enseignantSearch) {
      const searchLower = enseignantSearch.toLowerCase()
      result = result.filter(
        (g) =>
          g.enseignant.name.toLowerCase().includes(searchLower) ||
          g.enseignant.email.toLowerCase().includes(searchLower)
      )
    }

    if (statutFilter !== 'all') {
      result = result.filter((g) => g.statut === statutFilter)
    }

    return result
  }, [affectationGroups, enseignantSearch, statutFilter])

  // ─── Stats ───
  // AFFECTATIONS-FIX-A13 : séparé VALIDEE / PUBLIEE pour éviter le label
  // ambigu "Validées" qui comptait aussi les publiées. Désormais 2 counts
  // distincts + un count combiné "confirmées" pour la carte.
  // SECT-AFFECTATIONS-GROUPED-1 : les compteurs suivent le groupement —
  // « Total affectations » = nombre de groupes (lignes CM/TD/TP fusionnées).
  const totalAffectations = affectationGroups.length
  const affectationsValidees = affectationGroups.filter((g) => g.statut === 'VALIDEE').length
  const affectationsPubliees = affectationGroups.filter((g) => g.statut === 'PUBLIEE').length
  const affectationsConfirmees = affectationsValidees + affectationsPubliees
  const provisoireGroups = affectationGroups.filter((g) => g.statut === 'PROVISOIRE')
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

  // SECT-AFFECTATIONS-VOL-AUTO-2 : l'auto-coche des éléments et le
  // pré-remplissage des volumes par élément sont désormais pilotés par le
  // handler onValueChange du Select UE (event-driven) — plus d'useEffect à
  // dépendances stales. Les anciens effects vidaient le champ volume et le
  // rendaient requis même quand le submit l'ignorait au profit des volumes UE.

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setAddEnseignantId('')
    setAddUEId('')
    setAddTypeSeances(new Set(['CM']))
    setAddGroupe('')
    setAddVolumes({ CM: '', TD: '', TP: '' })
    setAddAnnee(anneeFilter || currentAnneeUniversitaireHeuristic())
    setAddCommentaire('')
    setAddDialogOpen(true)
  }

  // ─── Submit add (batch) — volumes par élément (SECT-AFFECTATIONS-VOL-AUTO-2) ───
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
    // SECT-AFFECTATIONS-VOL-AUTO-2 : le volume n'est requis à la main que pour
    // les éléments cochés dont l'UE ne définit pas de volume (pré-remplis sinon).
    const missingVolumes = Array.from(addTypeSeances).filter((t) => {
      const v = addVolumes[t as 'CM' | 'TD' | 'TP']
      return !v || parseFloat(v) <= 0
    })
    if (missingVolumes.length > 0) {
      toast.error('Volume horaire manquant', {
        description: `Volume requis pour ${missingVolumes.join(', ')} — l'UE ne définit pas de volume pour ce(s) élément(s).`,
      })
      return
    }
    if (!addAnnee) {
      toast.error('Champ manquant', { description: 'L\'année universitaire est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      // Create one affectation per selected typeSeance — le volume envoyé est
      // exactement celui affiché dans le champ de l'élément (WYSIWYG).
      const results = await Promise.allSettled(
        Array.from(addTypeSeances).map(async (typeSeance) => {
          const volume = parseFloat(addVolumes[typeSeance as 'CM' | 'TD' | 'TP'])
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
        toast.success('Affectation créée', {
          description: `${succeeded} élément(s) affecté(s) avec succès.${failed > 0 ? ` ${failed} en échec.` : ''}`,
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

  // ─── Open edit dialog (niveau groupe — SECT-AFFECTATIONS-GROUPED-1) ───
  const handleOpenEdit = (group: AffectationGroup) => {
    setEditingGroup(group)
    setEditGroupe(group.groupe ?? '')
    setEditCommentaire(group.items.find((it) => it.commentaire)?.commentaire ?? '')
    const vols: Record<string, string> = {}
    for (const it of group.items) vols[it.typeSeance] = String(it.volumeHeures)
    setEditVolumes(vols)
    setEditDialogOpen(true)
  }

  // ─── Submit edit (groupe) ───
  const handleEditSubmit = async () => {
    if (!editingGroup) return

    // Les éléments PUBLIEE sont verrouillés côté backend (lock publication) —
    // on ne PATCH que les éléments éditables (PROVISOIRE/VALIDEE).
    const editable = editingGroup.items.filter((it) => it.statut !== 'PUBLIEE')
    if (editable.length === 0) return

    for (const it of editable) {
      const v = editVolumes[it.typeSeance]
      if (!v || parseFloat(v) <= 0) {
        toast.error('Champ invalide', { description: `Le volume horaire pour ${it.typeSeance} doit être un nombre positif.` })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const results = await Promise.allSettled(
        editable.map(async (it) => {
          const res = await fetch(`/api/affectations/${it.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupe: editGroupe || null,
              volumeHeures: parseFloat(editVolumes[it.typeSeance]),
              commentaire: editCommentaire || null,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            // SECT-AFFECTATION-PUBLISH-ENRICH-1 : 409 = élément PUBLIEE verrouillé.
            if (res.status === 409) {
              throw new Error(affectationLockedMessage(err.error))
            }
            throw new Error(err.error || `Erreur pour l'élément ${it.typeSeance}`)
          }
          return it.typeSeance
        }),
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - succeeded

      if (succeeded > 0) {
        toast.success('Affectation modifiée', {
          description: `${succeeded} élément(s) mis à jour.${failed > 0 ? ` ${failed} en échec.` : ''}`,
        })
        setEditDialogOpen(false)
        setEditingGroup(null)
        await refreshAffectations()
      } else {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        toast.error('Erreur', {
          description: firstErr?.reason instanceof Error ? firstErr.reason.message : 'Une erreur est survenue.',
        })
      }
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Validate (groupe) — SECT-AFFECTATIONS-GROUPED-1 ───
  const handleValidate = async () => {
    if (!confirmAction) return
    const targets = confirmAction.group.items.filter((it) => it.statut === 'PROVISOIRE')
    if (targets.length === 0) return
    try {
      const results = await Promise.allSettled(
        targets.map(async (it) => {
          const res = await fetch(`/api/affectations/${it.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statut: 'VALIDEE' }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            // SECT-AFFECTATION-PUBLISH-ENRICH-1 : 409 = publiée entre-temps.
            if (res.status === 409) {
              throw new Error(affectationLockedMessage(err.error))
            }
            throw new Error(err.error || 'Erreur lors de la validation')
          }
          return true
        })
      )
      const okCount = results.filter((r) => r.status === 'fulfilled').length
      if (okCount > 0) {
        toast.success('Affectation validée', {
          description: `${confirmAction.group.enseignant.name} → ${confirmAction.group.uniteEnseignement.nom} (${okCount}/${targets.length} élément(s))`,
        })
        setConfirmAction(null)
        await refreshAffectations()
      } else {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        toast.error('Erreur', {
          description: firstErr?.reason instanceof Error ? firstErr.reason.message : 'Aucun élément n\'a pu être validé.',
        })
      }
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── Publish (groupe) — SECT-AFFECTATIONS-GROUPED-1 ───
  const handlePublish = async () => {
    if (!confirmAction) return
    const targets = confirmAction.group.items.filter((it) => it.statut !== 'PUBLIEE')
    if (targets.length === 0) return
    try {
      const results = await Promise.allSettled(
        targets.map(async (it) => {
          const res = await fetch(`/api/affectations/${it.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statut: 'PUBLIEE' }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            // SECT-AFFECTATION-PUBLISH-ENRICH-1 : 409 = déjà PUBLIEE (cas rare :
            // double-clic ou publication concurrente par un autre responsable).
            if (res.status === 409) {
              throw new Error(affectationLockedMessage(err.error))
            }
            throw new Error(err.error || 'Erreur lors de la publication')
          }
          return true
        })
      )
      const okCount = results.filter((r) => r.status === 'fulfilled').length
      if (okCount > 0) {
        toast.success('Affectation publiée', {
          description: `${confirmAction.group.enseignant.name} → ${confirmAction.group.uniteEnseignement.nom} (${okCount}/${targets.length} élément(s))`,
        })
        setConfirmAction(null)
        await refreshAffectations()
      } else {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        toast.error('Erreur', {
          description: firstErr?.reason instanceof Error ? firstErr.reason.message : 'Aucun élément n\'a pu être publié.',
        })
      }
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  // ─── Delete (groupe ou élément unique) — SECT-AFFECTATIONS-GROUPED-1 ───
  const handleDelete = async () => {
    if (!confirmAction) return
    const targets = confirmAction.itemId
      ? confirmAction.group.items.filter((it) => it.id === confirmAction.itemId)
      : confirmAction.group.items
    if (targets.length === 0) return
    try {
      const results = await Promise.allSettled(
        targets.map(async (it) => {
          const res = await fetch(`/api/affectations/${it.id}`, {
            method: 'DELETE',
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || 'Erreur lors de la suppression')
          }
          return true
        })
      )
      const okCount = results.filter((r) => r.status === 'fulfilled').length
      if (okCount > 0) {
        toast.success(okCount === 1 ? 'Élément supprimé' : 'Affectation supprimée', {
          description: `${okCount} élément(s) supprimé(s) avec succès.`,
        })
        setConfirmAction(null)
        await refreshAffectations()
      } else {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        toast.error('Erreur', {
          description: firstErr?.reason instanceof Error ? firstErr.reason.message : 'Aucun élément n\'a pu être supprimé.',
        })
      }
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
          {/* SECT-AFFECTATIONS-GROUPED-1 : compte au niveau groupe */}
          {provisoireGroups.length > 0 && (
            <Button
              variant="outline"
              className="border-success/30 text-success-text hover:bg-success/10"
              onClick={handleBatchValidate}
              disabled={isBatchValidating}
            >
              {isBatchValidating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Valider tout ({provisoireGroups.length})
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
              <SelectTrigger className="w-full sm:w-[200px]">
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
              <SelectTrigger className="w-full sm:w-[120px]">
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
              <SelectTrigger className="w-full sm:w-[160px]">
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
              <SelectTrigger className="w-full sm:w-[150px]">
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
          {!isLoading && filteredGroups.length === 0 && (
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

          {/* ─── Affectations table (groupée — SECT-AFFECTATIONS-GROUPED-1) ───
              Les lignes DB partageant (enseignant, UE, groupe, année) sont
              fusionnées en une entrée ; le chevron déplie le détail par
              élément CM/TD/TP (volume, statut, publication, suppression). */}
          {!isLoading && filteredGroups.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 font-display" />
                        <TableHead className="font-display">Enseignant</TableHead>
                        <TableHead className="font-display">Unité d&apos;enseignement</TableHead>
                        <TableHead className="font-display">Filière</TableHead>
                        <TableHead className="font-display">Niveau</TableHead>
                        <TableHead className="font-display">Éléments</TableHead>
                        <TableHead className="font-display">Volume</TableHead>
                        <TableHead className="font-display">Année</TableHead>
                        <TableHead className="font-display">Statut</TableHead>
                        <TableHead className="text-right font-display">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGroups.map((group) => {
                        const isExpanded = expandedGroupKeys.has(group.key)
                        const hasMixedStatuts = new Set(group.items.map((it) => it.statut)).size > 1
                        const hasEditable = group.items.some((it) => it.statut !== 'PUBLIEE')
                        return (
                          <Fragment key={group.key}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => toggleExpanded(group.key)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => toggleExpanded(group.key)}
                                  title={isExpanded ? 'Réduire le détail' : 'Voir le détail par élément'}
                                >
                                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{group.enseignant.name}</p>
                                  <p className="text-xs text-muted-foreground">{group.enseignant.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium">{group.uniteEnseignement.code}</p>
                                  <p className="text-xs text-muted-foreground">{group.uniteEnseignement.nom}</p>
                                  {group.groupe && (
                                    <p className="text-xs text-muted-foreground">Groupe {group.groupe}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="flex flex-wrap gap-1">
                                  <Badge className="bg-success/10 text-success-text border-success/30 text-xs">
                                    {group.uniteEnseignement?.filiere?.nom ?? '—'}
                                  </Badge>
                                  {group.uniteEnseignement.filieresSuppl?.map((s) => (
                                    <Badge key={s.id} className="bg-success/10 text-success-text border-success/30 text-xs">
                                      <Share2 className="h-3 w-3 mr-1" />
                                      {s.filiere?.nom ?? '—'}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const nivArr = group.uniteEnseignement.niveaux
                                    ? (() => { try { return JSON.parse(group.uniteEnseignement.niveaux) as string[] } catch { return [group.uniteEnseignement.niveau] } })()
                                    : [group.uniteEnseignement.niveau]
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {nivArr.map((n) => <span key={n}>{getNiveauBadge(n)}</span>)}
                                    </div>
                                  )
                                })()}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {(['CM', 'TD', 'TP'] as const)
                                    .filter((t) => group.byType[t])
                                    .map((t) => (
                                      <Badge
                                        key={t}
                                        className={t === 'TP'
                                          ? 'bg-warning/10 text-warning border-warning/30 text-xs'
                                          : 'bg-success/10 text-success-text border-success/30 text-xs'}
                                      >
                                        {t} {group.byType[t]!.volumeHeures}h
                                      </Badge>
                                    ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                <span className="font-mono tabular-nums">{group.totalVolume}h</span>
                                <span className="block text-xs text-muted-foreground">
                                  {group.items.length} élément{group.items.length > 1 ? 's' : ''}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {group.anneeUniversitaire}
                              </TableCell>
                              <TableCell>
                                {getStatutBadge(group.statut)}
                                {hasMixedStatuts && (
                                  <span className="block text-xs text-warning mt-0.5">statuts mixtes</span>
                                )}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {group.statut === 'PROVISOIRE' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-success-text hover:text-success-text hover:bg-success/10"
                                      onClick={() => setConfirmAction({ type: 'validate', group })}
                                      title="Valider tous les éléments"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                      <span className="text-xs">Valider</span>
                                    </Button>
                                  )}
                                  {group.statut === 'VALIDEE' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-info hover:text-info hover:bg-info/10"
                                      onClick={() => setConfirmAction({ type: 'publish', group })}
                                      title="Publier tous les éléments"
                                    >
                                      <Send className="h-3.5 w-3.5 mr-1" />
                                      <span className="text-xs">Publier</span>
                                    </Button>
                                  )}
                                  {group.statut === 'PUBLIEE' && (
                                    <span
                                      className="flex items-center gap-1.5 text-xs text-muted-foreground px-2"
                                      title={
                                        group.publishedAt
                                          ? `Publiée le ${formatPublishedDate(group.publishedAt)}${
                                              group.publishedBy?.name ? ` par ${group.publishedBy.name}` : ''
                                            }`
                                          : 'Affectation publiée'
                                      }
                                    >
                                      <Clock className="h-3 w-3" />
                                      {group.publishedAt
                                        ? `Publiée le ${formatPublishedDate(group.publishedAt)}`
                                        : 'Publiée'}
                                    </span>
                                  )}
                                  {hasEditable && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                                      onClick={() => handleOpenEdit(group)}
                                      title="Modifier"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setConfirmAction({ type: 'delete', group })}
                                    title="Supprimer l'affectation"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={10} className="py-3">
                                  <div className="rounded-lg border bg-background p-3">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">
                                      Détail par élément d&apos;enseignement
                                    </p>
                                    <div className="space-y-1.5">
                                      {group.items.map((it) => (
                                        <div
                                          key={it.id}
                                          className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                                        >
                                          <div className="flex flex-1 flex-wrap items-center gap-3">
                                            {getTypeSeanceBadge(it.typeSeance)}
                                            <span className="text-sm font-medium font-mono tabular-nums">{it.volumeHeures}h</span>
                                            {getStatutBadge(it.statut)}
                                            {it.statut === 'PUBLIEE' && it.publishedAt && (
                                              <span className="text-xs text-muted-foreground">
                                                Publiée le {formatPublishedDate(it.publishedAt)}
                                                {it.publishedBy?.name ? ` par ${it.publishedBy.name}` : ''}
                                              </span>
                                            )}
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setConfirmAction({ type: 'delete', group, itemId: it.id })}
                                            title={`Supprimer l'élément ${it.typeSeance}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
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
              <SelectTrigger className="w-full sm:w-[220px]">
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
              <SelectTrigger className="w-full sm:w-[140px]">
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
              <Select
                value={addUEId}
                onValueChange={(v) => {
                  setAddUEId(v)
                  // SECT-AFFECTATIONS-VOL-AUTO-2 : à la sélection de l'UE —
                  // (1) coche auto des éléments dont l'UE définit un volume,
                  // (2) pré-remplissage des volumes par élément (modifiables).
                  const ue = unitesEnseignement.find((u) => u.id === v)
                  const autoTypes = new Set<string>()
                  if (ue) {
                    if (ue.volumeHeuresCM > 0) autoTypes.add('CM')
                    if (ue.volumeHeuresTD > 0) autoTypes.add('TD')
                    if (ue.volumeHeuresTP > 0) autoTypes.add('TP')
                  }
                  if (autoTypes.size > 0) setAddTypeSeances(autoTypes)
                  setAddVolumes({
                    CM: ue && ue.volumeHeuresCM > 0 ? String(ue.volumeHeuresCM) : '',
                    TD: ue && ue.volumeHeuresTD > 0 ? String(ue.volumeHeuresTD) : '',
                    TP: ue && ue.volumeHeuresTP > 0 ? String(ue.volumeHeuresTP) : '',
                  })
                }}
              >
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

            {/* SECT-AFFECTATIONS-VOL-AUTO-2 : volumes par élément, pré-remplis
                depuis l'UE (volumeHeuresCM/TD/TP). Le volume n'est requis à la
                main que si l'UE ne le définit pas. Total calculé en direct. */}
            <div className="space-y-2">
              <Label>Volumes horaires par élément *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['CM', 'TD', 'TP'] as const)
                  .filter((t) => addTypeSeances.has(t))
                  .map((t) => {
                    const volKey = t === 'CM' ? 'volumeHeuresCM' : t === 'TD' ? 'volumeHeuresTD' : 'volumeHeuresTP'
                    const selectedUE = unitesEnseignement.find((ue) => ue.id === addUEId)
                    const ueVol = selectedUE ? (selectedUE[volKey as keyof UEItem] as number) : 0
                    return (
                      <div key={t} className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">
                          {t} {ueVol > 0 ? `· UE : ${ueVol}h` : '· non défini sur l\'UE'}
                        </span>
                        <Input
                          type="number"
                          min="1"
                          step="0.5"
                          placeholder={ueVol > 0 ? `${ueVol}` : 'Requis'}
                          value={addVolumes[t]}
                          onChange={(e) => setAddVolumes((prev) => ({ ...prev, [t]: e.target.value }))}
                        />
                      </div>
                    )
                  })}
              </div>
              {addTotalVolume > 0 && (
                <p className="text-xs text-muted-foreground">
                  Volume total : <span className="font-medium text-foreground">{addTotalVolume}h</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Année universitaire *</Label>
              <Input
                placeholder="Ex: 2024-2025"
                value={addAnnee}
                onChange={(e) => setAddAnnee(e.target.value)}
              />
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
              {addTypeSeances.size > 1
                ? `Affecter ${Array.from(addTypeSeances).sort().join('+')} · ${addTotalVolume}h`
                : 'Créer l\'affectation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Affectation Dialog (niveau groupe — SECT-AFFECTATIONS-GROUPED-1) ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-success-text" />
              Modifier l&apos;affectation
            </DialogTitle>
            <DialogDescription>
              {editingGroup && (
                <span>
                  {editingGroup.enseignant.name} → {editingGroup.uniteEnseignement.code} ({editingGroup.uniteEnseignement.nom}) — {editingGroup.items.map((it) => it.typeSeance).join('+')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Read-only display */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Enseignant</span>
                <span className="font-medium">{editingGroup?.enseignant.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">UE</span>
                <span className="font-medium">{editingGroup?.uniteEnseignement.code} — {editingGroup?.uniteEnseignement.nom}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Filière</span>
                <span className="font-medium">{editingGroup ? [editingGroup.uniteEnseignement?.filiere?.nom ?? '—', ...(editingGroup.uniteEnseignement?.filieresSuppl ?? []).map(s => s.filiere?.nom ?? '—')].join(', ') : ''}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Année</span>
                <span className="font-medium">{editingGroup?.anneeUniversitaire}</span>
              </div>
            </div>

            {/* Avertissement éléments publiés (lock backend PUBLIEE) */}
            {editingGroup && editingGroup.items.some((it) => it.statut === 'PUBLIEE') && (
              <div className="rounded-lg border border-info/30 bg-info/10 p-2.5 text-xs text-info flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {editingGroup.items.filter((it) => it.statut === 'PUBLIEE').length} élément(s) déjà
                  publié(s) — verrouillé(s). Repassez-les en PROVISOIRE pour les modifier.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Groupe</Label>
              <Input
                placeholder="Ex: Groupe A"
                value={editGroupe}
                onChange={(e) => setEditGroupe(e.target.value)}
              />
            </div>

            {/* SECT-AFFECTATIONS-GROUPED-1 + VOL-AUTO-2 : volume par élément */}
            <div className="space-y-2">
              <Label>Volumes horaires par élément *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {editingGroup?.items.map((it) => (
                  <div key={it.id} className="space-y-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {it.typeSeance}
                      {it.statut === 'PUBLIEE' && <Lock className="h-3 w-3" />}
                    </span>
                    <Input
                      type="number"
                      min="1"
                      step="0.5"
                      disabled={it.statut === 'PUBLIEE'}
                      value={editVolumes[it.typeSeance] ?? ''}
                      onChange={(e) => setEditVolumes((prev) => ({ ...prev, [it.typeSeance]: e.target.value }))}
                    />
                  </div>
                ))}
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
              disabled={isSubmitting || !editingGroup?.items.some((it) => it.statut !== 'PUBLIEE')}
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
                  <strong>{confirmAction.group.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.group.uniteEnseignement.nom}</strong>{' '}
                  ({confirmAction.group.items.map((it) => it.typeSeance).join('+')}) ?
                  Les éléments provisoires passeront au statut <em>Validé</em>.
                </>
              )}
              {confirmAction?.type === 'publish' && (
                <>
                  Êtes-vous sûr de vouloir publier l&apos;affectation de{' '}
                  <strong>{confirmAction.group.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.group.uniteEnseignement.nom}</strong>{' '}
                  ({confirmAction.group.items.map((it) => it.typeSeance).join('+')}) ?
                  L&apos;affectation sera visible par l&apos;enseignant et passera au statut <em>Publiée</em>.
                </>
              )}
              {confirmAction?.type === 'delete' && (
                <>
                  Êtes-vous sûr de vouloir supprimer{' '}
                  {confirmAction.itemId ? (
                    <>
                      l&apos;élément <strong>{confirmAction.group.items.find((it) => it.id === confirmAction.itemId)?.typeSeance}</strong> de l&apos;affectation
                    </>
                  ) : (
                    <>
                      l&apos;affectation complète ({confirmAction.group.items.length} élément(s) : {confirmAction.group.items.map((it) => it.typeSeance).join(', ')})
                    </>
                  )} de{' '}
                  <strong>{confirmAction.group.enseignant.name}</strong> à{' '}
                  <strong>{confirmAction.group.uniteEnseignement.nom}</strong> ?
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
                      sur cette UE. La suppression ne touchera pas ces évaluations, mais l&apos;enseignant ne sera plus officiellement affecté à cette UE.
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
