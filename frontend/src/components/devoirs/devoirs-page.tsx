'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

/** Classes néon par type de séance */
function typeSeanceClasses(type: string): { badge: string; dot: string; glow: string } {
  switch (type) {
    case 'CM':
      return { badge: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200', dot: 'bg-cyan-400', glow: 'ng-glow-cyan' }
    case 'TD':
      return { badge: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400', glow: 'ng-glow-emerald' }
    case 'TP':
      return { badge: 'border-amber-400/50 bg-amber-400/10 text-amber-200', dot: 'bg-amber-400', glow: 'ng-glow-amber' }
    default:
      return { badge: 'border-slate-400/50 bg-slate-400/10 text-slate-200', dot: 'bg-slate-400', glow: '' }
  }
}

function statutDevoirConfig(statut: StatutDevoir) {
  switch (statut) {
    case 'BROUILLON':
      return { icon: Edit3, label: 'Brouillon', badge: 'border-slate-400/40 bg-slate-400/10 text-slate-200' }
    case 'PUBLIE':
      return { icon: Send, label: 'Publié', badge: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200 ng-glow-cyan' }
    case 'FERME':
      return { icon: Lock, label: 'Fermé', badge: 'border-amber-400/50 bg-amber-400/10 text-amber-200' }
    case 'ARCHIVE':
      return { icon: Archive, label: 'Archivé', badge: 'border-violet-400/40 bg-violet-400/10 text-violet-200' }
    default:
      return { icon: Edit3, label: statut, badge: 'border-slate-400/40 bg-slate-400/10 text-slate-200' }
  }
}

function statutSoumissionConfig(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return { label: 'Brouillon', badge: 'border-slate-400/40 bg-slate-400/10 text-slate-200' }
    case 'SOUMIS':
      return { label: 'En attente', badge: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' }
    case 'CORRIGE':
      return { label: 'Corrigé', badge: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200 ng-glow-emerald' }
    case 'RETOURNE':
      return { label: 'Rendu', badge: 'border-violet-400/50 bg-violet-400/10 text-violet-200' }
    default:
      return { label: statut, badge: 'border-slate-400/40 bg-slate-400/10 text-slate-200' }
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

  // ─── Core state ───
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [stats, setStats] = useState<DevoirStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
  const [unitesEnseignement, setUnitesEnseignement] = useState<UniteEnseignement[]>([])

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

  // ─── AbortController pour fetch devoirs (corrige race condition) ───
  const abortRef = useRef<AbortController | null>(null)

  // ═══════════════════════════════════════
  //  DATA FETCHING
  // ═══════════════════════════════════════

  const fetchDevoirs = useCallback(async (silent = false) => {
    if (!user?.id) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (!silent) { setIsLoading(true); setLoadError(null) }
    try {
      const res = await fetch(`/api/devoirs?enseignantId=${user.id}`, { signal: controller.signal })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur serveur')
      }
      const data = await res.json()
      setDevoirs(data.devoirs ?? [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les devoirs')
      if (!silent) toast.error('Erreur de chargement', { description: 'Impossible de récupérer vos devoirs.' })
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [user?.id])

  const fetchStats = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/devoirs/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* non-bloquant */ }
  }, [user?.id])

  useEffect(() => {
    fetchDevoirs()
    fetchStats()
    return () => abortRef.current?.abort()
  }, [fetchDevoirs, fetchStats])

  useEffect(() => {
    const fetchUE = async () => {
      try {
        const res = await fetch('/api/unites-enseignement?actif=true')
        if (res.ok) {
          const data = await res.json()
          setUnitesEnseignement(data.unitesEnseignement ?? [])
        }
      } catch { /* non-bloquant */ }
    }
    fetchUE()
  }, [])

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
      await fetchDevoirs()
      await fetchStats()
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
      await fetchDevoirs()
      await fetchStats()
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
      await fetchDevoirs()
      await fetchStats()
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
      await fetchDevoirs()
      await fetchStats()
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
    <div className="ng-theme space-y-6">
      {/* ─── Header ─── */}
      <header className="ng-card ng-border-anim ds-kente-pattern relative overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-pink-500 ng-glow-cyan">
                <BookOpen className="h-7 w-7 text-white" />
              </div>
              <span className="absolute -right-1 -top-1 flex h-4 w-4">
                <span className="ng-live absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-cyan-400" />
              </span>
            </div>
            <div>
              <h1 className="ng-text-gradient font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Mes Devoirs
              </h1>
              <p className="mt-1 text-sm text-slate-300/70">
                Créez, gérez et corrigez vos devoirs TP/TD
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 px-2.5 py-1 text-cyan-200">
                  <Radio className="h-3 w-3 ng-live" />
                  {kpis.publies} actifs
                </span>
                {kpis.soumissionsEnAttente > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-200 ng-glow-amber">
                    <Clock className="h-3 w-3" />
                    {kpis.soumissionsEnAttente} à corriger
                  </span>
                )}
                {kpis.enRetard > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/15 px-2.5 py-1 text-rose-200 ng-glow-rose">
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
              onClick={() => { fetchDevoirs(); fetchStats() }}
              className="ng-focus border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
              aria-label="Rafraîchir"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Actualiser
            </Button>
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="ng-btn-primary ng-focus font-semibold"
              aria-label="Nouveau devoir"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nouveau devoir
            </Button>
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
        className="flex flex-wrap gap-1 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-1"
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
        <AlertDialogContent className="ng-theme !min-h-0 border-rose-400/40 bg-slate-950/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-200">Supprimer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300/70">
              Le devoir «&nbsp;{deleteTarget?.titre}&nbsp;» sera déplacé vers la corbeille. Vous pourrez le restaurer pendant 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ng-focus border-slate-500/40 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="ng-focus border border-rose-400/50 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicateTarget} onOpenChange={(v) => !v && setDuplicateTarget(null)}>
        <AlertDialogContent className="ng-theme !min-h-0 border-cyan-400/40 bg-slate-950/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cyan-200">Dupliquer le devoir ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300/70">
              Une copie de «&nbsp;{duplicateTarget?.titre}&nbsp;» sera créée en brouillon avec une échéance à J+7.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ng-focus border-slate-500/40 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDuplicate}
              className="ng-btn-primary ng-focus"
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
      className={`ng-focus inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4 ${
        active
          ? 'bg-gradient-to-r from-cyan-400 to-pink-500 text-white shadow-lg ng-glow-cyan'
          : 'text-slate-300/70 hover:bg-cyan-400/10 hover:text-cyan-100'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
          active ? 'bg-white/25 text-white' : 'bg-cyan-400/20 text-cyan-200'
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
              className={`ng-focus rounded-full px-3.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-400/80 to-pink-500/80 text-white ng-glow-cyan'
                  : 'border border-cyan-400/20 bg-cyan-400/5 text-slate-300/70 hover:bg-cyan-400/10 hover:text-cyan-100'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── Toolbar (search + filtres + tri) ─── */}
      <div className="ng-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/50" />
          <Input
            value={filters.searchInput}
            onChange={(e) => filters.setSearchInput(e.target.value)}
            placeholder="Rechercher par titre, UE..."
            className="ng-focus border-cyan-400/25 bg-slate-900/50 pl-8 text-slate-100 placeholder:text-slate-400/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.ueFilter} onValueChange={filters.setUeFilter}>
            <SelectTrigger className="ng-focus w-[180px] border-cyan-400/25 bg-slate-900/50 text-slate-200">
              <SelectValue placeholder="Toutes les UE" />
            </SelectTrigger>
            <SelectContent className="dark border-cyan-400/40">
              <SelectItem value="all">Toutes les UE</SelectItem>
              {unitesEnseignement.map((ue) => (
                <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.typeSeanceFilter} onValueChange={filters.setTypeSeanceFilter}>
            <SelectTrigger className="ng-focus w-[140px] border-cyan-400/25 bg-slate-900/50 text-slate-200">
              <SelectValue placeholder="Tous types" />
            </SelectTrigger>
            <SelectContent className="dark border-cyan-400/40">
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="CM">Cours magistral</SelectItem>
              <SelectItem value="TD">Travail dirigé</SelectItem>
              <SelectItem value="TP">Travaux pratiques</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-cyan-400/25 bg-slate-900/50">
            {(['dateLimite', 'titre', 'createdAt', 'noteMax'] as SortField[]).map((f) => (
              <button
                key={f}
                onClick={() => filters.handleCycleSort(f)}
                className={`ng-focus px-2.5 py-1.5 text-xs transition-colors ${
                  filters.sortField === f ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
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
              className="ng-focus text-slate-400 hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Erreur ─── */}
      {loadError && (
        <div className="ng-card flex items-center gap-3 border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* ─── Liste ─── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="ng-card h-56 p-4">
              <PulseSkeleton variant="card" className="h-full w-full" />
            </div>
          ))}
        </div>
      ) : devoirs.length === 0 ? (
        <div className="ng-card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200">
            <BookOpen className="h-8 w-8 ng-float" />
          </div>
          <h3 className="text-lg font-display tracking-tight font-semibold text-slate-100">
            {filters.hasActiveFilters ? 'Aucun devoir ne correspond' : 'Aucun devoir créé'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-300/60">
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
    <div
      className="ng-card ng-slide-up relative overflow-hidden p-4"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Bande colorée gauche selon type */}
      <div
        className={`absolute left-0 top-0 h-full w-1 ${typeCfg.dot}`}
        style={{ boxShadow: '0 0 10px currentColor' }}
        aria-hidden
      />

      <div className="pl-2">
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
            <h3 className="mt-2 truncate font-display tracking-tight font-semibold text-slate-50">{devoir.titre}</h3>
            <p className="mt-0.5 truncate text-xs text-slate-300/60">
              {devoir.UniteEnseignement?.code} — {devoir.UniteEnseignement?.nom}
            </p>
          </div>
        </div>

        {/* Description repliable */}
        {devoir.description && (
          <p className={`mt-2 text-xs text-slate-300/70 ${expanded ? '' : 'line-clamp-2'}`}>
            {devoir.description}
          </p>
        )}
        {devoir.description && devoir.description.length > 80 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ng-focus mt-1 text-xs text-cyan-300/70 hover:text-cyan-200"
          >
            {expanded ? 'Réduire' : 'Lire plus'}
          </button>
        )}

        {/* Deadline */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Clock className={`h-3.5 w-3.5 ${overdue ? 'text-rose-300' : time.urgent ? 'text-amber-300' : 'text-cyan-300'}`} />
          <span className="text-slate-300/60">{formatDateOnly(devoir.dateLimite)}</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
            overdue
              ? 'bg-rose-400/15 text-rose-200 ng-glow-rose'
              : time.urgent
              ? 'bg-amber-400/15 text-amber-200'
              : 'bg-cyan-400/15 text-cyan-200'
          }`}>
            {time.text}
          </span>
        </div>

        {/* Badges infos */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-300/60">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-300" />/{devoir.noteMax}
          </span>
          {!!devoir.renduFichiers && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3 text-cyan-300" />Fichiers
            </span>
          )}
          {devoir.soumissionGroupe && (
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3 w-3 text-pink-300" />Groupe
            </span>
          )}
          {devoir.GrilleEvaluation && (
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-3 w-3 text-violet-300" />Grille
            </span>
          )}
        </div>

        {/* Progression correction */}
        {soumCount > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-slate-300/70">
                <Users className="h-3 w-3" />
                {soumCount} soumission{soumCount > 1 ? 's' : ''}
              </span>
              <span className="text-cyan-200">{corrigeCount}/{soumCount} corrigée{soumCount > 1 ? 's' : ''}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/50">
              <div
                className="ng-progress h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-cyan-400/10 pt-3">
          <Button size="sm" variant="ghost"
            onClick={onViewSoumissions}
            className="ng-focus h-8 px-2.5 text-xs text-cyan-200 hover:bg-cyan-400/15"
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            {soumCount > 0 ? `${soumCount} soumission${soumCount > 1 ? 's' : ''}` : 'Soumissions'}
          </Button>

          {devoir.statut === 'BROUILLON' && (
            <>
              <Button size="sm" variant="ghost"
                onClick={() => onStatusAction(devoir.id, 'publier', 'Devoir publié')}
                className="ng-focus h-8 px-2.5 text-xs text-emerald-200 hover:bg-emerald-400/15"
                aria-label="Publier"
              >
                <Send className="mr-1 h-3.5 w-3.5" />Publier
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}
                className="ng-focus h-8 px-2.5 text-xs text-slate-200 hover:bg-slate-700/40"
                aria-label="Modifier"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {devoir.statut === 'PUBLIE' && (
            <Button size="sm" variant="ghost"
              onClick={() => onStatusAction(devoir.id, 'fermer', 'Devoir fermé')}
              className="ng-focus h-8 px-2.5 text-xs text-amber-200 hover:bg-amber-400/15"
              aria-label="Fermer"
            >
              <Lock className="mr-1 h-3.5 w-3.5" />Fermer
            </Button>
          )}
          {devoir.statut === 'FERME' && (
            <Button size="sm" variant="ghost"
              onClick={() => onStatusAction(devoir.id, 'archiver', 'Devoir archivé')}
              className="ng-focus h-8 px-2.5 text-xs text-violet-200 hover:bg-violet-400/15"
              aria-label="Archiver"
            >
              <Archive className="mr-1 h-3.5 w-3.5" />Archiver
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onDuplicate}
              className="ng-focus h-8 w-8 p-0 text-slate-300 hover:bg-cyan-400/15 hover:text-cyan-200"
              aria-label="Dupliquer"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {devoir.statut !== 'PUBLIE' && (
              <Button size="sm" variant="ghost" onClick={onDelete}
                className="ng-focus h-8 w-8 p-0 text-rose-300 hover:bg-rose-400/15"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis View ───
function AnalysisView({ stats, isLoading }: { stats: DevoirStats | null; isLoading: boolean }) {
  if (isLoading && !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ng-card h-64 p-4">
            <PulseSkeleton variant="card" className="h-full w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (!stats || stats.kpis.total === 0) {
    return (
      <div className="ng-card flex flex-col items-center justify-center p-12 text-center">
        <BarChart3 className="mb-3 h-12 w-12 text-cyan-300/50" />
        <p className="text-slate-300/70">Pas encore assez de données pour l'analyse.</p>
      </div>
    )
  }

  const maxType = Math.max(...stats.byType.map((t) => t.count), 1)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Répartition par type */}
      <div className="ng-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-cyan-300" />
          <h3 className="font-display tracking-tight font-semibold text-slate-50">Répartition par type</h3>
        </div>
        {stats.byType.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-300/50">Aucun devoir.</p>
        ) : (
          <div className="space-y-3">
            {stats.byType.map((t, i) => (
              <div key={t.type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-200">{t.label}</span>
                  <span className="font-bold text-cyan-200 font-mono tabular-nums">{t.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-700/50">
                  <div
                    className="ng-progress h-full rounded-full"
                    style={{ width: `${(t.count / maxType) * 100}%`, animationDelay: `${i * 60}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Soumissions par statut */}
      <div className="ng-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-pink-300" />
          <h3 className="font-display tracking-tight font-semibold text-slate-50">Soumissions par statut</h3>
        </div>
        {stats.soumissionsByStatut.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-300/50">Aucune soumission.</p>
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
      </div>

      {/* Timeline 7 jours */}
      <div className="ng-card p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-300" />
          <h3 className="font-display tracking-tight font-semibold text-slate-50">Soumissions reçues (7 jours)</h3>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={stats.timeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sousGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(34 211 238)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="rgb(34 211 238)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.1)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(186,230,253,0.6)', fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getDate()}/${d.getMonth() + 1}`
              }}
            />
            <YAxis tick={{ fill: 'rgba(186,230,253,0.6)', fontSize: 11 }} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(8,12,24,0.95)', border: '1px solid rgba(34,211,238,0.4)',
                borderRadius: '8px', color: '#e0f2fe',
              }}
              labelFormatter={(v) => new Date(v).toLocaleDateString('fr-FR')}
            />
            <Area type="monotone" dataKey="soumissions" name="Soumissions" stroke="rgb(34 211 238)" strokeWidth={2} fill="url(#sousGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
      <DialogContent className="ng-theme !min-h-0 ng-scroll max-h-[92vh] w-full overflow-y-auto border-cyan-400/30 bg-slate-950/95 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="ng-text-gradient text-xl">
            {editingDevoir ? 'Modifier le devoir' : 'Nouveau devoir'}
          </DialogTitle>
          <DialogDescription className="text-slate-300/60">
            {editingDevoir ? `Modification de « ${editingDevoir.titre} »` : 'Créez un nouveau devoir pour vos étudiants.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Titre */}
          <div className="space-y-1.5">
            <Label className="text-slate-200">Titre <span className="text-pink-300">*</span></Label>
            <Input value={form.formTitre} onChange={(e) => form.setFormTitre(e.target.value)}
              placeholder="Ex : TP Algorithmique - Tri rapide"
              className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-400/50" />
          </div>

          {/* UE + Type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-slate-200">Unité d'enseignement <span className="text-pink-300">*</span></Label>
              <Select value={form.formUniteEnseignementId} onValueChange={form.setFormUniteEnseignementId}>
                <SelectTrigger className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-200">
                  <SelectValue placeholder="Choisir une UE" />
                </SelectTrigger>
                <SelectContent className="dark border-cyan-400/40">
                  {unitesEnseignement.map((ue) => (
                    <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-200">Type de séance</Label>
              <Select value={form.formTypeSeance} onValueChange={form.setFormTypeSeance}>
                <SelectTrigger className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark border-cyan-400/40">
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
              <Label className="text-slate-200">Date limite <span className="text-pink-300">*</span></Label>
              <Input type="datetime-local" value={form.formDateLimite} onChange={(e) => form.setFormDateLimite(e.target.value)}
                className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-200">Publication (optionnel)</Label>
              <Input type="datetime-local" value={form.formDatePublication} onChange={(e) => form.setFormDatePublication(e.target.value)}
                className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
            </div>
          </div>

          {/* Note max + Description */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-slate-200">Note maximale</Label>
              <Input type="number" min={1} max={100} value={form.formNoteMax}
                onChange={(e) => form.setFormNoteMax(Number(e.target.value))}
                className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-slate-200">Description courte</Label>
              <Input value={form.formDescription} onChange={(e) => form.setFormDescription(e.target.value)}
                placeholder="Résumé du devoir..."
                className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-400/50" />
            </div>
          </div>

          {/* Consignes */}
          <div className="space-y-1.5">
            <Label className="text-slate-200">Consignes détaillées</Label>
            <Textarea value={form.formConsignes} onChange={(e) => form.setFormConsignes(e.target.value)}
              placeholder="Instructions, attendus, format de rendu..."
              rows={4}
              className="ng-focus ng-scroll border-cyan-400/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-400/50" />
          </div>

          {/* Paramètres avancés */}
          <div className="rounded-lg border border-cyan-400/20 bg-slate-900/30">
            <button
              onClick={() => form.setAdvancedSettingsOpen(!form.advancedSettingsOpen)}
              className="ng-focus flex w-full items-center justify-between p-3 text-sm font-medium text-cyan-200"
              aria-expanded={form.advancedSettingsOpen}
            >
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Paramètres avancés
              </span>
              {form.advancedSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {form.advancedSettingsOpen && (
              <div className="space-y-3 border-t border-cyan-400/20 p-3">
                {/* Fichiers */}
                <div className="flex items-center justify-between">
                  <Label className="inline-flex items-center gap-2 text-slate-200">
                    <Paperclip className="h-4 w-4 text-cyan-300" /> Rendu de fichiers
                  </Label>
                  <Switch checked={form.formRenduFichiers} onCheckedChange={form.setFormRenduFichiers} />
                </div>
                {form.formRenduFichiers && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Nb max fichiers</Label>
                      <Input type="number" min={1} value={form.formNbMaxFichiers}
                        onChange={(e) => form.setFormNbMaxFichiers(Number(e.target.value))}
                        className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Taille max (Mo)</Label>
                      <Input type="number" min={1} value={form.formTailleMaxFichier}
                        onChange={(e) => form.setFormTailleMaxFichier(Number(e.target.value))}
                        className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
                    </div>
                  </div>
                )}
                {/* Groupe */}
                <div className="flex items-center justify-between">
                  <Label className="inline-flex items-center gap-2 text-slate-200">
                    <UsersRound className="h-4 w-4 text-pink-300" /> Soumission en groupe
                  </Label>
                  <Switch checked={form.formSoumissionGroupe} onCheckedChange={form.setFormSoumissionGroupe} />
                </div>
                {/* Grille d'évaluation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="inline-flex items-center gap-2 text-slate-200">
                      <FileSpreadsheet className="h-4 w-4 text-violet-300" /> Grille d'évaluation
                    </Label>
                    <Button size="sm" variant="ghost" onClick={form.addCritere}
                      className="ng-focus h-7 px-2 text-xs text-cyan-200 hover:bg-cyan-400/15">
                      <PlusCircle className="mr-1 h-3.5 w-3.5" /> Critère
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.formGrilleCriteres.map((c, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1.5 rounded-md bg-slate-900/50 p-2">
                        <Input value={c.nom} placeholder="Nom du critère"
                          onChange={(e) => form.updateCritere(i, 'nom', e.target.value)}
                          className="ng-focus col-span-5 h-8 border-cyan-400/20 bg-slate-950/50 text-xs text-slate-100" />
                        <Input value={c.description} placeholder="Description"
                          onChange={(e) => form.updateCritere(i, 'description', e.target.value)}
                          className="ng-focus col-span-5 h-8 border-cyan-400/20 bg-slate-950/50 text-xs text-slate-100" />
                        <Input type="number" min={0} value={c.poids} placeholder="Poids"
                          onChange={(e) => form.updateCritere(i, 'poids', Number(e.target.value))}
                          className="ng-focus col-span-1 h-8 border-cyan-400/20 bg-slate-950/50 text-xs text-slate-100" />
                        <Button size="sm" variant="ghost"
                          onClick={() => form.removeCritere(i)}
                          disabled={form.formGrilleCriteres.length <= 1}
                          className="ng-focus col-span-1 h-8 w-full p-0 text-rose-300 hover:bg-rose-400/15"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="ng-focus border-slate-500/40 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60">
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}
            className="ng-btn-primary ng-focus">
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
      <SheetContent className="border-cyan-400/30 bg-slate-950/95 text-slate-100 ng-scroll w-full overflow-y-auto sm:max-w-3xl">
        {devoir && (
          <>
            <SheetHeader>
              <SheetTitle className="ng-text-gradient text-xl">{devoir.titre}</SheetTitle>
              <SheetDescription className="text-slate-300/60">
                {devoir.UniteEnseignement?.code} — {getTypeSeanceLabel(devoir.typeSeance)} — /{devoir.noteMax}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-4">
              {/* Stats rapides */}
              <div className="grid grid-cols-4 gap-2">
                <div className="ng-card p-2.5 text-center">
                  <p className="text-xs text-slate-300/60">Total</p>
                  <p className="text-xl font-bold text-slate-50 font-mono tabular-nums">{soumStats.total}</p>
                </div>
                <div className="ng-card p-2.5 text-center">
                  <p className="text-xs text-slate-300/60">En attente</p>
                  <p className="text-xl font-bold text-cyan-200 font-mono tabular-nums">{soumStats.enAttente}</p>
                </div>
                <div className="ng-card p-2.5 text-center">
                  <p className="text-xs text-slate-300/60">Corrigées</p>
                  <p className="text-xl font-bold text-emerald-200 font-mono tabular-nums">{soumStats.corrigees}</p>
                </div>
                <div className="ng-card p-2.5 text-center">
                  <p className="text-xs text-slate-300/60">Moyenne</p>
                  <p className="text-xl font-bold text-amber-200 font-mono tabular-nums">
                    {soumStats.avgNote !== null ? soumStats.avgNote.toFixed(1) : '—'}
                  </p>
                </div>
              </div>

              {/* Export */}
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={onExportCSV}
                  disabled={soumissions.length === 0}
                  className="ng-focus border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>

              {/* Liste */}
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="ng-card h-16 p-3">
                      <PulseSkeleton variant="card" className="h-full w-full" />
                    </div>
                  ))}
                </div>
              ) : soumissions.length === 0 ? (
                <div className="ng-card flex flex-col items-center justify-center p-8 text-center">
                  <Users className="mb-2 h-10 w-10 text-cyan-300/50" />
                  <p className="text-slate-300/70">Aucune soumission pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {soumissions.map((s) => {
                    const cfg = statutSoumissionConfig(s.statut)
                    const isExpanded = expandedId === s.id
                    const isQuickGrading = quickGrade.id === s.id
                    return (
                      <div key={s.id} className="ng-card overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : s.id)}
                            className="ng-focus text-slate-400 hover:text-cyan-200"
                            aria-label={isExpanded ? 'Réduire' : 'Développer'}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-100">
                              {s.User?.name}
                              {s.User?.matricule && (
                                <span className="ml-1.5 text-xs text-slate-400/60">({s.User.matricule})</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-300/50">
                              {s.renduAt ? formatDateTime(s.renduAt) : 'Non rendu'}
                            </p>
                          </div>
                          <Badge variant="outline" className={`border text-xs ${cfg.badge}`}>{cfg.label}</Badge>
                          {s.note !== null && (
                            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-200">
                              {s.note}/{noteMax}
                            </span>
                          )}
                          {s.noteIA !== null && s.noteIA !== undefined && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-xs text-violet-200" title="Note suggérée par IA">
                              <Sparkles className="h-3 w-3" />{s.noteIA}
                            </span>
                          )}
                        </div>

                        {/* Détail replié */}
                        {isExpanded && (
                          <div className="space-y-2 border-t border-cyan-400/15 p-3 text-xs">
                            {s.contenuTexte && (
                              <div>
                                <p className="mb-1 font-medium text-cyan-200">Contenu rendu</p>
                                <div className="ng-scroll max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-900/50 p-2 text-slate-200">
                                  {s.contenuTexte}
                                </div>
                              </div>
                            )}
                            {s.commentaireEtudiant && (
                              <div>
                                <p className="mb-1 font-medium text-pink-200">Commentaire étudiant</p>
                                <p className="rounded bg-slate-900/50 p-2 text-slate-300/80">{s.commentaireEtudiant}</p>
                              </div>
                            )}
                            {s.commentaireEnseignant && (
                              <div>
                                <p className="mb-1 font-medium text-emerald-200">Votre commentaire</p>
                                <p className="rounded bg-slate-900/50 p-2 text-slate-300/80">{s.commentaireEnseignant}</p>
                              </div>
                            )}
                            {s.justificationIA && (
                              <div>
                                <p className="mb-1 inline-flex items-center gap-1 font-medium text-violet-200">
                                  <Sparkles className="h-3 w-3" />Justification IA
                                </p>
                                <p className="rounded bg-slate-900/50 p-2 text-slate-300/80">{s.justificationIA}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick grade inline */}
                        {(s.statut === 'SOUMIS' || s.statut === 'CORRIGE' || s.statut === 'RETOURNE') && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-cyan-400/15 p-2">
                            {isQuickGrading ? (
                              <>
                                <div className="flex flex-1 items-center gap-2 px-1">
                                  <span className="text-xs text-slate-300/60">0</span>
                                  <Slider
                                    value={[quickGrade.value]} min={0} max={noteMax} step={0.5}
                                    onValueChange={(v) => quickGrade.setValue(v[0])}
                                    className="flex-1"
                                  />
                                  <span className="w-10 text-right text-xs font-bold text-amber-200 font-mono tabular-nums">{quickGrade.value}/{noteMax}</span>
                                </div>
                                <Button size="sm" onClick={quickGrade.submit} disabled={quickGrade.isGrading}
                                  className="ng-btn-primary ng-focus h-7 px-2 text-xs">
                                  {quickGrade.isGrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                                  OK
                                </Button>
                                <Button size="sm" variant="ghost"
                                  onClick={() => quickGrade.setId(null)}
                                  className="ng-focus h-7 px-2 text-xs text-slate-300 hover:bg-slate-700/40">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost"
                                  onClick={() => { quickGrade.setId(s.id); quickGrade.setValue(s.note ?? Math.round(noteMax / 2)) }}
                                  className="ng-focus h-7 px-2 text-xs text-amber-200 hover:bg-amber-400/15">
                                  <Star className="mr-1 h-3.5 w-3.5" /> Noter
                                </Button>
                                <Button size="sm" variant="ghost"
                                  onClick={() => onOpenGrade(s)}
                                  className="ng-focus h-7 px-2 text-xs text-cyan-200 hover:bg-cyan-400/15">
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
      <DialogContent className="ng-theme !min-h-0 border-cyan-400/30 bg-slate-950/95 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="ng-text-gradient text-xl flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-cyan-300" />
            Noter la soumission
          </DialogTitle>
          <DialogDescription className="text-slate-300/60">
            {soumission?.User?.name} — /{noteMax}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Note IA existante */}
          {soumission?.noteIA !== null && soumission?.noteIA !== undefined && (
            <div className="flex items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-400/10 p-3 text-sm text-violet-200">
              <Sparkles className="h-4 w-4" />
              <span>Note suggérée par IA : <strong>{soumission.noteIA}/{noteMax}</strong></span>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-slate-200">Note (sur {noteMax})</Label>
            <Input type="number" min={0} max={noteMax} step={0.5} value={gradeNote}
              onChange={(e) => setGradeNote(e.target.value)}
              className="ng-focus border-cyan-400/25 bg-slate-900/50 text-slate-100" />
          </div>

          {/* Commentaire */}
          <div className="space-y-1.5">
            <Label className="text-slate-200">Commentaire (optionnel)</Label>
            <Textarea value={gradeCommentaire} onChange={(e) => setGradeCommentaire(e.target.value)}
              placeholder="Feedback pour l'étudiant..."
              rows={4}
              className="ng-focus ng-scroll border-cyan-400/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-400/50" />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onAiGrade} disabled={isAiGrading}
            className="ng-focus border-violet-400/40 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20">
            {isAiGrading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Évaluer par IA
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="ng-focus border-slate-500/40 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60">
            Annuler
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}
            className="ng-btn-primary ng-focus">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

