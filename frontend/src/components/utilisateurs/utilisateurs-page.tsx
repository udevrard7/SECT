'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { ErrorState } from '@/components/shared/error-state'
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
import { PulseSkeleton } from '@/components/ds'
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

// BUG #1 fix (audit E2E) : validation email côté client.
// Même regex que le backend (internal/usecase/user.go isValidEmail) :
// ^[^\s@]+@[^\s@]+\.[^\s@]+$ → local@domain.tld
// Avant : aucun check client → l'admin remplissait l'étab avant de
// découvrir que l'email était invalide (aller-retour inutile + toast
// générique "Erreur — email invalide"). Maintenant : validation inline
// au submit + message sous le champ + aria-invalid (accessibilité).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(s: string): boolean {
  return EMAIL_REGEX.test(s.trim())
}

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
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30 ">Admin</Badge>
    case 'RESPONSABLE':
      return <Badge className="bg-warning/15 text-warning border-warning/30 ">Responsable</Badge>
    case 'ENSEIGNANT':
      return <Badge className="bg-success/15 text-success-text border-success/30 ">Enseignant</Badge>
    case 'ETUDIANT':
      return <Badge className="bg-info/15 text-info border-info/30 ">Étudiant</Badge>
    default:
      return <Badge variant="outline">{role}</Badge>
  }
}

function getAvatarColor(role: string): string {
  switch (role) {
    case 'ADMIN': return 'bg-destructive/100'
    case 'RESPONSABLE': return 'bg-warning/100'
    case 'ENSEIGNANT': return 'bg-success'
    case 'ETUDIANT': return 'bg-info/100'
    default: return 'bg-muted/500'
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
      return <Badge className="bg-info/15 text-info border-info/30">En attente</Badge>
    case 'used':
      return <Badge className="bg-success/15 text-success-text border-success/30 ">Utilisée</Badge>
    case 'expired':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30 ">Expirée</Badge>
  }
}

// ─── Main Component ───

