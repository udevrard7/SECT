'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
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
  ArrowLeft,
  Eye,
  Clock,
  BookOpen,
  Layers,
  Hash,
  Settings,
  Plus,
  Minus,
  RotateCw,
  Wand2,
  Send,
  Search,
  FolderOpen,
  File,
  Calendar,
  HardDrive,
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
import { CODING_LANGUAGES, getCodingLanguageConfig, type CodingLanguage } from '@/lib/coding-types'

// ─── Types ───

interface ContenuQuestion {
  id: string
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION' | 'CODE'
  enonce: string
  propositions: Array<{ id: string; text: string }> | null
  reponseCorrecte: string | string[] | null
  explication: string | null
  difficulte: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'
  bareme: number
  ueCode?: string | null
  ueNom?: string | null
  // CODE-specific fields
  langage?: string
  codeInitial?: string
  fonctionSignature?: string
  testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
  testsPrives?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
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
  // P2-Q6 : si la valeur est déjà un array/objet (backend json.RawMessage
  // marshal en vrai JSON, pas en string), la retourner directement.
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value as unknown as T
  }
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
  FACILE: 'bg-success/15 text-success-text border-success/30 ',
  MOYEN: 'bg-warning/15 text-warning border-warning/30 ',
  DIFFICILE: 'bg-primary/15 text-primary-text border-primary/30 ',
  EXPERT: 'bg-destructive/15 text-destructive border-destructive/30 ',
}

const TYPE_COLORS: Record<string, string> = {
  QCU: 'bg-info/15 text-info border-info/30 ',
  QCM: 'bg-warning/15 text-warning border-warning/30 ',
  QRC: 'bg-success/15 text-success-text border-success/30 ',
  REFLEXION: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
  CODE: 'bg-secondary/15 text-secondary border-secondary/30 ',
}

const TYPE_BORDER_COLORS: Record<string, string> = {
  QCU: 'border-l-info',
  QCM: 'border-l-warning',
  QRC: 'border-l-success',
  REFLEXION: 'border-l-purple-500',
  CODE: 'border-l-secondary',
}

// ─── Animation Variants ───

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 100 } },
}

// ─── Step Icons ───

const STEP_ICONS: Record<Step, React.ElementType> = {
  'select-docs': FileText,
  'configure': Settings,
  'preview': Eye,
  'save': Save,
}

// ─── Modern Stepper ───

