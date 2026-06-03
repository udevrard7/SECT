'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Clock,
  Calendar,
  HelpCircle,
  Users,
  Edit3,
  Send,
  Trash2,
  Eye,
  Play,
  CalendarDays,
  Activity,
  Square,
  BarChart3,
  Lock,
  Download,
  Search,
  Filter,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Shuffle,
  Ban,
  AlertTriangle,
  Loader2,
  ClipboardList,
  Trophy,
  FileDown,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

interface EpreuveQuestion {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: string
    enonce: string
    difficulte: string
  }
}

interface Session {
  id: string
  statut: string
  score: number | null
  etudiantId: string
  etudiant?: {
    id: string
    name: string
    email: string
  }
  alertes?: number
  reponses?: Array<{ id: string; questionId: string }>
  logEvents?: unknown
}

interface Epreuve {
  id: string
  enseignantId: string
  titre: string
  description: string | null
  duree: number
  dateDebut: string
  dateFin: string
  melangeQuestions: boolean
  melangePropositions: boolean
  blocageRetour: boolean
  statut: 'BROUILLON' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'CLOTUREE'
  groupesCibles: string[] | null
  questions: EpreuveQuestion[]
  sessions: Session[]
  createdAt: string
}

interface QuestionItem {
  id: string
  type: string
  enonce: string
  difficulte: string
  themes: string[] | null
  scoreQualite: number | null
  validee: boolean
}

// ─── Wizard step type ───

type WizardStep = 'infos' | 'questions' | 'groupes' | 'review'

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

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + '...'
}