export function UtilisateursPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // ─── Data state ───
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
  // UF6/F11: état isDeleting pour empêcher la fermeture auto de l'AlertDialog
  // pendant la mutation DELETE (fire-and-forget → bouton disabled + preventDefault).
  const [isDeleting, setIsDeleting] = useState(false)
  // UF7/F22: toggleTarget pour l'AlertDialog de confirmation avant toggle actif.
  const [toggleTarget, setToggleTarget] = useState<UserItem | null>(null)

  // isAdmin/isResponsable déclarés ici pour être disponibles dans toute la fonction.
  const isAdmin = user?.role === 'ADMIN'
  const isResponsable = user?.role === 'RESPONSABLE'

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
  const [emailError, setEmailError] = useState('')

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
  // (Migration useEffect+fetch → useQuery. Voir plus bas.)

  // ─── Invitation state ───
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

  // ─── Fetch users (TanStack Query) ───
  // Migration useEffect+fetch → useQuery. Le cache survit au démontage :
  // 0 refetch au retour navigation. staleTime 60s. Le filtrage et la
  // pagination se font côté serveur (queryKey inclut search + filtres + page).
  const usersQuery = useQuery<{ users: UserItem[]; total: number }>({
    queryKey: ['utilisateurs', search, roleFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (roleFilter && roleFilter !== 'all') params.set('role', roleFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/users?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const users = usersQuery.data?.users ?? []
  const total = usersQuery.data?.total ?? 0
  const isLoading = usersQuery.isLoading

  // Helper pour invalider le cache après mutation (create/update/delete/import)
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ['utilisateurs'] })

  // ─── Fetch etablissements & filieres (TanStack Query) ───
  // Options pour les dropdowns du formulaire. One-shot (deps []), staleTime
  // 5 min car ces données changent rarement.
  const optionsQuery = useQuery<{
    etablissements: EtablissementOption[]
    filieres: FiliereOption[]
  }>({
    queryKey: ['utilisateurs-options'],
    queryFn: async () => {
      const [etabRes, filRes] = await Promise.all([
        fetch('/api/etablissements'),
        fetch('/api/filieres'),
      ])
      const etablissements: EtablissementOption[] = []
      const filieres: FiliereOption[] = []
      if (etabRes.ok) {
        const data = await etabRes.json()
        etablissements.push(...(data.etablissements ?? []).map((e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })))
      }
      if (filRes.ok) {
        const data = await filRes.json()
        filieres.push(...(data.filieres ?? []).map((f: { id: string; nom: string; etablissementId: string }) => ({ id: f.id, nom: f.nom, etablissementId: f.etablissementId })))
      }
      return { etablissements, filieres }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etablissements = optionsQuery.data?.etablissements ?? []
  const filieres = optionsQuery.data?.filieres ?? []

  // ─── Fetch invitations (TanStack Query) ───
  const invitationsQuery = useQuery<{ invitations: InvitationItem[] }>({
    queryKey: ['utilisateurs-invitations'],
    queryFn: async () => {
      const res = await fetch('/api/invitations?limit=50')
      if (!res.ok) throw new Error('Failed to fetch invitations')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const invitations = invitationsQuery.data?.invitations ?? []
  const invitationsLoading = invitationsQuery.isLoading

  // Helper pour invalider le cache des invitations après mutation (create/cancel/renvoyer)
  const refreshInvitations = () => queryClient.invalidateQueries({ queryKey: ['utilisateurs-invitations'] })

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
    setEmailError('')
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
    setEmailError('')
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
      // BUG #1 fix : validation format email côté client (edit mode)
      if (!isValidEmail(formEmail)) {
        const msg = 'Adresse email invalide (format attendu : nom@universite.fr)'
        setEmailError(msg)
        toast.error('Email invalide', { description: msg })
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
        refreshUsers()
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
      // BUG #1 fix : validation format email côté client (invitation mode)
      if (!isValidEmail(formEmail)) {
        const msg = 'Adresse email invalide (format attendu : nom@universite.fr)'
        setEmailError(msg)
        toast.error('Email invalide', { description: msg })
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
            ? `Invitation envoyée à ${formEmail} pour l'établissement ${etabName}. Valable 7 jours.`
            : `Invitation envoyée à ${formEmail}. Valable 7 jours.`,
        })

        // Show the invitation token for testing
        setInvitationResult({ email: formEmail, token: data.token })
        setCopiedToken(false)

        refreshInvitations()
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
      // BUG #1 fix : validation format email côté client (direct mode).
      // Placé AVANT le check établissement pour éviter un aller-retour inutile
      // (l'admin découvrait l'email invalide seulement après avoir sélectionné
      // l'établissement, car le check étab se déclenchait avant).
      if (!isValidEmail(formEmail)) {
        const msg = 'Adresse email invalide (format attendu : nom@universite.fr)'
        setEmailError(msg)
        toast.error('Email invalide', { description: msg })
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

        // BUG #2 fix (audit E2E) : reset recherche + pagination pour que le nouveau
        // user apparaisse dans la liste. Avant, si une recherche était active au
        // moment de la création (ex: "zzz"), le nouveau user ne matchait pas le
        // filtre → la liste restait vide → l'admin pensait que la création avait
        // échoué. + toast.success pour feedback persistant (le dialog DirectResult
        // seul disparaît à la fermeture sans trace).
        setSearch('')
        setPage(1)
        toast.success('Utilisateur créé', { description: `${formName.trim()} a été créé avec succès.` })
        refreshUsers()
      } catch (err) {
        toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  // ─── Toggle user active status ───
  // UF7/F22: la mutation n'est déclenchée qu'après confirmation dans l'AlertDialog
  // (toggleTarget state). Avant ce fix, un clic sur "Désactiver" exécutait le PATCH
  // immédiatement sans garde — désactivation accidentelle trop facile.
  // UF8: extraction err.error du body backend au lieu d'un message générique.
  const handleToggleActive = async (target: UserItem) => {
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !target.actif }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success(target.actif ? 'Utilisateur désactivé' : 'Utilisateur activé', {
        description: `${target.name} est maintenant ${target.actif ? 'inactif' : 'actif'}.`,
      })
      refreshUsers()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de modifier le statut.' })
    }
  }

  // Appelé par l'AlertDialog de confirmation (UF7).
  const confirmToggleActive = async () => {
    if (!toggleTarget) return
    await handleToggleActive(toggleTarget)
    setToggleTarget(null)
  }

  // ─── Delete user ───
  // UF6/F11: isDeleting + e.preventDefault() pour empêcher la fermeture auto de
  // l'AlertDialog pendant la mutation. Boutons disabled + extraction err.error (UF8).
  const handleDelete = async (e?: React.SyntheticEvent) => {
    e?.preventDefault()
    if (!deleteTarget || isDeleting) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success('Utilisateur supprimé', { description: `${deleteTarget.name} a été supprimé.` })
      setDeleteTarget(null)
      refreshUsers()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de supprimer l\'utilisateur.' })
    } finally {
      setIsDeleting(false)
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
      refreshInvitations()
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
        description: `Une nouvelle invitation a été envoyée à ${renvoyerTarget.email}. Valable 7 jours.`,
      })
      setRenvoyerTarget(null)
      refreshInvitations()
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
      refreshUsers()
      refreshInvitations()
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

  // isAdmin/isResponsable déclarés en haut du composant (UF2 garde de rôle).

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

  // UF2 (HIGH): garde de rôle UI — la page /utilisateurs est réservée à ADMIN et RESPONSABLE.
  // Un ETUDIANT/ENSEIGNANT qui tape l'URL directement voit un message au lieu d'une
  // page vide trompeuse. Le backend renvoie 403, mais on évite le flash de contenu.
  // Placé après tous les hooks (rules-of-hooks).
  if (!isAdmin && !isResponsable) {
    return (
      <div className="space-y-6">
        <ErrorState
          message="Cette page est réservée aux administrateurs et responsables. Votre rôle ne vous permet pas d'accéder à la gestion des utilisateurs."
          onRetry={() => window.history.back()}
          retryLabel="Retour"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Users className="h-7 w-7 text-success-text" />
            {isAdmin ? 'Gestion des Responsables' : 'Gestion des Utilisateurs'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? 'Gérez les comptes responsables des établissements clients' : 'Créez, modifiez et gérez les comptes utilisateurs'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAdmin && (
            <Button variant="outline" className="border-success/30 text-success-text  hover:bg-success/10 " onClick={handleOpenImport}>
              <FileUp className="h-4 w-4" />
              Importer
            </Button>
          )}
          <Button className="" onClick={handleOpenCreate}>
            <UserPlus className="h-4 w-4" />
            {isAdmin ? 'Nouveau responsable' : 'Nouvel utilisateur'}
          </Button>
        </div>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <Users className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/15">
              <UserCheck className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted ">
              <UserX className="h-5 w-5 text-muted-foreground " />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inactifs</p>
              <p className="text-xl font-bold">{inactifCount}</p>
            </div>
          </CardContent>
        </Card>
        {isAdmin ? (
          <Card className="border-l-4 border-l-primary">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                <Building2 className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avec établissement</p>
                <p className="text-xl font-bold">{avecEtablissementCount}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-l-4 border-l-primary">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                <Shield className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Par rôle</p>
                <p className="text-sm font-semibold">
                  <span className="text-destructive">{adminCount}A</span>{' '}
                  <span className="text-warning">{respCount}R</span>{' '}
                  <span className="text-success-text">{ensCount}E</span>{' '}
                  <span className="text-info">{etuCount}É</span>
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
              <PulseSkeleton className="h-10 w-10" variant="circle" />
              <div className="flex-1 space-y-2">
                <PulseSkeleton className="h-4 w-48" />
                <PulseSkeleton className="h-3 w-32" />
              </div>
              <PulseSkeleton className="h-6 w-20" />
              <PulseSkeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* ─── UF9 (HIGH): ErrorState si la query échoue (403/500/network). */}
      {/* Avant ce fix, usersQuery.error n'était jamais lu → l'utilisateur voyait */}
      {/* l'empty state "Aucun utilisateur trouvé" même en cas d'erreur réelle. */}
      {!isLoading && usersQuery.isError && (
        <ErrorState
          message="Impossible de charger la liste des utilisateurs. Vérifiez vos permissions ou réessayez."
          onRetry={() => usersQuery.refetch()}
        />
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !usersQuery.isError && users.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <Users className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">{isAdmin ? 'Aucun responsable trouvé' : 'Aucun utilisateur trouvé'}</h3>
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
                <Button variant="outline" className="border-success/30" onClick={handleOpenImport}>
                  <FileUp className="h-4 w-4" />
                  Importer
                </Button>
              )}
              <Button className="" onClick={handleOpenCreate}>
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
                        <Badge className="bg-success/15 text-success-text border-success/30 ">Actif</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-border ">Inactif</Badge>
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
                          <DropdownMenuItem onClick={() => setToggleTarget(u)}>
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
                            className="text-destructive"
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
            <h2 className="text-lg font-display font-semibold tracking-tight flex items-center gap-2">
              <Send className="h-5 w-5 text-success-text" />
              Invitations
              {pendingInvitations.length > 0 && (
                <Badge className="bg-info/15 text-info border-info/30 ml-1">
                  {pendingInvitations.length} en attente
                </Badge>
              )}
              {expiredInvitations.length > 0 && (
                <Badge className="bg-destructive/15 text-destructive border-destructive/30  ml-1">
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
                <PulseSkeleton key={i} className="h-12 w-full" />
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
                          <div className="text-xs text-info flex items-center gap-1">
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
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/30/20"
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
                              className="h-7 text-xs text-success-text hover:text-success-text hover:bg-success/10  "
                              onClick={() => setRenvoyerTarget(inv)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Renvoyer
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/30/20"
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
                  <Users className="h-5 w-5 text-success-text" />
                  {isAdmin ? 'Modifier le responsable' : 'Modifier l\'utilisateur'}
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-success-text" />
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
                <div className="flex rounded-lg border border-success/30 overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium transition-all ${
                      registrationMode === 'invitation'
                        ? 'bg-success text-white shadow-inner'
                        : 'bg-success/10 text-success-text hover:bg-success/15   '
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
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium transition-all border-l border-success/30 ${
                      registrationMode === 'direct'
                        ? 'bg-success text-white shadow-inner'
                        : 'bg-success/10 text-success-text hover:bg-success/15   '
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
                  <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3">
                    <Mail className="h-4 w-4 text-info mt-0.5 shrink-0" />
                    <p className="text-xs text-info">
                      Un email d&apos;invitation sera envoyé à l&apos;utilisateur. Il devra cliquer sur le lien et définir son propre mot de passe. Le lien est valable <strong>7 jours</strong>.
                    </p>
                  </div>
                )}

                {registrationMode === 'direct' && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3  ">
                    <KeyRound className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-warning">
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
                    aria-invalid={!!emailError}
                    onChange={(e) => { setFormEmail(e.target.value); setEmailError('') }}
                  />
                  {emailError && (
                    <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" />
                      {emailError}
                    </p>
                  )}
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
                      className={`pl-9 ${emailError ? 'border-destructive' : ''}`}
                      aria-invalid={!!emailError}
                      value={formEmail}
                      onChange={(e) => { setFormEmail(e.target.value); setEmailError('') }}
                    />
                  </div>
                  {emailError && (
                    <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" />
                      {emailError}
                    </p>
                  )}
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
                    <p className="text-xs text-warning flex items-center gap-1">
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
                    <p className="text-xs text-warning flex items-center gap-1">
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
                <div className="flex items-center gap-2 text-success-text">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Invitation envoyée avec succès</span>
                </div>

                <p className="text-sm text-muted-foreground">
                  L&apos;invitation a été envoyée à <strong>{invitationResult.email}</strong>. Le lien est valable <strong>7 jours</strong>.
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
                      className={`pl-9 ${emailError ? 'border-destructive' : ''}`}
                      aria-invalid={!!emailError}
                      value={formEmail}
                      onChange={(e) => { setFormEmail(e.target.value); setEmailError('') }}
                    />
                  </div>
                  {emailError && (
                    <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" />
                      {emailError}
                    </p>
                  )}
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
                    <p className="text-xs text-warning flex items-center gap-1">
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
                    <p className="text-xs text-warning flex items-center gap-1">
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
                  className=""
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
                  className=""
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
                  className=""
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
                  className=""
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
              <CheckCircle2 className="h-5 w-5 text-success-text" />
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

              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3  ">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning">
                  L&apos;utilisateur devra changer ce mot de passe à sa première connexion. Transmettez ces identifiants de manière sécurisée.
                </p>
              </div>

              <Button
                className="w-full "
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
              <FileUp className="h-5 w-5 text-success-text" />
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
                  <CheckCircle2 className="h-5 w-5 text-success-text" />
                  <span className="font-semibold text-success-text ">
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
                  <div className="rounded-lg border border-warning/30 bg-warning/10   p-3">
                    <p className="text-xs font-semibold text-warning dark:text-warning mb-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {importResult.errors.length} erreur(s)
                    </p>
                    <ul className="text-xs text-warning dark:text-warning space-y-1">
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
                className=""
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

      {/* ─── Toggle Active Confirmation Dialog (UF7/F22) ─── */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => { if (!open) setToggleTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleTarget?.actif ? 'Désactiver' : 'Activer'} l&apos;utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir <strong>{toggleTarget?.actif ? 'désactiver' : 'activer'}</strong> le compte de <strong>{toggleTarget?.name}</strong> ?
              {toggleTarget?.actif && ' Cet utilisateur ne pourra plus se connecter à la plateforme jusqu\'à réactivation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleActive}>
              {toggleTarget?.actif ? 'Désactiver' : 'Activer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      {/* UF6: onOpenChange vérifie !isDeleting pour empêcher la fermeture mid-mutation. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) ?
              Cette action est irréversible. Toutes les données associées à cet utilisateur (épreuves, sessions, soumissions, devoirs, affectations) seront définitivement supprimées en cascade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
              className="bg-destructive hover:bg-destructive/90"
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
              <RefreshCw className="h-5 w-5 text-success-text" />
              Renvoyer l&apos;invitation
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous renvoyer une invitation à <strong>{renvoyerTarget?.email}</strong> ?
              Un nouveau lien sera généré avec une validité de 7 jours. L&apos;ancien lien ne sera plus utilisable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className=""
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
