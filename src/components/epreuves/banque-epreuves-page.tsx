'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Library,
  Search,
  Filter,
  Eye,
  Copy,
  Trash2,
  Clock,
  Trophy,
  HelpCircle,
  FileText,
  Sparkles,
  Edit3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Calendar,
  BookOpen,
  Hash,
  AlertTriangle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

// ─── Types ───

interface ContenuQuestion {
  id: string
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION'
  enonce: string
  propositions: Array<{ id: string; text: string }> | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'
  bareme: number
}

interface Contenu {
  questions: ContenuQuestion[]
  consignes?: string
  baremeTotal: number
}

interface BanqueEpreuve {
  id: string
  titre: string
  description: string | null
  duree: number
  statut: string
  generationMode: 'MANUELLE' | 'IA_ASSISTEE'
  isTemplate: boolean
  contenu: Contenu | null
  questionCount: number
  baremeTotal: number
  typeDistribution: Record<string, number>
  sourceDocuments: Array<{ id: string; nomFichier: string }>
  filiere: { id: string; nom: string; code: string | null } | null
  uniteEnseignement: { id: string; nom: string; code: string | null } | null
  sessionCount: number
  hasContenuFormat: boolean
  createdAt: string
  updatedAt: string
}

// ─── Utility functions ───

