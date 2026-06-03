'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { toast } from 'sonner'

// ─── Constants ───

const AUTO_DELETE_DAYS = 30
const WARNING_DAYS_THRESHOLD = 7

// ─── Types ───

type CorbeilleTab = 'documents' | 'questions' | 'epreuves' | 'devoirs'

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
}

interface DeletedDevoir {
  id: string
  titre: string
  dateLimite: string
  statut: string
  noteMax: number
  deletedAt: string
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
    case 'QCU': return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'
    case 'QCM': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    case 'QRC': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    case 'TRS': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
    default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
  }
}

function getDifficulteBadgeColor(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
    case 'MOYEN': return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
    case 'DIFFICILE': return 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
    case 'EXPERT': return 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
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
      return <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Brouillon</Badge>
    case 'PLANIFIEE':
      return <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">Planifiée</Badge>
    case 'EN_COURS':
      return <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">En cours</Badge>
    case 'TERMINEE':
      return <Badge variant="outline" className="gap-1 bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">Terminée</Badge>
    case 'CLOTUREE':
      return <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">Clôturée</Badge>
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getStatutDevoirBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Brouillon</Badge>
    case 'PUBLIE':
      return <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Publié</Badge>
    case 'FERME':
      return <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">Fermé</Badge>
    case 'ARCHIVE':
      return <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">Archivé</Badge>
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getRemainingBadge(remaining: number) {
  if (remaining <= 0) {
    return (
      <Badge variant="outline" className="gap-1 bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
        <AlertTriangle className="h-3 w-3" />
        Expiré
      </Badge>
    )
  }
  if (remaining <= WARNING_DAYS_THRESHOLD) {
    return (
      <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
        <AlertTriangle className="h-3 w-3" />
        {remaining} j restant{remaining > 1 ? 's' : ''}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
          <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
      )
    case 'docx':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
          <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
      )
    case 'pptx':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
          <Presentation className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
      )
    default:
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800/60">
          <File className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </div>
      )
  }
}

