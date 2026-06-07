'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen,
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Edit3,
  Trash2,
  Power,
  PowerOff,
  Settings2,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  GraduationCap,
  X,
  Mail,
  Zap,
  Clock,
  Send,
  Copy,
  ShieldAlert,
  RefreshCw,
  Ban,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface EnseignantItem {
  id: string
  name: string
  email: string
  role: string
  actif: boolean
  etablissementId: string | null
  filiereId: string | null
  createdAt: string
  etablissement: { id: string; nom: string } | null
  filiere: { id: string; nom: string } | null
  enseignantFilieres?: EnseignantFiliereItem[]
}

interface EnseignantFiliereItem {
  id: string
  enseignantId: string
  filiereId: string
  niveau: string
  filiere: { id: string; nom: string; code: string | null }
  enseignant?: { id: string; name: string; email: string }
}

interface FiliereOption {
  id: string
  nom: string
  code: string | null
}

interface ImportResult {
  imported: number
  errors: Array<{ row: number; email: string; error: string }>
  users: Array<{ id: string; name: string; email: string; password: string; role: string }>
}

interface AssignmentRow {
  filiereId: string
  niveau: string
}

interface InvitationItem {
  id: string
  email: string
  role: string
  name: string | null
  token: string
  used: boolean
  expiresAt: string
  createdAt: string
  etablissementId: string | null
  filiereId: string | null
  createdById: string
  Etablissement?: { id: string; nom: string } | null
  Filiere?: { id: string; nom: string } | null
  User?: { id: string; name: string; email: string } | null
}

type RegistrationMode = 'invitation' | 'direct'

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'] as const

