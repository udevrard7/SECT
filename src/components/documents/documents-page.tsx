'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  FileUp,
  FileText,
  File,
  Presentation,
  type LucideIcon,
  Plus,
  Upload,
  X,
  Loader2,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Tag,
  Lightbulb,
  BarChart3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Folder,
  LayoutGrid,
  List,
  BookOpen,
  Search,
  Filter,
  ChevronDown,
  CheckSquare,
  Square,
  Brain,
  MessageSquareText,
  FileWarning,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { EntityCard } from '@/components/ds'

// ─── Types ───

interface UE {
  id: string
  code: string
  nom: string
  niveau: string
  niveaux: string | null
  filiere: { id: string; nom: string }
}

interface Document {
  id: string
  nomFichier: string
  tailleFichier: number | null
  typeMime: string | null
  statutAnalyse: 'EN_ATTENTE' | 'EN_COURS' | 'ANALYSE' | 'ERREUR'
  themesDetectes: string | null
  conceptsCles: string | null
  volumeEstime: string | null
  dateUpload: string
  uniteEnseignementId: string | null
  uniteEnseignement?: {
    id: string
    code: string
    nom: string
    niveau: string
    niveaux: string | null
    filiere: { id: string; nom: string }
  } | null
}

interface DocumentDetail extends Document {
  resumeAnalyse?: string | null
  erreurAnalyse?: string | null
}

type ViewMode = 'folders' | 'grid' | 'list'

type FileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'unknown'

type AnalysisStatus = Document['statutAnalyse']

interface UploadFileEntry {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

// ─── Constants ───

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md', '.markdown']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const MAX_UPLOAD_FILES = 5
const DEBOUNCE_DELAY = 300

const FILE_TYPE_OPTIONS: { value: FileType; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'pptx', label: 'PPTX' },
  { value: 'txt', label: 'TXT' },
  { value: 'md', label: 'MD' },
]

const STATUS_OPTIONS: { value: AnalysisStatus; label: string }[] = [
  { value: 'EN_ATTENTE', label: 'En attente' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'ANALYSE', label: 'Analysé' },
  { value: 'ERREUR', label: 'Erreur' },
]

// ─── Utility functions ───

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
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

function getFileTypeFromFile(file: File): FileType {
  if (file.type) {
    const fromMime = getFileTypeFromMime(file.type)
    if (fromMime !== 'unknown') return fromMime as FileType
  }
  return getFileTypeFromName(file.name) as FileType
}

function isFileExtensionAllowed(fileName: string): boolean {
  const ext = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '')
  return ALLOWED_EXTENSIONS.includes(ext)
}

function getFileIcon(doc: Document): ReactNode {
  const type = doc.typeMime ? getFileTypeFromMime(doc.typeMime) : getFileTypeFromName(doc.nomFichier)

  switch (type) {
    case 'pdf':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
          <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
      )
    case 'docx':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
          <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
      )
    case 'pptx':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
          <Presentation className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
      )
    case 'txt':
    case 'md':
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800/60">
          <File className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </div>
      )
    default:
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800/60">
          <File className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </div>
      )
  }
}

function getSmallFileIcon(doc: Document | { nomFichier: string; typeMime: string | null }): ReactNode {
  const type = doc.typeMime ? getFileTypeFromMime(doc.typeMime) : getFileTypeFromName(doc.nomFichier)
  switch (type) {
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
    case 'docx':
      return <FileText className="h-4 w-4 text-sky-500 dark:text-sky-400" />
    case 'pptx':
      return <Presentation className="h-4 w-4 text-orange-500 dark:text-orange-400" />
    case 'txt':
    case 'md':
      return <File className="h-4 w-4 text-gray-500 dark:text-gray-400" />
    default:
      return <File className="h-4 w-4 text-gray-400 dark:text-gray-500" />
  }
}

function getFileLucideIcon(doc: Document | { nomFichier: string; typeMime: string | null }): LucideIcon {
  const type = doc.typeMime ? getFileTypeFromMime(doc.typeMime) : getFileTypeFromName(doc.nomFichier)
  switch (type) {
    case 'pdf':
    case 'docx':
      return FileText
    case 'pptx':
      return Presentation
    case 'txt':
    case 'md':
    default:
      return File
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'EN_ATTENTE': return 'En attente'
    case 'EN_COURS': return 'Analyse en cours...'
    case 'ANALYSE': return 'Analysé'
    case 'ERREUR': return 'Erreur'
    default: return status
  }
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'EN_ATTENTE':
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
    case 'EN_COURS':
      return 'bg-warning/10 text-warning border-warning/20 dark:text-warning'
    case 'ANALYSE':
      return 'bg-success/10 text-emerald-800 border-success/20 dark:text-emerald-300 dark:border-success/20'
    case 'ERREUR':
      return 'bg-destructive/10 text-red-800 border-destructive/20 dark:text-red-300 dark:border-red-800'
    default:
      return ''
  }
}

