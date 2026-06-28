'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Calendar,
  Edit3,
  Send,
  Trash2,
  Lock,
  Search,
  Loader2,
  FileText,
  Users,
  Star,
  Archive,
  Sparkles,
  Copy,
  Clock,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  MinusCircle,
  Paperclip,
  Download,
  CheckCircle2,
  Info,
  RefreshCw,
  Settings2,
  Radio,
  FileWarning,
  X,
  Eye,
  ListChecks,
  Inbox,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  EntityCard,
  GlassModal,
  PulseSkeleton,
  StatCard,
  StatCardSkeletonGrid,
  ProgressRing,
  RewardToast,
} from '@/components/ds'
import { toast } from 'sonner'
import type {
  Devoir,
  Soumission,
  CritereGrille,
  UniteEnseignement,
  StatutDevoir,
  DevoirStats,
  StatutIA,
} from '@/lib/devoirs-types'

// ═══════════════════════════════════════════
//  CONSTANTS & UTILITIES
// ═══════════════════════════════════════════

const TAB_FILTERS = {
  all: { label: 'Tous', statut: undefined },
  brouillons: { label: 'Brouillons', statut: 'BROUILLON' as const },
  publies: { label: 'Publiés', statut: 'PUBLIE' as const },
  fermes: { label: 'Fermés', statut: 'FERME' as const },
  archives: { label: 'Archivés', statut: 'ARCHIVE' as const },
} as const

type TabKey = keyof typeof TAB_FILTERS
type SortField = 'dateLimite' | 'titre' | 'createdAt' | 'noteMax'

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isOverdue(dateLimite: string): boolean {
  return new Date(dateLimite) < new Date()
}

function getTimeRemaining(dateLimite: string): { text: string; urgent: boolean; overdue: boolean } {
  const now = new Date()
  const deadline = new Date(dateLimite)
  const diff = deadline.getTime() - now.getTime()
  if (diff <= 0) return { text: 'Échu', urgent: true, overdue: true }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 7) return { text: `${days}j restants`, urgent: false, overdue: false }
  if (days > 0) return { text: `${days}j ${hours}h`, urgent: days <= 2, overdue: false }
  if (hours > 0) return { text: `${hours}h`, urgent: true, overdue: false }
  return { text: '< 1h', urgent: true, overdue: false }
}

function toLocalDatetimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function bytesToMo(bytes: number): number {
  if (!bytes || bytes <= 0) return 0
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

function generateCSV(devoir: Devoir, soumissions: Soumission[]): string {
  const header = [
    'Étudiant',
    'Matricule',
    'Email',
    'Statut',
    'Date de rendu',
    `Note (/${devoir.noteMax})`,
    'Note IA',
    'Commentaire enseignant',
  ]
  const rows = soumissions.map((s) => [
    s.User?.name ?? '',
    s.User?.matricule ?? '',
    s.User?.email ?? '',
    s.statut,
    s.renduAt ? formatDateTime(s.renduAt) : '',
    s.note !== null ? String(s.note) : '',
    s.noteIA !== null ? String(s.noteIA) : '',
    s.commentaireEnseignant ?? '',
  ])
  const csvContent = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  return '\uFEFF' + csvContent
}

// ─── Couleurs Savane par statut / type ───

function statutDevoirConfig(statut: StatutDevoir) {
  switch (statut) {
    case 'BROUILLON':
      return { icon: Edit3, label: 'Brouillon', badge: 'border-border bg-muted text-muted-foreground' as const }
    case 'PUBLIE':
      return { icon: Send, label: 'Publié', badge: 'border-success/30 bg-success/15 text-success-text' as const }
    case 'FERME':
      return { icon: Lock, label: 'Fermé', badge: 'border-warning/30 bg-warning/15 text-warning' as const }
    case 'ARCHIVE':
      return { icon: Archive, label: 'Archivé', badge: 'border-secondary/30 bg-secondary/15 text-secondary' as const }
    default:
      return { icon: Edit3, label: statut, badge: 'border-border bg-muted text-muted-foreground' as const }
  }
}

function statutSoumissionBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return 'border-border bg-muted text-muted-foreground'
    case 'SOUMIS':
      return 'border-info/30 bg-info/15 text-info'
    case 'CORRIGE':
      return 'border-success/30 bg-success/15 text-success-text'
    case 'RETOURNE':
      return 'border-secondary/30 bg-secondary/15 text-secondary'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function statutIaConfig(statutIA: StatutIA | undefined) {
  switch (statutIA) {
    case 'EN_ATTENTE':
      return { label: 'IA en attente', badge: 'border-muted bg-muted text-muted-foreground', spinner: false }
    case 'EN_COURS':
      return { label: 'IA en cours…', badge: 'border-info/30 bg-info/15 text-info', spinner: true }
    case 'TERMINE':
      return { label: 'IA terminée', badge: 'border-success/30 bg-success/15 text-success-text', spinner: false }
    case 'ERREUR':
      return { label: 'IA en erreur', badge: 'border-destructive/30 bg-destructive/15 text-destructive', spinner: false }
    default:
      return { label: 'IA non demandée', badge: 'border-border bg-muted text-muted-foreground', spinner: false }
  }
}

function typeSeanceBadge(type: string) {
  switch (type) {
    case 'CM':
      return 'border-info/40 bg-info/10 text-info'
    case 'TD':
      return 'border-primary/40 bg-primary/10 text-primary-text'
    case 'TP':
      return 'border-secondary/40 bg-secondary/10 text-secondary'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function typeSeanceIcon(type: string) {
  switch (type) {
    case 'CM':
      return BookOpen
    case 'TD':
      return ListChecks
    case 'TP':
      return Settings2
    default:
      return BookOpen
  }
}

// ─── Debounce hook ───
function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT — Page enseignant "Mes Devoirs"
// ═══════════════════════════════════════════

export function DevoirsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // ─── UI filters ───
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [ueFilter, setUeFilter] = useState<string>('all')
  const [typeSeanceFilter, setTypeSeanceFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput)
  const [sortField, setSortField] = useState<SortField>('dateLimite')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ─── Create/Edit dialog ───
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingDevoir, setEditingDevoir] = useState<Devoir | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formTitre, setFormTitre] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formUniteEnseignementId, setFormUniteEnseignementId] = useState('')
  const [formTypeSeance, setFormTypeSeance] = useState<'CM' | 'TD' | 'TP'>('TD')
  const [formDateLimite, setFormDateLimite] = useState('')
  const [formDatePublication, setFormDatePublication] = useState('')
  const [formNoteMax, setFormNoteMax] = useState(20)
  const [formConsignes, setFormConsignes] = useState('')
  const [formRenduFichiers, setFormRenduFichiers] = useState(false)
  const [formSoumissionGroupe, setFormSoumissionGroupe] = useState(false)
  const [formNbMaxFichiers, setFormNbMaxFichiers] = useState(5)
  const [formTailleMaxFichier, setFormTailleMaxFichier] = useState(10) // en Mo (UI)
  const [formGrilleCriteres, setFormGrilleCriteres] = useState<CritereGrille[]>([
    { nom: '', description: '', poids: 1 },
  ])
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)

  // ─── Confirmation dialogs ───
  const [deleteTarget, setDeleteTarget] = useState<Devoir | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Devoir | null>(null)

  // ─── Soumissions sheet ───
  const [soumissionsSheetOpen, setSoumissionsSheetOpen] = useState(false)
  const [selectedDevoirForSoumissions, setSelectedDevoirForSoumissions] = useState<Devoir | null>(null)
  const [soumissionSortField, setSoumissionSortField] = useState<string>('renduAt')
  const [soumissionSortDir, setSoumissionSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedSoumissionId, setExpandedSoumissionId] = useState<string | null>(null)

  // ─── Quick grade ───
  const [quickGradeSoumissionId, setQuickGradeSoumissionId] = useState<string | null>(null)
  const [quickGradeValue, setQuickGradeValue] = useState(0)
  const [isQuickGrading, setIsQuickGrading] = useState(false)

  // ─── Grade dialog ───
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false)
  const [gradingSoumissionId, setGradingSoumissionId] = useState<string | null>(null)
  const [gradeNote, setGradeNote] = useState('')
  const [gradeCommentaire, setGradeCommentaire] = useState('')
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false)
  const [isAiGrading, setIsAiGrading] = useState(false)

  // ─── Reward toast (création/duplication) ───
  const [rewardToast, setRewardToast] = useState<{ title: string; description?: string } | null>(null)

  // ═══════════════════════════════════════
  //  DATA FETCHING (TanStack Query)
  // ═══════════════════════════════════════

  const devoirsQuery = useQuery<{ devoirs: Devoir[]; total: number }>({
    queryKey: ['devoirs', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/devoirs?enseignantId=${user!.id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur serveur')
      }
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const devoirs = devoirsQuery.data?.devoirs ?? []
  const isLoading = devoirsQuery.isLoading
  const loadError = devoirsQuery.error
    ? devoirsQuery.error instanceof Error
      ? devoirsQuery.error.message
      : 'Impossible de charger les devoirs'
    : null

  const statsQuery = useQuery<DevoirStats>({
    queryKey: ['devoirs-stats', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/devoirs/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const stats = statsQuery.data ?? null

  const uesQuery = useQuery<{ unitesEnseignement: UniteEnseignement[] }>({
    queryKey: ['devoirs-ues', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/unites-enseignement?actif=true')
      if (!res.ok) throw new Error('Failed to fetch UEs')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const unitesEnseignement = uesQuery.data?.unitesEnseignement ?? []

  const refreshDevoirs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['devoirs', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['devoirs-stats', user?.id] })
  }, [queryClient, user?.id])

  // ═══════════════════════════════════════
  //  FILTERING & SORTING
  // ═══════════════════════════════════════

  const tabStatut = TAB_FILTERS[activeTab].statut

  const filteredDevoirs = useMemo(() => {
    let result = [...devoirs]
    if (tabStatut) result = result.filter((d) => d.statut === tabStatut)
    if (ueFilter !== 'all') result = result.filter((d) => d.uniteEnseignementId === ueFilter)
    if (typeSeanceFilter !== 'all') result = result.filter((d) => d.typeSeance === typeSeanceFilter)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (d) =>
          d.titre.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q)) ||
          d.UniteEnseignement?.nom?.toLowerCase().includes(q) ||
          d.UniteEnseignement?.code?.toLowerCase().includes(q),
      )
    }
    result.sort((a, b) => {
      let aVal: string | number, bVal: string | number
      switch (sortField) {
        case 'titre':
          aVal = a.titre.toLowerCase()
          bVal = b.titre.toLowerCase()
          break
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime()
          bVal = new Date(b.createdAt).getTime()
          break
        case 'noteMax':
          aVal = a.noteMax
          bVal = b.noteMax
          break
        case 'dateLimite':
        default:
          aVal = new Date(a.dateLimite).getTime()
          bVal = new Date(b.dateLimite).getTime()
          break
      }
      return sortDir === 'asc' ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) : bVal < aVal ? -1 : bVal > aVal ? 1 : 0
    })
    return result
  }, [devoirs, tabStatut, ueFilter, typeSeanceFilter, debouncedSearch, sortField, sortDir])

  const localStats = useMemo(() => {
    const brouillons = devoirs.filter((d) => d.statut === 'BROUILLON').length
    const publies = devoirs.filter((d) => d.statut === 'PUBLIE').length
    const fermes = devoirs.filter((d) => d.statut === 'FERME').length
    const archives = devoirs.filter((d) => d.statut === 'ARCHIVE').length
    const totalSoumissions = devoirs.reduce((sum, d) => sum + (d.soumissionCount ?? d.Soumission?.length ?? 0), 0)
    const enRetard = devoirs.filter((d) => d.statut !== 'ARCHIVE' && isOverdue(d.dateLimite)).length
    return {
      brouillons,
      publies,
      fermes,
      archives,
      total: devoirs.length,
      totalSoumissions,
      enRetard,
    }
  }, [devoirs])

  const kpis = stats?.kpis ?? {
    total: localStats.total,
    brouillons: localStats.brouillons,
    publies: localStats.publies,
    fermes: localStats.fermes,
    archives: localStats.archives,
    totalSoumissions: localStats.totalSoumissions,
    soumissionsEnAttente: 0,
    soumissionsCorrigees: 0,
    enRetard: localStats.enRetard,
  }

  // ═══════════════════════════════════════
  //  FORM MANAGEMENT
  // ═══════════════════════════════════════

  const resetForm = () => {
    setFormTitre('')
    setFormDescription('')
    setFormUniteEnseignementId('')
    setFormTypeSeance('TD')
    setFormDateLimite('')
    setFormDatePublication('')
    setFormNoteMax(20)
    setFormConsignes('')
    setFormRenduFichiers(false)
    setFormSoumissionGroupe(false)
    setFormNbMaxFichiers(5)
    setFormTailleMaxFichier(10)
    setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    setAdvancedSettingsOpen(false)
  }

  const handleOpenCreate = () => {
    setEditingDevoir(null)
    resetForm()
    setFormDialogOpen(true)
  }

  const handleOpenEdit = (devoir: Devoir) => {
    setEditingDevoir(devoir)
    setFormTitre(devoir.titre)
    setFormDescription(devoir.description ?? '')
    setFormUniteEnseignementId(devoir.uniteEnseignementId)
    setFormTypeSeance(devoir.typeSeance)
    setFormDateLimite(toLocalDatetimeString(devoir.dateLimite))
    setFormDatePublication(toLocalDatetimeString(devoir.datePublication))
    setFormNoteMax(devoir.noteMax)
    setFormConsignes(devoir.consignes ?? '')
    setFormRenduFichiers(!!devoir.renduFichiers)
    setFormSoumissionGroupe(devoir.soumissionGroupe)
    setFormNbMaxFichiers(devoir.nbMaxFichiers || 5)
    setFormTailleMaxFichier(devoir.tailleMaxFichier ? Math.round(devoir.tailleMaxFichier / 1048576) : 10)
    if (devoir.GrilleEvaluation?.criteres) {
      try {
        const parsed = JSON.parse(devoir.GrilleEvaluation.criteres)
        setFormGrilleCriteres(
          Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ nom: '', description: '', poids: 1 }],
        )
      } catch {
        setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
      }
    } else {
      setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    }
    setAdvancedSettingsOpen(!!devoir.renduFichiers || devoir.soumissionGroupe || !!devoir.GrilleEvaluation)
    setFormDialogOpen(true)
  }

  const addCritere = () =>
    setFormGrilleCriteres([...formGrilleCriteres, { nom: '', description: '', poids: 1 }])
  const removeCritere = (index: number) => {
    if (formGrilleCriteres.length <= 1) return
    setFormGrilleCriteres(formGrilleCriteres.filter((_, i) => i !== index))
  }
  const updateCritere = (index: number, field: keyof CritereGrille, value: string | number) => {
    setFormGrilleCriteres((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  // ═══════════════════════════════════════
  //  ACTIONS (CRUD + status)
  // ═══════════════════════════════════════

  const handleSubmit = async () => {
    if (!user?.id) return
    if (!formTitre || !formUniteEnseignementId || !formDateLimite) {
      toast.error('Champs obligatoires', { description: 'Titre, UE et date limite sont requis.' })
      return
    }
    setIsSubmitting(true)
    try {
      const body = {
        titre: formTitre,
        description: formDescription || null,
        consignes: formConsignes || null,
        uniteEnseignementId: formUniteEnseignementId,
        enseignantId: user.id,
        typeSeance: formTypeSeance,
        datePublication: formDatePublication ? new Date(formDatePublication).toISOString() : null,
        dateLimite: new Date(formDateLimite).toISOString(),
        noteMax: formNoteMax,
        renduFichiers: formRenduFichiers ? 'application/pdf' : null,
        soumissionGroupe: formSoumissionGroupe,
        nbMaxFichiers: formNbMaxFichiers,
        tailleMaxFichier: formTailleMaxFichier * 1048576,
      }
      const url = editingDevoir ? `/api/devoirs/${editingDevoir.id}` : '/api/devoirs'
      const method = editingDevoir ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur lors de l'enregistrement")
      }
      const result = await res.json()
      const devoirId = editingDevoir?.id || result.devoir?.id
      const validCriteres = formGrilleCriteres.filter((c) => c.nom.trim())
      if (validCriteres.length > 0 && devoirId) {
        try {
          const grilleRes = await fetch(`/api/grilles-evaluation?devoirId=${devoirId}`)
          const grilleData = await grilleRes.json()
          const existingGrille = grilleData.grilles?.[0]
          const grilleUrl = existingGrille
            ? `/api/grilles-evaluation/${existingGrille.id}`
            : '/api/grilles-evaluation'
          const grilleMethod = existingGrille ? 'PATCH' : 'POST'
          await fetch(grilleUrl, {
            method: grilleMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              existingGrille ? { criteres: validCriteres } : { devoirId, criteres: validCriteres },
            ),
          })
        } catch {
          /* grille save non-bloquante */
        }
      }
      toast.success(editingDevoir ? 'Devoir mis à jour' : 'Devoir créé', {
        description: `"${formTitre}" ${editingDevoir ? 'modifié' : 'créé'} avec succès.`,
      })
      if (!editingDevoir) {
        setRewardToast({
          title: 'Devoir créé !',
          description: `"${formTitre}" est prêt à être publié.`,
        })
      }
      setFormDialogOpen(false)
      resetForm()
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusAction = async (devoirId: string, action: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/devoirs/${devoirId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur lors de l'action")
      }
      toast.success(successMsg)
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/devoirs/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la suppression')
      }
      toast.success('Devoir déplacé vers la corbeille', {
        description: `"${deleteTarget.titre}" déplacé. Restaurable depuis la Corbeille (30 jours).`,
      })
      setDeleteTarget(null)
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Suppression impossible.' })
    }
  }

  const handleDuplicate = async () => {
    if (!duplicateTarget || !user?.id) return
    try {
      const defaultDate = new Date()
      defaultDate.setDate(defaultDate.getDate() + 7)
      defaultDate.setHours(23, 59, 0, 0)
      const body = {
        titre: `${duplicateTarget.titre} (copie)`,
        description: duplicateTarget.description,
        consignes: duplicateTarget.consignes,
        uniteEnseignementId: duplicateTarget.uniteEnseignementId,
        enseignantId: user.id,
        typeSeance: duplicateTarget.typeSeance,
        dateLimite: defaultDate.toISOString(),
        noteMax: duplicateTarget.noteMax,
        renduFichiers: duplicateTarget.renduFichiers,
        soumissionGroupe: duplicateTarget.soumissionGroupe,
        nbMaxFichiers: duplicateTarget.nbMaxFichiers,
        tailleMaxFichier: duplicateTarget.tailleMaxFichier,
        anneeUniversitaire: duplicateTarget.anneeUniversitaire,
      }
      const res = await fetch('/api/devoirs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la duplication')
      }
      const result = await res.json()
      // Duplique aussi la grille d'évaluation si présente
      if (duplicateTarget.GrilleEvaluation?.criteres && result.devoir?.id) {
        try {
          const criteresParsed = JSON.parse(duplicateTarget.GrilleEvaluation.criteres)
          await fetch('/api/grilles-evaluation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ devoirId: result.devoir.id, criteres: criteresParsed }),
          })
        } catch {
          /* non-bloquant */
        }
      }
      toast.success('Devoir dupliqué', {
        description: `"${duplicateTarget.titre} (copie)" créé en brouillon (échéance J+7).`,
      })
      setRewardToast({
        title: 'Devoir dupliqué !',
        description: `Une copie a été créée en brouillon.`,
      })
      setDuplicateTarget(null)
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Duplication impossible.' })
    }
  }

  // ═══════════════════════════════════════
  //  SOUMISSIONS — Sheet + Grading
  // ═══════════════════════════════════════

  // Détail du devoir sélectionné — inclut Soumission[] complète.
  // BUGFIX R1-FRONTEND-DEVOIRS : on utilise TanStack Query (pas un useState local)
  // pour bénéficier du polling refetchInterval (nécessaire pour statutIA EN_COURS).
  const selectedDevoirId = selectedDevoirForSoumissions?.id
  const devoirDetailQuery = useQuery<{ devoir: Devoir }>({
    queryKey: ['devoir-detail', selectedDevoirId],
    queryFn: async () => {
      const res = await fetch(`/api/devoirs/${selectedDevoirId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur de chargement')
      }
      return res.json()
    },
    enabled: !!selectedDevoirId && soumissionsSheetOpen,
    staleTime: 0,
    refetchOnWindowFocus: false,
    // Polling IA : si au moins une soumission a statutIA EN_COURS ou EN_ATTENTE
    // (juste après ai-grade), on refetch toutes les 3s.
    refetchInterval: (query) => {
      const subs = query.state.data?.devoir?.Soumission ?? []
      const hasPending = subs.some((s) => s.statutIA === 'EN_COURS' || s.statutIA === 'EN_ATTENTE')
      return hasPending ? 3000 : false
    },
  })

  const soumissions: Soumission[] = devoirDetailQuery.data?.devoir?.Soumission ?? []
  const isLoadingSoumissions = devoirDetailQuery.isLoading && !devoirDetailQuery.data

  // Une soumission "active" pour le grade dialog (récupère les updates via polling)
  const gradingSoumission = useMemo(
    () => soumissions.find((s) => s.id === gradingSoumissionId) ?? null,
    [soumissions, gradingSoumissionId],
  )

  const handleViewSoumissions = (devoir: Devoir) => {
    setSelectedDevoirForSoumissions(devoir)
    setSoumissionsSheetOpen(true)
    setExpandedSoumissionId(null)
    setQuickGradeSoumissionId(null)
  }

  const handleCloseSoumissionsSheet = () => {
    setSoumissionsSheetOpen(false)
    setSelectedDevoirForSoumissions(null)
    setQuickGradeSoumissionId(null)
    setExpandedSoumissionId(null)
  }

  const handleQuickGrade = async () => {
    if (!quickGradeSoumissionId || !selectedDevoirForSoumissions) return
    setIsQuickGrading(true)
    try {
      const res = await fetch(`/api/soumissions/${quickGradeSoumissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: quickGradeValue }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur de notation')
      }
      toast.success(`Note enregistrée : ${quickGradeValue}/${selectedDevoirForSoumissions.noteMax}`)
      setQuickGradeSoumissionId(null)
      await devoirDetailQuery.refetch()
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Notation impossible.' })
    } finally {
      setIsQuickGrading(false)
    }
  }

  const handleOpenGrade = (soumission: Soumission) => {
    setGradingSoumissionId(soumission.id)
    setGradeNote(soumission.note !== null ? String(soumission.note) : '')
    setGradeCommentaire(soumission.commentaireEnseignant ?? '')
    setGradeDialogOpen(true)
  }

  const handleSubmitGrade = async () => {
    if (!gradingSoumission) return
    if (!gradeNote) {
      toast.error('Note requise')
      return
    }
    const noteValue = parseFloat(gradeNote)
    if (isNaN(noteValue) || noteValue < 0) {
      toast.error('Note invalide')
      return
    }
    const maxNote = selectedDevoirForSoumissions?.noteMax ?? 20
    if (noteValue > maxNote) {
      toast.error('Note invalide', { description: `Maximum : ${maxNote}` })
      return
    }
    setIsSubmittingGrade(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: noteValue,
          commentaireEnseignant: gradeCommentaire || null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur de notation')
      }
      toast.success('Soumission notée', { description: `${noteValue}/${maxNote} enregistrée.` })
      setGradeDialogOpen(false)
      setGradingSoumissionId(null)
      await devoirDetailQuery.refetch()
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Notation impossible.' })
    } finally {
      setIsSubmittingGrade(false)
    }
  }

  /**
   * Évaluation IA — POST /api/soumissions/{id}/ai-grade
   * Réponse 202 Accepted (async). Le worker async met à jour statutIA côté backend.
   * On se contente d'invalider le cache pour que le polling démarre.
   */
  const handleAiGradeSoumission = async () => {
    if (!gradingSoumission) return
    setIsAiGrading(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}/ai-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur d'évaluation IA")
      }
      const data = await res.json()
      toast.info('Évaluation IA en cours…', {
        description: data.message || 'La note sera disponible dans quelques secondes.',
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
      })
      // Forcer le refetch pour démarrer le polling
      await devoirDetailQuery.refetch()
    } catch (err) {
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Évaluation IA impossible.',
      })
    } finally {
      setIsAiGrading(false)
    }
  }

  // ─── Quick IA grade depuis le sheet (sans ouvrir le dialog) ───
  const handleQuickAiGrade = async (soumissionId: string) => {
    try {
      const res = await fetch(`/api/soumissions/${soumissionId}/ai-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur d'évaluation IA")
      }
      toast.info('Évaluation IA en cours…', {
        description: 'La note sera disponible dans quelques secondes.',
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
      })
      await devoirDetailQuery.refetch()
    } catch (err) {
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Évaluation IA impossible.',
      })
    }
  }

  const handleExportCSV = () => {
    if (!selectedDevoirForSoumissions || soumissions.length === 0) {
      toast.error('Export impossible', { description: 'Aucune soumission à exporter.' })
      return
    }
    const csv = generateCSV(selectedDevoirForSoumissions, soumissions)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedDevoirForSoumissions.titre.replace(/[^a-z0-9]/gi, '_')}_notes.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Export CSV', { description: 'Fichier téléchargé.' })
  }

  // ─── Tri soumissions ───
  const toggleSoumissionSort = (field: string) => {
    if (soumissionSortField === field) {
      setSoumissionSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSoumissionSortField(field)
      setSoumissionSortDir('asc')
    }
  }

  const getSortIcon = (field: string) =>
    soumissionSortField === field ? (
      soumissionSortDir === 'asc' ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )
    ) : null

  const sortedSoumissions = useMemo(() => {
    return [...soumissions].sort((a, b) => {
      let aVal: string | number = '',
        bVal: string | number = ''
      switch (soumissionSortField) {
        case 'name':
          aVal = a.User?.name?.toLowerCase() ?? ''
          bVal = b.User?.name?.toLowerCase() ?? ''
          break
        case 'statut':
          aVal = a.statut
          bVal = b.statut
          break
        case 'note':
          aVal = a.note ?? -1
          bVal = b.note ?? -1
          break
        case 'renduAt':
        default:
          aVal = a.renduAt ?? ''
          bVal = b.renduAt ?? ''
          break
      }
      return soumissionSortDir === 'asc'
        ? aVal < bVal
          ? -1
          : aVal > bVal
            ? 1
            : 0
        : bVal < aVal
          ? -1
          : bVal > aVal
            ? 1
            : 0
    })
  }, [soumissions, soumissionSortField, soumissionSortDir])

  const handleCycleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const resetFilters = () => {
    setActiveTab('all')
    setUeFilter('all')
    setTypeSeanceFilter('all')
    setSearchInput('')
    setSortField('dateLimite')
    setSortDir('desc')
  }

  const hasActiveFilters =
    activeTab !== 'all' || ueFilter !== 'all' || typeSeanceFilter !== 'all' || debouncedSearch.trim() !== ''

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Header hero avec kente ─── */}
      <header className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="ds-kente-strip" aria-hidden />
        <div className="ds-kente-pattern px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                  <BookOpen className="h-7 w-7 text-primary-text" />
                </div>
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-primary" />
                </span>
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Mes Devoirs
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Créez, publiez et corrigez vos devoirs TD/TP — notation manuelle ou IA.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/15 px-2.5 py-1 text-success-text">
                    <Radio className="h-3 w-3" />
                    {kpis.publies} actifs
                  </Badge>
                  {kpis.soumissionsEnAttente > 0 && (
                    <Badge variant="outline" className="gap-1.5 border-warning/30 bg-warning/15 px-2.5 py-1 text-warning">
                      <Clock className="h-3 w-3" />
                      {kpis.soumissionsEnAttente} à corriger
                    </Badge>
                  )}
                  {kpis.enRetard > 0 && (
                    <Badge variant="outline" className="gap-1.5 border-destructive/30 bg-destructive/15 px-2.5 py-1 text-destructive">
                      <FileWarning className="h-3 w-3" />
                      {kpis.enRetard} en retard
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refreshDevoirs()} aria-label="Rafraîchir">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Actualiser
              </Button>
              <Button size="sm" onClick={handleOpenCreate} className="font-semibold" aria-label="Nouveau devoir">
                <PlusCircle className="mr-1.5 h-4 w-4" />
                Nouveau devoir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── KPI StatCards ─── */}
      {isLoading && !stats ? (
        <StatCardSkeletonGrid count={6} />
      ) : (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={FileText} label="Total" value={kpis.total} hint={`${kpis.brouillons} brouillons`} accent="info" index={0} />
          <StatCard icon={Send} label="Publiés" value={kpis.publies} hint={`${kpis.fermes} fermés`} accent="success" index={1} />
          <StatCard
            icon={Clock}
            label="À corriger"
            value={kpis.soumissionsEnAttente}
            hint="soumissions en attente"
            accent="warning"
            index={2}
          />
          <StatCard
            icon={CheckCircle2}
            label="Corrigées"
            value={kpis.soumissionsCorrigees}
            hint="soumissions corrigées"
            accent="primary"
            index={3}
          />
          <StatCard
            icon={Users}
            label="Soumissions"
            value={kpis.totalSoumissions}
            hint="total reçu"
            accent="secondary"
            index={4}
          />
          <StatCard
            icon={TrendingUp}
            label="Note moyenne"
            value={stats?.moyenneNotes ?? '—'}
            suffix={stats?.moyenneNotes !== null && stats?.moyenneNotes !== undefined ? '/20' : undefined}
            hint={stats?.moyenneNotes !== null && stats?.moyenneNotes !== undefined ? 'moyenne classe' : 'aucune note'}
            accent="primary"
            scoreOn20={stats?.moyenneNotes ?? undefined}
            index={5}
          />
        </section>
      )}

      {/* ─── Filtres + tri ─── */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-4">
          {/* Tabs statut */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer par statut">
            {(Object.keys(TAB_FILTERS) as TabKey[]).map((key) => {
              const count =
                key === 'all'
                  ? devoirs.length
                  : devoirs.filter((d) => d.statut === TAB_FILTERS[key].statut).length
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setActiveTab(key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    activeTab === key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {TAB_FILTERS[key].label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      activeTab === key ? 'bg-primary-foreground/20' : 'bg-muted-foreground/15'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search + UE + type + tri */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Rechercher par titre, UE…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8"
                aria-label="Rechercher un devoir"
              />
            </div>
            <Select value={ueFilter} onValueChange={setUeFilter}>
              <SelectTrigger aria-label="Filtrer par UE">
                <SelectValue placeholder="Toutes les UE" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les UE</SelectItem>
                {unitesEnseignement.map((ue) => (
                  <SelectItem key={ue.id} value={ue.id}>
                    {ue.code} — {ue.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeSeanceFilter} onValueChange={setTypeSeanceFilter}>
              <SelectTrigger aria-label="Filtrer par type">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="CM">Cours magistral</SelectItem>
                <SelectItem value="TD">Travail dirigé</SelectItem>
                <SelectItem value="TP">Travaux pratiques</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${sortField}:${sortDir}`}
              onValueChange={(v) => {
                const [f, d] = v.split(':')
                setSortField(f as SortField)
                setSortDir(d as 'asc' | 'desc')
              }}
            >
              <SelectTrigger aria-label="Trier">
                <SelectValue placeholder="Trier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dateLimite:asc">Échéance ↑</SelectItem>
                <SelectItem value="dateLimite:desc">Échéance ↓</SelectItem>
                <SelectItem value="titre:asc">Titre A→Z</SelectItem>
                <SelectItem value="titre:desc">Titre Z→A</SelectItem>
                <SelectItem value="createdAt:desc">Plus récents</SelectItem>
                <SelectItem value="createdAt:asc">Plus anciens</SelectItem>
                <SelectItem value="noteMax:desc">Note max ↑</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filteredDevoirs.length} devoir{filteredDevoirs.length > 1 ? 's' : ''} affiché
                {filteredDevoirs.length > 1 ? 's' : ''}
              </p>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
                <X className="mr-1 h-3 w-3" />
                Réinitialiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Grille de EntityCards ─── */}
      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium text-destructive">Erreur de chargement</p>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => refreshDevoirs()} className="mt-3">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PulseSkeleton key={i} className="h-64 w-full" variant="card" />
          ))}
        </div>
      ) : filteredDevoirs.length === 0 ? (
        <EmptyState
          onCreate={handleOpenCreate}
          hasFilters={hasActiveFilters}
          onReset={resetFilters}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDevoirs.map((devoir, idx) => (
            <DevoirCard
              key={devoir.id}
              devoir={devoir}
              index={idx}
              onEdit={() => handleOpenEdit(devoir)}
              onDelete={() => setDeleteTarget(devoir)}
              onDuplicate={() => setDuplicateTarget(devoir)}
              onPublish={() => handleStatusAction(devoir.id, 'publish', 'Devoir publié')}
              onClose={() => handleStatusAction(devoir.id, 'close', 'Devoir fermé')}
              onArchive={() => handleStatusAction(devoir.id, 'archive', 'Devoir archivé')}
              onReopen={() => handleStatusAction(devoir.id, 'reopen', 'Devoir rouvert en brouillon')}
              onViewSoumissions={() => handleViewSoumissions(devoir)}
            />
          ))}
        </div>
      )}

      {/* ─── Dialog création/édition ─── */}
      <DevoirFormDialog
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        editingDevoir={editingDevoir}
        isSubmitting={isSubmitting}
        unitesEnseignement={unitesEnseignement}
        form={{
          formTitre,
          setFormTitre,
          formDescription,
          setFormDescription,
          formUniteEnseignementId,
          setFormUniteEnseignementId,
          formTypeSeance,
          setFormTypeSeance,
          formDateLimite,
          setFormDateLimite,
          formDatePublication,
          setFormDatePublication,
          formNoteMax,
          setFormNoteMax,
          formConsignes,
          setFormConsignes,
          formRenduFichiers,
          setFormRenduFichiers,
          formSoumissionGroupe,
          setFormSoumissionGroupe,
          formNbMaxFichiers,
          setFormNbMaxFichiers,
          formTailleMaxFichier,
          setFormTailleMaxFichier,
          formGrilleCriteres,
          addCritere,
          removeCritere,
          updateCritere,
          advancedSettingsOpen,
          setAdvancedSettingsOpen,
        }}
        onSubmit={handleSubmit}
      />

      {/* ─── AlertDialog suppression ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="border-destructive/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Supprimer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le devoir «&nbsp;{deleteTarget?.titre}&nbsp;» sera déplacé vers la corbeille. Vous pourrez le
              restaurer pendant 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── AlertDialog duplication ─── */}
      <AlertDialog open={!!duplicateTarget} onOpenChange={(v) => !v && setDuplicateTarget(null)}>
        <AlertDialogContent className="border-primary/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary-text">Dupliquer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une copie de «&nbsp;{duplicateTarget?.titre}&nbsp;» sera créée en brouillon avec une échéance à
              J+7.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicate}>Dupliquer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Sheet Soumissions ─── */}
      <SoumissionsSheet
        open={soumissionsSheetOpen}
        onClose={handleCloseSoumissionsSheet}
        devoir={selectedDevoirForSoumissions}
        soumissions={sortedSoumissions}
        isLoading={isLoadingSoumissions}
        sortField={soumissionSortField}
        getSortIcon={getSortIcon}
        toggleSort={toggleSoumissionSort}
        expandedId={expandedSoumissionId}
        setExpandedId={setExpandedSoumissionId}
        onExportCSV={handleExportCSV}
        onOpenGrade={handleOpenGrade}
        onQuickAiGrade={handleQuickAiGrade}
        quickGrade={{
          id: quickGradeSoumissionId,
          setId: setQuickGradeSoumissionId,
          value: quickGradeValue,
          setValue: setQuickGradeValue,
          submit: handleQuickGrade,
          isGrading: isQuickGrading,
          noteMax: selectedDevoirForSoumissions?.noteMax ?? 20,
        }}
      />

      {/* ─── Grade Dialog avec polling IA ─── */}
      <GradeDialog
        open={gradeDialogOpen}
        onClose={() => {
          setGradeDialogOpen(false)
          setGradingSoumissionId(null)
        }}
        soumission={gradingSoumission}
        noteMax={selectedDevoirForSoumissions?.noteMax ?? 20}
        gradeNote={gradeNote}
        setGradeNote={setGradeNote}
        gradeCommentaire={gradeCommentaire}
        setGradeCommentaire={setGradeCommentaire}
        isSubmitting={isSubmittingGrade}
        isAiGrading={isAiGrading}
        onSubmit={handleSubmitGrade}
        onAiGrade={handleAiGradeSoumission}
      />

      {/* ─── RewardToast (création/duplication réussie) ─── */}
      <RewardToast
        open={!!rewardToast}
        onClose={() => setRewardToast(null)}
        title={rewardToast?.title ?? ''}
        description={rewardToast?.description}
        tier="gold"
        duration={3500}
      />
    </div>
  )
}

