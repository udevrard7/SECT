'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Calendar,
  HelpCircle,
  Users,
  Edit3,
  Send,
  Trash2,
  Eye,
  Play,
  CalendarDays,
  Activity,
  Square,
  BarChart3,
  Lock,
  Download,
  Search,
  Filter,
  Check,
  X,
  Shuffle,
  Ban,
  AlertTriangle,
  Loader2,
  Trophy,
  Library,
  CheckCircle2,
  Sparkles,
  Copy,
  FileText,
  BookOpen,
  Hash,
  ChevronDown,
  ChevronUp,
  Layers,
  SendHorizonal,
  FileDown,
  FileCheck2,
  ClipboardList,
  SlidersHorizontal,
  GraduationCap,
  CalendarRange,
  RotateCcw,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

// ─── Types ───

interface EpreuveContenu {
  questions: Array<{
    id: string
    type: string
    enonce: string
    propositions: Array<{ id: string; text: string }> | null
    reponseCorrecte: string | string[] | null
    explication: string | null
    difficulte: string
    bareme: number
  }>
  consignes?: string
  baremeTotal: number
}

interface Session {
  id: string
  statut: string
  score: number | null
  etudiantId: string
  etudiant?: { id: string; name: string; email: string }
  alertes?: number
  reponses?: Array<{ id: string; questionId: string }>
  logEvents?: unknown
}

interface EpreuveQuestion {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: { id: string; type: string; enonce: string; difficulte: string }
}

// Teacher's context from /api/enseignant/context
interface EnseignantFiliereContext {
  id: string
  nom: string
  code: string | null
  niveaux: string[]
  unitesEnseignement: Array<{
    id: string
    code: string
    nom: string
    niveau: string
    niveaux: string | null
    typeSeances: string[]
  }>
}

// For the Modèles (Banque) view
interface ModeleEpreuve {
  id: string
  titre: string
  description: string | null
  duree: number
  statut: string
  generationMode: 'MANUELLE' | 'IA_ASSISTEE'
  isTemplate: boolean
  contenu: EpreuveContenu | null
  questionCount: number
  baremeTotal: number
  noteTotal: number
  typeDistribution: Record<string, number>
  sourceDocuments: Array<{ id: string; nomFichier: string }>
  filiere: { id: string; nom: string; code: string | null } | null
  uniteEnseignement: { id: string; nom: string; code: string | null } | null
  sessionCount: number
  hasContenuFormat: boolean
  createdAt: string
  updatedAt: string
}

// For the Sessions view
interface SessionEpreuve {
  id: string
  enseignantId: string
  titre: string
  description: string | null
  duree: number
  dateDebut: string
  dateFin: string
  melangeQuestions: boolean
  melangePropositions: boolean
  blocageRetour: boolean
  statut: 'BROUILLON' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'CLOTUREE'
  groupesCibles: string[] | null
  questions: EpreuveQuestion[]
  sessions: Session[]
  contenu: EpreuveContenu | null
  generationMode: string
  clotureeAt?: string | null
  clotureeAutomatiquement?: boolean
  raisonCloture?: string | null
  noteTotal?: number
  delaiGrace?: number
  createdAt: string
  // New classification fields
  niveau?: string | null
  sessionExamen?: string | null
  anneeAcademiqueId?: string | null
  anneeAcademique?: { id: string; libelle: string } | null
  filiere?: { id: string; nom: string; code: string | null } | null
  uniteEnseignement?: { id: string; nom: string; code: string | null } | null
}

type TabId = 'modeles' | 'sessions'

// ─── Utility functions ───

const TYPE_COLORS: Record<string, string> = {
  QCU: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
  QCM: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  QRC: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  REFLEXION: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
  CODE: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
}

const DIFFICULTE_COLORS: Record<string, string> = {
  FACILE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300',
  MOYEN: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300',
  DIFFICILE: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300',
  EXPERT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300',
}

const DIFFICULTE_LABELS: Record<string, string> = {
  FACILE: 'Facile',
  MOYEN: 'Moyen',
  DIFFICILE: 'Difficile',
  EXPERT: 'Expert',
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + '...'
}

const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1 — Licence 1',
  L2: 'L2 — Licence 2',
  L3: 'L3 — Licence 3',
  M1: 'M1 — Master 1',
  M2: 'M2 — Master 2',
  DOCTORAT: 'Doctorat',
}

const SESSION_EXAMEN_LABELS: Record<string, string> = {
  NORMALE: 'Normale',
  RATTRAPAGE: 'Rattrapage',
  SPECIALE: 'Spéciale',
}

const SESSION_EXAMEN_COLORS: Record<string, string> = {
  NORMALE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  RATTRAPAGE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  SPECIALE: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
}

function getStatutLabel(statut: string): string {
  switch (statut) {
    case 'BROUILLON': return 'Brouillon'
    case 'PLANIFIEE': return 'Planifiée'
    case 'EN_COURS': return 'En cours'
    case 'TERMINEE': return 'Terminée'
    case 'CLOTUREE': return 'Clôturée'
    default: return statut
  }
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
          <Edit3 className="h-3 w-3" /> Brouillon
        </Badge>
      )
    case 'PLANIFIEE':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          <Calendar className="h-3 w-3" /> Planifiée
        </Badge>
      )
    case 'EN_COURS':
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          <Activity className="h-3 w-3" /> En cours
        </Badge>
      )
    case 'TERMINEE':
      return (
        <Badge variant="outline" className="gap-1 bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
          <Check className="h-3 w-3" /> Terminée
        </Badge>
      )
    case 'CLOTUREE':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">
          <Lock className="h-3 w-3" /> Clôturée
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

// ─── Main Component ───

