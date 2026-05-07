'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  Filter,
  Library,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  BookOpen,
  Hash,
  FileText,
  Star,
  AlertTriangle,
  X,
  PlusCircle,
  MinusCircle,
  Lightbulb,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
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
import { Textarea } from '@/components/ui/textarea'
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
import { toast } from 'sonner'

// ─── Types ───

interface Question {
  id: string
  documentId: string | null
  type: 'QCU' | 'QCM' | 'QRC' | 'TRS'
  enonce: string
  propositions: string[] | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'
  themes: string[] | null
  tags: string[] | null
  scoreQualite: number | null
  validee: boolean
  langue: string
  createdAt: string
  document?: { id: string; nomFichier: string } | null
}

interface QuestionsResponse {
  questions: Question[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface DocumentOption {
  id: string
  nomFichier: string
}

// ─── Utility functions ───

function getTypeBadgeConfig(type: Question['type']) {
  switch (type) {
    case 'QCU':
      return { label: 'QCU', className: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800' }
    case 'QCM':
      return { label: 'QCM', className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800' }
    case 'QRC':
      return { label: 'QRC', className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800' }
    case 'TRS':
      return { label: 'TRS', className: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800' }
  }
}

function getDifficulteBadgeConfig(difficulte: Question['difficulte']) {
  switch (difficulte) {
    case 'FACILE':
      return { label: 'Facile', className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800' }
    case 'MOYEN':
      return { label: 'Moyen', className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800' }
    case 'DIFFICILE':
      return { label: 'Difficile', className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800' }
    case 'EXPERT':
      return { label: 'Expert', className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800' }
  }
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Component ───

export function BanqueQuestionsPage() {
  const user = useAuthStore((s) => s.user)
  const { setCurrentPage } = useNavigationStore()

  // ─── Data state ───
  const [questions, setQuestions] = useState<Question[]>([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [documents, setDocuments] = useState<DocumentOption[]>([])

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('TOUS')
  const [difficulteFilter, setDifficulteFilter] = useState('TOUS')
  const [valideeFilter, setValideeFilter] = useState('TOUS')
  const [documentFilter, setDocumentFilter] = useState('TOUS')
  const [page, setPage] = useState(1)
  const limit = 20

  // ─── Dialog state ───
  const [detailQuestion, setDetailQuestion] = useState<Question | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null)

  // ─── Form state for creation ───
  const [formType, setFormType] = useState<'QCU' | 'QCM' | 'QRC' | 'TRS'>('QCU')
  const [formEnonce, setFormEnonce] = useState('')
  const [formPropositions, setFormPropositions] = useState<string[]>(['', '', ''])
  const [formReponseCorrecte, setFormReponseCorrecte] = useState<string[]>([])
  const [formReponseQRC, setFormReponseQRC] = useState('')
  const [formConsigneTRS, setFormConsigneTRS] = useState('')
  const [formGrilleTRS, setFormGrilleTRS] = useState('')
  const [formDifficulte, setFormDifficulte] = useState<'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'>('MOYEN')
  const [formThemes, setFormThemes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Expanded questions ───
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Debounced search ───
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [search])

  // ─── Fetch documents for filter ───
  useEffect(() => {
    if (!user?.id) return
    const fetchDocs = async () => {
      try {
        const res = await fetch(`/api/documents?userId=${user.id}`)
        if (res.ok) {
          const data = await res.json()
          const docs = (data.documents ?? []).map((d: { id: string; nomFichier: string }) => ({
            id: d.id,
            nomFichier: d.nomFichier,
          }))
          setDocuments(docs)
        }
      } catch {
        // Silent fail
      }
    }
    fetchDocs()
  }, [user?.id])

  // ─── Fetch questions ───
  const fetchQuestions = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        page: String(page),
        limit: String(limit),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (typeFilter !== 'TOUS') params.set('type', typeFilter)
      if (difficulteFilter !== 'TOUS') params.set('difficulte', difficulteFilter)
      if (valideeFilter !== 'TOUS') params.set('validee', valideeFilter === 'VALIDEES' ? 'true' : 'false')
      if (documentFilter !== 'TOUS') params.set('documentId', documentFilter)

      const res = await fetch(`/api/questions?${params.toString()}`)
      if (res.ok) {
        const data: QuestionsResponse = await res.json()
        setQuestions(data.questions ?? [])
        setTotalQuestions(data.total)
        setTotalPages(data.totalPages)
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les questions.' })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, page, debouncedSearch, typeFilter, difficulteFilter, valideeFilter, documentFilter])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // ─── Reset page on filter change ───
  useEffect(() => {
    setPage(1)
  }, [typeFilter, difficulteFilter, valideeFilter, documentFilter, debouncedSearch])

  // ─── Toggle question expansion ───
  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Open detail dialog ───
  const handleViewDetail = (q: Question) => {
    setDetailQuestion(q)
    setDetailDialogOpen(true)
  }

  // ─── Open edit dialog ───
  const handleEdit = (q: Question) => {
    setEditingQuestion(q)
    setFormType(q.type)
    setFormEnonce(q.enonce)
    setFormDifficulte(q.difficulte)
    setFormThemes(q.themes?.join(', ') ?? '')

    if (q.type === 'QCU' || q.type === 'QCM') {
      const props = q.propositions ?? ['', '', '']
      setFormPropositions(props.length >= 3 ? props : [...props, ...Array(Math.max(0, 3 - props.length)).fill('')])
      const rep = q.reponseCorrecte
      if (Array.isArray(rep)) {
        setFormReponseCorrecte(rep)
      } else if (typeof rep === 'string') {
        setFormReponseCorrecte([rep])
      } else {
        setFormReponseCorrecte([])
      }
      setFormReponseQRC('')
      setFormConsigneTRS('')
      setFormGrilleTRS('')
    } else if (q.type === 'QRC') {
      setFormReponseQRC(typeof q.reponseCorrecte === 'string' ? q.reponseCorrecte : '')
      setFormPropositions(['', '', ''])
      setFormReponseCorrecte([])
      setFormConsigneTRS('')
      setFormGrilleTRS('')
    } else if (q.type === 'TRS') {
      setFormConsigneTRS(q.enonce)
      setFormGrilleTRS(typeof q.reponseCorrecte === 'string' ? q.reponseCorrecte : '')
      setFormEnonce('')
      setFormPropositions(['', '', ''])
      setFormReponseCorrecte([])
      setFormReponseQRC('')
    }

    setEditDialogOpen(true)
  }

  // ─── Delete handler ───
  const handleDelete = async () => {
    if (!deletingQuestion) return
    try {
      const res = await fetch(`/api/questions/${deletingQuestion.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Question supprimée', {
        description: 'La question a été supprimée avec succès.',
      })
      await fetchQuestions()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer la question.' })
    } finally {
      setDeleteConfirmOpen(false)
      setDeletingQuestion(null)
    }
  }

  // ─── Reset form ───
  const resetForm = () => {
    setFormType('QCU')
    setFormEnonce('')
    setFormPropositions(['', '', ''])
    setFormReponseCorrecte([])
    setFormReponseQRC('')
    setFormConsigneTRS('')
    setFormGrilleTRS('')
    setFormDifficulte('MOYEN')
    setFormThemes('')
  }

  // ─── Create question ───
  const handleCreate = async () => {
    if (!user?.id) return
    if (!formEnonce.trim() && formType !== 'TRS') {
      toast.error('Champ requis', { description: 'L\'énoncé est obligatoire.' })
      return
    }
    if (formType === 'TRS' && !formConsigneTRS.trim()) {
      toast.error('Champ requis', { description: 'La consigne est obligatoire pour un TRS.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type: formType,
        auteurId: user.id,
        difficulte: formDifficulte,
        themes: formThemes
          ? formThemes.split(',').map((t) => t.trim()).filter(Boolean)
          : null,
      }

      if (formType === 'QCU' || formType === 'QCM') {
        body.enonce = formEnonce
        const validProps = formPropositions.filter((p) => p.trim())
        if (validProps.length < 3) {
          toast.error('Propositions insuffisantes', { description: 'Un QCU/QCM nécessite au moins 3 propositions.' })
          setIsSubmitting(false)
          return
        }
        body.propositions = validProps
        if (formReponseCorrecte.length === 0) {
          toast.error('Réponse manquante', { description: 'Veuillez sélectionner au moins une réponse correcte.' })
          setIsSubmitting(false)
          return
        }
        body.reponseCorrecte = formType === 'QCU' ? formReponseCorrecte[0] : formReponseCorrecte
      } else if (formType === 'QRC') {
        body.enonce = formEnonce
        body.reponseCorrecte = formReponseQRC || null
      } else if (formType === 'TRS') {
        body.enonce = formConsigneTRS
        body.reponseCorrecte = formGrilleTRS || null
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la création')
      }

      toast.success('Question créée', {
        description: 'La question a été créée et validée automatiquement.',
      })

      resetForm()
      setCreateDialogOpen(false)
      await fetchQuestions()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de créer la question.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Update question ───
  const handleUpdate = async () => {
    if (!editingQuestion) return
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        difficulte: formDifficulte,
        themes: formThemes
          ? formThemes.split(',').map((t) => t.trim()).filter(Boolean)
          : null,
      }

      if (formType === 'QCU' || formType === 'QCM') {
        body.enonce = formEnonce
        const validProps = formPropositions.filter((p) => p.trim())
        body.propositions = validProps
        body.reponseCorrecte = formType === 'QCU' ? formReponseCorrecte[0] : formReponseCorrecte
      } else if (formType === 'QRC') {
        body.enonce = formEnonce
        body.reponseCorrecte = formReponseQRC || null
      } else if (formType === 'TRS') {
        body.enonce = formConsigneTRS
        body.reponseCorrecte = formGrilleTRS || null
      }

      const res = await fetch(`/api/questions/${editingQuestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Erreur lors de la mise à jour')

      toast.success('Question mise à jour', {
        description: 'Les modifications ont été enregistrées.',
      })

      setEditDialogOpen(false)
      setEditingQuestion(null)
      await fetchQuestions()
    } catch {
      toast.error('Erreur', { description: 'Impossible de mettre à jour la question.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle correct answer for QCU/QCM ───
  const toggleCorrectAnswer = (index: string) => {
    if (formType === 'QCU') {
      setFormReponseCorrecte([index])
    } else {
      setFormReponseCorrecte((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index)
        }
        return [...prev, index]
      })
    }
  }

  // ─── Add / remove proposition ───
  const addProposition = () => {
    if (formPropositions.length < 5) {
      setFormPropositions([...formPropositions, ''])
    }
  }

  const removeProposition = (index: number) => {
    if (formPropositions.length > 3) {
      const newProps = formPropositions.filter((_, i) => i !== index)
      setFormPropositions(newProps)
      // Clean up correct answers referencing removed index
      const letterIndex = String.fromCharCode(65 + index)
      setFormReponseCorrecte((prev) => prev.filter((i) => i !== letterIndex))
    }
  }

  // ─── Statistics ───
  const stats = {
    total: totalQuestions,
    byType: {
      QCU: questions.filter((q) => q.type === 'QCU').length,
      QCM: questions.filter((q) => q.type === 'QCM').length,
      QRC: questions.filter((q) => q.type === 'QRC').length,
      TRS: questions.filter((q) => q.type === 'TRS').length,
    },
    validees: questions.filter((q) => q.validee).length,
    nonValidees: questions.filter((q) => !q.validee).length,
    avgScore: questions.length > 0
      ? Math.round(questions.reduce((sum, q) => sum + (q.scoreQualite ?? 0), 0) / questions.filter((q) => q.scoreQualite !== null).length || 0)
      : 0,
  }

  // ─── Render proposition list for detail ───
  const renderPropositions = (q: Question) => {
    if (!q.propositions || q.propositions.length === 0) return null
    const correctAnswers = Array.isArray(q.reponseCorrecte)
      ? q.reponseCorrecte
      : q.reponseCorrecte
        ? [q.reponseCorrecte]
        : []

    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Propositions
        </p>
        {q.propositions.map((prop, i) => {
          const letter = String.fromCharCode(65 + i)
          const isCorrect = correctAnswers.includes(letter)
          return (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                isCorrect
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                  : 'border-muted'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isCorrect
                    ? 'bg-emerald-600 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {letter}
              </span>
              <span className={isCorrect ? 'font-medium text-emerald-800 dark:text-emerald-200' : ''}>
                {prop}
              </span>
              {isCorrect && (
                <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Form for QCU/QCM ───
  const renderQCUQCMForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Énoncé *</Label>
        <Textarea
          value={formEnonce}
          onChange={(e) => setFormEnonce(e.target.value)}
          placeholder="Entrez l'énoncé de la question..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Propositions * (min 3, max 5)</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addProposition}
            disabled={formPropositions.length >= 5}
            className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
          >
            <PlusCircle className="mr-1 h-3 w-3" />
            Ajouter
          </Button>
        </div>
        <div className="space-y-2">
          {formPropositions.map((prop, i) => {
            const letter = String.fromCharCode(65 + i)
            const isSelected = formReponseCorrecte.includes(letter)
            return (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCorrectAnswer(letter)}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-muted-foreground/30 text-muted-foreground hover:border-emerald-400'
                  }`}
                >
                  {letter}
                </button>
                <Input
                  value={prop}
                  onChange={(e) => {
                    const newProps = [...formPropositions]
                    newProps[i] = e.target.value
                    setFormPropositions(newProps)
                  }}
                  placeholder={`Proposition ${letter}`}
                  className="flex-1"
                />
                {formPropositions.length > 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => removeProposition(i)}
                  >
                    <MinusCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {formType === 'QCU'
            ? 'Cliquez sur la lettre pour sélectionner la bonne réponse (1 seule).'
            : 'Cliquez sur les lettres pour sélectionner les bonnes réponses (plusieurs possibles).'}
        </p>
      </div>
    </div>
  )

  // ─── Form for QRC ───
  const renderQRCForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Énoncé *</Label>
        <Textarea
          value={formEnonce}
          onChange={(e) => setFormEnonce(e.target.value)}
          placeholder="Entrez l'énoncé de la question..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>Réponse attendue</Label>
        <Textarea
          value={formReponseQRC}
          onChange={(e) => setFormReponseQRC(e.target.value)}
          placeholder="Entrez la réponse modèle attendue..."
          rows={4}
        />
      </div>
    </div>
  )

  // ─── Form for TRS ───
  const renderTRSForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Consigne *</Label>
        <Textarea
          value={formConsigneTRS}
          onChange={(e) => setFormConsigneTRS(e.target.value)}
          placeholder="Entrez la consigne du test de réflexion structuré..."
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label>Grille de correction</Label>
        <Textarea
          value={formGrilleTRS}
          onChange={(e) => setFormGrilleTRS(e.target.value)}
          placeholder="Entrez la grille de correction détaillée..."
          rows={4}
        />
      </div>
    </div>
  )

  // ─── Common form fields (difficulty + themes) ───
  const renderCommonFields = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Difficulté</Label>
        <Select
          value={formDifficulte}
          onValueChange={(v) => setFormDifficulte(v as typeof formDifficulte)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FACILE">Facile</SelectItem>
            <SelectItem value="MOYEN">Moyen</SelectItem>
            <SelectItem value="DIFFICILE">Difficile</SelectItem>
            <SelectItem value="EXPERT">Expert</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Thèmes (séparés par des virgules)</Label>
        <Input
          value={formThemes}
          onChange={(e) => setFormThemes(e.target.value)}
          placeholder="ex: algorithmique, bases de données, réseaux"
        />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Banque de Questions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Parcourez et gérez toutes vos questions validées
          </p>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          size="lg"
          onClick={() => {
            resetForm()
            setCreateDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Ajouter une question
        </Button>
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
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{stats.total}</p>
              </div>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Par type :</span>
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800">
                QCU: {stats.byType.QCU}
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                QCM: {stats.byType.QCM}
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                QRC: {stats.byType.QRC}
              </Badge>
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                TRS: {stats.byType.TRS}
              </Badge>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm">
                <span className="font-semibold">{stats.validees}</span>{' '}
                <span className="text-muted-foreground">validées</span>
              </span>
              <span className="text-muted-foreground">·</span>
              <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span className="text-sm">
                <span className="font-semibold">{stats.nonValidees}</span>{' '}
                <span className="text-muted-foreground">non validées</span>
              </span>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-sm">
                <span className={`font-semibold ${getScoreColor(stats.avgScore)}`}>
                  {stats.avgScore > 0 ? stats.avgScore : '—'}
                </span>{' '}
                <span className="text-muted-foreground">qualité moy.</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Search & Filters (sticky) ─── */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 pb-4 pt-2 backdrop-blur-sm md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher dans les questions..."
                className="pl-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setSearch('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Type filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[120px]">
                  <Filter className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les types</SelectItem>
                  <SelectItem value="QCU">QCU</SelectItem>
                  <SelectItem value="QCM">QCM</SelectItem>
                  <SelectItem value="QRC">QRC</SelectItem>
                  <SelectItem value="TRS">TRS</SelectItem>
                </SelectContent>
              </Select>

              {/* Difficulty filter */}
              <Select value={difficulteFilter} onValueChange={setDifficulteFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Difficulté" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Toutes difficultés</SelectItem>
                  <SelectItem value="FACILE">Facile</SelectItem>
                  <SelectItem value="MOYEN">Moyen</SelectItem>
                  <SelectItem value="DIFFICILE">Difficile</SelectItem>
                  <SelectItem value="EXPERT">Expert</SelectItem>
                </SelectContent>
              </Select>

              {/* Validation filter */}
              <Select value={valideeFilter} onValueChange={setValideeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les statuts</SelectItem>
                  <SelectItem value="VALIDEES">Validées</SelectItem>
                  <SelectItem value="NON_VALIDEES">Non validées</SelectItem>
                </SelectContent>
              </Select>

              {/* Document filter */}
              <Select value={documentFilter} onValueChange={setDocumentFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les documents</SelectItem>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.nomFichier.length > 28
                        ? doc.nomFichier.slice(0, 25) + '...'
                        : doc.nomFichier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Chargement...
                </span>
              ) : (
                <><span className="font-semibold text-foreground">{totalQuestions}</span> question{totalQuestions !== 1 ? 's' : ''} trouvée{totalQuestions !== 1 ? 's' : ''}</>
              )}
            </p>
            {(search || typeFilter !== 'TOUS' || difficulteFilter !== 'TOUS' || valideeFilter !== 'TOUS' || documentFilter !== 'TOUS') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearch('')
                  setTypeFilter('TOUS')
                  setDifficulteFilter('TOUS')
                  setValideeFilter('TOUS')
                  setDocumentFilter('TOUS')
                }}
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-6 w-12 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune question trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || typeFilter !== 'TOUS' || difficulteFilter !== 'TOUS' || valideeFilter !== 'TOUS' || documentFilter !== 'TOUS'
              ? 'Aucune question ne correspond à vos critères de recherche. Essayez de modifier vos filtres.'
              : 'Commencez par générer des questions via l\'IA à partir de vos documents, ou ajoutez-en manuellement.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!search && typeFilter === 'TOUS' && difficulteFilter === 'TOUS' && valideeFilter === 'TOUS' && documentFilter === 'TOUS' && (
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => setCurrentPage('questions-ia')}
              >
                <Sparkles className="h-4 w-4" />
                Générer via l&apos;IA
              </Button>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                resetForm()
                setCreateDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Ajouter manuellement
            </Button>
          </div>
        </div>
      )}

      {/* ─── Question cards ─── */}
      {!isLoading && questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q) => {
            const typeBadge = getTypeBadgeConfig(q.type)
            const diffBadge = getDifficulteBadgeConfig(q.difficulte)
            const isExpanded = expandedQuestions.has(q.id)

            return (
              <Card
                key={q.id}
                className="group transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 md:p-5">
                  {/* Top row: badges + actions */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={typeBadge.className}>
                        {typeBadge.label}
                      </Badge>
                      <Badge variant="outline" className={diffBadge.className}>
                        {diffBadge.label}
                      </Badge>
                      {q.validee ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Validée
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <Clock className="h-3.5 w-3.5" />
                          Non validée
                        </span>
                      )}
                      {q.scoreQualite !== null && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${getScoreColor(q.scoreQualite)}`}>
                          <Star className="h-3 w-3" />
                          {q.scoreQualite}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs hover:text-emerald-600"
                        onClick={() => handleViewDetail(q)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Voir détail
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs hover:text-amber-600"
                        onClick={() => handleEdit(q)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs hover:text-red-600"
                        onClick={() => {
                          setDeletingQuestion(q)
                          setDeleteConfirmOpen(true)
                        }}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    </div>
                  </div>

                  {/* Question text */}
                  <div
                    className="mt-3 cursor-pointer"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <p className={`text-sm leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
                      {q.type === 'TRS' ? q.enonce : q.enonce}
                    </p>
                    {!isExpanded && q.enonce.length > 120 && (
                      <button className="mt-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
                        Cliquer pour voir la suite...
                      </button>
                    )}
                  </div>

                  {/* Bottom row: document + themes */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {q.document && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {q.document.nomFichier.length > 30
                          ? q.document.nomFichier.slice(0, 27) + '...'
                          : q.document.nomFichier}
                      </span>
                    )}
                    {!q.document && q.documentId === null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Pencil className="h-3 w-3" />
                        Création manuelle
                      </span>
                    )}
                    {q.themes && q.themes.length > 0 && (
                      <>
                        {q.document && <span className="text-xs text-muted-foreground">·</span>}
                        <div className="flex flex-wrap items-center gap-1">
                          {q.themes.slice(0, 3).map((theme, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-[10px] bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                            >
                              {theme}
                            </Badge>
                          ))}
                          {q.themes.length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{q.themes.length - 3}
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDate(q.createdAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Pagination ─── */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Précédent
          </Button>
          <p className="text-sm text-muted-foreground">
            Page <span className="font-semibold text-foreground">{page}</span> sur{' '}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ─── Question Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailQuestion && (
                <>
                  <Badge variant="outline" className={getTypeBadgeConfig(detailQuestion.type).className}>
                    {getTypeBadgeConfig(detailQuestion.type).label}
                  </Badge>
                  Détail de la question
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Informations complètes sur la question sélectionnée
            </DialogDescription>
          </DialogHeader>

          {detailQuestion && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-5">
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={getTypeBadgeConfig(detailQuestion.type).className}>
                    {getTypeBadgeConfig(detailQuestion.type).label}
                  </Badge>
                  <Badge variant="outline" className={getDifficulteBadgeConfig(detailQuestion.difficulte).className}>
                    {getDifficulteBadgeConfig(detailQuestion.difficulte).label}
                  </Badge>
                  {detailQuestion.validee ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Validée
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
                      <Clock className="h-3 w-3" />
                      Non validée
                    </Badge>
                  )}
                  {detailQuestion.scoreQualite !== null && (
                    <Badge variant="outline" className="gap-1">
                      <Star className={`h-3 w-3 ${getScoreColor(detailQuestion.scoreQualite)}`} />
                      <span className={getScoreColor(detailQuestion.scoreQualite)}>
                        Score : {detailQuestion.scoreQualite}/100
                      </span>
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Énoncé */}
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Hash className="h-4 w-4 text-emerald-600" />
                    Énoncé
                  </h3>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {detailQuestion.enonce}
                    </p>
                  </div>
                </section>

                {/* Propositions (QCU/QCM) */}
                {(detailQuestion.type === 'QCU' || detailQuestion.type === 'QCM') && renderPropositions(detailQuestion)}

                {/* Réponse attendue (QRC) */}
                {detailQuestion.type === 'QRC' && detailQuestion.reponseCorrecte && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <BookOpen className="h-4 w-4 text-emerald-600" />
                      Réponse attendue
                    </h3>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {typeof detailQuestion.reponseCorrecte === 'string'
                          ? detailQuestion.reponseCorrecte
                          : JSON.stringify(detailQuestion.reponseCorrecte)}
                      </p>
                    </div>
                  </section>
                )}

                {/* Grille de correction (TRS) */}
                {detailQuestion.type === 'TRS' && detailQuestion.reponseCorrecte && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <BookOpen className="h-4 w-4 text-emerald-600" />
                      Grille de correction
                    </h3>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {typeof detailQuestion.reponseCorrecte === 'string'
                          ? detailQuestion.reponseCorrecte
                          : JSON.stringify(detailQuestion.reponseCorrecte)}
                      </p>
                    </div>
                  </section>
                )}

                {/* Explication */}
                {detailQuestion.explication && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Lightbulb className="h-4 w-4 text-teal-600" />
                      Explication
                    </h3>
                    <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-950/20">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {detailQuestion.explication}
                      </p>
                    </div>
                  </section>
                )}

                {/* Themes */}
                {detailQuestion.themes && detailQuestion.themes.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Hash className="h-4 w-4 text-emerald-600" />
                      Thèmes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {detailQuestion.themes.map((theme, i) => (
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

                {/* Document source */}
                {detailQuestion.document && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      Document source
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {detailQuestion.document.nomFichier}
                    </p>
                  </section>
                )}

                <Separator />

                {/* Actions in dialog */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                    onClick={() => {
                      setDetailDialogOpen(false)
                      handleEdit(detailQuestion)
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                    onClick={() => {
                      setDetailDialogOpen(false)
                      setDeletingQuestion(detailQuestion)
                      setDeleteConfirmOpen(true)
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Create Question Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Ajouter une question manuellement</DialogTitle>
            <DialogDescription>
              Créez une nouvelle question. Les questions ajoutées manuellement sont automatiquement validées.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-5">
              {/* Type selector */}
              <div className="space-y-2">
                <Label>Type de question *</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(['QCU', 'QCM', 'QRC', 'TRS'] as const).map((t) => {
                    const config = getTypeBadgeConfig(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setFormType(t)
                          setFormPropositions(['', '', ''])
                          setFormReponseCorrecte([])
                          setFormReponseQRC('')
                          setFormConsigneTRS('')
                          setFormGrilleTRS('')
                          setFormEnonce('')
                        }}
                        className={`rounded-lg border-2 p-2.5 text-center text-sm font-medium transition-colors ${
                          formType === t
                            ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30'
                            : 'border-muted hover:border-emerald-300 dark:hover:border-emerald-800'
                        }`}
                      >
                        <Badge variant="outline" className={config.className}>
                          {config.label}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Dynamic form based on type */}
              {formType === 'QCU' || formType === 'QCM'
                ? renderQCUQCMForm()
                : formType === 'QRC'
                  ? renderQRCForm()
                  : renderTRSForm()}

              <Separator />

              {/* Common fields */}
              {renderCommonFields()}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false)
                resetForm()
              }}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCreate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Créer la question
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Question Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Modifier la question</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la question.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-5">
              {/* Type display (read-only when editing) */}
              <div className="space-y-2">
                <Label>Type de question</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getTypeBadgeConfig(formType).className}>
                    {getTypeBadgeConfig(formType).label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Le type ne peut pas être modifié
                  </span>
                </div>
              </div>

              {/* Dynamic form based on type */}
              {formType === 'QCU' || formType === 'QCM'
                ? renderQCUQCMForm()
                : formType === 'QRC'
                  ? renderQRCForm()
                  : renderTRSForm()}

              <Separator />

              {/* Common fields */}
              {renderCommonFields()}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditingQuestion(null)
              }}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleUpdate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Supprimer cette question ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La question sera définitivement supprimée de la banque.
              {deletingQuestion && (
                <span className="mt-2 block rounded-lg border bg-muted/30 p-2 text-sm">
                  &quot;{deletingQuestion.enonce.slice(0, 100)}{deletingQuestion.enonce.length > 100 ? '...' : ''}&quot;
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingQuestion(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
