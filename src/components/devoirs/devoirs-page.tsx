'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, BookOpen, Calendar, Edit3, Send, Trash2, Eye, Lock,
  Search, Filter, X, Loader2, FileText, Users, Star, Archive,
  Sparkles, Copy, Clock, Upload, BarChart3, TrendingUp, AlertCircle,
  ChevronDown, ChevronUp, Settings2, PlusCircle, MinusCircle,
  Timer, Paperclip, UsersRound, ArrowUpDown, Download, GripHorizontal,
  CheckCircle2, FileSpreadsheet, MessageSquare, GraduationCap,
  SlidersHorizontal, RotateCcw, Info
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'

// ═══════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════

interface UniteEnseignement {
  id: string
  code: string
  nom: string
  niveau: string
  filiere?: { id: string; nom: string; code?: string }
}

interface CritereGrille {
  nom: string
  description: string
  poids: number
}

interface Devoir {
  id: string
  titre: string
  description: string | null
  consignes: string | null
  uniteEnseignementId: string
  enseignantId: string
  typeSeance: string
  datePublication: string | null
  dateLimite: string
  noteMax: number
  renduFichiers: unknown
  soumissionGroupe: boolean
  nbMaxFichiers: number
  tailleMaxFichier: number
  statut: 'BROUILLON' | 'PUBLIE' | 'FERME' | 'ARCHIVE'
  anneeUniversitaire: string
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string }
  UniteEnseignement: { id: string; code: string; nom: string; niveau?: string }
  GrilleEvaluation: { id: string; criteres: unknown } | null
  soumissionCount?: number
  Soumission?: Soumission[]
}

interface Soumission {
  id: string
  devoirId: string
  etudiantId: string
  contenuTexte: string | null
  fichiersSoumis: unknown
  commentaireEtudiant: string | null
  statut: string
  renduAt: string | null
  note: number | null
  commentaireEnseignant: string | null
  noteIA: number | null
  justificationIA: string | null
  rapportPlagiat: unknown
  historiqueVersions: unknown
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string; matricule?: string }
}

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
  return { CM: 'Cours Magistral', TD: 'Travail Dirigé', TP: 'Travail Pratique' }[type] ?? type
}

function getTypeSeanceShortLabel(type: string): string {
  return { CM: 'CM', TD: 'TD', TP: 'TP' }[type] ?? type
}

function getTypeSeanceClasses(type: string): string {
  return {
    CM: 'border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/20',
    TD: 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20',
    TP: 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
  }[type] ?? 'border-l-gray-400 bg-gray-50/40 dark:bg-gray-950/20'
}

function getTypeSeanceBadgeClasses(type: string): string {
  return {
    CM: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
    TD: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    TP: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  }[type] ?? 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800'
}