export function EpreuvesPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('modeles')

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Épreuves</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos modèles d&apos;épreuves et planifiez vos sessions d&apos;évaluation
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'modeles' && (
            <>
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => router.push(PAGE_ROUTES['questions-ia'])}
              >
                <Sparkles className="h-4 w-4" />
                Générer par IA
              </Button>
            </>
          )}
    
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab('modeles')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
            activeTab === 'modeles'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <Library className="h-4 w-4" />
          Modèles
          <span className="text-xs text-muted-foreground ml-1">Contenu &amp; questions</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
            activeTab === 'sessions'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <Layers className="h-4 w-4" />
          Sessions
          <span className="text-xs text-muted-foreground ml-1">Planification &amp; suivi</span>
        </button>
      </div>

      {/* ─── Tab Content ─── */}
      {activeTab === 'modeles' && <ModelesTab />}
      {activeTab === 'sessions' && <SessionsTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODÈLES TAB (was Banque d'Épreuves)
// Focus: CONTENT — browse, preview, duplicate, generate, delete
// ═══════════════════════════════════════════════════════════════

function ModelesTab() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  const [epreuves, setEpreuves] = useState<ModeleEpreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('TOUS')

  // Dialogs
  const [previewEpreuve, setPreviewEpreuve] = useState<ModeleEpreuve | null>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ModeleEpreuve | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<ModeleEpreuve | null>(null)
  const [duplicateTitre, setDuplicateTitre] = useState('')
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch
  const fetchBanque = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ enseignantId: user.id })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (modeFilter !== 'TOUS') params.set('generationMode', modeFilter)
      const res = await fetch(`/api/epreuves/banque?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les modèles.' })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, debouncedSearch, modeFilter])

  useEffect(() => { fetchBanque() }, [fetchBanque])

  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handlePreview = (epreuve: ModeleEpreuve) => {
    setPreviewEpreuve(epreuve)
    setExpandedQuestions(new Set())
    setPreviewDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/epreuves/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Modèle supprimé', { description: `"${deleteTarget.titre}" a été déplacé vers la corbeille.` })
      setDeleteTarget(null)
      await fetchBanque()
    } catch (err) {
      toast.error('Erreur', { description: 'Impossible de supprimer.' })
    }
  }

  const handleDuplicate = async () => {
    if (!duplicateTarget || !user?.id) return
    setIsDuplicating(true)
    try {
      const body: Record<string, unknown> = {
        enseignantId: user.id,
        titre: duplicateTitre,
        description: duplicateTarget.description,
        duree: duplicateTarget.duree,
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        generationMode: duplicateTarget.generationMode,
        documentIds: duplicateTarget.sourceDocuments.map((d) => d.id),
      }
      if (duplicateTarget.contenu) body.contenu = duplicateTarget.contenu

      const res = await fetch('/api/epreuves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Modèle dupliqué', { description: `"${duplicateTitre}" a été ajouté.` })
      setDuplicateTarget(null)
      await fetchBanque()
    } catch {
      toast.error('Erreur', { description: 'Impossible de dupliquer.' })
    } finally {
      setIsDuplicating(false)
    }
  }

  const openDuplicate = (epreuve: ModeleEpreuve) => {
    setDuplicateTarget(epreuve)
    setDuplicateTitre(`${epreuve.titre} (copie)`)
  }

  // PDF export
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null)

  const handleExportPDF = async (epreuveId: string, type: 'sujet' | 'corrige' | 'feuille-reponses') => {
    setExportingPdfId(epreuveId)
    try {
      const res = await fetch(`/api/epreuves/${epreuveId}/export-pdf?type=${type}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la génération du PDF')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition')
      let filename = `SECT_${type}.pdf`
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/)
        if (match) filename = match[1]
      }
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('PDF téléchargé', { description: `Le document a été généré avec succès.` })
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de générer le PDF.' })
    } finally {
      setExportingPdfId(null)
    }
  }

  const renderPropositions = (q: EpreuveContenu['questions'][0]) => {
    if (!q.propositions || q.propositions.length === 0) return null
    const correctAnswers = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte : q.reponseCorrecte ? [q.reponseCorrecte] : []
    return (
      <div className="space-y-1.5 mt-2">
        {q.propositions.map((prop, idx) => {
          const isCorrect = correctAnswers.includes(prop.id)
          return (
            <div key={idx} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${isCorrect ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-muted/30'}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${isCorrect ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}>
                {String.fromCharCode(65 + idx)}
              </span>
              <span className={isCorrect ? 'font-medium text-emerald-800 dark:text-emerald-200' : ''}>
                {typeof prop === 'string' ? prop : prop.text}
              </span>
              {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            </div>
          )
        })}
      </div>
    )
  }

  const totalEpreuves = epreuves.length
  const iaEpreuves = epreuves.filter((e) => e.generationMode === 'IA_ASSISTEE').length
  const manuelleEpreuves = totalEpreuves - iaEpreuves
  const totalQuestions = epreuves.reduce((sum, e) => sum + e.questionCount, 0)

  return (
    <div className="space-y-6">
      {/* Stats */}
      {!isLoading && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardContent className="flex flex-wrap items-center gap-4 p-4 md:gap-6 md:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <Library className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Modèles</p>
                <p className="text-lg font-bold">{totalEpreuves}</p>
              </div>
            </div>
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-sm"><span className="font-semibold">{iaEpreuves}</span> <span className="text-muted-foreground">IA</span></span>
              <span className="text-muted-foreground">·</span>
              <Edit3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm"><span className="font-semibold">{manuelleEpreuves}</span> <span className="text-muted-foreground">manuelles</span></span>
            </div>
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sm"><span className="font-semibold">{totalQuestions}</span> <span className="text-muted-foreground">questions</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un modèle..." className="pl-9" />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setSearch('')}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[170px]">
            <Filter className="mr-1 h-3 w-3" />
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Tous les modes</SelectItem>
            <SelectItem value="IA_ASSISTEE">Générées par IA</SelectItem>
            <SelectItem value="MANUELLE">Manuelles</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-3">
                <div className="h-5 w-48 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="flex gap-3"><div className="h-6 w-16 rounded-full bg-muted" /><div className="h-6 w-16 rounded-full bg-muted" /><div className="h-6 w-20 rounded-full bg-muted" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && epreuves.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Library className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun modèle d&apos;épreuve</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || modeFilter !== 'TOUS'
              ? 'Aucun modèle ne correspond à vos critères.'
              : 'Commencez par générer une épreuve via l\'IA ou créez-en une manuellement.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => router.push(PAGE_ROUTES['questions-ia'])}
            >
              <Sparkles className="h-4 w-4" />
              Générer par IA
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {!isLoading && epreuves.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {epreuves.map((epreuve) => {
            const typeEntries = Object.entries(epreuve.typeDistribution)
            return (
              <Card key={epreuve.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight">{epreuve.titre}</h3>
                      {epreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {epreuve.description.length > 100 ? epreuve.description.slice(0, 100) + '...' : epreuve.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={epreuve.generationMode === 'IA_ASSISTEE' ? 'gap-1 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800' : 'gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'}>
                      {epreuve.generationMode === 'IA_ASSISTEE' ? <><Sparkles className="h-3 w-3" /> IA</> : <><Edit3 className="h-3 w-3" /> Manuelle</>}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      <HelpCircle className="h-3 w-3" /> {epreuve.questionCount} question{epreuve.questionCount > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      <Trophy className="h-3 w-3" /> {epreuve.baremeTotal} pts
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                      <Clock className="h-3 w-3" /> {epreuve.duree} min
                    </Badge>
                  </div>

                  {typeEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {typeEntries.map(([type, count]) => (
                        <Badge key={type} variant="outline" className={`text-[10px] gap-0.5 py-0 ${TYPE_COLORS[type] || ''}`}>
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {epreuve.sourceDocuments.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {epreuve.sourceDocuments.map((d) => d.nomFichier).join(', ')}
                    </div>
                  )}

                  {(epreuve.filiere || epreuve.uniteEnseignement) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      {epreuve.filiere?.nom}{epreuve.filiere && epreuve.uniteEnseignement ? ' · ' : ''}{epreuve.uniteEnseignement?.nom}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Créé le {formatDate(epreuve.createdAt)}
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handlePreview(epreuve)}>
                      <Eye className="h-3.5 w-3.5" /> Aperçu
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950" disabled={exportingPdfId === epreuve.id}>
                          {exportingPdfId === epreuve.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                          PDF
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Exporter en PDF</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'sujet')} disabled={exportingPdfId === epreuve.id}>
                          <FileDown className="h-4 w-4 mr-2 text-emerald-600" />
                          <div>
                            <p className="font-medium">Sujet</p>
                            <p className="text-xs text-muted-foreground">Pour l'étudiant</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'corrige')} disabled={exportingPdfId === epreuve.id}>
                          <FileCheck2 className="h-4 w-4 mr-2 text-amber-600" />
                          <div>
                            <p className="font-medium">Corrigé type</p>
                            <p className="text-xs text-muted-foreground">Pour l'enseignant</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'feuille-reponses')} disabled={exportingPdfId === epreuve.id}>
                          <ClipboardList className="h-4 w-4 mr-2 text-sky-600" />
                          <div>
                            <p className="font-medium">Feuille de réponses</p>
                            <p className="text-xs text-muted-foreground">QCM / QCU dépouillement</p>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="sm" onClick={() => openDuplicate(epreuve)}>
                      <Copy className="h-3.5 w-3.5" /> Dupliquer
                    </Button>
                    <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setDeleteTarget(epreuve)}>
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" />
              Aperçu du modèle
            </DialogTitle>
            {previewEpreuve && (
              <DialogDescription>
                {previewEpreuve.titre} — {previewEpreuve.questionCount} question(s) · {previewEpreuve.baremeTotal} pts
              </DialogDescription>
            )}
          </DialogHeader>

          {previewEpreuve?.contenu && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {previewEpreuve.contenu.consignes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Consignes</p>
                  <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{previewEpreuve.contenu.consignes}</p>
                </div>
              )}
              {previewEpreuve.contenu.questions.map((q, idx) => {
                const isExpanded = expandedQuestions.has(q.id)
                return (
                  <Card key={q.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">{idx + 1}</span>
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[q.type] || ''}`}>{q.type}</Badge>
                        <Badge variant="outline" className={`text-xs ${DIFFICULTE_COLORS[q.difficulte] || ''}`}>{DIFFICULTE_LABELS[q.difficulte] || q.difficulte}</Badge>
                        <Badge variant="secondary" className="text-xs ml-auto">{q.bareme} pt{q.bareme > 1 ? 's' : ''}</Badge>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enonce}</p>
                      {(q.type === 'QCU' || q.type === 'QCM') && renderPropositions(q)}
                      {(q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte && (
                        <div className="mt-2">
                          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleExpand(q.id)}>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {q.type === 'QRC' ? 'Réponse modèle' : 'Guide de correction'}
                          </button>
                          {isExpanded && (
                            <div className={`mt-2 rounded-md border p-3 text-sm whitespace-pre-wrap ${q.type === 'QRC' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/50'}`}>
                              {Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte}
                            </div>
                          )}
                        </div>
                      )}
                      {q.type === 'CODE' && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                              {(q as any).langage || 'code'}
                            </Badge>
                            {(q as any).fonctionSignature && (
                              <code className="text-[10px] font-mono text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded">
                                {(q as any).fonctionSignature}
                              </code>
                            )}
                          </div>
                          {(q as any).codeInitial && (
                            <pre className="text-[10px] font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border max-h-32 overflow-y-auto">
                              {(q as any).codeInitial}
                            </pre>
                          )}
                          {(q as any).testsPublics && (q as any).testsPublics.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">Tests publics ({(q as any).testsPublics.length})</p>
                              <div className="space-y-0.5">
                                {(q as any).testsPublics.map((t: any, ti: number) => (
                                  <div key={ti} className="flex items-center gap-2 text-[10px] font-mono bg-muted/50 rounded px-2 py-1">
                                    <span className="text-muted-foreground">{t.nom || `Test ${ti + 1}`}</span>
                                    <span className="text-violet-600">→</span>
                                    <span>{t.sortieAttendue}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {q.reponseCorrecte && (
                            <div>
                              <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleExpand(q.id)}>
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                Solution de référence
                              </button>
                              {isExpanded && (
                                <pre className="mt-1 text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                                  {Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {q.explication && (
                        <div className="mt-2">
                          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleExpand(`exp-${q.id}`)}>
                            {expandedQuestions.has(`exp-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Explication
                          </button>
                          {expandedQuestions.has(`exp-${q.id}`) && (
                            <div className="mt-2 rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground">{q.explication}</div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {!previewEpreuve?.contenu && previewEpreuve && (
            <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-sm font-medium">Format ancien</p>
                <p className="text-xs mt-1">Ce modèle utilise l&apos;ancien format.</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {previewEpreuve && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950" disabled={exportingPdfId === previewEpreuve.id}>
                    {exportingPdfId === previewEpreuve.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    Télécharger PDF
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Exporter en PDF</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => previewEpreuve && handleExportPDF(previewEpreuve.id, 'sujet')} disabled={exportingPdfId === previewEpreuve.id}>
                    <FileDown className="h-4 w-4 mr-2 text-emerald-600" />
                    <div>
                      <p className="font-medium">Sujet</p>
                      <p className="text-xs text-muted-foreground">Pour l'étudiant</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => previewEpreuve && handleExportPDF(previewEpreuve.id, 'corrige')} disabled={exportingPdfId === previewEpreuve.id}>
                    <FileCheck2 className="h-4 w-4 mr-2 text-amber-600" />
                    <div>
                      <p className="font-medium">Corrigé type</p>
                      <p className="text-xs text-muted-foreground">Pour l'enseignant</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => previewEpreuve && handleExportPDF(previewEpreuve.id, 'feuille-reponses')} disabled={exportingPdfId === previewEpreuve.id}>
                    <ClipboardList className="h-4 w-4 mr-2 text-sky-600" />
                    <div>
                      <p className="font-medium">Feuille de réponses</p>
                      <p className="text-xs text-muted-foreground">QCM / QCU dépouillement</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Fermer</Button>
            {previewEpreuve && (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setPreviewDialogOpen(false); openDuplicate(previewEpreuve) }}>
                <Copy className="h-4 w-4" /> Utiliser comme modèle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le modèle &quot;{deleteTarget?.titre}&quot; sera déplacé vers la corbeille.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Dialog */}
      <Dialog open={!!duplicateTarget} onOpenChange={(open) => { if (!open) setDuplicateTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-emerald-600" /> Dupliquer le modèle</DialogTitle>
            <DialogDescription>Créez une copie de &quot;{duplicateTarget?.titre}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-titre">Titre de la copie</Label>
              <Input id="duplicate-titre" value={duplicateTitre} onChange={(e) => setDuplicateTitre(e.target.value)} placeholder="Titre" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateTarget(null)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleDuplicate} disabled={isDuplicating || !duplicateTitre.trim()}>
              {isDuplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SESSIONS TAB (was Mes Épreuves)
// Focus: DELIVERY — schedule, launch, monitor, grade, close
// ═══════════════════════════════════════════════════════════════

// ─── Annee Academique type for filter ───
interface AnneeAcademiqueOption {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  actif: boolean
  _count?: { epreuves: number }
}

function SessionsTab() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  const [epreuves, setEpreuves] = useState<SessionEpreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statutFilter, setStatutFilter] = useState('TOUS')

  // ─── Advanced filter state ───
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [filterAnneeAcademiqueId, setFilterAnneeAcademiqueId] = useState<string>('')
  const [filterFiliereId, setFilterFiliereId] = useState<string>('')
  const [filterNiveau, setFilterNiveau] = useState<string>('')
  const [filterUEId, setFilterUEId] = useState<string>('')
  const [filterSessionExamen, setFilterSessionExamen] = useState<string>('')

  // ─── Advanced filter data ───
  const [anneesAcademiques, setAnneesAcademiques] = useState<AnneeAcademiqueOption[]>([])
  const [filterFilieres, setFilterFilieres] = useState<EnseignantFiliereContext[]>([])
  const [isLoadingFilters, setIsLoadingFilters] = useState(false)

  const NIVEAU_OPTIONS = [
    { value: 'L1', label: 'L1 — Licence 1' },
    { value: 'L2', label: 'L2 — Licence 2' },
    { value: 'L3', label: 'L3 — Licence 3' },
    { value: 'M1', label: 'M1 — Master 1' },
    { value: 'M2', label: 'M2 — Master 2' },
    { value: 'DOCTORAT', label: 'Doctorat' },
  ]

  // Fetch filter options on mount
  useEffect(() => {
    if (!user?.id) return
    const fetchFilterData = async () => {
      setIsLoadingFilters(true)
      try {
        // Fetch annees academiques
        if (user.etablissementId) {
          const anneesRes = await fetch(`/api/annees-academiques?etablissementId=${user.etablissementId}`)
          if (anneesRes.ok) {
            const data = await anneesRes.json()
            setAnneesAcademiques(Array.isArray(data) ? data : [])
          }
        }

        // Fetch filieres from enseignant context
        const filieresRes = await fetch(`/api/enseignant/context?enseignantId=${user.id}`)
        if (filieresRes.ok) {
          const data = await filieresRes.json()
          setFilterFilieres(data.filieres ?? [])
        }
      } catch {
        // Silently ignore filter data load failures
      } finally {
        setIsLoadingFilters(false)
      }
    }
    fetchFilterData()
  }, [user?.id, user?.etablissementId])

  // Reset all advanced filters
  const resetAdvancedFilters = () => {
    setFilterAnneeAcademiqueId('')
    setFilterFiliereId('')
    setFilterNiveau('')
    setFilterUEId('')
    setFilterSessionExamen('')
  }

  // Count active advanced filters
  const activeAdvancedFilterCount = [
    filterAnneeAcademiqueId,
    filterFiliereId,
    filterNiveau,
    filterUEId,
    filterSessionExamen,
  ].filter(Boolean).length

  // Planifier dialog
  const [planifierDialogOpen, setPlanifierDialogOpen] = useState(false)
  const [modeles, setModeles] = useState<ModeleEpreuve[]>([])
  const [isLoadingModeles, setIsLoadingModeles] = useState(false)
  const [selectedModeleId, setSelectedModeleId] = useState<string | null>(null)
  const [planTitre, setPlanTitre] = useState('')
  const [planDateDebut, setPlanDateDebut] = useState('')
  const [planDateFin, setPlanDateFin] = useState('')
  const [planDuree, setPlanDuree] = useState(60)
  const [planGroupes, setPlanGroupes] = useState('')
  const [planMelangeQ, setPlanMelangeQ] = useState(true)
  const [planMelangeP, setPlanMelangeP] = useState(true)
  const [planBlocageRetour, setPlanBlocageRetour] = useState(false)
  const [planNoteTotal, setPlanNoteTotal] = useState(20)
  const [planFiliereId, setPlanFiliereId] = useState<string>('')
  const [planNiveau, setPlanNiveau] = useState<string>('')
  const [planUEId, setPlanUEId] = useState<string>('')
  const [planFilieres, setPlanFilieres] = useState<EnseignantFiliereContext[]>([])
  const [isLoadingPlanFilieres, setIsLoadingPlanFilieres] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [planSessionExamen, setPlanSessionExamen] = useState<string>('NORMALE')
  const [planAnneeAcademiqueId, setPlanAnneeAcademiqueId] = useState<string>('')

  // Monitoring dialog
  const [monitoringEpreuve, setMonitoringEpreuve] = useState<SessionEpreuve | null>(null)
  const [monitoringDialogOpen, setMonitoringDialogOpen] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<SessionEpreuve | null>(null)

  // Confirmation dialog for significant actions
  const [confirmAction, setConfirmAction] = useState<{ epreuveId: string; action: string; label: string; description: string } | null>(null)

  // Date edit dialog
  const [dateEditTarget, setDateEditTarget] = useState<SessionEpreuve | null>(null)
  const [dateEditDebut, setDateEditDebut] = useState('')
  const [dateEditFin, setDateEditFin] = useState('')

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ enseignantId: user.id })
      if (statutFilter !== 'TOUS') params.set('statut', statutFilter)
      // Advanced classification filters
      if (filterAnneeAcademiqueId) params.set('anneeAcademiqueId', filterAnneeAcademiqueId)
      if (filterFiliereId) params.set('filiereId', filterFiliereId)
      if (filterNiveau) params.set('niveau', filterNiveau)
      if (filterUEId) params.set('uniteEnseignementId', filterUEId)
      if (filterSessionExamen) params.set('sessionExamen', filterSessionExamen)
      const res = await fetch(`/api/epreuves?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les sessions.' })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, statutFilter, filterAnneeAcademiqueId, filterFiliereId, filterNiveau, filterUEId, filterSessionExamen])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  // Fetch modeles for planifier dialog
  const fetchModeles = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingModeles(true)
    try {
      const res = await fetch(`/api/epreuves/banque?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setModeles(data.epreuves ?? [])
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les modèles.' })
    } finally {
      setIsLoadingModeles(false)
    }
  }, [user?.id])

  const openPlanifier = () => {
    resetPlanForm()
    setPlanifierDialogOpen(true)
    fetchModeles()
    fetchPlanFilieres()
  }

  const fetchPlanFilieres = async () => {
    if (!user?.id) return
    setIsLoadingPlanFilieres(true)
    try {
      const res = await fetch(`/api/enseignant/context?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        const filieres: EnseignantFiliereContext[] = data.filieres ?? []
        setPlanFilieres(filieres)

        // Auto-select filière if only one assigned
        if (filieres.length === 1) {
          setPlanFiliereId(filieres[0].id)
          // Auto-select niveau if only one for this filière
          if (filieres[0].niveaux.length === 1) {
            setPlanNiveau(filieres[0].niveaux[0])
          }
          // Auto-select UE if only one for this filière
          const ues = filieres[0].unitesEnseignement
          if (ues.length === 1) {
            setPlanUEId(ues[0].id)
          }
        }
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger vos affectations.' })
    } finally {
      setIsLoadingPlanFilieres(false)
    }
  }

  const resetPlanForm = () => {
    setSelectedModeleId(null)
    setPlanTitre('')
    setPlanDateDebut('')
    setPlanDateFin('')
    setPlanDuree(60)
    setPlanGroupes('')
    setPlanMelangeQ(true)
    setPlanMelangeP(true)
    setPlanBlocageRetour(false)
    setPlanNoteTotal(20)
    setPlanFiliereId('')
    setPlanNiveau('')
    setPlanUEId('')
    setPlanSessionExamen('NORMALE')
    setPlanAnneeAcademiqueId('')
  }

  const handleSelectModele = (modeleId: string) => {
    setSelectedModeleId(modeleId)
    const modele = modeles.find((m) => m.id === modeleId)
    if (modele) {
      setPlanTitre(modele.titre)
      setPlanDuree(modele.duree)
      setPlanNoteTotal(modele.noteTotal || 20)
    }
  }

  const handlePlanifierSubmit = async () => {
    if (!user?.id || !selectedModeleId) return
    if (!planTitre || !planDateDebut || !planDateFin) {
      toast.error('Informations manquantes', { description: 'Remplissez tous les champs obligatoires.' })
      return
    }

    // Date validation
    const now = new Date()
    const debut = new Date(planDateDebut)
    const fin = new Date(planDateFin)
    if (debut <= now) {
      toast.error('Date invalide', { description: 'La date de début doit être dans le futur.' })
      return
    }
    if (debut >= fin) {
      toast.error('Date invalide', { description: 'La date de début doit être antérieure à la date de fin.' })
      return
    }

    setIsSubmitting(true)
    try {
      const modele = modeles.find((m) => m.id === selectedModeleId)
      const groupes = planGroupes.split(',').map((g) => g.trim()).filter((g) => g.length > 0)

      const body: Record<string, unknown> = {
        enseignantId: user.id,
        titre: planTitre,
        description: modele?.description || null,
        duree: planDuree,
        dateDebut: planDateDebut,
        dateFin: planDateFin,
        melangeQuestions: planMelangeQ,
        melangePropositions: planMelangeP,
        blocageRetour: planBlocageRetour,
        groupesCibles: groupes.length > 0 ? groupes : null,
        generationMode: modele?.generationMode || 'MANUELLE',
        documentIds: modele?.sourceDocuments.map((d) => d.id) || [],
        noteTotal: planNoteTotal,
        filiereId: planFiliereId && planFiliereId !== '__all__' ? planFiliereId : null,
        uniteEnseignementId: planUEId && planUEId !== '__none__' ? planUEId : null,
        niveau: planNiveau && planNiveau !== '__all__' ? planNiveau : null,
        sessionExamen: planSessionExamen || 'NORMALE',
        anneeAcademiqueId: planAnneeAcademiqueId || null,
      }

      // Copy contenu from the selected modele
      if (modele?.contenu) {
        body.contenu = modele.contenu
      }

      const res = await fetch('/api/epreuves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur')
      }

      toast.success('Session planifiée', { description: `"${planTitre}" a été créée en brouillon.` })
      setPlanifierDialogOpen(false)
      resetPlanForm()
      await fetchSessions()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Status actions
  const handleStatusAction = async (epreuveId: string, action: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/epreuves/${epreuveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(successMsg)
      await fetchSessions()
    } catch {
      toast.error('Erreur', { description: 'Impossible d\'effectuer cette action.' })
    }
  }

  const handleConfirmAction = () => {
    if (!confirmAction) return
    const successMessages: Record<string, string> = {
      lancer: 'Épreuve lancée',
      terminer: 'Épreuve terminée',
      cloturer: 'Épreuve clôturée',
    }
    handleStatusAction(confirmAction.epreuveId, confirmAction.action, successMessages[confirmAction.action] || 'Action effectuée')
    setConfirmAction(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/epreuves/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Session déplacée vers la corbeille')
      setDeleteTarget(null)
      await fetchSessions()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer.' })
    }
  }

  const handleOpenMonitoring = async (epreuve: SessionEpreuve) => {
    try {
      const res = await fetch(`/api/epreuves/${epreuve.id}`)
      if (res.ok) {
        const data = await res.json()
        setMonitoringEpreuve(data.epreuve ?? epreuve)
      } else {
        setMonitoringEpreuve(epreuve)
      }
    } catch {
      setMonitoringEpreuve(epreuve)
    }
    setMonitoringDialogOpen(true)
  }

  // Auto-refresh monitoring data for EN_COURS epreuves
  useEffect(() => {
    if (!monitoringDialogOpen || !monitoringEpreuve || monitoringEpreuve.statut !== 'EN_COURS') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/epreuves/${monitoringEpreuve.id}`)
        if (res.ok) {
          const data = await res.json()
          setMonitoringEpreuve(data.epreuve ?? monitoringEpreuve)
        }
      } catch {
        // Silently ignore refresh failures
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [monitoringDialogOpen, monitoringEpreuve])

  const openDateEdit = (epreuve: SessionEpreuve) => {
    setDateEditTarget(epreuve)
    const toLocal = (d: string) => { const dt = new Date(d); const offset = dt.getTimezoneOffset(); const local = new Date(dt.getTime() - offset * 60000); return local.toISOString().slice(0, 16) }
    setDateEditDebut(toLocal(epreuve.dateDebut))
    setDateEditFin(toLocal(epreuve.dateFin))
  }

  const handleEditDates = () => {
    if (!dateEditTarget) return
    const edit = async () => {
      try {
        const res = await fetch(`/api/epreuves/${dateEditTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateDebut: dateEditDebut, dateFin: dateEditFin }),
        })
        if (!res.ok) throw new Error('Erreur')
        toast.success('Dates mises à jour')
        setDateEditTarget(null)
        await fetchSessions()
      } catch {
        toast.error('Erreur lors de la mise à jour des dates')
      }
    }
    edit()
  }

  const handleExport = (epreuve: SessionEpreuve) => {
    toast.success('Export lancé', { description: `Résultats de "${epreuve.titre}" en cours d'export.` })
  }

  // PDF export for SessionsTab
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null)

  const handleExportPDF = async (epreuveId: string, type: 'sujet' | 'corrige' | 'feuille-reponses') => {
    setExportingPdfId(epreuveId)
    try {
      const res = await fetch(`/api/epreuves/${epreuveId}/export-pdf?type=${type}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la génération du PDF')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      let filename = `SECT_${type}.pdf`
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/)
        if (match) filename = match[1]
      }
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('PDF téléchargé', { description: 'Le document a été généré avec succès.' })
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de générer le PDF.' })
    } finally {
      setExportingPdfId(null)
    }
  }

  const [forcingSessionId, setForcingSessionId] = useState<string | null>(null)

  const handleForceSubmission = async (sessionId: string) => {
    setForcingSessionId(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'soumettre' }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur')
      }
      const data = await res.json()
      toast.success('Soumission forcée', {
        description: data.message || `Session soumise — ${data.autoGraded || 0} question(s) corrigée(s) automatiquement`,
      })
      if (monitoringEpreuve) await handleOpenMonitoring(monitoringEpreuve)
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de forcer la soumission.' })
    } finally {
      setForcingSessionId(null)
    }
  }

  // Render actions
  const renderActions = (epreuve: SessionEpreuve) => {
    const pdfDropdown = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950" disabled={exportingPdfId === epreuve.id}>
            {exportingPdfId === epreuve.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            PDF
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Exporter en PDF</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'sujet')} disabled={exportingPdfId === epreuve.id}>
            <FileDown className="h-4 w-4 mr-2 text-emerald-600" />
            <div>
              <p className="font-medium">Sujet</p>
              <p className="text-xs text-muted-foreground">Pour l'étudiant</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'corrige')} disabled={exportingPdfId === epreuve.id}>
            <FileCheck2 className="h-4 w-4 mr-2 text-amber-600" />
            <div>
              <p className="font-medium">Corrigé type</p>
              <p className="text-xs text-muted-foreground">Pour l'enseignant</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportPDF(epreuve.id, 'feuille-reponses')} disabled={exportingPdfId === epreuve.id}>
            <ClipboardList className="h-4 w-4 mr-2 text-sky-600" />
            <div>
              <p className="font-medium">Feuille de réponses</p>
              <p className="text-xs text-muted-foreground">QCM / QCU dépouillement</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    switch (epreuve.statut) {
      case 'BROUILLON':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleStatusAction(epreuve.id, 'publier', 'Épreuve publiée')}>
              <Send className="h-3.5 w-3.5" /> Publier
            </Button>
            {pdfDropdown}
            <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setDeleteTarget(epreuve)}>
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </Button>
          </div>
        )
      case 'PLANIFIEE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleOpenMonitoring(epreuve)}>
              <Eye className="h-3.5 w-3.5" /> Voir
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmAction({ epreuveId: epreuve.id, action: 'lancer', label: 'Lancer l\'épreuve', description: 'Les étudiants pourront commencer cette épreuve. Voulez-vous continuer ?' })}>
              <Play className="h-3.5 w-3.5" /> Lancer
            </Button>
            {pdfDropdown}
            <Button variant="outline" size="sm" onClick={() => openDateEdit(epreuve)}>
              <CalendarDays className="h-3.5 w-3.5" /> Dates
            </Button>
          </div>
        )
      case 'EN_COURS':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleOpenMonitoring(epreuve)}>
              <Activity className="h-3.5 w-3.5" /> Suivi
            </Button>
            {pdfDropdown}
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => setConfirmAction({ epreuveId: epreuve.id, action: 'terminer', label: 'Terminer l\'épreuve', description: 'Toutes les sessions en cours seront terminées. Les étudiants non soumis seront marqués comme tels. Voulez-vous continuer ?' })}>
              <Square className="h-3.5 w-3.5" /> Terminer
            </Button>
          </div>
        )
      case 'TERMINEE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleOpenMonitoring(epreuve)}>
              <BarChart3 className="h-3.5 w-3.5" /> Résultats
            </Button>
            {pdfDropdown}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmAction({ epreuveId: epreuve.id, action: 'cloturer', label: 'Clôturer l\'épreuve', description: 'Cette action est irréversible. Plus aucune modification ne sera possible. Voulez-vous continuer ?' })}>
              <Lock className="h-3.5 w-3.5" /> Clôturer
            </Button>
          </div>
        )
      case 'CLOTUREE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleOpenMonitoring(epreuve)}>
              <Trophy className="h-3.5 w-3.5" /> Résultats
            </Button>
            {pdfDropdown}
            <Button variant="outline" size="sm" onClick={() => handleExport(epreuve)}>
              <Download className="h-3.5 w-3.5" /> Exporter
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  // Monitoring stats
  const getMonitoringStats = (epreuve: SessionEpreuve | null) => {
    if (!epreuve) return { total: 0, enCours: 0, soumis: 0, absents: 0, nonSoumis: 0, avgScore: 0 }
    const sessions = epreuve.sessions ?? []
    const total = sessions.length
    const enCours = sessions.filter((s) => s.statut === 'EN_COURS').length
    const soumis = sessions.filter((s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE').length
    const absents = sessions.filter((s) => s.statut === 'ABSENT').length
    const nonSoumis = sessions.filter((s) => s.statut === 'NON_SOUMIS').length
    const withScore = sessions.filter((s) => s.score !== null)
    const avgScore = withScore.length > 0 ? withScore.reduce((sum, s) => sum + (s.score ?? 0), 0) / withScore.length : 0
    return { total, enCours, soumis, absents, nonSoumis, avgScore }
  }

  // Filtered epreuves by statut
  const filteredEpreuves = statutFilter === 'TOUS'
    ? epreuves
    : epreuves.filter((e) => e.statut === statutFilter)

  // Session counts by status
  const statusCounts = {
    BROUILLON: epreuves.filter((e) => e.statut === 'BROUILLON').length,
    PLANIFIEE: epreuves.filter((e) => e.statut === 'PLANIFIEE').length,
    EN_COURS: epreuves.filter((e) => e.statut === 'EN_COURS').length,
    TERMINEE: epreuves.filter((e) => e.statut === 'TERMINEE').length,
    CLOTUREE: epreuves.filter((e) => e.statut === 'CLOTUREE').length,
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {epreuves.length} session{epreuves.length > 1 ? 's' : ''} au total
        </p>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openPlanifier}>
          <SendHorizonal className="h-4 w-4" />
          Planifier une session
        </Button>
      </div>

      {/* ─── Advanced Filters (Collapsible) ─── */}
      <Collapsible open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtres avancés
              {activeAdvancedFilterCount > 0 && (
                <Badge variant="default" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-[10px] bg-emerald-600">
                  {activeAdvancedFilterCount}
                </Badge>
              )}
              {advancedFiltersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          {activeAdvancedFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={resetAdvancedFilters}>
              <RotateCcw className="h-3 w-3" />
              Réinitialiser
            </Button>
          )}
        </div>
        <CollapsibleContent>
          <div className="mt-3 rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {/* Année académique */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CalendarRange className="h-3 w-3" />
                  Année académique
                </Label>
                <Select value={filterAnneeAcademiqueId} onValueChange={setFilterAnneeAcademiqueId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes les années</SelectItem>
                    {anneesAcademiques.map((aa) => (
                      <SelectItem key={aa.id} value={aa.id}>
                        {aa.libelle}{aa.actif ? ' ●' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filière */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  Filière
                </Label>
                <Select
                  value={filterFiliereId}
                  onValueChange={(val) => {
                    setFilterFiliereId(val === '__all__' ? '' : val)
                    setFilterNiveau('')
                    setFilterUEId('')
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes les filières</SelectItem>
                    {filterFilieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom} {f.code ? `(${f.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Niveau */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3 w-3" />
                  Niveau
                </Label>
                <Select
                  value={filterNiveau}
                  onValueChange={(val) => {
                    setFilterNiveau(val === '__all__' ? '' : val)
                    setFilterUEId('')
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les niveaux</SelectItem>
                    {(() => {
                      const selectedFiliere = filterFilieres.find((f) => f.id === filterFiliereId)
                      const availableNiveaux = selectedFiliere
                        ? selectedFiliere.niveaux
                        : [...new Set(filterFilieres.flatMap((f) => f.niveaux))].sort()
                      return availableNiveaux.map((n) => (
                        <SelectItem key={n} value={n}>
                          {NIVEAU_OPTIONS.find((opt) => opt.value === n)?.label || n}
                        </SelectItem>
                      ))
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* UE */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Hash className="h-3 w-3" />
                  UE
                </Label>
                <Select value={filterUEId} onValueChange={(val) => setFilterUEId(val === '__none__' ? '' : val)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Toutes les UE</SelectItem>
                    {(() => {
                      const selectedFiliere = filterFilieres.find((f) => f.id === filterFiliereId)
                      if (!selectedFiliere) {
                        // No filiere selected: show all UEs from all filieres
                        const allUEs = filterFilieres.flatMap((f) => f.unitesEnseignement)
                        const uniqueUEs = [...new Map(allUEs.map((ue) => [ue.id, ue])).values()]
                        return uniqueUEs.map((ue) => (
                          <SelectItem key={ue.id} value={ue.id}>
                            {ue.code} — {ue.nom}
                          </SelectItem>
                        ))
                      }
                      let ues = selectedFiliere.unitesEnseignement
                      if (filterNiveau) {
                        ues = ues.filter((ue) => {
                          if (ue.niveau === filterNiveau) return true
                          if (ue.niveaux) {
                            try {
                              const shared = JSON.parse(ue.niveaux) as string[]
                              if (shared.includes(filterNiveau)) return true
                            } catch { /* ignore */ }
                          }
                          return false
                        })
                      }
                      return ues.map((ue) => (
                        <SelectItem key={ue.id} value={ue.id}>
                          {ue.code} — {ue.nom}
                        </SelectItem>
                      ))
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* Session */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  Session
                </Label>
                <Select value={filterSessionExamen} onValueChange={(val) => setFilterSessionExamen(val === '__all__' ? '' : val)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes les sessions</SelectItem>
                    <SelectItem value="NORMALE">Normale</SelectItem>
                    <SelectItem value="RATTRAPAGE">Rattrapage</SelectItem>
                    <SelectItem value="SPECIALE">Spéciale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Status quick filters */}
      {!isLoading && (
        <div className="flex flex-wrap gap-2">
          <Button variant={statutFilter === 'TOUS' ? 'default' : 'outline'} size="sm" className={statutFilter === 'TOUS' ? 'bg-emerald-600 hover:bg-emerald-700' : ''} onClick={() => setStatutFilter('TOUS')}>
            Toutes ({epreuves.length})
          </Button>
          {statusCounts.BROUILLON > 0 && (
            <Button variant={statutFilter === 'BROUILLON' ? 'default' : 'outline'} size="sm" className={statutFilter === 'BROUILLON' ? 'bg-gray-600' : ''} onClick={() => setStatutFilter('BROUILLON')}>
              <Edit3 className="h-3 w-3" /> Brouillons ({statusCounts.BROUILLON})
            </Button>
          )}
          {statusCounts.PLANIFIEE > 0 && (
            <Button variant={statutFilter === 'PLANIFIEE' ? 'default' : 'outline'} size="sm" className={statutFilter === 'PLANIFIEE' ? 'bg-amber-600' : ''} onClick={() => setStatutFilter('PLANIFIEE')}>
              <Calendar className="h-3 w-3" /> Planifiées ({statusCounts.PLANIFIEE})
            </Button>
          )}
          {statusCounts.EN_COURS > 0 && (
            <Button variant={statutFilter === 'EN_COURS' ? 'default' : 'outline'} size="sm" className={statutFilter === 'EN_COURS' ? 'bg-emerald-600' : ''} onClick={() => setStatutFilter('EN_COURS')}>
              <Activity className="h-3 w-3" /> En cours ({statusCounts.EN_COURS})
            </Button>
          )}
          {statusCounts.TERMINEE > 0 && (
            <Button variant={statutFilter === 'TERMINEE' ? 'default' : 'outline'} size="sm" className={statutFilter === 'TERMINEE' ? 'bg-sky-600' : ''} onClick={() => setStatutFilter('TERMINEE')}>
              <Check className="h-3 w-3" /> Terminées ({statusCounts.TERMINEE})
            </Button>
          )}
          {statusCounts.CLOTUREE > 0 && (
            <Button variant={statutFilter === 'CLOTUREE' ? 'default' : 'outline'} size="sm" className={statutFilter === 'CLOTUREE' ? 'bg-gray-600' : ''} onClick={() => setStatutFilter('CLOTUREE')}>
              <Lock className="h-3 w-3" /> Clôturées ({statusCounts.CLOTUREE})
            </Button>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between"><div className="space-y-2"><div className="h-5 w-48 rounded bg-muted" /><div className="h-3 w-32 rounded bg-muted" /></div><div className="h-6 w-20 rounded-full bg-muted" /></div>
                <div className="h-3 w-full rounded bg-muted" />
                <div className="flex gap-4"><div className="h-3 w-16 rounded bg-muted" /><div className="h-3 w-24 rounded bg-muted" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filteredEpreuves.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Layers className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {statutFilter !== 'TOUS' ? `Aucune session ${getStatutLabel(statutFilter).toLowerCase()}` : 'Aucune session planifiée'}
          </h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Planifiez une session d&apos;évaluation à partir d&apos;un modèle existant.
          </p>
          <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={openPlanifier}>
            <SendHorizonal className="h-4 w-4" />
            Planifier une session
          </Button>
        </div>
      )}

      {/* List */}
      {!isLoading && filteredEpreuves.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredEpreuves.map((epreuve) => {
            const contenuData = epreuve.contenu as { questions?: Array<{ bareme: number }> } | null
            const contenuQuestions = contenuData?.questions ?? []
            const questionCount = epreuve.questions.length > 0 ? epreuve.questions.length : contenuQuestions.length
            const pts = epreuve.questions.length > 0
              ? epreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0)
              : contenuQuestions.reduce((sum, q) => sum + (q.bareme || 1), 0)
            const sessionCount = epreuve.sessions.length
            const completedSessions = epreuve.sessions.filter((s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE').length
            const completionRate = sessionCount > 0 ? Math.round((completedSessions / sessionCount) * 100) : 0

            return (
              <Card key={epreuve.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight">{epreuve.titre}</h3>
                      {epreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{truncateText(epreuve.description, 100)}</p>
                      )}
                    </div>
                    {getStatutBadge(epreuve.statut)}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {epreuve.duree} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> {formatDateTime(epreuve.dateDebut)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      <HelpCircle className="h-3 w-3" /> {questionCount} question{questionCount > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      <Trophy className="h-3 w-3" /> {pts} pts
                    </Badge>
                    {sessionCount > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        <Users className="h-3 w-3" /> {completedSessions}/{sessionCount} soumises{completionRate < 100 ? ` (${completionRate}%)` : ''}
                      </Badge>
                    )}
                  </div>

                  {/* ─── Classification badges ─── */}
                  {(epreuve.niveau || epreuve.sessionExamen || epreuve.anneeAcademique || epreuve.uniteEnseignement || epreuve.filiere) && (
                    <div className="flex flex-wrap gap-1.5">
                      {epreuve.niveau && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0 bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800">
                          <GraduationCap className="h-2.5 w-2.5" /> {NIVEAU_LABELS[epreuve.niveau] || epreuve.niveau}
                        </Badge>
                      )}
                      {epreuve.sessionExamen && (
                        <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${SESSION_EXAMEN_COLORS[epreuve.sessionExamen] || ''}`}>
                          <Layers className="h-2.5 w-2.5" /> {SESSION_EXAMEN_LABELS[epreuve.sessionExamen] || epreuve.sessionExamen}
                        </Badge>
                      )}
                      {epreuve.anneeAcademique && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0 bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700">
                          <CalendarRange className="h-2.5 w-2.5" /> {epreuve.anneeAcademique.libelle}
                        </Badge>
                      )}
                      {epreuve.filiere && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800">
                          <BookOpen className="h-2.5 w-2.5" /> {epreuve.filiere.nom}
                        </Badge>
                      )}
                      {epreuve.uniteEnseignement && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
                          <Hash className="h-2.5 w-2.5" /> {epreuve.uniteEnseignement.code || epreuve.uniteEnseignement.nom}
                        </Badge>
                      )}
                    </div>
                  )}

                  {(epreuve.melangeQuestions || epreuve.melangePropositions || epreuve.blocageRetour) && (
                    <div className="flex flex-wrap gap-1.5">
                      {epreuve.melangeQuestions && <Badge variant="outline" className="text-[10px] gap-0.5 py-0"><Shuffle className="h-2.5 w-2.5" /> Questions mélangées</Badge>}
                      {epreuve.melangePropositions && <Badge variant="outline" className="text-[10px] gap-0.5 py-0"><Shuffle className="h-2.5 w-2.5" /> Props mélangées</Badge>}
                      {epreuve.blocageRetour && <Badge variant="outline" className="text-[10px] gap-0.5 py-0 text-red-600 dark:text-red-400"><Ban className="h-2.5 w-2.5" /> Retour bloqué</Badge>}
                    </div>
                  )}

                  {/* Auto-closure info */}
                  {epreuve.statut === 'CLOTUREE' && epreuve.clotureeAutomatiquement && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                        <Lock className="h-3.5 w-3.5" />
                        Clôturée automatiquement
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                        {epreuve.raisonCloture === 'TOUS_SOUMIS'
                          ? 'Tous les étudiants ont soumis leur composition'
                          : 'La période de passation est terminée'}
                        {epreuve.clotureeAt && (
                          <> — {formatDateTime(epreuve.clotureeAt)}</>
                        )}
                      </p>
                    </div>
                  )}

                  <Separator />
                  {renderActions(epreuve)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Planifier Dialog */}
      <Dialog open={planifierDialogOpen} onOpenChange={(open) => { if (!open) { setPlanifierDialogOpen(false); resetPlanForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SendHorizonal className="h-5 w-5 text-emerald-600" />
              Planifier une session
            </DialogTitle>
            <DialogDescription>
              Sélectionnez un modèle et planifiez les dates de votre session d&apos;évaluation.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            {/* Step 1: Select model */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Library className="h-4 w-4 text-emerald-600" />
                Choisir un modèle
              </Label>
              {isLoadingModeles ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement des modèles...
                </div>
              ) : modeles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground">Aucun modèle disponible.</p>
                  <Button variant="outline" size="sm" className="mt-2 border-emerald-300 text-emerald-700" onClick={() => { setPlanifierDialogOpen(false); router.push(PAGE_ROUTES['questions-ia']) }}>
                    <Sparkles className="h-3 w-3" /> Générer par IA
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-48">
                  <div className="space-y-2">
                    {modeles.map((modele) => (
                      <button
                        key={modele.id}
                        type="button"
                        onClick={() => handleSelectModele(modele.id)}
                        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedModeleId === modele.id
                            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                            : 'border-muted hover:border-emerald-200 dark:hover:border-emerald-900'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{modele.titre}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] gap-0.5 py-0">{modele.questionCount} Q</Badge>
                            <Badge variant="secondary" className="text-[10px] gap-0.5 py-0">{modele.baremeTotal} pts</Badge>
                            <Badge variant="outline" className="text-[10px] gap-0.5 py-0">{modele.generationMode === 'IA_ASSISTEE' ? 'IA' : 'Manuelle'}</Badge>
                          </div>
                        </div>
                        {selectedModeleId === modele.id && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {selectedModeleId && (
              <>
                <Separator />

                {/* Step 2: Session parameters */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-titre">Titre de la session *</Label>
                    <Input id="plan-titre" value={planTitre} onChange={(e) => setPlanTitre(e.target.value)} placeholder="Titre" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="plan-duree">Durée (min) *</Label>
                      <Input id="plan-duree" type="number" min={1} max={600} value={planDuree} onChange={(e) => setPlanDuree(parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-debut">Date début *</Label>
                      <Input id="plan-debut" type="datetime-local" value={planDateDebut} onChange={(e) => setPlanDateDebut(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-fin">Date fin *</Label>
                      <Input id="plan-fin" type="datetime-local" value={planDateFin} onChange={(e) => setPlanDateFin(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plan-note-total" className="flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      Note totale
                    </Label>
                    <Input
                      id="plan-note-total"
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={planNoteTotal}
                      onChange={(e) => setPlanNoteTotal(Math.max(1, parseFloat(e.target.value) || 20))}
                    />
                    <p className="text-[10px] text-muted-foreground">L&apos;IA répartira le barème pour ce total</p>
                  </div>

                  {/* Filière / Niveau / UE — déduits des affectations */}
                  {isLoadingPlanFilieres ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement de vos affectations...
                    </div>
                  ) : planFilieres.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Aucune affectation trouvée. Veuillez contacter le responsable de filière.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {/* Filière */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5 text-emerald-500" />
                          Filière cible
                          {planFilieres.length === 1 && (
                            <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">Auto</Badge>
                          )}
                        </Label>
                        <Select
                          value={planFiliereId}
                          onValueChange={(val) => {
                            setPlanFiliereId(val)
                            // Reset niveau and UE when filière changes
                            setPlanNiveau('')
                            setPlanUEId('')
                            // Auto-select niveau if only one for this filière
                            const selectedFiliere = planFilieres.find((f) => f.id === val)
                            if (selectedFiliere) {
                              if (selectedFiliere.niveaux.length === 1) {
                                setPlanNiveau(selectedFiliere.niveaux[0])
                              }
                              if (selectedFiliere.unitesEnseignement.length === 1) {
                                setPlanUEId(selectedFiliere.unitesEnseignement[0].id)
                              }
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez une filière" />
                          </SelectTrigger>
                          <SelectContent>
                            {planFilieres.length > 1 && (
                              <SelectItem value="__all__">Toutes les filières</SelectItem>
                            )}
                            {planFilieres.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.nom} {f.code ? `(${f.code})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Niveau — filtré par filière */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-sky-500" />
                          Niveau cible
                          {planFiliereId && planFilieres.find((f) => f.id === planFiliereId)?.niveaux.length === 1 && (
                            <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">Auto</Badge>
                          )}
                        </Label>
                        <Select value={planNiveau} onValueChange={(val) => { setPlanNiveau(val); setPlanUEId('') }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez un niveau" />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              // Derive available niveaux from the selected filière (or all filières)
                              const selectedFiliere = planFilieres.find((f) => f.id === planFiliereId)
                              const availableNiveaux = selectedFiliere
                                ? selectedFiliere.niveaux
                                : [...new Set(planFilieres.flatMap((f) => f.niveaux))].sort()

                              if (availableNiveaux.length === 0) {
                                return <SelectItem value="__none__" disabled>Aucun niveau disponible</SelectItem>
                              }

                              return (
                                <>
                                  {availableNiveaux.length > 1 && (
                                    <SelectItem value="__all__">Tous les niveaux</SelectItem>
                                  )}
                                  {availableNiveaux.map((n) => (
                                    <SelectItem key={n} value={n}>
                                      {NIVEAU_OPTIONS.find((opt) => opt.value === n)?.label || n}
                                    </SelectItem>
                                  ))}
                                </>
                              )
                            })()}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* UE — filtré par filière et niveau */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 text-teal-500" />
                          Unité d&apos;enseignement
                        </Label>
                        <Select value={planUEId} onValueChange={setPlanUEId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez une UE" />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const selectedFiliere = planFilieres.find((f) => f.id === planFiliereId)
                              if (!selectedFiliere) return <SelectItem value="__none__" disabled>Sélectionnez d&apos;abord une filière</SelectItem>

                              // Filter UEs by selected filière and niveau
                              let ues = selectedFiliere.unitesEnseignement
                              if (planNiveau && planNiveau !== '__all__') {
                                ues = ues.filter((ue) => {
                                  // Match the UE's primary niveau
                                  if (ue.niveau === planNiveau) return true
                                  // Also check the shared niveaux JSON
                                  if (ue.niveaux) {
                                    try {
                                      const shared = JSON.parse(ue.niveaux) as string[]
                                      if (shared.includes(planNiveau)) return true
                                    } catch { /* ignore */ }
                                  }
                                  return false
                                })
                              }

                              if (ues.length === 0) {
                                return <SelectItem value="__none__" disabled>Aucune UE pour cette sélection</SelectItem>
                              }

                              return (
                                <>
                                  <SelectItem value="__none__">Aucune UE spécifique</SelectItem>
                                  {ues.map((ue) => (
                                    <SelectItem key={ue.id} value={ue.id}>
                                      <span className="flex items-center gap-1.5">
                                        <span className="font-medium">{ue.code}</span>
                                        <span className="text-muted-foreground">— {ue.nom}</span>
                                        <span className="text-[10px] text-muted-foreground">({ue.typeSeances.join('/')})</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </>
                              )
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="plan-groupes">Groupes cibles</Label>
                    <Input id="plan-groupes" value={planGroupes} onChange={(e) => setPlanGroupes(e.target.value)} placeholder="Groupe A, Groupe B..." />
                  </div>

                  {/* ─── Session d'examen & Année académique ─── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Session d'examen</Label>
                      <Select value={planSessionExamen} onValueChange={setPlanSessionExamen}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NORMALE">📋 Normale</SelectItem>
                          <SelectItem value="RATTRAPAGE">🔄 Rattrapage</SelectItem>
                          <SelectItem value="SPECIALE">⭐ Spéciale</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Année académique</Label>
                      <Select value={planAnneeAcademiqueId} onValueChange={setPlanAnneeAcademiqueId}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          {anneesAcademiques.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.libelle}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={planMelangeQ} onCheckedChange={(checked) => setPlanMelangeQ(checked === true)} />
                      Mélanger les questions
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={planMelangeP} onCheckedChange={(checked) => setPlanMelangeP(checked === true)} />
                      Mélanger les propositions
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={planBlocageRetour} onCheckedChange={(checked) => setPlanBlocageRetour(checked === true)} />
                      Bloquer le retour
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setPlanifierDialogOpen(false); resetPlanForm() }}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!selectedModeleId || !planTitre || !planDateDebut || !planDateFin || isSubmitting} onClick={handlePlanifierSubmit}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
              Créer la session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Monitoring Dialog */}
      <Dialog open={monitoringDialogOpen} onOpenChange={setMonitoringDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Suivi — {monitoringEpreuve?.titre}
            </DialogTitle>
          </DialogHeader>
          {monitoringEpreuve && (() => {
            const stats = getMonitoringStats(monitoringEpreuve)
            return (
              <div className="flex-1 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">En cours</p><p className="text-xl font-bold text-emerald-600">{stats.enCours}</p></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Soumises</p><p className="text-xl font-bold text-sky-600">{stats.soumis}</p></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Moyenne</p><p className="text-xl font-bold">{stats.avgScore > 0 ? stats.avgScore.toFixed(1) : '—'}</p></CardContent></Card>
                </div>
                {(stats.absents > 0 || stats.nonSoumis > 0) && (
                  <div className="flex flex-wrap gap-3">
                    {stats.absents > 0 && (
                      <Badge variant="outline" className="gap-1 bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700">
                        <Ban className="h-3 w-3" /> {stats.absents} Absent(s)
                      </Badge>
                    )}
                    {stats.nonSoumis > 0 && (
                      <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
                        <AlertTriangle className="h-3 w-3" /> {stats.nonSoumis} Non soumis
                      </Badge>
                    )}
                  </div>
                )}
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Sessions</h4>
                  {monitoringEpreuve.sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune session enregistrée.</p>
                  ) : (
                    <ScrollArea className="max-h-60">
                      <div className="space-y-2">
                        {monitoringEpreuve.sessions.map((session) => (
                          <div key={session.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{session.etudiant?.name || session.etudiantId}</p>
                              <p className="text-xs text-muted-foreground">{session.etudiant?.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{session.statut}</Badge>
                              {session.score !== null && <span className="text-sm font-semibold">{session.score}/{monitoringEpreuve.noteTotal || monitoringEpreuve.questions.reduce((s, q) => s + q.bareme, 0) || 20}</span>}
                              {session.statut === 'EN_COURS' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                                  disabled={forcingSessionId === session.id}
                                  onClick={() => handleForceSubmission(session.id)}
                                >
                                  {forcingSessionId === session.id ? (
                                    <><Loader2 className="h-3 w-3 animate-spin" /> En cours...</>
                                  ) : (
                                    'Forcer'
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonitoringDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
            <AlertDialogDescription>La session &quot;{deleteTarget?.titre}&quot; sera déplacée vers la corbeille.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Action Dialog (Lancer/Terminer/Clôturer) */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirmAction}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Date Edit Dialog */}
      <Dialog open={!!dateEditTarget} onOpenChange={(open) => { if (!open) setDateEditTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier les dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date début</Label>
              <Input type="datetime-local" value={dateEditDebut} onChange={(e) => setDateEditDebut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date fin</Label>
              <Input type="datetime-local" value={dateEditFin} onChange={(e) => setDateEditFin(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateEditTarget(null)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditDates}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

