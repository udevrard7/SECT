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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

interface UniteEnseignement {
  id: string
  code: string
  nom: string
  niveau: string
  filiere?: { id: string; nom: string; code?: string }
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

function getTypeSeanceLabel(type: string): string {
  switch (type) {
    case 'CM': return 'Cours Magistral'
    case 'TD': return 'Travail Dirigé'
    case 'TP': return 'Travail Pratique'
    default: return type
  }
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
  const [formNoteMax, setFormNoteMax] = useState(20)
  const [formConsignes, setFormConsignes] = useState('')

  // UE dropdown data
  const [unitesEnseignement, setUnitesEnseignement] = useState<UniteEnseignement[]>([])

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Devoir | null>(null)

  // Soumissions dialog
  const [soumissionsDialogOpen, setSoumissionsDialogOpen] = useState(false)
  const [selectedDevoirForSoumissions, setSelectedDevoirForSoumissions] = useState<Devoir | null>(null)
  const [soumissions, setSoumissions] = useState<Soumission[]>([])
  const [isLoadingSoumissions, setIsLoadingSoumissions] = useState(false)

  // Grade dialog
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false)
  const [gradingSoumission, setGradingSoumission] = useState<Soumission | null>(null)
  const [gradeNote, setGradeNote] = useState('')
  const [gradeCommentaire, setGradeCommentaire] = useState('')
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false)

  // ─── Fetch devoirs ───
  const fetchDevoirs = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/devoirs?enseignantId=${user.id}`, { headers: getAuthHeaders() })
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
        const res = await fetch('/api/unites-enseignement?actif=true', { headers: getAuthHeaders() })
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
    setFormNoteMax(devoir.noteMax)
    setFormConsignes(devoir.consignes ?? '')
    setFormDialogOpen(true)
  }

  // ─── Reset form ───
  const resetForm = () => {
    setFormTitre('')
    setFormDescription('')
    setFormUniteEnseignementId('')
    setFormTypeSeance('TD')
    setFormDateLimite('')
    setFormNoteMax(20)
    setFormConsignes('')
  }

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!user?.id) return
    if (!formTitre || !formUniteEnseignementId || !formDateLimite) {
      toast.error('Informations manquantes', { description: 'Veuillez remplir tous les champs obligatoires.' })
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
        dateLimite: formDateLimite,
        noteMax: formNoteMax,
      }

      const url = editingDevoir ? `/api/devoirs/${editingDevoir.id}` : '/api/devoirs'
      const method = editingDevoir ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de l\'enregistrement')
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
      const res = await fetch(`/api/devoirs/${deleteTarget.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Erreur lors de la suppression')
      }
      toast.success('Devoir déplacé vers la corbeille', {
        description: `"${deleteTarget.titre}" a été déplacé vers la corbeille. Vous pouvez le restaurer dans les 30 jours.`,
      })
      setDeleteTarget(null)
      await fetchDevoirs()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de supprimer le devoir.',
      })
    }
  }

  // ─── View soumissions ───
  const handleViewSoumissions = async (devoir: Devoir) => {
    setSelectedDevoirForSoumissions(devoir)
    setSoumissionsDialogOpen(true)
    setIsLoadingSoumissions(true)
    try {
      const res = await fetch(`/api/devoirs/${devoir.id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSoumissions(data.devoir?.Soumission ?? [])
      }
    } catch {
      try {
        const res = await fetch(`/api/soumissions?devoirId=${devoir.id}`, { headers: getAuthHeaders() })
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

    setIsSubmittingGrade(true)
    try {
      const res = await fetch(`/api/soumissions/${gradingSoumission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        description: `Note de ${noteValue}/${selectedDevoirForSoumissions?.noteMax ?? 20} enregistrée.`,
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

  // ─── Filter devoirs ───
  const filteredDevoirs = devoirs.filter((d) => {
    if (statutFilter !== 'all' && d.statut !== statutFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchTitre = d.titre.toLowerCase().includes(q)
      const matchUE = d.UniteEnseignement?.nom?.toLowerCase().includes(q) || d.UniteEnseignement?.code?.toLowerCase().includes(q)
      if (!matchTitre && !matchUE) return false
    }
    return true
  })

  // ─── Stats ───
  const statsDevoirs = {
    total: devoirs.length,
    brouillons: devoirs.filter((d) => d.statut === 'BROUILLON').length,
    publies: devoirs.filter((d) => d.statut === 'PUBLIE').length,
    fermes: devoirs.filter((d) => d.statut === 'FERME').length,
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mes Devoirs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez et gérez vos devoirs et assignments
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Nouveau devoir
        </Button>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <Card className="border-l-4 border-l-teal-500">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par titre ou UE..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="BROUILLON">Brouillon</SelectItem>
            <SelectItem value="PUBLIE">Publié</SelectItem>
            <SelectItem value="FERME">Fermé</SelectItem>
            <SelectItem value="ARCHIVE">Archivé</SelectItem>
          </SelectContent>
        </Select>
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
      {!isLoading && devoirs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun devoir créé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Commencez par créer un devoir pour vos étudiants.
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
          <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setStatutFilter('all') }}>
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

            return (
              <Card key={devoir.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-6">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight">{devoir.titre}</h3>
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
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {getTypeSeanceLabel(devoir.typeSeance)}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                      <Star className="h-3 w-3" />
                      {devoir.noteMax} pts
                    </Badge>
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                          onClick={() => setDeleteTarget(devoir)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
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
              {editingDevoir ? 'Modifiez les paramètres du devoir.' : 'Créez un nouveau devoir pour vos étudiants.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
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
                      <SelectItem value="CM">Cours Magistral</SelectItem>
                      <SelectItem value="TD">Travail Dirigé</SelectItem>
                      <SelectItem value="TP">Travail Pratique</SelectItem>
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
            <AlertDialogTitle>Archiver ce devoir ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le devoir &quot;{deleteTarget?.titre}&quot; sera archivé. Cette action est réversible via les statuts.
              {deleteTarget?.statut === 'PUBLIE' && (
                <span className="block mt-2 text-red-500 font-medium">
                  ⚠️ Un devoir publié ne peut pas être archivé directement.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Archiver
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
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Soumissions — {selectedDevoirForSoumissions?.titre}
            </DialogTitle>
            <DialogDescription>
              {selectedDevoirForSoumissions && (
                <>
                  {selectedDevoirForSoumissions.UniteEnseignement?.code} — Note max : {selectedDevoirForSoumissions.noteMax} pts
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoadingSoumissions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : soumissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Aucune soumission pour le moment.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Date de rendu</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soumissions.map((soumission) => (
                    <TableRow key={soumission.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{soumission.User?.name}</p>
                          <p className="text-xs text-muted-foreground">{soumission.User?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {soumission.renduAt ? formatDateTime(soumission.renduAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {getStatutSoumissionBadge(soumission.statut)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {soumission.note !== null ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {soumission.note}/{selectedDevoirForSoumissions?.noteMax ?? 20}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {(soumission.statut === 'SOUMIS' || soumission.statut === 'BROUILLON') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleOpenGrade(soumission)}
                          >
                            <Star className="h-3.5 w-3.5" />
                            Noter
                          </Button>
                        )}
                        {soumission.statut === 'CORRIGE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenGrade(soumission)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Modifier
                          </Button>
                        )}
                        {soumission.statut === 'RETOURNE' && (
                          <Badge variant="outline" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Rendu
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Grade Soumission Dialog ─── */}
      <Dialog open={gradeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setGradeDialogOpen(false)
          setGradingSoumission(null)
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-600" />
              Noter la soumission
            </DialogTitle>
            <DialogDescription>
              {gradingSoumission && (
                <>
                  Étudiant : <span className="font-medium">{gradingSoumission.User?.name}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grade-note">
                Note (sur {selectedDevoirForSoumissions?.noteMax ?? 20}) *
              </Label>
              <Input
                id="grade-note"
                type="number"
                min={0}
                max={selectedDevoirForSoumissions?.noteMax ?? 20}
                step={0.5}
                placeholder={`0 - ${selectedDevoirForSoumissions?.noteMax ?? 20}`}
                value={gradeNote}
                onChange={(e) => setGradeNote(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade-commentaire">Commentaire</Label>
              <Textarea
                id="grade-commentaire"
                placeholder="Commentaire pour l'étudiant..."
                value={gradeCommentaire}
                onChange={(e) => setGradeCommentaire(e.target.value)}
                rows={4}
              />
            </div>

            {gradingSoumission?.commentaireEtudiant && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Commentaire de l&apos;étudiant :</p>
                <p className="text-sm">{gradingSoumission.commentaireEtudiant}</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setGradeDialogOpen(false)
                setGradingSoumission(null)
              }}
            >
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
