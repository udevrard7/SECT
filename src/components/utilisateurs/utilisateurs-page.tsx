'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit3,
  Trash2,
  Power,
  PowerOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserCheck,
  UserX,
  Shield,
  Mail,
  Building2,
  GraduationCap,
  Clock,
  Send,
  FileUp,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Zap,
  UserPlus,
  KeyRound,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

type RegistrationMode = 'invitation' | 'direct'

interface EtablissementOption {
  id: string
  nom: string
}

interface FiliereOption {
  id: string
  nom: string
  etablissementId: string
}

interface UserItem {
  id: string
  email: string
  name: string
  role: string
  etablissementId: string | null
  filiereId: string | null
  image: string | null
  actif: boolean
  derniereConnexion: string | null
  createdAt: string
  etablissement: { id: string; nom: string } | null
  filiere: { id: string; nom: string } | null
}

interface InvitationItem {
  id: string
  email: string
  role: string
  name: string | null
  used: boolean
  createdAt: string
  expiresAt: string
  Etablissement: { id: string; nom: string } | null
  Filiere: { id: string; nom: string } | null
  User: { id: string; name: string; email: string } | null
}

interface ImportResultUser {
  id: string
  name: string
  email: string
  password: string
  role: string
}

interface ImportError {
  row: number
  email: string
  error: string
}

// ─── Utility functions ───

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'ADMIN':
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800">Admin</Badge>
    case 'RESPONSABLE':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">Responsable</Badge>
    case 'ENSEIGNANT':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Enseignant</Badge>
    case 'ETUDIANT':
      return <Badge className="bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">Étudiant</Badge>
    default:
      return <Badge variant="outline">{role}</Badge>
  }
}

function getAvatarColor(role: string): string {
  switch (role) {
    case 'ADMIN': return 'bg-rose-500'
    case 'RESPONSABLE': return 'bg-amber-500'
    case 'ENSEIGNANT': return 'bg-emerald-500'
    case 'ETUDIANT': return 'bg-sky-500'
    default: return 'bg-gray-500'
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'ADMIN': return 'Admin'
    case 'RESPONSABLE': return 'Responsable des études'
    case 'ENSEIGNANT': return 'Enseignant'
    case 'ETUDIANT': return 'Étudiant'
    default: return role
  }
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Jamais'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return 'À l\'instant'
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD < 7) return `Il y a ${diffD}j`
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getExpiryCountdown(expiresAt: string): string {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diffMs = expiry.getTime() - now.getTime()

  if (diffMs <= 0) return 'Expirée'

  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (diffH > 24) {
    const diffD = Math.floor(diffH / 24)
    return `Expire dans ${diffD}j ${diffH % 24}h`
  }
  if (diffH > 0) return `Expire dans ${diffH}h ${diffMin}min`
  return `Expire dans ${diffMin}min`
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now()
}

function getInvitationStatus(inv: InvitationItem): 'pending' | 'used' | 'expired' {
  if (inv.used) return 'used'
  if (isExpired(inv.expiresAt)) return 'expired'
  return 'pending'
}

function getInvitationStatusBadge(status: 'pending' | 'used' | 'expired') {
  switch (status) {
    case 'pending':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800">En attente</Badge>
    case 'used':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Utilisée</Badge>
    case 'expired':
      return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">Expirée</Badge>
  }
}

// ─── Main Component ───

