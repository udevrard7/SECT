'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Sparkles,
  Loader2,
  FileText,
  Check,
  Pencil,
  RefreshCw,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  FileQuestion,
  Brain,
  ClipboardList,
  Plus,
  XCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

// ─── Type Definitions ───

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
  scoreQualite: number | null
  validee: boolean
  langue: string
  createdAt: string
}

interface DocumentInfo {
  id: string
  nomFichier: string
  tailleFichier: number | null
  typeMime: string | null
  statutAnalyse: string
  themesDetectes: string[] | null
  dateUpload: string
}

type QuestionFilter = 'TOUS' | 'QCU' | 'QCM' | 'QRC' | 'TRS'

// ─── Utility Functions ───

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value as string) as T
  } catch {
    return fallback
  }
}

function getDifficulteLabel(d: string): string {
  switch (d) {
    case 'FACILE': return 'Facile'
    case 'MOYEN': return 'Moyen'
    case 'DIFFICILE': return 'Difficile'
    case 'EXPERT': return 'Expert'
    default: return d
  }
}

function getDifficulteColor(d: string): string {
  switch (d) {
    case 'FACILE': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'MOYEN': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'DIFFICILE': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800'
    case 'EXPERT': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
    default: return ''
  }
}

function getTypeBadgeColor(type: string): string {
  switch (type) {
    case 'QCU': return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
    case 'QCM': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'QRC': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'TRS': return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800'
    default: return ''
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'QCU': return <CheckCircle2 className="h-3 w-3" />
    case 'QCM': return <ClipboardList className="h-3 w-3" />
    case 'QRC': return <FileQuestion className="h-3 w-3" />
    case 'TRS': return <Brain className="h-3 w-3" />
    default: return null
  }
}