// ─── Utility functions ───

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTimeFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimeRemaining(expiresAt: string): { text: string; isExpired: boolean; isUrgent: boolean } {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diffMs = expiry.getTime() - now.getTime()

  if (diffMs <= 0) {
    return { text: 'Expirée', isExpired: true, isUrgent: false }
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (diffHours < 6) {
    return { text: `${diffHours}h ${diffMinutes}min`, isExpired: false, isUrgent: true }
  }

  const diffDays = Math.floor(diffHours / 24)
  const remainingHours = diffHours % 24

  if (diffDays > 0) {
    return { text: `${diffDays}j ${remainingHours}h`, isExpired: false, isUrgent: false }
  }

  return { text: `${diffHours}h`, isExpired: false, isUrgent: false }
}

function parseCSV(text: string): Array<{ name: string; email: string }> {
  const lines = text.trim().split('\n')
  const header = lines[0].toLowerCase()
  if (!header.includes('name') || !header.includes('email')) {
    return lines
      .map((line) => {
        const [name, email] = line.split(',').map((s) => s.trim())
        return { name: name || '', email: email || '' }
      })
      .filter((r) => r.name && r.email)
  }
  return lines
    .slice(1)
    .map((line) => {
      const [name, email] = line.split(',').map((s) => s.trim())
      return { name: name || '', email: email || '' }
    })
    .filter((r) => r.name && r.email)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getNiveauBadgeColor(niveau: string): string {
  switch (niveau) {
    case 'L1': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'L2': return 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800'
    case 'L3': return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700'
    case 'M1': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    case 'M2': return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700'
    default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
  }
}

// ─── Main Component ───

export function EnseignantsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [enseignants, setEnseignants] = useState<EnseignantItem[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [assignments, setAssignments] = useState<EnseignantFiliereItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingInvitations, setPendingInvitations] = useState<InvitationItem[]>([])

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ─── Dialog state ───
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [directResultDialogOpen, setDirectResultDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingEnseignant, setEditingEnseignant] = useState<EnseignantItem | null>(null)
  const [assignmentEnseignant, setAssignmentEnseignant] = useState<EnseignantItem | null>(null)

  // ─── Registration mode state ───
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('invitation')
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addAssignments, setAddAssignments] = useState<AssignmentRow[]>([{ filiereId: '', niveau: '' }])
  const [invitationTokenLink, setInvitationTokenLink] = useState<string | null>(null)
  const [directCreationResult, setDirectCreationResult] = useState<{ email: string; tempPassword: string } | null>(null)

  // ─── Edit form state ───
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editActif, setEditActif] = useState(true)

  // ─── Assignment management state ───
  const [teacherAssignments, setTeacherAssignments] = useState<EnseignantFiliereItem[]>([])
  const [newAssignmentFiliereId, setNewAssignmentFiliereId] = useState('')
  const [newAssignmentNiveau, setNewAssignmentNiveau] = useState('')
  const [isSavingAssignments, setIsSavingAssignments] = useState(false)
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState<EnseignantFiliereItem | null>(null)

  // ─── Import state ───
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importParsedData, setImportParsedData] = useState<Array<{ name: string; email: string }>>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // ─── Invitation tracking state ───
  const [cancelInvitationTarget, setCancelInvitationTarget] = useState<InvitationItem | null>(null)
  const [isResending, setIsResending] = useState<string | null>(null)

  // ─── Get filiere IDs managed by this responsable ───
  const filiereIds = filieres.map((f) => f.id)

  // ─── Build assignment map ───
  const assignmentMap = assignments.reduce<Record<string, EnseignantFiliereItem[]>>((acc, a) => {
    if (!acc[a.enseignantId]) acc[a.enseignantId] = []
    acc[a.enseignantId].push(a)
    return acc
  })

  // ─── Fetch filieres for this responsable ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.etablissementId || user?.etablissement?.id) params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const filieresData = (data.filieres ?? []).map((f: FiliereOption & { code?: string | null }) => ({
          id: f.id,
          nom: f.nom,
          code: f.code ?? null,
        }))
        setFilieres(filieresData)
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch teachers ───
  const fetchEnseignants = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('role', 'ENSEIGNANT')
      params.set('limit', '200')
      if (user?.etablissementId || user?.etablissement?.id) params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      if (search) params.set('search', search)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')

      const res = await fetch(`/api/users?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const users = (data.users ?? []) as EnseignantItem[]
        setEnseignants(users)
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [user?.etablissementId, user?.etablissement?.id, search, statusFilter])

  // ─── Fetch assignments ───
  const fetchAssignments = useCallback(async () => {
    if (!user?.etablissementId && !user?.etablissement?.id) return
    try {
      const params = new URLSearchParams()
      params.set('etablissementId', user?.etablissementId || user?.etablissement?.id)
      const res = await fetch(`/api/enseignant-filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAssignments(data.assignments ?? [])
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch pending invitations ───
  const fetchPendingInvitations = useCallback(async () => {
    if (!user?.id) return
    try {
      const params = new URLSearchParams()
      params.set('createdById', user.id)
      params.set('used', 'false')
      params.set('limit', '50')
      const res = await fetch(`/api/invitations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        // Filter to only ENSEIGNANT invitations
        const enseignantInvitations = (data.invitations ?? []).filter(
          (inv: InvitationItem) => inv.role === 'ENSEIGNANT'
        )
        setPendingInvitations(enseignantInvitations)
      }
    } catch {
      // Silent
    }
  }, [user?.id])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  useEffect(() => {
    fetchEnseignants()
  }, [fetchEnseignants])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  useEffect(() => {
    fetchPendingInvitations()
  }, [fetchPendingInvitations])

  // ─── Filtered enseignants: show all teachers from the établissement ───
  const filteredEnseignants = enseignants.filter((e) => {
    // Filter by search
    if (search) {
      const q = search.toLowerCase()
      const matchesName = e.name?.toLowerCase().includes(q)
      const matchesEmail = e.email?.toLowerCase().includes(q)
      if (!matchesName && !matchesEmail) return false
    }

    // Apply status filter
    if (statusFilter === 'actif' && !e.actif) return false
    if (statusFilter === 'inactif' && e.actif) return false

    // Apply filiere filter (only for teachers with assignments)
    if (filiereFilter !== 'all') {
      const teacherAssigns = assignmentMap[e.id] || []
      const hasFiliere = teacherAssigns.some((a) => a.filiereId === filiereFilter)
      if (!hasFiliere) return false
    }

    return true
  })

  // ─── Stats ───
  const totalEnseignants = enseignants.length
  const activeEnseignants = enseignants.filter((e) => e.actif).length
  const withAssignments = filteredEnseignants.filter((e) => (assignmentMap[e.id] || []).length > 0).length
  const totalLevelAssignments = filteredEnseignants.reduce((sum, e) => {
    const teacherAssigns = (assignmentMap[e.id] || []).filter((a) => filiereIds.includes(a.filiereId))
    return sum + teacherAssigns.length
  }, 0)

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setAddName('')
    setAddEmail('')
    setAddAssignments([{ filiereId: '', niveau: '' }])
    setRegistrationMode('invitation')
    setInvitationTokenLink(null)
    setDirectCreationResult(null)
    setAddDialogOpen(true)
  }

  // ─── Submit invitation mode ───
  const handleInvitationSubmit = async () => {
    if (!addEmail) {
      toast.error('Champs manquants', { description: 'L\'email est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        email: addEmail,
        role: 'ENSEIGNANT',
        createdById: user?.id,
      }
      if (addName) body.name = addName
      if (user?.etablissementId || user?.etablissement?.id) body.etablissementId = user?.etablissementId || user?.etablissement?.id

      // Get the first selected filiere for the invitation (primary assignment)
      const firstValidAssignment = addAssignments.find((a) => a.filiereId && a.niveau)
      if (firstValidAssignment) {
        body.filiereId = firstValidAssignment.filiereId
      }

      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'envoi de l\'invitation')
      }

      const data = await res.json()
      const token = data.token as string

      // Create filière assignments after invitation is sent
      // Note: assignments will be created when the teacher accepts the invitation
      // But we can pre-assign if the invitation has a filiereId
      // For additional assignments beyond the first, we'd need the user to accept first
      // For now, we store the first filiere with the invitation

      setInvitationTokenLink(`/api/invitations/verify?token=${token}`)
      toast.success('Invitation envoyée', { description: `Une invitation a été envoyée à ${addEmail}` })
      await fetchPendingInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Submit direct creation mode ───
  const handleDirectSubmit = async () => {
    if (!addName || !addEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: addName,
        email: addEmail,
        role: 'ENSEIGNANT',
        actif: true,
        mode: 'direct',
      }
      if (user?.etablissementId || user?.etablissement?.id) body.etablissementId = user?.etablissementId || user?.etablissement?.id

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      const data = await res.json()
      const createdUser = data.user as { id: string }
      const temporaryPassword = data.temporaryPassword as string

      // Create assignments if any are filled
      const validAssignments = addAssignments.filter((a) => a.filiereId && a.niveau)
      if (validAssignments.length > 0) {
        const assignmentBody = {
          assignments: validAssignments.map((a) => ({
            enseignantId: createdUser.id,
            filiereId: a.filiereId,
            niveau: a.niveau,
          })),
        }
        const assignRes = await fetch('/api/enseignant-filieres', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            },
          body: JSON.stringify(assignmentBody),
        })
        if (!assignRes.ok) {
          const assignErr = await assignRes.json().catch(() => ({}))
          toast.warning('Affectations partielles', {
            description: assignErr.error || 'Certaines affectations n\'ont pas pu être créées.',
          })
        }
      }

      // Show direct creation result dialog
      setDirectCreationResult({ email: addEmail, tempPassword: temporaryPassword })
      setDirectResultDialogOpen(true)
      setAddDialogOpen(false)
      await fetchAssignments()
      await fetchEnseignants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (enseignant: EnseignantItem) => {
    setEditingEnseignant(enseignant)
    setEditName(enseignant.name)
    setEditEmail(enseignant.email)
    setEditActif(enseignant.actif)
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleEditSubmit = async () => {
    if (!editingEnseignant) return
    if (!editName || !editEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: editName,
        email: editEmail,
        actif: editActif,
      }

      const res = await fetch(`/api/users/${editingEnseignant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la modification')
      }

      toast.success('Enseignant modifié', { description: `${editName} a été mis à jour.` })
      setEditDialogOpen(false)
      setEditingEnseignant(null)
      await fetchEnseignants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle active ───
  const handleToggleActive = async (enseignant: EnseignantItem) => {
    try {
      const res = await fetch(`/api/users/${enseignant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ actif: !enseignant.actif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(enseignant.actif ? 'Enseignant désactivé' : 'Enseignant activé', {
        description: `${enseignant.name} est maintenant ${enseignant.actif ? 'inactif' : 'actif'}.`,
      })
      await fetchEnseignants()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Open manage assignments dialog ───
  const handleOpenAssignments = (enseignant: EnseignantItem) => {
    setAssignmentEnseignant(enseignant)
    const teacherAssigns = (assignmentMap[enseignant.id] || []).filter((a) => filiereIds.includes(a.filiereId))
    setTeacherAssignments(teacherAssigns)
    setNewAssignmentFiliereId('')
    setNewAssignmentNiveau('')
    setAssignmentDialogOpen(true)
  }

  // ─── Add new assignment ───
  const handleAddAssignment = async () => {
    if (!assignmentEnseignant || !newAssignmentFiliereId || !newAssignmentNiveau) {
      toast.error('Champs manquants', { description: 'Sélectionnez une filière et un niveau.' })
      return
    }

    // Check for duplicate
    const isDuplicate = teacherAssignments.some(
      (a) => a.filiereId === newAssignmentFiliereId && a.niveau === newAssignmentNiveau
    )
    if (isDuplicate) {
      toast.error('Doublon', { description: 'Cette affectation existe déjà pour cet enseignant.' })
      return
    }

    setIsSavingAssignments(true)
    try {
      const res = await fetch('/api/enseignant-filieres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({
          assignments: [{
            enseignantId: assignmentEnseignant.id,
            filiereId: newAssignmentFiliereId,
            niveau: newAssignmentNiveau,
          }],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'ajout')
      }

      toast.success('Affectation ajoutée', {
        description: `Niveau ${newAssignmentNiveau} ajouté avec succès.`,
      })
      setNewAssignmentFiliereId('')
      setNewAssignmentNiveau('')
      await fetchAssignments()
      // Refresh teacher assignments
      const updatedAssigns = await (async () => {
        const params = new URLSearchParams()
        params.set('enseignantId', assignmentEnseignant.id)
        const res2 = await fetch(`/api/enseignant-filieres?${params.toString()}`)
        if (res2.ok) {
          const d = await res2.json()
          return (d.assignments ?? []).filter((a: EnseignantFiliereItem) => filiereIds.includes(a.filiereId))
        }
        return teacherAssignments
      })()
      setTeacherAssignments(updatedAssigns)
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible d\'ajouter l\'affectation.' })
    } finally {
      setIsSavingAssignments(false)
    }
  }

  // ─── Remove assignment ───
  const handleRemoveAssignment = async () => {
    if (!deleteAssignmentTarget || !assignmentEnseignant) return

    setIsSavingAssignments(true)
    try {
      const res = await fetch('/api/enseignant-filieres', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ id: deleteAssignmentTarget.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }

      toast.success('Affectation retirée', {
        description: `${deleteAssignmentTarget.niveau}-${deleteAssignmentTarget.filiere.nom} supprimée.`,
      })
      setDeleteAssignmentTarget(null)
      await fetchAssignments()
      // Refresh teacher assignments
      const params = new URLSearchParams()
      params.set('enseignantId', assignmentEnseignant.id)
      const res2 = await fetch(`/api/enseignant-filieres?${params.toString()}`)
      if (res2.ok) {
        const d = await res2.json()
        setTeacherAssignments((d.assignments ?? []).filter((a: EnseignantFiliereItem) => filiereIds.includes(a.filiereId)))
      }
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de supprimer l\'affectation.' })
    } finally {
      setIsSavingAssignments(false)
    }
  }

  // ─── CSV file handling ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      setImportParsedData(parsed)
    }
    reader.readAsText(file)
  }

  // ─── Import submit ───
  const handleImportSubmit = async () => {
    if (importParsedData.length === 0) {
      toast.error('Aucune donnée', { description: 'Le fichier CSV ne contient aucune donnée valide.' })
      return
    }

    setIsImporting(true)
    try {
      const body: Record<string, unknown> = {
        users: importParsedData,
        role: 'ENSEIGNANT',
      }
      if (user?.etablissementId || user?.etablissement?.id) body.etablissementId = user?.etablissementId || user?.etablissement?.id

      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'import')
      }

      const data: ImportResult = await res.json()
      setImportResult(data)

      if (data.imported > 0) {
        toast.success('Import réussi', {
          description: `${data.imported} enseignant${data.imported > 1 ? 's' : ''} importé${data.imported > 1 ? 's' : ''}.`,
        })
      }

      await fetchEnseignants()
    } catch (err) {
      toast.error('Erreur d\'import', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsImporting(false)
    }
  }

  // ─── Download passwords CSV ───
  const handleDownloadPasswords = () => {
    if (!importResult?.users) return
    const header = 'name,email,password'
    const rows = importResult.users.map((u) => `${u.name},${u.email},${u.password}`)
    const csv = [header, ...rows].join('\n')
    downloadCSV(csv, 'mots-de-passe-enseignants.csv')
  }

  // ─── Download CSV template ───
  const handleDownloadTemplate = () => {
    const csv = 'name,email\nAhmed Benali,ahmed.benali@universite.fr\nSophie Martin,sophie.martin@universite.fr'
    downloadCSV(csv, 'template-import-enseignants.csv')
    toast.success('Template téléchargé', { description: 'Remplissez le fichier CSV avec vos enseignants.' })
  }

  // ─── Reset import state ───
  const handleOpenImport = () => {
    setImportFile(null)
    setImportParsedData([])
    setIsImporting(false)
    setImportResult(null)
    setImportDialogOpen(true)
  }

  // ─── Add assignment row ───
  const handleAddAssignmentRow = () => {
    setAddAssignments([...addAssignments, { filiereId: '', niveau: '' }])
  }

  // ─── Remove assignment row ───
  const handleRemoveAssignmentRow = (index: number) => {
    setAddAssignments(addAssignments.filter((_, i) => i !== index))
  }

  // ─── Update assignment row ───
  const handleUpdateAssignmentRow = (index: number, field: 'filiereId' | 'niveau', value: string) => {
    const updated = [...addAssignments]
    updated[index] = { ...updated[index], [field]: value }
    setAddAssignments(updated)
  }

  // ─── Resend invitation ───
  const handleResendInvitation = async (invitation: InvitationItem) => {
    setIsResending(invitation.id)
    try {
      const res = await fetch(`/api/invitations/${invitation.id}/renvoyer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors du renvoi')
      }

      const data = await res.json()
      toast.success('Invitation renvoyée', {
        description: `Nouveau lien envoyé à ${invitation.email}`,
      })

      // Show the new token link for testing
      const newToken = data.token as string
      setInvitationTokenLink(`/api/invitations/verify?token=${newToken}`)

      await fetchPendingInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de renvoyer l\'invitation.' })
    } finally {
      setIsResending(null)
    }
  }

  // ─── Cancel invitation ───
  const handleCancelInvitation = async () => {
    if (!cancelInvitationTarget) return

    try {
      const res = await fetch(`/api/invitations/${cancelInvitationTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'annulation')
      }

      toast.success('Invitation annulée', {
        description: `L'invitation pour ${cancelInvitationTarget.email} a été annulée.`,
      })
      setCancelInvitationTarget(null)
      await fetchPendingInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible d\'annuler l\'invitation.' })
    }
  }

  // ─── Copy to clipboard ───
  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copié', { description: `${label} copié dans le presse-papiers.` })
    }).catch(() => {
      toast.error('Erreur', { description: 'Impossible de copier.' })
    })
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-emerald-600" />
            Gestion des Enseignants
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les enseignants et leurs affectations aux filières et niveaux
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" />
            Template CSV
          </Button>
          <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950" onClick={handleOpenImport}>
            <Upload className="h-4 w-4" />
            Importer CSV
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4" />
            Ajouter un enseignant
          </Button>
        </div>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total enseignants</p>
              <p className="text-xl font-bold">{totalEnseignants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold">{activeEnseignants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec affectations</p>
              <p className="text-xl font-bold">{withAssignments}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Settings2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Affectations niveau</p>
              <p className="text-xl font-bold">{totalLevelAssignments}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search/Filter Toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filiereFilter} onValueChange={setFiliereFilter}>
          <SelectTrigger className="w-[220px]">
            <GraduationCap className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Filière" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les filières</SelectItem>
            {filieres.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nom}{f.code ? ` (${f.code})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="inactif">Inactif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-32 rounded bg-muted" />
                    <div className="h-4 w-48 rounded bg-muted" />
                    <div className="flex gap-2">
                      <div className="h-5 w-20 rounded-full bg-muted" />
                      <div className="h-5 w-16 rounded-full bg-muted" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-muted" />
                  <div className="h-5 w-24 rounded-full bg-muted" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-8 w-20 rounded bg-muted" />
                  <div className="h-8 w-24 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filteredEnseignants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun enseignant trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || filiereFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : filieres.length === 0
                ? 'Vous n\'avez aucune filière assignée. Les enseignants seront visibles une fois vos filières configurées.'
                : 'Commencez par ajouter des enseignants ou importez-les depuis un fichier CSV.'}
          </p>
          {!search && filiereFilter === 'all' && statusFilter === 'all' && filieres.length > 0 && (
            <div className="mt-6 flex gap-3">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4" />
                Ajouter un enseignant
              </Button>
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950" onClick={handleOpenImport}>
                <Upload className="h-4 w-4" />
                Importer CSV
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Teacher card grid ─── */}
      {!isLoading && filteredEnseignants.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEnseignants.map((enseignant) => {
            const teacherAssigns = (assignmentMap[enseignant.id] || []).filter((a) => filiereIds.includes(a.filiereId))

            return (
              <Card key={enseignant.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-6">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      {getInitials(enseignant.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-tight truncate">{enseignant.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{enseignant.email}</p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {enseignant.actif ? (
                      <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 text-xs">Actif</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
                    )}
                  </div>

                  {/* Filière-Level assignments */}
                  {teacherAssigns.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {teacherAssigns.map((assignment) => (
                        <Badge key={assignment.id} className={`${getNiveauBadgeColor(assignment.niveau)} text-xs`}>
                          {assignment.niveau}-{assignment.filiere.nom}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800 w-fit">
                      Sans affectation
                    </Badge>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(enseignant)}
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAssignments(enseignant)}
                      className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Affectations
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(enseignant)}
                    >
                      {enseignant.actif ? (
                        <>
                          <PowerOff className="h-3.5 w-3.5" />
                          Désactiver
                        </>
                      ) : (
                        <>
                          <Power className="h-3.5 w-3.5" />
                          Activer
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Pending Invitations Section ─── */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Invitations en attente</h2>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
              {pendingInvitations.length}
            </Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Filière</TableHead>
                      <TableHead>Expire dans</TableHead>
                      <TableHead>Envoyée le</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((invitation) => {
                      const timeRemaining = getTimeRemaining(invitation.expiresAt)
                      return (
                        <TableRow key={invitation.id}>
                          <TableCell className="font-medium">{invitation.email}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {invitation.name || <span className="italic text-xs">Non défini</span>}
                          </TableCell>
                          <TableCell>
                            {invitation.Filiere ? (
                              <Badge variant="outline" className="text-xs">
                                {invitation.Filiere.nom}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span className={`text-sm ${
                                timeRemaining.isExpired
                                  ? 'text-red-600 font-semibold'
                                  : timeRemaining.isUrgent
                                    ? 'text-amber-600 font-semibold'
                                    : 'text-muted-foreground'
                              }`}>
                                {timeRemaining.text}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTimeFR(invitation.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                                onClick={() => handleResendInvitation(invitation)}
                                disabled={isResending === invitation.id}
                              >
                                {isResending === invitation.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                Renvoyer
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                                onClick={() => setCancelInvitationTarget(invitation)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Annuler
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Add Enseignant Dialog (Dual Registration) ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              Ajouter un enseignant
            </DialogTitle>
            <DialogDescription>
              Choisissez le mode de création du compte enseignant.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* ─── Mode Toggle ─── */}
            <div className="flex rounded-lg border border-emerald-200 dark:border-emerald-800 p-1 bg-emerald-50/50 dark:bg-emerald-950/30">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  registrationMode === 'invitation'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                }`}
                onClick={() => setRegistrationMode('invitation')}
              >
                <Mail className="h-4 w-4" />
                Invitation par email
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  registrationMode === 'direct'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                }`}
                onClick={() => setRegistrationMode('direct')}
              >
                <Zap className="h-4 w-4" />
                Création directe
              </button>
            </div>

            {/* ─── Invitation Mode ─── */}
            {registrationMode === 'invitation' && (
              <>
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      L&apos;enseignant recevra un lien d&apos;inscription par email pour créer son propre mot de passe. Le lien est valide 48h.
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inv-email">Email *</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="Ex: ahmed.benali@universite.fr"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inv-name">Nom complet <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                  <Input
                    id="inv-name"
                    placeholder="Ex: Ahmed Benali"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    L&apos;enseignant pourra le définir lui-même lors de l&apos;inscription.
                  </p>
                </div>

                <Separator />

                {/* Assignment rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Affectations Filière-Niveau <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                      onClick={handleAddAssignmentRow}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                  {addAssignments.map((row, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Filière</Label>
                        <Select
                          value={row.filiereId}
                          onValueChange={(val) => handleUpdateAssignmentRow(index, 'filiereId', val)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Filière" />
                          </SelectTrigger>
                          <SelectContent>
                            {filieres.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">Niveau</Label>
                        <Select
                          value={row.niveau}
                          onValueChange={(val) => handleUpdateAssignmentRow(index, 'niveau', val)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Niveau" />
                          </SelectTrigger>
                          <SelectContent>
                            {NIVEAUX.map((n) => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {addAssignments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveAssignmentRow(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Token link display after invitation success */}
                {invitationTokenLink && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Invitation envoyée avec succès</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lien d&apos;inscription (pour test) :
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white dark:bg-gray-900 border rounded px-2 py-1.5 break-all">
                        {invitationTokenLink}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-8"
                        onClick={() => handleCopyToClipboard(invitationTokenLink, 'Lien d\'inscription')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── Direct Creation Mode ─── */}
            {registrationMode === 'direct' && (
              <>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      Un mot de passe temporaire sera généré automatiquement. L&apos;enseignant devra le changer à sa première connexion.
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-name">Nom complet *</Label>
                  <Input
                    id="direct-name"
                    placeholder="Ex: Ahmed Benali"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-email">Email *</Label>
                  <Input
                    id="direct-email"
                    type="email"
                    placeholder="Ex: ahmed.benali@universite.fr"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </div>

                <Separator />

                {/* Assignment rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Affectations Filière-Niveau <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                      onClick={handleAddAssignmentRow}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                  {addAssignments.map((row, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Filière</Label>
                        <Select
                          value={row.filiereId}
                          onValueChange={(val) => handleUpdateAssignmentRow(index, 'filiereId', val)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Filière" />
                          </SelectTrigger>
                          <SelectContent>
                            {filieres.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">Niveau</Label>
                        <Select
                          value={row.niveau}
                          onValueChange={(val) => handleUpdateAssignmentRow(index, 'niveau', val)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Niveau" />
                          </SelectTrigger>
                          <SelectContent>
                            {NIVEAUX.map((n) => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {addAssignments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveAssignmentRow(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            {registrationMode === 'invitation' ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleInvitationSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer l&apos;invitation
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleDirectSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Créer le compte
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Direct Creation Result Dialog ─── */}
      <Dialog open={directResultDialogOpen} onOpenChange={setDirectResultDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Compte enseignant créé
            </DialogTitle>
            <DialogDescription>
              Transmettez les identifiants à l&apos;enseignant de manière sécurisée.
            </DialogDescription>
          </DialogHeader>

          {directCreationResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-white dark:bg-gray-900 border rounded px-3 py-2">
                      {directCreationResult.email}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-9"
                      onClick={() => handleCopyToClipboard(directCreationResult.email, 'Email')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Mot de passe temporaire</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-white dark:bg-gray-900 border rounded px-3 py-2 font-mono">
                      {directCreationResult.tempPassword}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-9"
                      onClick={() => handleCopyToClipboard(directCreationResult.tempPassword, 'Mot de passe')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Attention :</strong> Ce mot de passe est temporaire et doit être communiqué à l&apos;enseignant de manière sécurisée.
                    L&apos;enseignant sera obligé de le changer lors de sa première connexion.
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setDirectResultDialogOpen(false)}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Enseignant Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-emerald-600" />
              Modifier l&apos;enseignant
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de l&apos;enseignant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom complet *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="edit-actif">Statut actif</Label>
              <Button
                variant={editActif ? 'default' : 'outline'}
                size="sm"
                className={editActif ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                onClick={() => setEditActif(!editActif)}
              >
                {editActif ? (
                  <>
                    <Power className="h-3.5 w-3.5 mr-1" />
                    Actif
                  </>
                ) : (
                  <>
                    <PowerOff className="h-3.5 w-3.5 mr-1" />
                    Inactif
                  </>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleEditSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manage Assignments Dialog ─── */}
      <Dialog open={assignmentDialogOpen} onOpenChange={(open) => { if (!open) setAssignmentDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-teal-600" />
              Affectations de {assignmentEnseignant?.name}
            </DialogTitle>
            <DialogDescription>
              Gérez les affectations filière-niveau de cet enseignant.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Current assignments */}
            {teacherAssignments.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Affectations actuelles</Label>
                <div className="flex flex-wrap gap-2">
                  {teacherAssignments.map((ta) => (
                    <div key={ta.id} className="flex items-center gap-1">
                      <Badge className={`${getNiveauBadgeColor(ta.niveau)} text-xs`}>
                        {ta.niveau}-{ta.filiere.nom}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteAssignmentTarget(ta)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aucune affectation pour le moment.</p>
            )}

            <Separator />

            {/* Add new assignment */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Ajouter une affectation</Label>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Filière</Label>
                  <Select value={newAssignmentFiliereId} onValueChange={setNewAssignmentFiliereId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une filière" />
                    </SelectTrigger>
                    <SelectContent>
                      {filieres.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs text-muted-foreground">Niveau</Label>
                  <Select value={newAssignmentNiveau} onValueChange={setNewAssignmentNiveau}>
                    <SelectTrigger>
                      <SelectValue placeholder="Niveau" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIVEAUX.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                  onClick={handleAddAssignment}
                  disabled={isSavingAssignments}
                >
                  {isSavingAssignments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Import Dialog ─── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) setImportDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-amber-600" />
              Importer des enseignants
            </DialogTitle>
            <DialogDescription>
              Importez une liste d&apos;enseignants depuis un fichier CSV (colonnes : name, email).
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {!importResult ? (
              <>
                <div className="space-y-2">
                  <Label>Fichier CSV</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileSelect}
                      className="flex-1"
                    />
                  </div>
                </div>

                {importParsedData.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Aperçu ({importParsedData.length} enseignant{importParsedData.length > 1 ? 's' : ''})</Label>
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="p-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Nom</TableHead>
                              <TableHead className="text-xs">Email</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importParsedData.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs py-1">{row.name}</TableCell>
                                <TableCell className="text-xs py-1">{row.email}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{importResult.imported} enseignant{importResult.imported > 1 ? 's' : ''} importé{importResult.imported > 1 ? 's' : ''}</span>
                </div>

                {importResult.users.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Comptes créés</Label>
                      <Button variant="outline" size="sm" onClick={handleDownloadPasswords}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Télécharger les mots de passe
                      </Button>
                    </div>
                    <ScrollArea className="max-h-64 rounded-md border">
                      <div className="p-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Nom</TableHead>
                              <TableHead className="text-xs">Email</TableHead>
                              <TableHead className="text-xs">Mot de passe</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importResult.users.map((u, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs py-1">{u.name}</TableCell>
                                <TableCell className="text-xs py-1">{u.email}</TableCell>
                                <TableCell className="text-xs py-1 font-mono">
                                  <div className="flex items-center gap-1">
                                    <span>{u.password}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleCopyToClipboard(u.password, 'Mot de passe')}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm text-red-600">Erreurs</Label>
                    <ScrollArea className="max-h-32 rounded-md border border-red-200">
                      <div className="p-2 space-y-1">
                        {importResult.errors.map((e, i) => (
                          <div key={i} className="text-xs text-red-600">
                            Ligne {e.row} ({e.email}): {e.error}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            {importResult ? (
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                Fermer
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={handleImportSubmit}
                  disabled={isImporting || importParsedData.length === 0}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4 mr-2" />
                      Importer
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Assignment Confirmation ─── */}
      <AlertDialog open={!!deleteAssignmentTarget} onOpenChange={(open) => { if (!open) setDeleteAssignmentTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer l&apos;affectation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer l&apos;affectation{' '}
              <strong>{deleteAssignmentTarget?.niveau}-{deleteAssignmentTarget?.filiere.nom}</strong>{' '}
              pour cet enseignant ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveAssignment}
              className="bg-red-600 hover:bg-red-700"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel Invitation Confirmation ─── */}
      <AlertDialog open={!!cancelInvitationTarget} onOpenChange={(open) => { if (!open) setCancelInvitationTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler l&apos;invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler l&apos;invitation pour{' '}
              <strong>{cancelInvitationTarget?.email}</strong> ?{' '}
              Le lien d&apos;inscription ne sera plus valide. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvitation}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmer l&apos;annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