export function UtilisateursPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const limit = 20

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null)

  // ─── Registration mode ───
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('direct')

  // ─── Form state ───
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('ETUDIANT')
  const [formEtablissementId, setFormEtablissementId] = useState('')
  const [formFiliereId, setFormFiliereId] = useState('')
  const [formActif, setFormActif] = useState(true)
  const [formMatricule, setFormMatricule] = useState('')

  // ─── Direct creation result state ───
  const [directCreationResult, setDirectCreationResult] = useState<{
    email: string
    temporaryPassword: string
  } | null>(null)
  const [directResultDialogOpen, setDirectResultDialogOpen] = useState(false)
  const [copiedCredentials, setCopiedCredentials] = useState(false)

  // ─── Invitation result state ───
  const [invitationResult, setInvitationResult] = useState<{
    email: string
    token: string
  } | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)

  // ─── Options state ───
  const [etablissements, setEtablissements] = useState<EtablissementOption[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])

  // ─── Invitation state ───
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [cancelInviteTarget, setCancelInviteTarget] = useState<InvitationItem | null>(null)
  const [renvoyerTarget, setRenvoyerTarget] = useState<InvitationItem | null>(null)
  const [isRenvoying, setIsRenvoying] = useState(false)

  // ─── Import state ───
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importCsvData, setImportCsvData] = useState('')
  const [importRole, setImportRole] = useState('ETUDIANT')
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    errors: ImportError[]
    users: ImportResultUser[]
  } | null>(null)

  // ─── Fetch users ───
  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (roleFilter && roleFilter !== 'all') params.set('role', roleFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/users?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
        setTotal(data.total ?? 0)
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [search, roleFilter, statusFilter, page])

  // ─── Fetch etablissements & filieres ───
  const fetchOptions = useCallback(async () => {
    try {
      const [etabRes, filRes] = await Promise.all([
        fetch('/api/etablissements'),
        fetch('/api/filieres'),
      ])
      if (etabRes.ok) {
        const data = await etabRes.json()
        setEtablissements((data.etablissements ?? []).map((e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })))
      }
      if (filRes.ok) {
        const data = await filRes.json()
        setFilieres((data.filieres ?? []).map((f: { id: string; nom: string; etablissementId: string }) => ({ id: f.id, nom: f.nom, etablissementId: f.etablissementId })))
      }
    } catch {
      // Silent
    }
  }, [])

  // ─── Fetch invitations ───
  const fetchInvitations = useCallback(async () => {
    setInvitationsLoading(true)
    try {
      const res = await fetch('/api/invitations?limit=50')
      if (res.ok) {
        const data = await res.json()
        setInvitations(data.invitations ?? [])
      }
    } catch {
      // Silent
    } finally {
      setInvitationsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchOptions()
    fetchInvitations()
  }, [fetchOptions, fetchInvitations])

  // ─── Filtered filieres based on selected etablissement ───
  const filteredFilieres = formEtablissementId
    ? filieres.filter((f) => f.etablissementId === formEtablissementId)
    : filieres

  // ─── Stats ───
  const totalUsers = total
  const actifCount = users.filter((u) => u.actif).length
  const inactifCount = users.filter((u) => !u.actif).length
  const adminCount = users.filter((u) => u.role === 'ADMIN').length
  const respCount = users.filter((u) => u.role === 'RESPONSABLE').length
  const ensCount = users.filter((u) => u.role === 'ENSEIGNANT').length
  const etuCount = users.filter((u) => u.role === 'ETUDIANT').length
  const avecEtablissementCount = users.filter((u) => u.etablissementId !== null).length

  const totalPages = Math.ceil(total / limit)

  // ─── Reset form ───
  const resetForm = () => {
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole(defaultCreateRole)
    setFormEtablissementId('')
    setFormFiliereId('')
    setFormActif(true)
    setFormMatricule('')
    setInvitationResult(null)
    setCopiedToken(false)
    setCopiedCredentials(false)
  }

  // ─── Open create dialog (direct mode) ───
  const handleOpenCreate = () => {
    setEditingUser(null)
    resetForm()
    setFormRole(defaultCreateRole)
    setRegistrationMode('direct')
    setCreateDialogOpen(true)
  }

  // ─── Open invite dialog (invitation mode) ───
  const handleOpenInvite = () => {
    setEditingUser(null)
    resetForm()
    setFormRole(defaultCreateRole)
    setRegistrationMode('invitation')
    setCreateDialogOpen(true)
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (target: UserItem) => {
    setEditingUser(target)
    setFormName(target.name)
    setFormEmail(target.email)
    setFormPassword('')
    setFormRole(target.role)
    setFormEtablissementId(target.etablissementId ?? '')
    setFormFiliereId(target.filiereId ?? '')
    setFormActif(target.actif)
    setFormMatricule('')
    setCreateDialogOpen(true)
  }

  // ─── Submit create/edit (existing edit mode) ───
  const handleSubmit = async () => {
    if (editingUser) {
      // Edit existing user
      if (!formName || !formEmail) {
        toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
        return
      }

      setIsSubmitting(true)
      try {
        const body: Record<string, unknown> = {
          name: formName,
          email: formEmail,
          role: formRole,
          etablissementId: formEtablissementId || null,
          filiereId: formFiliereId || null,
          actif: formActif,
        }

        if (formPassword) body.password = formPassword
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la modification')
        }
        toast.success('Utilisateur modifié', { description: `${formName} a été mis à jour.` })
        setCreateDialogOpen(false)
        await fetchUsers()
      } catch (err) {
        toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // ─── Invitation mode ───
    if (registrationMode === 'invitation') {
      if (!formEmail.trim()) {
        toast.error('Champ requis', { description: 'L\'email est obligatoire.' })
        return
      }
      if (isEtablissementRequired && !formEtablissementId) {
        toast.error('Établissement requis', { description: 'Un responsable doit être rattaché à un établissement.' })
        return
      }
      if (!user?.id) {
        toast.error('Erreur', { description: 'Vous devez être connecté pour envoyer une invitation.' })
        return
      }

      setIsSubmitting(true)
      try {
        const body: Record<string, unknown> = {
          email: formEmail.trim(),
          role: formRole,
          createdById: user.id,
        }
        if (formName.trim()) body.name = formName.trim()
        if (formEtablissementId) body.etablissementId = formEtablissementId
        if (formFiliereId) body.filiereId = formFiliereId

        const res = await fetch('/api/invitations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de l\'invitation')
        }

        const etabName = formEtablissementId
          ? etablissements.find((e) => e.id === formEtablissementId)?.nom
          : null

        toast.success('Invitation envoyée', {
          description: etabName
            ? `Invitation envoyée à ${formEmail} pour l'établissement ${etabName}. Valable 48h.`
            : `Invitation envoyée à ${formEmail}. Valable 48h.`,
        })

        // Show the invitation token for testing
        setInvitationResult({ email: formEmail, token: data.token })
        setCopiedToken(false)

        await fetchInvitations()
      } catch (err) {
        toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // ─── Direct creation mode ───
    if (registrationMode === 'direct') {
      if (!formName.trim() || !formEmail.trim()) {
        toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
        return
      }
      if (isEtablissementRequired && !formEtablissementId) {
        toast.error('Établissement requis', { description: 'Un responsable doit être rattaché à un établissement.' })
        return
      }

      setIsSubmitting(true)
      try {
        const body: Record<string, unknown> = {
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          etablissementId: formEtablissementId || null,
          filiereId: formFiliereId || null,
          mode: 'direct',
        }
        if (formMatricule.trim()) body.matricule = formMatricule.trim()

        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de la création')
        }

        // Show the direct creation result dialog
        setDirectCreationResult({
          email: formEmail.trim(),
          temporaryPassword: data.temporaryPassword,
        })
        setCreateDialogOpen(false)
        setDirectResultDialogOpen(true)
        setCopiedCredentials(false)

        await fetchUsers()
      } catch (err) {
        toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  // ─── Toggle user active status ───
  const handleToggleActive = async (target: UserItem) => {
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !target.actif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(target.actif ? 'Utilisateur désactivé' : 'Utilisateur activé', {
        description: `${target.name} est maintenant ${target.actif ? 'inactif' : 'actif'}.`,
      })
      await fetchUsers()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Delete user ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { },
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Utilisateur supprimé', { description: `${deleteTarget.name} a été supprimé.` })
      setDeleteTarget(null)
      await fetchUsers()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer l\'utilisateur.' })
    }
  }

  // ─── Cancel invitation ───
  const handleCancelInvitation = async () => {
    if (!cancelInviteTarget) return
    try {
      const res = await fetch(`/api/invitations/${cancelInviteTarget.id}`, {
        method: 'DELETE',
        headers: { },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success('Invitation annulée', {
        description: `L'invitation pour ${cancelInviteTarget.email} a été annulée.`,
      })
      setCancelInviteTarget(null)
      await fetchInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible d\'annuler l\'invitation.' })
    }
  }

  // ─── Renvoyer invitation ───
  const handleRenvoyerInvitation = async () => {
    if (!renvoyerTarget) return
    setIsRenvoying(true)
    try {
      const res = await fetch(`/api/invitations/${renvoyerTarget.id}/renvoyer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du renvoi')
      }
      toast.success('Invitation renvoyée', {
        description: `Une nouvelle invitation a été envoyée à ${renvoyerTarget.email}. Valable 48h.`,
      })
      setRenvoyerTarget(null)
      await fetchInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de renvoyer l\'invitation.' })
    } finally {
      setIsRenvoying(false)
    }
  }

  // ─── Submit import ───
  const handleImportSubmit = async () => {
    if (!importCsvData.trim()) {
      toast.error('Champ requis', { description: 'Veuillez saisir les données CSV.' })
      return
    }

    const lines = importCsvData.trim().split('\n').filter((l) => l.trim())
    const usersToImport: { email: string; name: string }[] = []
    const parseErrors: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(',').map((s) => s.trim())
      if (parts.length < 2) {
        parseErrors.push(`Ligne ${i + 1}: format invalide (email,nom requis)`)
        continue
      }
      const [email, name] = parts
      if (!email || !name) {
        parseErrors.push(`Ligne ${i + 1}: email et nom sont requis`)
        continue
      }
      usersToImport.push({ email, name })
    }

    if (parseErrors.length > 0) {
      toast.error('Erreurs de format', {
        description: parseErrors.slice(0, 3).join('. ') + (parseErrors.length > 3 ? ` ... et ${parseErrors.length - 3} autres.` : ''),
      })
      if (usersToImport.length === 0) return
    }

    setImportSubmitting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: usersToImport,
          role: importRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'import')
      }
      setImportResult(data)
      toast.success('Import terminé', {
        description: `${data.imported} utilisateur(s) importé(s) sur ${usersToImport.length}.`,
      })
      await fetchUsers()
      await fetchInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'import.' })
    } finally {
      setImportSubmitting(false)
    }
  }

  // ─── Open import dialog ───
  const handleOpenImport = () => {
    setImportCsvData('')
    setImportRole(defaultCreateRole)
    setImportResult(null)
    setImportDialogOpen(true)
  }

  // ─── Reset page when filters change ───
  useEffect(() => {
    setPage(1)
  }, [search, roleFilter, statusFilter])

  // ─── Role restrictions based on current user ───
  const isAdmin = user?.role === 'ADMIN'
  const isResponsable = user?.role === 'RESPONSABLE'

  /** Roles that the current user can create */
  const allowedCreateRoles = isAdmin
    ? ['RESPONSABLE']
    : isResponsable
      ? ['ENSEIGNANT', 'ETUDIANT']
      : ['ETUDIANT']

  /** Default role when opening the create dialog */
  const defaultCreateRole = isAdmin ? 'RESPONSABLE' : isResponsable ? 'ENSEIGNANT' : 'ETUDIANT'

  /** Whether etablissement is required for the currently selected role */
  const isEtablissementRequired = formRole === 'RESPONSABLE'

  // ─── Categorized invitations ───
  const pendingInvitations = invitations.filter((inv) => getInvitationStatus(inv) === 'pending')
  const expiredInvitations = invitations.filter((inv) => getInvitationStatus(inv) === 'expired')
  const usedInvitations = invitations.filter((inv) => getInvitationStatus(inv) === 'used')

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Users className="h-7 w-7 text-emerald-600" />
            {isAdmin ? 'Gestion des Responsables' : 'Gestion des Utilisateurs'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? 'Gérez les comptes responsables des établissements clients' : 'Créez, modifiez et gérez les comptes utilisateurs'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAdmin && (
            <Button variant="outline" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" onClick={handleOpenImport}>
              <FileUp className="h-4 w-4" />
              Importer
            </Button>
          )}
          <Button variant="outline" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" onClick={handleOpenInvite}>
            <Mail className="h-4 w-4" />
            {isAdmin ? 'Inviter un responsable' : 'Inviter'}
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
            <UserPlus className="h-4 w-4" />
            {isAdmin ? 'Nouveau responsable' : 'Nouvel utilisateur'}
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
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <UserCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <UserX className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inactifs</p>
              <p className="text-xl font-bold">{inactifCount}</p>
            </div>
          </CardContent>
        </Card>
        {isAdmin ? (
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avec établissement</p>
                <p className="text-xl font-bold">{avecEtablissementCount}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Par rôle</p>
                <p className="text-sm font-semibold">
                  <span className="text-rose-600">{adminCount}A</span>{' '}
                  <span className="text-amber-600">{respCount}R</span>{' '}
                  <span className="text-emerald-600">{ensCount}E</span>{' '}
                  <span className="text-sky-600">{etuCount}É</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAdmin ? 'Tous' : 'Tous les rôles'}</SelectItem>
              {isAdmin && <SelectItem value="RESPONSABLE">Responsable</SelectItem>}
              {isResponsable && (
                <>
                  <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                  <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                </>
              )}
              {!isAdmin && !isResponsable && (
                <>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="RESPONSABLE">Responsable</SelectItem>
                  <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                  <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="actif">Actif</SelectItem>
              <SelectItem value="inactif">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && users.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Users className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{isAdmin ? 'Aucun responsable trouvé' : 'Aucun utilisateur trouvé'}</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || roleFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : isAdmin
                ? 'Commencez par créer votre premier responsable.'
                : 'Commencez par créer votre premier utilisateur.'}
          </p>
          {!search && roleFilter === 'all' && statusFilter === 'all' && (
            <div className="flex gap-2 mt-6">
              {!isAdmin && (
                <Button variant="outline" className="border-emerald-200 dark:border-emerald-800" onClick={handleOpenImport}>
                  <FileUp className="h-4 w-4" />
                  Importer
                </Button>
              )}
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
                <UserPlus className="h-4 w-4" />
                {isAdmin ? 'Créer un responsable' : 'Créer un utilisateur'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Users table ─── */}
      {!isLoading && users.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Avatar</TableHead>
                  <TableHead>Nom complet</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="hidden lg:table-cell">Établissement</TableHead>
                  {!isAdmin && <TableHead className="hidden lg:table-cell">Filière</TableHead>}
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden sm:table-cell">Dernière connexion</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="group">
                    <TableCell>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(u.role)}`}>
                        {getInitials(u.name)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        <p className="font-semibold">{u.name}</p>
                        <p className="text-xs text-muted-foreground md:hidden">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {u.email}
                      </span>
                    </TableCell>
                    <TableCell>{getRoleBadge(u.role)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {u.etablissement ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {u.etablissement.nom}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    {!isAdmin && (
                      <TableCell className="hidden lg:table-cell">
                        {u.filiere ? (
                          <span className="flex items-center gap-1 text-sm">
                            <GraduationCap className="h-3 w-3 text-muted-foreground" />
                            {u.filiere.nom}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {u.actif ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Actif</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">Inactif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRelativeDate(u.derniereConnexion)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(u)}>
                            <Edit3 className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(u)}>
                            {u.actif ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Désactiver
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activer
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ─── Pagination ─── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} sur {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <span className="text-sm font-medium">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Invitations Section ─── */}
      {!isLoading && invitations.length > 0 && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Invitations
              {pendingInvitations.length > 0 && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800 ml-1">
                  {pendingInvitations.length} en attente
                </Badge>
              )}
              {expiredInvitations.length > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 ml-1">
                  {expiredInvitations.length} expirée(s)
                </Badge>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gérez les invitations envoyées aux futurs utilisateurs
            </p>
          </div>

          {invitationsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="hidden md:table-cell">Nom</TableHead>
                      <TableHead className="hidden lg:table-cell">Établissement</TableHead>
                      <TableHead>Date d&apos;envoi</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Pending invitations */}
                    {pendingInvitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {inv.email}
                          </span>
                        </TableCell>
                        <TableCell>{getRoleBadge(inv.role)}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {inv.name || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {inv.Etablissement ? inv.Etablissement.nom : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>{formatDate(inv.createdAt)}</div>
                          <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getExpiryCountdown(inv.expiresAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getInvitationStatusBadge('pending')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            onClick={() => setCancelInviteTarget(inv)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Annuler
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Expired invitations */}
                    {expiredInvitations.map((inv) => (
                      <TableRow key={inv.id} className="opacity-70">
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {inv.email}
                          </span>
                        </TableCell>
                        <TableCell>{getRoleBadge(inv.role)}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {inv.name || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {inv.Etablissement ? inv.Etablissement.nom : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.createdAt)}
                        </TableCell>
                        <TableCell>
                          {getInvitationStatusBadge('expired')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                              onClick={() => setRenvoyerTarget(inv)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Renvoyer
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                              onClick={() => setCancelInviteTarget(inv)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Used invitations */}
                    {usedInvitations.map((inv) => (
                      <TableRow key={inv.id} className="opacity-50">
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {inv.email}
                          </span>
                        </TableCell>
                        <TableCell>{getRoleBadge(inv.role)}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {inv.name || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {inv.Etablissement ? inv.Etablissement.nom : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.createdAt)}
                        </TableCell>
                        <TableCell>
                          {getInvitationStatusBadge('used')}
                        </TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Create/Edit User Dialog (with dual toggle) ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateDialogOpen(false)
          setInvitationResult(null)
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? (
                <>
                  <Users className="h-5 w-5 text-emerald-600" />
                  {isAdmin ? 'Modifier le responsable' : 'Modifier l\'utilisateur'}
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  {isAdmin ? 'Nouveau responsable' : 'Nouvel utilisateur'}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? isAdmin ? 'Modifiez les informations du responsable.' : 'Modifiez les informations de l\'utilisateur.'
                : 'Choisissez le mode de création du compte.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* ─── Registration Mode Toggle (only for new users) ─── */}
            {!editingUser && (
              <>
                <div className="flex rounded-lg border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium transition-all ${
                      registrationMode === 'invitation'
                        ? 'bg-emerald-600 text-white shadow-inner'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                    }`}
                    onClick={() => {
                      setRegistrationMode('invitation')
                      setInvitationResult(null)
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    Invitation par email
                  </button>
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium transition-all border-l border-emerald-200 dark:border-emerald-800 ${
                      registrationMode === 'direct'
                        ? 'bg-emerald-600 text-white shadow-inner'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                    }`}
                    onClick={() => {
                      setRegistrationMode('direct')
                      setInvitationResult(null)
                    }}
                  >
                    <Zap className="h-4 w-4" />
                    Création directe
                  </button>
                </div>

                {/* Mode description */}
                {registrationMode === 'invitation' && (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                    <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Un email d&apos;invitation sera envoyé à l&apos;utilisateur. Il devra cliquer sur le lien et définir son propre mot de passe. Le lien est valable <strong>48 heures</strong>.
                    </p>
                  </div>
                )}

                {registrationMode === 'direct' && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Un mot de passe temporaire sera généré automatiquement. L&apos;utilisateur devra le changer à sa première connexion.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ─── Edit mode fields ─── */}
            {editingUser && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="user-name">Nom complet *</Label>
                  <Input
                    id="user-name"
                    placeholder="Ex: Jean Dupont"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-email">Email *</Label>
                  <Input
                    id="user-email"
                    type="email"
                    placeholder="Ex: jean@sect.fr"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-password-edit">Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
                  <Input
                    id="user-password-edit"
                    type="password"
                    placeholder="Laisser vide pour conserver"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-role">Rôle *</Label>
                  <Select value={formRole} onValueChange={setFormRole}>
                    <SelectTrigger id="user-role">
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {isAdmin ? (
                        <SelectItem value="RESPONSABLE">Responsable</SelectItem>
                      ) : isResponsable ? (
                        <>
                          <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                          <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                          <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-etablissement">
                    Établissement {isEtablissementRequired ? '*' : ''}
                  </Label>
                  <Select
                    value={formEtablissementId}
                    onValueChange={(val) => {
                      setFormEtablissementId(val)
                      setFormFiliereId('')
                    }}
                  >
                    <SelectTrigger id="user-etablissement">
                      <SelectValue placeholder="Sélectionner un établissement" />
                    </SelectTrigger>
                    <SelectContent>
                      {etablissements.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="user-filiere">Filière</Label>
                    <Select value={formFiliereId} onValueChange={setFormFiliereId}>
                      <SelectTrigger id="user-filiere">
                        <SelectValue placeholder="Sélectionner une filière" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredFilieres.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="user-actif"
                    checked={formActif}
                    onCheckedChange={(checked) => setFormActif(checked === true)}
                  />
                  <Label htmlFor="user-actif" className="cursor-pointer">
                    Compte actif
                  </Label>
                </div>
              </>
            )}

            {/* ─── Invitation mode fields ─── */}
            {!editingUser && registrationMode === 'invitation' && !invitationResult && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="utilisateur@universite.fr"
                      className="pl-9"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-role">Rôle *</Label>
                  <Select value={formRole} onValueChange={setFormRole} disabled={allowedCreateRoles.length === 1}>
                    <SelectTrigger id="invite-role">
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedCreateRoles.includes('RESPONSABLE') && <SelectItem value="RESPONSABLE">Responsable</SelectItem>}
                      {allowedCreateRoles.includes('ENSEIGNANT') && <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>}
                      {allowedCreateRoles.includes('ETUDIANT') && <SelectItem value="ETUDIANT">Étudiant</SelectItem>}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      En tant qu&apos;admin, vous ne pouvez créer que des responsables.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-name">Nom (optionnel)</Label>
                  <Input
                    id="invite-name"
                    placeholder="Ex: Jean Dupont"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    L&apos;utilisateur pourra le définir lui-même lors de l&apos;acceptation.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-etablissement">
                    Établissement {isEtablissementRequired ? '*' : '(optionnel)'}
                  </Label>
                  <Select
                    value={formEtablissementId}
                    onValueChange={(val) => {
                      setFormEtablissementId(val)
                      setFormFiliereId('')
                    }}
                  >
                    <SelectTrigger id="invite-etablissement">
                      <SelectValue placeholder="Sélectionner un établissement" />
                    </SelectTrigger>
                    <SelectContent>
                      {etablissements.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEtablissementRequired && !formEtablissementId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Un responsable doit être rattaché à un établissement
                    </p>
                  )}
                </div>

                {!isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="invite-filiere">Filière (optionnel)</Label>
                    <Select value={formFiliereId} onValueChange={setFormFiliereId}>
                      <SelectTrigger id="invite-filiere">
                        <SelectValue placeholder="Sélectionner une filière" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredFilieres.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* ─── Invitation result (after successful send) ─── */}
            {!editingUser && registrationMode === 'invitation' && invitationResult && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Invitation envoyée avec succès</span>
                </div>

                <p className="text-sm text-muted-foreground">
                  L&apos;invitation a été envoyée à <strong>{invitationResult.email}</strong>. Le lien est valable <strong>48 heures</strong>.
                </p>

                <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Lien d&apos;invitation (pour test) :
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 border break-all">
                      {invitationResult.token}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(invitationResult.token)
                        setCopiedToken(true)
                        toast.success('Copié', { description: 'Token copié dans le presse-papier.' })
                        setTimeout(() => setCopiedToken(false), 2000)
                      }}
                    >
                      {copiedToken ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Direct creation mode fields ─── */}
            {!editingUser && registrationMode === 'direct' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="direct-name">Nom complet *</Label>
                  <Input
                    id="direct-name"
                    placeholder="Ex: Jean Dupont"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="direct-email"
                      type="email"
                      placeholder="utilisateur@universite.fr"
                      className="pl-9"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-role">Rôle *</Label>
                  <Select value={formRole} onValueChange={setFormRole} disabled={allowedCreateRoles.length === 1}>
                    <SelectTrigger id="direct-role">
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedCreateRoles.includes('RESPONSABLE') && <SelectItem value="RESPONSABLE">Responsable</SelectItem>}
                      {allowedCreateRoles.includes('ENSEIGNANT') && <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>}
                      {allowedCreateRoles.includes('ETUDIANT') && <SelectItem value="ETUDIANT">Étudiant</SelectItem>}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      En tant qu&apos;admin, vous ne pouvez créer que des responsables.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-etablissement">
                    Établissement {isEtablissementRequired ? '*' : '(optionnel)'}
                  </Label>
                  <Select
                    value={formEtablissementId}
                    onValueChange={(val) => {
                      setFormEtablissementId(val)
                      setFormFiliereId('')
                    }}
                  >
                    <SelectTrigger id="direct-etablissement">
                      <SelectValue placeholder="Sélectionner un établissement" />
                    </SelectTrigger>
                    <SelectContent>
                      {etablissements.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEtablissementRequired && !formEtablissementId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Un responsable doit être rattaché à un établissement
                    </p>
                  )}
                </div>

                {!isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="direct-filiere">Filière (optionnel)</Label>
                    <Select value={formFiliereId} onValueChange={setFormFiliereId}>
                      <SelectTrigger id="direct-filiere">
                        <SelectValue placeholder="Sélectionner une filière" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredFilieres.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="direct-matricule">Matricule (optionnel)</Label>
                  <Input
                    id="direct-matricule"
                    placeholder="Ex: 2024-001"
                    value={formMatricule}
                    onChange={(e) => setFormMatricule(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            {/* ─── Invitation result footer ─── */}
            {!editingUser && registrationMode === 'invitation' && invitationResult && (
              <>
                <Button variant="outline" onClick={() => {
                  setCreateDialogOpen(false)
                  setInvitationResult(null)
                }}>
                  Fermer
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    resetForm()
                    setRegistrationMode('invitation')
                  }}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Nouvelle invitation
                </Button>
              </>
            )}

            {/* ─── Edit mode footer ─── */}
            {editingUser && (
              <>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enregistrer
                </Button>
              </>
            )}

            {/* ─── Invitation mode form footer ─── */}
            {!editingUser && registrationMode === 'invitation' && !invitationResult && (
              <>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Envoyer l&apos;invitation
                    </>
                  )}
                </Button>
              </>
            )}

            {/* ─── Direct creation mode footer ─── */}
            {!editingUser && registrationMode === 'direct' && (
              <>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Créer le compte
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Direct Creation Result Dialog ─── */}
      <Dialog open={directResultDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDirectResultDialogOpen(false)
          setDirectCreationResult(null)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Compte créé avec succès
            </DialogTitle>
            <DialogDescription>
              Transmettez ces identifiants à l&apos;utilisateur de manière sécurisée.
            </DialogDescription>
          </DialogHeader>

          {directCreationResult && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {directCreationResult.email}
                  </p>
                </div>

                <Separator />

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    Mot de passe temporaire
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-background rounded px-3 py-2 border font-mono break-all">
                      {directCreationResult.temporaryPassword}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(directCreationResult.temporaryPassword)
                        toast.success('Copié', { description: 'Mot de passe copié dans le presse-papier.' })
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  L&apos;utilisateur devra changer ce mot de passe à sa première connexion. Transmettez ces identifiants de manière sécurisée.
                </p>
              </div>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const credentials = `Email: ${directCreationResult.email}\nMot de passe: ${directCreationResult.temporaryPassword}`
                  navigator.clipboard.writeText(credentials)
                  setCopiedCredentials(true)
                  toast.success('Identifiants copiés', { description: 'Email et mot de passe copiés dans le presse-papier.' })
                  setTimeout(() => setCopiedCredentials(false), 2000)
                }}
              >
                {copiedCredentials ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copié !
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copier les identifiants
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Import Users Dialog ─── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) setImportDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-emerald-600" />
              Importer des utilisateurs
            </DialogTitle>
            <DialogDescription>
              Importez plusieurs utilisateurs en une seule opération via un format CSV.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="import-role">Rôle par défaut</Label>
              <Select value={importRole} onValueChange={setImportRole}>
                <SelectTrigger id="import-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedCreateRoles.includes('ETUDIANT') && <SelectItem value="ETUDIANT">Étudiant</SelectItem>}
                  {allowedCreateRoles.includes('ENSEIGNANT') && <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>}
                  {allowedCreateRoles.includes('RESPONSABLE') && <SelectItem value="RESPONSABLE">Responsable</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tous les utilisateurs importés auront ce rôle
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-csv">Données CSV</Label>
              <Textarea
                id="import-csv"
                placeholder="email,nom&#10;jean.dupont@univ.fr,Jean Dupont&#10;marie.martin@univ.fr,Marie Martin"
                value={importCsvData}
                onChange={(e) => setImportCsvData(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Un utilisateur par ligne. Format : <code className="bg-muted px-1 py-0.5 rounded">email,nom</code>
              </p>
            </div>

            {/* Import result */}
            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Import terminé : {importResult.imported} utilisateur(s) créé(s)
                  </span>
                </div>

                {importResult.users.length > 0 && (
                  <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Nom</TableHead>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Mot de passe</TableHead>
                          <TableHead className="text-xs w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="text-xs font-medium">{u.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                            <TableCell className="text-xs font-mono">{u.password}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(u.password)
                                  toast.success('Copié', { description: 'Mot de passe copié dans le presse-papier.' })
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {importResult.errors.length} erreur(s)
                    </p>
                    <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>Ligne {e.row} ({e.email}): {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {importResult ? 'Fermer' : 'Annuler'}
            </Button>
            {!importResult && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleImportSubmit}
                disabled={importSubmitting}
              >
                {importSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4 mr-2" />
                    Importer
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) ?
              Cette action est irréversible. Toutes les données associées à cet utilisateur seront définitivement supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel Invitation Confirmation Dialog ─── */}
      <AlertDialog open={!!cancelInviteTarget} onOpenChange={(open) => { if (!open) setCancelInviteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler l&apos;invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler l&apos;invitation envoyée à <strong>{cancelInviteTarget?.email}</strong> ?
              Le lien d&apos;invitation ne sera plus utilisable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleCancelInvitation}
            >
              Confirmer l&apos;annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Renvoyer Invitation Confirmation Dialog ─── */}
      <AlertDialog open={!!renvoyerTarget} onOpenChange={(open) => { if (!open) setRenvoyerTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
              Renvoyer l&apos;invitation
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous renvoyer une invitation à <strong>{renvoyerTarget?.email}</strong> ?
              Un nouveau lien sera généré avec une validité de 48 heures. L&apos;ancien lien ne sera plus utilisable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleRenvoyerInvitation}
              disabled={isRenvoying}
            >
              {isRenvoying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renvoyer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