function ModernStepper({ steps, currentStep, onStepClick }: {
  steps: { id: Step; label: string }[]
  currentStep: Step
  onStepClick: (step: Step) => void
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep)

  return (
    <div className="w-full">
      {/* Progress bar background */}
      <div className="relative flex items-center justify-between">
        {/* Background progress track */}
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
        {/* Active progress fill */}
        <motion.div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-success"
          initial={false}
          animate={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />

        {/* Step nodes */}
        {steps.map((step, index) => {
          const isActive = step.id === currentStep
          const isCompleted = index < currentIndex
          const Icon = STEP_ICONS[step.id]

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              <motion.button
                type="button"
                onClick={() => onStepClick(step.id)}
                whileTap={{ scale: 0.95 }}
                className={`
                  relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300
                  ${isActive
                    ? 'border-success bg-success text-white shadow-lg shadow-emerald-500/30 ring-4 ring-success/20'
                    : isCompleted
                      ? 'border-success bg-success text-white'
                      : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  }
                `}
              >
                <AnimatePresence mode="wait">
                  {isCompleted ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <Check className="h-5 w-5" />
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key="icon"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <Icon className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="number"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <span className="text-sm font-bold">{index + 1}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
              {/* Step label - always visible */}
              <span
                className={`mt-2 text-xs font-medium transition-colors duration-300 ${
                  isActive
                    ? 'text-success-text'
                    : isCompleted
                      ? 'text-success-text'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Question Type Counter ───

function QuestionTypeCounter({
  label,
  badgeClass,
  value,
  onChange,
  max = 50,
}: {
  label: string
  badgeClass: string
  value: number
  onChange: (val: number) => void
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`h-6 px-2 text-[10px] ${badgeClass}`}>
          {label === 'Choix unique' ? 'QCU' : label === 'Choix multiple' ? 'QCM' : label === 'Réponse courte' ? 'QRC' : label === 'Sujet de réflexion' ? 'RÉFL' : 'CODE'}
        </Badge>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function GenerationIAPage() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('select-docs')

  // Step 1: Document selection
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())

  // Step 2: Generation parameters
  const [qcuCount, setQcuCount] = useState(5)
  const [qcmCount, setQcmCount] = useState(3)
  const [qrcCount, setQrcCount] = useState(2)
  const [reflexionCount, setReflexionCount] = useState(1)
  const [codeCount, setCodeCount] = useState(0)
  const [difficulte, setDifficulte] = useState<string>('MOYEN')
  const [langue, setLangue] = useState<string>('fr')
  const [titreEpreuve, setTitreEpreuve] = useState('')
  const [consignes, setConsignes] = useState('')
  const [noteTotal, setNoteTotal] = useState(20)
  const [selectedFiliereId, setSelectedFiliereId] = useState<string>('')
  const [selectedNiveau, setSelectedNiveau] = useState<string>('')
  const [selectedUEId, setSelectedUEId] = useState<string>('')

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

  // Regenerate single question state
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null)

  // Document search state for Step 1
  const [docSearchQuery, setDocSearchQuery] = useState('')

  // ─── Fetch documents (TanStack Query) ───
  // Migration useEffect+fetch → useQuery. Le cache survit au démontage :
  // 0 refetch au retour navigation. staleTime 60s.
  const documentsQuery = useQuery<{ documents: DocumentInfo[] }>({
    queryKey: ['generation-ia-documents', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/documents?userId=${user!.id}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
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
      return { documents: docs }
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const documents = documentsQuery.data?.documents ?? []
  const isLoadingDocs = documentsQuery.isLoading

  // ─── Fetch filieres for the teacher (TanStack Query) ───
  // Migration useEffect+fetch → useQuery. Le cache survit au démontage.
  // L'auto-sélection (filière/niveau/UE si une seule) est déplacée vers un
  // useEffect qui observe les données de la query.
  const filieresQuery = useQuery<{ filieres: EnseignantFiliereContext[] }>({
    queryKey: ['generation-ia-filieres', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/enseignant/context?enseignantId=${user!.id}`)
      if (!res.ok) throw new Error('Failed to fetch filieres')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const filieres = filieresQuery.data?.filieres ?? []
  const isLoadingFilieres = filieresQuery.isLoading

  // Auto-select filière/niveau/UE si une seule filière assignée (préserve
  // la logique originale de fetchFilieres).
  useEffect(() => {
    if (filieres.length === 1) {
      setSelectedFiliereId(filieres[0].id)
      if (filieres[0].niveaux.length === 1) {
        setSelectedNiveau(filieres[0].niveaux[0])
      }
      if (filieres[0].unitesEnseignement.length === 1) {
        setSelectedUEId(filieres[0].unitesEnseignement[0].id)
      }
    }
  }, [filieres])

  const analyzedDocuments = documents.filter((d) => {
    if (d.statutAnalyse !== 'ANALYSE') return false
    if (selectedUEIdForDocs && selectedUEIdForDocs !== '__all__') {
      return d.uniteEnseignementId === selectedUEIdForDocs || !d.uniteEnseignementId
    }
    return true
  })

  // Search-filtered documents for Step 1
  const filteredDocuments = useMemo(() => {
    if (!docSearchQuery.trim()) return analyzedDocuments
    const q = docSearchQuery.toLowerCase().trim()
    return analyzedDocuments.filter((d) => {
      const nameMatch = d.nomFichier.toLowerCase().includes(q)
      const ueMatch = (d.uniteEnseignementCode ?? '').toLowerCase().includes(q) || (d.uniteEnseignementNom ?? '').toLowerCase().includes(q)
      const themeMatch = d.themesDetectes?.some((t) => t.toLowerCase().includes(q)) ?? false
      return nameMatch || ueMatch || themeMatch
    })
  }, [analyzedDocuments, docSearchQuery])

  // Select all / Deselect all
  const selectAllFiltered = useCallback(() => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      for (const doc of filteredDocuments) {
        next.add(doc.id)
      }
      return next
    })
  }, [filteredDocuments])

  const deselectAllFiltered = useCallback(() => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      for (const doc of filteredDocuments) {
        next.delete(doc.id)
      }
      return next
    })
  }, [filteredDocuments])

  const allFilteredSelected = filteredDocuments.length > 0 && filteredDocuments.every((d) => selectedDocIds.has(d.id))
  const someFilteredSelected = filteredDocuments.some((d) => selectedDocIds.has(d.id)) && !allFilteredSelected

  // Helper: format file size
  function formatFileSize(bytes: number | null): string {
    if (bytes === null || bytes === 0) return ''
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  // Helper: format date
  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  // Helper: file type icon/label
  function getFileTypeLabel(mime: string | null): { label: string; color: string } {
    if (!mime) return { label: 'Fichier', color: 'bg-muted text-muted-foreground border-border /40  ' }
    if (mime.includes('pdf')) return { label: 'PDF', color: 'bg-destructive/15 text-destructive border-destructive/30 ' }
    if (mime.includes('word') || mime.includes('document')) return { label: 'DOC', color: 'bg-info/15 text-info border-info/30 ' }
    if (mime.includes('powerpoint') || mime.includes('presentation')) return { label: 'PPT', color: 'bg-primary/15 text-primary-text border-primary/30' }
    if (mime.includes('text')) return { label: 'TXT', color: 'bg-success/15 text-success-text border-success/30 ' }
    if (mime.includes('image')) return { label: 'IMG', color: 'bg-secondary/15 text-secondary border-secondary/30 ' }
    return { label: 'Fichier', color: 'bg-muted text-muted-foreground border-border /40  ' }
  }

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

    const total = qcuCount + qcmCount + qrcCount + reflexionCount + codeCount
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
        headers: { 'Content-Type': 'application/json' },
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
              code: codeCount,
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
          type: (['QCU', 'QCM', 'QRC', 'REFLEXION', 'CODE'].includes(q.type as string) ? q.type : 'QRC') as ContenuQuestion['type'],
          enonce: String(q.enonce || ''),
          propositions: q.propositions || null,
          reponseCorrecte: q.reponseCorrecte || null,
          explication: (q.explication as string | null) ?? null,
          difficulte: (['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'].includes(q.difficulte as string)
            ? q.difficulte : 'MOYEN') as ContenuQuestion['difficulte'],
          bareme: typeof q.bareme === 'number' ? q.bareme : 1,
          ueCode: (q.ueCode as string | null) ?? null,
          ueNom: (q.ueNom as string | null) ?? null,
          // CODE-specific fields
          langage: (q.langage as string | undefined) ?? undefined,
          codeInitial: (q.codeInitial as string | undefined) ?? undefined,
          fonctionSignature: (q.fonctionSignature as string | undefined) ?? undefined,
          testsPublics: Array.isArray(q.testsPublics) ? q.testsPublics as Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }> : undefined,
          testsPrives: Array.isArray(q.testsPrives) ? q.testsPrives as Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }> : undefined,
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

  // ─── Edit question (enhanced) ───
  const startEditing = (q: ContenuQuestion) => {
    setEditingQuestionId(q.id)
    setEditData({
      enonce: q.enonce,
      bareme: q.bareme,
      propositions: q.propositions ? q.propositions.map(p => ({ ...p })) : null,
      reponseCorrecte: q.reponseCorrecte,
      explication: q.explication,
      // CODE-specific fields
      langage: q.langage,
      codeInitial: q.codeInitial,
      fonctionSignature: q.fonctionSignature,
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
          ? {
              ...q,
              enonce: editData.enonce ?? q.enonce,
              bareme: editData.bareme ?? q.bareme,
              propositions: editData.propositions !== undefined ? editData.propositions : q.propositions,
              reponseCorrecte: editData.reponseCorrecte !== undefined ? editData.reponseCorrecte : q.reponseCorrecte,
              explication: editData.explication !== undefined ? editData.explication : q.explication,
              // CODE-specific fields
              langage: editData.langage !== undefined ? editData.langage : q.langage,
              codeInitial: editData.codeInitial !== undefined ? editData.codeInitial : q.codeInitial,
              fonctionSignature: editData.fonctionSignature !== undefined ? editData.fonctionSignature : q.fonctionSignature,
            }
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

  // ─── Regenerate single question ───
  const handleRegenerateSingleQuestion = async (q: ContenuQuestion) => {
    if (!user?.id || !generatedContenu) return
    const docIdsArray = Array.from(selectedDocIds)
    if (docIdsArray.length === 0) {
      toast.error('Erreur de régénération', {
        description: 'Aucun document source sélectionné.',
      })
      return
    }
    setRegeneratingQuestionId(q.id)

    try {
      // BUGFIX (QUESTIONS-IA-REGENERATE) :
      // 1. Backend attend documentId (singulier), pas documentIds (pluriel).
      //    On envoie le premier document sélectionné (les docs ont été utilisés
      //    ensemble pour la génération initiale, le premier suffit pour la
      //    régénération d'une seule question).
      // 2. q.id peut être "q1" (ID temporaire de preview, non persisté en DB).
      //    Le backend a été fixé pour ne pas planter si GetByID échoue (preview).
      // 3. La réponse backend est {question: {...}}, pas {...} directement.
      const res = await fetch(`/api/questions/${q.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docIdsArray[0],
          type: q.type,
          difficulte: q.difficulte || difficulte,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la régénération')
      }

      // BUGFIX : la réponse est {question: {type, enonce, ...}}, pas {type, ...}
      const data = await res.json()
      const rq = data.question || data

      const newQ: ContenuQuestion = {
        id: q.id,
        type: (['QCU', 'QCM', 'QRC', 'REFLEXION', 'CODE'].includes(rq.type as string) ? rq.type : q.type) as ContenuQuestion['type'],
        enonce: String(rq.enonce || q.enonce),
        propositions: rq.propositions || q.propositions,
        reponseCorrecte: rq.reponseCorrecte || q.reponseCorrecte,
        explication: (rq.explication as string | null) ?? q.explication,
        difficulte: (['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'].includes(rq.difficulte as string)
          ? rq.difficulte : q.difficulte) as ContenuQuestion['difficulte'],
        bareme: typeof rq.bareme === 'number' ? rq.bareme : q.bareme,
        ueCode: (rq.ueCode as string | null) ?? q.ueCode,
        ueNom: (rq.ueNom as string | null) ?? q.ueNom,
      }

      // BUGFIX : utiliser setGeneratedContenu(prev => ...) au lieu de capturer
      // generatedContenu dans la closure → évite d'écraser les edits faits
      // pendant la régénération (race condition).
      setGeneratedContenu((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          questions: prev.questions.map((existingQ) =>
            existingQ.id === q.id ? newQ : existingQ
          ),
        }
      })

      toast.success('Question régénérée')
    } catch (err) {
      toast.error('Erreur de régénération', {
        description: err instanceof Error ? err.message : 'Impossible de régénérer cette question.',
      })
    } finally {
      setRegeneratingQuestionId(null)
    }
  }

  // ─── Regenerate all ───
  const handleRegenerate = () => {
    setGeneratedContenu(null)
    setCurrentStep('configure')
  }

  // ─── Save to Banque d'Épreuves ───
  const handleSave = async () => {
    if (!user?.id || !generatedContenu) return

    // UE obligatoire : une épreuve sans UE devient orpheline (pas de certificats)
    const effectiveUEId = autoDetectedUEId || (selectedUEId && selectedUEId !== '__none__' ? selectedUEId : null)
    if (!effectiveUEId) {
      toast.error('Unité d\'Enseignement requise', {
        description: 'Sélectionnez une UE. Sans UE, les sessions ne produiront aucun certificat.',
      })
      return
    }

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur')
      }

      toast.success('Épreuve enregistrée', {
        description: 'L\'épreuve a été ajoutée à la Banque d\'épreuves.',
      })
      router.push(PAGE_ROUTES['banque-epreuves'])
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
      case 'configure': return (qcuCount + qcmCount + qrcCount + reflexionCount + codeCount) > 0
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

  // ─── Navigate to next/previous step ───
  const goNextStep = () => {
    const currentIdx = wizardSteps.findIndex((s) => s.id === currentStep)
    if (currentIdx < wizardSteps.length - 1 && isStepValid(currentStep)) {
      setCurrentStep(wizardSteps[currentIdx + 1].id)
    }
  }

  const goPrevStep = () => {
    const currentIdx = wizardSteps.findIndex((s) => s.id === currentStep)
    if (currentIdx > 0) {
      setCurrentStep(wizardSteps[currentIdx - 1].id)
    }
  }

  // ─── Render: Question Card in Preview (Enhanced) ───
  const renderQuestionCard = (q: ContenuQuestion, idx: number) => {
    const isEditing = editingQuestionId === q.id
    const isExpanded = expandedExplanations.has(q.id)
    const isRegenerating = regeneratingQuestionId === q.id
    const borderColor = TYPE_BORDER_COLORS[q.type] || 'border-l-success'

    return (
      <motion.div
        key={q.id}
        variants={itemVariants}
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`rounded-xl border border-l-4 ${borderColor} bg-card shadow-sm overflow-hidden ${
          isRegenerating ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success-text ">
              {idx + 1}
            </span>
            <Badge variant="outline" className={`gap-1 ${TYPE_COLORS[q.type] || ''}`}>
              {q.type}
            </Badge>
            <Badge variant="outline" className={DIFFICULTE_COLORS[q.difficulte] || ''}>
              {DIFFICULTE_LABELS[q.difficulte] || q.difficulte}
            </Badge>
            {q.ueCode && (
              <Badge variant="outline" className="gap-1 bg-info/15 text-info border-info/30 ">
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
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Énoncé</Label>
                <Textarea
                  value={editData.enonce ?? ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, enonce: e.target.value }))}
                  className="min-h-[80px] text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Barème</Label>
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

              {/* Edit propositions for QCU/QCM */}
              {(q.type === 'QCU' || q.type === 'QCM') && editData.propositions && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Propositions</Label>
                  {editData.propositions.map((prop, pIdx) => (
                    <div key={prop.id} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold bg-muted text-muted-foreground">
                        {String.fromCharCode(65 + pIdx)}
                      </span>
                      <Input
                        value={prop.text}
                        onChange={(e) => {
                          const newProps = [...(editData.propositions ?? [])]
                          newProps[pIdx] = { ...newProps[pIdx], text: e.target.value }
                          setEditData((prev) => ({ ...prev, propositions: newProps }))
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Edit reponseCorrecte for QRC/REFLEXION */}
              {(q.type === 'QRC' || q.type === 'REFLEXION') && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {q.type === 'QRC' ? 'Réponse modèle' : 'Guide de correction'}
                  </Label>
                  <Textarea
                    value={
                      editData.reponseCorrecte
                        ? (Array.isArray(editData.reponseCorrecte) ? editData.reponseCorrecte.join('\n') : String(editData.reponseCorrecte))
                        : ''
                    }
                    onChange={(e) => setEditData((prev) => ({ ...prev, reponseCorrecte: e.target.value }))}
                    className="min-h-[60px] text-sm"
                  />
                </div>
              )}

              {/* Edit CODE-specific fields */}
              {q.type === 'CODE' && (
                <div className="space-y-3">
                  {/* Language selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Langage de programmation</Label>
                    <Select
                      value={editData.langage ?? 'python'}
                      onValueChange={(val) => setEditData((prev) => ({ ...prev, langage: val as CodingLanguage }))}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue placeholder="Sélectionner un langage" />
                      </SelectTrigger>
                      <SelectContent>
                        {CODING_LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            <span className="flex items-center gap-2">
                              <span>{lang.icon}</span>
                              <span>{lang.label}</span>
                              <span className="text-muted-foreground text-xs">({lang.fileExtension})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Function signature */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Signature de la fonction</Label>
                    <Input
                      value={editData.fonctionSignature ?? ''}
                      onChange={(e) => setEditData((prev) => ({ ...prev, fonctionSignature: e.target.value }))}
                      placeholder="ex: def calculer_moyenne(nombres):"
                      className="h-8 text-sm font-mono"
                    />
                  </div>

                  {/* Starter code */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Code initial (template)</Label>
                    <Textarea
                      value={editData.codeInitial ?? ''}
                      onChange={(e) => setEditData((prev) => ({ ...prev, codeInitial: e.target.value }))}
                      placeholder="Code de départ fourni à l'étudiant..."
                      className="min-h-[100px] text-sm font-mono"
                    />
                  </div>

                  {/* Model solution */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Solution modèle</Label>
                    <Textarea
                      value={
                        editData.reponseCorrecte
                          ? (Array.isArray(editData.reponseCorrecte) ? editData.reponseCorrecte.join('\n') : String(editData.reponseCorrecte))
                          : ''
                      }
                      onChange={(e) => setEditData((prev) => ({ ...prev, reponseCorrecte: e.target.value }))}
                      placeholder="Code de la solution correcte..."
                      className="min-h-[100px] text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Edit explication */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Explication de l&apos;IA</Label>
                <Textarea
                  value={editData.explication ?? ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, explication: e.target.value }))}
                  placeholder="Explication optionnelle..."
                  className="min-h-[60px] text-sm"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enonce}</p>
          )}

          {/* Propositions (read mode) */}
          {!isEditing && (q.type === 'QCU' || q.type === 'QCM') && q.propositions && (
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
                        ? 'bg-success/10 border border-success/30 '
                        : 'bg-muted/30'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                      isCorrect
                        ? 'bg-success/20 text-success-text  '
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {String.fromCharCode(65 + pIdx)}
                    </span>
                    <span className={isCorrect ? 'font-medium text-success-text' : ''}>
                      {typeof prop === 'string' ? prop : prop.text}
                    </span>
                    {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-success-text" />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Réponse for QRC/TRS (read mode) */}
          {!isEditing && (q.type === 'QRC' || q.type === 'REFLEXION') && q.reponseCorrecte && (
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
                    ? 'bg-success/10 border-success/30 '
                    : 'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/50'
                }`}>
                  {Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte}
                </div>
              )}
            </div>
          )}

          {/* CODE-specific info (read mode) */}
          {!isEditing && q.type === 'CODE' && (
            <div className="mt-3 space-y-2.5">
              {/* Language badge */}
              {q.langage && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 bg-secondary/15 text-secondary border-secondary/30 ">
                    <Hash className="h-3 w-3" />
                    {(() => { const cfg = getCodingLanguageConfig(q.langage as CodingLanguage); return `${cfg.icon} ${cfg.label}`; })()}
                  </Badge>
                  {q.fonctionSignature && (
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-xs" title={q.fonctionSignature}>
                      {q.fonctionSignature}
                    </code>
                  )}
                </div>
              )}

              {/* Starter code */}
              {q.codeInitial && (
                <Collapsible open={expandedExplanations.has(`code-${q.id}`)} onOpenChange={() => {
                  setExpandedExplanations((prev) => {
                    const next = new Set(prev)
                    const key = `code-${q.id}`
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {expandedExplanations.has(`code-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Code initial
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <pre className="rounded-md bg-zinc-900 text-zinc-100 p-3 text-xs overflow-x-auto font-mono leading-relaxed">
                      {q.codeInitial}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Solution */}
              {q.reponseCorrecte && (
                <Collapsible open={expandedExplanations.has(`sol-${q.id}`)} onOpenChange={() => {
                  setExpandedExplanations((prev) => {
                    const next = new Set(prev)
                    const key = `sol-${q.id}`
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {expandedExplanations.has(`sol-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Solution
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <pre className="rounded-md bg-muted text-success-text p-3 text-xs overflow-x-auto font-mono leading-relaxed">
                      {Array.isArray(q.reponseCorrecte) ? q.reponseCorrecte.join('\n') : q.reponseCorrecte}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Public tests */}
              {q.testsPublics && q.testsPublics.length > 0 && (
                <Collapsible open={expandedExplanations.has(`pub-${q.id}`)} onOpenChange={() => {
                  setExpandedExplanations((prev) => {
                    const next = new Set(prev)
                    const key = `pub-${q.id}`
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {expandedExplanations.has(`pub-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Tests publics ({q.testsPublics.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="space-y-1.5">
                      {q.testsPublics.map((test, tIdx) => (
                        <div key={tIdx} className="rounded-md border bg-muted/30 p-2 text-xs">
                          <div className="font-medium text-muted-foreground">{test.nom}</div>
                          <div className="mt-1 font-mono">
                            <span className="text-info">Entrée:</span> <span className="text-foreground">{test.entree}</span>
                          </div>
                          <div className="font-mono">
                            <span className="text-success-text">Attendu:</span> <span className="text-foreground">{test.sortieAttendue}</span>
                          </div>
                          {test.description && <div className="text-muted-foreground mt-0.5 italic">{test.description}</div>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Private tests */}
              {q.testsPrives && q.testsPrives.length > 0 && (
                <Collapsible open={expandedExplanations.has(`priv-${q.id}`)} onOpenChange={() => {
                  setExpandedExplanations((prev) => {
                    const next = new Set(prev)
                    const key = `priv-${q.id}`
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {expandedExplanations.has(`priv-${q.id}`) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Tests privés ({q.testsPrives.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="space-y-1.5">
                      {q.testsPrives.map((test, tIdx) => (
                        <div key={tIdx} className="rounded-md border bg-muted/30 p-2 text-xs">
                          <div className="font-medium text-muted-foreground">{test.nom}</div>
                          <div className="mt-1 font-mono">
                            <span className="text-info">Entrée:</span> <span className="text-foreground">{test.entree}</span>
                          </div>
                          <div className="font-mono">
                            <span className="text-success-text">Attendu:</span> <span className="text-foreground">{test.sortieAttendue}</span>
                          </div>
                          {test.description && <div className="text-muted-foreground mt-0.5 italic">{test.description}</div>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {/* Explication (read mode) */}
          {!isEditing && q.explication && (
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
              <Button size="sm" className=" h-8" onClick={saveEditing}>
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
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-warning/40 text-warning hover:bg-warning/10  dark:text-warning dark:hover:bg-warning/10"
                onClick={() => handleRegenerateSingleQuestion(q)}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
                Régénérer
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/10">
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
                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteQuestion(q.id)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  const totalQuestions = qcuCount + qcmCount + qrcCount + reflexionCount + codeCount

  // ─── Compute total themes for summary bar ───
  const selectedDocumentsTotalThemes = useMemo(() => {
    return analyzedDocuments
      .filter(d => selectedDocIds.has(d.id))
      .reduce((sum, d) => sum + (d.themesDetectes?.length ?? 0), 0)
  }, [analyzedDocuments, selectedDocIds])

  // ─── Main Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6"
      >
        <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-success-text" />
          Génération IA d&apos;Épreuves
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sélectionnez des documents, configurez les paramètres et laissez l&apos;IA générer une épreuve complète
        </p>
      </motion.div>

      {/* Modern Stepper */}
      <ModernStepper steps={wizardSteps} currentStep={currentStep} onStepClick={goToStep} />

      <Separator />

      {/* ─── Step Content with AnimatePresence ─── */}
      <AnimatePresence mode="wait">
        {/* ─── Step 1: Select Documents ─── */}
        {currentStep === 'select-docs' && (
          <motion.div
            key="select-docs"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {isLoadingDocs ? (
              <motion.div variants={itemVariants}>
                <Card>
                  <CardContent className="py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-success-text" />
                      <p className="text-sm font-medium">Chargement des documents...</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : analyzedDocuments.length === 0 ? (
              <motion.div variants={itemVariants}>
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-full bg-warning/15 p-4 ">
                        <AlertTriangle className="h-8 w-8 text-warning" />
                      </div>
                      <p className="text-sm font-semibold">Aucun document analysé</p>
                      <p className="text-xs text-muted-foreground text-center max-w-sm">
                        Importez et analysez au moins un document avant de générer une épreuve par IA.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-success/40 text-success-text hover:bg-success/10  dark:text-success-text dark:hover:bg-success/10"
                        onClick={() => router.push(PAGE_ROUTES.documents)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Aller aux Documents
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <>
                {/* ─── Toolbar: UE Filter + Search + Select All ─── */}
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                        {/* UE Filter */}
                        {(() => {
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
                            <div className="shrink-0">
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
                                <SelectTrigger className="h-9 text-sm w-full sm:w-[200px]">
                                  <Layers className="h-3.5 w-3.5 mr-1.5 text-success-text shrink-0" />
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
                            </div>
                          ) : null
                        })()}

                        {/* Search */}
                        <div className="relative flex-1 min-w-0">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Rechercher un document, UE ou thème..."
                            value={docSearchQuery}
                            onChange={(e) => setDocSearchQuery(e.target.value)}
                            className="h-9 pl-8 text-sm"
                          />
                          {docSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setDocSearchQuery('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Select All / Deselect All */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                            disabled={filteredDocuments.length === 0}
                          >
                            {allFilteredSelected ? (
                              <>
                                <X className="h-3 w-3 mr-1" />
                                Tout désélectionner
                              </>
                            ) : (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Tout sélectionner
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Results count & active filter */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {filteredDocuments.length} document{filteredDocuments.length > 1 ? 's' : ''} analysé{filteredDocuments.length > 1 ? 's' : ''}
                          {docSearchQuery && ` trouvé${filteredDocuments.length > 1 ? 's' : ''}`}
                          {analyzedDocuments.length !== filteredDocuments.length && ` sur ${analyzedDocuments.length}`}
                        </span>
                        {selectedDocIds.size > 0 && (
                          <>
                            <Separator orientation="vertical" className="h-3" />
                            <span className="font-medium text-success-text">
                              {selectedDocIds.size} sélectionné{selectedDocIds.size > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                        {selectedUEIdForDocs && selectedUEIdForDocs !== '__all__' && (
                          <>
                            <Separator orientation="vertical" className="h-3" />
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 bg-info/10 text-info border-info/30  ">
                              <Layers className="h-2.5 w-2.5" />
                              UE filtrée
                            </Badge>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* ─── Scrollable Document List ─── */}
                <motion.div variants={itemVariants}>
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display tracking-tight">
                        <FolderOpen className="h-4 w-4 text-success-text" />
                        Sélectionnez les documents sources
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {filteredDocuments.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-8 text-center">
                          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm font-medium text-muted-foreground">Aucun document trouvé</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {docSearchQuery ? 'Essayez un autre terme de recherche.' : 'Aucun document analysé disponible.'}
                          </p>
                          {docSearchQuery && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-xs"
                              onClick={() => setDocSearchQuery('')}
                            >
                              Effacer la recherche
                            </Button>
                          )}
                        </div>
                      ) : (
                        <ScrollArea className="h-[min(500px,50vh)]">
                          <div className="space-y-2 pr-1 pb-2">
                            {filteredDocuments.map((doc) => {
                              const isSelected = selectedDocIds.has(doc.id)
                              const themeCount = doc.themesDetectes?.length ?? 0
                              const fileType = getFileTypeLabel(doc.typeMime)
                              const fileSize = formatFileSize(doc.tailleFichier)
                              const fileDate = formatDate(doc.dateUpload)
                              return (
                                <motion.div
                                  key={doc.id}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className={`group flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all duration-200 ${
                                    isSelected
                                      ? 'border-success bg-success/10/80 shadow-sm   /40 dark:shadow-none'
                                      : 'border-muted hover:border-success/40 hover:bg-muted/30 '
                                  }`}
                                  onClick={() => toggleDocSelection(doc.id)}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleDocSelection(doc.id)}
                                    className="pointer-events-none shrink-0 mt-0.5"
                                  />

                                  {/* File type icon */}
                                  <div className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg ${isSelected ? 'bg-success/20 ' : 'bg-muted'}`}>
                                    {doc.typeMime?.includes('pdf') ? (
                                      <FileText className="h-4.5 w-4.5 text-destructive" />
                                    ) : (
                                      <File className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>

                                  {/* Document info */}
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-success-text' : ''}`} title={doc.nomFichier}>
                                      {doc.nomFichier}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      <Badge variant="outline" className={`h-4.5 px-1.5 text-[9px] ${fileType.color}`}>
                                        {fileType.label}
                                      </Badge>
                                      {doc.uniteEnseignementCode && (
                                        <Badge variant="outline" className="h-4.5 max-w-[140px] px-1.5 text-[9px] bg-info/15 text-info border-info/30  truncate gap-0.5">
                                          <Layers className="h-2.5 w-2.5" />
                                          {doc.uniteEnseignementCode}
                                        </Badge>
                                      )}
                                      {fileSize && (
                                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                          <HardDrive className="h-2.5 w-2.5" />
                                          {fileSize}
                                        </span>
                                      )}
                                      {fileDate && (
                                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                          <Calendar className="h-2.5 w-2.5" />
                                          {fileDate}
                                        </span>
                                      )}
                                    </div>
                                    {/* Themes */}
                                    {themeCount > 0 && doc.themesDetectes && doc.themesDetectes.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {doc.themesDetectes.slice(0, 4).map((theme, tIdx) => (
                                          <span
                                            key={tIdx}
                                            className="inline-flex items-center rounded-md bg-success/15/60 px-1.5 py-0.5 text-[10px] font-medium text-success-text "
                                          >
                                            {theme}
                                          </span>
                                        ))}
                                        {doc.themesDetectes.length > 4 && (
                                          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            +{doc.themesDetectes.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Selection indicator */}
                                  {isSelected && (
                                    <CheckCircle2 className="h-5 w-5 text-success-text shrink-0 mt-0.5" />
                                  )}
                                </motion.div>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* ─── Summary bar at bottom ─── */}
                <motion.div variants={itemVariants}>
                  <div className="flex items-center justify-between rounded-xl border bg-background p-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm shrink-0">
                        <FileText className="h-4 w-4 text-success-text" />
                        <span className="font-semibold">{selectedDocIds.size}</span>
                        <span className="text-muted-foreground">document{selectedDocIds.size > 1 ? 's' : ''} sélectionné{selectedDocIds.size > 1 ? 's' : ''}</span>
                      </div>
                      {selectedDocumentsTotalThemes > 0 && (
                        <>
                          <Separator orientation="vertical" className="h-4 shrink-0" />
                          <div className="flex items-center gap-1.5 text-sm shrink-0">
                            <BookOpen className="h-4 w-4 text-info" />
                            <span className="font-semibold">{selectedDocumentsTotalThemes}</span>
                            <span className="text-muted-foreground">thème{selectedDocumentsTotalThemes > 1 ? 's' : ''}</span>
                          </div>
                        </>
                      )}
                    </div>
                    <Button
                      className=" shrink-0"
                      disabled={!isStepValid('select-docs')}
                      onClick={goNextStep}
                    >
                      Suivant
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        )}

        {/* ─── Step 2: Configure Parameters ─── */}
        {currentStep === 'configure' && (
          <motion.div
            key="configure"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left: Épreuve group */}
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display tracking-tight">
                      <ClipboardList className="h-4 w-4 text-success-text" />
                      Épreuve
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <ClipboardList className="h-3 w-3 text-info" />
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <Send className="h-3 w-3 text-warning" />
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
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-success-text" />
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
                      <div className="space-y-1 min-w-0">
                        <Label className="text-xs font-medium">Difficulté</Label>
                        <Select value={difficulte} onValueChange={setDifficulte}>
                          <SelectTrigger className="h-8 text-sm w-full overflow-hidden" title={DIFFICULTE_LABELS[difficulte] || difficulte}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-w-[280px]">
                            <SelectItem value="FACILE">Facile — 60% faciles, 25% moyennes</SelectItem>
                            <SelectItem value="MOYEN">Moyen — 50% moyennes, 25% difficiles</SelectItem>
                            <SelectItem value="DIFFICILE">Difficile — 50% difficiles, 30% expertes</SelectItem>
                            <SelectItem value="EXPERT">Expert — 60% expertes, 25% difficiles</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">La majorité des questions sera de ce niveau</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Right: Questions group */}
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display tracking-tight">
                      <Brain className="h-4 w-4 text-success-text" />
                      Questions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <QuestionTypeCounter
                      label="Choix unique"
                      badgeClass="bg-info/15 text-info border-info/30 "
                      value={qcuCount}
                      onChange={setQcuCount}
                    />
                    <QuestionTypeCounter
                      label="Choix multiple"
                      badgeClass="bg-warning/15 text-warning border-warning/30 "
                      value={qcmCount}
                      onChange={setQcmCount}
                    />
                    <QuestionTypeCounter
                      label="Réponse courte"
                      badgeClass="bg-success/15 text-success-text border-success/30 "
                      value={qrcCount}
                      onChange={setQrcCount}
                    />
                    <QuestionTypeCounter
                      label="Sujet de réflexion"
                      badgeClass="bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800"
                      value={reflexionCount}
                      onChange={setReflexionCount}
                    />
                    <QuestionTypeCounter
                      label="Programmation / Code"
                      badgeClass="bg-secondary/15 text-secondary border-secondary/30 "
                      value={codeCount}
                      onChange={setCodeCount}
                    />

                    <div className={`rounded-lg border p-3 ${totalQuestions > 50 ? 'bg-warning/10 border-warning/40 ' : 'bg-muted/30'}`}>
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
                        <p className="text-xs text-warning mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Grand nombre de questions — la génération peut prendre plusieurs minutes
                        </p>
                      )}
                      {totalQuestions > 100 && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Maximum 100 questions autorisées
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Context group */}
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display tracking-tight">
                    <Settings className="h-4 w-4 text-success-text" />
                    Contexte
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <BookOpen className="h-3 w-3 text-success-text" />
                        Filière cible
                        {filieres.length === 1 && (
                          <Badge variant="outline" className="text-[10px] py-0 bg-success/10 text-success-text border-success/30 ">Auto</Badge>
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
                        <SelectTrigger className="h-8 text-sm w-full">
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
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-info" />
                        Niveau cible
                        {selectedFiliereId && filieres.find((f) => f.id === selectedFiliereId)?.niveaux.length === 1 && (
                          <Badge variant="outline" className="text-[10px] py-0 bg-success/10 text-success-text border-success/30 ">Auto</Badge>
                        )}
                      </Label>
                      <Select value={selectedNiveau} onValueChange={(val) => { setSelectedNiveau(val); setSelectedUEId('') }}>
                        <SelectTrigger className="h-8 text-sm w-full">
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
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Hash className="h-3 w-3 text-info" />
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
                        <SelectTrigger className="h-8 text-sm w-full overflow-hidden" title={(() => {
                          if (!selectedUEId || selectedUEId === '__none__') return ''
                          const sel = filieres.find((f) => f.id === selectedFiliereId)
                          const ue = sel?.unitesEnseignement.find(u => u.id === selectedUEId)
                          return ue ? `${ue.code} — ${ue.nom} (${ue.typeSeances.join('/')})` : ''
                        })()}>
                          <SelectValue placeholder="Sélectionnez une UE" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[360px]">
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
                                  <SelectItem key={ue.id} value={ue.id} title={`${ue.code} — ${ue.nom} (${ue.typeSeances.join('/')})`}>
                                    {ue.code} — {ue.nom} ({ue.typeSeances.join('/')})
                                  </SelectItem>
                                ))}
                              </>
                            )
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs font-medium">Langue</Label>
                      <Select value={langue} onValueChange={setLangue}>
                        <SelectTrigger className="h-8 text-sm w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
            </motion.div>

            {/* Navigation */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={goPrevStep}>
                  <ArrowLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <Button
                  className=""
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
            </motion.div>
          </motion.div>
        )}

        {/* ─── Step 3: Preview ─── */}
        {currentStep === 'preview' && generatedContenu && (
          <motion.div
            key="preview"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Summary bar at top */}
            <motion.div variants={itemVariants}>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-success/30 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 p-4 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-success-text" />
                  <span className="text-sm font-semibold">{generatedContenu.questions.length} question(s)</span>
                </div>
                <Separator orientation="vertical" className="hidden h-5 sm:block" />
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-info" />
                  <span className="text-sm font-semibold">{generatedContenu.baremeTotal} pts / {noteTotal}</span>
                </div>
                <Separator orientation="vertical" className="hidden h-5 sm:block" />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-sm font-semibold">{formatDuree(duree)}</span>
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
                            <Badge key={ueCode} variant="outline" className="text-[10px] gap-1 bg-info/15 text-info border-info/30 ">
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
                    Régénérer tout
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Consignes */}
            {generatedContenu.consignes && (
              <motion.div variants={itemVariants} className="rounded-lg border border-warning/30 bg-warning/10 p-3  ">
                <p className="text-xs font-semibold text-warning dark:text-warning mb-1">Consignes</p>
                <p className="text-sm text-warning  whitespace-pre-wrap">{generatedContenu.consignes}</p>
              </motion.div>
            )}

            {/* Question list — grouped by UE */}
            <motion.div variants={containerVariants} className="space-y-4">
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
                  <motion.div key={ueKey} variants={itemVariants}>
                    <div className="flex items-center gap-2 mb-2 mt-2">
                      <Layers className="h-4 w-4 text-success-text" />
                      <span className="text-sm font-semibold text-success-text dark:text-success-text">
                        {group.code ? `${group.code} — ` : ''}{group.nom}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.questions.length} question{group.questions.length > 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {group.questions.reduce((s, q) => s + q.bareme, 0)} pts
                      </Badge>
                    </div>
                    <motion.div
                      variants={containerVariants}
                      className="space-y-3 ml-0 sm:ml-4"
                    >
                      {group.questions.map((q) => {
                        const idx = globalIdx++
                        return renderQuestionCard(q, idx)
                      })}
                    </motion.div>
                  </motion.div>
                ))
              })()}
            </motion.div>

            {/* Navigation */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('configure')}>
                  <ArrowLeft className="h-4 w-4" />
                  Modifier les paramètres
                </Button>
                <Button
                  className=""
                  onClick={() => setCurrentStep('save')}
                >
                  Suivant : Enregistrer
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Step 4: Save ─── */}
        {currentStep === 'save' && generatedContenu && (
          <motion.div
            key="save"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display tracking-tight">
                    <Save className="h-4 w-4 text-success-text" />
                    Enregistrer dans la Banque d&apos;Épreuves
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Clean summary grid */}
                  <div className="rounded-xl border bg-muted/20 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Wand2 className="h-5 w-5 text-success-text" />
                      <span className="font-semibold text-base">{titreEpreuve || `Épreuve IA - ${new Date().toLocaleDateString('fr-FR')}`}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border bg-background p-3 text-center">
                        <Eye className="h-4 w-4 mx-auto text-success-text mb-1" />
                        <p className="text-lg font-bold">{generatedContenu.questions.length}</p>
                        <p className="text-[10px] text-muted-foreground">Questions</p>
                      </div>
                      <div className="rounded-lg border bg-background p-3 text-center">
                        <Send className="h-4 w-4 mx-auto text-info mb-1" />
                        <p className="text-lg font-bold">{generatedContenu.baremeTotal}/{noteTotal}</p>
                        <p className="text-[10px] text-muted-foreground">Points</p>
                      </div>
                      <div className="rounded-lg border bg-background p-3 text-center">
                        <Clock className="h-4 w-4 mx-auto text-warning mb-1" />
                        <p className="text-lg font-bold">{formatDuree(duree)}</p>
                        <p className="text-[10px] text-muted-foreground">Durée</p>
                      </div>
                      <div className="rounded-lg border bg-background p-3 text-center">
                        <FileText className="h-4 w-4 mx-auto text-info mb-1" />
                        <p className="text-lg font-bold">{selectedDocIds.size}</p>
                        <p className="text-[10px] text-muted-foreground">Documents</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="gap-1 bg-info/10 text-info border-info/30  ">
                        <Sparkles className="h-3 w-3" />
                        Générée par IA
                      </Badge>
                      {typeControle && (
                        <Badge variant="outline" className="gap-1">
                          {TYPE_CONTROLE_OPTIONS.find(o => o.value === typeControle)?.label || typeControle}
                        </Badge>
                      )}
                      {difficulte && (
                        <Badge variant="outline" className={DIFFICULTE_COLORS[difficulte] || ''}>
                          {DIFFICULTE_LABELS[difficulte] || difficulte}
                        </Badge>
                      )}
                      {selectedFiliereId && (() => {
                        const f = filieres.find(fi => fi.id === selectedFiliereId)
                        return f ? (
                          <Badge variant="outline" className="gap-1">
                            <BookOpen className="h-3 w-3" />
                            {f.nom}
                          </Badge>
                        ) : null
                      })()}
                      {selectedUEId && selectedUEId !== '__none__' && (() => {
                        for (const f of filieres) {
                          const ue = f.unitesEnseignement.find(u => u.id === selectedUEId)
                          if (ue) return (
                            <Badge variant="outline" className="gap-1" key={ue.id}>
                              <Layers className="h-3 w-3" />
                              {ue.code}
                            </Badge>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    L&apos;épreuve sera enregistrée comme brouillon dans la Banque d&apos;Épreuves.
                    Vous pourrez ensuite la planifier et l&apos;attribuer à des groupes d&apos;étudiants.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Navigation */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('preview')}>
                  <ArrowLeft className="h-4 w-4" />
                  Retour à l&apos;aperçu
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-success/40 text-success-text hover:bg-success/10  dark:text-success-text dark:hover:bg-success/10"
                    onClick={() => router.push(PAGE_ROUTES['banque-epreuves'])}
                  >
                    <Layers className="h-4 w-4" />
                    Voir la Banque
                  </Button>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      className=" min-w-[140px]"
                      disabled={isSaving}
                      onClick={handleSave}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
