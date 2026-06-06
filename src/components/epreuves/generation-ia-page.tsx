'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  Brain,
  ClipboardList,
  ArrowRight,
  Eye,
  Copy,
  ArrowLeft,
  Library,
  Trophy,
  Clock,
  HelpCircle,
  Send,
  BookOpen,
  Layers,
  Hash,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
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

interface ContenuQuestion {
  id: string
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION'
  enonce: string
  propositions: Array<{ id: string; text: string }> | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'
  bareme: number
  ueCode?: string | null
  ueNom?: string | null
}

interface GeneratedContenu {
  questions: ContenuQuestion[]
  consignes: string
  baremeTotal: number
}

interface DocumentInfo {
  id: string
  nomFichier: string
  tailleFichier: number | null
  typeMime: string | null
  statutAnalyse: string
  themesDetectes: string[] | null
  dateUpload: string
  uniteEnseignementId?: string | null
  uniteEnseignementCode?: string | null
  uniteEnseignementNom?: string | null
}

type Step = 'select-docs' | 'configure' | 'preview' | 'save'

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

// ─── Helpers ───

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value as string) as T
  } catch {
    return fallback
  }
}

function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`
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
  REFLEXION: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
}

// ─── Step Indicator ───

function StepIndicator({ steps, currentStep, onStepClick }: {
  steps: { id: Step; label: string }[]
  currentStep: Step
  onStepClick: (step: Step) => void
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = index < currentIndex

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div className={`h-0.5 w-4 sm:w-8 ${isCompleted ? 'bg-emerald-500' : 'bg-muted'}`} />
            )}
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              className={`
                flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors
                ${isActive
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : isCompleted
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                }
              `}
            >
              <span className={`
                flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
                ${isActive
                  ? 'bg-emerald-600 text-white'
                  : isCompleted
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted-foreground/20 text-muted-foreground'
                }
              `}>
                {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───

export function GenerationIAPage() {
  const user = useAuthStore((s) => s.user)
  const { setCurrentPage } = useNavigationStore()

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('select-docs')

  // Step 1: Document selection
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)

  // Step 2: Generation parameters
  const [qcuCount, setQcuCount] = useState(5)
  const [qcmCount, setQcmCount] = useState(3)
  const [qrcCount, setQrcCount] = useState(2)
  const [reflexionCount, setReflexionCount] = useState(1)
  const [difficulte, setDifficulte] = useState<string>('MOYEN')
  const [langue, setLangue] = useState<string>('fr')
  const [titreEpreuve, setTitreEpreuve] = useState('')
  const [consignes, setConsignes] = useState('')
  const [noteTotal, setNoteTotal] = useState(20)
  const [selectedFiliereId, setSelectedFiliereId] = useState<string>('')
  const [selectedNiveau, setSelectedNiveau] = useState<string>('')
  const [selectedUEId, setSelectedUEId] = useState<string>('')
  const [filieres, setFilieres] = useState<EnseignantFiliereContext[]>([])
  const [isLoadingFilieres, setIsLoadingFilieres] = useState(false)

  // Step 3: Preview
  const [generatedContenu, setGeneratedContenu] = useState<GeneratedContenu | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<ContenuQuestion>>({})
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())

  // Step 4: Save
  const [isSaving, setIsSaving] = useState(false)
  const [autoDetectedUEId, setAutoDetectedUEId] = useState<string | null>(null)

  // New state: duration, exam type, title tracking, UE filter for Step 1
  const [duree, setDuree] = useState(60)
  const [typeControle, setTypeControle] = useState<string>('')
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false)
  const [selectedUEIdForDocs, setSelectedUEIdForDocs] = useState<string>('')

  const analyzedDocuments = documents.filter((d) => {
    if (d.statutAnalyse !== 'ANALYSE') return false
    if (selectedUEIdForDocs && selectedUEIdForDocs !== '__all__') {
      return d.uniteEnseignementId === selectedUEIdForDocs || !d.uniteEnseignementId
    }
    return true
  })

  const NIVEAU_OPTIONS = [
    { value: 'L1', label: 'L1 — Licence 1' },
    { value: 'L2', label: 'L2 — Licence 2' },
    { value: 'L3', label: 'L3 — Licence 3' },
    { value: 'M1', label: 'M1 — Master 1' },
    { value: 'M2', label: 'M2 — Master 2' },
    { value: 'DOCTORAT', label: 'Doctorat' },
  ]

  const TYPE_CONTROLE_OPTIONS = [
    { value: 'CC', label: 'Contrôle continu' },
    { value: 'CT', label: 'Contrôle terminal' },
    { value: 'COMP', label: 'Composition' },
    { value: 'EXAM', label: 'Examen' },
    { value: 'DS', label: 'Devoir surveillé' },
    { value: 'TP_NOTES', label: 'TP noté' },
    { value: 'AUTRE', label: 'Autre' },
  ]

  const wizardSteps: { id: Step; label: string }[] = [
    { id: 'select-docs', label: 'Documents' },
    { id: 'configure', label: 'Paramètres' },
    { id: 'preview', label: 'Aperçu' },
    { id: 'save', label: 'Enregistrer' },
  ]

  // ─── Auto-generate title based on typeControle and selectedUEId ───
  const getAutoGeneratedTitle = useCallback((): string => {
    if (!typeControle) return ''
    const typeLabel = TYPE_CONTROLE_OPTIONS.find(o => o.value === typeControle)?.label || typeControle
    let ueName = ''
    if (selectedUEId && selectedUEId !== '__none__') {
      for (const f of filieres) {
        const ue = f.unitesEnseignement.find(u => u.id === selectedUEId)
        if (ue) {
          ueName = ue.nom
          break
        }
      }
    }
    if (!ueName) return typeLabel
    if (typeControle === 'COMP') return `Composition - ${ueName}`
    return `${typeLabel} - ${ueName}`
  }, [typeControle, selectedUEId, filieres])

  // Update title automatically when typeControle or selectedUEId changes
  useMemo(() => {
    if (typeControle && !isTitleManuallyEdited) {
      setTitreEpreuve(getAutoGeneratedTitle())
    }
  }, [typeControle, selectedUEId, isTitleManuallyEdited, getAutoGeneratedTitle])

  // ─── Fetch documents ───
  const fetchDocuments = useCallback(async () => {
    if (!user?.id) {
      setIsLoadingDocs(false)
      return
    }
    setIsLoadingDocs(true)
    try {
      const res = await fetch(`/api/documents?userId=${user.id}`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const docs: DocumentInfo[] = (data.documents ?? []).map((doc: Record<string, unknown>) => ({
        id: doc.id as string,
        nomFichier: doc.nomFichier as string,
        tailleFichier: (doc.tailleFichier as number | null) ?? null,
        typeMime: (doc.typeMime as string | null) ?? null,
        statutAnalyse: doc.statutAnalyse as string,
        themesDetectes: parseJsonSafe<string[]>(doc.themesDetectes as string | null, []),
        dateUpload: doc.dateUpload as string,
        uniteEnseignementId: (doc.uniteEnseignementId as string | null) ?? null,
        uniteEnseignementCode: (doc.uniteEnseignement as Record<string, unknown>)?.code as string | null ?? null,
        uniteEnseignementNom: (doc.uniteEnseignement as Record<string, unknown>)?.nom as string | null ?? null,
      }))
      setDocuments(docs)
    } catch {
      // Silent
    } finally {
      setIsLoadingDocs(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ─── Fetch filieres for the teacher ───
  const fetchFilieres = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingFilieres(true)
    try {
      const res = await fetch(`/api/enseignant/context?enseignantId=${user.id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const filieresData: EnseignantFiliereContext[] = data.filieres ?? []
        setFilieres(filieresData)

        // Auto-select filière if only one assigned
        if (filieresData.length === 1) {
          setSelectedFiliereId(filieresData[0].id)
          if (filieresData[0].niveaux.length === 1) {
            setSelectedNiveau(filieresData[0].niveaux[0])
          }
          if (filieresData[0].unitesEnseignement.length === 1) {
            setSelectedUEId(filieresData[0].unitesEnseignement[0].id)
          }
        }
      }
    } catch {
      // Silent
    } finally {
      setIsLoadingFilieres(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  // ─── Toggle document selection ───
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)

      // Auto-select UE based on selected documents
      if (!selectedUEId) {
        const ueCounts = new Map<string, string>()
        // Check all docs in the new selection for UE info
        for (const id of next) {
          const doc = documents.find((d) => d.id === id)
          if (doc?.uniteEnseignementId && doc.uniteEnseignementCode) {
            ueCounts.set(doc.uniteEnseignementId, doc.uniteEnseignementId)
          }
        }
        if (ueCounts.size === 1) {
          // Only auto-select if there's exactly one UE across all selected docs
          const ueId = Array.from(ueCounts.values())[0]
          if (ueId) {
            // Use setTimeout to avoid nested setState
            setTimeout(() => setSelectedUEId(ueId), 0)
          }
        }
      }

      return next
    })
  }

  // ─── Generate complete exam ───
  const handleGenerate = async () => {
    if (!user?.id) return
    if (selectedDocIds.size === 0) {
      toast.error('Documents requis', { description: 'Sélectionnez au moins un document analysé.' })
      return
    }

    const total = qcuCount + qcmCount + qrcCount + reflexionCount
    if (total === 0) {
      toast.error('Aucune question', { description: 'Spécifiez au moins un type de question.' })
      return
    }

    if (total > 100) {
      toast.error('Trop de questions', { description: 'Le maximum est de 100 questions par épreuve.' })
      return
    }

    setIsGenerating(true)
    const isLargeExam = total > 12
    const isVeryLargeExam = total > 30
    const loadingToast = toast.loading(isVeryLargeExam ? 'Génération par lots en cours...' : isLargeExam ? 'Génération par lots en cours...' : 'Génération en cours...', {
      description: isVeryLargeExam
        ? `L'IA génère ${total} questions en plusieurs lots. Cela peut prendre 3 à 5 minutes, merci de patienter.`
        : isLargeExam
          ? `L'IA génère ${total} questions en plusieurs étapes pour garantir la qualité. Cela peut prendre 1 à 2 minutes.`
          : `L'IA analyse vos documents et génère une épreuve complète avec ${total} question(s).`,
      duration: Infinity,
    })

    try {
      // Use AbortController with a generous timeout for large exams
      const controller = new AbortController()
      const timeoutMs = isVeryLargeExam ? 360_000 : isLargeExam ? 240_000 : 120_000 // 6 min for very large, 4 min for large, 2 min for small
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const res = await fetch('/api/epreuves/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          documentIds: Array.from(selectedDocIds),
          enseignantId: user.id,
          config: {
            titre: titreEpreuve || getAutoGeneratedTitle() || undefined,
            difficulte,
            langue,
            duree: duree,
            typesQuestions: {
              qcu: qcuCount,
              qcm: qcmCount,
              qrc: qrcCount,
              reflexion: reflexionCount,
            },
            consignes: consignes || undefined,
            noteTotal,
            filiereId: selectedFiliereId || undefined,
            uniteEnseignementId: selectedUEId && selectedUEId !== '__none__' ? selectedUEId : undefined,
            niveau: selectedNiveau || undefined,
          },
          preview: true,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        let errorMessage = `Erreur serveur (${res.status})`
        try {
          const errData = await res.json()
          errorMessage = errData.error || errorMessage
        } catch {
          if (res.status === 504 || res.status === 502) {
            errorMessage = 'La requête a expiré. Réessayez avec moins de questions ou des documents plus courts.'
          }
        }
        throw new Error(errorMessage)
      }

      const data = await res.json()
      const contenu: GeneratedContenu = {
        questions: (data.contenu?.questions ?? []).map((q: Record<string, unknown>, idx: number) => ({
          id: q.id || `q${idx + 1}`,
          type: (['QCU', 'QCM', 'QRC', 'REFLEXION'].includes(q.type as string) ? q.type : 'QRC') as ContenuQuestion['type'],
          enonce: String(q.enonce || ''),
          propositions: q.propositions || null,
          reponseCorrecte: q.reponseCorrecte || null,
          explication: (q.explication as string | null) ?? null,
          difficulte: (['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'].includes(q.difficulte as string)
            ? q.difficulte : 'MOYEN') as ContenuQuestion['difficulte'],
          bareme: typeof q.bareme === 'number' ? q.bareme : 1,
          ueCode: (q.ueCode as string | null) ?? null,
          ueNom: (q.ueNom as string | null) ?? null,
        })),
        consignes: data.contenu?.consignes || '',
        baremeTotal: data.contenu?.baremeTotal || 0,
      }

      // Capture auto-detected UE from server
      if (data.autoDetectedUEId) {
        setAutoDetectedUEId(data.autoDetectedUEId)
      }

      setGeneratedContenu(contenu)
      toast.dismiss(loadingToast)

      if (contenu.questions.length === 0) {
        toast.warning('Aucune question générée', {
          description: "L'IA n'a pas pu générer de questions. Veuillez réessayer.",
          duration: 8000,
        })
      } else {
        const generatedCount = contenu.questions.length
        toast.success('Épreuve générée', {
          description: generatedCount < total
            ? `${generatedCount}/${total} question(s) générée(s). Certaines n'ont pas pu être créées — vous pouvez relancer.`
            : `${generatedCount} question(s) générée(s). Vérifiez et modifiez si nécessaire.`,
          duration: 6000,
        })
        setCurrentStep('preview')
      }
    } catch (err) {
      toast.dismiss(loadingToast)
      const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.'
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || errMsg.includes('timeout') || errMsg.includes('expiré'))

      toast.error(isTimeout ? 'Délai dépassé' : 'Erreur de génération', {
        description: isTimeout
          ? 'La génération a pris trop de temps. Réessayez ou contactez l\'administrateur si le problème persiste.'
          : errMsg,
        duration: 10000,
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Edit question ───
  const startEditing = (q: ContenuQuestion) => {
    setEditingQuestionId(q.id)
    setEditData({
      enonce: q.enonce,
      bareme: q.bareme,
    })
  }

  const cancelEditing = () => {
    setEditingQuestionId(null)
    setEditData({})
  }

  const saveEditing = () => {
    if (!generatedContenu || !editingQuestionId) return
    setGeneratedContenu({
      ...generatedContenu,
      questions: generatedContenu.questions.map((q) =>
        q.id === editingQuestionId
          ? { ...q, enonce: editData.enonce ?? q.enonce, bareme: editData.bareme ?? q.bareme }
          : q
      ),
      baremeTotal: generatedContenu.questions.reduce((sum, q) =>
        sum + (q.id === editingQuestionId ? (editData.bareme ?? q.bareme) : q.bareme), 0),
    })
    setEditingQuestionId(null)
    setEditData({})
    toast.success('Question modifiée')
  }

  const deleteQuestion = (questionId: string) => {
    if (!generatedContenu) return
    const updatedQuestions = generatedContenu.questions.filter((q) => q.id !== questionId)
    setGeneratedContenu({
      ...generatedContenu,
      questions: updatedQuestions,
      baremeTotal: updatedQuestions.reduce((sum, q) => sum + q.bareme, 0),
    })
    toast.success('Question supprimée')
  }

  // ─── Regenerate ───
  const handleRegenerate = () => {
    setGeneratedContenu(null)
    setCurrentStep('configure')
  }

  // ─── Save to Banque d'Épreuves ───
  const handleSave = async () => {
    if (!user?.id || !generatedContenu) return

    setIsSaving(true)
    try {
      const body = {
        enseignantId: user.id,
        titre: titreEpreuve || getAutoGeneratedTitle() || `Épreuve IA - ${new Date().toLocaleDateString('fr-FR')}`,
        description: `Épreuve générée par IA à partir de ${selectedDocIds.size} document(s)`,
        duree: duree,
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        generationMode: 'IA_ASSISTEE',
        contenu: generatedContenu,
        documentIds: Array.from(selectedDocIds),
        noteTotal,
        filiereId: selectedFiliereId || null,
        uniteEnseignementId: autoDetectedUEId || (selectedUEId && selectedUEId !== '__none__' ? selectedUEId : null),
        niveau: selectedNiveau || null,
      }

      const res = await fetch('/api/epreuves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur')
      }

      toast.success('Épreuve enregistrée', {
        description: 'L\'épreuve a été ajoutée à la Banque d\'épreuves.',
      })
      setCurrentPage('banque-epreuves')
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'enregistrer l\'épreuve.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Step validation ───
  const isStepValid = (step: Step): boolean => {
    switch (step) {
      case 'select-docs': return selectedDocIds.size > 0
      case 'configure': return (qcuCount + qcmCount + qrcCount + reflexionCount) > 0
      case 'preview': return !!generatedContenu && generatedContenu.questions.length > 0
      case 'save': return !!generatedContenu && generatedContenu.questions.length > 0
      default: return false
    }
  }

  // ─── Step navigation ───
  const goToStep = (step: Step) => {
    const currentIdx = wizardSteps.findIndex((s) => s.id === currentStep)
    const targetIdx = wizardSteps.findIndex((s) => s.id === step)
    if (targetIdx <= currentIdx || (targetIdx === currentIdx + 1 && isStepValid(currentStep))) {
      setCurrentStep(step)
    }
  }

  // ─── Render: Question Card in Preview ───
  const renderQuestionCard = (q: ContenuQuestion, idx: number) => {
    const isEditing = editingQuestionId === q.id
    const isExpanded = expandedExplanations.has(q.id)

    return (
      <Card key={q.id} className="overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
              {idx + 1}
            </span>
            <Badge variant="outline" className={`gap-1 ${TYPE_COLORS[q.type] || ''}`}>
              {q.type}
            </Badge>
            <Badge variant="outline" className={DIFFICULTE_COLORS[q.difficulte] || ''}>
              {DIFFICULTE_LABELS[q.difficulte] || q.difficulte}
            </Badge>
            {q.ueCode && (
              <Badge variant="outline" className="gap-1 bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800">
                <Layers className="h-3 w-3" />
                {q.ueCode}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs ml-auto">
              {q.bareme} pt{q.bareme > 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Énoncé */}
          {isEditing ? (
            <div className="space-y-2">
              <Label className="text-xs">Énoncé</Label>
              <Textarea
                value={editData.enonce ?? ''}
                onChange={(e) => setEditData((prev) => ({ ...prev, enonce: e.target.value }))}
                className="min-h-[80px] text-sm"
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs">Barème</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={editData.bareme ?? q.bareme}
                  onChange={(e) => setEditData((prev) => ({ ...prev, bareme: parseFloat(e.target.value) || 1 }))}
                  className="w-20 h-8 text-sm"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enonce}</p>
          )}

          {/* Propositions */}
          {(q.type === 'QCU' || q.type === 'QCM') && q.propositions && (
            <div className="space-y-1.5 mt-3">
              <Label className="text-xs font-medium text-muted-foreground">Propositions</Label>
              {q.propositions.map((prop, pIdx) => {
                const correctAnswers = Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte : q.reponseCorrecte ? [q.reponseCorrecte] : []
                const isCorrect = correctAnswers.includes(prop.id)
                return (
                  <div
                    key={pIdx}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                      isCorrect
                        ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                        : 'bg-muted/30'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                      isCorrect
                        ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {String.fromCharCode(65 + pIdx)}
                    </span>
                    <span className={isCorrect ? 'font-medium text-emerald-800 dark:text-emerald-200' : ''}>
                      {typeof prop === 'string' ? prop : prop.text}
                    </span>
                    {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Réponse for QRC/TRS */}
          {(q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte && (
            <div className="mt-3">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setExpandedExplanations((prev) => {
                    const next = new Set(prev)
                    if (next.has(q.id)) next.delete(q.id)
                    else next.add(q.id)
                    return next
                  })
                }}
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
            <Collapsible open={expandedExplanations.has(`exp-${q.id}`)} onOpenChange={() => {
              setExpandedExplanations((prev) => {
                const next = new Set(prev)
                const key = `exp-${q.id}`
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }} className="mt-3">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {expandedExplanations.has(`exp-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Explication de l&apos;IA
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground leading-relaxed">
                  {q.explication}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator className="my-3" />

          {/* Actions */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={saveEditing}>
                <Save className="h-3 w-3" />
                Sauvegarder
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={cancelEditing}>
                <X className="h-3 w-3" />
                Annuler
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => startEditing(q)}>
                <Pencil className="h-3 w-3" />
                Modifier
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteQuestion(q.id)}>
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

  const totalQuestions = qcuCount + qcmCount + qrcCount + reflexionCount

  // ─── Main Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-emerald-600" />
          Génération IA d&apos;Épreuves
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sélectionnez des documents, configurez les paramètres et laissez l&apos;IA générer une épreuve complète
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator steps={wizardSteps} currentStep={currentStep} onStepClick={goToStep} />

      <Separator />

      {/* ─── Step 1: Select Documents ─── */}
      {currentStep === 'select-docs' && (
        <div className="space-y-4">
          {/* UE Filter */}
          {analyzedDocuments.length > 0 && (() => {
            const ueMap = new Map<string, { id: string; code: string; nom: string }>()
            for (const doc of documents.filter((d) => d.statutAnalyse === 'ANALYSE')) {
              if (doc.uniteEnseignementId && doc.uniteEnseignementCode) {
                ueMap.set(doc.uniteEnseignementId, {
                  id: doc.uniteEnseignementId,
                  code: doc.uniteEnseignementCode,
                  nom: doc.uniteEnseignementNom || doc.uniteEnseignementCode,
                })
              }
            }
            return ueMap.size > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    Sélectionnez l&apos;Unité d&apos;Enseignement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedUEIdForDocs} onValueChange={(val) => {
                    setSelectedUEIdForDocs(val)
                    if (val && val !== '__all__') {
                      setSelectedDocIds(prev => {
                        const next = new Set<string>()
                        for (const docId of prev) {
                          const doc = documents.find(d => d.id === docId)
                          if (doc && (doc.uniteEnseignementId === val || !doc.uniteEnseignementId)) {
                            next.add(docId)
                          }
                        }
                        return next
                      })
                    }
                    setSelectedUEId(val)
                  }}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Toutes les UE" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Toutes les UE</SelectItem>
                      {Array.from(ueMap.values()).map(ue => (
                        <SelectItem key={ue.id} value={ue.id}>
                          {ue.code} — {ue.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedUEIdForDocs && selectedUEIdForDocs !== '__all__' && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Filtrage actif : seuls les documents de cette UE sont affichés
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null
          })()}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Sélectionnez les documents sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDocs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement des documents...
                </div>
              ) : analyzedDocuments.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                  <p className="text-sm font-medium">Aucun document analysé</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Importez et analysez au moins un document avant de générer une épreuve.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                    onClick={() => setCurrentPage('documents')}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Aller aux Documents
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {analyzedDocuments.map((doc) => {
                      const isSelected = selectedDocIds.has(doc.id)
                      const themeCount = doc.themesDetectes?.length ?? 0
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                              : 'border-muted hover:border-emerald-200 dark:hover:border-emerald-900'
                          }`}
                          onClick={() => toggleDocSelection(doc.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleDocSelection(doc.id)}
                            className="pointer-events-none"
                          />
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{doc.nomFichier}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              {doc.uniteEnseignementCode && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px] bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800">
                                  {doc.uniteEnseignementCode}
                                </Badge>
                              )}
                              {themeCount > 0 && (
                                <span className="text-xs text-muted-foreground">{themeCount} thème{themeCount > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedDocIds.size} document{selectedDocIds.size > 1 ? 's' : ''} sélectionné{selectedDocIds.size > 1 ? 's' : ''}
            </p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!isStepValid('select-docs')}
              onClick={() => setCurrentStep('configure')}
            >
              Suivant
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Configure Parameters ─── */}
      {currentStep === 'configure' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: Question types */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-emerald-600" />
                  Types de questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">QCU</Badge>
                      Choix unique
                    </Label>
                    <Input type="number" min={0} max={50} value={qcuCount} onChange={(e) => setQcuCount(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">QCM</Badge>
                      Choix multiple
                    </Label>
                    <Input type="number" min={0} max={50} value={qcmCount} onChange={(e) => setQcmCount(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">QRC</Badge>
                      Réponse courte
                    </Label>
                    <Input type="number" min={0} max={50} value={qrcCount} onChange={(e) => setQrcCount(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800">REFLEXION</Badge>
                      Sujet de réflexion
                    </Label>
                    <Input type="number" min={0} max={50} value={reflexionCount} onChange={(e) => setReflexionCount(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))} className="h-8 text-sm" />
                  </div>
                </div>

                <div className={`rounded-lg border p-3 ${totalQuestions > 50 ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800' : totalQuestions > 30 ? 'bg-muted/30' : 'bg-muted/30'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Total : {totalQuestions} question{totalQuestions > 1 ? 's' : ''}
                    </p>
                    {totalQuestions > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Clock className="h-3 w-3" />
                        ~{Math.max(30, Math.round(totalQuestions * 2.5))} min
                      </Badge>
                    )}
                  </div>
                  {totalQuestions > 50 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Grand nombre de questions — la génération peut prendre plusieurs minutes
                    </p>
                  )}
                  {totalQuestions > 100 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Maximum 100 questions autorisées
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Right: Other parameters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4 text-emerald-600" />
                  Paramètres avancés
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3 text-teal-500" />
                    Type de contrôle
                  </Label>
                  <Select value={typeControle} onValueChange={(val) => {
                    setTypeControle(val)
                    if (!isTitleManuallyEdited) {
                      const typeLabel = TYPE_CONTROLE_OPTIONS.find(o => o.value === val)?.label || val
                      let ueName = ''
                      if (selectedUEId && selectedUEId !== '__none__') {
                        for (const f of filieres) {
                          const ue = f.unitesEnseignement.find(u => u.id === selectedUEId)
                          if (ue) { ueName = ue.nom; break }
                        }
                      }
                      if (ueName) {
                        setTitreEpreuve(val === 'COMP' ? `Composition - ${ueName}` : `${typeLabel} - ${ueName}`)
                      } else {
                        setTitreEpreuve(typeLabel)
                      }
                    }
                  }}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sélectionnez un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_CONTROLE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Titre de l&apos;épreuve</Label>
                  <div className="flex gap-2">
                    <Input
                      value={titreEpreuve}
                      onChange={(e) => {
                        setTitreEpreuve(e.target.value)
                        setIsTitleManuallyEdited(true)
                      }}
                      placeholder={getAutoGeneratedTitle() || "Ex: Contrôle - Algorithmique L2"}
                      className="h-8 text-sm flex-1"
                    />
                    {isTitleManuallyEdited && getAutoGeneratedTitle() && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => {
                          setTitreEpreuve(getAutoGeneratedTitle())
                          setIsTitleManuallyEdited(false)
                        }}
                      >
                        Auto
                      </Button>
                    )}
                  </div>
                  {getAutoGeneratedTitle() && !isTitleManuallyEdited && (
                    <p className="text-[10px] text-muted-foreground">Titre généré automatiquement — modifiable</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Trophy className="h-3 w-3 text-amber-500" />
                      Note totale
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={noteTotal}
                      onChange={(e) => setNoteTotal(Math.max(1, parseFloat(e.target.value) || 20))}
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">L&apos;IA répartira le barème pour atteindre ce total</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-emerald-500" />
                      Durée (minutes)
                    </Label>
                    <Input
                      type="number"
                      min={10}
                      max={480}
                      step={5}
                      value={duree}
                      onChange={(e) => setDuree(Math.max(10, Math.min(480, parseInt(e.target.value) || 60)))}
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">{formatDuree(duree)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Difficulté</Label>
                    <Select value={difficulte} onValueChange={setDifficulte}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FACILE">Facile — 60% faciles, 25% moyennes</SelectItem>
                        <SelectItem value="MOYEN">Moyen — 50% moyennes, 25% difficiles</SelectItem>
                        <SelectItem value="DIFFICILE">Difficile — 50% difficiles, 30% expertes</SelectItem>
                        <SelectItem value="EXPERT">Expert — 60% expertes, 25% difficiles</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">La majorité des questions sera de ce niveau</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3 text-emerald-500" />
                    Filière cible
                    {filieres.length === 1 && (
                      <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">Auto</Badge>
                    )}
                  </Label>
                  <Select
                    value={selectedFiliereId}
                    onValueChange={(val) => {
                      setSelectedFiliereId(val)
                      setSelectedNiveau('')
                      setSelectedUEId('')
                      const sel = filieres.find((f) => f.id === val)
                      if (sel) {
                        if (sel.niveaux.length === 1) setSelectedNiveau(sel.niveaux[0])
                        if (sel.unitesEnseignement.length === 1) setSelectedUEId(sel.unitesEnseignement[0].id)
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sélectionnez une filière" />
                    </SelectTrigger>
                    <SelectContent>
                      {filieres.length > 1 && <SelectItem value="__all__">Toutes les filières</SelectItem>}
                      {filieres.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nom} {f.code ? `(${f.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-sky-500" />
                      Niveau cible
                      {selectedFiliereId && filieres.find((f) => f.id === selectedFiliereId)?.niveaux.length === 1 && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">Auto</Badge>
                      )}
                    </Label>
                    <Select value={selectedNiveau} onValueChange={(val) => { setSelectedNiveau(val); setSelectedUEId('') }}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Sélectionnez un niveau" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const sel = filieres.find((f) => f.id === selectedFiliereId)
                          const avail = sel ? sel.niveaux : [...new Set(filieres.flatMap((f) => f.niveaux))].sort()
                          if (avail.length === 0) return <SelectItem value="__none__" disabled>Aucun niveau</SelectItem>
                          return (
                            <>
                              {avail.length > 1 && <SelectItem value="__all__">Tous les niveaux</SelectItem>}
                              {avail.map((n) => (
                                <SelectItem key={n} value={n}>
                                  {NIVEAU_OPTIONS.find((o) => o.value === n)?.label || n}
                                </SelectItem>
                              ))}
                            </>
                          )
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Hash className="h-3 w-3 text-teal-500" />
                      UE
                    </Label>
                    <Select value={selectedUEId} onValueChange={(val) => {
                      setSelectedUEId(val)
                      if (typeControle && !isTitleManuallyEdited) {
                        const typeLabel = TYPE_CONTROLE_OPTIONS.find(o => o.value === typeControle)?.label || typeControle
                        let ueName = ''
                        if (val && val !== '__none__') {
                          for (const f of filieres) {
                            const ue = f.unitesEnseignement.find(u => u.id === val)
                            if (ue) { ueName = ue.nom; break }
                          }
                        }
                        if (ueName) {
                          setTitreEpreuve(typeControle === 'COMP' ? `Composition - ${ueName}` : `${typeLabel} - ${ueName}`)
                        } else {
                          setTitreEpreuve(typeLabel)
                        }
                      }
                    }}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Sélectionnez une UE" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const sel = filieres.find((f) => f.id === selectedFiliereId)
                          if (!sel) return <SelectItem value="__none__" disabled>Sélectionnez une filière</SelectItem>
                          let ues = sel.unitesEnseignement
                          if (selectedNiveau && selectedNiveau !== '__all__') {
                            ues = ues.filter((ue) => {
                              if (ue.niveau === selectedNiveau) return true
                              if (ue.niveaux) { try { if ((JSON.parse(ue.niveaux) as string[]).includes(selectedNiveau)) return true } catch { /* */ } }
                              return false
                            })
                          }
                          if (ues.length === 0) return <SelectItem value="__none__" disabled>Aucune UE</SelectItem>
                          return (
                            <>
                              <SelectItem value="__none__">Aucune UE spécifique</SelectItem>
                              {ues.map((ue) => (
                                <SelectItem key={ue.id} value={ue.id}>
                                  {ue.code} — {ue.nom} ({ue.typeSeances.join('/')})
                                </SelectItem>
                              ))}
                            </>
                          )
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
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

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Consignes (optionnel)</Label>
                  <Textarea
                    value={consignes}
                    onChange={(e) => setConsignes(e.target.value)}
                    placeholder="Instructions spéciales pour les étudiants..."
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCurrentStep('select-docs')}>
              <ArrowLeft className="h-4 w-4" />
              Précédent
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={totalQuestions === 0 || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer l&apos;épreuve
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Preview ─── */}
      {currentStep === 'preview' && generatedContenu && (
        <div className="space-y-4">
          {/* Summary bar */}
          <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold">{generatedContenu.questions.length} question(s)</span>
              </div>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-sm font-semibold">{generatedContenu.baremeTotal} pts / {noteTotal}</span>
              </div>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(
                  generatedContenu.questions.reduce((acc, q) => {
                    acc[q.type] = (acc[q.type] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)
                ).map(([type, count]) => (
                  <Badge key={type} variant="outline" className={`text-[10px] ${TYPE_COLORS[type] || ''}`}>
                    {type}: {count}
                  </Badge>
                ))}
              </div>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(
                  generatedContenu.questions.reduce((acc, q) => {
                    acc[q.difficulte] = (acc[q.difficulte] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)
                ).map(([diff, count]) => (
                  <Badge key={diff} variant="outline" className={`text-[10px] ${DIFFICULTE_COLORS[diff] || ''}`}>
                    {DIFFICULTE_LABELS[diff] || diff}: {count}
                  </Badge>
                ))}
              </div>
              {/* UE groups summary */}
              {(() => {
                const ueSet = new Set(generatedContenu.questions.filter(q => q.ueCode).map(q => q.ueCode))
                if (ueSet.size > 0) {
                  return (
                    <>
                      <Separator orientation="vertical" className="hidden h-5 sm:block" />
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(ueSet).map(ueCode => (
                          <Badge key={ueCode} variant="outline" className="text-[10px] gap-1 bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800">
                            <Layers className="h-3 w-3" />
                            {ueCode}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )
                }
                return null
              })()}
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={handleRegenerate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Régénérer
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Consignes */}
          {generatedContenu.consignes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Consignes</p>
              <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{generatedContenu.consignes}</p>
            </div>
          )}

          {/* Question list — grouped by UE */}
          <div className="space-y-4">
            {(() => {
              // Group questions by UE
              const ueGroups = new Map<string, { code: string; nom: string; questions: ContenuQuestion[] }>()
              const noUEKey = '__no_ue__'
              for (const q of generatedContenu.questions) {
                const ueKey = q.ueCode || noUEKey
                if (!ueGroups.has(ueKey)) {
                  ueGroups.set(ueKey, {
                    code: q.ueCode || '',
                    nom: q.ueNom || 'Non classé',
                    questions: [],
                  })
                }
                ueGroups.get(ueKey)!.questions.push(q)
              }

              const ueGroupArray = Array.from(ueGroups.entries())
              // If only one group (or all without UE), don't show group headers
              if (ueGroupArray.length <= 1) {
                return generatedContenu.questions.map((q, idx) => renderQuestionCard(q, idx))
              }

              // Multiple UE groups — show headers and grouped questions
              let globalIdx = 0
              return ueGroupArray.map(([ueKey, group]) => (
                <div key={ueKey}>
                  <div className="flex items-center gap-2 mb-2 mt-2">
                    <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      {group.code ? `${group.code} — ` : ''}{group.nom}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {group.questions.length} question{group.questions.length > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {group.questions.reduce((s, q) => s + q.bareme, 0)} pts
                    </Badge>
                  </div>
                  <div className="space-y-3 ml-0 sm:ml-4">
                    {group.questions.map((q) => {
                      const idx = globalIdx++
                      return renderQuestionCard(q, idx)
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCurrentStep('configure')}>
              <ArrowLeft className="h-4 w-4" />
              Modifier les paramètres
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setCurrentStep('save')}
            >
              Suivant : Enregistrer
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Save ─── */}
      {currentStep === 'save' && generatedContenu && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Library className="h-4 w-4 text-emerald-600" />
                Enregistrer dans la Banque d&apos;Épreuves
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold">{titreEpreuve || `Épreuve IA - ${new Date().toLocaleDateString('fr-FR')}`}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <HelpCircle className="h-3.5 w-3.5" />
                    {generatedContenu.questions.length} question(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" />
                    {generatedContenu.baremeTotal} / {noteTotal} points
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuree(duree)}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {selectedDocIds.size} document(s) source
                  </span>
                </div>
                <Badge variant="outline" className="gap-1 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800">
                  <Sparkles className="h-3 w-3" />
                  Générée par IA
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                L&apos;épreuve sera enregistrée comme brouillon dans la Banque d&apos;Épreuves.
                Vous pourrez ensuite la planifier et l&apos;attribuer à des groupes d&apos;étudiants.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCurrentStep('preview')}>
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;aperçu
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => setCurrentPage('banque-epreuves')}
              >
                <Library className="h-4 w-4" />
                Voir la Banque
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSaving}
                onClick={handleSave}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