function getStatutLabel(statut: string): string {
  switch (statut) {
    case 'BROUILLON': return 'Brouillon'
    case 'PLANIFIEE': return 'Planifiée'
    case 'EN_COURS': return 'En cours'
    case 'TERMINEE': return 'Terminée'
    case 'CLOTUREE': return 'Clôturée'
    default: return statut
  }
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
          <Edit3 className="h-3 w-3" />
          Brouillon
        </Badge>
      )
    case 'PLANIFIEE':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          <Calendar className="h-3 w-3" />
          Planifiée
        </Badge>
      )
    case 'EN_COURS':
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          <Activity className="h-3 w-3" />
          En cours
        </Badge>
      )
    case 'TERMINEE':
      return (
        <Badge variant="outline" className="gap-1 bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
          <Check className="h-3 w-3" />
          Terminée
        </Badge>
      )
    case 'CLOTUREE':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">
          <Lock className="h-3 w-3" />
          Clôturée
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getTypeBadgeColor(type: string): string {
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

// ─── Step indicator ───

function StepIndicator({ steps, currentStep, onStepClick }: {
  steps: { id: WizardStep; label: string }[]
  currentStep: WizardStep
  onStepClick: (step: WizardStep) => void
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep)

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = index < currentIndex

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div className={`h-0.5 w-6 sm:w-10 ${isCompleted ? 'bg-emerald-500' : 'bg-muted'}`} />
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

export function EpreuvesPage() {
  const user = useAuthStore((s) => s.user)

  // ─── State ───
  const [epreuves, setEpreuves] = useState<Epreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Create/Edit dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingEpreuve, setEditingEpreuve] = useState<Epreuve | null>(null)
  const [wizardStep, setWizardStep] = useState<WizardStep>('infos')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 1 - Infos
  const [formTitre, setFormTitre] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDuree, setFormDuree] = useState(60)
  const [formDateDebut, setFormDateDebut] = useState('')
  const [formDateFin, setFormDateFin] = useState('')

  // Step 2 - Questions
  const [availableQuestions, setAvailableQuestions] = useState<QuestionItem[]>([])
  const [selectedQuestions, setSelectedQuestions] = useState<Map<string, number>>(new Map()) // questionId -> bareme
  const [questionSearch, setQuestionSearch] = useState('')
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all')
  const [questionDiffFilter, setQuestionDiffFilter] = useState('all')
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false)
  const [formMelangeQuestions, setFormMelangeQuestions] = useState(true)
  const [formMelangePropositions, setFormMelangePropositions] = useState(true)
  const [formBlocageRetour, setFormBlocageRetour] = useState(false)

  // Step 3 - Groupes cibles
  const [formGroupesCibles, setFormGroupesCibles] = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Epreuve | null>(null)

  // Real-time monitoring dialog
  const [monitoringEpreuve, setMonitoringEpreuve] = useState<Epreuve | null>(null)
  const [monitoringDialogOpen, setMonitoringDialogOpen] = useState(false)

  // Date edit dialog
  const [dateEditTarget, setDateEditTarget] = useState<Epreuve | null>(null)
  const [dateEditDebut, setDateEditDebut] = useState('')
  const [dateEditFin, setDateEditFin] = useState('')

  // ─── Fetch epreuves ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/epreuves?enseignantId=${user.id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
      }
    } catch {
      // Silent fail
    }
  }, [user?.id])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchEpreuves()
      setIsLoading(false)
    }
    load()
  }, [fetchEpreuves])

  // ─── Fetch validated questions for wizard ───
  const fetchQuestions = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingQuestions(true)
    try {
      const res = await fetch(`/api/questions?userId=${user.id}&validee=true&limit=100`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setAvailableQuestions(data.questions ?? [])
      }
    } catch {
      // Silent
    } finally {
      setIsLoadingQuestions(false)
    }
  }, [user?.id])

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingEpreuve(null)
    resetForm()
    setWizardStep('infos')
    setCreateDialogOpen(true)
    fetchQuestions()
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (epreuve: Epreuve) => {
    setEditingEpreuve(epreuve)
    setFormTitre(epreuve.titre)
    setFormDescription(epreuve.description ?? '')
    setFormDuree(epreuve.duree)
    setFormDateDebut(toLocalDatetimeString(epreuve.dateDebut))
    setFormDateFin(toLocalDatetimeString(epreuve.dateFin))
    setFormMelangeQuestions(epreuve.melangeQuestions)
    setFormMelangePropositions(epreuve.melangePropositions)
    setFormBlocageRetour(epreuve.blocageRetour)
    setFormGroupesCibles(epreuve.groupesCibles?.join(', ') ?? '')

    // Populate selected questions
    const selMap = new Map<string, number>()
    epreuve.questions.forEach((eq) => {
      selMap.set(eq.questionId, eq.bareme)
    })
    setSelectedQuestions(selMap)

    setWizardStep('infos')
    setCreateDialogOpen(true)
    fetchQuestions()
  }

  // ─── Reset form ───
  const resetForm = () => {
    setFormTitre('')
    setFormDescription('')
    setFormDuree(60)
    setFormDateDebut('')
    setFormDateFin('')
    setFormMelangeQuestions(true)
    setFormMelangePropositions(true)
    setFormBlocageRetour(false)
    setFormGroupesCibles('')
    setSelectedQuestions(new Map())
    setQuestionSearch('')
    setQuestionTypeFilter('all')
    setQuestionDiffFilter('all')
  }

  // ─── Helper: date to local datetime string ───
  function toLocalDatetimeString(dateStr: string): string {
    const d = new Date(dateStr)
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }

  // ─── Toggle question selection ───
  const toggleQuestion = (questionId: string) => {
    setSelectedQuestions((prev) => {
      const next = new Map(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.set(questionId, 1)
      }
      return next
    })
  }

  // ─── Set bareme for a question ───
  const setBareme = (questionId: string, bareme: number) => {
    setSelectedQuestions((prev) => {
      const next = new Map(prev)
      next.set(questionId, bareme)
      return next
    })
  }

  // ─── Filter available questions ───
  const filteredQuestions = availableQuestions.filter((q) => {
    if (questionSearch && !q.enonce.toLowerCase().includes(questionSearch.toLowerCase())) return false
    if (questionTypeFilter !== 'all' && q.type !== questionTypeFilter) return false
    if (questionDiffFilter !== 'all' && q.difficulte !== questionDiffFilter) return false
    return true
  })

  // ─── Total points ───
  const totalPoints = Array.from(selectedQuestions.values()).reduce((sum, b) => sum + b, 0)

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!user?.id) return
    if (!formTitre || !formDuree || !formDateDebut || !formDateFin) {
      toast.error('Informations manquantes', { description: 'Veuillez remplir tous les champs obligatoires.' })
      return
    }
    if (selectedQuestions.size === 0) {
      toast.error('Aucune question sélectionnée', { description: 'L\'épreuve doit contenir au moins une question.' })
      return
    }

    setIsSubmitting(true)
    try {
      const questionsData = Array.from(selectedQuestions.entries()).map(([questionId, bareme], index) => ({
        questionId,
        bareme,
        ordre: index,
      }))

      const groupes = formGroupesCibles
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g.length > 0)

      const body = {
        enseignantId: user.id,
        titre: formTitre,
        description: formDescription || null,
        duree: formDuree,
        dateDebut: formDateDebut,
        dateFin: formDateFin,
        melangeQuestions: formMelangeQuestions,
        melangePropositions: formMelangePropositions,
        blocageRetour: formBlocageRetour,
        groupesCibles: groupes.length > 0 ? groupes : null,
        questions: questionsData,
      }

      const res = await fetch('/api/epreuves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la création')
      }

      toast.success('Épreuve créée', {
        description: `"${formTitre}" a été créée avec succès.`,
      })

      setCreateDialogOpen(false)
      resetForm()
      await fetchEpreuves()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Status action handlers ───
  const handleStatusAction = async (epreuveId: string, action: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/epreuves/${epreuveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'action')
      }

      toast.success(successMsg)
      await fetchEpreuves()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    }
  }

  // ─── Delete handler ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/epreuves/${deleteTarget.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la suppression')
      }
      toast.success('Épreuve déplacée vers la corbeille', {
        description: `"${deleteTarget.titre}" a été déplacée vers la corbeille. Vous pouvez la restaurer dans les 30 jours.`,
      })
      setDeleteTarget(null)
      await fetchEpreuves()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer l\'épreuve.',
      })
    }
  }

  // ─── Open monitoring dialog ───
  const handleOpenMonitoring = async (epreuve: Epreuve) => {
    try {
      const res = await fetch(`/api/epreuves/${epreuve.id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMonitoringEpreuve(data.epreuve ?? epreuve)
      } else {
        setMonitoringEpreuve(epreuve)
      }
    } catch {
      setMonitoringEpreuve(epreuve)
    }
    setMonitoringDialogOpen(true)
  }

  // ─── Edit dates handler ───
  const handleEditDates = () => {
    if (!dateEditTarget) return
    const editDates = async () => {
      try {
        const res = await fetch(`/api/epreuves/${dateEditTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            dateDebut: dateEditDebut,
            dateFin: dateEditFin,
          }),
        })
        if (!res.ok) throw new Error('Erreur')
        toast.success('Dates mises à jour')
        setDateEditTarget(null)
        await fetchEpreuves()
      } catch {
        toast.error('Erreur lors de la mise à jour des dates')
      }
    }
    editDates()
  }

  // ─── Open date edit ───
  const openDateEdit = (epreuve: Epreuve) => {
    setDateEditTarget(epreuve)
    setDateEditDebut(toLocalDatetimeString(epreuve.dateDebut))
    setDateEditFin(toLocalDatetimeString(epreuve.dateFin))
  }

  // ─── Force submission ───
  const handleForceSubmission = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'soumettre' }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Soumission forcée', { description: 'La session a été soumise de force.' })
      // Refresh monitoring
      if (monitoringEpreuve) {
        await handleOpenMonitoring(monitoringEpreuve)
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de forcer la soumission.' })
    }
  }

  // ─── Export handler ───
  const handleExport = (epreuve: Epreuve) => {
    toast.success('Export lancé', {
      description: `Les résultats de "${epreuve.titre}" sont en cours d'export.`,
    })
  }

  // ─── Render action buttons based on status ───
  const renderActions = (epreuve: Epreuve) => {
    switch (epreuve.statut) {
      case 'BROUILLON':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenEdit(epreuve)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Modifier
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleStatusAction(epreuve.id, 'publier', 'Épreuve publiée', )}
            >
              <Send className="h-3.5 w-3.5" />
              Publier
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
        )
      case 'PLANIFIEE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenMonitoring(epreuve)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              <Eye className="h-3.5 w-3.5" />
              Voir
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleStatusAction(epreuve.id, 'lancer', 'Épreuve lancée')}
            >
              <Play className="h-3.5 w-3.5" />
              Lancer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDateEdit(epreuve)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Modifier dates
            </Button>
          </div>
        )
      case 'EN_COURS':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleOpenMonitoring(epreuve)}
            >
              <Activity className="h-3.5 w-3.5" />
              Suivi temps réel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => handleStatusAction(epreuve.id, 'terminer', 'Épreuve terminée')}
            >
              <Square className="h-3.5 w-3.5" />
              Terminer
            </Button>
          </div>
        )
      case 'TERMINEE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleOpenMonitoring(epreuve)}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Résultats
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleStatusAction(epreuve.id, 'cloturer', 'Épreuve clôturée')}
            >
              <Lock className="h-3.5 w-3.5" />
              Clôturer
            </Button>
          </div>
        )
      case 'CLOTUREE':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => handleOpenMonitoring(epreuve)}
            >
              <Trophy className="h-3.5 w-3.5" />
              Résultats
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport(epreuve)}
            >
              <Download className="h-3.5 w-3.5" />
              Exporter
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  // ─── Wizard validation ───
  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 'infos':
        return !!(formTitre && formDuree > 0 && formDateDebut && formDateFin)
      case 'questions':
        return selectedQuestions.size > 0
      case 'groupes':
        return true
      case 'review':
        return true
      default:
        return false
    }
  }

  const wizardSteps: { id: WizardStep; label: string }[] = [
    { id: 'infos', label: 'Informations' },
    { id: 'questions', label: 'Questions' },
    { id: 'groupes', label: 'Groupes cibles' },
    { id: 'review', label: 'Récapitulatif' },
  ]

  // ─── Stats for monitoring ───
  const getMonitoringStats = (epreuve: Epreuve | null) => {
    if (!epreuve) return { total: 0, enCours: 0, soumis: 0, avgScore: 0 }
    const sessions = epreuve.sessions ?? []
    const total = sessions.length
    const enCours = sessions.filter((s) => s.statut === 'EN_COURS').length
    const soumis = sessions.filter((s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE').length
    const withScore = sessions.filter((s) => s.score !== null)
    const avgScore = withScore.length > 0 ? withScore.reduce((sum, s) => sum + (s.score ?? 0), 0) / withScore.length : 0
    return { total, enCours, soumis, avgScore }
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mes Épreuves</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez et gérez vos épreuves d&apos;évaluation
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle épreuve
        </Button>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-48 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-muted" />
                </div>
                <div className="h-3 w-full rounded bg-muted" />
                <div className="flex gap-4">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="flex gap-2 pt-2">
                  <div className="h-8 w-20 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
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
            <ClipboardList className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucune épreuve créée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Commencez par créer une épreuve d&apos;évaluation en sélectionnant des questions de votre banque.
          </p>
          <Button
            className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleOpenCreate}
          >
            <Plus className="h-4 w-4" />
            Créer une épreuve
          </Button>
        </div>
      )}

      {/* ─── Exam list ─── */}
      {!isLoading && epreuves.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {epreuves.map((epreuve) => {
            const questionCount = epreuve.questions.length
            const pts = epreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0)
            const sessionCount = epreuve.sessions.length
            const completedSessions = epreuve.sessions.filter(
              (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
            ).length
            const completionRate = sessionCount > 0 ? Math.round((completedSessions / sessionCount) * 100) : 0

            return (
              <Card key={epreuve.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-6">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight">{epreuve.titre}</h3>
                      {epreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {truncateText(epreuve.description, 100)}
                        </p>
                      )}
                    </div>
                    {getStatutBadge(epreuve.statut)}
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {epreuve.duree} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                      {formatDateTime(epreuve.dateDebut)} — {formatDateTime(epreuve.dateFin)}
                    </span>
                  </div>

                  {/* Question + points + participants */}
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      <HelpCircle className="h-3 w-3" />
                      {questionCount} question{questionCount > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      <Trophy className="h-3 w-3" />
                      {pts} point{pts > 1 ? 's' : ''}
                    </Badge>
                    {sessionCount > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        <Users className="h-3 w-3" />
                        {completedSessions}/{sessionCount} ({completionRate}%)
                      </Badge>
                    )}
                    {sessionCount === 0 && epreuve.statut !== 'BROUILLON' && (
                      <Badge variant="secondary" className="gap-1 bg-gray-50 text-gray-500 dark:bg-gray-900/20 dark:text-gray-400">
                        <Users className="h-3 w-3" />
                        Aucun participant
                      </Badge>
                    )}
                  </div>

                  {/* Options badges (if any non-default) */}
                  {(epreuve.melangeQuestions || epreuve.melangePropositions || epreuve.blocageRetour) && (
                    <div className="flex flex-wrap gap-1.5">
                      {epreuve.melangeQuestions && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0">
                          <Shuffle className="h-2.5 w-2.5" />
                          Questions mélangées
                        </Badge>
                      )}
                      {epreuve.melangePropositions && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0">
                          <Shuffle className="h-2.5 w-2.5" />
                          Propositions mélangées
                        </Badge>
                      )}
                      {epreuve.blocageRetour && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 py-0 text-red-600 dark:text-red-400">
                          <Ban className="h-2.5 w-2.5" />
                          Retour bloqué
                        </Badge>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  {renderActions(epreuve)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Create/Edit Exam Dialog (Multi-step Wizard) ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateDialogOpen(false)
          resetForm()
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              {editingEpreuve ? 'Modifier l\'épreuve' : 'Nouvelle épreuve'}
            </DialogTitle>
            <DialogDescription>
              {editingEpreuve ? 'Modifiez les paramètres de votre épreuve.' : 'Créez une nouvelle épreuve d\'évaluation en quelques étapes.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <StepIndicator steps={wizardSteps} currentStep={wizardStep} onStepClick={(step) => {
            const currentIdx = wizardSteps.findIndex((s) => s.id === wizardStep)
            const targetIdx = wizardSteps.findIndex((s) => s.id === step)
            // Allow clicking completed steps or next step only if current is valid
            if (targetIdx <= currentIdx || (targetIdx === currentIdx + 1 && isStepValid(wizardStep))) {
              setWizardStep(step)
            }
          }} />

          <Separator />

          {/* Step content */}
          <div className="flex-1 overflow-y-auto pr-1">
            {/* ─── Step 1: Infos ─── */}
            {wizardStep === 'infos' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="epreuve-titre">Titre *</Label>
                  <Input
                    id="epreuve-titre"
                    placeholder="Ex: Contrôle continu - Algorithmique"
                    value={formTitre}
                    onChange={(e) => setFormTitre(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="epreuve-description">Description</Label>
                  <Textarea
                    id="epreuve-description"
                    placeholder="Décrivez le contenu et les objectifs de cette épreuve..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="epreuve-duree">Durée (minutes) *</Label>
                    <Input
                      id="epreuve-duree"
                      type="number"
                      min={1}
                      max={600}
                      value={formDuree}
                      onChange={(e) => setFormDuree(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="epreuve-datedebut">Date début *</Label>
                    <Input
                      id="epreuve-datedebut"
                      type="datetime-local"
                      value={formDateDebut}
                      onChange={(e) => setFormDateDebut(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="epreuve-datefin">Date fin *</Label>
                    <Input
                      id="epreuve-datefin"
                      type="datetime-local"
                      value={formDateFin}
                      onChange={(e) => setFormDateFin(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 2: Questions ─── */}
            {wizardStep === 'questions' && (
              <div className="space-y-4">
                {/* Search & filter bar */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher une question..."
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={questionTypeFilter} onValueChange={setQuestionTypeFilter}>
                      <SelectTrigger className="w-[110px]">
                        <Filter className="h-3.5 w-3.5 mr-1" />
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous types</SelectItem>
                        <SelectItem value="QCU">QCU</SelectItem>
                        <SelectItem value="QCM">QCM</SelectItem>
                        <SelectItem value="QRC">QRC</SelectItem>
                        <SelectItem value="TRS">TRS</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={questionDiffFilter} onValueChange={setQuestionDiffFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Difficulté" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous niveaux</SelectItem>
                        <SelectItem value="FACILE">Facile</SelectItem>
                        <SelectItem value="MOYEN">Moyen</SelectItem>
                        <SelectItem value="DIFFICILE">Difficile</SelectItem>
                        <SelectItem value="EXPERT">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Selected questions summary */}
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    {selectedQuestions.size} question{selectedQuestions.size > 1 ? 's' : ''} sélectionnée{selectedQuestions.size > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">
                    — {totalPoints} point{totalPoints > 1 ? 's' : ''} au total
                  </span>
                </div>

                {/* Questions list */}
                {isLoadingQuestions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                    <span className="ml-2 text-sm text-muted-foreground">Chargement des questions...</span>
                  </div>
                ) : filteredQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                    <HelpCircle className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Aucune question validée trouvée
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-3">
                      {filteredQuestions.map((q) => {
                        const isSelected = selectedQuestions.has(q.id)
                        const bareme = selectedQuestions.get(q.id) ?? 1

                        return (
                          <div
                            key={q.id}
                            className={`
                              flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer
                              ${isSelected
                                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                                : 'border-muted hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20'
                              }
                            `}
                            onClick={() => toggleQuestion(q.id)}
                          >
                            {/* Checkbox indicator */}
                            <div className={`
                              mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors
                              ${isSelected
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-muted-foreground/30'
                              }
                            `}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${getTypeBadgeColor(q.type)}`}>
                                  {q.type}
                                </Badge>
                                <Badge variant="secondary" className={`text-[10px] shrink-0 ${getDifficulteBadgeColor(q.difficulte)}`}>
                                  {getDifficulteLabel(q.difficulte)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm line-clamp-2">{q.enonce}</p>
                            </div>

                            {/* Bareme input */}
                            {isSelected && (
                              <div
                                className="shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Label className="text-[10px] text-muted-foreground">Barème</Label>
                                <Input
                                  type="number"
                                  min={0.5}
                                  max={20}
                                  step={0.5}
                                  value={bareme}
                                  onChange={(e) => setBareme(q.id, parseFloat(e.target.value) || 1)}
                                  className="h-7 w-16 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}

                <Separator />

                {/* Options checkboxes */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Options de passation</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="opt-melange-q"
                        checked={formMelangeQuestions}
                        onCheckedChange={(checked) => setFormMelangeQuestions(checked === true)}
                      />
                      <Label htmlFor="opt-melange-q" className="text-sm font-normal cursor-pointer">
                        Mélanger l&apos;ordre des questions
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="opt-melange-p"
                        checked={formMelangePropositions}
                        onCheckedChange={(checked) => setFormMelangePropositions(checked === true)}
                      />
                      <Label htmlFor="opt-melange-p" className="text-sm font-normal cursor-pointer">
                        Mélanger les propositions (QCU/QCM)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="opt-blocage"
                        checked={formBlocageRetour}
                        onCheckedChange={(checked) => setFormBlocageRetour(checked === true)}
                      />
                      <Label htmlFor="opt-blocage" className="text-sm font-normal cursor-pointer">
                        Bloquer le retour arrière
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 3: Groupes cibles ─── */}
            {wizardStep === 'groupes' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="epreuve-groupes">Groupes cibles</Label>
                  <p className="text-xs text-muted-foreground">
                    Entrez les noms des groupes ou classes cibles, séparés par des virgules.
                  </p>
                  <Textarea
                    id="epreuve-groupes"
                    placeholder="Ex: L3 Informatique Groupe A, L3 Informatique Groupe B, M1 IA"
                    value={formGroupesCibles}
                    onChange={(e) => setFormGroupesCibles(e.target.value)}
                    rows={4}
                  />
                </div>

                {formGroupesCibles.trim() && (
                  <div className="flex flex-wrap gap-2">
                    {formGroupesCibles
                      .split(',')
                      .map((g) => g.trim())
                      .filter((g) => g.length > 0)
                      .map((groupe, i) => (
                        <Badge
                          key={i}
                          className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800"
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {groupe}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Step 4: Review ─── */}
            {wizardStep === 'review' && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-emerald-600" />
                    Informations
                  </h4>
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Titre :</span>{' '}
                      <span className="font-medium">{formTitre}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Durée :</span>{' '}
                      <span className="font-medium">{formDuree} minutes</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Début :</span>{' '}
                      <span className="font-medium">{formDateDebut ? formatDateTime(formDateDebut) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fin :</span>{' '}
                      <span className="font-medium">{formDateFin ? formatDateTime(formDateFin) : '—'}</span>
                    </div>
                  </div>
                  {formDescription && (
                    <div>
                      <span className="text-muted-foreground text-sm">Description :</span>{' '}
                      <span className="text-sm">{truncateText(formDescription, 200)}</span>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-teal-600" />
                    Questions ({selectedQuestions.size})
                  </h4>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {selectedQuestions.size} question{selectedQuestions.size > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      {totalPoints} point{totalPoints > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <ScrollArea className="max-h-32">
                    <div className="space-y-1">
                      {Array.from(selectedQuestions.entries()).map(([questionId, bareme]) => {
                        const q = availableQuestions.find((aq) => aq.id === questionId)
                        if (!q) return null
                        return (
                          <div key={questionId} className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className={`text-[9px] py-0 ${getTypeBadgeColor(q.type)}`}>
                              {q.type}
                            </Badge>
                            <span className="flex-1 truncate">{truncateText(q.enonce, 60)}</span>
                            <span className="text-muted-foreground shrink-0">{bareme} pts</span>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-amber-600" />
                    Options
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {formMelangeQuestions && (
                      <Badge variant="outline" className="gap-1 py-0">
                        <Shuffle className="h-2.5 w-2.5" /> Questions mélangées
                      </Badge>
                    )}
                    {formMelangePropositions && (
                      <Badge variant="outline" className="gap-1 py-0">
                        <Shuffle className="h-2.5 w-2.5" /> Propositions mélangées
                      </Badge>
                    )}
                    {formBlocageRetour && (
                      <Badge variant="outline" className="gap-1 py-0 text-red-600 dark:text-red-400">
                        <Ban className="h-2.5 w-2.5" /> Retour bloqué
                      </Badge>
                    )}
                    {!formMelangeQuestions && !formMelangePropositions && !formBlocageRetour && (
                      <span className="text-muted-foreground">Aucune option activée</span>
                    )}
                  </div>
                </div>

                {formGroupesCibles.trim() && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600" />
                      Groupes cibles
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {formGroupesCibles
                        .split(',')
                        .map((g) => g.trim())
                        .filter((g) => g.length > 0)
                        .map((groupe, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                          >
                            {groupe}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Navigation buttons */}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <div className="flex gap-2">
              {wizardStep !== 'infos' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const currentIdx = wizardSteps.findIndex((s) => s.id === wizardStep)
                    setWizardStep(wizardSteps[currentIdx - 1].id)
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm() }}>
                Annuler
              </Button>
              {wizardStep !== 'review' && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={!isStepValid(wizardStep)}
                  onClick={() => {
                    const currentIdx = wizardSteps.findIndex((s) => s.id === wizardStep)
                    setWizardStep(wizardSteps[currentIdx + 1].id)
                  }}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {wizardStep === 'review' && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Créer l&apos;épreuve
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Supprimer l&apos;épreuve
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l&apos;épreuve <strong>&quot;{deleteTarget?.titre}&quot;</strong> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Date Edit Dialog ─── */}
      <Dialog open={!!dateEditTarget} onOpenChange={(open) => { if (!open) setDateEditTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              Modifier les dates
            </DialogTitle>
            <DialogDescription>
              Modifiez les dates de début et de fin pour &quot;{dateEditTarget?.titre}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-datedebut">Date début</Label>
              <Input
                id="edit-datedebut"
                type="datetime-local"
                value={dateEditDebut}
                onChange={(e) => setDateEditDebut(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-datefin">Date fin</Label>
              <Input
                id="edit-datefin"
                type="datetime-local"
                value={dateEditFin}
                onChange={(e) => setDateEditFin(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateEditTarget(null)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditDates}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Real-time Monitoring Dialog ─── */}
      <Dialog open={monitoringDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setMonitoringDialogOpen(false)
          setMonitoringEpreuve(null)
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              {monitoringEpreuve?.statut === 'EN_COURS' ? 'Suivi temps réel' : 'Résultats'}
              <span className="text-muted-foreground font-normal">— {monitoringEpreuve?.titre}</span>
            </DialogTitle>
            <DialogDescription>
              {monitoringEpreuve?.statut === 'EN_COURS'
                ? 'Suivez la progression des étudiants en temps réel.'
                : 'Consultez les résultats et les détails de l\'épreuve.'}
            </DialogDescription>
          </DialogHeader>

          {monitoringEpreuve && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Participants</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {getMonitoringStats(monitoringEpreuve).total}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">En cours</div>
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {getMonitoringStats(monitoringEpreuve).enCours}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Soumis</div>
                  <div className="text-lg font-bold text-teal-700 dark:text-teal-400">
                    {getMonitoringStats(monitoringEpreuve).soumis}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Moyenne</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {getMonitoringStats(monitoringEpreuve).avgScore > 0
                      ? `${getMonitoringStats(monitoringEpreuve).avgScore.toFixed(1)}%`
                      : '—'}
                  </div>
                </Card>
              </div>

              <Separator />

              {/* Students list */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-1">
                  {(monitoringEpreuve.sessions ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                      <Users className="h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">Aucun participant pour le moment</p>
                    </div>
                  ) : (
                    monitoringEpreuve.sessions.map((session) => {
                      const etudiant = session.etudiant
                      const totalQuestions = monitoringEpreuve.questions.length
                      const answeredCount = session.reponses?.length ?? 0
                      const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0
                      const alertes = session.alertes ?? 0
                      const isEnCours = session.statut === 'EN_COURS'
                      const isSoumis = session.statut === 'SOUMISE' || session.statut === 'CORRIGEE'

                      return (
                        <div
                          key={session.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          {/* Student info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {etudiant?.name ?? `Étudiant ${session.etudiantId.slice(0, 8)}`}
                              </span>
                              {isEnCours && (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 shrink-0">
                                  En cours
                                </Badge>
                              )}
                              {isSoumis && (
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 shrink-0">
                                  Soumis
                                </Badge>
                              )}
                              {session.statut === 'NON_COMMENCEE' && (
                                <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700 shrink-0">
                                  Non commencé
                                </Badge>
                              )}
                            </div>

                            {/* Progress bar */}
                            {isEnCours && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <Progress value={progressPct} className="h-1.5 flex-1" />
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {answeredCount}/{totalQuestions}
                                </span>
                              </div>
                            )}

                            {/* Score for submitted */}
                            {isSoumis && session.score !== null && (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                Score : {session.score.toFixed(1)}%
                              </span>
                            )}
                          </div>

                          {/* Alerts */}
                          {alertes > 0 && (
                            <Badge variant="outline" className="shrink-0 gap-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                              <AlertTriangle className="h-3 w-3" />
                              {alertes}
                            </Badge>
                          )}

                          {/* Force submission button */}
                          {isEnCours && monitoringEpreuve.statut === 'EN_COURS' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                              onClick={() => handleForceSubmission(session.id)}
                            >
                              Forcer la soumission
                            </Button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>

              <DialogFooter>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await handleOpenMonitoring(monitoringEpreuve)
                      toast.success('Données actualisées')
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Actualiser
                  </Button>
                  {(monitoringEpreuve.statut === 'CLOTUREE' || monitoringEpreuve.statut === 'TERMINEE') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(monitoringEpreuve)}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Exporter les résultats
                    </Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setMonitoringDialogOpen(false)}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