const TYPE_COLORS: Record<string, string> = {
  QCU: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
  QCM: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  QRC: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  REFLEXION: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
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

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Component ───

export function BanqueEpreuvesPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  // Data state
  const [epreuves, setEpreuves] = useState<BanqueEpreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('TOUS')

  // Dialog state
  const [previewEpreuve, setPreviewEpreuve] = useState<BanqueEpreuve | null>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BanqueEpreuve | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<BanqueEpreuve | null>(null)
  const [duplicateTitre, setDuplicateTitre] = useState('')
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Expanded questions in preview
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch epreuves from banque
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
      toast.error('Erreur', { description: 'Impossible de charger la banque d\'épreuves.' })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, debouncedSearch, modeFilter])

  useEffect(() => {
    fetchBanque()
  }, [fetchBanque])

  // Toggle expanded question
  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // View exam preview
  const handlePreview = (epreuve: BanqueEpreuve) => {
    setPreviewEpreuve(epreuve)
    setExpandedQuestions(new Set())
    setPreviewDialogOpen(true)
  }

  // Delete exam
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/epreuves/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur')
      }
      toast.success('Épreuve déplacée vers la corbeille', {
        description: `"${deleteTarget.titre}" a été supprimée de la banque.`,
      })
      setDeleteTarget(null)
      await fetchBanque()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de supprimer l\'épreuve.' })
    }
  }

  // Duplicate exam
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

      // Use contenu format if available
      if (duplicateTarget.contenu) {
        body.contenu = duplicateTarget.contenu
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

      toast.success('Épreuve dupliquée', {
        description: `"${duplicateTitre}" a été ajoutée à la banque.`,
      })
      setDuplicateTarget(null)
      await fetchBanque()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de dupliquer l\'épreuve.' })
    } finally {
      setIsDuplicating(false)
    }
  }

  // Open duplicate dialog
  const openDuplicate = (epreuve: BanqueEpreuve) => {
    setDuplicateTarget(epreuve)
    setDuplicateTitre(`${epreuve.titre} (copie)`)
  }

  // Render propositions for a question
  const renderPropositions = (q: ContenuQuestion) => {
    if (!q.propositions || q.propositions.length === 0) return null
    const correctAnswers = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte : q.reponseCorrecte ? [q.reponseCorrecte] : []

    return (
      <div className="space-y-1.5 mt-2">
        {q.propositions.map((prop, idx) => {
          const isCorrect = correctAnswers.includes(prop.id)
          return (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                isCorrect
                  ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : 'bg-muted/30'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                  isCorrect
                    ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
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

  // Stats
  const totalEpreuves = epreuves.length
  const iaEpreuves = epreuves.filter((e) => e.generationMode === 'IA_ASSISTEE').length
  const manuelleEpreuves = totalEpreuves - iaEpreuves
  const totalQuestions = epreuves.reduce((sum, e) => sum + e.questionCount, 0)

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Library className="h-7 w-7 text-emerald-600" />
            Banque d&apos;Épreuves
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez et gérez vos épreuves complètes prêtes à l&apos;emploi
          </p>
        </div>
        <div className="flex gap-2">
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

      {/* ─── Statistics Card ─── */}
      {!isLoading && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardContent className="flex flex-wrap items-center gap-4 p-4 md:gap-6 md:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <Library className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Épreuves</p>
                <p className="text-lg font-bold">{totalEpreuves}</p>
              </div>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-sm">
                <span className="font-semibold">{iaEpreuves}</span>{' '}
                <span className="text-muted-foreground">générées par IA</span>
              </span>
              <span className="text-muted-foreground">·</span>
              <Edit3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm">
                <span className="font-semibold">{manuelleEpreuves}</span>{' '}
                <span className="text-muted-foreground">manuelles</span>
              </span>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sm">
                <span className="font-semibold">{totalQuestions}</span>{' '}
                <span className="text-muted-foreground">questions au total</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Search & Filters ─── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une épreuve..."
            className="pl-9"
          />
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

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-3">
                <div className="h-5 w-48 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="flex gap-3">
                  <div className="h-6 w-16 rounded-full bg-muted" />
                  <div className="h-6 w-16 rounded-full bg-muted" />
                  <div className="h-6 w-20 rounded-full bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && epreuves.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Library className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune épreuve dans la banque</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || modeFilter !== 'TOUS'
              ? 'Aucune épreuve ne correspond à vos critères. Modifiez vos filtres.'
              : 'Commencez par générer une épreuve via l\'IA ou créez-en une manuellement.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!search && modeFilter === 'TOUS' && (
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => router.push(PAGE_ROUTES['questions-ia'])}
              >
                <Sparkles className="h-4 w-4" />
                Générer par IA
              </Button>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => router.push(PAGE_ROUTES.epreuves)}
            >
              <BookOpen className="h-4 w-4" />
              Créer une épreuve
            </Button>
          </div>
        </div>
      )}

      {/* ─── Exam list ─── */}
      {!isLoading && epreuves.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {epreuves.map((epreuve) => {
            const typeEntries = Object.entries(epreuve.typeDistribution)

            return (
              <Card key={epreuve.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-6">
                  {/* Title + mode badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight">{epreuve.titre}</h3>
                      {epreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {epreuve.description.length > 100 ? epreuve.description.slice(0, 100) + '...' : epreuve.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={epreuve.generationMode === 'IA_ASSISTEE'
                        ? 'gap-1 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
                        : 'gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                      }
                    >
                      {epreuve.generationMode === 'IA_ASSISTEE' ? <><Sparkles className="h-3 w-3" /> IA</> : <><Edit3 className="h-3 w-3" /> Manuelle</>}
                    </Badge>
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      <HelpCircle className="h-3 w-3" />
                      {epreuve.questionCount} question{epreuve.questionCount > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      <Trophy className="h-3 w-3" />
                      {epreuve.baremeTotal} pts
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                      <Clock className="h-3 w-3" />
                      {epreuve.duree} min
                    </Badge>
                  </div>

                  {/* Type distribution */}
                  {typeEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {typeEntries.map(([type, count]) => (
                        <Badge key={type} variant="outline" className={`text-[10px] gap-0.5 py-0 ${TYPE_COLORS[type] || ''}`}>
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Source documents */}
                  {epreuve.sourceDocuments.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {epreuve.sourceDocuments.map((d) => d.nomFichier).join(', ')}
                    </div>
                  )}

                  {/* Filère / UE */}
                  {(epreuve.filiere || epreuve.uniteEnseignement) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      {epreuve.filiere?.nom}{epreuve.filiere && epreuve.uniteEnseignement ? ' · ' : ''}{epreuve.uniteEnseignement?.nom}
                    </div>
                  )}

                  {/* Creation date */}
                  <div className="text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Créée le {formatDate(epreuve.createdAt)}
                  </div>

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      onClick={() => handlePreview(epreuve)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Aperçu
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDuplicate(epreuve)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Dupliquer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      onClick={() => setDeleteTarget(epreuve)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Preview Dialog ─── */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" />
              Aperçu de l&apos;épreuve
            </DialogTitle>
            {previewEpreuve && (
              <DialogDescription>
                {previewEpreuve.titre} — {previewEpreuve.questionCount} question(s) · {previewEpreuve.baremeTotal} pts
              </DialogDescription>
            )}
          </DialogHeader>

          {previewEpreuve?.contenu && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {/* Consignes */}
              {previewEpreuve.contenu.consignes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Consignes</p>
                  <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{previewEpreuve.contenu.consignes}</p>
                </div>
              )}

              {/* Questions */}
              {previewEpreuve.contenu.questions.map((q, idx) => {
                const isExpanded = expandedQuestions.has(q.id)

                return (
                  <Card key={q.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                          {idx + 1}
                        </span>
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[q.type] || ''}`}>
                          {q.type}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${DIFFICULTE_COLORS[q.difficulte] || ''}`}>
                          {DIFFICULTE_LABELS[q.difficulte] || q.difficulte}
                        </Badge>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {q.bareme} pt{q.bareme > 1 ? 's' : ''}
                        </Badge>
                      </div>

                      {/* Énoncé */}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enonce}</p>

                      {/* Propositions for QCU/QCM */}
                      {(q.type === 'QCU' || q.type === 'QCM') && renderPropositions(q)}

                      {/* Réponse for QRC/REFLEXION */}
                      {(q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => toggleExpand(q.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {q.type === 'QRC' ? 'Réponse modèle' : 'Guide de correction'}
                          </button>
                          {isExpanded && (
                            <div className={`mt-2 rounded-md border p-3 text-sm whitespace-pre-wrap ${
                              q.type === 'QRC'
                                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                                : 'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/50'
                            }`}>
                              {Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Explication */}
                      {q.explication && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => toggleExpand(`exp-${q.id}`)}
                          >
                            {expandedQuestions.has(`exp-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Explication
                          </button>
                          {expandedQuestions.has(`exp-${q.id}`) && (
                            <div className="mt-2 rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground">
                              {q.explication}
                            </div>
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
                <p className="text-sm font-medium">Format ancien détecté</p>
                <p className="text-xs mt-1">Cette épreuve utilise l&apos;ancien format (questions individuelles). Consultez-la depuis la page Épreuves.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Fermer
            </Button>
            {previewEpreuve && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setPreviewDialogOpen(false)
                  openDuplicate(previewEpreuve)
                }}
              >
                <Copy className="h-4 w-4" />
                Utiliser comme modèle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette épreuve ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;épreuve &quot;{deleteTarget?.titre}&quot; sera déplacée vers la corbeille. Vous pourrez la restaurer dans les 30 jours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Duplicate Dialog ─── */}
      <Dialog open={!!duplicateTarget} onOpenChange={(open) => { if (!open) setDuplicateTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-emerald-600" />
              Dupliquer l&apos;épreuve
            </DialogTitle>
            <DialogDescription>
              Créez une copie de &quot;{duplicateTarget?.titre}&quot; dans votre banque d&apos;épreuves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-titre">Titre de la copie</Label>
              <Input
                id="duplicate-titre"
                value={duplicateTitre}
                onChange={(e) => setDuplicateTitre(e.target.value)}
                placeholder="Titre de la nouvelle épreuve"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateTarget(null)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleDuplicate}
              disabled={isDuplicating || !duplicateTitre.trim()}
            >
              {isDuplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
