'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, BookOpen, Calendar, Edit3, Send, Trash2, Eye, Lock,
  Search, X, Loader2, FileText, Users, Star, Archive,
  Sparkles, Copy, Clock, Upload, BarChart3, TrendingUp, AlertCircle,
  ChevronDown, ChevronUp, PlusCircle, MinusCircle,
  Timer, Paperclip, UsersRound, Download,
  CheckCircle2, FileSpreadsheet, MessageSquare, GraduationCap,
  Info, Zap, Layers, Radio, RefreshCw, FileWarning, Settings2,
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
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { PulseSkeleton, StatCard } from '@/components/ds'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid,
} from 'recharts'
import { toast } from 'sonner'
import type {
  Devoir, Soumission, CritereGrille, UniteEnseignement,
  StatutDevoir, DevoirStats,
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

function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateOnly(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isOverdue(dateLimite: string): boolean {
  return new Date(dateLimite) < new Date()
}

function getTimeRemaining(dateLimite: string): { text: string; urgent: boolean } {
  const now = new Date()
  const deadline = new Date(dateLimite)
  const diff = deadline.getTime() - now.getTime()
  if (diff <= 0) return { text: 'Échu', urgent: true }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 7) return { text: `${days}j restants`, urgent: false }
  if (days > 0) return { text: `${days}j ${hours}h`, urgent: days <= 2 }
  if (hours > 0) return { text: `${hours}h`, urgent: true }
  return { text: '< 1h', urgent: true }
}

function getTypeSeanceLabel(type: string): string {
  return ({ CM: 'Cours Magistral', TD: 'Travail Dirigé', TP: 'Travail Pratique' } as Record<string, string>)[type] ?? type
}
function getTypeSeanceShort(type: string): string {
  return ({ CM: 'CM', TD: 'TD', TP: 'TP' } as Record<string, string>)[type] ?? type
}

/** Classes Savane par type de séance */
function typeSeanceClasses(type: string): { badge: string; dot: string; glow: string } {
  switch (type) {
    case 'CM':
      return { badge: 'border-info/40 bg-info/10 text-info', dot: 'bg-info', glow: '' }
    case 'TD':
      return { badge: 'border-primary/40 bg-primary/10 text-primary-text', dot: 'bg-primary', glow: '' }
    case 'TP':
      return { badge: 'border-secondary/40 bg-secondary/10 text-secondary', dot: 'bg-secondary', glow: '' }
    default:
      return { badge: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground', glow: '' }
  }
}

function statutDevoirConfig(statut: StatutDevoir) {
  switch (statut) {
    case 'BROUILLON':
      return { icon: Edit3, label: 'Brouillon', badge: 'border-border bg-muted text-muted-foreground' }
    case 'PUBLIE':
      return { icon: Send, label: 'Publié', badge: 'border-success/30 bg-success/15 text-success-text' }
    case 'FERME':
      return { icon: Lock, label: 'Fermé', badge: 'border-warning/30 bg-warning/15 text-warning' }
    case 'ARCHIVE':
      return { icon: Archive, label: 'Archivé', badge: 'border-secondary/30 bg-secondary/15 text-secondary' }
    default:
      return { icon: Edit3, label: statut, badge: 'border-border bg-muted text-muted-foreground' }
  }
}

function statutSoumissionConfig(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return { label: 'Brouillon', badge: 'border-border bg-muted text-muted-foreground' }
    case 'SOUMIS':
      return { label: 'En attente', badge: 'border-info/30 bg-info/15 text-info' }
    case 'CORRIGE':
      return { label: 'Corrigé', badge: 'border-success/30 bg-success/15 text-success-text' }
    case 'RETOURNE':
      return { label: 'Rendu', badge: 'border-secondary/30 bg-secondary/15 text-secondary' }
    default:
      return { label: statut, badge: 'border-border bg-muted text-muted-foreground' }
  }
}

function toLocalDatetimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

/** Échappe proprement une cellule CSV (gère retours-ligne et guillemets) */
function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

function generateCSV(devoir: Devoir, soumissions: Soumission[]): string {
  const header = ['Étudiant', 'Matricule', 'Email', 'Statut', 'Date de rendu', `Note (/${devoir.noteMax})`, 'Commentaire']
  const rows = soumissions.map(s => [
    s.User?.name ?? '', s.User?.matricule ?? '', s.User?.email ?? '',
    s.statut, s.renduAt ? formatDateTime(s.renduAt) : '',
    s.note !== null ? String(s.note) : '', s.commentaireEnseignant ?? '',
  ])
  const csvContent = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
  return '\uFEFF' + csvContent
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
//  MAIN COMPONENT
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
  const [activeView, setActiveView] = useState<'grid' | 'analysis'>('grid')

  // ─── Create/Edit dialog ───
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingDevoir, setEditingDevoir] = useState<Devoir | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formTitre, setFormTitre] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formUniteEnseignementId, setFormUniteEnseignementId] = useState('')
  const [formTypeSeance, setFormTypeSeance] = useState('TD')
  const [formDateLimite, setFormDateLimite] = useState('')
  const [formDatePublication, setFormDatePublication] = useState('')
  const [formNoteMax, setFormNoteMax] = useState(20)
  const [formConsignes, setFormConsignes] = useState('')
  const [formRenduFichiers, setFormRenduFichiers] = useState(false)
  const [formSoumissionGroupe, setFormSoumissionGroupe] = useState(false)
  const [formNbMaxFichiers, setFormNbMaxFichiers] = useState(5)
  const [formTailleMaxFichier, setFormTailleMaxFichier] = useState(10)
  const [formGrilleCriteres, setFormGrilleCriteres] = useState<CritereGrille[]>([{ nom: '', description: '', poids: 1 }])
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)

  // ─── UE data ───
  // (chargé via useQuery ci-dessous, plus bas)

  // ─── Confirmation dialogs ───
  const [deleteTarget, setDeleteTarget] = useState<Devoir | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Devoir | null>(null)

  // ─── Soumissions sheet ───
  const [soumissionsSheetOpen, setSoumissionsSheetOpen] = useState(false)
  const [selectedDevoirForSoumissions, setSelectedDevoirForSoumissions] = useState<Devoir | null>(null)
  const [soumissions, setSoumissions] = useState<Soumission[]>([])
  const [isLoadingSoumissions, setIsLoadingSoumissions] = useState(false)
  const [soumissionSortField, setSoumissionSortField] = useState<string>('renduAt')
  const [soumissionSortDir, setSoumissionSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedSoumissionId, setExpandedSoumissionId] = useState<string | null>(null)

  // ─── Quick grade ───
  const [quickGradeSoumissionId, setQuickGradeSoumissionId] = useState<string | null>(null)
  const [quickGradeValue, setQuickGradeValue] = useState(0)
  const [isQuickGrading, setIsQuickGrading] = useState(false)

  // ─── Grade dialog ───
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false)
  const [gradingSoumission, setGradingSoumission] = useState<Soumission | null>(null)
  const [gradeNote, setGradeNote] = useState('')
  const [gradeCommentaire, setGradeCommentaire] = useState('')
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false)
  const [isAiGrading, setIsAiGrading] = useState(false)

  // ═══════════════════════════════════════
  //  DATA FETCHING (BUGFIX QUERY-MIGRATION-1 : TanStack Query)
  // ═══════════════════════════════════════

  // NOTE : l'API /api/devoirs ne prend pas les filtres en paramètres —
  // le filtrage/tri se fait côté client (filteredDevoirs useMemo plus bas).
  // Le queryKey n'inclut donc QUE user.id (comme les deps du useCallback
  // original). staleTime 60s -> pas de refetch au retour navigation.
  const devoirsQuery = useQuery<{ devoirs: Devoir[] }>({
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
    ? (devoirsQuery.error instanceof Error
        ? devoirsQuery.error.message
        : 'Impossible de charger les devoirs')
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
    // Pas de enabled: !!user?.id ici — l'original appelait /api/unites-enseignement
    // dans un useEffect avec deps [] (pas conditionnel à user). On garde ce
    // comportement : la query est active immédiatement.
    staleTime: 5 * 60 * 1000, // 5 min : les UEs changent rarement
    refetchOnWindowFocus: false,
  })

  const unitesEnseignement = uesQuery.data?.unitesEnseignement ?? []

  // Helpers pour invalider le cache après mutation (create/update/delete/status).
  const refreshDevoirs = () => {
    queryClient.invalidateQueries({ queryKey: ['devoirs', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['devoirs-stats', user?.id] })
  }
  const refreshStats = () =>
    queryClient.invalidateQueries({ queryKey: ['devoirs-stats', user?.id] })

  // ═══════════════════════════════════════
  //  FILTERING & SORTING
  // ═══════════════════════════════════════

  const tabStatut = TAB_FILTERS[activeTab].statut

  const filteredDevoirs = useMemo(() => {
    let result = [...devoirs]
    if (tabStatut) result = result.filter(d => d.statut === tabStatut)
    if (ueFilter !== 'all') result = result.filter(d => d.uniteEnseignementId === ueFilter)
    if (typeSeanceFilter !== 'all') result = result.filter(d => d.typeSeance === typeSeanceFilter)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(d =>
        d.titre.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q)) ||
        d.UniteEnseignement?.nom?.toLowerCase().includes(q) ||
        d.UniteEnseignement?.code?.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => {
      let aVal: string | number, bVal: string | number
      switch (sortField) {
        case 'titre': aVal = a.titre.toLowerCase(); bVal = b.titre.toLowerCase(); break
        case 'createdAt': aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break
        case 'noteMax': aVal = a.noteMax; bVal = b.noteMax; break
        case 'dateLimite': default: aVal = new Date(a.dateLimite).getTime(); bVal = new Date(b.dateLimite).getTime(); break
      }
      return sortDir === 'asc'
        ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
        : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0)
    })
    return result
  }, [devoirs, tabStatut, ueFilter, typeSeanceFilter, debouncedSearch, sortField, sortDir])

  const localStats = useMemo(() => {
    const brouillons = devoirs.filter(d => d.statut === 'BROUILLON').length
    const publies = devoirs.filter(d => d.statut === 'PUBLIE').length
    const fermes = devoirs.filter(d => d.statut === 'FERME').length
    const archives = devoirs.filter(d => d.statut === 'ARCHIVE').length
    const totalSoumissions = devoirs.reduce((sum, d) => sum + (d.soumissionCount ?? d.Soumission?.length ?? 0), 0)
    const enRetard = devoirs.filter(d => d.statut !== 'ARCHIVE' && isOverdue(d.dateLimite)).length
    return { brouillons, publies, fermes, archives, total: devoirs.length, totalSoumissions, enRetard }
  }, [devoirs])

  const kpis = stats?.kpis ?? {
    total: localStats.total, brouillons: localStats.brouillons, publies: localStats.publies,
    fermes: localStats.fermes, archives: localStats.archives,
    totalSoumissions: localStats.totalSoumissions, soumissionsEnAttente: 0, soumissionsCorrigees: 0,
    enRetard: localStats.enRetard,
  }

  // ═══════════════════════════════════════
  //  FORM MANAGEMENT
  // ═══════════════════════════════════════

  const resetForm = () => {
    setFormTitre(''); setFormDescription(''); setFormUniteEnseignementId('')
    setFormTypeSeance('TD'); setFormDateLimite(''); setFormDatePublication('')
    setFormNoteMax(20); setFormConsignes('')
    setFormRenduFichiers(false); setFormSoumissionGroupe(false)
    setFormNbMaxFichiers(5); setFormTailleMaxFichier(10)
    setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    setAdvancedSettingsOpen(false)
  }

  const handleOpenCreate = () => { setEditingDevoir(null); resetForm(); setFormDialogOpen(true) }

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
        const parsed = typeof devoir.GrilleEvaluation.criteres === 'string'
          ? JSON.parse(devoir.GrilleEvaluation.criteres as string)
          : devoir.GrilleEvaluation.criteres
        setFormGrilleCriteres(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ nom: '', description: '', poids: 1 }])
      } catch { setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }]) }
    } else {
      setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    }
    setAdvancedSettingsOpen(!!devoir.renduFichiers || devoir.soumissionGroupe || !!devoir.GrilleEvaluation)
    setFormDialogOpen(true)
  }

  const addCritere = () => setFormGrilleCriteres([...formGrilleCriteres, { nom: '', description: '', poids: 1 }])
  const removeCritere = (index: number) => {
    if (formGrilleCriteres.length <= 1) return
    setFormGrilleCriteres(formGrilleCriteres.filter((_, i) => i !== index))
  }
  const updateCritere = (index: number, field: keyof CritereGrille, value: string | number) => {
    setFormGrilleCriteres(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  // ═══════════════════════════════════════
  //  ACTIONS
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
        titre: formTitre, description: formDescription || null, consignes: formConsignes || null,
        uniteEnseignementId: formUniteEnseignementId, enseignantId: user.id,
        typeSeance: formTypeSeance, datePublication: formDatePublication || null,
        dateLimite: formDateLimite, noteMax: formNoteMax,
        renduFichiers: formRenduFichiers || null, soumissionGroupe: formSoumissionGroupe,
        nbMaxFichiers: formNbMaxFichiers, tailleMaxFichier: formTailleMaxFichier * 1048576,
      }
      const url = editingDevoir ? `/api/devoirs/${editingDevoir.id}` : '/api/devoirs'
      const method = editingDevoir ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur lors de l'enregistrement")
      }
      const result = await res.json()
      const devoirId = editingDevoir?.id || result.devoir?.id
      const validCriteres = formGrilleCriteres.filter(c => c.nom.trim())
      if (validCriteres.length > 0 && devoirId) {
        try {
          const grilleRes = await fetch(`/api/grilles-evaluation?devoirId=${devoirId}`)
          const grilleData = await grilleRes.json()
          const existingGrille = grilleData.grilles?.[0]
          const grilleUrl = existingGrille ? `/api/grilles-evaluation/${existingGrille.id}` : '/api/grilles-evaluation'
          const grilleMethod = existingGrille ? 'PATCH' : 'POST'
          await fetch(grilleUrl, {
            method: grilleMethod, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existingGrille ? { criteres: validCriteres } : { devoirId, criteres: validCriteres }),
          })
        } catch { /* grille save non-bloquante */ }
      }
      toast.success(editingDevoir ? 'Devoir mis à jour' : 'Devoir créé', {
        description: `"${formTitre}" ${editingDevoir ? 'modifié' : 'créé'} avec succès.`,
      })
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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

  // ─── Dupliquer : CORRIGÉ (dateLimite à J+7, conserve consignes + anneeUniversitaire) ───
  const handleDuplicate = async () => {
    if (!duplicateTarget || !user?.id) return
    try {
      // Calcule une date limite par défaut : J+7 à 23h59
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
        dateLimite: toLocalDatetimeString(defaultDate.toISOString()), // CORRIGÉ : date valide
        noteMax: duplicateTarget.noteMax,
        renduFichiers: duplicateTarget.renduFichiers,
        soumissionGroupe: duplicateTarget.soumissionGroupe,
        nbMaxFichiers: duplicateTarget.nbMaxFichiers,
        tailleMaxFichier: duplicateTarget.tailleMaxFichier,
        anneeUniversitaire: duplicateTarget.anneeUniversitaire, // CORRIGÉ : conservé
      }
      const res = await fetch('/api/devoirs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la duplication')
      }
      const result = await res.json()
      // Duplique aussi la grille d'évaluation
      if (duplicateTarget.GrilleEvaluation?.criteres && result.devoir?.id) {
        try {
          await fetch('/api/grilles-evaluation', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ devoirId: result.devoir.id, criteres: duplicateTarget.GrilleEvaluation.criteres }),
          })
        } catch { /* non-bloquant */ }
      }
      toast.success('Devoir dupliqué', {
        description: `"${duplicateTarget.titre} (copie)" créé en brouillon (échéance J+7).`,
      })
      setDuplicateTarget(null)
      await refreshDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Duplication impossible.' })
    }
  }

  // ═══════════════════════════════════════
  //  SOUMISSIONS
  // ═══════════════════════════════════════

  const handleViewSoumissions = async (devoir: Devoir) => {
    setSelectedDevoirForSoumissions(devoir)
    setSoumissionsSheetOpen(true)
    setIsLoadingSoumissions(true)
    setExpandedSoumissionId(null)
    setQuickGradeSoumissionId(null)
    try {
      const res = await fetch(`/api/devoirs/${devoir.id}`)
      if (res.ok) {
        const data = await res.json()
        setSoumissions(data.devoir?.Soumission ?? [])
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les soumissions.' })
    } finally {
      setIsLoadingSoumissions(false)
    }
  }

  const handleQuickGrade = async () => {
    if (!quickGradeSoumissionId || !selectedDevoirForSoumissions) return
    setIsQuickGrading(true)
    try {
      const res = await fetch(`/api/soumissions/${quickGradeSoumissionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: quickGradeValue }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur de notation')
      }
      toast.success(`Note enregistrée : ${quickGradeValue}/${selectedDevoirForSoumissions.noteMax}`)
      setQuickGradeSoumissionId(null)
      if (selectedDevoirForSoumissions) await handleViewSoumissions(selectedDevoirForSoumissions)
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Notation impossible.' })
    } finally {
      setIsQuickGrading(false)
    }
  }

  const handleOpenGrade = (soumission: Soumission) => {
    setGradingSoumission(soumission)
    setGradeNote(soumission.note !== null ? String(soumission.note) : String(quickGradeValue || ''))
    setGradeCommentaire(soumission.commentaireEnseignant ?? '')
    setGradeDialogOpen(true)
  }

  const handleSubmitGrade = async () => {
    if (!gradingSoumission) return
    if (!gradeNote) { toast.error('Note requise'); return }
    const noteValue = parseFloat(gradeNote)
    if (isNaN(noteValue) || noteValue < 0) { toast.error('Note invalide'); return }
    const maxNote = selectedDevoirForSoumissions?.noteMax ?? 20
    if (noteValue > maxNote) { toast.error('Note invalide', { description: `Maximum : ${maxNote}` }); return }
    setIsSubmittingGrade(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteValue, commentaireEnseignant: gradeCommentaire || null }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur de notation')
      }
      toast.success('Soumission notée', { description: `${noteValue}/${maxNote} enregistrée.` })
      setGradeDialogOpen(false)
      if (selectedDevoirForSoumissions) await handleViewSoumissions(selectedDevoirForSoumissions)
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Notation impossible.' })
    } finally {
      setIsSubmittingGrade(false)
    }
  }

  const handleAiGradeSoumission = async () => {
    if (!gradingSoumission) return
    setIsAiGrading(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}/ai-grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur d'évaluation IA")
      }
      const data = await res.json()
      if (data.aiGrade) {
        setGradeNote(String(data.aiGrade.note))
        setGradeCommentaire(data.aiGrade.justification || '')
      }
      toast.success('Évaluation IA terminée', { description: `Note proposée : ${data.aiGrade?.note}/${data.aiGrade?.noteMax}.` })
      if (selectedDevoirForSoumissions) await handleViewSoumissions(selectedDevoirForSoumissions)
      const updated = soumissions.find(s => s.id === gradingSoumission.id)
      if (updated) {
        setGradingSoumission({ ...updated, noteIA: data.aiGrade?.note ?? updated.noteIA, justificationIA: data.aiGrade?.justification ?? updated.justificationIA })
      }
    } catch (err) {
      toast.error('Erreur IA', { description: err instanceof Error ? err.message : 'Évaluation IA impossible.' })
    } finally { setIsAiGrading(false) }
  }

  const handleExportCSV = () => {
    if (!selectedDevoirForSoumissions || soumissions.length === 0) return
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

  // ─── Tri soumissions (CORRIGÉ : logique propre) ───
  const toggleSoumissionSort = (field: string) => {
    if (soumissionSortField === field) {
      setSoumissionSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSoumissionSortField(field)
      setSoumissionSortDir('asc')
    }
  }

  const getSortIcon = (field: string) =>
    soumissionSortField === field
      ? (soumissionSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
      : null

  const sortedSoumissions = useMemo(() => {
    return [...soumissions].sort((a, b) => {
      let aVal: string | number = '', bVal: string | number = ''
      switch (soumissionSortField) {
        case 'name': aVal = a.User?.name?.toLowerCase() ?? ''; bVal = b.User?.name?.toLowerCase() ?? ''; break
        case 'statut': aVal = a.statut; bVal = b.statut; break
        case 'note': aVal = a.note ?? -1; bVal = b.note ?? -1; break
        case 'renduAt': default: aVal = a.renduAt ?? ''; bVal = b.renduAt ?? ''; break
      }
      return soumissionSortDir === 'asc'
        ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
        : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0)
    })
  }, [soumissions, soumissionSortField, soumissionSortDir])

  const handleCycleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field); setSortDir('asc')
    }
  }

  const resetFilters = () => {
    setActiveTab('all'); setUeFilter('all'); setTypeSeanceFilter('all')
    setSearchInput(''); setSortField('dateLimite'); setSortDir('desc')
  }

  const hasActiveFilters = activeTab !== 'all' || ueFilter !== 'all' || typeSeanceFilter !== 'all' || debouncedSearch.trim() !== ''

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
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
                  Créez, gérez et corrigez vos devoirs TP/TD
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-success-text">
                    <Radio className="h-3 w-3" />
                    {kpis.publies} actifs
                  </span>
                  {kpis.soumissionsEnAttente > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-warning">
                      <Clock className="h-3 w-3" />
                      {kpis.soumissionsEnAttente} à corriger
                    </span>
                  )}
                  {kpis.enRetard > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-destructive">
                      <FileWarning className="h-3 w-3" />
                      {kpis.enRetard} en retard
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => { refreshDevoirs() }}
                aria-label="Rafraîchir"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Actualiser
              </Button>
              <Button
                size="sm"
                onClick={handleOpenCreate}
                className="font-semibold"
                aria-label="Nouveau devoir"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nouveau devoir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── KPI Grid ─── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Total devoirs"
          value={kpis.total}
          hint={`${kpis.brouillons} brouillons`}
          accent="info"
          loading={isLoading && !stats}
          index={0}
        />
        <StatCard
          icon={Send}
          label="Publiés"
          value={kpis.publies}
          hint={`${kpis.fermes} fermés`}
          accent="success"
          loading={isLoading && !stats}
          index={1}
        />
        <StatCard
          icon={Users}
          label="Soumissions"
          value={kpis.totalSoumissions}
          hint={`${kpis.soumissionsCorrigees} corrigées`}
          accent="secondary"
          loading={isLoading && !stats}
          index={2}
        />
        <StatCard
          icon={TrendingUp}
          label="Note moyenne"
          value={stats?.moyenneNotes ?? '—'}
          hint={stats?.moyenneNotes !== null && stats?.moyenneNotes !== undefined ? '/ 20' : 'aucune note'}
          accent="warning"
          loading={isLoading && !stats}
          index={3}
        />
      </section>

      {/* ─── Vue switch : Grid / Analyse ─── */}
      <nav
        className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1"
        role="tablist" aria-label="Vue des devoirs"
      >
        <TabButton active={activeView === 'grid'} onClick={() => setActiveView('grid')}
          icon={<Layers className="h-4 w-4" />} label="Devoirs" count={filteredDevoirs.length} />
        <TabButton active={activeView === 'analysis'} onClick={() => setActiveView('analysis')}
          icon={<BarChart3 className="h-4 w-4" />} label="Analyses" />
      </nav>

      {/* ─── Contenu ─── */}
      {activeView === 'grid' ? (
        <GridView
          devoirs={filteredDevoirs}
          isLoading={isLoading}
          loadError={loadError}
          unitesEnseignement={unitesEnseignement}
          filters={{
            activeTab, setActiveTab,
            ueFilter, setUeFilter,
            typeSeanceFilter, setTypeSeanceFilter,
            searchInput, setSearchInput,
            sortField, sortDir, handleCycleSort,
            hasActiveFilters, resetFilters,
          }}
          onEdit={handleOpenEdit}
          onDelete={setDeleteTarget}
          onDuplicate={setDuplicateTarget}
          onStatusAction={handleStatusAction}
          onViewSoumissions={handleViewSoumissions}
        />
      ) : (
        <AnalysisView stats={stats} isLoading={isLoading} />
      )}

      {/* ─── Dialogs ─── */}
      <DevoirFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editingDevoir={editingDevoir}
        isSubmitting={isSubmitting}
        unitesEnseignement={unitesEnseignement}
        form={{
          formTitre, setFormTitre, formDescription, setFormDescription,
          formUniteEnseignementId, setFormUniteEnseignementId,
          formTypeSeance, setFormTypeSeance,
          formDateLimite, setFormDateLimite,
          formDatePublication, setFormDatePublication,
          formNoteMax, setFormNoteMax,
          formConsignes, setFormConsignes,
          formRenduFichiers, setFormRenduFichiers,
          formSoumissionGroupe, setFormSoumissionGroupe,
          formNbMaxFichiers, setFormNbMaxFichiers,
          formTailleMaxFichier, setFormTailleMaxFichier,
          formGrilleCriteres, addCritere, removeCritere, updateCritere,
          advancedSettingsOpen, setAdvancedSettingsOpen,
        }}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="!min-h-0 border-destructive/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Supprimer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le devoir «&nbsp;{deleteTarget?.titre}&nbsp;» sera déplacé vers la corbeille. Vous pourrez le restaurer pendant 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicateTarget} onOpenChange={(v) => !v && setDuplicateTarget(null)}>
        <AlertDialogContent className="!min-h-0 border-primary/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary-text">Dupliquer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une copie de «&nbsp;{duplicateTarget?.titre}&nbsp;» sera créée en brouillon avec une échéance à J+7.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDuplicate}
            >
              Dupliquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Sheet Soumissions ─── */}
      <SoumissionsSheet
        open={soumissionsSheetOpen}
        onOpenChange={setSoumissionsSheetOpen}
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
        quickGrade={{
          id: quickGradeSoumissionId, setId: setQuickGradeSoumissionId,
          value: quickGradeValue, setValue: setQuickGradeValue,
          submit: handleQuickGrade, isGrading: isQuickGrading,
        }}
      />

      {/* ─── Grade Dialog ─── */}
      <GradeDialog
        open={gradeDialogOpen}
        onOpenChange={setGradeDialogOpen}
        soumission={gradingSoumission}
        noteMax={selectedDevoirForSoumissions?.noteMax ?? 20}
        gradeNote={gradeNote} setGradeNote={setGradeNote}
        gradeCommentaire={gradeCommentaire} setGradeCommentaire={setGradeCommentaire}
        isSubmitting={isSubmittingGrade}
        isAiGrading={isAiGrading}
        onSubmit={handleSubmitGrade}
        onAiGrade={handleAiGradeSoumission}
      />
    </div>
  )
}

// ═══════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════

// ─── Tab Button ───
function TabButton({
  active, onClick, icon, label, count,
}: {
  active: boolean; onClick: () => void
  icon: React.ReactNode; label: string; count?: number
}) {
  return (
    <button
      role="tab" aria-selected={active} onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4 ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
          active ? 'bg-white/25 text-primary-foreground' : 'bg-primary/15 text-primary-text'
        }`}>{count}</span>
      )}
    </button>
  )
}

