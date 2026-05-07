'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import {
  FileUp,
  FileText,
  File,
  Presentation,
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
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

// ─── Types ───

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
}

interface DocumentDetail extends Document {
  resumeAnalyse?: string | null
}

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

function getFileIcon(doc: Document): ReactNode {
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
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'ANALYSE':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'ERREUR':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
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
  const { setCurrentPage } = useNavigationStore()

  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Initial fetch
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchDocuments()
      setIsLoading(false)
    }
    load()
  }, [fetchDocuments])

  // Polling for EN_COURS documents
  useEffect(() => {
    const hasAnalysing = documents.some((d) => d.statutAnalyse === 'EN_COURS')
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

  // ─── Upload handler ───
  const handleUpload = async () => {
    if (!selectedFile || !user?.id) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('userId', user.id)

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'import')
      }

      toast.success('Document importé', {
        description: `${selectedFile.name} a été importé avec succès.`,
      })

      setSelectedFile(null)
      setUploadDialogOpen(false)
      await fetchDocuments()
    } catch (err) {
      toast.error('Erreur d\'import', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'import.',
      })
    } finally {
      setIsUploading(false)
    }
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
      setSelectedFile(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  // ─── Select document -> open sheet ───
  const handleSelectDocument = async (doc: Document) => {
    if (doc.statutAnalyse !== 'ANALYSE' && doc.statutAnalyse !== 'ERREUR') return
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

  // ─── Re-analyze ───
  const handleReAnalyze = async () => {
    if (!selectedDocument) return
    try {
      const res = await fetch(`/api/documents/${selectedDocument.id}/analyze`, { method: 'POST' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Analyse relancée', {
        description: 'L\'analyse du document a été relancée.',
      })
      await fetchDocuments()
      // Refresh the selected doc
      const detailRes = await fetch(`/api/documents/${selectedDocument.id}`)
      if (detailRes.ok) {
        const data = await detailRes.json()
        setSelectedDocument(data.document ?? selectedDocument)
      }
    } catch {
      toast.error('Erreur', {
        description: 'Impossible de relancer l\'analyse.',
      })
    }
  }

  // ─── Navigate to questions-ia ───
  const handleGenerateQuestions = () => {
    setCurrentPage('questions-ia', { documentId: selectedDocument?.id ?? '' })
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

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mes Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Importez et gérez vos documents pédagogiques
          </p>
        </div>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="lg">
              <Plus className="h-4 w-4" />
              Nouveau document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Importer un document</DialogTitle>
              <DialogDescription>
                Sélectionnez un fichier à analyser pour générer des questions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
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
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                    : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20'
                  }
                `}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <FileUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-3 text-sm font-medium">
                  Glissez-déposez votre fichier ici
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ou cliquez pour parcourir
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  PDF, DOCX, PPTX, TXT, MD — Max 50 Mo
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.markdown"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {/* File preview */}
              {selectedFile && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  {getFileIcon({
                    id: '',
                    nomFichier: selectedFile.name,
                    tailleFichier: selectedFile.size,
                    typeMime: selectedFile.type,
                    statutAnalyse: 'EN_ATTENTE',
                    themesDetectes: null,
                    conceptsCles: null,
                    volumeEstime: null,
                    dateUpload: new Date().toISOString(),
                  })}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false)
                  setSelectedFile(null)
                }}
                disabled={isUploading}
              >
                Annuler
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importer
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex flex-col gap-3 pt-0">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-3 w-1/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <FolderOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun document importé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Commencez par importer un document pédagogique pour permettre à l&apos;IA d&apos;analyser son contenu et générer des questions.
          </p>
          <Button
            className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Importer un document
          </Button>
        </div>
      )}

      {/* ─── Documents grid ─── */}
      {!isLoading && documents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className={`group relative transition-shadow hover:shadow-md ${
                doc.statutAnalyse === 'ANALYSE' || doc.statutAnalyse === 'ERREUR'
                  ? 'cursor-pointer'
                  : ''
              }`}
              onClick={() => handleSelectDocument(doc)}
            >
              <CardContent className="flex flex-col gap-3 pt-0">
                {/* File info row */}
                <div className="flex items-start gap-3">
                  {getFileIcon(doc)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={doc.nomFichier}>
                      {truncateFileName(doc.nomFichier)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {doc.tailleFichier ? formatFileSize(doc.tailleFichier) : 'Taille inconnue'}
                    </p>
                  </div>
                </div>

                {/* Date + status */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(doc.dateUpload)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`gap-1 text-[10px] px-1.5 py-0 ${getStatusBadgeClasses(doc.statutAnalyse)}`}
                  >
                    {getStatusIcon(doc.statutAnalyse)}
                    {getStatusLabel(doc.statutAnalyse)}
                  </Badge>
                </div>

                {/* Quick preview for analyzed docs */}
                {doc.statutAnalyse === 'ANALYSE' && (
                  <div className="flex flex-wrap gap-1">
                    {parseJsonSafe<string[]>(doc.themesDetectes, [])
                      .slice(0, 3)
                      .map((theme, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        >
                          {theme}
                        </Badge>
                      ))}
                    {parseJsonSafe<string[]>(doc.themesDetectes, []).length > 3 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                      >
                        +{parseJsonSafe<string[]>(doc.themesDetectes, []).length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
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

              <Separator />

              {/* Résumé */}
              {selectedDocument.resumeAnalyse && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
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
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    Thèmes détectés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {themes.map((theme, i) => (
                      <Badge
                        key={i}
                        className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800"
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
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb className="h-4 w-4 text-teal-600" />
                    Concepts clés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {concepts.map((concept, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300"
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
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                    Volume estimé
                  </h3>
                  <div className="space-y-3">
                    {volumeEntries.map(({ key, label, value }) => {
                      const pct = Math.round((value / maxVolume) * 100)
                      const colorMap: Record<string, string> = {
                        QCU: 'bg-emerald-500',
                        QCM: 'bg-teal-500',
                        QRC: 'bg-amber-500',
                        TRS: 'bg-rose-500',
                      }
                      const bgMap: Record<string, string> = {
                        QCU: 'bg-emerald-100 dark:bg-emerald-900/30',
                        QCM: 'bg-teal-100 dark:bg-teal-900/30',
                        QRC: 'bg-amber-100 dark:bg-amber-900/30',
                        TRS: 'bg-rose-100 dark:bg-rose-900/30',
                      }
                      const textColorMap: Record<string, string> = {
                        QCU: 'text-emerald-700 dark:text-emerald-300',
                        QCM: 'text-teal-700 dark:text-teal-300',
                        QRC: 'text-amber-700 dark:text-amber-300',
                        TRS: 'text-rose-700 dark:text-rose-300',
                      }
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${textColorMap[key] ?? 'text-foreground'}`}>
                              {label}
                            </span>
                            <span className="text-muted-foreground">{value} question{value > 1 ? 's' : ''}</span>
                          </div>
                          <div className={`h-2 w-full overflow-hidden rounded-full ${bgMap[key] ?? 'bg-muted'}`}>
                            <div
                              className={`h-full rounded-full transition-all ${colorMap[key] ?? 'bg-emerald-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Total estimé : {volumeEntries.reduce((sum, v) => sum + v.value, 0)} questions possibles
                  </p>
                </section>
              )}

              {/* No analysis data */}
              {selectedDocument.statutAnalyse === 'ERREUR' && (
                <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        Erreur lors de l&apos;analyse
                      </p>
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        L&apos;analyse de ce document a échoué. Vous pouvez relancer l&apos;analyse ci-dessous.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {selectedDocument.statutAnalyse === 'ANALYSE' && themes.length === 0 && concepts.length === 0 && volumeEntries.length === 0 && !selectedDocument.resumeAnalyse && (
                <section className="rounded-lg border border-muted bg-muted/30 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Aucune donnée d&apos;analyse disponible.
                  </p>
                </section>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 w-full"
                  onClick={handleGenerateQuestions}
                  disabled={selectedDocument.statutAnalyse !== 'ANALYSE'}
                >
                  <Sparkles className="h-4 w-4" />
                  Générer des questions
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  onClick={handleReAnalyze}
                  disabled={selectedDocument.statutAnalyse === 'EN_COURS'}
                >
                  {selectedDocument.statutAnalyse === 'EN_COURS' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Relancer l&apos;analyse
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