// ─── Empty state component ───

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
        <Icon className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Aucun élément supprimé</h3>
      <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
        Vous n&apos;avez aucun{label ? ` ${label}` : ''} dans la corbeille.
      </p>
    </div>
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
      const res = await fetch(`/api/corbeille?userId=${user.id}&type=all`, { headers: getAuthHeaders() })
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
  }, [user?.id])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchCorbeille()
      setIsLoading(false)
    }
    load()
  }, [fetchCorbeille])

  // ─── Clear selection when switching tabs ───
  useEffect(() => {
    setSelectedItems([])
  }, [activeTab])

  // ─── Selection helpers ───
  const currentItems = (): SelectedItem[] => {
    switch (activeTab) {
      case 'documents':
        return data.documents.map((d) => ({ id: d.id, type: 'documents' as CorbeilleTab }))
      case 'questions':
        return data.questions.map((q) => ({ id: q.id, type: 'questions' as CorbeilleTab }))
      case 'epreuves':
        return data.epreuves.map((e) => ({ id: e.id, type: 'epreuves' as CorbeilleTab }))
      case 'devoirs':
        return data.devoirs.map((d) => ({ id: d.id, type: 'devoirs' as CorbeilleTab }))
    }
  }

  const isAllSelected = currentItems().length > 0 && currentItems().every((item) =>
    selectedItems.some((s) => s.id === item.id && s.type === item.type)
  )

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItems([])
    } else {
      setSelectedItems(currentItems())
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

  // ─── Loading skeleton ───
  const renderLoadingSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="h-10 w-10 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-6 w-20 rounded-full bg-muted" />
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded bg-muted" />
              <div className="h-8 w-8 rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  // ─── Document row ───
  const renderDocumentRow = (doc: DeletedDocument) => {
    const remaining = getDaysRemaining(doc.deletedAt)
    const item = { id: doc.id, type: 'documents' as CorbeilleTab }

    return (
      <Card key={doc.id} className="group transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Checkbox
            checked={isSelected(doc.id, 'documents')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${doc.nomFichier}`}
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
                Uploadé le {formatDate(doc.dateUpload)}
              </span>
              <span className="flex items-center gap-1">
                <Trash2 className="h-3 w-3" />
                Supprimé le {formatDate(doc.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              title="Restaurer"
            >
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              title="Supprimer définitivement"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
        {/* Mobile remaining badge */}
        <div className="px-4 pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Question row ───
  const renderQuestionRow = (q: DeletedQuestion) => {
    const remaining = getDaysRemaining(q.deletedAt)
    const item = { id: q.id, type: 'questions' as CorbeilleTab }

    return (
      <Card key={q.id} className="group transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Checkbox
            checked={isSelected(q.id, 'questions')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner question ${q.id}`}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
            <HelpCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
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
                <Trash2 className="h-3 w-3" />
                Supprimé le {formatDate(q.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              title="Restaurer"
            >
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              title="Supprimer définitivement"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
        <div className="px-4 pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Epreuve row ───
  const renderEpreuveRow = (ep: DeletedEpreuve) => {
    const remaining = getDaysRemaining(ep.deletedAt)
    const item = { id: ep.id, type: 'epreuves' as CorbeilleTab }

    return (
      <Card key={ep.id} className="group transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Checkbox
            checked={isSelected(ep.id, 'epreuves')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${ep.titre}`}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{ep.titre}</p>
              {getStatutEpreuveBadge(ep.statut)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {ep.duree} min
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateTime(ep.dateDebut)} — {formatDateTime(ep.dateFin)}
              </span>
              <span className="flex items-center gap-1">
                <Trash2 className="h-3 w-3" />
                Supprimé le {formatDate(ep.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              title="Restaurer"
            >
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              title="Supprimer définitivement"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
        <div className="px-4 pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  // ─── Devoir row ───
  const renderDevoirRow = (dv: DeletedDevoir) => {
    const remaining = getDaysRemaining(dv.deletedAt)
    const item = { id: dv.id, type: 'devoirs' as CorbeilleTab }

    return (
      <Card key={dv.id} className="group transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Checkbox
            checked={isSelected(dv.id, 'devoirs')}
            onCheckedChange={() => toggleSelect(item)}
            aria-label={`Sélectionner ${dv.titre}`}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
            <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{dv.titre}</p>
              {getStatutDevoirBadge(dv.statut)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Limite : {formatDateTime(dv.dateLimite)}
              </span>
              <span className="flex items-center gap-1">
                <Award className="h-3 w-3" />
                {dv.noteMax} pts
              </span>
              <span className="flex items-center gap-1">
                <Trash2 className="h-3 w-3" />
                Supprimé le {formatDate(dv.deletedAt)}
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            {getRemainingBadge(remaining)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleRestore([item])}
              disabled={isRestoring}
              title="Restaurer"
            >
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => openPurgeDialog([item])}
              disabled={isPurging}
              title="Supprimer définitivement"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
        <div className="px-4 pb-3 sm:hidden">
          {getRemainingBadge(remaining)}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Corbeille</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restaurez ou supprimez définitivement vos éléments
        </p>
      </div>

      {/* ─── Auto-purge notice ─── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Suppression automatique après {AUTO_DELETE_DAYS} jours
          </p>
          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
            Les éléments de la corbeille sont automatiquement supprimés définitivement après {AUTO_DELETE_DAYS} jours.
            Les éléments approchant de cette limite sont signalés par un avertissement.
          </p>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CorbeilleTab)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
            {tabCounts.documents > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {tabCounts.documents}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-1.5">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Questions</span>
            {tabCounts.questions > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                {tabCounts.questions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="epreuves" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Épreuves</span>
            {tabCounts.epreuves > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {tabCounts.epreuves}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="devoirs" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Devoirs</span>
            {tabCounts.devoirs > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                {tabCounts.devoirs}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Documents Tab ─── */}
        <TabsContent value="documents">
          {isLoading ? renderLoadingSkeleton() : (
            data.documents.length === 0 ? (
              <EmptyState icon={FileText} label="document" />
            ) : (
              <div className="space-y-3">
                {/* Select all row */}
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Sélectionner tous les documents"
                  />
                  <span className="text-sm text-muted-foreground">
                    {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {data.documents.length} document{data.documents.length > 1 ? 's' : ''}
                  </span>
                </div>
                {data.documents.map(renderDocumentRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Questions Tab ─── */}
        <TabsContent value="questions">
          {isLoading ? renderLoadingSkeleton() : (
            data.questions.length === 0 ? (
              <EmptyState icon={HelpCircle} label="question" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Sélectionner toutes les questions"
                  />
                  <span className="text-sm text-muted-foreground">
                    {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {data.questions.length} question{data.questions.length > 1 ? 's' : ''}
                  </span>
                </div>
                {data.questions.map(renderQuestionRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Épreuves Tab ─── */}
        <TabsContent value="epreuves">
          {isLoading ? renderLoadingSkeleton() : (
            data.epreuves.length === 0 ? (
              <EmptyState icon={ClipboardList} label="épreuve" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Sélectionner toutes les épreuves"
                  />
                  <span className="text-sm text-muted-foreground">
                    {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {data.epreuves.length} épreuve{data.epreuves.length > 1 ? 's' : ''}
                  </span>
                </div>
                {data.epreuves.map(renderEpreuveRow)}
              </div>
            )
          )}
        </TabsContent>

        {/* ─── Devoirs Tab ─── */}
        <TabsContent value="devoirs">
          {isLoading ? renderLoadingSkeleton() : (
            data.devoirs.length === 0 ? (
              <EmptyState icon={BookOpen} label="devoir" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Sélectionner tous les devoirs"
                  />
                  <span className="text-sm text-muted-foreground">
                    {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {data.devoirs.length} devoir{data.devoirs.length > 1 ? 's' : ''}
                  </span>
                </div>
                {data.devoirs.map(renderDevoirRow)}
              </div>
            )
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Bulk actions bar ─── */}
      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 rounded-xl border bg-background/95 px-6 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">
                {selectedCount} élément{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              size="sm"
              onClick={() => handleRestore(selectedItems)}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restaurer la sélection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => openPurgeDialog(selectedItems)}
              disabled={isPurging}
            >
              {isPurging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer définitivement
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
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Suppression définitive
            </AlertDialogTitle>
            <AlertDialogDescription>
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
            <AlertDialogAction
              onClick={() => purgeTarget && handlePurge(purgeTarget)}
              disabled={isPurging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPurging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Supprimer définitivement
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