// ─── Grid View (liste + filtres + cards) ───
function GridView({
  devoirs, isLoading, loadError, unitesEnseignement, filters,
  onEdit, onDelete, onDuplicate, onStatusAction, onViewSoumissions,
}: {
  devoirs: Devoir[]
  isLoading: boolean
  loadError: string | null
  unitesEnseignement: UniteEnseignement[]
  filters: {
    activeTab: TabKey; setActiveTab: (v: TabKey) => void
    ueFilter: string; setUeFilter: (v: string) => void
    typeSeanceFilter: string; setTypeSeanceFilter: (v: string) => void
    searchInput: string; setSearchInput: (v: string) => void
    sortField: SortField; sortDir: 'asc' | 'desc'; handleCycleSort: (f: SortField) => void
    hasActiveFilters: boolean; resetFilters: () => void
  }
  onEdit: (d: Devoir) => void
  onDelete: (d: Devoir) => void
  onDuplicate: (d: Devoir) => void
  onStatusAction: (id: string, action: string, msg: string) => void
  onViewSoumissions: (d: Devoir) => void
}) {
  return (
    <div className="space-y-4">
      {/* ─── Tabs statut ─── */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TAB_FILTERS) as TabKey[]).map((key) => {
          const tab = TAB_FILTERS[key]
          const isActive = filters.activeTab === key
          return (
            <button
              key={key}
              onClick={() => filters.setActiveTab(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                isActive
                  ? 'border border-primary/30 bg-primary/15 text-primary-text'
                  : 'border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── Toolbar (search + filtres + tri) ─── */}
      <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.searchInput}
            onChange={(e) => filters.setSearchInput(e.target.value)}
            placeholder="Rechercher par titre, UE..."
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.ueFilter} onValueChange={filters.setUeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Toutes les UE" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les UE</SelectItem>
              {unitesEnseignement.map((ue) => (
                <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.typeSeanceFilter} onValueChange={filters.setTypeSeanceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tous types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="CM">Cours magistral</SelectItem>
              <SelectItem value="TD">Travail dirigé</SelectItem>
              <SelectItem value="TP">Travaux pratiques</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-input bg-background">
            {(['dateLimite', 'titre', 'createdAt', 'noteMax'] as SortField[]).map((f) => (
              <button
                key={f}
                onClick={() => filters.handleCycleSort(f)}
                className={`px-2.5 py-1.5 text-xs transition-colors ${
                  filters.sortField === f ? 'bg-primary/15 text-primary-text' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={`Trier par ${f}`}
              >
                {f === 'dateLimite' ? 'Date' : f === 'titre' ? 'Titre' : f === 'createdAt' ? 'Créa.' : 'Note'}
                {filters.sortField === f && (
                  filters.sortDir === 'asc' ? <ChevronUp className="ml-0.5 inline h-3 w-3" /> : <ChevronDown className="ml-0.5 inline h-3 w-3" />
                )}
              </button>
            ))}
          </div>
          {filters.hasActiveFilters && (
            <Button
              variant="ghost" size="sm"
              onClick={filters.resetFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Erreur ─── */}
      {loadError && (
        <div className="bg-card border border-destructive/40 rounded-xl shadow-sm flex items-center gap-3 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* ─── Liste ─── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl shadow-sm h-56 p-4">
              <PulseSkeleton variant="card" className="h-full w-full" />
            </div>
          ))}
        </div>
      ) : devoirs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary-text">
            <BookOpen className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-display tracking-tight font-semibold text-foreground">
            {filters.hasActiveFilters ? 'Aucun devoir ne correspond' : 'Aucun devoir créé'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {filters.hasActiveFilters
              ? 'Modifiez vos filtres pour afficher d\'autres devoirs.'
              : 'Cliquez sur « Nouveau devoir » pour créer votre premier devoir.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devoirs.map((devoir, idx) => (
            <DevoirCard
              key={devoir.id}
              devoir={devoir}
              index={idx}
              onEdit={() => onEdit(devoir)}
              onDelete={() => onDelete(devoir)}
              onDuplicate={() => onDuplicate(devoir)}
              onStatusAction={onStatusAction}
              onViewSoumissions={() => onViewSoumissions(devoir)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Devoir Card ───
function DevoirCard({
  devoir, index, onEdit, onDelete, onDuplicate, onStatusAction, onViewSoumissions,
}: {
  devoir: Devoir; index: number
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void
  onStatusAction: (id: string, action: string, msg: string) => void
  onViewSoumissions: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const statutCfg = statutDevoirConfig(devoir.statut)
  const StatutIcon = statutCfg.icon
  const typeCfg = typeSeanceClasses(devoir.typeSeance)
  const time = getTimeRemaining(devoir.dateLimite)
  const overdue = isOverdue(devoir.dateLimite) && devoir.statut !== 'ARCHIVE'
  const soumCount = devoir.soumissionCount ?? devoir.Soumission?.length ?? 0
  const corrigeCount = devoir.Soumission?.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length ?? 0
  const progress = soumCount > 0 ? Math.round((corrigeCount / soumCount) * 100) : 0

  return (
    <Card
      className="relative overflow-hidden py-0 transition-shadow hover:shadow-md ds-lift"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Bande colorée gauche selon type */}
      <div
        className={`absolute left-0 top-0 h-full w-1 ${typeCfg.dot}`}
        aria-hidden
      />
      <CardContent className="p-4 pl-5">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`gap-1 border text-xs ${statutCfg.badge}`}>
                <StatutIcon className="h-3 w-3" />
                {statutCfg.label}
              </Badge>
              <Badge variant="outline" className={`gap-1 border text-xs ${typeCfg.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${typeCfg.dot}`} />
                {getTypeSeanceShort(devoir.typeSeance)}
              </Badge>
            </div>
            <h3 className="mt-2 truncate font-display tracking-tight font-semibold text-foreground">{devoir.titre}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {devoir.UniteEnseignement?.code} — {devoir.UniteEnseignement?.nom}
            </p>
          </div>
        </div>

        {/* Description repliable */}
        {devoir.description && (
          <p className={`mt-2 text-xs text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}>
            {devoir.description}
          </p>
        )}
        {devoir.description && devoir.description.length > 80 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-xs text-primary-text hover:underline"
          >
            {expanded ? 'Réduire' : 'Lire plus'}
          </button>
        )}

        {/* Deadline */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Clock className={`h-3.5 w-3.5 ${overdue ? 'text-destructive' : time.urgent ? 'text-warning' : 'text-primary-text'}`} />
          <span className="text-muted-foreground">{formatDateOnly(devoir.dateLimite)}</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
            overdue
              ? 'bg-destructive/15 text-destructive'
              : time.urgent
              ? 'bg-warning/15 text-warning'
              : 'bg-primary/15 text-primary-text'
          }`}>
            {time.text}
          </span>
        </div>

        {/* Badges infos */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-gold" />/{devoir.noteMax}
          </span>
          {!!devoir.renduFichiers && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3 text-info" />Fichiers
            </span>
          )}
          {devoir.soumissionGroupe && (
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3 w-3 text-secondary" />Groupe
            </span>
          )}
          {devoir.GrilleEvaluation && (
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-3 w-3 text-success-text" />Grille
            </span>
          )}
        </div>

        {/* Progression correction */}
        {soumCount > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                {soumCount} soumission{soumCount > 1 ? 's' : ''}
              </span>
              <span className="text-primary-text">{corrigeCount}/{soumCount} corrigée{soumCount > 1 ? 's' : ''}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <Button size="sm" variant="ghost"
            onClick={onViewSoumissions}
            className="h-8 px-2.5 text-xs text-primary-text hover:bg-primary/10"
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            {soumCount > 0 ? `${soumCount} soumission${soumCount > 1 ? 's' : ''}` : 'Soumissions'}
          </Button>

          {devoir.statut === 'BROUILLON' && (
            <>
              <Button size="sm" variant="ghost"
                onClick={() => onStatusAction(devoir.id, 'publier', 'Devoir publié')}
                className="h-8 px-2.5 text-xs text-success-text hover:bg-success/10"
                aria-label="Publier"
              >
                <Send className="mr-1 h-3.5 w-3.5" />Publier
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}
                className="h-8 px-2.5 text-xs text-foreground hover:bg-accent"
                aria-label="Modifier"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {devoir.statut === 'PUBLIE' && (
            <Button size="sm" variant="ghost"
              onClick={() => onStatusAction(devoir.id, 'fermer', 'Devoir fermé')}
              className="h-8 px-2.5 text-xs text-warning hover:bg-warning/10"
              aria-label="Fermer"
            >
              <Lock className="mr-1 h-3.5 w-3.5" />Fermer
            </Button>
          )}
          {devoir.statut === 'FERME' && (
            <Button size="sm" variant="ghost"
              onClick={() => onStatusAction(devoir.id, 'archiver', 'Devoir archivé')}
              className="h-8 px-2.5 text-xs text-secondary hover:bg-secondary/10"
              aria-label="Archiver"
            >
              <Archive className="mr-1 h-3.5 w-3.5" />Archiver
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onDuplicate}
              className="h-8 w-8 p-0 text-muted-foreground hover:bg-primary/10 hover:text-primary-text"
              aria-label="Dupliquer"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {devoir.statut !== 'PUBLIE' && (
              <Button size="sm" variant="ghost" onClick={onDelete}
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Analysis View ───
function AnalysisView({ stats, isLoading }: { stats: DevoirStats | null; isLoading: boolean }) {
  if (isLoading && !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl shadow-sm h-64 p-4">
            <PulseSkeleton variant="card" className="h-full w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (!stats || stats.kpis.total === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col items-center justify-center p-12 text-center">
        <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Pas encore assez de données pour l'analyse.</p>
      </div>
    )
  }

  const maxType = Math.max(...stats.byType.map((t) => t.count), 1)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Répartition par type */}
      <Card className="p-5 ds-kente-top">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary-text" />
          <h3 className="font-display tracking-tight font-semibold text-foreground">Répartition par type</h3>
        </div>
        {stats.byType.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun devoir.</p>
        ) : (
          <div className="space-y-3">
            {stats.byType.map((t, i) => (
              <div key={t.type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-foreground">{t.label}</span>
                  <span className="font-bold text-primary-text font-mono tabular-nums">{t.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${(t.count / maxType) * 100}%`, animationDelay: `${i * 60}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Soumissions par statut */}
      <Card className="p-5 ds-kente-top">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-secondary" />
          <h3 className="font-display tracking-tight font-semibold text-foreground">Soumissions par statut</h3>
        </div>
        {stats.soumissionsByStatut.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune soumission.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {stats.soumissionsByStatut.map((s) => {
              const cfg = statutSoumissionConfig(s.statut)
              return (
                <div key={s.statut} className={`rounded-lg border p-3 text-center ${cfg.badge}`}>
                  <p className="text-2xl font-bold font-mono tabular-nums">{s.count}</p>
                  <p className="text-xs">{s.label}</p>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Timeline 7 jours */}
      <Card className="p-5 lg:col-span-2 ds-kente-top">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-success-text" />
          <h3 className="font-display tracking-tight font-semibold text-foreground">Soumissions reçues (7 jours)</h3>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={stats.timeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sousGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(132 204 22)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="rgb(132 204 22)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(132,204,22,0.1)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(100,116,139,0.8)', fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getDate()}/${d.getMonth() + 1}`
              }}
            />
            <YAxis tick={{ fill: 'rgba(100,116,139,0.8)', fontSize: 11 }} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(132,204,22,0.3)',
                borderRadius: '8px', color: '#1f2937',
              }}
              labelFormatter={(v) => new Date(v).toLocaleDateString('fr-FR')}
            />
            <Area type="monotone" dataKey="soumissions" name="Soumissions" stroke="rgb(132 204 22)" strokeWidth={2} fill="url(#sousGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

// ─── Devoir Form Dialog ───
function DevoirFormDialog({
  open, onOpenChange, editingDevoir, isSubmitting, unitesEnseignement, form, onSubmit,
}: {
  open: boolean; onOpenChange: (v: boolean) => void
  editingDevoir: Devoir | null; isSubmitting: boolean
  unitesEnseignement: UniteEnseignement[]
  form: {
    formTitre: string; setFormTitre: (v: string) => void
    formDescription: string; setFormDescription: (v: string) => void
    formUniteEnseignementId: string; setFormUniteEnseignementId: (v: string) => void
    formTypeSeance: string; setFormTypeSeance: (v: string) => void
    formDateLimite: string; setFormDateLimite: (v: string) => void
    formDatePublication: string; setFormDatePublication: (v: string) => void
    formNoteMax: number; setFormNoteMax: (v: number) => void
    formConsignes: string; setFormConsignes: (v: string) => void
    formRenduFichiers: boolean; setFormRenduFichiers: (v: boolean) => void
    formSoumissionGroupe: boolean; setFormSoumissionGroupe: (v: boolean) => void
    formNbMaxFichiers: number; setFormNbMaxFichiers: (v: number) => void
    formTailleMaxFichier: number; setFormTailleMaxFichier: (v: number) => void
    formGrilleCriteres: CritereGrille[]
    addCritere: () => void; removeCritere: (i: number) => void; updateCritere: (i: number, f: keyof CritereGrille, v: string | number) => void
    advancedSettingsOpen: boolean; setAdvancedSettingsOpen: (v: boolean) => void
  }
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!min-h-0 max-h-[92vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-foreground">
            {editingDevoir ? 'Modifier le devoir' : 'Nouveau devoir'}
          </DialogTitle>
          <DialogDescription>
            {editingDevoir ? `Modification de « ${editingDevoir.titre} »` : 'Créez un nouveau devoir pour vos étudiants.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Titre */}
          <div className="space-y-1.5">
            <Label className="text-foreground font-medium">Titre <span className="text-destructive">*</span></Label>
            <Input value={form.formTitre} onChange={(e) => form.setFormTitre(e.target.value)}
              placeholder="Ex : TP Algorithmique - Tri rapide" />
          </div>

          {/* UE + Type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Unité d'enseignement <span className="text-destructive">*</span></Label>
              <Select value={form.formUniteEnseignementId} onValueChange={form.setFormUniteEnseignementId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une UE" />
                </SelectTrigger>
                <SelectContent>
                  {unitesEnseignement.map((ue) => (
                    <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Type de séance</Label>
              <Select value={form.formTypeSeance} onValueChange={form.setFormTypeSeance}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CM">Cours magistral</SelectItem>
                  <SelectItem value="TD">Travail dirigé</SelectItem>
                  <SelectItem value="TP">Travaux pratiques</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Date limite <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={form.formDateLimite} onChange={(e) => form.setFormDateLimite(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Publication (optionnel)</Label>
              <Input type="datetime-local" value={form.formDatePublication} onChange={(e) => form.setFormDatePublication(e.target.value)} />
            </div>
          </div>

          {/* Note max + Description */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Note maximale</Label>
              <Input type="number" min={1} max={100} value={form.formNoteMax}
                onChange={(e) => form.setFormNoteMax(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-foreground font-medium">Description courte</Label>
              <Input value={form.formDescription} onChange={(e) => form.setFormDescription(e.target.value)}
                placeholder="Résumé du devoir..." />
            </div>
          </div>

          {/* Consignes */}
          <div className="space-y-1.5">
            <Label className="text-foreground font-medium">Consignes détaillées</Label>
            <Textarea value={form.formConsignes} onChange={(e) => form.setFormConsignes(e.target.value)}
              placeholder="Instructions, attendus, format de rendu..."
              rows={4} />
          </div>

          {/* Paramètres avancés */}
          <div className="rounded-lg border border-border bg-muted/30">
            <button
              onClick={() => form.setAdvancedSettingsOpen(!form.advancedSettingsOpen)}
              className="flex w-full items-center justify-between p-3 text-sm font-medium text-primary-text"
              aria-expanded={form.advancedSettingsOpen}
            >
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Paramètres avancés
              </span>
              {form.advancedSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {form.advancedSettingsOpen && (
              <div className="space-y-3 border-t border-border p-3">
                {/* Fichiers */}
                <div className="flex items-center justify-between">
                  <Label className="inline-flex items-center gap-2 text-foreground font-medium">
                    <Paperclip className="h-4 w-4 text-info" /> Rendu de fichiers
                  </Label>
                  <Switch checked={form.formRenduFichiers} onCheckedChange={form.setFormRenduFichiers} />
                </div>
                {form.formRenduFichiers && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Nb max fichiers</Label>
                      <Input type="number" min={1} value={form.formNbMaxFichiers}
                        onChange={(e) => form.setFormNbMaxFichiers(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Taille max (Mo)</Label>
                      <Input type="number" min={1} value={form.formTailleMaxFichier}
                        onChange={(e) => form.setFormTailleMaxFichier(Number(e.target.value))} />
                    </div>
                  </div>
                )}
                {/* Groupe */}
                <div className="flex items-center justify-between">
                  <Label className="inline-flex items-center gap-2 text-foreground font-medium">
                    <UsersRound className="h-4 w-4 text-secondary" /> Soumission en groupe
                  </Label>
                  <Switch checked={form.formSoumissionGroupe} onCheckedChange={form.setFormSoumissionGroupe} />
                </div>
                {/* Grille d'évaluation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="inline-flex items-center gap-2 text-foreground font-medium">
                      <FileSpreadsheet className="h-4 w-4 text-success-text" /> Grille d'évaluation
                    </Label>
                    <Button size="sm" variant="ghost" onClick={form.addCritere}
                      className="h-7 px-2 text-xs text-primary-text hover:bg-primary/10">
                      <PlusCircle className="mr-1 h-3.5 w-3.5" /> Critère
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.formGrilleCriteres.map((c, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1.5 rounded-md bg-muted/40 p-2">
                        <Input value={c.nom} placeholder="Nom du critère"
                          onChange={(e) => form.updateCritere(i, 'nom', e.target.value)}
                          className="col-span-5 h-8 text-xs" />
                        <Input value={c.description} placeholder="Description"
                          onChange={(e) => form.updateCritere(i, 'description', e.target.value)}
                          className="col-span-5 h-8 text-xs" />
                        <Input type="number" min={0} value={c.poids} placeholder="Poids"
                          onChange={(e) => form.updateCritere(i, 'poids', Number(e.target.value))}
                          className="col-span-1 h-8 text-xs" />
                        <Button size="sm" variant="ghost"
                          onClick={() => form.removeCritere(i)}
                          disabled={form.formGrilleCriteres.length <= 1}
                          className="col-span-1 h-8 w-full p-0 text-destructive hover:bg-destructive/10"
                          aria-label="Supprimer critère">
                          <MinusCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editingDevoir ? 'Enregistrer' : 'Créer le devoir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Soumissions Sheet ───
function SoumissionsSheet({
  open, onOpenChange, devoir, soumissions, isLoading,
  sortField, getSortIcon, toggleSort, expandedId, setExpandedId,
  onExportCSV, onOpenGrade, quickGrade,
}: {
  open: boolean; onOpenChange: (v: boolean) => void
  devoir: Devoir | null; soumissions: Soumission[]; isLoading: boolean
  sortField: string
  getSortIcon: (f: string) => React.ReactNode
  toggleSort: (f: string) => void
  expandedId: string | null; setExpandedId: (v: string | null) => void
  onExportCSV: () => void; onOpenGrade: (s: Soumission) => void
  quickGrade: {
    id: string | null; setId: (v: string | null) => void
    value: number; setValue: (v: number) => void
    submit: () => void; isGrading: boolean
  }
}) {
  const noteMax = devoir?.noteMax ?? 20
  const soumStats = useMemo(() => {
    const corrigees = soumissions.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE')
    const notes = corrigees.filter(s => s.note !== null).map(s => s.note!)
    return {
      total: soumissions.length,
      enAttente: soumissions.filter(s => s.statut === 'SOUMIS').length,
      corrigees: corrigees.length,
      avgNote: notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null,
    }
  }, [soumissions])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        {devoir && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-xl text-foreground">{devoir.titre}</SheetTitle>
              <SheetDescription>
                {devoir.UniteEnseignement?.code} — {getTypeSeanceLabel(devoir.typeSeance)} — /{devoir.noteMax}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-4">
              {/* Stats rapides */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-foreground font-mono tabular-nums">{soumStats.total}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">En attente</p>
                  <p className="text-xl font-bold text-info font-mono tabular-nums">{soumStats.enAttente}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Corrigées</p>
                  <p className="text-xl font-bold text-success-text font-mono tabular-nums">{soumStats.corrigees}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Moyenne</p>
                  <p className="text-xl font-bold text-warning font-mono tabular-nums">
                    {soumStats.avgNote !== null ? soumStats.avgNote.toFixed(1) : '—'}
                  </p>
                </div>
              </div>

              {/* Export */}
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={onExportCSV}
                  disabled={soumissions.length === 0}
                  className="border-success/30 text-success-text hover:bg-success/10">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>

              {/* Liste */}
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card border border-border rounded-lg shadow-sm h-16 p-3">
                      <PulseSkeleton variant="card" className="h-full w-full" />
                    </div>
                  ))}
                </div>
              ) : soumissions.length === 0 ? (
                <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col items-center justify-center p-8 text-center">
                  <Users className="mb-2 h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">Aucune soumission pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {soumissions.map((s) => {
                    const cfg = statutSoumissionConfig(s.statut)
                    const isExpanded = expandedId === s.id
                    const isQuickGrading = quickGrade.id === s.id
                    return (
                      <div key={s.id} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : s.id)}
                            className="text-muted-foreground hover:text-primary-text"
                            aria-label={isExpanded ? 'Réduire' : 'Développer'}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {s.User?.name}
                              {s.User?.matricule && (
                                <span className="ml-1.5 text-xs text-muted-foreground">({s.User.matricule})</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {s.renduAt ? formatDateTime(s.renduAt) : 'Non rendu'}
                            </p>
                          </div>
                          <Badge variant="outline" className={`border text-xs ${cfg.badge}`}>{cfg.label}</Badge>
                          {s.note !== null && (
                            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                              {s.note}/{noteMax}
                            </span>
                          )}
                          {s.noteIA !== null && s.noteIA !== undefined && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-tech/15 px-2 py-0.5 text-xs text-tech" title="Note suggérée par IA">
                              <Sparkles className="h-3 w-3" />{s.noteIA}
                            </span>
                          )}
                        </div>

                        {/* Détail replié */}
                        {isExpanded && (
                          <div className="space-y-2 border-t border-border p-3 text-xs">
                            {s.contenuTexte && (
                              <div>
                                <p className="mb-1 font-medium text-info">Contenu rendu</p>
                                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-foreground">
                                  {s.contenuTexte}
                                </div>
                              </div>
                            )}
                            {s.commentaireEtudiant && (
                              <div>
                                <p className="mb-1 font-medium text-secondary">Commentaire étudiant</p>
                                <p className="rounded bg-muted/40 p-2 text-muted-foreground">{s.commentaireEtudiant}</p>
                              </div>
                            )}
                            {s.commentaireEnseignant && (
                              <div>
                                <p className="mb-1 font-medium text-success-text">Votre commentaire</p>
                                <p className="rounded bg-muted/40 p-2 text-muted-foreground">{s.commentaireEnseignant}</p>
                              </div>
                            )}
                            {s.justificationIA && (
                              <div>
                                <p className="mb-1 inline-flex items-center gap-1 font-medium text-tech">
                                  <Sparkles className="h-3 w-3" />Justification IA
                                </p>
                                <p className="rounded bg-muted/40 p-2 text-muted-foreground">{s.justificationIA}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick grade inline */}
                        {(s.statut === 'SOUMIS' || s.statut === 'CORRIGE' || s.statut === 'RETOURNE') && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
                            {isQuickGrading ? (
                              <>
                                <div className="flex flex-1 items-center gap-2 px-1">
                                  <span className="text-xs text-muted-foreground">0</span>
                                  <Slider
                                    value={[quickGrade.value]} min={0} max={noteMax} step={0.5}
                                    onValueChange={(v) => quickGrade.setValue(v[0])}
                                    className="flex-1"
                                  />
                                  <span className="w-10 text-right text-xs font-bold text-warning font-mono tabular-nums">{quickGrade.value}/{noteMax}</span>
                                </div>
                                <Button size="sm" onClick={quickGrade.submit} disabled={quickGrade.isGrading}
                                  className="h-7 px-2 text-xs">
                                  {quickGrade.isGrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                                  OK
                                </Button>
                                <Button size="sm" variant="ghost"
                                  onClick={() => quickGrade.setId(null)}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:bg-accent">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost"
                                  onClick={() => { quickGrade.setId(s.id); quickGrade.setValue(s.note ?? Math.round(noteMax / 2)) }}
                                  className="h-7 px-2 text-xs text-warning hover:bg-warning/10">
                                  <Star className="mr-1 h-3.5 w-3.5" /> Noter
                                </Button>
                                <Button size="sm" variant="ghost"
                                  onClick={() => onOpenGrade(s)}
                                  className="h-7 px-2 text-xs text-primary-text hover:bg-primary/10">
                                  <MessageSquare className="mr-1 h-3.5 w-3.5" /> Détail
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Grade Dialog ───
function GradeDialog({
  open, onOpenChange, soumission, noteMax,
  gradeNote, setGradeNote, gradeCommentaire, setGradeCommentaire,
  isSubmitting, isAiGrading, onSubmit, onAiGrade,
}: {
  open: boolean; onOpenChange: (v: boolean) => void
  soumission: Soumission | null; noteMax: number
  gradeNote: string; setGradeNote: (v: string) => void
  gradeCommentaire: string; setGradeCommentaire: (v: string) => void
  isSubmitting: boolean; isAiGrading: boolean
  onSubmit: () => void; onAiGrade: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!min-h-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2 text-foreground">
            <GraduationCap className="h-5 w-5 text-primary-text" />
            Noter la soumission
          </DialogTitle>
          <DialogDescription>
            {soumission?.User?.name} — /{noteMax}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Note IA existante */}
          {soumission?.noteIA !== null && soumission?.noteIA !== undefined && (
            <div className="flex items-center gap-2 rounded-lg border border-tech/30 bg-tech/10 p-3 text-sm text-tech">
              <Sparkles className="h-4 w-4" />
              <span>Note suggérée par IA : <strong>{soumission.noteIA}/{noteMax}</strong></span>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-foreground font-medium">Note (sur {noteMax})</Label>
            <Input type="number" min={0} max={noteMax} step={0.5} value={gradeNote}
              onChange={(e) => setGradeNote(e.target.value)} />
          </div>

          {/* Commentaire */}
          <div className="space-y-1.5">
            <Label className="text-foreground font-medium">Commentaire (optionnel)</Label>
            <Textarea value={gradeCommentaire} onChange={(e) => setGradeCommentaire(e.target.value)}
              placeholder="Feedback pour l'étudiant..."
              rows={4} />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onAiGrade} disabled={isAiGrading}
            className="border-tech/30 text-tech hover:bg-tech/10">
            {isAiGrading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Évaluer par IA
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

