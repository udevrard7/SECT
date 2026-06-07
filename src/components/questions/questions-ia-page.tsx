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
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  Brain,
  ClipboardList,
  Zap,
  ArrowRight,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

// ─── Helpers ───

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value as string) as T
  } catch {
    return fallback
  }
}

const DIFFICULTE_LABELS: Record<string, string> = {
  FACILE: 'Facile',
  MOYEN: 'Moyen',
  DIFFICILE: 'Difficile',
  EXPERT: 'Expert',
}

const DIFFICULTE_COLORS: Record<string, string> = {
  FACILE: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  MOYEN: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  DIFFICILE: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
  EXPERT: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
}

const TYPE_COLORS: Record<string, string> = {
  QCU: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
  QCM: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  QRC: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  TRS: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  QCU: <CheckCircle2 className="h-3 w-3" />,
  QCM: <ClipboardList className="h-3 w-3" />,
  QRC: <FileQuestion className="h-3 w-3" />,
  TRS: <Brain className="h-3 w-3" />,
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function parseReponseCorrecte(raw: unknown): string | string[] | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String)
      if (typeof parsed === 'string') return parsed
      return String(parsed)
    } catch {
      return raw
    }
  }
  if (Array.isArray(raw)) return raw.map(String)
  return String(raw)
}