function getQualityColor(score: number | null): string {
  if (score === null) return 'bg-muted'
  if (score < 40) return 'bg-red-500'
  if (score <= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function getQualityLabel(score: number | null): string {
  if (score === null) return 'N/A'
  if (score < 40) return 'Faible'
  if (score <= 70) return 'Moyen'
  return 'Bon'
}

// ─── Main Component ───

export function QuestionsIAPage() {
  const user = useAuthStore((s) => s.user)
  const { setCurrentPage, currentPageParams } = useNavigationStore()

  // ─── Document state ───
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)

  // ─── Generation config state ───
  const [qcuCount, setQcuCount] = useState(5)
  const [qcmCount, setQcmCount] = useState(3)
  const [qrcCount, setQrcCount] = useState(2)
  const [trsCount, setTrsCount] = useState(1)
  const [difficulte, setDifficulte] = useState<string>('MOYEN')
  const [selectedThemes, setSelectedThemes] = useState<string[]>([])
  const [langue, setLangue] = useState<string>('fr')
  const [tonPedagogique, setTonPedagogique] = useState<string>('Application directe')
  const [themesExclus, setThemesExclus] = useState<string>('')

  // ─── Questions state ───
  const [questions, setQuestions] = useState<Question[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [filter, setFilter] = useState<QuestionFilter>('TOUS')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Question>>({})
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set())

  // ─── Ref for scroll ───
  const questionsTopRef = useRef<HTMLDivElement>(null)

  // ─── Available themes from selected document ───
  const selectedDoc = documents.find((d) => d.id === selectedDocumentId)
  const availableThemes: string[] = selectedDoc?.themesDetectes ?? []

  // ─── Fetch documents ───
  const fetchDocuments = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingDocs(true)
    try {
      const res = await fetch(`/api/documents?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        const docs: DocumentInfo[] = (data.documents ?? []).map((doc: Record<string, unknown>) => ({
          id: doc.id as string,
          nomFichier: doc.nomFichier as string,
          tailleFichier: (doc.tailleFichier as number | null) ?? null,
          typeMime: (doc.typeMime as string | null) ?? null,
          statutAnalyse: doc.statutAnalyse as string,
          themesDetectes: parseJsonSafe<string[]>(doc.themesDetectes as string | null, []),
          dateUpload: doc.dateUpload as string,
        }))
        setDocuments(docs)
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoadingDocs(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-select document from navigation params
  useEffect(() => {
    if (currentPageParams?.documentId && !selectedDocumentId && documents.length > 0) {
      const paramDoc = documents.find((d) => d.id === currentPageParams.documentId)
      if (paramDoc && paramDoc.statutAnalyse === 'ANALYSE') {
        setSelectedDocumentId(paramDoc.id)
      }
    }
  }, [currentPageParams?.documentId, documents, selectedDocumentId])

  // Only show analyzed documents
  const analyzedDocuments = documents.filter((d) => d.statutAnalyse === 'ANALYSE')

  // ─── Toggle theme selection ───
  const toggleTheme = (theme: string) => {
    setSelectedThemes((prev) =>
      prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]
    )
  }

  // ─── Generate questions ───
  const handleGenerate = async () => {
    if (!selectedDocumentId || !user?.id) {
      toast.error('Sélection requise', {
        description: 'Veuillez sélectionner un document analysé.',
      })
      return
    }

    const total = qcuCount + qcmCount + qrcCount + trsCount
    if (total === 0) {
      toast.error('Aucune question', {
        description: 'Veuillez spécifier au moins un type de question.',
      })
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: selectedDocumentId,
          userId: user.id,
          config: {
            qcu: qcuCount,
            qcm: qcmCount,
            qrc: qrcCount,
            trs: trsCount,
            difficulte,
            themes: selectedThemes.length > 0 ? selectedThemes : undefined,
            langue,
            tonPedagogique,
            themesExclus: themesExclus
              ? themesExclus.split(',').map((t) => t.trim()).filter(Boolean)
              : undefined,
          },
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la génération')
      }

      const data = await res.json()
      const generated: Question[] = (data.questions ?? []).map((q: Record<string, unknown>) => ({
        id: q.id as string,
        documentId: (q.documentId as string | null) ?? null,
        type: q.type as Question['type'],
        enonce: q.enonce as string,
        propositions: parseJsonSafe<string[]>(q.propositions as string | null, null),
        reponseCorrecte: q.reponseCorrecte ?? null,
        explication: (q.explication as string | null) ?? null,
        difficulte: q.difficulte as Question['difficulte'],
        themes: parseJsonSafe<string[]>(q.themes as string | null, null),
        scoreQualite: (q.scoreQualite as number | null) ?? null,
        validee: (q.validee as boolean) ?? false,
        langue: (q.langue as string) ?? 'fr',
        createdAt: q.createdAt as string,
      }))

      setQuestions(generated)
      setFilter('TOUS')
      toast.success('Questions générées', {
        description: `${generated.length} question(s) générée(s) avec succès.`,
      })

      // Scroll to questions
      setTimeout(() => {
        questionsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err) {
      toast.error('Erreur de génération', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Validate question ───
  const handleValidate = async (questionId: string) => {
    setActionLoadingIds((prev) => new Set(prev).add(questionId))
    try {
      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'valider' }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== questionId) return q
          return {
            ...q,
            validee: true,
            propositions: parseJsonSafe<string[]>(data.question?.propositions ?? q.propositions as unknown as string | null, q.propositions),
            reponseCorrecte: data.question?.reponseCorrecte ?? q.reponseCorrecte,
            themes: parseJsonSafe<string[]>(data.question?.themes ?? q.themes as unknown as string | null, q.themes),
          }
        })
      )
      toast.success('Question validée')
    } catch {
      toast.error('Erreur', { description: 'Impossible de valider la question.' })
    } finally {
      setActionLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }

  // ─── Delete question ───
  const handleDelete = async (questionId: string) => {
    setActionLoadingIds((prev) => new Set(prev).add(questionId))
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      setQuestions((prev) => prev.filter((q) => q.id !== questionId))
      toast.success('Question supprimée')
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer la question.' })
    } finally {
      setActionLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }

  // ─── Regenerate question ───
  const handleRegenerate = async (question: Question) => {
    setRegeneratingIds((prev) => new Set(prev).add(question.id))
    try {
      const res = await fetch(`/api/questions/${question.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: question.documentId ?? selectedDocumentId,
          type: question.type,
          difficulte: question.difficulte,
        }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      const newQ = data.question as Record<string, unknown>
      const regenerated: Question = {
        id: newQ.id as string,
        documentId: (newQ.documentId as string | null) ?? null,
        type: newQ.type as Question['type'],
        enonce: newQ.enonce as string,
        propositions: parseJsonSafe<string[]>(newQ.propositions as string | null, null),
        reponseCorrecte: newQ.reponseCorrecte ?? null,
        explication: (newQ.explication as string | null) ?? null,
        difficulte: newQ.difficulte as Question['difficulte'],
        themes: parseJsonSafe<string[]>(newQ.themes as string | null, null),
        scoreQualite: (newQ.scoreQualite as number | null) ?? null,
        validee: (newQ.validee as boolean) ?? false,
        langue: (newQ.langue as string) ?? 'fr',
        createdAt: newQ.createdAt as string,
      }
      // Replace the old question with the new one
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? regenerated : q)))
      toast.success('Question régénérée')
    } catch {
      toast.error('Erreur', { description: 'Impossible de régénérer la question.' })
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev)
        next.delete(question.id)
        return next
      })
    }
  }

  // ─── Inline edit ───
  const startEditing = (question: Question) => {
    setEditingId(question.id)
    setEditData({
      enonce: question.enonce,
      propositions: question.propositions ? [...question.propositions] : null,
      reponseCorrecte: question.reponseCorrecte,
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEditing = async (questionId: string) => {
    setActionLoadingIds((prev) => new Set(prev).add(questionId))
    try {
      const body: Record<string, unknown> = {}
      if (editData.enonce !== undefined) body.enonce = editData.enonce
      if (editData.propositions !== undefined) body.propositions = editData.propositions
      if (editData.reponseCorrecte !== undefined) body.reponseCorrecte = editData.reponseCorrecte

      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()

      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== questionId) return q
          return {
            ...q,
            enonce: editData.enonce ?? q.enonce,
            propositions: editData.propositions ?? q.propositions,
            reponseCorrecte: editData.reponseCorrecte ?? q.reponseCorrecte,
          }
        })
      )
      setEditingId(null)
      setEditData({})
      toast.success('Question mise à jour')
    } catch {
      toast.error('Erreur', { description: 'Impossible de sauvegarder les modifications.' })
    } finally {
      setActionLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }

  // ─── Bulk actions ───
  const handleValidateAll = async () => {
    const unvalidated = questions.filter((q) => !q.validee)
    if (unvalidated.length === 0) {
      toast.info('Toutes les questions sont déjà validées')
      return
    }
    let successCount = 0
    for (const q of unvalidated) {
      try {
        const res = await fetch(`/api/questions/${q.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'valider' }),
        })
        if (res.ok) successCount++
      } catch {
        // Continue
      }
    }
    setQuestions((prev) => prev.map((q) => ({ ...q, validee: true })))
    toast.success(`${successCount} question(s) validée(s)`)
  }

  const handleDeleteNonValidated = async () => {
    const nonValidated = questions.filter((q) => !q.validee)
    if (nonValidated.length === 0) {
      toast.info('Aucune question non validée à supprimer')
      return
    }
    let successCount = 0
    for (const q of nonValidated) {
      try {
        const res = await fetch(`/api/questions/${q.id}`, { method: 'DELETE' })
        if (res.ok) successCount++
      } catch {
        // Continue
      }
    }
    setQuestions((prev) => prev.filter((q) => q.validee))
    toast.success(`${successCount} question(s) supprimée(s)`)
  }

  // ─── Toggle explanation ───
  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Edit proposition handler ───
  const updateEditProposition = (index: number, value: string) => {
    setEditData((prev) => {
      const props = prev.propositions ? [...prev.propositions] : []
      props[index] = value
      return { ...prev, propositions: props }
    })
  }

  // ─── Filtered questions ───
  const filteredQuestions =
    filter === 'TOUS' ? questions : questions.filter((q) => q.type === filter)

  const filterCounts: Record<QuestionFilter, number> = {
    TOUS: questions.length,
    QCU: questions.filter((q) => q.type === 'QCU').length,
    QCM: questions.filter((q) => q.type === 'QCM').length,
    QRC: questions.filter((q) => q.type === 'QRC').length,
    TRS: questions.filter((q) => q.type === 'TRS').length,
  }

  // ─── Get correct answer letters for display ───
  const getCorrectAnswers = (question: Question): string[] => {
    if (!question.reponseCorrecte) return []
    if (Array.isArray(question.reponseCorrecte)) return question.reponseCorrecte
    if (typeof question.reponseCorrecte === 'string') return [question.reponseCorrecte]
    return []
  }

  const isCorrectOption = (question: Question, letter: string): boolean => {
    return getCorrectAnswers(question).includes(letter)
  }

  // ─── Render question propositions ───
  const renderPropositions = (question: Question, isEditing: boolean) => {
    if (!question.propositions || question.propositions.length === 0) return null

    const letters = ['A', 'B', 'C', 'D', 'E', 'F']

    if (isEditing && editData.propositions) {
      return (
        <div className="space-y-2 mt-3">
          <Label className="text-xs font-medium text-muted-foreground">Propositions</Label>
          {editData.propositions.map((prop, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
                {letters[idx]}
              </span>
              <Input
                value={prop}
                onChange={(e) => updateEditProposition(idx, e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="space-y-1.5 mt-3">
        <Label className="text-xs font-medium text-muted-foreground">Propositions</Label>
        {question.propositions.map((prop, idx) => {
          const letter = letters[idx]
          const isCorrect = isCorrectOption(question, letter)
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
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
                  isCorrect
                    ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {letter}
              </span>
              <span className={isCorrect ? 'font-medium text-emerald-800 dark:text-emerald-200' : ''}>
                {prop}
              </span>
              {isCorrect && (
                <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render question card ───
  const renderQuestionCard = (question: Question) => {
    const isEditing = editingId === question.id
    const isLoading = actionLoadingIds.has(question.id)
    const isRegenerating = regeneratingIds.has(question.id)
    const isExplanationExpanded = expandedExplanations.has(question.id)

    return (
      <Card key={question.id} className={`overflow-hidden transition-shadow hover:shadow-md ${question.validee ? 'border-emerald-200 dark:border-emerald-800/50' : ''}`}>
        <CardContent className="p-4">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Type badge */}
            <Badge variant="outline" className={`gap-1 ${getTypeBadgeColor(question.type)}`}>
              {getTypeIcon(question.type)}
              {question.type}
            </Badge>

            {/* Difficulty badge */}
            <Badge variant="outline" className={getDifficulteColor(question.difficulte)}>
              {getDifficulteLabel(question.difficulte)}
            </Badge>

            {/* Quality score */}
            {question.scoreQualite !== null && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted-foreground">Qualité :</span>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${getQualityColor(question.scoreQualite)}`}
                      style={{ width: `${Math.min(100, Math.max(0, question.scoreQualite))}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {question.scoreQualite}%
                  </span>
                </div>
              </div>
            )}

            {/* Validated badge */}
            {question.validee && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Validée
              </Badge>
            )}
          </div>

          {/* Énoncé */}
          {isEditing ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Énoncé</Label>
              <Textarea
                value={editData.enonce ?? ''}
                onChange={(e) => setEditData((prev) => ({ ...prev, enonce: e.target.value }))}
                className="min-h-[80px] text-sm"
              />
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{question.enonce}</p>
          )}

          {/* Propositions (QCU/QCM) */}
          {(question.type === 'QCU' || question.type === 'QCM') &&
            renderPropositions(question, isEditing)}

          {/* Réponse attendue (QRC) */}
          {question.type === 'QRC' && (
            <div className="mt-3">
              <Label className="text-xs font-medium text-muted-foreground">Réponse attendue</Label>
              {isEditing ? (
                <Textarea
                  value={typeof editData.reponseCorrecte === 'string' ? editData.reponseCorrecte : (Array.isArray(editData.reponseCorrecte) ? editData.reponseCorrecte.join(', ') : '')}
                  onChange={(e) => setEditData((prev) => ({ ...prev, reponseCorrecte: e.target.value }))}
                  className="mt-1 min-h-[60px] text-sm"
                />
              ) : (
                <div className="mt-1 rounded-md bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
                  <p className="text-sm text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap">
                    {Array.isArray(question.reponseCorrecte)
                      ? question.reponseCorrecte.join(', ')
                      : question.reponseCorrecte ?? 'Non spécifiée'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Grille de correction (TRS) */}
          {question.type === 'TRS' && (
            <div className="mt-3">
              <Label className="text-xs font-medium text-muted-foreground">Grille de correction</Label>
              {isEditing ? (
                <Textarea
                  value={typeof editData.reponseCorrecte === 'string' ? editData.reponseCorrecte : (Array.isArray(editData.reponseCorrecte) ? editData.reponseCorrecte.join('\n') : '')}
                  onChange={(e) => setEditData((prev) => ({ ...prev, reponseCorrecte: e.target.value }))}
                  className="mt-1 min-h-[100px] text-sm font-mono"
                />
              ) : (
                <div className="mt-1 rounded-md bg-rose-50 border border-rose-200 p-3 dark:bg-rose-950/20 dark:border-rose-800/50">
                  <p className="text-sm text-rose-800 dark:text-rose-200 whitespace-pre-wrap">
                    {Array.isArray(question.reponseCorrecte)
                      ? question.reponseCorrecte.join('\n')
                      : question.reponseCorrecte ?? 'Non spécifiée'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Explication (collapsible) */}
          {question.explication && !isEditing && (
            <Collapsible
              open={isExplanationExpanded}
              onOpenChange={() => toggleExplanation(question.id)}
              className="mt-3"
            >
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {isExplanationExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Explication de l&apos;IA
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground leading-relaxed">
                  {question.explication}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Thèmes */}
          {question.themes && question.themes.length > 0 && !isEditing && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {question.themes.map((theme, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-[10px] bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                >
                  {theme}
                </Badge>
              ))}
            </div>
          )}

          <Separator className="my-3" />

          {/* Action buttons */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 h-8"
                onClick={() => saveEditing(question.id)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Sauvegarder
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={cancelEditing}
                disabled={isLoading}
              >
                <X className="h-3 w-3" />
                Annuler
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {!question.validee && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 h-8"
                  onClick={() => handleValidate(question.id)}
                  disabled={isLoading || isRegenerating}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Valider
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => startEditing(question)}
                disabled={isLoading || isRegenerating}
              >
                <Pencil className="h-3 w-3" />
                Modifier
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => handleRegenerate(question)}
                disabled={isLoading || isRegenerating}
              >
                {isRegenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Régénérer
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    disabled={isLoading || isRegenerating}
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. La question sera définitivement supprimée de la base de données.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => handleDelete(question.id)}
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Main render ───
  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-0">
      {/* ═══ LEFT PANEL (40%) ═══ */}
      <div className="w-full lg:w-[40%] xl:w-[35%] space-y-4 shrink-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-emerald-600" />
            Questions IA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Générez et validez des questions automatiquement avec l&apos;IA
          </p>
        </div>

        {/* Document Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              Document source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingDocs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des documents...
              </div>
            ) : analyzedDocuments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-sm font-medium">Aucun document analysé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Importez et analysez un document avant de générer des questions.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  onClick={() => setCurrentPage('documents')}
                >
                  <FileText className="h-3 w-3" />
                  Aller aux Documents
                </Button>
              </div>
            ) : (
              <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionnez un document..." />
                </SelectTrigger>
                <SelectContent>
                  {analyzedDocuments.map((doc) => {
                    const themeCount = doc.themesDetectes?.length ?? 0
                    return (
                      <SelectItem key={doc.id} value={doc.id}>
                        <span className="flex items-center gap-2">
                          <span className="truncate max-w-[200px]">{doc.nomFichier}</span>
                          <span className="text-xs text-muted-foreground">
                            ({themeCount} thème{themeCount !== 1 ? 's' : ''})
                          </span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Generation Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              Paramètres de génération
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Types de questions */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Types de questions
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
                      QCU
                    </Badge>
                    Choix unique
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={qcuCount}
                    onChange={(e) => setQcuCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                      QCM
                    </Badge>
                    Choix multiple
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={qcmCount}
                    onChange={(e) => setQcmCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                      QRC
                    </Badge>
                    Réponse courte
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={qrcCount}
                    onChange={(e) => setQrcCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800">
                      TRS
                    </Badge>
                    Réflexion structurée
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={trsCount}
                    onChange={(e) => setTrsCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total : {qcuCount + qcmCount + qrcCount + trsCount} question(s)
              </p>
            </div>

            <Separator />

            {/* Difficulté */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Difficulté</Label>
              <Select value={difficulte} onValueChange={setDifficulte}>
                <SelectTrigger className="h-8 text-sm">
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

            {/* Couverture thématique */}
            {availableThemes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Couverture thématique</Label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border p-2">
                  {availableThemes.map((theme) => (
                    <div key={theme} className="flex items-center gap-2">
                      <Checkbox
                        id={`theme-${theme}`}
                        checked={selectedThemes.includes(theme)}
                        onCheckedChange={() => toggleTheme(theme)}
                      />
                      <label
                        htmlFor={`theme-${theme}`}
                        className="text-xs cursor-pointer leading-tight"
                      >
                        {theme}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedThemes.length} thème(s) sélectionné(s) sur {availableThemes.length}
                </p>
              </div>
            )}

            {/* Langue */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Langue</Label>
              <Select value={langue} onValueChange={setLangue}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ton pédagogique */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ton pédagogique</Label>
              <Select value={tonPedagogique} onValueChange={setTonPedagogique}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Application directe">Application directe</SelectItem>
                  <SelectItem value="Analyse">Analyse</SelectItem>
                  <SelectItem value="Synthèse">Synthèse</SelectItem>
                  <SelectItem value="Cas pratique">Cas pratique</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Thèmes exclus */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Thèmes exclus</Label>
              <Input
                value={themesExclus}
                onChange={(e) => setThemesExclus(e.target.value)}
                placeholder="Séparés par des virgules..."
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Thèmes à exclure de la génération, séparés par des virgules
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base font-semibold shadow-md"
          onClick={handleGenerate}
          disabled={isGenerating || !selectedDocumentId}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Génération en cours... L&apos;IA analyse votre document
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Générer les questions
            </>
          )}
        </Button>
      </div>

      {/* ═══ RIGHT PANEL (60%) ═══ */}
      <div className="w-full lg:w-[60%] xl:w-[65%] min-w-0" ref={questionsTopRef}>
        {questions.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 lg:min-h-[60vh]">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Aucune question générée</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Configurez les paramètres et lancez la génération pour voir les questions apparaître ici.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ─── Stats bar ─── */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">
                {questions.length} question{questions.length > 1 ? 's' : ''} générée{questions.length > 1 ? 's' : ''}
              </span>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex flex-wrap gap-1.5">
                {(['TOUS', 'QCU', 'QCM', 'QRC', 'TRS'] as QuestionFilter[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    className={`h-7 text-xs gap-1 ${
                      filter === f
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 dark:hover:border-emerald-800'
                    }`}
                    onClick={() => setFilter(f)}
                  >
                    <Filter className="h-3 w-3" />
                    {f === 'TOUS' ? 'Tous' : f}
                    <span className="ml-0.5 rounded-full bg-background/20 px-1.5 py-0 text-[10px]">
                      {filterCounts[f]}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* ─── Bulk actions bar ─── */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={handleValidateAll}
              >
                <Check className="h-3 w-3" />
                Tout valider
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleDeleteNonValidated}
              >
                <XCircle className="h-3 w-3" />
                Supprimer les non-validées
              </Button>
            </div>

            {/* ─── Question list ─── */}
            <ScrollArea className="max-h-[calc(100vh-280px)]">
              <div className="space-y-3 pr-2">
                {filteredQuestions.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileQuestion className="h-10 w-10 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Aucune question de type {filter}
                    </p>
                  </div>
                ) : (
                  filteredQuestions.map((question) => renderQuestionCard(question))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
