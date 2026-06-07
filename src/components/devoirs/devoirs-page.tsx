'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  BookOpen,
  Calendar,
  Edit3,
  Send,
  Trash2,
  Eye,
  Lock,
  Search,
  Filter,
  Check,
  X,
  Loader2,
  FileText,
  Users,
  MessageSquare,
  Star,
  Archive,
  Sparkles,
  Copy,
  Clock,
  Upload,
  BarChart3,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Settings2,
  GripVertical,
  PlusCircle,
  MinusCircle,
  Timer,
  Paperclip,
  UsersRound,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

// ─── Types ───

interface UniteEnseignement {
  id: string
  code: string
  nom: string
  niveau: string
  filiere?: { id: string; nom: string; code?: string }
}

interface CritereGrille {
  nom: string
  description: string
  poids: number
}

interface Devoir {
  id: string
  titre: string
  description: string | null
  consignes: string | null
  uniteEnseignementId: string
  enseignantId: string
  typeSeance: string
  datePublication: string | null
  dateLimite: string
  noteMax: number
  renduFichiers: unknown
  soumissionGroupe: boolean
  nbMaxFichiers: number
  tailleMaxFichier: number
  statut: 'BROUILLON' | 'PUBLIE' | 'FERME' | 'ARCHIVE'
  anneeUniversitaire: string
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string }
  UniteEnseignement: { id: string; code: string; nom: string; niveau?: string }
  GrilleEvaluation: {
    id: string
    criteres: unknown
  } | null
  soumissionCount?: number
  Soumission?: Soumission[]
}

interface Soumission {
  id: string
  devoirId: string
  etudiantId: string
  contenuTexte: string | null
  fichiersSoumis: unknown
  commentaireEtudiant: string | null
  statut: string
  renduAt: string | null
  note: number | null
  commentaireEnseignant: string | null
  noteIA: number | null
  justificationIA: string | null
  rapportPlagiat: unknown
  historiqueVersions: unknown
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string; matricule?: string }
}

// ─── Utility functions ───

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

function isOverdue(dateLimite: string): boolean {
  return new Date(dateLimite) < new Date()
}

function getTimeRemaining(dateLimite: string): string {
  const now = new Date()
  const deadline = new Date(dateLimite)
  const diff = deadline.getTime() - now.getTime()

  if (diff <= 0) return 'Dépassé'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) return `${days}j ${hours}h`
  if (hours > 0) return `${hours}h`
  return '< 1h'
}

function getTypeSeanceLabel(type: string): string {
  switch (type) {
    case 'CM': return 'Cours Magistral'
    case 'TD': return 'Travail Dirigé'
    case 'TP': return 'Travail Pratique'
    default: return type
  }
}

function getTypeSeanceShortLabel(type: string): string {
  switch (type) {
    case 'CM': return 'CM'
    case 'TD': return 'TD'
    case 'TP': return 'TP'
    default: return type
  }
}

function getTypeSeanceBadgeClasses(type: string): string {
  switch (type) {
    case 'CM':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
    case 'TD':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'TP':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800'
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} Ko`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(0)} Mo`
  return `${(bytes / 1073741824).toFixed(1)} Go`
}

function getStatutDevoirBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
          <Edit3 className="h-3 w-3" />
          Brouillon
        </Badge>
      )
    case 'PUBLIE':
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          <Send className="h-3 w-3" />
          Publié
        </Badge>
      )
    case 'FERME':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          <Lock className="h-3 w-3" />
          Fermé
        </Badge>
      )
    case 'ARCHIVE':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">
          <Archive className="h-3 w-3" />
          Archivé
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getStatutSoumissionBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
          Brouillon
        </Badge>
      )
    case 'SOUMIS':
      return (
        <Badge variant="outline" className="gap-1 bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
          Soumis
        </Badge>
      )
    case 'CORRIGE':
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          Corrigé
        </Badge>
      )
    case 'RETOURNE':
      return (
        <Badge variant="outline" className="gap-1 bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800">
          Retourné
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function toLocalDatetimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

// ─── Main Component ───

export function DevoirsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── State ───
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statutFilter, setStatutFilter] = useState<string>('all')
  const [ueFilter, setUeFilter] = useState<string>('all')
  const [typeSeanceFilter, setTypeSeanceFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Create/Edit dialog
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingDevoir, setEditingDevoir] = useState<Devoir | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form fields
  const [formTitre, setFormTitre] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formUniteEnseignementId, setFormUniteEnseignementId] = useState('')
  const [formTypeSeance, setFormTypeSeance] = useState('TD')
  const [formDateLimite, setFormDateLimite] = useState('')
  const [formDatePublication, setFormDatePublication] = useState('')
  const [formNoteMax, setFormNoteMax] = useState(20)
  const [formConsignes, setFormConsignes] = useState('')
  const [formRenduFichiers, setFormRenduFichiers] = useState(false)
  const [formSoumissionGroupe, setFormSoumissionGroupe] = useState(false)
  const [formNbMaxFichiers, setFormNbMaxFichiers] = useState(5)
  const [formTailleMaxFichier, setFormTailleMaxFichier] = useState(10) // MB

  // Grille evaluation in form
  const [formGrilleCriteres, setFormGrilleCriteres] = useState<CritereGrille[]>([
    { nom: '', description: '', poids: 1 },
  ])

  // Advanced settings collapsible
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)

  // UE dropdown data
  const [unitesEnseignement, setUnitesEnseignement] = useState<UniteEnseignement[]>([])

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Devoir | null>(null)

  // Duplicate confirmation
  const [duplicateTarget, setDuplicateTarget] = useState<Devoir | null>(null)

  // Soumissions dialog
  const [soumissionsDialogOpen, setSoumissionsDialogOpen] = useState(false)
  const [selectedDevoirForSoumissions, setSelectedDevoirForSoumissions] = useState<Devoir | null>(null)
  const [soumissions, setSoumissions] = useState<Soumission[]>([])
  const [isLoadingSoumissions, setIsLoadingSoumissions] = useState(false)
  const [soumissionSortField, setSoumissionSortField] = useState<string>('renduAt')
  const [soumissionSortDir, setSoumissionSortDir] = useState<'asc' | 'desc'>('desc')

  // Grade dialog
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false)
  const [gradingSoumission, setGradingSoumission] = useState<Soumission | null>(null)
  const [gradeNote, setGradeNote] = useState('')
  const [gradeCommentaire, setGradeCommentaire] = useState('')
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false)
  const [isAiGrading, setIsAiGrading] = useState(false)

  // ─── Fetch devoirs ───
  const fetchDevoirs = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/devoirs?enseignantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setDevoirs(data.devoirs ?? [])
      }
    } catch {
      // Silent fail
    }
  }, [user?.id])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchDevoirs()
      setIsLoading(false)
    }
    load()
  }, [fetchDevoirs])

  // ─── Fetch UE for dropdown ───
  useEffect(() => {
    const fetchUE = async () => {
      try {
        const res = await fetch('/api/unites-enseignement?actif=true')
        if (res.ok) {
          const data = await res.json()
          setUnitesEnseignement(data.unitesEnseignement ?? [])
        }
      } catch {
        // Silent
      }
    }
    fetchUE()
  }, [])

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingDevoir(null)
    resetForm()
    setFormDialogOpen(true)
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (devoir: Devoir) => {
    setEditingDevoir(devoir)
    setFormTitre(devoir.titre)
    setFormDescription(devoir.description ?? '')
    setFormUniteEnseignementId(devoir.uniteEnseignementId)
    setFormTypeSeance(devoir.typeSeance)
    setFormDateLimite(toLocalDatetimeString(devoir.dateLimite))
    setFormDatePublication(toLocalDatetimeString(devoir.datePublication))
    setFormNoteMax(devoir.noteMax)
    setFormConsignes(devoir.consignes ?? '')
    setFormRenduFichiers(!!devoir.renduFichiers)
    setFormSoumissionGroupe(devoir.soumissionGroupe)
    setFormNbMaxFichiers(devoir.nbMaxFichiers || 5)
    setFormTailleMaxFichier(devoir.tailleMaxFichier ? Math.round(devoir.tailleMaxFichier / 1048576) : 10)
    // Load grille criteres if exists
    if (devoir.GrilleEvaluation?.criteres) {
      try {
        const parsed = typeof devoir.GrilleEvaluation.criteres === 'string'
          ? JSON.parse(devoir.GrilleEvaluation.criteres)
          : devoir.GrilleEvaluation.criteres
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFormGrilleCriteres(parsed)
        } else {
          setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
        }
      } catch {
        setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
      }
    } else {
      setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    }
    setAdvancedSettingsOpen(!!devoir.renduFichiers || devoir.soumissionGroupe || (devoir.nbMaxFichiers !== 10 && devoir.nbMaxFichiers > 0) || !!devoir.GrilleEvaluation)
    setFormDialogOpen(true)
  }

  // ─── Reset form ───
  const resetForm = () => {
    setFormTitre('')
    setFormDescription('')
    setFormUniteEnseignementId('')
    setFormTypeSeance('TD')
    setFormDateLimite('')
    setFormDatePublication('')
    setFormNoteMax(20)
    setFormConsignes('')
    setFormRenduFichiers(false)
    setFormSoumissionGroupe(false)
    setFormNbMaxFichiers(5)
    setFormTailleMaxFichier(10)
    setFormGrilleCriteres([{ nom: '', description: '', poids: 1 }])
    setAdvancedSettingsOpen(false)
  }

  // ─── Grille criteres management ───
  const addCritere = () => {
    setFormGrilleCriteres([...formGrilleCriteres, { nom: '', description: '', poids: 1 }])
  }

  const removeCritere = (index: number) => {
    if (formGrilleCriteres.length <= 1) return
    setFormGrilleCriteres(formGrilleCriteres.filter((_, i) => i !== index))
  }

  const updateCritere = (index: number, field: keyof CritereGrille, value: string | number) => {
    const updated = [...formGrilleCriteres]
    updated[index] = { ...updated[index], [field]: value }
    setFormGrilleCriteres(updated)
  }

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!user?.id) return
    if (!formTitre || !formUniteEnseignementId || !formDateLimite) {
      toast.error('Informations manquantes', { description: 'Veuillez remplir tous les champs obligatoires (titre, UE, date limite).' })
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        titre: formTitre,
        description: formDescription || null,
        consignes: formConsignes || null,
        uniteEnseignementId: formUniteEnseignementId,
        enseignantId: user.id,
        typeSeance: formTypeSeance,
        datePublication: formDatePublication || null,
        dateLimite: formDateLimite,
        noteMax: formNoteMax,
        renduFichiers: formRenduFichiers || null,
        soumissionGroupe: formSoumissionGroupe,
        nbMaxFichiers: formNbMaxFichiers,
        tailleMaxFichier: formTailleMaxFichier * 1048576, // Convert MB to bytes
      }

      const url = editingDevoir ? `/api/devoirs/${editingDevoir.id}` : '/api/devoirs'
      const method = editingDevoir ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'enregistrement')
      }

      const result = await res.json()
      const devoirId = editingDevoir?.id || result.devoir?.id

      // Save grille d'évaluation if criteres are provided
      const validCriteres = formGrilleCriteres.filter(c => c.nom.trim())
      if (validCriteres.length > 0 && devoirId) {
        try {
          // Check if grille exists
          const grilleRes = await fetch(`/api/grilles-evaluation?devoirId=${devoirId}`)
          const grilleData = await grilleRes.json()
          const existingGrille = grilleData.grilles?.[0]

          if (existingGrille) {
            // Update existing grille
            await fetch(`/api/grilles-evaluation/${existingGrille.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ criteres: validCriteres }),
            })
          } else {
            // Create new grille
            await fetch('/api/grilles-evaluation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ devoirId, criteres: validCriteres }),
            })
          }
        } catch {
          // Grille save failed silently
        }
      }

      toast.success(editingDevoir ? 'Devoir mis à jour' : 'Devoir créé', {
        description: `"${formTitre}" a été ${editingDevoir ? 'modifié' : 'créé'} avec succès.`,
      })

      setFormDialogOpen(false)
      resetForm()
      await fetchDevoirs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Status action handlers ───
  const handleStatusAction = async (devoirId: string, action: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/devoirs/${devoirId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'action')
      }

      toast.success(successMsg)
      await fetchDevoirs()
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
      const res = await fetch(`/api/devoirs/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la suppression')
      }
      toast.success('Devoir déplacé vers la corbeille', {
        description: `"${deleteTarget.titre}" a été déplacé vers la corbeille. Vous pouvez le restaurer depuis la Corbeille.`,
      })
      setDeleteTarget(null)
      await fetchDevoirs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer le devoir.',
      })
    }
  }

  // ─── Duplicate handler ───
  const handleDuplicate = async () => {
    if (!duplicateTarget || !user?.id) return
    try {
      const body = {
        titre: `${duplicateTarget.titre} (copie)`,
        description: duplicateTarget.description,
        consignes: duplicateTarget.consignes,
        uniteEnseignementId: duplicateTarget.uniteEnseignementId,
        enseignantId: user.id,
        typeSeance: duplicateTarget.typeSeance,
        dateLimite: '',
        noteMax: duplicateTarget.noteMax,
        renduFichiers: duplicateTarget.renduFichiers,
        soumissionGroupe: duplicateTarget.soumissionGroupe,
        nbMaxFichiers: duplicateTarget.nbMaxFichiers,
        tailleMaxFichier: duplicateTarget.tailleMaxFichier,
      }

      const res = await fetch('/api/devoirs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la duplication')
      }

      const result = await res.json()

      // Duplicate grille if exists
      if (duplicateTarget.GrilleEvaluation?.criteres && result.devoir?.id) {
        try {
          await fetch('/api/grilles-evaluation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              devoirId: result.devoir.id,
              criteres: duplicateTarget.GrilleEvaluation.criteres,
            }),
          })
        } catch {
          // Silent
        }
      }

      toast.success('Devoir dupliqué', {
        description: `"${duplicateTarget.titre} (copie)" a été créé en brouillon. N'oubliez pas de définir une date limite.`,
      })
      setDuplicateTarget(null)
      await fetchDevoirs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de dupliquer le devoir.',
      })
    }
  }

  // ─── View soumissions ───
  const handleViewSoumissions = async (devoir: Devoir) => {
    setSelectedDevoirForSoumissions(devoir)
    setSoumissionsDialogOpen(true)
    setIsLoadingSoumissions(true)
    try {
      const res = await fetch(`/api/devoirs/${devoir.id}`)
      if (res.ok) {
        const data = await res.json()
        setSoumissions(data.devoir?.Soumission ?? [])
      }
    } catch {
      try {
        const res = await fetch(`/api/soumissions?devoirId=${devoir.id}`)
        if (res.ok) {
          const data = await res.json()
          setSoumissions(data.soumissions ?? [])
        }
      } catch {
        // Silent
      }
    } finally {
      setIsLoadingSoumissions(false)
    }
  }

  // ─── Open grade dialog ───
  const handleOpenGrade = (soumission: Soumission) => {
    setGradingSoumission(soumission)
    setGradeNote(soumission.note !== null ? String(soumission.note) : '')
    setGradeCommentaire(soumission.commentaireEnseignant ?? '')
    setGradeDialogOpen(true)
  }

  // ─── Submit grade ───
  const handleSubmitGrade = async () => {
    if (!gradingSoumission) return
    if (!gradeNote) {
      toast.error('Note requise', { description: 'Veuillez saisir une note.' })
      return
    }

    const noteValue = parseFloat(gradeNote)
    if (isNaN(noteValue) || noteValue < 0) {
      toast.error('Note invalide', { description: 'La note doit être un nombre positif.' })
      return
    }

    const maxNote = selectedDevoirForSoumissions?.noteMax ?? 20
    if (noteValue > maxNote) {
      toast.error('Note invalide', { description: `La note ne peut pas dépasser ${maxNote}.` })
      return
    }

    setIsSubmittingGrade(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: noteValue,
          commentaireEnseignant: gradeCommentaire || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la notation')
      }

      toast.success('Soumission notée', {
        description: `Note de ${noteValue}/${maxNote} enregistrée.`,
      })

      setGradeDialogOpen(false)
      if (selectedDevoirForSoumissions) {
        await handleViewSoumissions(selectedDevoirForSoumissions)
      }
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de noter la soumission.',
      })
    } finally {
      setIsSubmittingGrade(false)
    }
  }

  // ─── AI Grade handler ───
  const handleAiGradeSoumission = async () => {
    if (!gradingSoumission) return
    setIsAiGrading(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}/ai-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'évaluation IA')
      }
      const data = await res.json()

      // Update the local grade form with AI proposal
      if (data.aiGrade) {
        setGradeNote(String(data.aiGrade.note))
        setGradeCommentaire(data.aiGrade.justification || '')
      }

      toast.success('Évaluation IA terminée', {
        description: `Note proposée : ${data.aiGrade?.note}/${data.aiGrade?.noteMax}. Vous pouvez l'ajuster avant de confirmer.`,
      })

      // Refresh soumissions list
      if (selectedDevoirForSoumissions) {
        await handleViewSoumissions(selectedDevoirForSoumissions)
      }

      // Refresh the grading soumission data
      const updatedSoum = soumissions.find(s => s.id === gradingSoumission.id)
      if (updatedSoum) {
        setGradingSoumission({
          ...updatedSoum,
          noteIA: data.aiGrade?.note ?? updatedSoum.noteIA,
          justificationIA: data.aiGrade?.justification ?? updatedSoum.justificationIA,
        })
      }
    } catch (err) {
      toast.error('Erreur IA', {
        description: err instanceof Error ? err.message : 'Impossible d\'évaluer avec l\'IA.',
      })
    } finally {
      setIsAiGrading(false)
    }
  }

  // ─── Filter devoirs ───
  const filteredDevoirs = devoirs.filter((d) => {
    if (statutFilter !== 'all' && d.statut !== statutFilter) return false
    if (ueFilter !== 'all' && d.uniteEnseignementId !== ueFilter) return false
    if (typeSeanceFilter !== 'all' && d.typeSeance !== typeSeanceFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchTitre = d.titre.toLowerCase().includes(q)
      const matchDesc = d.description?.toLowerCase().includes(q) ?? false
      const matchUE = d.UniteEnseignement?.nom?.toLowerCase().includes(q) || d.UniteEnseignement?.code?.toLowerCase().includes(q)
      if (!matchTitre && !matchUE && !matchDesc) return false
    }
    return true
  })

  // ─── Stats ───
  const totalSoumissions = devoirs.reduce((sum, d) => sum + (d.soumissionCount ?? d.Soumission?.length ?? 0), 0)
  const gradedSoumissions = devoirs.reduce((sum, d) => {
    const soum = d.Soumission ?? []
    return sum + soum.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length
  }, 0)
  const statsDevoirs = {
    total: devoirs.length,
    brouillons: devoirs.filter((d) => d.statut === 'BROUILLON').length,
    publies: devoirs.filter((d) => d.statut === 'PUBLIE').length,
    fermes: devoirs.filter((d) => d.statut === 'FERME').length,
    totalSoumissions,
  }

  // ─── Soumissions statistics ───
  const soumStats = {
    total: soumissions.length,
    soumis: soumissions.filter(s => s.statut === 'SOUMIS').length,
    corriges: soumissions.filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length,
    brouillons: soumissions.filter(s => s.statut === 'BROUILLON').length,
    notes: soumissions.filter(s => s.note !== null).map(s => s.note!),
    avgNote: soumissions.filter(s => s.note !== null).length > 0
      ? (soumissions.filter(s => s.note !== null).reduce((sum, s) => sum + s.note!, 0) / soumissions.filter(s => s.note !== null).length)
      : null,
    minNote: soumissions.filter(s => s.note !== null).length > 0 ? Math.min(...soumissions.filter(s => s.note !== null).map(s => s.note!)) : null,
    maxNote: soumissions.filter(s => s.note !== null).length > 0 ? Math.max(...soumissions.filter(s => s.note !== null).map(s => s.note!)) : null,
  }

  // ─── Sort soumissions ───
  const sortedSoumissions = [...soumissions].sort((a, b) => {
    let aVal: string | number | null = ''
    let bVal: string | number | null = ''

    switch (soumissionSortField) {
      case 'name':
        aVal = a.User?.name?.toLowerCase() ?? ''
        bVal = b.User?.name?.toLowerCase() ?? ''
        break
      case 'statut':
        aVal = a.statut
        bVal = b.statut
        break
      case 'note':
        aVal = a.note ?? -1
        bVal = b.note ?? -1
        break
      case 'renduAt':
      default:
        aVal = a.renduAt ?? ''
        bVal = b.renduAt ?? ''
        break
    }

    if (aVal < bVal) return soumissionSortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return soumissionSortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSoumissionSort = (field: string) => {
    if (soumissionSortField === field) {
      setSoumissionSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSoumissionSortField(field)
      setSoumissionSortDir('asc')
    }
  }

  const getSortIcon = (field: string) => {
    if (soumissionSortField !== field) return null
    return soumissionSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mes Devoirs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez et gérez vos devoirs TP/TD et assignments
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Nouveau devoir
              </Button>
            </TooltipTrigger>
            <TooltipContent>Créer un nouveau devoir ou TP/TD</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                <Edit3 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statsDevoirs.brouillons}</p>
                <p className="text-xs text-muted-foreground">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statsDevoirs.publies}</p>
                <p className="text-xs text-muted-foreground">Publiés</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statsDevoirs.fermes}</p>
                <p className="text-xs text-muted-foreground">Fermés</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statsDevoirs.totalSoumissions}</p>
                <p className="text-xs text-muted-foreground">Soumissions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500 col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statsDevoirs.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par titre, UE ou description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-[170px]">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="BROUILLON">Brouillon</SelectItem>
            <SelectItem value="PUBLIE">Publié</SelectItem>
            <SelectItem value="FERME">Fermé</SelectItem>
            <SelectItem value="ARCHIVE">Archivé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeSeanceFilter} onValueChange={setTypeSeanceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="TD">TD</SelectItem>
            <SelectItem value="TP">TP</SelectItem>
            <SelectItem value="CM">CM</SelectItem>
          </SelectContent>
        </Select>
        {unitesEnseignement.length > 0 && (
          <Select value={ueFilter} onValueChange={setUeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="UE" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les UE</SelectItem>
              {unitesEnseignement.map((ue) => (
                <SelectItem key={ue.id} value={ue.id}>
                  {ue.code} — {ue.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
                <div className="h-2 w-full rounded bg-muted" />
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
      {!isLoading && devoirs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun devoir créé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Commencez par créer un devoir TP/TD pour vos étudiants.
          </p>
          <Button
            className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleOpenCreate}
          >
            <Plus className="h-4 w-4" />
            Créer un devoir
          </Button>
        </div>
      )}

      {/* ─── No results after filter ─── */}
      {!isLoading && devoirs.length > 0 && filteredDevoirs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
          <Search className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Aucun résultat</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Aucun devoir ne correspond à vos critères de recherche.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setStatutFilter('all'); setUeFilter('all'); setTypeSeanceFilter('all') }}>
            <X className="h-4 w-4" />
            Réinitialiser les filtres
          </Button>
        </div>
      )}

      {/* ─── Devoirs list as cards ─── */}
      {!isLoading && filteredDevoirs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredDevoirs.map((devoir) => {
            const soumissionCount = devoir.soumissionCount ?? devoir.Soumission?.length ?? 0
            const overdue = devoir.statut === 'PUBLIE' && isOverdue(devoir.dateLimite)
            const timeRemaining = devoir.statut === 'PUBLIE' ? getTimeRemaining(devoir.dateLimite) : null
            const hasGrille = !!devoir.GrilleEvaluation
            const correctedCount = (devoir.Soumission ?? []).filter(s => s.statut === 'CORRIGE' || s.statut === 'RETOURNE').length

            return (
              <Card key={devoir.id} className={`group transition-shadow hover:shadow-md ${overdue ? 'border-red-200 dark:border-red-900' : ''}`}>
                <CardContent className="flex flex-col gap-4 p-6">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold leading-tight">{devoir.titre}</h3>
                      </div>
                      {devoir.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {devoir.description.length > 100 ? devoir.description.slice(0, 100).trim() + '...' : devoir.description}
                        </p>
                      )}
                    </div>
                    {getStatutDevoirBadge(devoir.statut)}
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {devoir.UniteEnseignement?.code} — {devoir.UniteEnseignement?.nom}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className={`h-3.5 w-3.5 ${overdue ? 'text-red-500' : 'text-teal-600 dark:text-teal-400'}`} />
                      {formatDateTime(devoir.dateLimite)}
                      {overdue && <span className="text-red-500 text-xs font-medium">(Dépassé)</span>}
                    </span>
                    {timeRemaining && !overdue && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <Timer className="h-3 w-3" />
                        {timeRemaining}
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className={`gap-1 ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}>
                      {getTypeSeanceShortLabel(devoir.typeSeance)}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <Star className="h-3 w-3" />
                      {devoir.noteMax} pts
                    </Badge>
                    {devoir.renduFichiers && (
                      <Badge variant="secondary" className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                        <Paperclip className="h-3 w-3" />
                        Fichiers
                      </Badge>
                    )}
                    {devoir.soumissionGroupe && (
                      <Badge variant="secondary" className="gap-1 bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                        <UsersRound className="h-3 w-3" />
                        Groupe
                      </Badge>
                    )}
                    {hasGrille && (
                      <Badge variant="secondary" className="gap-1 bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                        <BarChart3 className="h-3 w-3" />
                        Grille
                      </Badge>
                    )}
                    {soumissionCount > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        <Users className="h-3 w-3" />
                        {soumissionCount} soumission{soumissionCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {devoir.statut !== 'BROUILLON' && soumissionCount === 0 && (
                      <Badge variant="secondary" className="gap-1 bg-gray-50 text-gray-500 dark:bg-gray-900/20 dark:text-gray-400">
                        <Users className="h-3 w-3" />
                        Aucune soumission
                      </Badge>
                    )}
                  </div>

                  {/* Submission progress bar for published/closed */}
                  {devoir.statut !== 'BROUILLON' && soumissionCount > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Taux de soumission</span>
                        <span>{correctedCount}/{soumissionCount} corrigée{correctedCount > 1 ? 's' : ''}</span>
                      </div>
                      <Progress
                        value={soumissionCount > 0 ? (correctedCount / soumissionCount) * 100 : 0}
                        className="h-1.5"
                      />
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {devoir.statut === 'BROUILLON' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(devoir)}
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleStatusAction(devoir.id, 'publier', 'Devoir publié')}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Publier
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDuplicateTarget(devoir)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Dupliquer ce devoir</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                          onClick={() => setDeleteTarget(devoir)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {devoir.statut === 'PUBLIE' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          onClick={() => handleViewSoumissions(devoir)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700"
                          onClick={() => handleStatusAction(devoir.id, 'fermer', 'Devoir fermé')}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Fermer
                        </Button>
                      </>
                    )}
                    {devoir.statut === 'FERME' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          onClick={() => handleViewSoumissions(devoir)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
                          onClick={() => handleStatusAction(devoir.id, 'archiver', 'Devoir archivé')}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archiver
                        </Button>
                      </>
                    )}
                    {devoir.statut === 'ARCHIVE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        onClick={() => handleViewSoumissions(devoir)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Soumissions{soumissionCount > 0 ? ` (${soumissionCount})` : ''}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Create/Edit Devoir Dialog ─── */}
      <Dialog open={formDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setFormDialogOpen(false)
          resetForm()
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              {editingDevoir ? 'Modifier le devoir' : 'Nouveau devoir'}
            </DialogTitle>
            <DialogDescription>
              {editingDevoir ? 'Modifiez les paramètres du devoir.' : 'Créez un nouveau devoir TP/TD pour vos étudiants.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-5">
              {/* Basic Info Section */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="devoir-titre">Titre *</Label>
                  <Input
                    id="devoir-titre"
                    placeholder="Ex: TP3 - Algorithmes de tri"
                    value={formTitre}
                    onChange={(e) => setFormTitre(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="devoir-description">Description</Label>
                  <Textarea
                    id="devoir-description"
                    placeholder="Décrivez le contenu et les objectifs de ce devoir..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="devoir-ue">Unité d&apos;enseignement *</Label>
                    <Select value={formUniteEnseignementId} onValueChange={setFormUniteEnseignementId}>
                      <SelectTrigger id="devoir-ue">
                        <SelectValue placeholder="Sélectionner une UE" />
                      </SelectTrigger>
                      <SelectContent>
                        {unitesEnseignement.map((ue) => (
                          <SelectItem key={ue.id} value={ue.id}>
                            {ue.code} — {ue.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="devoir-type">Type de séance</Label>
                    <Select value={formTypeSeance} onValueChange={setFormTypeSeance}>
                      <SelectTrigger id="devoir-type">
                        <SelectValue placeholder="Type de séance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CM">CM — Cours Magistral</SelectItem>
                        <SelectItem value="TD">TD — Travail Dirigé</SelectItem>
                        <SelectItem value="TP">TP — Travail Pratique</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="devoir-date-limite">Date limite *</Label>
                    <Input
                      id="devoir-date-limite"
                      type="datetime-local"
                      value={formDateLimite}
                      onChange={(e) => setFormDateLimite(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="devoir-note-max">Note maximale *</Label>
                    <Input
                      id="devoir-note-max"
                      type="number"
                      min={1}
                      max={100}
                      value={formNoteMax}
                      onChange={(e) => setFormNoteMax(parseFloat(e.target.value) || 20)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="devoir-date-publication">Date de publication (optionnel)</Label>
                  <Input
                    id="devoir-date-publication"
                    type="datetime-local"
                    value={formDatePublication}
                    onChange={(e) => setFormDatePublication(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Laissez vide pour publier manuellement. Si défini, le devoir sera automatiquement publié à cette date.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="devoir-consignes">Consignes</Label>
                  <Textarea
                    id="devoir-consignes"
                    placeholder="Instructions spécifiques pour les étudiants..."
                    value={formConsignes}
                    onChange={(e) => setFormConsignes(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              {/* Advanced Settings */}
              <Collapsible open={advancedSettingsOpen} onOpenChange={setAdvancedSettingsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Paramètres avancés
                    </span>
                    {advancedSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {/* File upload settings */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        <Label className="text-sm font-medium">Rendu de fichiers</Label>
                      </div>
                      <Switch
                        checked={formRenduFichiers}
                        onCheckedChange={setFormRenduFichiers}
                      />
                    </div>
                    {formRenduFichiers && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pl-6">
                        <div className="space-y-2">
                          <Label htmlFor="nb-max-fichiers" className="text-xs">Nombre max de fichiers</Label>
                          <Input
                            id="nb-max-fichiers"
                            type="number"
                            min={1}
                            max={20}
                            value={formNbMaxFichiers}
                            onChange={(e) => setFormNbMaxFichiers(parseInt(e.target.value) || 5)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="taille-max-fichier" className="text-xs">Taille max par fichier (Mo)</Label>
                          <Input
                            id="taille-max-fichier"
                            type="number"
                            min={1}
                            max={100}
                            value={formTailleMaxFichier}
                            onChange={(e) => setFormTailleMaxFichier(parseInt(e.target.value) || 10)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Group submission */}
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <div>
                          <Label className="text-sm font-medium">Soumission en groupe</Label>
                          <p className="text-xs text-muted-foreground">Permettre aux étudiants de soumettre en groupe</p>
                        </div>
                      </div>
                      <Switch
                        checked={formSoumissionGroupe}
                        onCheckedChange={setFormSoumissionGroupe}
                      />
                    </div>
                  </div>

                  {/* Grille d'évaluation */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <Label className="text-sm font-medium">Grille d&apos;évaluation</Label>
                    </div>
                    <div className="space-y-3">
                      {formGrilleCriteres.map((critere, index) => (
                        <div key={index} className="flex gap-2 items-start rounded-lg border bg-muted/30 p-3">
                          <div className="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_80px]">
                            <Input
                              placeholder="Nom du critère"
                              value={critere.nom}
                              onChange={(e) => updateCritere(index, 'nom', e.target.value)}
                              className="text-sm"
                            />
                            <Input
                              placeholder="Description"
                              value={critere.description}
                              onChange={(e) => updateCritere(index, 'description', e.target.value)}
                              className="text-sm"
                            />
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="Poids"
                                value={critere.poids}
                                onChange={(e) => updateCritere(index, 'poids', parseFloat(e.target.value) || 1)}
                                className="text-sm"
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">pts</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCritere(index)}
                            disabled={formGrilleCriteres.length <= 1}
                            className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addCritere}
                        className="w-full border-dashed"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Ajouter un critère
                      </Button>
                    </div>
                    {formGrilleCriteres.some(c => c.nom.trim()) && (
                      <div className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                        Total : {formGrilleCriteres.filter(c => c.nom.trim()).reduce((sum, c) => sum + c.poids, 0)} pts
                        {formGrilleCriteres.filter(c => c.nom.trim()).reduce((sum, c) => sum + c.poids, 0) !== formNoteMax && (
                          <span className="text-amber-600 ml-2">
                            (Différent de la note max : {formNoteMax} pts)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setFormDialogOpen(false)
                resetForm()
              }}
            >
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingDevoir ? 'Mettre à jour' : 'Créer le devoir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Déplacer vers la corbeille ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le devoir &quot;{deleteTarget?.titre}&quot; sera déplacé vers la corbeille. Vous pourrez le restaurer depuis la Corbeille dans les 30 jours.
              {deleteTarget?.statut === 'PUBLIE' && (
                <span className="block mt-2 text-red-500 font-medium">
                  ⚠️ Un devoir publié ne peut pas être supprimé. Veuillez d&apos;abord le fermer.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteTarget?.statut === 'PUBLIE'}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Déplacer vers la corbeille
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Duplicate Confirmation ─── */}
      <AlertDialog open={!!duplicateTarget} onOpenChange={(open) => { if (!open) setDuplicateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-emerald-500" />
              Dupliquer ce devoir ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Une copie de &quot;{duplicateTarget?.titre}&quot; sera créée en brouillon avec les mêmes paramètres (y compris la grille d&apos;évaluation si présente). Vous devrez définir une nouvelle date limite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDuplicate}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Copy className="h-4 w-4 mr-1" />
              Dupliquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Soumissions Dialog ─── */}
      <Dialog open={soumissionsDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setSoumissionsDialogOpen(false)
          setSelectedDevoirForSoumissions(null)
          setSoumissions([])
        }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              Soumissions — {selectedDevoirForSoumissions?.titre}
            </DialogTitle>
            <DialogDescription>
              {selectedDevoirForSoumissions?.UniteEnseignement?.code} — {selectedDevoirForSoumissions?.UniteEnseignement?.nom}
              {' · '}{getTypeSeanceLabel(selectedDevoirForSoumissions?.typeSeance ?? 'TD')}
              {' · '}{selectedDevoirForSoumissions?.noteMax} pts
            </DialogDescription>
          </DialogHeader>

          {/* Soumission Statistics */}
          {!isLoadingSoumissions && soumissions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold">{soumStats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-sky-600">{soumStats.soumis}</p>
                <p className="text-xs text-muted-foreground">À corriger</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{soumStats.corriges}</p>
                <p className="text-xs text-muted-foreground">Corrigées</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-amber-600">
                  {soumStats.avgNote !== null ? soumStats.avgNote.toFixed(1) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Moyenne</p>
              </div>
            </div>
          )}

          {/* Correction progress */}
          {!isLoadingSoumissions && soumissions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progression correction</span>
                <span>{soumStats.corriges}/{soumStats.total} ({Math.round(soumStats.corriges / soumStats.total * 100)}%)</span>
              </div>
              <Progress
                value={(soumStats.corriges / soumStats.total) * 100}
                className="h-2"
              />
            </div>
          )}

          {/* Soumissions Table */}
          <div className="flex-1 overflow-auto">
            {isLoadingSoumissions ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : soumissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Users className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Aucune soumission</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Les étudiants n&apos;ont pas encore soumis de réponse.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('name')}>
                      <span className="flex items-center gap-1">Étudiant {getSortIcon('name')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('statut')}>
                      <span className="flex items-center gap-1">Statut {getSortIcon('statut')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('renduAt')}>
                      <span className="flex items-center gap-1">Date {getSortIcon('renduAt')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSoumissionSort('note')}>
                      <span className="flex items-center gap-1">Note {getSortIcon('note')}</span>
                    </TableHead>
                    <TableHead>IA</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSoumissions.map((soumission) => (
                    <TableRow key={soumission.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{soumission.User?.name}</p>
                          <p className="text-xs text-muted-foreground">{soumission.User?.matricule || soumission.User?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatutSoumissionBadge(soumission.statut)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {soumission.renduAt ? formatDateTime(soumission.renduAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {soumission.note !== null ? (
                          <Badge variant="outline" className={`font-bold ${
                            soumission.note >= (selectedDevoirForSoumissions?.noteMax ?? 20) / 2
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300'
                          }`}>
                            {soumission.note.toFixed(1)}/{selectedDevoirForSoumissions?.noteMax ?? 20}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {soumission.noteIA !== null ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="gap-1 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300">
                                  <Sparkles className="h-3 w-3" />
                                  {soumission.noteIA.toFixed(1)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium mb-1">Évaluation IA</p>
                                <p className="text-xs whitespace-pre-wrap">{soumission.justificationIA || 'Pas de justification'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenGrade(soumission)}
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        >
                          {soumission.note !== null ? (
                            <>
                              <Edit3 className="h-3.5 w-3.5" />
                              Modifier
                            </>
                          ) : (
                            <>
                              <Star className="h-3.5 w-3.5" />
                              Noter
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Grade distribution */}
          {!isLoadingSoumissions && soumStats.notes.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Min : <strong>{soumStats.minNote?.toFixed(1)}</strong></span>
                <span>Max : <strong>{soumStats.maxNote?.toFixed(1)}</strong></span>
                <span>Moy : <strong>{soumStats.avgNote?.toFixed(1)}</strong></span>
                <span className="ml-auto">
                  {soumStats.corriges}/{soumStats.total} corrigées ({Math.round(soumStats.corriges / soumStats.total * 100)}%)
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Grade Dialog ─── */}
      <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-600" />
              Noter la soumission
            </DialogTitle>
            <DialogDescription>
              {gradingSoumission?.User?.name} — {selectedDevoirForSoumissions?.titre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Student response preview */}
            {gradingSoumission?.contenuTexte && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Réponse de l&apos;étudiant</p>
                <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap max-h-[120px] overflow-y-auto bg-muted/30">
                  {gradingSoumission.contenuTexte.length > 500
                    ? gradingSoumission.contenuTexte.slice(0, 500) + '...'
                    : gradingSoumission.contenuTexte}
                </div>
              </div>
            )}

            {/* AI suggestion */}
            {gradingSoumission?.noteIA !== null && gradingSoumission?.noteIA !== undefined && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                    Suggestion IA : {gradingSoumission.noteIA.toFixed(1)}/{selectedDevoirForSoumissions?.noteMax ?? 20}
                  </span>
                </div>
                {gradingSoumission.justificationIA && (
                  <p className="text-xs text-purple-700 dark:text-purple-400 whitespace-pre-wrap">
                    {gradingSoumission.justificationIA}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade-note">Note / {selectedDevoirForSoumissions?.noteMax ?? 20}</Label>
                <Input
                  id="grade-note"
                  type="number"
                  min={0}
                  max={selectedDevoirForSoumissions?.noteMax ?? 20}
                  step={0.5}
                  value={gradeNote}
                  onChange={(e) => setGradeNote(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex items-end">
                {gradeNote && selectedDevoirForSoumissions && (
                  <div className={`rounded-lg p-3 w-full text-center ${
                    parseFloat(gradeNote) >= selectedDevoirForSoumissions.noteMax / 2
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    <p className="text-2xl font-bold">
                      {Math.round((parseFloat(gradeNote) / selectedDevoirForSoumissions.noteMax) * 100)}%
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade-commentaire">Commentaire</Label>
              <Textarea
                id="grade-commentaire"
                placeholder="Commentaire pour l'étudiant..."
                value={gradeCommentaire}
                onChange={(e) => setGradeCommentaire(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleAiGradeSoumission}
              disabled={isAiGrading}
              className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950"
            >
              {isAiGrading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Évaluer avec l&apos;IA
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGradeDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSubmitGrade}
                disabled={isSubmittingGrade}
              >
                {isSubmittingGrade && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Enregistrer la note
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