// ═══════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════

// ─── Empty state ───
function EmptyState({
  onCreate,
  hasFilters,
  onReset,
}: {
  onCreate: () => void
  hasFilters: boolean
  onReset: () => void
}) {
  return (
    <Card className="border-dashed border-border bg-card">
      <CardContent className="ds-kente-pattern flex flex-col items-center justify-center p-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          {hasFilters ? (
            <Search className="h-7 w-7 text-primary-text" />
          ) : (
            <BookOpen className="h-7 w-7 text-primary-text" />
          )}
        </div>
        <h3 className="mt-4 font-display text-lg font-bold">
          {hasFilters ? 'Aucun devoir trouvé' : 'Aucun devoir pour le moment'}
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {hasFilters
            ? 'Essayez de modifier vos filtres ou votre recherche pour trouver ce que vous cherchez.'
            : 'Créez votre premier devoir TD/TP, publiez-le, et laissez les étudiants soumettre leurs travaux.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Réinitialiser les filtres
            </Button>
          ) : (
            <Button size="sm" onClick={onCreate}>
              <PlusCircle className="mr-1.5 h-4 w-4" />
              Créer mon premier devoir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Carte Devoir ───
function DevoirCard({
  devoir,
  index,
  onEdit,
  onDelete,
  onDuplicate,
  onPublish,
  onClose,
  onArchive,
  onReopen,
  onViewSoumissions,
}: {
  devoir: Devoir
  index: number
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onPublish: () => void
  onClose: () => void
  onArchive: () => void
  onReopen: () => void
  onViewSoumissions: () => void
}) {
  const cfg = statutDevoirConfig(devoir.statut)
  const TypeIcon = typeSeanceIcon(devoir.typeSeance)
  const time = getTimeRemaining(devoir.dateLimite)
  const overdue = isOverdue(devoir.dateLimite) && devoir.statut !== 'ARCHIVE'
  const soumissionCount = devoir.soumissionCount ?? devoir.Soumission?.length ?? 0

  return (
    <EntityCard
      title={devoir.titre}
      subtitle={`${devoir.UniteEnseignement?.code ?? '—'} — ${devoir.UniteEnseignement?.nom ?? ''}`}
      thumbnailIcon={TypeIcon}
      badge={{
        label: cfg.label,
        variant:
          devoir.statut === 'PUBLIE'
            ? 'success'
            : devoir.statut === 'FERME'
              ? 'warning'
              : devoir.statut === 'ARCHIVE'
                ? 'danger'
                : 'secondary',
      }}
      meta={`Échéance ${formatDateOnly(devoir.dateLimite)} · ${devoir.noteMax} pts`}
      index={index}
    >
      {/* Tags type + urgence */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${typeSeanceBadge(devoir.typeSeance)}`}>
          {devoir.typeSeance}
        </Badge>
        <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${cfg.badge}`}>
          <cfg.icon className="h-2.5 w-2.5" />
          {cfg.label}
        </Badge>
        {devoir.renduFichiers && (
          <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-info/30 bg-info/10 text-info">
            <Paperclip className="h-2.5 w-2.5" />
            Fichiers
          </Badge>
        )}
        {devoir.soumissionGroupe && (
          <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-secondary/30 bg-secondary/10 text-secondary">
            <Users className="h-2.5 w-2.5" />
            Groupe
          </Badge>
        )}
      </div>

      {/* Compte à rebours */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
            overdue ? 'text-destructive' : time.urgent ? 'text-warning' : 'text-muted-foreground'
          }`}
        >
          <Clock className="h-3 w-3" />
          {time.text}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {soumissionCount} soumission{soumissionCount > 1 ? 's' : ''}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onViewSoumissions}>
          <Eye className="mr-1 h-3 w-3" />
          Soumissions
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} aria-label="Éditer">
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDuplicate} aria-label="Dupliquer">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {devoir.statut === 'BROUILLON' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-success-text hover:bg-success/10"
            onClick={onPublish}
          >
            <Send className="mr-1 h-3 w-3" />
            Publier
          </Button>
        )}
        {devoir.statut === 'PUBLIE' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-warning hover:bg-warning/10"
            onClick={onClose}
          >
            <Lock className="mr-1 h-3 w-3" />
            Fermer
          </Button>
        )}
        {(devoir.statut === 'FERME' || devoir.statut === 'PUBLIE') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-secondary hover:bg-secondary/10"
            onClick={onArchive}
          >
            <Archive className="mr-1 h-3 w-3" />
            Archiver
          </Button>
        )}
        {devoir.statut !== 'BROUILLON' && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReopen}>
            <Edit3 className="mr-1 h-3 w-3" />
            Rouvrir
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ml-auto text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          aria-label="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </EntityCard>
  )
}

// ─── Dialog création/édition ───
function DevoirFormDialog({
  open,
  onClose,
  editingDevoir,
  isSubmitting,
  unitesEnseignement,
  form,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  editingDevoir: Devoir | null
  isSubmitting: boolean
  unitesEnseignement: UniteEnseignement[]
  form: {
    formTitre: string
    setFormTitre: (v: string) => void
    formDescription: string
    setFormDescription: (v: string) => void
    formUniteEnseignementId: string
    setFormUniteEnseignementId: (v: string) => void
    formTypeSeance: 'CM' | 'TD' | 'TP'
    setFormTypeSeance: (v: 'CM' | 'TD' | 'TP') => void
    formDateLimite: string
    setFormDateLimite: (v: string) => void
    formDatePublication: string
    setFormDatePublication: (v: string) => void
    formNoteMax: number
    setFormNoteMax: (v: number) => void
    formConsignes: string
    setFormConsignes: (v: string) => void
    formRenduFichiers: boolean
    setFormRenduFichiers: (v: boolean) => void
    formSoumissionGroupe: boolean
    setFormSoumissionGroupe: (v: boolean) => void
    formNbMaxFichiers: number
    setFormNbMaxFichiers: (v: number) => void
    formTailleMaxFichier: number
    setFormTailleMaxFichier: (v: number) => void
    formGrilleCriteres: CritereGrille[]
    addCritere: () => void
    removeCritere: (i: number) => void
    updateCritere: (i: number, field: keyof CritereGrille, value: string | number) => void
    advancedSettingsOpen: boolean
    setAdvancedSettingsOpen: (v: boolean) => void
  }
  onSubmit: () => void
}) {
  const f = form
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={editingDevoir ? 'Modifier le devoir' : 'Nouveau devoir'}
      description={
        editingDevoir
          ? 'Mettez à jour les informations de ce devoir.'
          : 'Créez un devoir pour vos étudiants. Il sera en brouillon jusqu’à publication.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : editingDevoir ? (
              'Enregistrer'
            ) : (
              'Créer le devoir'
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Titre */}
        <div className="space-y-1.5">
          <Label htmlFor="form-titre">
            Titre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="form-titre"
            value={f.formTitre}
            onChange={(e) => f.setFormTitre(e.target.value)}
            placeholder="Ex: TP3 — Algorithmes de tri"
            maxLength={120}
          />
        </div>

        {/* UE + Type */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Unité d’enseignement <span className="text-destructive">*</span>
            </Label>
            <Select value={f.formUniteEnseignementId} onValueChange={f.setFormUniteEnseignementId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une UE" />
              </SelectTrigger>
              <SelectContent>
                {unitesEnseignement.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Aucune UE disponible
                  </SelectItem>
                ) : (
                  unitesEnseignement.map((ue) => (
                    <SelectItem key={ue.id} value={ue.id}>
                      {ue.code} — {ue.nom}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type de séance</Label>
            <Select value={f.formTypeSeance} onValueChange={(v) => f.setFormTypeSeance(v as 'CM' | 'TD' | 'TP')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CM">Cours magistral (CM)</SelectItem>
                <SelectItem value="TD">Travail dirigé (TD)</SelectItem>
                <SelectItem value="TP">Travaux pratiques (TP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="form-date-limite">
              Date limite <span className="text-destructive">*</span>
            </Label>
            <Input
              id="form-date-limite"
              type="datetime-local"
              value={f.formDateLimite}
              onChange={(e) => f.setFormDateLimite(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-date-pub">Date de publication (optionnel)</Label>
            <Input
              id="form-date-pub"
              type="datetime-local"
              value={f.formDatePublication}
              onChange={(e) => f.setFormDatePublication(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Si vide, le devoir sera publié immédiatement lors de l’action « Publier ».
            </p>
          </div>
        </div>

        {/* Note max */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Note maximale</Label>
            <Badge variant="outline" className="font-mono tabular-nums bg-primary/10 text-primary-text">
              {f.formNoteMax} / 20
            </Badge>
          </div>
          <Slider
            value={[f.formNoteMax]}
            onValueChange={(v) => f.setFormNoteMax(v[0])}
            min={1}
            max={20}
            step={0.5}
          />
        </div>

        {/* Description + consignes */}
        <div className="space-y-1.5">
          <Label htmlFor="form-desc">Description</Label>
          <Textarea
            id="form-desc"
            value={f.formDescription}
            onChange={(e) => f.setFormDescription(e.target.value)}
            placeholder="Contexte, objectifs, attendus…"
            rows={2}
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="form-consignes">Consignes détaillées</Label>
          <Textarea
            id="form-consignes"
            value={f.formConsignes}
            onChange={(e) => f.setFormConsignes(e.target.value)}
            placeholder="Consignes de rendu, format attendu, contraintes…"
            rows={3}
          />
        </div>

        {/* Paramètres avancés */}
        <Collapsible open={f.advancedSettingsOpen} onOpenChange={f.setAdvancedSettingsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Settings2 className="h-4 w-4" />
                Paramètres avancés
              </span>
              {f.advancedSettingsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="switch-fichiers" className="cursor-pointer">
                    Rendu de fichiers
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Autorise les étudiants à uploader des fichiers (PDF, images…)
                  </p>
                </div>
                <Switch
                  id="switch-fichiers"
                  checked={f.formRenduFichiers}
                  onCheckedChange={f.setFormRenduFichiers}
                />
              </div>

              {f.formRenduFichiers && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="form-nb-files">Nombre max de fichiers</Label>
                    <Input
                      id="form-nb-files"
                      type="number"
                      min={1}
                      max={20}
                      value={f.formNbMaxFichiers}
                      onChange={(e) => f.setFormNbMaxFichiers(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="form-taille">Taille max par fichier (Mo)</Label>
                    <Input
                      id="form-taille"
                      type="number"
                      min={1}
                      max={100}
                      value={f.formTailleMaxFichier}
                      onChange={(e) => f.setFormTailleMaxFichier(Number(e.target.value) || 1)}
                    />
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="switch-groupe" className="cursor-pointer">
                    Soumission en groupe
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Une seule soumission par groupe d’étudiants
                  </p>
                </div>
                <Switch
                  id="switch-groupe"
                  checked={f.formSoumissionGroupe}
                  onCheckedChange={f.setFormSoumissionGroupe}
                />
              </div>
            </div>

            {/* Grille d'évaluation dynamique */}
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Grille d’évaluation</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Critères utilisés par l’IA pour évaluer les soumissions.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={f.addCritere} className="h-7 text-xs">
                  <PlusCircle className="mr-1 h-3 w-3" />
                  Ajouter
                </Button>
              </div>
              <div className="space-y-2">
                {f.formGrilleCriteres.map((c, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 rounded-md border border-border bg-card p-2"
                  >
                    <Input
                      className="col-span-12 sm:col-span-4"
                      placeholder="Nom du critère"
                      value={c.nom}
                      onChange={(e) => f.updateCritere(i, 'nom', e.target.value)}
                    />
                    <Input
                      className="col-span-12 sm:col-span-6"
                      placeholder="Description"
                      value={c.description}
                      onChange={(e) => f.updateCritere(i, 'description', e.target.value)}
                    />
                    <div className="col-span-10 sm:col-span-1">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="Poids"
                        value={c.poids}
                        onChange={(e) => f.updateCritere(i, 'poids', Number(e.target.value) || 0)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-2 sm:col-span-1 h-9 w-full p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => f.removeCritere(i)}
                      disabled={f.formGrilleCriteres.length <= 1}
                      aria-label="Supprimer ce critère"
                    >
                      <MinusCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </GlassModal>
  )
}

// ─── Sheet Soumissions ───
function SoumissionsSheet({
  open,
  onClose,
  devoir,
  soumissions,
  isLoading,
  sortField,
  getSortIcon,
  toggleSort,
  expandedId,
  setExpandedId,
  onExportCSV,
  onOpenGrade,
  onQuickAiGrade,
  quickGrade,
}: {
  open: boolean
  onClose: () => void
  devoir: Devoir | null
  soumissions: Soumission[]
  isLoading: boolean
  sortField: string
  getSortIcon: (f: string) => React.ReactNode
  toggleSort: (f: string) => void
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onExportCSV: () => void
  onOpenGrade: (s: Soumission) => void
  onQuickAiGrade: (id: string) => void
  quickGrade: {
    id: string | null
    setId: (id: string | null) => void
    value: number
    setValue: (v: number) => void
    submit: () => void
    isGrading: boolean
    noteMax: number
  }
}) {
  const stats = useMemo(() => {
    const soumis = soumissions.filter((s) => s.statut === 'SOUMIS').length
    const corrige = soumissions.filter((s) => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length
    const brouillon = soumissions.filter((s) => s.statut === 'BROUILLON').length
    const notes = soumissions.filter((s) => s.note !== null).map((s) => s.note as number)
    const moyenne = notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null
    return { soumis, corrige, brouillon, moyenne, total: soumissions.length }
  }, [soumissions])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl flex flex-col p-0 gap-0"
      >
        {/* Header avec bande kente */}
        <div className="ds-kente-strip" aria-hidden />
        <SheetHeader className="ds-kente-pattern p-5 pb-4 border-b border-border">
          <SheetTitle className="font-display text-lg">
            {devoir?.titre ?? 'Soumissions'}
          </SheetTitle>
          <SheetDescription>
            {devoir?.UniteEnseignement?.code} — {devoir?.UniteEnseignement?.nom} ·{' '}
            {devoir?.noteMax} pts · échéance {devoir && formatDateOnly(devoir.dateLimite)}
          </SheetDescription>
          {/* Mini KPIs */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] gap-1 border-info/30 bg-info/15 text-info">
              {stats.soumis} à corriger
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1 border-success/30 bg-success/15 text-success-text">
              {stats.corrige} corrigées
            </Badge>
            {stats.brouillon > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 border-border bg-muted text-muted-foreground">
                {stats.brouillon} brouillons
              </Badge>
            )}
            {stats.moyenne !== null && (
              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 bg-primary/15 text-primary-text">
                Moy. {stats.moyenne.toFixed(2)}/{devoir?.noteMax ?? 20}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Toolbar export */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {soumissions.length} soumission{soumissions.length > 1 ? 's' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCSV}
            disabled={soumissions.length === 0}
            className="h-7 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            Export CSV
          </Button>
        </div>

        {/* Liste scrollable */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-20 w-full" variant="card" />
              ))}
            </div>
          ) : soumissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">Aucune soumission</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Les soumissions des étudiants apparaîtront ici dès qu’elles seront rendues.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* En-tête triable */}
              <div className="grid grid-cols-12 gap-2 bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <button
                  className="col-span-4 flex items-center gap-1 text-left hover:text-foreground"
                  onClick={() => toggleSort('name')}
                >
                  Étudiant {getSortIcon('name')}
                </button>
                <button
                  className="col-span-2 flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('statut')}
                >
                  Statut {getSortIcon('statut')}
                </button>
                <button
                  className="col-span-3 flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('renduAt')}
                >
                  Rendu {getSortIcon('renduAt')}
                </button>
                <button
                  className="col-span-2 flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggleSort('note')}
                >
                  Note {getSortIcon('note')}
                </button>
                <div className="col-span-1 text-right">Actions</div>
              </div>

              {soumissions.map((s) => {
                const isExpanded = expandedId === s.id
                const iaCfg = statutIaConfig(s.statutIA)
                return (
                  <div key={s.id} className="px-4 py-2.5 hover:bg-muted/30">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      {/* Étudiant */}
                      <button
                        className="col-span-4 text-left min-w-0"
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      >
                        <p className="text-sm font-medium truncate">{s.User?.name ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {s.User?.matricule ?? s.User?.email ?? ''}
                        </p>
                      </button>
                      {/* Statut */}
                      <div className="col-span-2">
                        <Badge variant="outline" className={`text-[10px] ${statutSoumissionBadge(s.statut)}`}>
                          {s.statut}
                        </Badge>
                      </div>
                      {/* Rendu */}
                      <div className="col-span-3 text-[11px] text-muted-foreground">
                        {s.renduAt ? formatDateTime(s.renduAt) : '—'}
                      </div>
                      {/* Note */}
                      <div className="col-span-2">
                        {s.note !== null ? (
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {s.note}
                            <span className="text-muted-foreground">/{quickGrade.noteMax}</span>
                          </span>
                        ) : s.noteIA !== null && s.statutIA === 'TERMINE' ? (
                          <span className="font-mono text-sm font-medium text-info" title="Note IA proposée">
                            {s.noteIA}
                            <span className="text-muted-foreground">/</span>
                            <Sparkles className="inline h-3 w-3 ml-0.5" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="col-span-1 flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onOpenGrade(s)}
                          aria-label="Noter"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Ligne IA / quick grade / expand */}
                    {(s.statutIA === 'EN_COURS' || s.statutIA === 'TERMINE' || s.statutIA === 'ERREUR' || quickGrade.id === s.id || isExpanded) && (
                      <div className="mt-2 ml-0 sm:ml-0 grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/30 p-2">
                        {/* IA status */}
                        {s.statutIA !== 'EN_ATTENTE' && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className={`gap-1 ${iaCfg.badge}`}>
                              {iaCfg.spinner && <Loader2 className="h-3 w-3 animate-spin" />}
                              <Sparkles className="h-3 w-3" />
                              {iaCfg.label}
                            </Badge>
                            {s.statutIA === 'TERMINE' && s.noteIA !== null && (
                              <span className="text-info font-medium">
                                Note IA : {s.noteIA}/{quickGrade.noteMax}
                              </span>
                            )}
                            {s.statutIA === 'ERREUR' && s.erreurIA && (
                              <span className="text-destructive text-[11px]">{s.erreurIA}</span>
                            )}
                          </div>
                        )}

                        {/* Quick IA button */}
                        {s.statutIA === 'EN_ATTENTE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-fit text-xs border-info/30 bg-info/10 text-info hover:bg-info/20"
                            onClick={() => onQuickAiGrade(s.id)}
                          >
                            <Sparkles className="mr-1 h-3 w-3" />
                            Évaluer par IA
                          </Button>
                        )}

                        {/* Quick grade inline */}
                        {quickGrade.id === s.id && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={quickGrade.noteMax}
                              step={0.5}
                              value={quickGrade.value}
                              onChange={(e) => quickGrade.setValue(Number(e.target.value) || 0)}
                              className="h-7 w-20 text-sm"
                              aria-label={`Note sur ${quickGrade.noteMax}`}
                            />
                            <span className="text-xs text-muted-foreground">/ {quickGrade.noteMax}</span>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={quickGrade.submit}
                              disabled={quickGrade.isGrading}
                            >
                              {quickGrade.isGrading ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                              )}
                              OK
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => quickGrade.setId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="space-y-1.5 text-xs">
                            {s.contenuTexte && (
                              <div>
                                <p className="font-semibold text-muted-foreground">Contenu texte :</p>
                                <p className="mt-0.5 whitespace-pre-wrap rounded bg-card p-2 border border-border">
                                  {s.contenuTexte}
                                </p>
                              </div>
                            )}
                            {s.fichiersSoumis && (
                              <div>
                                <p className="font-semibold text-muted-foreground">Fichiers :</p>
                                <p className="mt-0.5 font-mono text-[11px]">{s.fichiersSoumis}</p>
                              </div>
                            )}
                            {s.commentaireEtudiant && (
                              <div>
                                <p className="font-semibold text-muted-foreground">Commentaire étudiant :</p>
                                <p className="mt-0.5 italic">{s.commentaireEtudiant}</p>
                              </div>
                            )}
                            {s.justificationIA && (
                              <div>
                                <p className="font-semibold text-info">Justification IA :</p>
                                <p className="mt-0.5 italic text-info/80">{s.justificationIA}</p>
                              </div>
                            )}
                            {s.commentaireEnseignant && (
                              <div>
                                <p className="font-semibold text-muted-foreground">Commentaire enseignant :</p>
                                <p className="mt-0.5">{s.commentaireEnseignant}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick action row (toujours visible) */}
                    {quickGrade.id !== s.id && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {s.statut === 'SOUMIS' || s.statut === 'CORRIGE' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] text-primary-text hover:bg-primary/10"
                              onClick={() => {
                                quickGrade.setId(s.id)
                                quickGrade.setValue(s.note ?? 0)
                              }}
                            >
                              <Edit3 className="mr-1 h-3 w-3" />
                              Note rapide
                            </Button>
                            {s.statutIA === 'EN_ATTENTE' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] text-info hover:bg-info/10"
                                onClick={() => onQuickAiGrade(s.id)}
                              >
                                <Sparkles className="mr-1 h-3 w-3" />
                                Évaluer IA
                              </Button>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

// ─── Grade Dialog avec IA polling ───
function GradeDialog({
  open,
  onClose,
  soumission,
  noteMax,
  gradeNote,
  setGradeNote,
  gradeCommentaire,
  setGradeCommentaire,
  isSubmitting,
  isAiGrading,
  onSubmit,
  onAiGrade,
}: {
  open: boolean
  onClose: () => void
  soumission: Soumission | null
  noteMax: number
  gradeNote: string
  setGradeNote: (v: string) => void
  gradeCommentaire: string
  setGradeCommentaire: (v: string) => void
  isSubmitting: boolean
  isAiGrading: boolean
  onSubmit: () => void
  onAiGrade: () => void
}) {
  const iaCfg = statutIaConfig(soumission?.statutIA)
  const noteValue = parseFloat(gradeNote) || 0
  const percent = Math.min(100, (noteValue / noteMax) * 100)
  const accent = percent >= 80 ? 'success' : percent >= 50 ? 'warning' : 'danger'

  // Auto-fill note + commentaire depuis IA quand elle termine
  useEffect(() => {
    if (soumission?.statutIA === 'TERMINE' && soumission.noteIA !== null && !gradeNote) {
      setGradeNote(String(soumission.noteIA))
    }
    if (soumission?.statutIA === 'TERMINE' && soumission.justificationIA && !gradeCommentaire) {
      setGradeCommentaire(soumission.justificationIA)
    }
  }, [soumission?.statutIA, soumission?.noteIA, soumission?.justificationIA, gradeNote, gradeCommentaire, setGradeNote, setGradeCommentaire])

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Noter la soumission"
      description={soumission?.User?.name ?? ''}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              'Enregistrer la note'
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* IA status block */}
        {soumission?.statutIA && soumission.statutIA !== 'EN_ATTENTE' && (
          <div
            className={`rounded-md border p-3 ${
              soumission.statutIA === 'ERREUR'
                ? 'border-destructive/30 bg-destructive/5'
                : soumission.statutIA === 'TERMINE'
                  ? 'border-info/30 bg-info/5'
                  : 'border-info/30 bg-info/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`gap-1 ${iaCfg.badge}`}>
                  {iaCfg.spinner && <Loader2 className="h-3 w-3 animate-spin" />}
                  <Sparkles className="h-3 w-3" />
                  {iaCfg.label}
                </Badge>
                {soumission.statutIA === 'TERMINE' && soumission.noteIA !== null && (
                  <span className="text-sm font-semibold text-info">
                    Note IA : {soumission.noteIA}/{noteMax}
                  </span>
                )}
              </div>
              {soumission.statutIA !== 'EN_COURS' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-info/30 text-info hover:bg-info/10"
                  onClick={onAiGrade}
                  disabled={isAiGrading}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {isAiGrading ? 'Demande envoyée…' : 'Relancer l’IA'}
                </Button>
              )}
            </div>
            {soumission.statutIA === 'EN_COURS' && (
              <p className="mt-2 text-xs text-info flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Évaluation IA en cours, veuillez patienter quelques secondes…
              </p>
            )}
            {soumission.statutIA === 'TERMINE' && soumission.justificationIA && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-info">Justification IA</p>
                <p className="mt-0.5 text-xs italic text-info/80">{soumission.justificationIA}</p>
              </div>
            )}
            {soumission.statutIA === 'ERREUR' && soumission.erreurIA && (
              <p className="mt-2 text-xs text-destructive">{soumission.erreurIA}</p>
            )}
          </div>
        )}

        {/* Bouton évaluer IA (première fois) */}
        {soumission?.statutIA === 'EN_ATTENTE' && (
          <div className="rounded-md border border-info/30 bg-info/5 p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-info flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Évaluation IA
              </p>
              <p className="text-xs text-muted-foreground">
                Laissez l’IA proposer une note basée sur la grille d’évaluation.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-info/40 text-info hover:bg-info/10"
              onClick={onAiGrade}
              disabled={isAiGrading}
            >
              {isAiGrading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Envoi…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Évaluer par IA
                </>
              )}
            </Button>
          </div>
        )}

        {/* Contenu soumis (aperçu) */}
        {soumission?.contenuTexte && (
          <div className="space-y-1.5">
            <Label>Contenu rendu</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {soumission.contenuTexte}
            </div>
          </div>
        )}

        {/* Note + ProgressRing */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="grade-note">
              Note <span className="text-destructive">*</span> <span className="text-xs text-muted-foreground">(sur {noteMax})</span>
            </Label>
            <Input
              id="grade-note"
              type="number"
              min={0}
              max={noteMax}
              step={0.5}
              value={gradeNote}
              onChange={(e) => setGradeNote(e.target.value)}
              placeholder="0"
            />
            <p className="text-[11px] text-muted-foreground">
              Saisissez une note entre 0 et {noteMax}. Les demi-points sont acceptés.
            </p>
          </div>
          <div className="flex items-center justify-center">
            <ProgressRing
              value={percent}
              size={88}
              accent={accent}
              label={`${noteValue.toFixed(1)}`}
              sublabel={`/${noteMax}`}
              showPercent={false}
            />
          </div>
        </div>

        {/* Commentaire */}
        <div className="space-y-1.5">
          <Label htmlFor="grade-comm">Commentaire enseignant</Label>
          <Textarea
            id="grade-comm"
            value={gradeCommentaire}
            onChange={(e) => setGradeCommentaire(e.target.value)}
            placeholder="Feedback pour l’étudiant…"
            rows={4}
          />
        </div>
      </div>
    </GlassModal>
  )
}
