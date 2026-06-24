'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trash2,
  RotateCcw,
  FileText,
  File,
  Presentation,
  HelpCircle,
  ClipboardList,
  BookOpen,
  Clock,
  AlertTriangle,
  Loader2,
  CheckSquare,
  Trash,
  Info,
  Calendar,
  HardDrive,
  Timer,
  Award,
  Search,
  ArrowUpDown,
  GraduationCap,
  Sparkles,
  RefreshCw,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { PulseSkeleton } from '@/components/ds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

// ─── Constants ───

const AUTO_DELETE_DAYS = 30
const WARNING_DAYS_THRESHOLD = 7

// ─── Types ───

type CorbeilleTab = 'documents' | 'questions' | 'epreuves' | 'devoirs'
type SortOption = 'deletedAt-desc' | 'deletedAt-asc' | 'name-asc' | 'name-desc'

interface UniteEnseignement {
  id: string
  code: string
  nom: string
}

interface DeletedDocument {
  id: string
  nomFichier: string
  tailleFichier: number | null
  typeMime: string | null
  dateUpload: string
  deletedAt: string
}

interface DeletedQuestion {
  id: string
  type: string
  enonce: string
  difficulte: string
  validee: boolean
  deletedAt: string
  document?: { id: string; nomFichier: string } | null
}

interface DeletedEpreuve {
  id: string
  titre: string
  duree: number
  statut: string
  dateDebut: string
  dateFin: string
  deletedAt: string
  uniteEnseignement?: UniteEnseignement | null
}

interface DeletedDevoir {
  id: string
  titre: string
  dateLimite: string
  statut: string
  noteMax: number
  deletedAt: string
  UniteEnseignement?: UniteEnseignement | null
}

interface SelectedItem {
  id: string
  type: CorbeilleTab
}

interface CorbeilleData {
  documents: DeletedDocument[]
  questions: DeletedQuestion[]
  epreuves: DeletedEpreuve[]
  devoirs: DeletedDevoir[]
  totalCount: number
}

// ─── Utility functions ───

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(date: string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "À l'instant"
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return formatDate(d)
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function getDaysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt)
  const now = new Date()
  const diffMs = now.getTime() - deleted.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, AUTO_DELETE_DAYS - diffDays)
}

function getFileTypeFromMime(typeMime: string | null): string {
  if (!typeMime) return 'unknown'
  if (typeMime.includes('pdf')) return 'pdf'
  if (typeMime.includes('wordprocessing') || typeMime.includes('document') || typeMime.includes('docx')) return 'docx'
  if (typeMime.includes('presentation') || typeMime.includes('pptx')) return 'pptx'
  if (typeMime.includes('text/plain')) return 'txt'
  if (typeMime.includes('markdown')) return 'md'
  return 'unknown'
}

function getFileTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return 'pdf'
    case 'docx': case 'doc': return 'docx'
    case 'pptx': case 'ppt': return 'pptx'
    case 'txt': return 'txt'
    case 'md': case 'markdown': return 'md'
    default: return 'unknown'
  }
}

function getQuestionTypeBadgeColor(type: string): string {
  switch (type) {
    case 'QCU': return 'bg-info/15 text-info border-info/30'
    case 'QCM': return 'bg-warning/15 text-warning border-warning/30'
    case 'QRC': return 'bg-success/15 text-success-text border-success/30'
    case 'REFLEXION': return 'bg-secondary/15 text-secondary border-secondary/30'
    case 'TRS': return 'bg-destructive/15 text-destructive border-destructive/30'
    case 'CODE': return 'bg-primary/15 text-primary-text border-primary/30'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

function getDifficulteBadgeColor(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'bg-success/10 text-success-text'
    case 'MOYEN': return 'bg-warning/10 text-warning'
    case 'DIFFICILE': return 'bg-primary/10 text-primary-text'
    case 'EXPERT': return 'bg-destructive/10 text-destructive'
    default: return ''
  }
}

function getDifficulteLabel(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'Facile'
    case 'MOYEN': return 'Moyen'
    case 'DIFFICILE': return 'Difficile'
    case 'EXPERT': return 'Expert'
    default: return diff
  }
}

function getStatutEpreuveBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border">Brouillon</Badge>
    case 'PLANIFIEE':
      return <Badge variant="outline" className="gap-1 bg-warning/15 text-warning border-warning/30">Planifiée</Badge>
    case 'EN_COURS':
      return <Badge variant="outline" className="gap-1 bg-success/15 text-success-text border-success/30">En cours</Badge>
    case 'TERMINEE':
      return <Badge variant="outline" className="gap-1 bg-info/15 text-info border-info/30">Terminée</Badge>
    case 'CLOTUREE':
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border">Clôturée</Badge>
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getStatutDevoirBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border">Brouillon</Badge>
    case 'PUBLIE':
      return <Badge variant="outline" className="gap-1 bg-success/15 text-success-text border-success/30">Publié</Badge>
    case 'FERME':
      return <Badge variant="outline" className="gap-1 bg-warning/15 text-warning border-warning/30">Fermé</Badge>
    case 'ARCHIVE':
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border">Archivé</Badge>
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getRemainingBadge(remaining: number) {
  if (remaining <= 0) {
    return (
      <Badge variant="outline" className="gap-1 bg-destructive/15 text-destructive border-destructive/30">
        <AlertTriangle className="h-3 w-3" />
        Expiré
      </Badge>
    )
  }
  if (remaining <= WARNING_DAYS_THRESHOLD) {
    return (
      <Badge variant="outline" className="gap-1 bg-warning/15 text-warning border-warning/30 animate-pulse">
        <AlertTriangle className="h-3 w-3" />
        <span className="font-mono tabular-nums">{remaining}</span> j restant{remaining > 1 ? 's' : ''}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 bg-success/10 text-success-text border-success/30">
      <Clock className="h-3 w-3" />
      {remaining} j restants
    </Badge>
  )
}

function getFileIcon(doc: DeletedDocument) {
  const type = doc.typeMime ? getFileTypeFromMime(doc.typeMime) : getFileTypeFromName(doc.nomFichier)

  switch (type) {
    case 'pdf':
      return (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 shadow-sm">
          <FileText className="h-5 w-5 text-destructive" />
        </div>
      )
    case 'docx':
      return (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-info/10 shadow-sm">
          <FileText className="h-5 w-5 text-info" />
        </div>
      )
    case 'pptx':
      return (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
          <Presentation className="h-5 w-5 text-primary-text" />
        </div>
      )
    default:
      return (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted shadow-sm">
          <File className="h-5 w-5 text-muted-foreground" />
        </div>
      )
  }
}

// ─── Sort helper ───

function sortItems<T extends { deletedAt: string }>(items: T[], sortBy: SortOption, getName: (item: T) => string): T[] {
  const sorted = [...items]
  switch (sortBy) {
    case 'deletedAt-desc':
      sorted.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
      break
    case 'deletedAt-asc':
      sorted.sort((a, b) => new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime())
      break
    case 'name-asc':
      sorted.sort((a, b) => getName(a).localeCompare(getName(b), 'fr'))
      break
    case 'name-desc':
      sorted.sort((a, b) => getName(b).localeCompare(getName(a), 'fr'))
      break
  }
  return sorted
}

// ─── Empty state component ───

function EmptyState({ icon: Icon, label, searchQuery }: { icon: React.ElementType; label: string; searchQuery?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 py-20 transition-all">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10">
          <Icon className="h-12 w-12 text-success-text" />
        </div>
        <div className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-md">
          <Sparkles className="h-4 w-4 text-success-text" />
        </div>
      </div>
      {searchQuery ? (
        <>
          <h3 className="mt-6 text-lg font-display font-semibold tracking-tight text-foreground">Aucun résultat</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Aucun{label ? ` ${label}` : ''} ne correspond à &laquo; {searchQuery} &raquo;.
          </p>
        </>
      ) : (
        <>
          <h3 className="mt-6 text-lg font-display font-semibold tracking-tight text-foreground">Corbeille vide</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez aucun{label ? ` ${label}` : ''} supprimé. C&apos;est une bonne chose !
          </p>
        </>
      )}
    </div>
  )
}

// ─── Stat Card ───

function StatCard({ icon: Icon, label, count, color }: {
  icon: React.ElementType
  label: string
  count: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm ds-lift">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tracking-tight font-mono tabular-nums">{count}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Action Button ───

function ActionButton({ variant, onClick, disabled, loading, icon: Icon, title }: {
  variant: 'restore' | 'purge'
  onClick: () => void
  disabled: boolean
  loading: boolean
  icon: React.ElementType
  title: string
}) {
  if (variant === 'restore') {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 border-success/40 text-success-text hover:bg-success/10 transition-all duration-200"
        onClick={onClick}
        disabled={disabled}
        title={title}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 transition-all duration-200"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </Button>
  )
}

// ─── Main Component ───

export function CorbeillePage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [data, setData] = useState<CorbeilleData>({
    documents: [],
    questions: [],
    epreuves: [],
    devoirs: [],
    totalCount: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<CorbeilleTab>('documents')

  // ─── Search & Sort state ───
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('deletedAt-desc')

  // ─── Selection state ───
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

  // ─── Action state ───
  const [isRestoring, setIsRestoring] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<SelectedItem[] | null>(null)

  // ─── Fetch deleted items ───
  const fetchCorbeille = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/corbeille?userId=${user.id}&type=all`)
      if (res.ok) {
        const json = await res.json()
        setData({
          documents: json.documents ?? [],
          questions: json.questions ?? [],
          epreuves: json.epreuves ?? [],
          devoirs: json.devoirs ?? [],
          totalCount: json.totalCount ?? 0,
        })
      }
    } catch {
      // Silent fail
    }
  }, [user])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchCorbeille()
      setIsLoading(false)
    }
    load()
  }, [fetchCorbeille])

  // ─── Handle tab change with state reset ───
  const handleTabChange = (value: string) => {
    setActiveTab(value as CorbeilleTab)
    setSelectedItems([])
    setSearchQuery('')
  }

  // ─── Filtered & sorted items ───
  const filteredDocuments = useMemo(() => {
    let items = data.documents
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((d) =>
        d.nomFichier.toLowerCase().includes(q) ||
        (d.typeMime?.toLowerCase().includes(q) ?? false)
      )
    }
    return sortItems(items, sortBy, (d) => d.nomFichier)
  }, [data.documents, searchQuery, sortBy])

  const filteredQuestions = useMemo(() => {
    let items = data.questions
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((qu) =>
        qu.type.toLowerCase().includes(q) ||
        qu.enonce.toLowerCase().includes(q) ||
        qu.difficulte.toLowerCase().includes(q) ||
        (qu.document?.nomFichier?.toLowerCase().includes(q) ?? false)
      )
    }
    return sortItems(items, sortBy, (qu) => qu.enonce)
  }, [data.questions, searchQuery, sortBy])

  const filteredEpreuves = useMemo(() => {
    let items = data.epreuves
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((ep) =>
        ep.titre.toLowerCase().includes(q) ||
        ep.statut.toLowerCase().includes(q) ||
        (ep.uniteEnseignement?.nom?.toLowerCase().includes(q) ?? false) ||
        (ep.uniteEnseignement?.code?.toLowerCase().includes(q) ?? false)
      )
    }
    return sortItems(items, sortBy, (ep) => ep.titre)
  }, [data.epreuves, searchQuery, sortBy])

  const filteredDevoirs = useMemo(() => {
    let items = data.devoirs
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((dv) =>
        dv.titre.toLowerCase().includes(q) ||
        dv.statut.toLowerCase().includes(q) ||
        (dv.UniteEnseignement?.nom?.toLowerCase().includes(q) ?? false) ||
        (dv.UniteEnseignement?.code?.toLowerCase().includes(q) ?? false)
      )
    }
    return sortItems(items, sortBy, (dv) => dv.titre)
  }, [data.devoirs, searchQuery, sortBy])

  // ─── Selection helpers ───
  const currentFilteredItems = (): SelectedItem[] => {
    switch (activeTab) {
      case 'documents':
        return filteredDocuments.map((d) => ({ id: d.id, type: 'documents' as CorbeilleTab }))
      case 'questions':
        return filteredQuestions.map((q) => ({ id: q.id, type: 'questions' as CorbeilleTab }))
      case 'epreuves':
        return filteredEpreuves.map((e) => ({ id: e.id, type: 'epreuves' as CorbeilleTab }))
      case 'devoirs':
        return filteredDevoirs.map((d) => ({ id: d.id, type: 'devoirs' as CorbeilleTab }))
    }
  }

  const isAllSelected = currentFilteredItems().length > 0 && currentFilteredItems().every((item) =>
    selectedItems.some((s) => s.id === item.id && s.type === item.type)
  )

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItems([])
    } else {
      setSelectedItems(currentFilteredItems())
    }
  }

  const toggleSelect = (item: SelectedItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((s) => s.id === item.id && s.type === item.type)
      if (exists) {
        return prev.filter((s) => !(s.id === item.id && s.type === item.type))
      }
      return [...prev, item]
    })
  }

  const isSelected = (id: string, type: CorbeilleTab) =>
    selectedItems.some((s) => s.id === id && s.type === type)

  const selectedCount = selectedItems.length

  // ─── Restore handler ───
  const handleRestore = async (items: SelectedItem[]) => {
    if (items.length === 0) return
    setIsRestoring(true)
    try {
      const mappedItems = items.map((item) => ({
        id: item.id,
        type: item.type === 'documents' ? 'document'
          : item.type === 'questions' ? 'question'
          : item.type === 'epreuves' ? 'epreuve'
          : 'devoir',
      }))

      const res = await fetch('/api/corbeille/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: mappedItems }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la restauration')
      }

      const result = await res.json()
      toast.success('Élément(s) restauré(s)', {
        description: result.message || `${items.length} élément(s) restauré(s) avec succès.`,
      })

      setSelectedItems([])
      await fetchCorbeille()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de restaurer les éléments.',
      })
    } finally {
      setIsRestoring(false)
    }
  }

  // ─── Purge handler ───
  const handlePurge = async (items: SelectedItem[]) => {
    if (items.length === 0) return
    setIsPurging(true)
    try {
      const mappedItems = items.map((item) => ({
        id: item.id,
        type: item.type === 'documents' ? 'document'
          : item.type === 'questions' ? 'question'
          : item.type === 'epreuves' ? 'epreuve'
          : 'devoir',
      }))

      const res = await fetch('/api/corbeille/purge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: mappedItems }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }

      const result = await res.json()
      toast.success('Suppression définitive', {
        description: result.message || `${items.length} élément(s) supprimé(s) définitivement.`,
      })

      setSelectedItems([])
      setPurgeTarget(null)
      setPurgeDialogOpen(false)
      await fetchCorbeille()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer les éléments.',
      })
    } finally {
      setIsPurging(false)
    }
  }

  // ─── Open purge confirmation ───
  const openPurgeDialog = (items: SelectedItem[]) => {
    setPurgeTarget(items)
    setPurgeDialogOpen(true)
  }

  // ─── Tab counts ───
  const tabCounts = {
    documents: data.documents.length,
    questions: data.questions.length,
    epreuves: data.epreuves.length,
    devoirs: data.devoirs.length,
  }

  // ─── Filtered counts for display ───
  const filteredCounts = {
    documents: filteredDocuments.length,
    questions: filteredQuestions.length,
    epreuves: filteredEpreuves.length,
    devoirs: filteredDevoirs.length,
  }

  // ─── Items about to expire ───
  const urgentCount = useMemo(() => {
    let count = 0
    data.documents.forEach((d) => { if (getDaysRemaining(d.deletedAt) <= WARNING_DAYS_THRESHOLD) count++ })
    data.questions.forEach((q) => { if (getDaysRemaining(q.deletedAt) <= WARNING_DAYS_THRESHOLD) count++ })
    data.epreuves.forEach((e) => { if (getDaysRemaining(e.deletedAt) <= WARNING_DAYS_THRESHOLD) count++ })
    data.devoirs.forEach((d) => { if (getDaysRemaining(d.deletedAt) <= WARNING_DAYS_THRESHOLD) count++ })
    return count
  }, [data])

  // ─── Loading skeleton ───
  const renderLoadingSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4 p-4">
            <PulseSkeleton className="h-5 w-5" />
            <PulseSkeleton className="h-11 w-11" variant="card" />
            <div className="flex-1 space-y-2">
              <PulseSkeleton className="h-4 w-3/4" />
              <PulseSkeleton className="h-3 w-1/2" />
            </div>
            <PulseSkeleton className="h-6 w-20" />
            <div className="flex gap-2">
              <PulseSkeleton className="h-8 w-8" />
              <PulseSkeleton className="h-8 w-8" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  // ─── Toolbar (Search + Sort) ───
  const renderToolbar = () => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher dans la corbeille..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 h-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="h-9 w-[200px]">
            <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deletedAt-desc">Récemment supprimé</SelectItem>
            <SelectItem value="deletedAt-asc">Plus ancien d&apos;abord</SelectItem>
            <SelectItem value="name-asc">Nom A → Z</SelectItem>
            <SelectItem value="name-desc">Nom Z → A</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => fetchCorbeille()}
          title="Actualiser"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // ─── Document row ───
  const renderDocumentRow = (doc: DeletedDocument) => {
    const remaining = getDaysRemaining(doc.deletedAt)
    const item = { id: doc.id, type: 'documents' as CorbeilleTab }
    const isExpiringSoon = remaining <= WARNING_DAYS_THRESHOLD

    return (
      <Card key={doc.id} className={`group transition-all duration-200 hover:shadow-md ${isExpiringSoon ? 'border-amber-200 dark:border-amber-800/60' : ''} ${isSelected(doc.id, 'documents') ? 'ring-2 ring-emerald-500/30 border-emerald-300 dark:border-emerald-700' : ''}`}>
        <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <Checkbox
            checked={isSelected(doc.id, 'documents')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${doc.nomFichier}`}
            className="shrink-0"
          />
          {getFileIcon(doc)}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium" title={doc.nomFichier}>
                {doc.nomFichier}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {doc.tailleFichier ? formatFileSize(doc.tailleFichier) : 'Taille inconnue'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatRelativeTime(doc.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ActionButton
              variant="restore"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              loading={isRestoring}
              icon={RotateCcw}
              title="Restaurer"
            />
            <ActionButton
              variant="purge"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              loading={isPurging}
              icon={Trash}
              title="Supprimer définitivement"
            />
          </div>
        </CardContent>
        <div className="px-3 pb-2 sm:px-4 sm:pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Question row ───
  const renderQuestionRow = (q: DeletedQuestion) => {
    const remaining = getDaysRemaining(q.deletedAt)
    const item = { id: q.id, type: 'questions' as CorbeilleTab }
    const isExpiringSoon = remaining <= WARNING_DAYS_THRESHOLD

    return (
      <Card key={q.id} className={`group transition-all duration-200 hover:shadow-md ${isExpiringSoon ? 'border-amber-200 dark:border-amber-800/60' : ''} ${isSelected(q.id, 'questions') ? 'ring-2 ring-emerald-500/30 border-emerald-300 dark:border-emerald-700' : ''}`}>
        <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <Checkbox
            checked={isSelected(q.id, 'questions')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner question ${q.id}`}
            className="shrink-0"
          />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info/10 shadow-sm">
            <HelpCircle className="h-5 w-5 text-info" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={getQuestionTypeBadgeColor(q.type)}>
                {q.type}
              </Badge>
              {q.difficulte && (
                <Badge variant="secondary" className={getDifficulteBadgeColor(q.difficulte)}>
                  {getDifficulteLabel(q.difficulte)}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
              {q.enonce}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {q.document && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {q.document.nomFichier}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(q.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ActionButton
              variant="restore"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              loading={isRestoring}
              icon={RotateCcw}
              title="Restaurer"
            />
            <ActionButton
              variant="purge"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              loading={isPurging}
              icon={Trash}
              title="Supprimer définitivement"
            />
          </div>
        </CardContent>
        <div className="px-3 pb-2 sm:px-4 sm:pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Epreuve row ───
  const renderEpreuveRow = (ep: DeletedEpreuve) => {
    const remaining = getDaysRemaining(ep.deletedAt)
    const item = { id: ep.id, type: 'epreuves' as CorbeilleTab }
    const isExpiringSoon = remaining <= WARNING_DAYS_THRESHOLD

    return (
      <Card key={ep.id} className={`group transition-all duration-200 hover:shadow-md ds-lift ${isExpiringSoon ? 'border-warning/40' : ''} ${isSelected(ep.id, 'epreuves') ? 'ring-2 ring-success/30 border-success/40' : ''}`}>
        <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <Checkbox
            checked={isSelected(ep.id, 'epreuves')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${ep.titre}`}
            className="shrink-0"
          />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 shadow-sm">
            <ClipboardList className="h-5 w-5 text-success-text" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{ep.titre}</p>
              {getStatutEpreuveBadge(ep.statut)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                <span className="font-mono tabular-nums">{ep.duree}</span> min
              </span>
              {ep.uniteEnseignement && (
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-3 w-3" />
                  {ep.uniteEnseignement.code} — {ep.uniteEnseignement.nom}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(ep.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ActionButton
              variant="restore"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              loading={isRestoring}
              icon={RotateCcw}
              title="Restaurer"
            />
            <ActionButton
              variant="purge"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              loading={isPurging}
              icon={Trash}
              title="Supprimer définitivement"
            />
          </div>
        </CardContent>
        <div className="px-3 pb-2 sm:px-4 sm:pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Devoir row ───
  const renderDevoirRow = (dv: DeletedDevoir) => {
    const remaining = getDaysRemaining(dv.deletedAt)
    const item = { id: dv.id, type: 'devoirs' as CorbeilleTab }
    const isExpiringSoon = remaining <= WARNING_DAYS_THRESHOLD

    return (
      <Card key={dv.id} className={`group transition-all duration-200 hover:shadow-md ds-lift ${isExpiringSoon ? 'border-warning/40' : ''} ${isSelected(dv.id, 'devoirs') ? 'ring-2 ring-success/30 border-success/40' : ''}`}>
        <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <Checkbox
            checked={isSelected(dv.id, 'devoirs')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${dv.titre}`}
            className="shrink-0"
          />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info/10 shadow-sm">
            <BookOpen className="h-5 w-5 text-info" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{dv.titre}</p>
              {getStatutDevoirBadge(dv.statut)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Award className="h-3 w-3" />
                <span className="font-mono tabular-nums">{dv.noteMax}</span> pts
              </span>
              {dv.UniteEnseignement && (
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-3 w-3" />
                  {dv.UniteEnseignement.code} — {dv.UniteEnseignement.nom}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Limite : {formatDateTime(dv.dateLimite)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(dv.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ActionButton
              variant="restore"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              loading={isRestoring}
              icon={RotateCcw}
              title="Restaurer"
            />
            <ActionButton
              variant="purge"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              loading={isPurging}
              icon={Trash}
              title="Supprimer définitivement"
            />
          </div>
        </CardContent>
        <div className="px-3 pb-2 sm:px-4 sm:pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Select all row ───
  const renderSelectAllRow = (count: number, filteredCount: number, label: string) => (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-2.5 transition-colors">
      <Checkbox
        checked={isAllSelected}
        onCheckedChange={toggleSelectAll}
        aria-label={`Sélectionner tous les ${label}`}
      />
      <span className="text-sm text-muted-foreground">
        {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
      </span>
      <span className="ml-auto text-xs text-muted-foreground font-mono tabular-nums">
        {filteredCount === count
          ? `${count} ${label}${count > 1 ? 's' : ''}`
          : `${filteredCount} sur ${count} ${label}${count > 1 ? 's' : ''}`
        }
      </span>
    </div>
  )

  return (
    <div className="space-y-6 pb-20">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 shadow-sm">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl">Corbeille</h1>
              <p className="text-sm text-muted-foreground">
                Restaurez ou supprimez définitivement vos éléments
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fetchCorbeille()}
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* ─── Auto-purge notice ─── */}
      <div className="relative overflow-hidden rounded-xl border border-warning/30 bg-warning/10 p-4">
        <div className="relative flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 shadow-sm">
            <Info className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">
              Suppression automatique après <span className="font-mono tabular-nums">{AUTO_DELETE_DAYS}</span> jours
            </p>
            <p className="mt-0.5 text-xs text-warning">
              Les éléments sont définitivement supprimés après <span className="font-mono tabular-nums">{AUTO_DELETE_DAYS}</span> jours.
              {urgentCount > 0 && (
                <span className="font-semibold"> <span className="font-mono tabular-nums">{urgentCount}</span> élément{urgentCount > 1 ? 's' : ''} expire{urgentCount === 1 ? '' : 'nt'} bientôt !</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Summary statistics ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Documents"
          count={tabCounts.documents}
          color="bg-success/15 text-success-text"
        />
        <StatCard
          icon={HelpCircle}
          label="Questions"
          count={tabCounts.questions}
          color="bg-info/15 text-info"
        />
        <StatCard
          icon={ClipboardList}
          label="Épreuves"
          count={tabCounts.epreuves}
          color="bg-warning/15 text-warning"
        />
        <StatCard
          icon={BookOpen}
          label="Devoirs"
          count={tabCounts.devoirs}
          color="bg-destructive/15 text-destructive"
        />
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
              {tabCounts.documents > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-success/15 text-success-text font-mono tabular-nums">
                  {tabCounts.documents}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Questions</span>
              {tabCounts.questions > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-info/15 text-info font-mono tabular-nums">
                  {tabCounts.questions}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="epreuves" className="gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Épreuves</span>
              {tabCounts.epreuves > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-warning/15 text-warning font-mono tabular-nums">
                  {tabCounts.epreuves}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="devoirs" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Devoirs</span>
              {tabCounts.devoirs > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-destructive/15 text-destructive font-mono tabular-nums">
                  {tabCounts.devoirs}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Toolbar (shared across tabs) ─── */}
        <div className="mt-4">
          {renderToolbar()}
        </div>

        {/* ─── Documents Tab ─── */}
        <TabsContent value="documents" className="mt-4">
          {isLoading ? renderLoadingSkeleton() : (
            filteredDocuments.length === 0 ? (
              <EmptyState icon={FileText} label="document" searchQuery={searchQuery} />
            ) : (
              <div className="space-y-3">
                {renderSelectAllRow(tabCounts.documents, filteredCounts.documents, 'document')}
                {filteredDocuments.map(renderDocumentRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Questions Tab ─── */}
        <TabsContent value="questions" className="mt-4">
          {isLoading ? renderLoadingSkeleton() : (
            filteredQuestions.length === 0 ? (
              <EmptyState icon={HelpCircle} label="question" searchQuery={searchQuery} />
            ) : (
              <div className="space-y-3">
                {renderSelectAllRow(tabCounts.questions, filteredCounts.questions, 'question')}
                {filteredQuestions.map(renderQuestionRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Épreuves Tab ─── */}
        <TabsContent value="epreuves" className="mt-4">
          {isLoading ? renderLoadingSkeleton() : (
            filteredEpreuves.length === 0 ? (
              <EmptyState icon={ClipboardList} label="épreuve" searchQuery={searchQuery} />
            ) : (
              <div className="space-y-3">
                {renderSelectAllRow(tabCounts.epreuves, filteredCounts.epreuves, 'épreuve')}
                {filteredEpreuves.map(renderEpreuveRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Devoirs Tab ─── */}
        <TabsContent value="devoirs" className="mt-4">
          {isLoading ? renderLoadingSkeleton() : (
            filteredDevoirs.length === 0 ? (
              <EmptyState icon={BookOpen} label="devoir" searchQuery={searchQuery} />
            ) : (
              <div className="space-y-3">
                {renderSelectAllRow(tabCounts.devoirs, filteredCounts.devoirs, 'devoir')}
                {filteredDevoirs.map(renderDevoirRow)}
              </div>
            )
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Bulk actions bar ─── */}
      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-lg sm:px-6">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-success-text" />
              <span className="text-sm font-medium whitespace-nowrap font-mono tabular-nums">
                {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Button
              className="gap-1.5"
              size="sm"
              onClick={() => handleRestore(selectedItems)}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Restaurer</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => openPurgeDialog(selectedItems)}
              disabled={isPurging}
            >
              {isPurging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          </div>
        </div>
      )}

      {/* ─── Permanent deletion confirmation dialog ─── */}
      <AlertDialog open={purgeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPurgeDialogOpen(false)
          setPurgeTarget(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              Suppression définitive
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              {purgeTarget && purgeTarget.length === 1 ? (
                <>
                  Êtes-vous sûr de vouloir supprimer définitivement cet élément ?
                  Cette action est <strong>irréversible</strong> et les données seront perdues à jamais.
                </>
              ) : (
                <>
                  Êtes-vous sûr de vouloir supprimer définitivement ces{' '}
                  <strong>{purgeTarget?.length ?? 0} éléments</strong> ?
                  Cette action est <strong>irréversible</strong> et les données seront perdues à jamais.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPurging}>Annuler</AlertDialogCancel>
            <Button
              onClick={() => purgeTarget && handlePurge(purgeTarget)}
              disabled={isPurging}
              className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
            >
              {isPurging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer définitivement'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
