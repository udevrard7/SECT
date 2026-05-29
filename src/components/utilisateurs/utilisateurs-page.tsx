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

  // ─── Form state ───
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('ETUDIANT')
  const [formEtablissementId, setFormEtablissementId] = useState('')
  const [formFiliereId, setFormFiliereId] = useState('')
  const [formActif, setFormActif] = useState(true)

  // ─── Options state ───
  const [etablissements, setEtablissements] = useState<EtablissementOption[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])

  // ─── Invitation state ───
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('ETUDIANT')
  const [inviteName, setInviteName] = useState('')
  const [inviteEtablissementId, setInviteEtablissementId] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [cancelInviteTarget, setCancelInviteTarget] = useState<InvitationItem | null>(null)

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

  const totalPages = Math.ceil(total / limit)

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole('ETUDIANT')
    setFormEtablissementId('')
    setFormFiliereId('')
    setFormActif(true)
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
    setCreateDialogOpen(true)
  }

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!formName || !formEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }
    if (!editingUser && !formPassword) {
      toast.error('Mot de passe requis', { description: 'Le mot de passe est obligatoire pour un nouvel utilisateur.' })
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

      if (editingUser) {
        // Edit
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
      } else {
        // Create
        body.password = formPassword
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Utilisateur créé', { description: `${formName} a été ajouté.` })
      }

      setCreateDialogOpen(false)
      await fetchUsers()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
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
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Utilisateur supprimé', { description: `${deleteTarget.name} a été supprimé.` })
      setDeleteTarget(null)
      await fetchUsers()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer l\'utilisateur.' })
    }
  }

  // ─── Submit invitation ───
  const handleInviteSubmit = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Champ requis', { description: 'L\'email est obligatoire.' })
      return
    }
    if (!user?.id) {
      toast.error('Erreur', { description: 'Vous devez être connecté pour envoyer une invitation.' })
      return
    }

    setInviteSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        email: inviteEmail.trim(),
        role: inviteRole,
        createdById: user.id,
      }
      if (inviteName.trim()) body.name = inviteName.trim()
      if (inviteEtablissementId) body.etablissementId = inviteEtablissementId

      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'invitation')
      }
      toast.success('Invitation envoyée', {
        description: `Une invitation a été envoyée à ${inviteEmail}.`,
      })
      setInviteDialogOpen(false)
      setInviteEmail('')
      setInviteRole('ETUDIANT')
      setInviteName('')
      setInviteEtablissementId('')
      await fetchInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setInviteSubmitting(false)
    }
  }

  // ─── Cancel invitation ───
  const handleCancelInvitation = async () => {
    if (!cancelInviteTarget) return
    try {
      const res = await fetch(`/api/invitations/${cancelInviteTarget.id}`, { method: 'DELETE' })
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

  // ─── Submit import ───
  const handleImportSubmit = async () => {
    if (!importCsvData.trim()) {
      toast.error('Champ requis', { description: 'Veuillez saisir les données CSV.' })
      return
    }

    // Parse CSV: email,name,role per line
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

  // ─── Open invite dialog ───
  const handleOpenInvite = () => {
    setInviteEmail('')
    setInviteRole('ETUDIANT')
    setInviteName('')
    setInviteEtablissementId('')
    setInviteDialogOpen(true)
  }

  // ─── Open import dialog ───
  const handleOpenImport = () => {
    setImportCsvData('')
    setImportRole('ETUDIANT')
    setImportResult(null)
    setImportDialogOpen(true)
  }

  // ─── Reset page when filters change ───
  useEffect(() => {
    setPage(1)
  }, [search, roleFilter, statusFilter])

  // ─── Pending invitations ───
  const pendingInvitations = invitations.filter((inv) => !inv.used)
  const usedInvitations = invitations.filter((inv) => inv.used)

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Users className="h-7 w-7 text-emerald-600" />
            Gestion des Utilisateurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez, modifiez et gérez les comptes utilisateurs
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" onClick={handleOpenImport}>
            <FileUp className="h-4 w-4" />
            Importer
          </Button>
          <Button variant="outline" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" onClick={handleOpenInvite}>
            <Send className="h-4 w-4" />
            Inviter
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Nouvel utilisateur
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
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="RESPONSABLE">Responsable</SelectItem>
              <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
              <SelectItem value="ETUDIANT">Étudiant</SelectItem>
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
          <h3 className="mt-4 text-lg font-semibold">Aucun utilisateur trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || roleFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par créer votre premier utilisateur.'}
          </p>
          {!search && roleFilter === 'all' && statusFilter === 'all' && (
            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="border-emerald-200 dark:border-emerald-800" onClick={handleOpenImport}>
                <FileUp className="h-4 w-4" />
                Importer
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Créer un utilisateur
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
                  <TableHead className="hidden lg:table-cell">Filière</TableHead>
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

      {/* ─── Pending Invitations Section ─── */}
      {!isLoading && invitations.length > 0 && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Invitations
              {pendingInvitations.length > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 ml-1">
                  {pendingInvitations.length} en attente
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
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                          {formatDate(inv.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                            En attente
                          </Badge>
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
                    {usedInvitations.map((inv) => (
                      <TableRow key={inv.id} className="opacity-60">
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
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                            Utilisée
                          </Badge>
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

      {/* ─── Create/Edit User Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) setCreateDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
            </DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modifiez les informations de l\'utilisateur.' : 'Remplissez les informations pour créer un nouveau compte.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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

            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="user-password">Mot de passe *</Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder="Minimum 8 caractères"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
            )}

            {editingUser && (
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
            )}

            <div className="space-y-2">
              <Label htmlFor="user-role">Rôle *</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger id="user-role">
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="RESPONSABLE">Responsable</SelectItem>
                  <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                  <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-etablissement">Établissement</Label>
              <Select
                value={formEtablissementId}
                onValueChange={(val) => {
                  setFormEtablissementId(val)
                  setFormFiliereId('') // Reset filiere when etablissement changes
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
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingUser ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Invite User Dialog ─── */}
      <Dialog open={inviteDialogOpen} onOpenChange={(open) => { if (!open) setInviteDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Inviter un utilisateur
            </DialogTitle>
            <DialogDescription>
              Envoyez une invitation par email. Le destinataire pourra créer son compte avec le rôle choisi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="utilisateur@universite.fr"
                  className="pl-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Rôle *</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="RESPONSABLE">Responsable</SelectItem>
                  <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
                  <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-name">Nom (optionnel)</Label>
              <Input
                id="invite-name"
                placeholder="Ex: Jean Dupont"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-etablissement">Établissement (optionnel)</Label>
              <Select value={inviteEtablissementId} onValueChange={setInviteEtablissementId}>
                <SelectTrigger id="invite-etablissement">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  {etablissements.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleInviteSubmit}
              disabled={inviteSubmitting}
            >
              {inviteSubmitting ? (
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
          </DialogFooter>
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
                  <SelectItem value="ETUDIANT">Étudiant</SelectItem>
                  <SelectItem value="ENSEIGNANT">Enseignant</SelectItem>
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
    </div>
  )
}