function getStatusIcon(status: string): ReactNode {
  switch (status) {
    case 'EN_ATTENTE':
      return <Clock className="h-3 w-3" />
    case 'EN_COURS':
      return <Loader2 className="h-3 w-3 animate-spin" />
    case 'ANALYSE':
      return <CheckCircle2 className="h-3 w-3" />
    case 'ERREUR':
      return <AlertCircle className="h-3 w-3" />
    default:
      return null
  }
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function truncateFileName(name: string, maxLen: number = 32): string {
  if (name.length <= maxLen) return name
  const ext = name.lastIndexOf('.')
  if (ext === -1) return name.slice(0, maxLen - 3) + '...'
  const baseName = name.slice(0, ext)
  const extension = name.slice(ext)
  const availableLen = maxLen - extension.length - 3
  if (availableLen <= 0) return name.slice(0, maxLen - 3) + '...'
  return baseName.slice(0, availableLen) + '...' + extension
}

// ─── Component ───

export function DocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  const [documents, setDocuments] = useState<Document[]>([])
  const [ues, setUes] = useState<UE[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentDetail | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('folders')

  // ─── Search & Filters ───
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterUE, setFilterUE] = useState<string>('__all__')
  const [filterFileType, setFilterFileType] = useState<string>('__all__')
  const [filterStatus, setFilterStatus] = useState<string>('__all__')
  const [showFilters, setShowFilters] = useState(false)

  // ─── Bulk selection ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // ─── Upload dialog state ───
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<UploadFileEntry[]>([])
  const [selectedUEId, setSelectedUEId] = useState<string>('__none__')
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Debounced search ───
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, DEBOUNCE_DELAY)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  // ─── Filtered documents ───
  const filteredDocuments = useMemo(() => {
    let result = documents

    // Search filter
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase().trim()
      result = result.filter((doc) =>
        doc.nomFichier.toLowerCase().includes(query)
      )
    }

    // UE filter
    if (filterUE !== '__all__') {
      if (filterUE === '__none__') {
        result = result.filter((doc) => !doc.uniteEnseignementId)
      } else {
        result = result.filter((doc) => doc.uniteEnseignementId === filterUE)
      }
    }

    // File type filter
    if (filterFileType !== '__all__') {
      result = result.filter((doc) => {
        const type = doc.typeMime ? getFileTypeFromMime(doc.typeMime) : getFileTypeFromName(doc.nomFichier)
        return type === filterFileType
      })
    }

    // Status filter
    if (filterStatus !== '__all__') {
      result = result.filter((doc) => doc.statutAnalyse === filterStatus)
    }

    return result
  }, [documents, debouncedSearch, filterUE, filterFileType, filterStatus])

  const hasActiveFilters = debouncedSearch.trim() !== '' || filterUE !== '__all__' || filterFileType !== '__all__' || filterStatus !== '__all__'

  // ─── Fetch documents ───
  const fetchDocuments = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/documents?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents ?? [])
      }
    } catch {
      // Silent fail for polling
    }
  }, [user?.id])

  // ─── Fetch teacher's UEs ───
  const fetchUEs = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/unites-enseignement?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setUes(data.unitesEnseignement ?? [])
      }
    } catch {
      // Silent fail
    }
  }, [user?.id])

  // Initial fetch
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await Promise.all([fetchDocuments(), fetchUEs()])
      setIsLoading(false)
    }
    load()
  }, [fetchDocuments, fetchUEs])

  // Polling for EN_COURS or EN_ATTENTE documents
  useEffect(() => {
    const hasAnalysing = documents.some((d) => d.statutAnalyse === 'EN_COURS' || d.statutAnalyse === 'EN_ATTENTE')
    if (hasAnalysing) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchDocuments, 5000)
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [documents, fetchDocuments])

  // ─── Upload handlers ───
  const validateAndAddFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const currentCount = uploadFiles.length
    const availableSlots = MAX_UPLOAD_FILES - currentCount

    if (availableSlots <= 0) {
      toast.error('Limite atteinte', {
        description: `Vous ne pouvez importer que ${MAX_UPLOAD_FILES} fichiers à la fois.`,
      })
      return
    }

    const toAdd: UploadFileEntry[] = []
    const rejected: string[] = []

    for (let i = 0; i < Math.min(fileArray.length, availableSlots); i++) {
      const file = fileArray[i]

      if (!isFileExtensionAllowed(file.name)) {
        rejected.push(`${file.name} (format non supporté)`)
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} (fichier trop volumineux, max 50 Mo)`)
        continue
      }

      // Check for duplicates in current upload list
      const isDuplicate = uploadFiles.some((f) => f.file.name === file.name && f.file.size === file.size)
        || toAdd.some((f) => f.file.name === file.name && f.file.size === file.size)
      if (isDuplicate) {
        rejected.push(`${file.name} (déjà ajouté)`)
        continue
      }

      toAdd.push({ file, progress: 0, status: 'pending' })
    }

    if (fileArray.length > availableSlots) {
      toast.warning('Limite de fichiers', {
        description: `Seuls ${availableSlots} fichier(s) supplémentaire(s) peuvent être ajoutés (max ${MAX_UPLOAD_FILES}).`,
      })
    }

    if (rejected.length > 0) {
      toast.error('Fichiers rejetés', {
        description: rejected.join(', '),
      })
    }

    if (toAdd.length > 0) {
      setUploadFiles((prev) => [...prev, ...toAdd])
    }
  }

  const handleUploadAll = async () => {
    if (!user?.id) return
    const pendingFiles = uploadFiles.filter((f) => f.status === 'pending' || f.status === 'error')
    if (pendingFiles.length === 0) return

    for (const entry of pendingFiles) {
      setUploadFiles((prev) =>
        prev.map((f) => f.file === entry.file ? { ...f, status: 'uploading', progress: 10 } : f)
      )

      try {
        const formData = new FormData()
        formData.append('file', entry.file)
        formData.append('userId', user.id)
        if (selectedUEId && selectedUEId !== '__none__') {
          formData.append('uniteEnseignementId', selectedUEId)
        }

        // Simulate progress updates
        setUploadFiles((prev) =>
          prev.map((f) => f.file === entry.file ? { ...f, progress: 30 } : f)
        )

        const res = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        })

        setUploadFiles((prev) =>
          prev.map((f) => f.file === entry.file ? { ...f, progress: 80 } : f)
        )

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Erreur lors de l\'import')
        }

        const data = await res.json()

        setUploadFiles((prev) =>
          prev.map((f) => f.file === entry.file ? { ...f, progress: 100, status: 'done' } : f)
        )

        if (data.document?.statutAnalyse === 'ERREUR') {
          toast.warning(`${entry.file.name} — Avertissement`, {
            description: data.message || 'L\'extraction du texte a échoué.',
          })
        } else {
          toast.success(`${entry.file.name} importé`, {
            description: 'Le document a été importé avec succès.',
          })
        }
      } catch (err) {
        setUploadFiles((prev) =>
          prev.map((f) => f.file === entry.file ? {
            ...f,
            status: 'error',
            progress: 0,
            error: err instanceof Error ? err.message : 'Erreur inconnue',
          } : f)
        )
        toast.error(`Erreur — ${entry.file.name}`, {
          description: err instanceof Error ? err.message : 'Une erreur est survenue.',
        })
      }
    }

    await fetchDocuments()

    // Check if all are done
    setTimeout(() => {
      setUploadFiles((prev) => {
        const allDone = prev.every((f) => f.status === 'done')
        if (allDone) {
          // Close dialog after a brief delay
          setTimeout(() => {
            setUploadDialogOpen(false)
            setUploadFiles([])
            setSelectedUEId('__none__')
          }, 800)
        }
        return prev
      })
    }, 300)
  }

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // ─── Drag & drop handlers ───
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      validateAndAddFiles(files)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      validateAndAddFiles(files)
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Select document -> open sheet ───
  const handleSelectDocument = async (doc: Document) => {
    if (doc.statutAnalyse === 'EN_COURS') return
    try {
      const res = await fetch(`/api/documents/${doc.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedDocument(data.document ?? doc)
      } else {
        setSelectedDocument(doc)
      }
    } catch {
      setSelectedDocument(doc)
    }
    setSheetOpen(true)
  }

  // ─── Delete document ───
  const handleDeleteDocument = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/documents/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      toast.success('Document déplacé vers la corbeille', {
        description: `${deleteTarget.nomFichier} a été déplacé vers la corbeille. Vous pouvez le restaurer dans les 30 jours.`,
      })
      setSheetOpen(false)
      setSelectedDocument(null)
      setDeleteTarget(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      await fetchDocuments()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer le document.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Bulk delete ───
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setIsBulkDeleting(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      const data = await res.json().catch(() => ({}))
      toast.success(`${selectedIds.size} document(s) supprimé(s)`, {
        description: data.message || 'Les documents ont été déplacés vers la corbeille.',
      })
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      await fetchDocuments()
    } catch (err) {
      toast.error('Erreur de suppression', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer les documents.',
      })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // ─── Re-analyze / Analyze ───
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const handleReAnalyze = async () => {
    if (!selectedDocument) return
    setIsAnalyzing(true)
    try {
      const res = await fetch(`/api/documents/${selectedDocument.id}/analyze`, { method: 'POST', headers: {} })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'analyse')
      }
      const data = await res.json()
      toast.success('Analyse terminée', {
        description: data.analysis?.resumeCourt || 'Le document a été analysé avec succès.',
      })
      await fetchDocuments()
      const detailRes = await fetch(`/api/documents/${selectedDocument.id}`)
      if (detailRes.ok) {
        const detailData = await detailRes.json()
        setSelectedDocument(detailData.document ?? selectedDocument)
      }
    } catch (err) {
      toast.error('Erreur d\'analyse', {
        description: err instanceof Error ? err.message : 'Impossible d\'analyser le document.',
      })
      await fetchDocuments()
      const detailRes = await fetch(`/api/documents/${selectedDocument.id}`)
      if (detailRes.ok) {
        const detailData = await detailRes.json()
        setSelectedDocument(detailData.document ?? selectedDocument)
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ─── Navigate to questions-ia ───
  const handleGenerateQuestions = () => {
    router.push(PAGE_ROUTES['questions-ia'] + '?documentId=' + (selectedDocument?.id ?? ''))
    setSheetOpen(false)
  }

  // ─── Parsed analysis data ───
  const themes = parseJsonSafe<string[]>(selectedDocument?.themesDetectes ?? null, [])
  const concepts = parseJsonSafe<string[]>(selectedDocument?.conceptsCles ?? null, [])
  const volume = parseJsonSafe<Record<string, number>>(selectedDocument?.volumeEstime ?? null, {})

  const volumeEntries = Object.entries(volume).map(([key, value]) => {
    const label = (() => {
      switch (key) {
        case 'QCU': return 'QCU'
        case 'QCM': return 'QCM'
        case 'QRC': return 'QRC'
        case 'TRS': return 'TRS'
        default: return key
      }
    })()
    return { key, label, value }
  })

  const maxVolume = Math.max(...volumeEntries.map((v) => v.value), 1)

  // ─── Group documents by UE (useMemo instead of useCallback) ───
  const documentsByUE = useMemo(() => {
    const groups: { ueId: string | null; ue: UE | null; docs: Document[] }[] = []
    const ueMap = new Map<string, UE>()
    ues.forEach((ue) => ueMap.set(ue.id, ue))

    // Group by UE
    const docMap = new Map<string | null, Document[]>()
    filteredDocuments.forEach((doc) => {
      const key = doc.uniteEnseignementId ?? null
      if (!docMap.has(key)) {
        docMap.set(key, [])
      }
      docMap.get(key)!.push(doc)
    })

    // Add UE groups in order of UEs list
    ues.forEach((ue) => {
      const docs = docMap.get(ue.id) || []
      if (docs.length > 0) {
        groups.push({ ueId: ue.id, ue, docs })
      }
    })

    // Add documents without UE at the end
    const unassignedDocs = docMap.get(null) || []
    if (unassignedDocs.length > 0) {
      groups.push({ ueId: null, ue: null, docs: unassignedDocs })
    }

    return groups
  }, [filteredDocuments, ues])

  // Stats
  const totalDocs = documents.length
  const totalUEs = ues.length
  const filteredCount = filteredDocuments.length

  // ─── Selection helpers ───
  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDocuments.map((d) => d.id)))
    }
  }

  const isAllSelected = filteredDocuments.length > 0 && selectedIds.size === filteredDocuments.length

  const clearFilters = () => {
    setSearchQuery('')
    setFilterUE('__all__')
    setFilterFileType('__all__')
    setFilterStatus('__all__')
  }

  // ─── Document Card (reusable for grid/folder views) ───
  const renderDocumentCard = (doc: Document) => {
    const isSelected = selectedIds.has(doc.id)
    const isClickable = doc.statutAnalyse !== 'EN_COURS'
    const statusVariant =
      doc.statutAnalyse === 'ANALYSE' ? 'success' as const
      : doc.statutAnalyse === 'EN_COURS' ? 'warning' as const
      : doc.statutAnalyse === 'ERREUR' ? 'danger' as const
      : 'secondary' as const

    return (
      <div
        key={doc.id}
        className={`group relative rounded-lg ${
          isSelected ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-background' : ''
        }`}
        onClick={isClickable ? () => handleSelectDocument(doc) : undefined}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleSelectDocument(doc)
          }
        } : undefined}
      >
        {/* Checkbox overlay */}
        <div
          className="absolute top-2 left-2 z-20"
          onClick={(e) => toggleSelect(doc.id, e)}
        >
          <div className={`rounded-md p-0.5 transition-colors bg-card/80 backdrop-blur-sm ${
            isSelected
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-muted-foreground'
          }`}>
            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </div>
        </div>

        <EntityCard
          title={truncateFileName(doc.nomFichier)}
          subtitle={doc.tailleFichier ? formatFileSize(doc.tailleFichier) : 'Taille inconnue'}
          thumbnailIcon={getFileLucideIcon(doc)}
          badge={{ label: getStatusLabel(doc.statutAnalyse), variant: statusVariant }}
          meta={
            doc.uniteEnseignement
              ? `${doc.uniteEnseignement.code} · ${formatDate(doc.dateUpload)}`
              : formatDate(doc.dateUpload)
          }
        >
          {/* UE badge */}
          {doc.uniteEnseignement && (
            <div className="mt-2">
              <Badge
                variant="outline"
                className="gap-1 text-[9px] px-1 py-0 border-success/30 text-emerald-700 dark:border-success dark:text-emerald-300"
              >
                <BookOpen className="h-2.5 w-2.5" />
                {doc.uniteEnseignement.code}
              </Badge>
            </div>
          )}

          {/* Quick preview for analyzed docs */}
          {doc.statutAnalyse === 'ANALYSE' && (
            <div className="mt-2 flex flex-wrap gap-1">
              {parseJsonSafe<string[]>(doc.themesDetectes, [])
                .slice(0, 3)
                .map((theme, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="text-[10px] bg-success/10 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    {theme}
                  </Badge>
                ))}
              {parseJsonSafe<string[]>(doc.themesDetectes, []).length > 3 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{parseJsonSafe<string[]>(doc.themesDetectes, []).length - 3}
                </Badge>
              )}
            </div>
          )}
        </EntityCard>
      </div>
    )
  }

  // ─── Upload file entry ───
  const renderUploadFileEntry = (entry: UploadFileEntry, index: number) => (
    <div key={`${entry.file.name}-${index}`} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
      {getSmallFileIcon({ nomFichier: entry.file.name, typeMime: entry.file.type || null })}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.file.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)}</p>
          {entry.status === 'uploading' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {entry.progress}%
            </span>
          )}
          {entry.status === 'done' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Importé
            </span>
          )}
          {entry.status === 'error' && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {entry.error || 'Erreur'}
            </span>
          )}
        </div>
        {(entry.status === 'uploading' || entry.status === 'done') && (
          <Progress value={entry.progress} className="mt-1.5 h-1.5" />
        )}
      </div>
      {entry.status === 'pending' || entry.status === 'error' ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            removeUploadFile(index)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <div className="h-8 w-8 shrink-0" />
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight md:text-3xl">Mes Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Importez et gérez vos documents pédagogiques
            {!isLoading && (
              <span className="ml-1">
                — {totalDocs} document{totalDocs !== 1 ? 's' : ''} dans {totalUEs} UE{totalUEs !== 1 ? 's' : ''}
                {hasActiveFilters && filteredCount !== totalDocs && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {' '}({filteredCount} affiché{filteredCount !== 1 ? 's' : ''})
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle — 3 buttons */}
          {documents.length > 0 && (
            <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'folders' ? 'default' : 'ghost'}
                      size="sm"
                      className={`h-8 gap-1.5 rounded-md px-3 ${viewMode === 'folders' ? 'bg-success text-white' : ''}`}
                      onClick={() => setViewMode('folders')}
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Dossiers UE</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Dossiers UE</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      className={`h-8 gap-1.5 rounded-md px-3 ${viewMode === 'grid' ? 'bg-success text-white' : ''}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Grille</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Vue grille</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      className={`h-8 gap-1.5 rounded-md px-3 ${viewMode === 'list' ? 'bg-success text-white' : ''}`}
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Liste</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Vue liste</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
            setUploadDialogOpen(open)
            if (!open) {
              setUploadFiles([])
              setSelectedUEId('__none__')
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-success" size="lg">
                <Plus className="h-4 w-4" />
                Nouveau document
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importer des documents</DialogTitle>
                <DialogDescription>
                  Sélectionnez jusqu&apos;à {MAX_UPLOAD_FILES} fichiers à analyser pour générer des questions.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* UE Selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Unité d&apos;enseignement</Label>
                  <Select value={selectedUEId} onValueChange={setSelectedUEId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner une UE" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune UE</SelectItem>
                      {ues.map((ue) => (
                        <SelectItem key={ue.id} value={ue.id}>
                          {ue.code} — {ue.nom} ({ue.filiere.nom}, {ue.niveau})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Associez ces documents à une UE pour les retrouver facilement.
                  </p>
                </div>

                {/* Drag-and-drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed
                    p-8 transition-colors
                    ${isDragging
                      ? 'border-success bg-success/10 dark:bg-success-foreground/30'
                      : 'border-muted-foreground/25 hover:border-success/40 hover:bg-success/10/50 dark:hover:border-success dark:hover:bg-success-foreground/20'
                    }
                  `}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <FileUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="mt-3 text-sm font-medium">
                    Glissez-déposez vos fichiers ici
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ou cliquez pour parcourir
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    PDF, DOCX, PPTX, TXT, MD — Max 50 Mo — Jusqu&apos;à {MAX_UPLOAD_FILES} fichiers
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.markdown"
                    multiple
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>

                {/* Upload file list */}
                {uploadFiles.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {uploadFiles.map((entry, index) => renderUploadFileEntry(entry, index))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadDialogOpen(false)
                    setUploadFiles([])
                    setSelectedUEId('__none__')
                  }}
                  disabled={uploadFiles.some((f) => f.status === 'uploading')}
                >
                  Annuler
                </Button>
                <Button
                  className="bg-success"
                  onClick={handleUploadAll}
                  disabled={!uploadFiles.some((f) => f.status === 'pending' || f.status === 'error') || uploadFiles.some((f) => f.status === 'uploading')}
                >
                  {uploadFiles.some((f) => f.status === 'uploading') ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Importer{uploadFiles.filter((f) => f.status === 'pending' || f.status === 'error').length > 1 ? ` (${uploadFiles.filter((f) => f.status === 'pending' || f.status === 'error').length})` : ''}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ─── Search & Filters ─── */}
      {!isLoading && documents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              className={`gap-1.5 ${showFilters ? 'bg-success text-white' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filtres</span>
              {hasActiveFilters && (
                <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center bg-success/100 text-white">
                  {[debouncedSearch.trim() !== '', filterUE !== '__all__', filterFileType !== '__all__', filterStatus !== '__all__'].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
                Effacer les filtres
              </Button>
            )}
          </div>

          {/* Advanced filters panel */}
          {showFilters && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
              {/* UE filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Unité d&apos;enseignement</Label>
                <Select value={filterUE} onValueChange={setFilterUE}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Toutes les UE" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes les UE</SelectItem>
                    <SelectItem value="__none__">Sans UE</SelectItem>
                    {ues.map((ue) => (
                      <SelectItem key={ue.id} value={ue.id}>
                        {ue.code} — {ue.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* File type filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Type de fichier</Label>
                <Select value={filterFileType} onValueChange={setFilterFileType}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Tous les types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les types</SelectItem>
                    {FILE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Statut d&apos;analyse</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les statuts</SelectItem>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Bulk action bar ─── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/10 p-3 dark:border-success/20 dark:bg-success-foreground/30">
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={toggleSelectAll}
            className="border-success/40"
          />
          <span className="text-sm font-medium text-success">
            {selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''} sélectionné{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs"
          >
            Tout désélectionner
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EntityCard key={i} loading title="" />
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 dark:bg-success-foreground/30">
            <FolderOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 font-display tracking-tight text-lg font-semibold">Aucun document importé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Commencez par importer un document pédagogique pour permettre à l&apos;IA d&apos;analyser son contenu et générer des questions.
          </p>
          <Button
            className="mt-6 bg-success"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Importer un document
          </Button>
        </div>
      )}

      {/* ─── No results after filtering ─── */}
      {!isLoading && documents.length > 0 && filteredDocuments.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
          <Search className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-4 font-display tracking-tight text-base font-semibold">Aucun résultat</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Aucun document ne correspond à vos critères de recherche.
          </p>
          <Button variant="outline" className="mt-4" onClick={clearFilters}>
            Effacer les filtres
          </Button>
        </div>
      )}

      {/* ─── Folder view (Dossiers UE) ─── */}
      {!isLoading && filteredDocuments.length > 0 && viewMode === 'folders' && (
        <div className="space-y-2">
          {documentsByUE.length > 0 ? (
            <Accordion type="multiple" defaultValue={documentsByUE.map((g) => g.ueId ?? '__unassigned__')} className="space-y-3">
              {documentsByUE.map((group) => {
                const groupKey = group.ueId ?? '__unassigned__'
                const isUnassigned = group.ueId === null
                const ue = group.ue
                const docCount = group.docs.length
                const totalSize = group.docs.reduce((sum, d) => sum + (d.tailleFichier ?? 0), 0)

                return (
                  <AccordionItem
                    key={groupKey}
                    value={groupKey}
                    className="rounded-lg border bg-card overflow-hidden border-l-4 data-[state=open]:border-l-emerald-500 data-[state=closed]:border-l-emerald-400"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                          isUnassigned
                            ? 'bg-gray-100 dark:bg-gray-800/60'
                            : 'bg-success/10'
                        }`}>
                          <Folder className={`h-4.5 w-4.5 ${
                            isUnassigned
                              ? 'text-gray-500 dark:text-gray-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">
                              {isUnassigned
                                ? 'Autres documents'
                                : `${ue!.code} — ${ue!.nom}`}
                            </span>
                            {!isUnassigned && (
                              <>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-success/30 text-emerald-700 dark:border-success dark:text-emerald-300"
                                >
                                  {ue!.niveau}
                                </Badge>
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                  {ue!.filiere.nom}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {docCount} document{docCount !== 1 ? 's' : ''} — {formatFileSize(totalSize)}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-2">
                        {group.docs.map((doc) => renderDocumentCard(doc))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucun document à afficher</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Grid view (Grille) ─── */}
      {!isLoading && filteredDocuments.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocuments.map((doc) => renderDocumentCard(doc))}
        </div>
      )}

      {/* ─── List view (Liste — table) ─── */}
      {!isLoading && filteredDocuments.length > 0 && viewMode === 'list' && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Fichier</TableHead>
                <TableHead className="hidden md:table-cell">UE</TableHead>
                <TableHead className="hidden sm:table-cell">Taille</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => {
                const isSelected = selectedIds.has(doc.id)
                return (
                  <TableRow
                    key={doc.id}
                    className={`cursor-pointer ${isSelected ? 'bg-success/10/50 dark:bg-success-foreground/20' : ''}`}
                    onClick={() => handleSelectDocument(doc)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        {getSmallFileIcon(doc)}
                        <span className="truncate text-sm font-medium max-w-[200px]" title={doc.nomFichier}>
                          {truncateFileName(doc.nomFichier, 40)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {doc.uniteEnseignement ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] px-1 py-0 border-success/30 text-emerald-700 dark:border-success dark:text-emerald-300"
                        >
                          <BookOpen className="h-2.5 w-2.5" />
                          {doc.uniteEnseignement.code}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {doc.tailleFichier ? formatFileSize(doc.tailleFichier) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.dateUpload)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`gap-1 text-[10px] px-1.5 py-0 ${getStatusBadgeClasses(doc.statutAnalyse)}`}
                      >
                        {getStatusIcon(doc.statutAnalyse)}
                        {getStatusLabel(doc.statutAnalyse)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(doc as DocumentDetail)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Analysis Detail Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pr-6">
            <SheetTitle className="flex items-center gap-2">
              {selectedDocument && getFileIcon(selectedDocument)}
              <span className="truncate">{selectedDocument?.nomFichier ?? 'Détails'}</span>
            </SheetTitle>
            <SheetDescription>
              {selectedDocument?.tailleFichier
                ? `${formatFileSize(selectedDocument.tailleFichier)} — ${formatDate(selectedDocument.dateUpload)}`
                : formatDate(selectedDocument?.dateUpload ?? '')
              }
            </SheetDescription>
          </SheetHeader>

          {selectedDocument && (
            <div className="flex flex-col gap-6 px-4 pb-4">
              {/* UE info */}
              {selectedDocument.uniteEnseignement && (
                <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 dark:border-success/20 dark:bg-success-foreground/30">
                  <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-success truncate">
                      {selectedDocument.uniteEnseignement.code} — {selectedDocument.uniteEnseignement.nom}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      {selectedDocument.uniteEnseignement.filiere.nom} · {selectedDocument.uniteEnseignement.niveau}
                    </p>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`gap-1 ${getStatusBadgeClasses(selectedDocument.statutAnalyse)}`}
                >
                  {getStatusIcon(selectedDocument.statutAnalyse)}
                  {getStatusLabel(selectedDocument.statutAnalyse)}
                </Badge>
              </div>

              {/* Error detail */}
              {selectedDocument.statutAnalyse === 'ERREUR' && selectedDocument.erreurAnalyse && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 dark:border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-300">{selectedDocument.erreurAnalyse}</p>
                </div>
              )}

              {/* ─── Actions IA ─── */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
                  <Brain className="h-4 w-4 text-emerald-600" />
                  Actions IA
                </h3>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={handleReAnalyze}
                    disabled={isAnalyzing || selectedDocument.statutAnalyse === 'EN_COURS'}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                    )}
                    Résumer avec l&apos;IA
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={handleGenerateQuestions}
                    disabled={selectedDocument.statutAnalyse !== 'ANALYSE'}
                  >
                    <MessageSquareText className="h-4 w-4 text-teal-600" />
                    Générer des questions
                  </Button>
                </div>
                {selectedDocument.statutAnalyse !== 'ANALYSE' && selectedDocument.statutAnalyse !== 'ERREUR' && (
                  <p className="text-xs text-muted-foreground">
                    L&apos;analyse doit être terminée pour générer des questions.
                  </p>
                )}
              </section>

              <Separator />

              {/* Résumé */}
              {selectedDocument.resumeAnalyse && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    Résumé
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedDocument.resumeAnalyse}
                  </p>
                </section>
              )}

              {/* Thèmes détectés */}
              {themes.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    Thèmes détectés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {themes.map((theme, i) => (
                      <Badge
                        key={i}
                        className="bg-success/10 text-emerald-800 border-success/20 dark:text-emerald-300 dark:border-success/20"
                      >
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Concepts clés */}
              {concepts.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
                    <Lightbulb className="h-4 w-4 text-teal-600" />
                    Concepts clés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {concepts.map((concept, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="border-secondary/30 text-teal-700 dark:border-teal-700 dark:text-teal-300"
                      >
                        {concept}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Volume estimé */}
              {volumeEntries.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                    Volume estimé
                  </h3>
                  <div className="space-y-3">
                    {volumeEntries.map(({ key, label, value }) => {
                      const pct = Math.round((value / maxVolume) * 100)
                      const colorMap: Record<string, string> = {
                        QCU: 'bg-success/100',
                        QCM: 'bg-secondary',
                        QRC: 'bg-warning',
                        TRS: 'bg-destructive',
                      }
                      const bgMap: Record<string, string> = {
                        QCU: 'bg-success/10',
                        QCM: 'bg-secondary/10',
                        QRC: 'bg-warning/10',
                        TRS: 'bg-destructive',
                      }
                      const textColorMap: Record<string, string> = {
                        QCU: 'text-success',
                        QCM: 'text-teal-700 dark:text-teal-300',
                        QRC: 'text-warning',
                        TRS: 'text-rose-700 dark:text-rose-300',
                      }
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${textColorMap[key] ?? 'text-foreground'}`}>{label}</span>
                            <span className="text-muted-foreground">{value} question{value !== 1 ? 's' : ''}</span>
                          </div>
                          <div className={`h-2 rounded-full ${bgMap[key] ?? 'bg-muted'}`}>
                            <div
                              className={`h-full rounded-full ${colorMap[key] ?? 'bg-primary'} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Actions */}
              <Separator />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setDeleteTarget(selectedDocument)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setSheetOpen(false)
                    handleReAnalyze()
                  }}
                  disabled={isAnalyzing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  Relancer l&apos;analyse
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Delete confirm dialog (single) ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le document <strong>{deleteTarget?.nomFichier}</strong> sera déplacé vers la corbeille.
              Vous pourrez le restaurer dans les 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocument}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk delete confirm dialog ─── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les documents sélectionnés seront déplacés vers la corbeille.
              Vous pourrez les restaurer dans les 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Suppression...
                </>
              ) : (
                `Supprimer (${selectedIds.size})`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