function getStatutDevoirBadge(statut: string) {
  const config = {
    BROUILLON: { icon: Edit3, label: 'Brouillon', classes: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
    PUBLIE: { icon: Send, label: 'Publié', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800' },
    FERME: { icon: Lock, label: 'Fermé', classes: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800' },
    ARCHIVE: { icon: Archive, label: 'Archivé', classes: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700' },
  }[statut]
  if (!config) return <Badge variant="outline">{statut}</Badge>
  const Icon = config.icon
  return <Badge variant="outline" className={`gap-1 ${config.classes}`}><Icon className="h-3 w-3" />{config.label}</Badge>
}

function getStatutSoumissionBadge(statut: string) {
  const config = {
    BROUILLON: { label: 'Brouillon', classes: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
    SOUMIS: { label: 'Soumis', classes: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800' },
    CORRIGE: { label: 'Corrigé', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800' },
    RETOURNE: { label: 'Retourné', classes: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800' },
  }[statut]
  if (!config) return <Badge variant="outline">{statut}</Badge>
  return <Badge variant="outline" className={`gap-1 ${config.classes}`}>{config.label}</Badge>
}

function toLocalDatetimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    // Use the ISO string and strip timezone for datetime-local input
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function generateCSV(devoir: Devoir, soumissions: Soumission[]): string {
  const header = ['Étudiant', 'Matricule', 'Email', 'Statut', 'Date de rendu', `Note (/${devoir.noteMax})`, 'Commentaire']
  const rows = soumissions.map(s => [
    s.User?.name ?? '',
    s.User?.matricule ?? '',
    s.User?.email ?? '',
    s.statut,
    s.renduAt ? formatDateTime(s.renduAt) : '',
    s.note !== null ? String(s.note) : '',
    s.commentaireEnseignant ?? '',
  ])
  const csvContent = [header, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  return '\uFEFF' + csvContent // BOM for Excel UTF-8
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════

export function DevoirsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Core state ───
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ─── UI filters ───
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [ueFilter, setUeFilter] = useState<string>('all')
  const [typeSeanceFilter, setTypeSeanceFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('dateLimite')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  // ─── Soumissions dialog ───
  const [soumissionsDialogOpen, setSoumissionsDialogOpen] = useState(false)
  const [selectedDevoirForSoumissions, setSelectedDevoirForSoumissions] = useState<Devoir | null>(null)
  const [soumissions, setSoumissions] = useState<Soumission[]>([])
  const [isLoadingSoumissions, setIsLoadingSoumissions] = useState(false)
  const [soumissionSortField, setSoumissionSortField] = useState<string>('renduAt')
  const [soumissionSortDir, setSoumissionSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedSoumissionId, setExpandedSoumissionId] = useState<string | null>(null)

  // ─── Quick grade (inline in soumissions table) ───
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
  //  DATA FETCHING
  // ═══════════════════════════════════════

  const fetchDevoirs = useCallback(async () => {
    if (!user?.id) return
    setLoadError(null)
    try {
      const res = await fetch(`/api/devoirs?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setDevoirs(data.devoirs ?? [])
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur serveur')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les devoirs')
      toast.error('Erreur de chargement', {
        description: 'Impossible de récupérer vos devoirs. Vérifiez votre connexion.',
      })
    }
  }, [user?.id])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchDevoirs()
      setIsLoading(false)
    }
    load()
  }, [fetchDevoirs])

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
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
        case 'titre':
          aVal = a.titre.toLowerCase(); bVal = b.titre.toLowerCase()
          break
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime()
          break
        case 'noteMax':
          aVal = a.noteMax; bVal = b.noteMax
          break
        case 'dateLimite':
        default:
          aVal = new Date(a.dateLimite).getTime(); bVal = new Date(b.dateLimite).getTime()
          break
      }
      return sortDir === 'asc'
        ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
        : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0)
    })

    return result
  }, [devoirs, tabStatut, ueFilter, typeSeanceFilter, searchQuery, sortField, sortDir])

  // ═══════════════════════════════════════
  //  STATISTICS
  // ═══════════════════════════════════════

  const stats = useMemo(() => {
    const brouillons = devoirs.filter(d => d.statut === 'BROUILLON').length
    const publies = devoirs.filter(d => d.statut === 'PUBLIE').length
    const fermes = devoirs.filter(d => d.statut === 'FERME').length
    const archives = devoirs.filter(d => d.statut === 'ARCHIVE').length
    const totalSoumissions = devoirs.reduce((sum, d) => sum + (d.soumissionCount ?? d.Soumission?.length ?? 0), 0)
    const totalCorrigees = devoirs.reduce((sum, d) => {
      const soum = d.Soumission ?? []
      return sum + soum.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length
    }, 0)
    const enRetard = devoirs.filter(d => d.statut === 'PUBLIE' && isOverdue(d.dateLimite)).length
    return { brouillons, publies, fermes, archives, total: devoirs.length, totalSoumissions, totalCorrigees, enRetard }
  }, [devoirs])

  const soumStats = useMemo(() => {
    const corrigees = soumissions.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE')
    const notes = corrigees.filter(s => s.note !== null).map(s => s.note!)
    return {
      total: soumissions.length,
      soumis: soumissions.filter(s => s.statut === 'SOUMIS').length,
      corriges: corrigees.length,
      notes,
      avgNote: notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null,
      minNote: notes.length > 0 ? Math.min(...notes) : null,
      maxNote: notes.length > 0 ? Math.max(...notes) : null,
    }
  }, [soumissions])

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
        const parsed = typeof devoir.GrilleEvaluation.criteres === 'string'
          ? JSON.parse(devoir.GrilleEvaluation.criteres)
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
        titre: formTitre,
        description: formDescription || null,
        consignes: formConsignes || null,
        uniteEnseignementId: formUniteEnseignementId,
        enseignantId: user.id,
        typeSeance: formTypeSeance,
        datePublication: formDatePublication || null,
        dateLimite: formDateLimite,
        noteMax: formNoteMax,
        renduFichiers: formRenduFichiers || null,
        soumissionGroupe: formSoumissionGroupe,
        nbMaxFichiers: formNbMaxFichiers,
        tailleMaxFichier: formTailleMaxFichier * 1048576,
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
          await fetch(grilleUrl, { method: grilleMethod, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(existingGrille ? { criteres: validCriteres } : { devoirId, criteres: validCriteres }) })
        } catch { /* grille save non-bloquante */ }
      }

      toast.success(editingDevoir ? 'Devoir mis à jour' : 'Devoir créé', {
        description: `"${formTitre}" ${editingDevoir ? 'modifié' : 'créé'} avec succès.`,
      })
      setFormDialogOpen(false)
      resetForm()
      await fetchDevoirs()
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
      await fetchDevoirs()
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
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Suppression impossible.' })
    }
  }

  const handleDuplicate = async () => {
    if (!duplicateTarget || !user?.id) return
    try {
      const body = {
        titre: `${duplicateTarget.titre} (copie)`,
        description: duplicateTarget.description,
        consignes: duplicateTarget.consignes,
        uniteEnseignementId: duplicateTarget.uniteEnseignementId,
        enseignantId: user.id,
        typeSeance: duplicateTarget.typeSeance,
        dateLimite: '',
        noteMax: duplicateTarget.noteMax,
        renduFichiers: duplicateTarget.renduFichiers,
        soumissionGroupe: duplicateTarget.soumissionGroupe,
        nbMaxFichiers: duplicateTarget.nbMaxFichiers,
        tailleMaxFichier: duplicateTarget.tailleMaxFichier,
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
      if (duplicateTarget.GrilleEvaluation?.criteres && result.devoir?.id) {
        try {
          await fetch('/api/grilles-evaluation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ devoirId: result.devoir.id, criteres: duplicateTarget.GrilleEvaluation.criteres }),
          })
        } catch { /* non-bloquant */ }
      }
      toast.success('Devoir dupliqué', {
        description: `"${duplicateTarget.titre} (copie)" créé en brouillon. Pensez à définir une date limite.`,
      })
      setDuplicateTarget(null)
      await fetchDevoirs()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Duplication impossible.' })
    }
  }

  // ═══════════════════════════════════════
  //  SOUMISSIONS
  // ═══════════════════════════════════════

  const handleViewSoumissions = async (devoir: Devoir) => {
    setSelectedDevoirForSoumissions(devoir)
    setSoumissionsDialogOpen(true)
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
      try {
        const res = await fetch(`/api/soumissions?devoirId=${devoir.id}`)
        if (res.ok) {
          const data = await res.json()
          setSoumissions(data.soumissions ?? [])
        }
      } catch { /* fallback */ }
    } finally {
      setIsLoadingSoumissions(false)
    }
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  const toggleSoumissionSort = (field: string) => {
    setSoumissionSortField(prev => prev === field ? prev : field)
    setSoumissionSortDir(prev => soumissionSortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc')
  }

  const getSortIcon = (field: string) =>
    soumissionSortField === field
      ? (soumissionSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
      : null

  const sortedSoumissions = useMemo(() => {
    return [...soumissions].sort((a, b) => {
      let aVal: string | number | null = '', bVal: string | number | null = ''
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
      setSortField(field)
      setSortDir('asc')
    }
  }

  const resetFilters = () => {
    setActiveTab('all')
    setUeFilter('all')
    setTypeSeanceFilter('all')
    setSearchQuery('')
    setSortField('dateLimite')
    setSortDir('desc')
  }

  const hasActiveFilters = activeTab !== 'all' || ueFilter !== 'all' || typeSeanceFilter !== 'all' || searchQuery.trim() !== ''

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            Mes Devoirs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez, gérez et corrigez vos devoirs TP/TD
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 shadow-sm" size="lg" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Nouveau devoir
              </Button>
            </TooltipTrigger>
            <TooltipContent>Créer un nouveau devoir</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ─── Stats Bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {[
          { label: 'Brouillons', value: stats.brouillons, icon: Edit3, color: 'text-gray-500 bg-gray-100 dark:bg-gray-800', border: 'border-l-gray-400' },
          { label: 'Publiés', value: stats.publies, icon: Send, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30', border: 'border-l-emerald-500', extra: stats.enRetard > 0 ? `${stats.enRetard} en retard` : null },
          { label: 'Fermés', value: stats.fermes, icon: Lock, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', border: 'border-l-amber-500' },
          { label: 'Soumissions', value: stats.totalSoumissions, icon: Users, color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/30', border: 'border-l-sky-500', extra: stats.totalSoumissions > 0 ? `${stats.totalCorrigees} corrigées` : null },
          { label: 'Total', value: stats.total, icon: BookOpen, color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/30', border: 'border-l-teal-500', className: 'col-span-2 sm:col-span-1' },
        ].map((stat, i) => (
          <Card key={i} className={`border-l-4 ${stat.border} ${stat.className || ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  {stat.extra && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{stat.extra}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Tabs + Filters ─── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList className="h-9">
              {Object.entries(TAB_FILTERS).map(([key, { label }]) => (
                <TabsTrigger key={key} value={key} className="text-xs px-3">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Select value={sortField} onValueChange={(v) => handleCycleSort(v as SortField)}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dateLimite">Date limite</SelectItem>
                <SelectItem value="titre">Titre</SelectItem>
                <SelectItem value="createdAt">Date création</SelectItem>
                <SelectItem value="noteMax">Note max</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
            >
              {sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un devoir..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {unitesEnseignement.length > 0 && (
              <Select value={ueFilter} onValueChange={setUeFilter}>
                <SelectTrigger className="h-9 w-[180px] text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Toutes les UE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les UE</SelectItem>
                  {unitesEnseignement.map(ue => (
                    <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={typeSeanceFilter} onValueChange={setTypeSeanceFilter}>
              <SelectTrigger className="h-9 w-[110px] text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                <SelectItem value="TD">TD</SelectItem>
                <SelectItem value="TP">TP</SelectItem>
                <SelectItem value="CM">CM</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={resetFilters}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-l-4 border-l-gray-200 dark:border-l-gray-800">
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-48 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-muted" />
                </div>
                <div className="h-3 w-full rounded bg-muted" />
                <div className="flex gap-4">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="flex gap-2 pt-2">
                  <div className="h-8 w-24 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Error state ─── */}
      {!isLoading && loadError && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 py-12">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <h3 className="mt-4 text-lg font-semibold">Erreur de chargement</h3>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">{loadError}</p>
          <Button variant="outline" className="mt-4" onClick={() => fetchDevoirs()}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Réessayer
          </Button>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !loadError && devoirs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun devoir</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore créé de devoir. Commencez dès maintenant.
          </p>
          <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Créer un devoir
          </Button>
        </div>
      )}

      {/* ─── Empty filtered state ─── */}
      {!isLoading && !loadError && devoirs.length > 0 && filteredDevoirs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
          <Search className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Aucun résultat</h3>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
            Aucun devoir ne correspond à vos filtres dans l&apos;onglet «&nbsp;{TAB_FILTERS[activeTab].label}&nbsp;».
          </p>
          <Button variant="outline" className="mt-4" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Réinitialiser les filtres
          </Button>
        </div>
      )}

      {/* ─── Devoirs Grid ─── */}
      {!isLoading && !loadError && filteredDevoirs.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {filteredDevoirs.length} devoir{filteredDevoirs.length > 1 ? 's' : ''} trouvé{filteredDevoirs.length > 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredDevoirs.map((devoir) => {
              const soumissionCount = devoir.soumissionCount ?? devoir.Soumission?.length ?? 0
              const overdue = isOverdue(devoir.dateLimite)
              const timeInfo = getTimeRemaining(devoir.dateLimite)
              const hasGrille = !!devoir.GrilleEvaluation
              const correctedCount = (devoir.Soumission ?? []).filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length

              return (
                <Card
                  key={devoir.id}
                  className={`group border-l-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                    overdue && devoir.statut !== 'BROUILLON'
                      ? 'border-l-red-500 bg-red-50/30 dark:bg-red-950/10'
                      : getTypeSeanceClasses(devoir.typeSeance)
                  }`}
                >
                  <CardContent className="flex flex-col gap-4 p-5">
                    {/* Top row: Title + Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold leading-tight truncate">{devoir.titre}</h3>
                          {overdue && devoir.statut !== 'BROUILLON' && (
                            <Badge variant="outline" className="gap-1 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 shrink-0">
                              <AlertCircle className="h-3 w-3" />Échu
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {devoir.UniteEnseignement?.code} — {devoir.UniteEnseignement?.nom}
                        </p>
                        {devoir.description && (
                          <p className="mt-1.5 text-xs text-muted-foreground/70 line-clamp-1">
                            {devoir.description}
                          </p>
                        )}
                      </div>
                      {getStatutDevoirBadge(devoir.statut)}
                    </div>

                    {/* Deadline + time info */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className={`flex items-center gap-1.5 text-sm ${overdue && devoir.statut !== 'BROUILLON' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateOnly(devoir.dateLimite)}
                      </span>
                      {devoir.statut === 'PUBLIE' && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${timeInfo.urgent ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          <Timer className="h-3 w-3" />
                          {timeInfo.text}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Créé {formatDateOnly(devoir.createdAt)}
                      </span>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className={`gap-1 text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}>
                        {getTypeSeanceShortLabel(devoir.typeSeance)}
                      </Badge>
                      <Badge variant="secondary" className="gap-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        <Star className="h-3 w-3" />{devoir.noteMax} pts
                      </Badge>
                      {devoir.renduFichiers && (
                        <Badge variant="secondary" className="gap-1 text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                          <Paperclip className="h-3 w-3" />Fichiers
                        </Badge>
                      )}
                      {devoir.soumissionGroupe && (
                        <Badge variant="secondary" className="gap-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                          <UsersRound className="h-3 w-3" />Groupe
                        </Badge>
                      )}
                      {hasGrille && (
                        <Badge variant="secondary" className="gap-1 text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                          <BarChart3 className="h-3 w-3" />Grille
                        </Badge>
                      )}
                      {soumissionCount > 0 ? (
                        <Badge variant="secondary" className="gap-1 text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          <Users className="h-3 w-3" />{soumissionCount} soumission{soumissionCount > 1 ? 's' : ''}
                        </Badge>
                      ) : devoir.statut !== 'BROUILLON' ? (
                        <Badge variant="secondary" className="gap-1 text-xs bg-gray-50 text-gray-400 dark:bg-gray-900/20 dark:text-gray-500">
                          <Users className="h-3 w-3" />Aucune soumission
                        </Badge>
                      ) : null}
                    </div>

                    {/* Correction progress */}
                    {devoir.statut !== 'BROUILLON' && soumissionCount > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Correction</span>
                          <span className="font-medium">{correctedCount}/{soumissionCount}</span>
                        </div>
                        <Progress value={soumissionCount > 0 ? (correctedCount / soumissionCount) * 100 : 0} className="h-1.5" />
                      </div>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {devoir.statut === 'BROUILLON' && (
                        <TooltipProvider>
                          <Button variant="outline" size="sm" onClick={() => handleOpenEdit(devoir)}
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950">
                            <Edit3 className="h-3.5 w-3.5" />Modifier
                          </Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                            onClick={() => handleStatusAction(devoir.id, 'publier', 'Devoir publié')}>
                            <Send className="h-3.5 w-3.5" />Publier
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setDuplicateTarget(devoir)}><Copy className="h-3.5 w-3.5" /></Button>
                            </TooltipTrigger>
                            <TooltipContent>Dupliquer</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm"
                                className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                                onClick={() => setDeleteTarget(devoir)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Supprimer</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {devoir.statut === 'PUBLIE' && (
                        <TooltipProvider>
                          <Button variant="outline" size="sm"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleViewSoumissions(devoir)}>
                            <Eye className="h-3.5 w-3.5" />Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                          </Button>
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 shadow-sm"
                            onClick={() => handleStatusAction(devoir.id, 'fermer', 'Devoir fermé')}>
                            <Lock className="h-3.5 w-3.5" />Fermer
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setDuplicateTarget(devoir)}><Copy className="h-3.5 w-3.5" /></Button>
                            </TooltipTrigger>
                            <TooltipContent>Dupliquer</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {devoir.statut === 'FERME' && (
                        <TooltipProvider>
                          <Button variant="outline" size="sm"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleViewSoumissions(devoir)}>
                            <Eye className="h-3.5 w-3.5" />Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                          </Button>
                          <Button variant="outline" size="sm"
                            className="border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
                            onClick={() => handleStatusAction(devoir.id, 'archiver', 'Devoir archivé')}>
                            <Archive className="h-3.5 w-3.5" />Archiver
                          </Button>
                        </TooltipProvider>
                      )}
                      {devoir.statut === 'ARCHIVE' && (
                        <Button variant="outline" size="sm"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          onClick={() => handleViewSoumissions(devoir)}>
                          <Eye className="h-3.5 w-3.5" />Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          CREATE/EDIT DIALOG
          ═══════════════════════════════════════ */}
      <Dialog open={formDialogOpen} onOpenChange={(open) => { if (!open) { setFormDialogOpen(false); resetForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              {editingDevoir ? 'Modifier le devoir' : 'Nouveau devoir'}
            </DialogTitle>
            <DialogDescription>
              {editingDevoir ? 'Modifiez les paramètres du devoir.' : 'Créez un nouveau devoir pour vos étudiants.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-6">
              {/* Section 1: Informations générales */}
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Info className="h-4 w-4" />Informations générales
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="devoir-titre">Titre <span className="text-red-500">*</span></Label>
                    <Input id="devoir-titre" placeholder="Ex: TP3 - Algorithmes de tri" value={formTitre} onChange={(e) => setFormTitre(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="devoir-description">Description</Label>
                    <Textarea id="devoir-description" placeholder="Objectifs et contenu du devoir..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="devoir-ue">Unité d&apos;enseignement <span className="text-red-500">*</span></Label>
                      <Select value={formUniteEnseignementId} onValueChange={setFormUniteEnseignementId}>
                        <SelectTrigger id="devoir-ue"><SelectValue placeholder="Sélectionner une UE" /></SelectTrigger>
                        <SelectContent>
                          {unitesEnseignement.map(ue => (
                            <SelectItem key={ue.id} value={ue.id}>{ue.code} — {ue.nom}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="devoir-type">Type de séance</Label>
                      <Select value={formTypeSeance} onValueChange={setFormTypeSeance}>
                        <SelectTrigger id="devoir-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CM">CM — Cours Magistral</SelectItem>
                          <SelectItem value="TD">TD — Travail Dirigé</SelectItem>
                          <SelectItem value="TP">TP — Travail Pratique</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Dates et notation */}
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Calendar className="h-4 w-4" />Dates & Notation
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="devoir-date-limite">Date limite <span className="text-red-500">*</span></Label>
                    <Input id="devoir-date-limite" type="datetime-local" value={formDateLimite} onChange={(e) => setFormDateLimite(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="devoir-note-max">Note maximale</Label>
                    <Input id="devoir-note-max" type="number" min={1} max={100} value={formNoteMax} onChange={(e) => setFormNoteMax(parseFloat(e.target.value) || 20)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="devoir-date-publication">Date de publication (optionnel)</Label>
                  <Input id="devoir-date-publication" type="datetime-local" value={formDatePublication} onChange={(e) => setFormDatePublication(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Laissez vide pour publier manuellement. Si définie, publication automatique à cette date.</p>
                </div>
              </div>

              {/* Section 3: Consignes */}
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <FileText className="h-4 w-4" />Consignes
                </div>
                <Textarea id="devoir-consignes" placeholder="Instructions spécifiques pour les étudiants..." value={formConsignes} onChange={(e) => setFormConsignes(e.target.value)} rows={4} />
              </div>

              {/* Section 4: Paramètres avancés */}
              <Collapsible open={advancedSettingsOpen} onOpenChange={setAdvancedSettingsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Paramètres avancés</span>
                    {advancedSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {/* Rendu fichiers */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-sky-600" />
                        <Label className="text-sm font-medium">Rendu de fichiers</Label>
                      </div>
                      <Switch checked={formRenduFichiers} onCheckedChange={setFormRenduFichiers} />
                    </div>
                    {formRenduFichiers && (
                      <div className="grid grid-cols-2 gap-4 pl-6">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nb max fichiers</Label>
                          <Input type="number" min={1} max={20} value={formNbMaxFichiers} onChange={(e) => setFormNbMaxFichiers(parseInt(e.target.value) || 5)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Taille max (Mo)</Label>
                          <Input type="number" min={1} max={100} value={formTailleMaxFichier} onChange={(e) => setFormTailleMaxFichier(parseInt(e.target.value) || 10)} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Groupe */}
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-purple-600" />
                        <div>
                          <Label className="text-sm font-medium">Soumission en groupe</Label>
                          <p className="text-xs text-muted-foreground">Permettre les rendus en groupe</p>
                        </div>
                      </div>
                      <Switch checked={formSoumissionGroupe} onCheckedChange={setFormSoumissionGroupe} />
                    </div>
                  </div>

                  {/* Grille d'évaluation */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-teal-600" />
                      <Label className="text-sm font-medium">Grille d&apos;évaluation</Label>
                    </div>
                    <div className="space-y-3">
                      {formGrilleCriteres.map((critere, index) => (
                        <div key={index} className="flex gap-2 items-start rounded-lg border bg-muted/30 p-3">
                          <div className="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_80px]">
                            <Input placeholder="Nom du critère" value={critere.nom} onChange={(e) => updateCritere(index, 'nom', e.target.value)} className="text-sm" />
                            <Input placeholder="Description" value={critere.description} onChange={(e) => updateCritere(index, 'description', e.target.value)} className="text-sm" />
                            <div className="flex items-center gap-1">
                              <Input type="number" min={0} max={100} value={critere.poids} onChange={(e) => updateCritere(index, 'poids', parseFloat(e.target.value) || 1)} className="text-sm" />
                              <span className="text-xs text-muted-foreground">pts</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeCritere(index)} disabled={formGrilleCriteres.length <= 1} className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addCritere} className="w-full border-dashed">
                        <PlusCircle className="h-4 w-4" />Ajouter un critère
                      </Button>
                    </div>
                    {formGrilleCriteres.some(c => c.nom.trim()) && (() => {
                      const total = formGrilleCriteres.filter(c => c.nom.trim()).reduce((sum, c) => sum + c.poids, 0)
                      return (
                        <div className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                          Total grille : {total} pts
                          {total !== formNoteMax && (
                            <span className="text-amber-600 ml-2">(≠ note max : {formNoteMax} pts)</span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => { setFormDialogOpen(false); resetForm() }}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingDevoir ? 'Mettre à jour' : 'Créer le devoir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════
          DELETE CONFIRMATION
          ═══════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />Déplacer vers la corbeille ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.titre}&quot; sera déplacé vers la corbeille. Restaurable pendant 30 jours.
              {deleteTarget?.statut === 'PUBLIE' && (
                <span className="block mt-2 text-red-500 font-medium">⚠️ Un devoir publié doit d&apos;abord être fermé.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={deleteTarget?.statut === 'PUBLIE'}>
              <Trash2 className="h-4 w-4 mr-1" />Déplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════
          DUPLICATE CONFIRMATION
          ═══════════════════════════════════════ */}
      <AlertDialog open={!!duplicateTarget} onOpenChange={(open) => { if (!open) setDuplicateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-emerald-500" />Dupliquer ce devoir ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Une copie de &quot;{duplicateTarget?.titre}&quot; sera créée en brouillon (grille d&apos;évaluation incluse si présente). Pensez à définir une nouvelle date limite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicate} className="bg-emerald-600 hover:bg-emerald-700">
              <Copy className="h-4 w-4 mr-1" />Dupliquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════
          SOUMISSIONS DIALOG
          ═══════════════════════════════════════ */}
      <Dialog open={soumissionsDialogOpen} onOpenChange={(open) => {
        if (!open) { setSoumissionsDialogOpen(false); setSelectedDevoirForSoumissions(null); setSoumissions([]); setExpandedSoumissionId(null); setQuickGradeSoumissionId(null) }
      }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
              Soumissions — {selectedDevoirForSoumissions?.titre}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3 flex-wrap">
              <span>{selectedDevoirForSoumissions?.UniteEnseignement?.code} — {selectedDevoirForSoumissions?.UniteEnseignement?.nom}</span>
              <span>·</span>
              <span>{getTypeSeanceLabel(selectedDevoirForSoumissions?.typeSeance ?? 'TD')}</span>
              <span>·</span>
              <span>{selectedDevoirForSoumissions?.noteMax} pts</span>
              {!isLoadingSoumissions && soumissions.length > 0 && (
                <>
                  <span>·</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportCSV}>
                    <Download className="h-3 w-3 mr-1" />Exporter CSV
                  </Button>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Stats mini */}
          {!isLoadingSoumissions && soumissions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Total', value: soumStats.total, color: '' },
                { label: 'À corriger', value: soumStats.soumis, color: 'text-sky-600' },
                { label: 'Corrigées', value: soumStats.corriges, color: 'text-emerald-600' },
                { label: 'Moyenne', value: soumStats.avgNote !== null ? `${soumStats.avgNote.toFixed(1)}/${selectedDevoirForSoumissions?.noteMax ?? 20}` : '—', color: 'text-amber-600' },
              ].map((s, i) => (
                <div key={i} className="rounded-lg border p-2.5 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {!isLoadingSoumissions && soumissions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progression correction</span>
                <span className="font-medium">{soumStats.corriges}/{soumStats.total} ({Math.round((soumStats.corriges / soumStats.total) * 100)}%)</span>
              </div>
              <Progress value={(soumStats.corriges / soumStats.total) * 100} className="h-2" />
            </div>
          )}

          {/* Soumissions table */}
          <div className="flex-1 overflow-auto">
            {isLoadingSoumissions ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : soumissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Users className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Aucune soumission</h3>
                <p className="mt-1 text-sm text-muted-foreground">Les étudiants n&apos;ont pas encore soumis de réponse.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('name')}>
                      <span className="flex items-center gap-1">Étudiant {getSortIcon('name')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('statut')}>
                      <span className="flex items-center gap-1">Statut {getSortIcon('statut')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('renduAt')}>
                      <span className="flex items-center gap-1">Rendu {getSortIcon('renduAt')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('note')}>
                      <span className="flex items-center gap-1">Note {getSortIcon('note')}</span>
                    </TableHead>
                    <TableHead>IA</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSoumissions.map((soumission) => (
                    <>
                      <TableRow key={soumission.id} className="group">
                        <TableCell>
                          <button
                            className="text-left hover:underline cursor-pointer"
                            onClick={() => setExpandedSoumissionId(expandedSoumissionId === soumission.id ? null : soumission.id)}
                          >
                            <p className="font-medium text-sm">{soumission.User?.name}</p>
                            <p className="text-xs text-muted-foreground">{soumission.User?.matricule || soumission.User?.email}</p>
                          </button>
                        </TableCell>
                        <TableCell>{getStatutSoumissionBadge(soumission.statut)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {soumission.renduAt ? formatDateTime(soumission.renduAt) : '—'}
                        </TableCell>
                        <TableCell>
                          {soumission.note !== null ? (
                            <Badge variant="outline" className={`font-bold ${
                              soumission.note >= (selectedDevoirForSoumissions?.noteMax ?? 20) / 2
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300'
                            }`}>
                              {soumission.note.toFixed(1)}/{selectedDevoirForSoumissions?.noteMax ?? 20}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {soumission.noteIA !== null ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="gap-1 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300">
                                    <Sparkles className="h-3 w-3" />{soumission.noteIA.toFixed(1)}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="font-medium mb-1">Évaluation IA</p>
                                  <p className="text-xs whitespace-pre-wrap">{soumission.justificationIA || 'Pas de justification'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            {/* Quick grade slider */}
                            {quickGradeSoumissionId === soumission.id ? (
                              <div className="flex items-center gap-2">
                                <div className="w-[120px]">
                                  <Slider
                                    value={[quickGradeValue]}
                                    onValueChange={([v]) => setQuickGradeValue(v)}
                                    min={0}
                                    max={selectedDevoirForSoumissions?.noteMax ?? 20}
                                    step={0.5}
                                  />
                                </div>
                                <span className="text-xs font-bold w-10 text-right">{quickGradeValue}</span>
                                <Button size="sm" className="h-7 text-xs bg-emerald-600" onClick={handleQuickGrade} disabled={isQuickGrading}>
                                  {isQuickGrading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setQuickGradeSoumissionId(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                  onClick={() => { setQuickGradeSoumissionId(soumission.id); setQuickGradeValue(soumission.note ?? (selectedDevoirForSoumissions?.noteMax ?? 20) / 2) }}
                                  title="Notation rapide">
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleOpenGrade(soumission)}>
                                  {soumission.note !== null ? <Edit3 className="h-3 w-3 mr-1" /> : <Star className="h-3 w-3 mr-1" />}
                                  {soumission.note !== null ? 'Modifier' : 'Noter'}
                                </Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded student answer */}
                      {expandedSoumissionId === soumission.id && soumission.contenuTexte && (
                        <TableRow key={`${soumission.id}-expanded`}>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />Réponse de l&apos;étudiant
                              </p>
                              <div className="rounded-lg border bg-card p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                {soumission.contenuTexte}
                              </div>
                              {soumission.commentaireEtudiant && (
                                <p className="text-xs text-muted-foreground italic">
                                  Note : {soumission.commentaireEtudiant}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Footer: grade distribution */}
          {!isLoadingSoumissions && soumStats.notes.length > 0 && (
            <div className="border-t pt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>Min : <strong>{soumStats.minNote?.toFixed(1)}</strong></span>
              <span>Max : <strong>{soumStats.maxNote?.toFixed(1)}</strong></span>
              <span>Moy : <strong>{soumStats.avgNote?.toFixed(1)}</strong></span>
              <span className="ml-auto">{soumStats.corriges}/{soumStats.total} corrigées ({Math.round((soumStats.corriges / soumStats.total) * 100)}%)</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════
          GRADE DIALOG
          ═══════════════════════════════════════ */}
      <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-600" />Noter la soumission
            </DialogTitle>
            <DialogDescription>
              {gradingSoumission?.User?.name} — {selectedDevoirForSoumissions?.titre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {gradingSoumission?.contenuTexte && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Réponse de l&apos;étudiant</p>
                <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap max-h-[150px] overflow-y-auto bg-muted/30">
                  {gradingSoumission.contenuTexte.length > 500
                    ? gradingSoumission.contenuTexte.slice(0, 500) + '...'
                    : gradingSoumission.contenuTexte}
                </div>
              </div>
            )}

            {gradingSoumission?.noteIA !== null && gradingSoumission?.noteIA !== undefined && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                    Suggestion IA : {gradingSoumission.noteIA.toFixed(1)}/{selectedDevoirForSoumissions?.noteMax ?? 20}
                  </span>
                </div>
                {gradingSoumission.justificationIA && (
                  <p className="text-xs text-purple-700 dark:text-purple-400 whitespace-pre-wrap">
                    {gradingSoumission.justificationIA}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade-note">Note / {selectedDevoirForSoumissions?.noteMax ?? 20}</Label>
                <Input id="grade-note" type="number" min={0} max={selectedDevoirForSoumissions?.noteMax ?? 20} step={0.5}
                  value={gradeNote} onChange={(e) => setGradeNote(e.target.value)} placeholder="0" />
              </div>
              <div className="flex items-end">
                {gradeNote && selectedDevoirForSoumissions && (
                  <div className={`rounded-lg p-3 w-full text-center ${
                    parseFloat(gradeNote) >= selectedDevoirForSoumissions.noteMax / 2
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    <p className="text-2xl font-bold">
                      {Math.round((parseFloat(gradeNote) / selectedDevoirForSoumissions.noteMax) * 100)}%
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade-commentaire">Commentaire</Label>
              <Textarea id="grade-commentaire" placeholder="Commentaire pour l'étudiant..."
                value={gradeCommentaire} onChange={(e) => setGradeCommentaire(e.target.value)} rows={3} />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handleAiGradeSoumission} disabled={isAiGrading}
              className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950">
              {isAiGrading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Évaluer avec l&apos;IA
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGradeDialogOpen(false)}>Annuler</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmitGrade} disabled={isSubmittingGrade}>
                {isSubmittingGrade && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Enregistrer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