function getQualityColor(score: number | null): string {
  if (score === null) return 'bg-muted'
  if (score < 40) return 'bg-red-500'
  if (score <= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

// ─── Main Component ───

export function QuestionsIAPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const searchParams = useSearchParams()

  // ─── State ───
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)

  const [qcuCount, setQcuCount] = useState(5)
  const [qcmCount, setQcmCount] = useState(3)
  const [qrcCount, setQrcCount] = useState(2)
  const [trsCount, setTrsCount] = useState(1)
  const [difficulte, setDifficulte] = useState<string>('MOYEN')
  const [selectedThemes, setSelectedThemes] = useState<string[]>([])
  const [langue, setLangue] = useState<string>('fr')
  const [tonPedagogique, setTonPedagogique] = useState<string>('Application directe')
  const [themesExclus, setThemesExclus] = useState<string>('')

  const [questions, setQuestions] = useState<Question[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [filter, setFilter] = useState<QuestionFilter>('TOUS')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Question>>({})
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set())
  const [isTestingZAI, setIsTestingZAI] = useState(false)
  const [zaiTestResult, setZaiTestResult] = useState<{status: string; error?: string; baseUrl?: string} | null>(null)

  const questionsTopRef = useRef<HTMLDivElement>(null)

  // ─── Derived ───
  const selectedDoc = documents.find((d) => d.id === selectedDocumentId)
  const availableThemes: string[] = selectedDoc?.themesDetectes ?? []
  const analyzedDocuments = documents.filter((d) => d.statutAnalyse === 'ANALYSE')

  // ─── Fetch documents ───
  const fetchDocuments = useCallback(async () => {
    if (!user?.id) {
      console.log('[QuestionsIA] No user ID, skipping document fetch')
      setIsLoadingDocs(false)
      return
    }
    setIsLoadingDocs(true)
    try {
      console.log('[QuestionsIA] Fetching documents for user:', user.id)
      const res = await fetch(`/api/documents?userId=${user.id}`)
      if (!res.ok) {
        console.error('[QuestionsIA] Failed to fetch documents, status:', res.status)
        return
      }
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
      console.log('[QuestionsIA] Fetched', docs.length, 'documents,', docs.filter(d => d.statutAnalyse === 'ANALYSE').length, 'analyzed')
      setDocuments(docs)
    } catch (err) {
      console.error('[QuestionsIA] Error fetching documents:', err)
    } finally {
      setIsLoadingDocs(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-select document from navigation params
  useEffect(() => {
    const docId = searchParams.get('documentId')
    if (docId && !selectedDocumentId && documents.length > 0) {
      const paramDoc = documents.find((d) => d.id === docId)
      if (paramDoc && paramDoc.statutAnalyse === 'ANALYSE') {
        setSelectedDocumentId(paramDoc.id)
      }
    }
  }, [searchParams, documents, selectedDocumentId])

  // ─── Toggle theme selection ───
  const toggleTheme = (theme: string) => {
    setSelectedThemes((prev) =>
      prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]
    )
  }

  // ─── Generate questions ───
  const handleGenerate = async () => {
    // Validate state before making the API call
    if (!user?.id) {
      toast.error('Non connecté', {
        description: 'Vous devez être connecté pour générer des questions.',
      })
      return
    }

    if (!selectedDocumentId) {
      toast.error('Document requis', {
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
    const loadingToast = toast.loading('Génération en cours...', {
      description: `L'IA analyse votre document et génère ${total} question(s). Cela peut prendre 30 à 60 secondes.`,
    })

    const requestBody = {
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
    }

    console.log('[QuestionsIA] Generating questions, request:', {
      documentId: selectedDocumentId,
      userId: user.id,
      total,
      difficulte,
    })

    try {
      const res = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      console.log('[QuestionsIA] API response status:', res.status, res.ok)

      if (!res.ok) {
        let errorMessage = `Erreur serveur (${res.status})`
        try {
          const errData = await res.json()
          console.error('[QuestionsIA] API error response:', errData)
          errorMessage = errData.error || errorMessage
        } catch {
          if (res.status === 504 || res.status === 502) {
            errorMessage = 'La requête a expiré. Veuillez réessayer avec moins de questions.'
          } else if (res.status === 500) {
            errorMessage = 'Erreur interne du serveur. Veuillez réessayer.'
          }
        }
        throw new Error(errorMessage)
      }

      const data = await res.json()
      console.log('[QuestionsIA] Generated questions count:', data.questions?.length ?? 0)

      const generated: Question[] = (data.questions ?? []).map((q: Record<string, unknown>) => ({
        id: q.id as string,
        documentId: (q.documentId as string | null) ?? null,
        type: (['QCU', 'QCM', 'QRC', 'TRS'].includes(q.type as string) ? q.type : 'QRC') as Question['type'],
        enonce: String(q.enonce || ''),
        propositions: parseJsonSafe<string[]>(q.propositions as string | null, []),
        reponseCorrecte: parseReponseCorrecte(q.reponseCorrecte),
        explication: (q.explication as string | null) ?? null,
        difficulte: (['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'].includes(q.difficulte as string)
          ? q.difficulte : 'MOYEN') as Question['difficulte'],
        themes: parseJsonSafe<string[]>(q.themes as string | null, []),
        scoreQualite: typeof q.scoreQualite === 'number' ? q.scoreQualite : null,
        validee: (q.validee as boolean) ?? false,
        langue: (q.langue as string) ?? 'fr',
        createdAt: q.createdAt as string,
      }))

      setQuestions(generated)
      setFilter('TOUS')
      toast.dismiss(loadingToast)

      if (generated.length === 0) {
        toast.warning('Aucune question générée', {
          description: "L'IA n'a pas pu générer de questions à partir de ce document. Veuillez réessayer.",
          duration: 8000,
        })
      } else {
        toast.success('Questions générées', {
          description: `${generated.length} question(s) générée(s) avec succès.`,
        })
        // Scroll to questions
        setTimeout(() => {
          questionsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 300)
      }
    } catch (err) {
      toast.dismiss(loadingToast)
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.'
      console.error('[QuestionsIA] Generation error:', message)
      toast.error('Erreur de génération', {
        description: message,
        duration: 8000,
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
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, validee: true } : q))
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
        propositions: parseJsonSafe<string[]>(newQ.propositions as string | null, []),
        reponseCorrecte: parseReponseCorrecte(newQ.reponseCorrecte),
        explication: (newQ.explication as string | null) ?? null,
        difficulte: newQ.difficulte as Question['difficulte'],
        themes: parseJsonSafe<string[]>(newQ.themes as string | null, []),
        scoreQualite: (newQ.scoreQualite as number | null) ?? null,
        validee: (newQ.validee as boolean) ?? false,
        langue: (newQ.langue as string) ?? 'fr',
        createdAt: newQ.createdAt as string,
      }
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

  // ─── Edit handlers ───
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

  // ─── Derived state ───
  const filteredQuestions =
    filter === 'TOUS' ? questions : questions.filter((q) => q.type === filter)

  const filterCounts: Record<QuestionFilter, number> = {
    TOUS: questions.length,
    QCU: questions.filter((q) => q.type === 'QCU').length,
    QCM: questions.filter((q) => q.type === 'QCM').length,
    QRC: questions.filter((q) => q.type === 'QRC').length,
    TRS: questions.filter((q) => q.type === 'TRS').length,
  }

  const getCorrectAnswers = (question: Question): string[] => {
    if (!question.reponseCorrecte) return []
    if (Array.isArray(question.reponseCorrecte)) return question.reponseCorrecte
    if (typeof question.reponseCorrecte === 'string') return [question.reponseCorrecte]
    return []
  }

  const isCorrectOption = (question: Question, letter: string): boolean => {
    return getCorrectAnswers(question).includes(letter)
  }

  // ─── Render: Propositions ───
  const renderPropositions = (question: Question, isEditing: boolean) => {
    if (!question.propositions || question.propositions.length === 0) return null

    if (isEditing && editData.propositions) {
      return (
        <div className="space-y-2 mt-3">
          <Label className="text-xs font-medium text-muted-foreground">Propositions</Label>
          {editData.propositions.map((prop, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
                {LETTERS[idx]}
              </span>
              <Input
                value={prop}
                onChange={(e) => {
                  const props = [...(editData.propositions ?? [])]
                  props[idx] = e.target.value
                  setEditData((prev) => ({ ...prev, propositions: props }))
                }}
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
          const letter = LETTERS[idx]
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
              {isCorrect && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render: Question Card ───
  const renderQuestionCard = (question: Question) => {
    const isEditing = editingId === question.id
    const isLoading = actionLoadingIds.has(question.id)
    const isRegenerating = regeneratingIds.has(question.id)
    const isExplanationExpanded = expandedExplanations.has(question.id)

    return (
      <Card key={question.id} className={`overflow-hidden transition-shadow hover:shadow-md ${question.validee ? 'border-emerald-200 dark:border-emerald-800/50' : ''}`}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="outline" className={`gap-1 ${TYPE_COLORS[question.type] ?? ''}`}>
              {TYPE_ICONS[question.type]}
              {question.type}
            </Badge>
            <Badge variant="outline" className={DIFFICULTE_COLORS[question.difficulte] ?? ''}>
              {DIFFICULTE_LABELS[question.difficulte] ?? question.difficulte}
            </Badge>

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
                  <span className="text-xs font-medium">{question.scoreQualite}%</span>
                </div>
              </div>
            )}

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
          {(question.type === 'QCU' || question.type === 'QCM') && renderPropositions(question, isEditing)}

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

          {/* Explication */}
          {question.explication && !isEditing && (
            <Collapsible open={isExplanationExpanded} onOpenChange={() => {
              setExpandedExplanations((prev) => {
                const next = new Set(prev)
                if (next.has(question.id)) next.delete(question.id)
                else next.add(question.id)
                return next
              })
            }} className="mt-3">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {isExplanationExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
                <Badge key={i} variant="secondary" className="text-[10px] bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                  {theme}
                </Badge>
              ))}
            </div>
          )}

          <Separator className="my-3" />

          {/* Actions */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => saveEditing(question.id)} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Sauvegarder
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={cancelEditing} disabled={isLoading}>
                <X className="h-3 w-3" />
                Annuler
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {!question.validee && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handleValidate(question.id)} disabled={isLoading || isRegenerating}>
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Valider
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8" onClick={() => startEditing(question)} disabled={isLoading || isRegenerating}>
                <Pencil className="h-3 w-3" />
                Modifier
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => handleRegenerate(question)} disabled={isLoading || isRegenerating}>
                {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Régénérer
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30" disabled={isLoading || isRegenerating}>
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. La question sera définitivement supprimée.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDelete(question.id)}>
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

  // ─── Total questions counter ───
  const totalQuestions = qcuCount + qcmCount + qrcCount + trsCount

  // ─── Main Render ───
  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-0">
      {/* ═══ LEFT PANEL ═══ */}
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
                  onClick={() => router.push(PAGE_ROUTES.documents)}
                >
                  <FileText className="h-3 w-3 mr-1" />
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
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">QCU</Badge>
                    Choix unique
                  </Label>
                  <Input type="number" min={0} max={20} value={qcuCount} onChange={(e) => setQcuCount(Math.max(0, parseInt(e.target.value) || 0))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">QCM</Badge>
                    Choix multiple
                  </Label>
                  <Input type="number" min={0} max={20} value={qcmCount} onChange={(e) => setQcmCount(Math.max(0, parseInt(e.target.value) || 0))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">QRC</Badge>
                    Réponse courte
                  </Label>
                  <Input type="number" min={0} max={20} value={qrcCount} onChange={(e) => setQrcCount(Math.max(0, parseInt(e.target.value) || 0))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800">TRS</Badge>
                    Réflexion structurée
                  </Label>
                  <Input type="number" min={0} max={20} value={trsCount} onChange={(e) => setTrsCount(Math.max(0, parseInt(e.target.value) || 0))} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Difficulté */}
            <div className="space-y-1">
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

            {/* Langue */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Langue</Label>
              <Select value={langue} onValueChange={setLangue}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">Anglais</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ton pédagogique */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Ton pédagogique</Label>
              <Select value={tonPedagogique} onValueChange={setTonPedagogique}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Application directe">Application directe</SelectItem>
                  <SelectItem value="Analyse critique">Analyse critique</SelectItem>
                  <SelectItem value="Synthèse">Synthèse</SelectItem>
                  <SelectItem value="Problématisation">Problématisation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Themes from document */}
            {availableThemes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Thèmes du document</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableThemes.map((theme) => {
                    const isSelected = selectedThemes.includes(theme)
                    return (
                      <Badge
                        key={theme}
                        variant={isSelected ? 'default' : 'outline'}
                        className={`cursor-pointer text-xs transition-colors ${
                          isSelected
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        }`}
                        onClick={() => toggleTheme(theme)}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 mr-1" />}
                        {theme}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Thèmes exclus */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Thèmes à exclure (séparés par des virgules)</Label>
              <Input
                value={themesExclus}
                onChange={(e) => setThemesExclus(e.target.value)}
                placeholder="ex: introduction, annexe"
                className="h-8 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
        <Button
          className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          onClick={handleGenerate}
          disabled={isGenerating || !selectedDocumentId || !user?.id || totalQuestions === 0}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Génération en cours...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5 mr-2" />
              Générer {totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>

        {/* ZAI Diagnostic Test Button */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5 border-dashed"
            onClick={async () => {
              setIsTestingZAI(true)
              setZaiTestResult(null)
              try {
                const res = await fetch('/api/questions/test-zai')
                const data = await res.json()
                setZaiTestResult(data)
                if (data.status === 'ok') {
                  toast.success('Connexion IA OK', { description: 'Le service IA est disponible et fonctionne.' })
                } else {
                  toast.error('Connexion IA échouée', {
                    description: data.error || 'Service IA indisponible',
                    duration: 10000,
                  })
                }
              } catch (err) {
                setZaiTestResult({ status: 'error', error: err instanceof Error ? err.message : 'Erreur réseau' })
                toast.error('Test IA échoué', { description: 'Impossible de contacter le serveur.' })
              } finally {
                setIsTestingZAI(false)
              }
            }}
            disabled={isTestingZAI}
          >
            {isTestingZAI ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : zaiTestResult?.status === 'ok' ? (
              <Wifi className="h-3 w-3 mr-1 text-emerald-600" />
            ) : zaiTestResult?.status === 'error' ? (
              <WifiOff className="h-3 w-3 mr-1 text-red-500" />
            ) : (
              <Wifi className="h-3 w-3 mr-1" />
            )}
            Tester la connexion IA
          </Button>
          {zaiTestResult && zaiTestResult.status === 'error' && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 dark:bg-red-950/20 dark:border-red-800/50">
              <p className="text-xs font-medium text-red-800 dark:text-red-300">Erreur de connexion IA</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{zaiTestResult.error}</p>
              {zaiTestResult.baseUrl && (
                <p className="text-xs text-red-500 mt-1 font-mono">URL: {zaiTestResult.baseUrl}</p>
              )}
              <p className="text-xs text-red-500 mt-2">
                Vérifiez les variables d&apos;environnement ZAI_BASE_URL et ZAI_API_KEY sur Vercel.
              </p>
            </div>
          )}
        </div>

        {!selectedDocumentId && analyzedDocuments.length > 0 && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400">
            ⚠️ Sélectionnez un document pour activer la génération
          </p>
        )}
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className="flex-1 min-w-0 space-y-4">
        <div ref={questionsTopRef} />

        {/* Questions header + filters */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {questions.length} question{questions.length !== 1 ? 's' : ''} générée{questions.length !== 1 ? 's' : ''}
              </h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleValidateAll}>
                  <Check className="h-3 w-3 mr-1" />
                  Tout valider
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Supprimer non validées
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer les questions non validées ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Les {questions.filter(q => !q.validee).length} question(s) non validée(s) seront définitivement supprimées.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDeleteNonValidated}>
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(['TOUS', 'QCU', 'QCM', 'QRC', 'TRS'] as QuestionFilter[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'default' : 'outline'}
                  className={`h-7 text-xs ${filter === f ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'TOUS' ? 'Tous' : f}
                  <span className="ml-1 text-[10px] opacity-70">({filterCounts[f]})</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {questions.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-emerald-50 p-6 mb-4 dark:bg-emerald-950/30">
              <Sparkles className="h-12 w-12 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Prêt à générer</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Sélectionnez un document analysé, configurez vos paramètres, puis cliquez sur le bouton
              &quot;Générer&quot; pour créer des questions automatiquement avec l&apos;IA.
            </p>
          </div>
        )}

        {/* Generating state */}
        {isGenerating && questions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="h-12 w-12 text-emerald-500 animate-spin mb-4" />
            <h3 className="text-lg font-semibold mb-1">Génération en cours...</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              L&apos;IA analyse votre document et crée {totalQuestions} question(s). Cela peut prendre 30 à 60 secondes.
            </p>
          </div>
        )}

        {/* Questions list */}
        {filteredQuestions.length > 0 && (
          <ScrollArea className="max-h-[calc(100vh-220px)]">
            <div className="space-y-3 pr-2">
              {filteredQuestions.map(renderQuestionCard)}
            </div>
          </ScrollArea>
        )}

        {/* No results for current filter */}
        {questions.length > 0 && filteredQuestions.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Aucune question de type {filter}
          </div>
        )}
      </div>
    </div>
  )
}
