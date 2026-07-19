'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GraduationCap,
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Edit3,
  Trash2,
  Power,
  PowerOff,
  Eye,
  CheckCircle2,
  Mail,
  Clock,
  RefreshCw,
  XCircle,
  Copy,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  FileText,
  MoreHorizontal,
  AlertTriangle,
  X,
  Loader2,
  Link2,
  MessageCircle,
  AtSign,
  MessageSquare,
  ArrowLeft,
  BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { PulseSkeleton, GlassModal, Badge as DSBadge, ProgressBar } from '@/components/ds'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { QRCodeSVG } from 'qrcode.react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

// ─── Types ───

interface EtudiantItem {
  id: string
  name: string
  email: string
  role: string
  actif: boolean
  etablissementId: string | null
  filiereId: string | null
  matricule: string | null
  niveau: string | null
  mustChangePwd: boolean
  derniereConnexion: string | null
  createdAt: string
  etablissement: { id: string; nom: string } | null
  filiere: { id: string; nom: string; code?: string | null } | null
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

// SECT-REG-LINK-B2C-MVP-1 : types pour les liens d'inscription direct étudiant.
// Le token n'est JAMAIS retourné par GET /api/student-signup-links (sécurité) —
// l'URL complète n'est disponible qu'à la création (POST), une seule fois.
// SECT-REG-LINK-PHASE2-FRONTEND-1 : champ emailDomainRestriction ajouté
// (B2B — restriction du domaine email autorisé sur le lien).
// SECT-REG-LINK-PHASE3-FRONTEND-1 : champ customWelcomeMessage ajouté
// (message de bienvenue personnalisé optionnel, max 500 caractères).
interface StudentSignupLink {
  id: string
  etablissementId: string
  filiereId: string | null
  niveau: string | null
  createdById: string
  creatorName: string
  expiresAt: string
  maxUses: number | null
  useCount: number
  actif: boolean
  label: string | null
  createdAt: string
  etablissementNom: string
  filiereNom: string | null
  emailDomainRestriction?: string | null
  customWelcomeMessage?: string | null
}

interface CreateLinkResponse {
  id: string
  token: string
  url: string
  expiresAt: string
  maxUses: number | null
  label: string | null
  etablissementId: string
  filiereId: string | null
  createdAt: string
  emailDomainRestriction?: string | null
  customWelcomeMessage?: string | null
}

// SECT-REG-LINK-PHASE3-FRONTEND-1 : agrégats stats retournés par
// GET /api/student-signup-links/stats (RLS-scoped côté backend).
interface StudentSignupLinkStats {
  total: number
  active: number
  expired: number
  revoked: number
  totalUses: number
  expiringSoon: number
  successCount: number
  failureCount: number
  topLinks: Array<{
    id: string
    label: string
    useCount: number
    maxUses?: number | null
    expiresAt: string
    actif: boolean
  }>
  dailyCreations: Array<{ day: string; count: number }>
  failureBreakdown: Record<string, number>
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
  Etablissement: { id: string; nom: string } | null
  Filiere: { id: string; nom: string } | null
}

type RegistrationMode = 'invitation' | 'direct'
type ViewMode = 'cards' | 'table'

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

function getExpiryCountdown(expiresAt: string): string {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diff = expiry.getTime() - now.getTime()

  if (diff <= 0) return 'Expirée'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}j ${hours % 24}h`
  }
  if (hours > 0) return `${hours}h ${minutes}min`
  return `${minutes}min`
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now()
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

// ─── Main Component ───

export function EtudiantsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const etablissementId = user?.etablissementId || user?.etablissement?.id || ''

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [niveauFilter, setNiveauFilter] = useState('all')

  // ─── Pagination ───
  const [page, setPage] = useState(1)
  const pageSize = 20

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Les 3 ressources sont indépendantes → 3 useQuery séparés.
  // Les filtres search/filiere/status + pagination sont dans le queryKey de
  // etudiants pour refetch automatique. Le filtre niveau reste client-side
  // (l'API ne le supporte pas) — appliqué via useMemo.
  const etudiantsQuery = useQuery<{ users: EtudiantItem[]; total: number }>({
    queryKey: ['etudiants', etablissementId, searchDebounced, filiereFilter, statusFilter, niveauFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('role', 'ETUDIANT')
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      // The backend auto-filters by etablissementId for RESPONSABLE role,
      // but we also pass it explicitly for robustness
      if (etablissementId) params.set('etablissementId', etablissementId)
      if (searchDebounced) params.set('search', searchDebounced)
      if (filiereFilter && filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')
      // ETUDIANTS-FIX-E5 : filtre niveau désormais côté backend (avant ignoré →
      // pagination + stats incorrectes). Maintenant ?niveau=L2 filtre côté DB.
      if (niveauFilter && niveauFilter !== 'all') params.set('niveau', niveauFilter)

      const res = await fetch(`/api/users?${params.toString()}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to fetch etudiants')
      return res.json()
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  const filieresQuery = useQuery<{ filieres: FiliereOption[] }>({
    queryKey: ['etudiants-filieres', etablissementId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (etablissementId) params.set('etablissementId', etablissementId)
      const res = await fetch(`/api/filieres?${params.toString()}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to fetch filieres')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const invitationsQuery = useQuery<{ invitations: InvitationItem[] }>({
    queryKey: ['etudiant-invitations', user?.id],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('createdById', user!.id)
      params.set('used', 'false')
      params.set('limit', '50')
      const res = await fetch(`/api/invitations?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch invitations')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  // ETUDIANTS-FIX-E5 : le filtre niveau est désormais côté backend (?niveau=).
  // Plus besoin de filtrer côté client. totalFromApi reflète le vrai total
  // filtré (ETUDIANTS-FIX-E8 : stats basées sur totalFromApi, pas sur la page).
  const etudiants = etudiantsQuery.data?.users ?? []
  const totalFromApi = etudiantsQuery.data?.total ?? 0
  const filieres = useMemo(
    () =>
      (filieresQuery.data?.filieres ?? []).map((f) => ({
        id: f.id,
        nom: f.nom,
        code: f.code ?? null,
      })),
    [filieresQuery.data],
  )
  const invitations = useMemo(
    () => (invitationsQuery.data?.invitations ?? []).filter((inv) => inv.role === 'ETUDIANT'),
    [invitationsQuery.data],
  )
  const isLoading = etudiantsQuery.isLoading
  const isLoadingInvitations = invitationsQuery.isFetching

  // Helpers pour invalider le cache après mutation (create/update/delete/invite).
  const refreshEtudiants = () => queryClient.invalidateQueries({ queryKey: ['etudiants'] })
  const refreshInvitations = () => queryClient.invalidateQueries({ queryKey: ['etudiant-invitations'] })

  // ─── View mode ───
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  // ─── Dialog state ───
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [directResultDialogOpen, setDirectResultDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingEtudiant, setEditingEtudiant] = useState<EtudiantItem | null>(null)
  const [detailEtudiant, setDetailEtudiant] = useState<EtudiantItem | null>(null)
  const [removeFiliereTarget, setRemoveFiliereTarget] = useState<EtudiantItem | null>(null)
  const [cancelInvitationTarget, setCancelInvitationTarget] = useState<InvitationItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EtudiantItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // SECT-REG-LINK-B2C-MVP-1 : state pour la modal "Générer un lien d'inscription"
  // (B2C self-service). Le bouton est dans le header à côté de "Importer CSV".
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkFiliereId, setLinkFiliereId] = useState('')
  const [linkNiveau, setLinkNiveau] = useState('')
  const [linkMaxUses, setLinkMaxUses] = useState('')
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : restriction de domaine email (B2B)
  const [linkEmailDomain, setLinkEmailDomain] = useState('')
  // SECT-REG-LINK-PHASE3-FRONTEND-1 : message de bienvenue personnalisé
  // (max 500 caractères, optionnel, affiché dans l'email de bienvenue).
  const [linkCustomMessage, setLinkCustomMessage] = useState('')
  const [createdLink, setCreatedLink] = useState<CreateLinkResponse | null>(null)
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [revokeLinkTarget, setRevokeLinkTarget] = useState<StudentSignupLink | null>(null)
  const [isRevokingLink, setIsRevokingLink] = useState(false)
  // SECT-REG-LINK-PHASE3-FRONTEND-1 : toggle de la vue statistiques (lazy fetch)
  const [showStats, setShowStats] = useState(false)

  // ETUDIANTS-FIX-E10 : query dependencies pour preview suppression.
  // Se déclenche quand l'utilisateur ouvre l'AlertDialog de suppression.
  // Retourne les comptes (sessions, réponses, soumissions) pour informer
  // l'utilisateur avant confirmation (pattern filieres/affectations).
  const deleteDepsQuery = useQuery<{
    sessions: number
    reponses: number
    soumissions: number
    canDelete: boolean
    userName?: string
    userEmail?: string
  }>({
    queryKey: ['user-dependencies', deleteTarget?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${deleteTarget!.id}/dependencies`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Failed to fetch dependencies')
      }
      return res.json()
    },
    enabled: !!deleteTarget?.id,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Bulk selection state ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionDialog, setBulkActionDialog] = useState<'activate' | 'deactivate' | 'delete' | null>(null)
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  // ─── Registration mode ───
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('invitation')

  // ─── Invitation form state ───
  const [invEmail, setInvEmail] = useState('')
  const [invName, setInvName] = useState('')
  const [invFiliereId, setInvFiliereId] = useState('')
  const [invitationTokenResult, setInvitationTokenResult] = useState<{ token: string; email: string } | null>(null)

  // ─── Direct creation form state ───
  const [directName, setDirectName] = useState('')
  const [directEmail, setDirectEmail] = useState('')
  const [directFiliereId, setDirectFiliereId] = useState('')
  const [directMatricule, setDirectMatricule] = useState('')
  const [directNiveau, setDirectNiveau] = useState('')
  const [directResult, setDirectResult] = useState<{ email: string; temporaryPassword: string; name: string } | null>(null)

  // ─── Edit form state ───
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editFiliereId, setEditFiliereId] = useState('')
  const [editMatricule, setEditMatricule] = useState('')
  const [editNiveau, setEditNiveau] = useState('')
  const [editActif, setEditActif] = useState(true)

  // ─── Matricule change confirmation state ───
  const [matriculeChangeDialog, setMatriculeChangeDialog] = useState(false)
  const [matriculeChangeInfo, setMatriculeChangeInfo] = useState<{ oldMatricule: string; newMatricule: string } | null>(null)

  // ─── Import state ───
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importParsedData, setImportParsedData] = useState<Array<{ name: string; email: string }>>([])
  const [importFiliereId, setImportFiliereId] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // ─── Search debounce ───
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchDebounced(value)
      setPage(1)
    }, 300)
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filiereFilter, statusFilter, niveauFilter, searchDebounced])

  // ─── Stats ───
  // ETUDIANTS-FIX-E8 : totalEtudiants utilise le count API (correct, reflète
  // tous les étudiants filtrés). activeEtudiants/withFiliere sont calculés sur
  // la page courante (max 20) — indicateur "page courante" affiché si >20.
  const totalEtudiants = totalFromApi
  const activeEtudiants = etudiants.filter((e) => e.actif).length
  const withFiliere = etudiants.filter((e) => e.filiereId).length
  const statsAreApprox = totalFromApi > etudiants.length // page courante < total
  const pendingInvitations = invitations.filter((inv) => !isExpired(inv.expiresAt)).length
  const expiredInvitations = invitations.filter((inv) => isExpired(inv.expiresAt)).length

  // ─── Pagination info ───
  const totalPages = Math.max(1, Math.ceil(totalFromApi / pageSize))
  const canPrev = page > 1
  const canNext = page < totalPages

  // ─── Open add dialog ───
  const handleOpenAdd = () => {
    setRegistrationMode('invitation')
    setInvEmail('')
    setInvName('')
    setInvFiliereId('')
    setInvitationTokenResult(null)
    setDirectName('')
    setDirectEmail('')
    setDirectFiliereId('')
    setDirectMatricule('')
    setDirectNiveau('')
    setDirectResult(null)
    setAddDialogOpen(true)
  }

  // ─── Submit invitation ───
  const handleInvitationSubmit = async () => {
    if (!invEmail) {
      toast.error('Champ manquant', { description: 'L\'email est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        email: invEmail,
        role: 'ETUDIANT',
      }
      if (invName) body.name = invName
      if (invFiliereId) body.filiereId = invFiliereId
      if (etablissementId) body.etablissementId = etablissementId
      if (user?.id) body.createdById = user.id

      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'invitation')
      }

      const data = await res.json()
      setInvitationTokenResult({ token: data.token, email: invEmail })
      toast.success('Invitation envoyée', { description: `Invitation envoyée à ${invEmail}` })
      await refreshInvitations()
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Submit direct creation ───
  const handleDirectSubmit = async () => {
    if (!directName || !directEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: directName,
        email: directEmail,
        role: 'ETUDIANT',
        mode: 'direct',
        actif: true,
      }
      if (directFiliereId && directFiliereId !== '__none__') body.filiereId = directFiliereId
      if (etablissementId) body.etablissementId = etablissementId
      if (directMatricule) body.matricule = directMatricule
      if (directNiveau && directNiveau !== '__none__') body.niveau = directNiveau

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let errorMsg = 'Erreur lors de la création'
        try {
          const errData = await res.json()
          errorMsg = errData.error || errData.details || `Erreur ${res.status}`
        } catch {
          if (res.status === 401) errorMsg = 'Session expirée. Veuillez vous reconnecter.'
          else if (res.status === 403) errorMsg = 'Permissions insuffisantes pour créer un étudiant.'
          else errorMsg = `Erreur serveur (${res.status})`
        }
        throw new Error(errorMsg)
      }

      const data = await res.json()
      setDirectResult({
        email: directEmail,
        temporaryPassword: data.temporaryPassword || '',
        name: directName,
      })
      setAddDialogOpen(false)
      setDirectResultDialogOpen(true)
      toast.success('Étudiant créé', { description: `${directName} a été ajouté avec succès.` })
      await refreshEtudiants()
    } catch (err) {
      console.error('[EtudiantsPage] Erreur création directe:', err)
      toast.error('Erreur de création', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
        duration: 8000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Renvoyer invitation ───
  const handleRenvoyerInvitation = async (invitation: InvitationItem) => {
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
      toast.success('Invitation renvoyée', { description: `Nouvelle invitation envoyée à ${invitation.email}` })
      await refreshInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de renvoyer l\'invitation.' })
    }
  }

  // ─── Cancel invitation ───
  const handleCancelInvitation = async () => {
    const target = cancelInvitationTarget
    setCancelInvitationTarget(null)
    if (!target) return
    try {
      const res = await fetch(`/api/invitations/${target.id}`, {
        method: 'DELETE',
        headers: {
          },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'annulation')
      }
      toast.success('Invitation annulée', {
        description: `L'invitation pour ${target.email} a été annulée.`,
      })
      await refreshInvitations()
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

  // ─── Open edit dialog ───
  const handleOpenEdit = (etudiant: EtudiantItem) => {
    setEditingEtudiant(etudiant)
    setEditName(etudiant.name)
    setEditEmail(etudiant.email)
    setEditFiliereId(etudiant.filiereId ?? '')
    setEditMatricule(etudiant.matricule ?? '')
    setEditNiveau(etudiant.niveau ?? '')
    setEditActif(etudiant.actif)
    setEditDialogOpen(true)
  }

  // ─── Submit edit (with matricule change detection) ───
  const handleEditSubmit = async () => {
    if (!editingEtudiant) return
    if (!editName || !editEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }

    // Detect matricule change
    const oldMatricule = editingEtudiant.matricule ?? ''
    const newMatricule = editMatricule || ''
    if (oldMatricule !== newMatricule) {
      // Show confirmation dialog before proceeding
      setMatriculeChangeInfo({ oldMatricule, newMatricule })
      setMatriculeChangeDialog(true)
      return
    }

    // No matricule change — proceed directly
    await doEditSubmit()
  }

  // ─── Actual edit submission (called after matricule confirmation or directly) ───
  const doEditSubmit = async () => {
    if (!editingEtudiant) return
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: editName,
        email: editEmail,
        filiereId: editFiliereId && editFiliereId !== '__none__' ? editFiliereId : null,
        matricule: editMatricule || null,
        niveau: editNiveau && editNiveau !== '__none__' ? editNiveau : null,
        actif: editActif,
      }

      const res = await fetch(`/api/users/${editingEtudiant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la modification')
      }

      const wasMatriculeChanged = matriculeChangeInfo !== null
      toast.success('Étudiant modifié', {
        description: wasMatriculeChanged
          ? `${editName} a été mis à jour. Une notification a été envoyée à l'étudiant concernant le changement de matricule.`
          : `${editName} a été mis à jour.`,
      })
      setEditDialogOpen(false)
      setEditingEtudiant(null)
      setMatriculeChangeInfo(null)
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle active ───
  const handleToggleActive = async (etudiant: EtudiantItem) => {
    try {
      const res = await fetch(`/api/users/${etudiant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ actif: !etudiant.actif }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Erreur ${res.status}`)
      }
      toast.success(etudiant.actif ? 'Étudiant archivé' : 'Étudiant réactivé', {
        description: etudiant.actif
          ? `${etudiant.name} est maintenant archivé. Ses données sont préservées, il reste dans l'établissement mais est marqué comme inactif.`
          : `${etudiant.name} est de nouveau actif.`,
      })
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de modifier le statut.' })
    }
  }

  // ─── Remove from filiere ───
  const handleRemoveFromFiliere = async () => {
    const target = removeFiliereTarget
    setRemoveFiliereTarget(null)
    if (!target) return
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ filiereId: null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Erreur ${res.status}`)
      }
      toast.success('Filière retirée', {
        description: `${target.name} a été retiré de sa filière.`,
      })
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de retirer la filière.' })
    }
  }

  // ─── Delete student (permanent hard delete) ───
  const handleDeleteStudent = async () => {
    // Capture target info IMMEDIATELY before dialog close can null it out
    const target = deleteTarget
    if (!target) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/users/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
      const data = await res.json()
      const deps = data.deletedDependencies

      const parts: string[] = []
      if (deps?.sessions) parts.push(`${deps.sessions} session(s)`)
      if (deps?.reponses) parts.push(`${deps.reponses} réponse(s)`)
      if (deps?.soumissions) parts.push(`${deps.soumissions} soumission(s)`)
      const depsText = parts.length > 0 ? ` Données supprimées : ${parts.join(', ')}.` : ''

      toast.success('Étudiant supprimé définitivement', {
        description: `${target.name} a été supprimé définitivement de la base de données avec tout son historique.${depsText}`,
      })
      setDeleteTarget(null)
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de supprimer l\'étudiant.' })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Bulk operations ───
  const handleBulkAction = async () => {
    if (!bulkActionDialog || selectedIds.size === 0) return
    setIsBulkProcessing(true)
    try {
      // ETUDIANTS-FIX-E9 : collecter les deletedDependencies pour le delete bulk
      // (avant, seul le delete single affichait les deps).
      let totalDepsSessions = 0
      let totalDepsReponses = 0
      let totalDepsSoumissions = 0
      const results = await Promise.allSettled(
        Array.from(selectedIds).map(async (id) => {
          if (bulkActionDialog === 'delete') {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err?.error || `Erreur ${res.status}`)
            }
            // ETUDIANTS-FIX-E9 : lire deletedDependencies
            const data = await res.json().catch(() => ({}))
            const deps = data.deletedDependencies
            if (deps) {
              totalDepsSessions += deps.sessions || 0
              totalDepsReponses += deps.reponses || 0
              totalDepsSoumissions += deps.soumissions || 0
            }
          } else {
            const res = await fetch(`/api/users/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ actif: bulkActionDialog === 'activate' }),
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err?.error || `Erreur ${res.status}`)
            }
          }
        })
      )
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length
      const actionLabels = { activate: 'activé(s)', deactivate: 'désactivé(s) (archivé(s))', delete: 'supprimé(s) définitivement' }
      // ETUDIANTS-FIX-E9 : inclure les deps dans le toast si delete bulk
      let depsText = ''
      if (bulkActionDialog === 'delete' && (totalDepsSessions > 0 || totalDepsReponses > 0 || totalDepsSoumissions > 0)) {
        const parts: string[] = []
        if (totalDepsSessions > 0) parts.push(`${totalDepsSessions} session(s)`)
        if (totalDepsReponses > 0) parts.push(`${totalDepsReponses} réponse(s)`)
        if (totalDepsSoumissions > 0) parts.push(`${totalDepsSoumissions} soumission(s)`)
        depsText = ` Données supprimées : ${parts.join(', ')}.`
      }
      toast.success('Opération terminée', {
        description: `${succeeded} étudiant(s) ${actionLabels[bulkActionDialog]}${failed > 0 ? `, ${failed} échoué(s)` : ''}.${depsText}`,
      })
      setSelectedIds(new Set())
      setBulkActionDialog(null)
      await refreshEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'opération en masse.' })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  // ─── Selection helpers ───
  const allSelected = etudiants.length > 0 && selectedIds.size === etudiants.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(etudiants.map((e) => e.id)))
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  // ─── View detail ───
  const handleViewDetail = (etudiant: EtudiantItem) => {
    setDetailEtudiant(etudiant)
    setDetailDialogOpen(true)
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
        role: 'ETUDIANT',
      }
      if (importFiliereId) body.filiereId = importFiliereId
      if (etablissementId) body.etablissementId = etablissementId

      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        credentials: 'same-origin',
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
          description: `${data.imported} étudiant${data.imported > 1 ? 's' : ''} importé${data.imported > 1 ? 's' : ''}.`,
        })
      }

      await refreshEtudiants()
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
    downloadCSV(csv, 'mots-de-passe-etudiants.csv')
  }

  // ─── Download CSV template ───
  const handleDownloadTemplate = () => {
    const csv = 'name,email\nJean Dupont,jean.dupont@exemple.fr\nMarie Martin,marie.martin@exemple.fr'
    downloadCSV(csv, 'template-import-etudiants.csv')
    toast.success('Template téléchargé', { description: 'Remplissez le fichier CSV avec vos étudiants.' })
  }

  // ─── Export students list ───
  const handleExportStudents = () => {
    if (etudiants.length === 0) {
      toast.error('Aucune donnée', { description: 'Aucun étudiant à exporter.' })
      return
    }
    const header = 'Matricule,Nom,Email,Filiere,Niveau,Statut,DateCreation'
    const rows = etudiants.map((e) =>
      `${e.matricule || ''},${e.name},${e.email},${e.filiere?.nom || ''},${e.niveau || ''},${e.actif ? 'Actif' : 'Archivé'},${formatDateFR(e.createdAt)}`
    )
    const csv = [header, ...rows].join('\n')
    downloadCSV(csv, `etudiants-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('Export réussi', { description: `${etudiants.length} étudiant(s) exporté(s).` })
  }

  // ─── Download relevé de notes (PDF par semestre) ───
  const [downloadingReleveId, setDownloadingReleveId] = useState<string | null>(null)
  const handleDownloadReleve = async (etudiant: EtudiantItem) => {
    setDownloadingReleveId(etudiant.id)
    try {
      const res = await fetch(`/api/etudiants/${etudiant.id}/releve-notes`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `releve_notes_${etudiant.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Relevé de notes téléchargé', { description: etudiant.name })
    } catch (err) {
      toast.error('Échec du téléchargement', { description: err instanceof Error ? err.message : 'Réessayez.' })
    } finally {
      setDownloadingReleveId(null)
    }
  }

  // ─── Reset import state ───
  const handleOpenImport = () => {
    setImportFile(null)
    setImportParsedData([])
    setImportFiliereId('')
    setIsImporting(false)
    setImportResult(null)
    setImportDialogOpen(true)
  }

  // ─── Niveau options ───
  const niveauOptions = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']

  // ═══════════════════════════════════════════════════════════════════════════
  // SECT-REG-LINK-B2C-MVP-1 : Liens d'inscription direct étudiant (B2C)
  // ═══════════════════════════════════════════════════════════════════════════
  // Query TanStack : lister les liens existants (sans token — sécurité backend).
  // Le fetch n'est déclenché que lorsque la modal est ouverte (enabled: showLinkDialog).
  const signupLinksQuery = useQuery<{ links: StudentSignupLink[] }>({
    queryKey: ['student-signup-links'],
    queryFn: async () => {
      const res = await fetch('/api/student-signup-links', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to fetch student signup links')
      return res.json()
    },
    enabled: showLinkDialog,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
  const signupLinks = signupLinksQuery.data?.links ?? []
  const isLoadingSignupLinks = signupLinksQuery.isFetching && !signupLinksQuery.data

  // SECT-REG-LINK-PHASE3-FRONTEND-1 : regroupement des liens existants par
  // filière (clé '__none__' pour les liens B2C sans filière). Pure présentation
  // (useMemo — aucune DB change). L'ordre d'insertion est préservé dans chaque
  // groupe (sortie côté backend par createdAt DESC).
  const groupedLinks = useMemo(() => {
    const groups: Record<string, StudentSignupLink[]> = {}
    for (const link of signupLinks) {
      const key = link.filiereId || '__none__'
      if (!groups[key]) groups[key] = []
      groups[key].push(link)
    }
    return groups
  }, [signupLinks])

  // SECT-REG-LINK-PHASE3-FRONTEND-1 : agrégats stats (lazy fetch).
  // Le fetch n'est déclenché QUE si l'utilisateur clique sur « Statistiques »
  // (enabled: showStats) — évite une requête systématique à l'ouverture de la modal.
  const statsQuery = useQuery<StudentSignupLinkStats>({
    queryKey: ['student-signup-links-stats'],
    queryFn: async () => {
      const res = await fetch('/api/student-signup-links/stats', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: showStats,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  // Ouvrir la modal — reset les champs et l'écran de succès
  const handleOpenLinkDialog = () => {
    setLinkLabel('')
    setLinkFiliereId('')
    setLinkNiveau('')
    setLinkMaxUses('')
    setLinkEmailDomain('')
    setLinkCustomMessage('')
    setCreatedLink(null)
    setIsCreatingLink(false)
    setShowStats(false)
    setShowLinkDialog(true)
  }

  // Fermer la modal — invalide le cache pour re-sync à la prochaine ouverture
  const handleCloseLinkDialog = () => {
    setShowLinkDialog(false)
    setCreatedLink(null)
    setLinkLabel('')
    setLinkFiliereId('')
    setLinkNiveau('')
    setLinkMaxUses('')
    setLinkEmailDomain('')
    setLinkCustomMessage('')
    setShowStats(false)
  }

  // Créer un nouveau lien d'inscription (POST /api/student-signup-links)
  // Ne logue JAMAIS le token dans la console (sécurité frontend).
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : ajoute emailDomainRestriction si saisi.
  const handleCreateLink = async () => {
    setIsCreatingLink(true)
    try {
      const body: Record<string, string | number> = {}
      if (linkLabel.trim()) body.label = linkLabel.trim()
      if (linkFiliereId && linkFiliereId !== '__none__') body.filiereId = linkFiliereId
      if (linkNiveau && linkNiveau !== '__none__') body.niveau = linkNiveau
      if (linkMaxUses) {
        const n = parseInt(linkMaxUses, 10)
        if (!Number.isNaN(n) && n > 0) body.maxUses = n
      }
      // SECT-REG-LINK-PHASE2-FRONTEND-1 : restriction de domaine email (B2B).
      // Normalisation : trim + strip '@' initial + lower. Validation regex
      // côté frontend (le backend refait la même validation en defense in depth).
      if (linkEmailDomain.trim()) {
        const d = linkEmailDomain.trim().replace(/^@/, '').toLowerCase()
        if (!/^[a-z0-9.-]+$/.test(d)) {
          toast.error('Domaine invalide', { description: 'Exemple : univ-ci.edu' })
          setIsCreatingLink(false)
          return
        }
        body.emailDomainRestriction = d
      }
      // SECT-REG-LINK-PHASE3-FRONTEND-1 : message de bienvenue personnalisé.
      // Trim côté frontend + max 500 chars (le backend refait la même validation).
      if (linkCustomMessage.trim()) {
        const msg = linkCustomMessage.trim()
        if (msg.length > 500) {
          toast.error('Message trop long', { description: 'Maximum 500 caractères.' })
          setIsCreatingLink(false)
          return
        }
        body.customWelcomeMessage = msg
      }
      const res = await fetch('/api/student-signup-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du lien')
      }
      setCreatedLink(data as CreateLinkResponse)
      queryClient.invalidateQueries({ queryKey: ['student-signup-links'] })
      toast.success('Lien généré', {
        description: 'Partagez-le aux étudiants concernés.',
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de créer le lien.',
      })
    } finally {
      setIsCreatingLink(false)
    }
  }

  // Révoquer un lien (DELETE /api/student-signup-links/{id}) — soft delete
  const handleRevokeLink = async () => {
    if (!revokeLinkTarget) return
    setIsRevokingLink(true)
    try {
      const res = await fetch(`/api/student-signup-links/${revokeLinkTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors de la révocation')
      }
      queryClient.invalidateQueries({ queryKey: ['student-signup-links'] })
      toast.success('Lien révoqué')
      setRevokeLinkTarget(null)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de révoquer le lien.',
      })
    } finally {
      setIsRevokingLink(false)
    }
  }

  // L'utilisateur peut-il choisir une filière ? Uniquement RESPONSABLE/ADMIN
  // (les ENSEIGNANT B2C n'ont pas de filière propre — filiereId forcé à nil côté backend).
  const canSelectFiliere = user?.role === 'RESPONSABLE' || user?.role === 'ADMIN'

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <GraduationCap className="h-7 w-7 text-success-text" />
            Gestion des Étudiants
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les étudiants de votre établissement et importez-les en masse
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportStudents}>
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <FileText className="h-4 w-4" />
            Template CSV
          </Button>
          <Button variant="outline" size="sm" className="border-warning/30 text-warning hover:bg-warning/10" onClick={handleOpenImport}>
            <Upload className="h-4 w-4" />
            Importer CSV
          </Button>
          {/* SECT-REG-LINK-B2C-MVP-1 : lien d'inscription direct étudiant.
              Masqué pour l'ADMIN (pas d'établissement rattaché → usecase refuse).
              Visible pour RESPONSABLE (B2B) et ENSEIGNANT (B2C étab PERSONNEL). */}
          {user?.role !== 'ADMIN' && (
            <Button variant="outline" size="sm" onClick={handleOpenLinkDialog}>
              <Link2 className="h-4 w-4" />
              Lien d&apos;inscription
            </Button>
          )}
          <Button className="bg-success hover:bg-success/90" size="sm" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4" />
            Ajouter un étudiant
          </Button>
        </div>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Users className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total étudiants</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <GraduationCap className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold font-mono tabular-nums">{activeEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec filière</p>
              <p className="text-xl font-bold font-mono tabular-nums">{withFiliere}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <Mail className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invitations en attente</p>
              <p className="text-xl font-bold font-mono tabular-nums">{pendingInvitations}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invitations expirées</p>
              <p className="text-xl font-bold font-mono tabular-nums">{expiredInvitations}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search/Filter Toolbar ─── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, email ou matricule..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filiereFilter} onValueChange={(v) => { setFiliereFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
          <Select value={niveauFilter} onValueChange={setNiveauFilter}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              {niveauOptions.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="actif">Actifs</SelectItem>
              <SelectItem value="inactif">Archivés</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View mode toggle + result count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Chargement...' : `${totalFromApi} étudiant(s) trouvé(s)`}
          </p>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="cards" className="px-2 h-6">
                <LayoutGrid className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger value="table" className="px-2 h-6">
                <List className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && viewMode === 'cards' && (
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
                    <div className="h-8 w-20 rounded bg-muted" />
                    <div className="h-8 w-24 rounded bg-muted" />
                    <div className="h-8 w-20 rounded bg-muted" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
      )}
      {isLoading && viewMode === 'table' && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <PulseSkeleton key={i} className="h-12 w-full" />
            ))}
          </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && etudiants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <GraduationCap className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucun étudiant trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || filiereFilter !== 'all' || statusFilter !== 'all' || niveauFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par ajouter des étudiants ou importez-les depuis un fichier CSV.'}
          </p>
          {!search && filiereFilter === 'all' && statusFilter === 'all' && niveauFilter === 'all' && (
            <div className="mt-6 flex gap-3">
              <Button className="bg-success hover:bg-success/90" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4" />
                Ajouter un étudiant
              </Button>
              <Button variant="outline" className="border-warning/30 text-warning hover:bg-warning/10" onClick={handleOpenImport}>
                <Upload className="h-4 w-4" />
                Importer CSV
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Bulk Action Toolbar ─── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-success/10 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} étudiant(s) sélectionné(s)
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('activate')}
            className="border-success/30 text-success-text hover:bg-success/10"
          >
            <Power className="h-3.5 w-3.5" />
            Réactiver
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('deactivate')}
          >
            <PowerOff className="h-3.5 w-3.5" />
            Archiver
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkActionDialog('delete')}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ─── Card view ─── */}
      {!isLoading && etudiants.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {etudiants.map((etudiant) => (
            <Card key={etudiant.id} className={`group transition-shadow hover:shadow-md ${selectedIds.has(etudiant.id) ? 'ring-2 ring-success border-success/30' : ''}`}>
              <CardContent className="flex flex-col gap-3 p-5">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(etudiant.id)}
                    onCheckedChange={() => toggleSelect(etudiant.id)}
                    className="mt-1"
                    aria-label={`Sélectionner ${etudiant.name}`}
                  />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-sm font-bold text-success-text">
                    {getInitials(etudiant.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-display font-semibold leading-tight tracking-tight truncate">{etudiant.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{etudiant.email}</p>
                  </div>
                </div>

                {/* Info row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {etudiant.filiere ? (
                    <Badge className="bg-success/10 text-success-text border-success/30 text-xs">
                      <GraduationCap className="h-3 w-3 mr-0.5" />
                      {etudiant.filiere.nom}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-warning border-warning/30">
                      Sans filière
                    </Badge>
                  )}
                  {etudiant.niveau && (
                    <Badge variant="outline" className="text-xs">
                      {etudiant.niveau}
                    </Badge>
                  )}
                  {etudiant.actif ? (
                    <Badge className="bg-success/10 text-success-text border-success/30 text-xs">Actif</Badge>
                  ) : (
                    <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">Archivé</Badge>
                  )}
                </div>

                {/* Matricule + date */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {etudiant.matricule ? (
                    <span className="font-mono tabular-nums">{etudiant.matricule}</span>
                  ) : (
                    <span>—</span>
                  )}
                  <span>{formatDateFR(etudiant.createdAt)}</span>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleOpenEdit(etudiant)}
                  >
                    <Edit3 className="h-3 w-3" />
                    Modifier
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleToggleActive(etudiant)}>
                        {etudiant.actif ? (
                          <><PowerOff className="h-4 w-4" />Archiver</>
                        ) : (
                          <><Power className="h-4 w-4" />Réactiver</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewDetail(etudiant)}>
                        <Eye className="h-4 w-4" />
                        Détails
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadReleve(etudiant)}>
                        <Download className="h-4 w-4" />
                        Relevé de notes
                      </DropdownMenuItem>
                      {etudiant.filiereId && (
                        <DropdownMenuItem onClick={() => setRemoveFiliereTarget(etudiant)}>
                          <XCircle className="h-4 w-4" />
                          Retirer de la filière
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(etudiant)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer l'étudiant
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Table view ─── */}
      {!isLoading && etudiants.length > 0 && viewMode === 'table' && (
        <div className="rounded-lg border">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] font-display">+</TableHead>
                  <TableHead className="font-display">Nom</TableHead>
                  <TableHead className="hidden md:table-cell font-display">Email</TableHead>
                  <TableHead className="hidden sm:table-cell font-display">Matricule</TableHead>
                  <TableHead className="font-display">Filière</TableHead>
                  <TableHead className="hidden lg:table-cell font-display">Niveau</TableHead>
                  <TableHead className="font-display">Statut</TableHead>
                  <TableHead className="text-right font-display">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {etudiants.map((etudiant) => (
                  <TableRow key={etudiant.id}>
                    <TableCell>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                        {getInitials(etudiant.name)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{etudiant.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{etudiant.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="font-mono tabular-nums text-xs">{etudiant.matricule || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {etudiant.filiere ? (
                        <Badge className="bg-success/10 text-success-text border-success/30 text-xs">
                          {etudiant.filiere.nom}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-warning">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {etudiant.niveau ? (
                        <Badge variant="outline" className="text-xs">{etudiant.niveau}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {etudiant.actif ? (
                        <Badge className="bg-success/10 text-success-text border-success/30 text-xs">Actif</Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">Archivé</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(etudiant)}>
                            <Edit3 className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(etudiant)}>
                            {etudiant.actif ? <><PowerOff className="h-4 w-4" />Archiver</> : <><Power className="h-4 w-4" />Réactiver</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewDetail(etudiant)}>
                            <Eye className="h-4 w-4" />
                            Détails
                          </DropdownMenuItem>
                          {etudiant.filiereId && (
                            <DropdownMenuItem onClick={() => setRemoveFiliereTarget(etudiant)}>
                              <XCircle className="h-4 w-4" />
                              Retirer de la filière
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(etudiant)}
                          >
                            <Trash2 className="h-4 w-4" />
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
        </div>
      )}

      {/* ─── Pagination ─── */}
      {!isLoading && totalFromApi > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} sur {totalPages} — {totalFromApi} résultat(s)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Invitation Tracking Section ─── */}
      {!isLoading && invitations.length > 0 && (
        <Card className="border-info/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 font-display">
                <Mail className="h-5 w-5 text-info" />
                Invitations en cours ({invitations.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-info hover:text-info"
                onClick={() => { void refreshInvitations() }}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingInvitations ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-display">Email</TableHead>
                    <TableHead className="font-display">Nom</TableHead>
                    <TableHead className="font-display">Filière</TableHead>
                    <TableHead className="font-display">Expire dans</TableHead>
                    <TableHead className="hidden sm:table-cell font-display">Créée le</TableHead>
                    <TableHead className="text-right font-display">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => {
                    const expired = isExpired(invitation.expiresAt)
                    return (
                      <TableRow key={invitation.id} className={expired ? 'bg-warning/10' : ''}>
                        <TableCell className="text-sm font-medium">{invitation.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{invitation.name || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {invitation.Filiere ? (
                            <Badge className="bg-success/10 text-success-text border-success/30 text-xs">
                              {invitation.Filiere.nom}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                              <XCircle className="h-3 w-3 mr-0.5" />
                              Expirée
                            </Badge>
                          ) : (
                            <Badge className="bg-info/10 text-info border-info/30 text-xs">
                              <Clock className="h-3 w-3 mr-0.5" />
                              {getExpiryCountdown(invitation.expiresAt)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{formatDateTimeFR(invitation.createdAt)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            {expired && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-info/30 text-info hover:bg-info/10 h-7 text-xs"
                                onClick={() => handleRenvoyerInvitation(invitation)}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Renvoyer
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-destructive/30 text-destructive hover:bg-destructive/10 h-7 text-xs"
                              onClick={() => setCancelInvitationTarget(invitation)}
                            >
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ─── DIALOGS ─── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* ─── Add Student Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un étudiant</DialogTitle>
            <DialogDescription>
              Choisissez le mode d&apos;inscription : invitation par email ou création directe.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={registrationMode === 'invitation' ? 'default' : 'outline'}
              size="sm"
              className={registrationMode === 'invitation' ? 'bg-success hover:bg-success/90' : ''}
              onClick={() => setRegistrationMode('invitation')}
            >
              <Mail className="h-4 w-4 mr-1" />
              Invitation
            </Button>
            <Button
              variant={registrationMode === 'direct' ? 'default' : 'outline'}
              size="sm"
              className={registrationMode === 'direct' ? 'bg-success hover:bg-success/90' : ''}
              onClick={() => setRegistrationMode('direct')}
            >
              <KeyRound className="h-4 w-4 mr-1" />
              Création directe
            </Button>
          </div>

          {registrationMode === 'invitation' ? (
            <div className="space-y-4">
              {!invitationTokenResult ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="inv-email">Email *</Label>
                    <Input id="inv-email" type="email" placeholder="etudiant@exemple.fr" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-name">Nom (optionnel)</Label>
                    <Input id="inv-name" placeholder="Prénom Nom" value={invName} onChange={(e) => setInvName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-filiere">Filière</Label>
                    <Select value={invFiliereId} onValueChange={setInvFiliereId}>
                      <SelectTrigger id="inv-filiere">
                        <SelectValue placeholder="Sélectionner une filière" />
                      </SelectTrigger>
                      <SelectContent>
                        {filieres.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nom}{f.code ? ` (${f.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-3">
                  <p className="text-sm font-medium text-success-text">
                    Invitation créée avec succès !
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Lien d&apos;invitation :</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white dark:bg-gray-900 p-2 rounded border break-all">
                        {`${window.location.origin}/accept-invitation?token=${invitationTokenResult.token}`}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => handleCopyToClipboard(`${window.location.origin}/accept-invitation?token=${invitationTokenResult.token}`, 'Lien')}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Partagez ce lien avec {invitationTokenResult.email} pour qu&apos;il puisse créer son compte.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="direct-name">Nom complet *</Label>
                <Input id="direct-name" placeholder="Prénom Nom" value={directName} onChange={(e) => setDirectName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direct-email">Email *</Label>
                <Input id="direct-email" type="email" placeholder="etudiant@exemple.fr" value={directEmail} onChange={(e) => setDirectEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direct-filiere">Filière</Label>
                <Select value={directFiliereId || '__none__'} onValueChange={setDirectFiliereId}>
                  <SelectTrigger id="direct-filiere">
                    <SelectValue placeholder="Sélectionner une filière" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune filière</SelectItem>
                    {filieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom}{f.code ? ` (${f.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="direct-matricule">Matricule (auto-généré si vide)</Label>
                <Input id="direct-matricule" placeholder="Laissez vide pour auto-génération" value={directMatricule} onChange={(e) => setDirectMatricule(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direct-niveau">Niveau d&apos;études</Label>
                <Select value={directNiveau || '__none__'} onValueChange={setDirectNiveau}>
                  <SelectTrigger id="direct-niveau">
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucun niveau</SelectItem>
                    {niveauOptions.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {!invitationTokenResult && (
              <Button
                className="bg-success hover:bg-success/90"
                onClick={registrationMode === 'invitation' ? handleInvitationSubmit : handleDirectSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting && <span className="animate-spin mr-2">⏳</span>}
                {registrationMode === 'invitation' ? 'Envoyer l\'invitation' : 'Créer l\'étudiant'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Direct Creation Result Dialog ─── */}
      <Dialog open={directResultDialogOpen} onOpenChange={setDirectResultDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Étudiant créé avec succès</DialogTitle>
            <DialogDescription>
              Notez le mot de passe temporaire. L&apos;étudiant devra le changer à sa première connexion.
            </DialogDescription>
          </DialogHeader>
          {directResult && (
            <div className="rounded-lg border bg-success/10 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{directResult.name}</p>
                <p className="text-sm text-muted-foreground">{directResult.email}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Mot de passe temporaire :</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-white dark:bg-gray-900 p-2 rounded border font-mono tabular-nums">
                    {directResult.temporaryPassword}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => handleCopyToClipboard(directResult.temporaryPassword, 'Mot de passe')}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDirectResultDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;étudiant</DialogTitle>
            <DialogDescription>
              Modifier les informations de l&apos;étudiant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom complet *</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-filiere">Filière</Label>
              <Select value={editFiliereId} onValueChange={setEditFiliereId}>
                <SelectTrigger id="edit-filiere">
                  <SelectValue placeholder="Sélectionner une filière" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune filière</SelectItem>
                  {filieres.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nom}{f.code ? ` (${f.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-matricule">Matricule</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-matricule"
                  placeholder="Laissez vide pour auto-génération"
                  value={editMatricule}
                  onChange={(e) => setEditMatricule(e.target.value)}
                  className={`font-mono ${editingEtudiant && editingEtudiant.matricule !== (editMatricule || null) && editingEtudiant.matricule !== editMatricule ? 'border-warning focus-visible:ring-warning' : ''}`}
                />
              </div>
              {editingEtudiant && editingEtudiant.matricule !== (editMatricule || null) && editingEtudiant.matricule !== editMatricule && (
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                  <div className="text-xs text-warning">
                    <p className="font-semibold">Attention : changement de matricule détecté</p>
                    <p className="mt-1">Ancien : <span className="font-mono tabular-nums">{editingEtudiant.matricule || '(aucun)'}</span> → Nouveau : <span className="font-mono tabular-nums">{editMatricule || '(supprimé)'}</span></p>
                    <p className="mt-1">L&apos;étudiant devra utiliser son nouveau matricule pour se connecter. Une notification lui sera envoyée.</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Identifiant unique de l&apos;étudiant. Laissez vide pour utiliser l&apos;auto-génération.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-niveau">Niveau d&apos;études</Label>
              <Select value={editNiveau || '__none__'} onValueChange={setEditNiveau}>
                <SelectTrigger id="edit-niveau">
                  <SelectValue placeholder="Sélectionner un niveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun niveau</SelectItem>
                  {niveauOptions.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Label>Statut</Label>
              <Button
                variant={editActif ? 'default' : 'outline'}
                size="sm"
                className={editActif ? 'bg-success hover:bg-success/90' : ''}
                onClick={() => setEditActif(!editActif)}
              >
                {editActif ? 'Actif' : 'Archivé'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button className="bg-success hover:bg-success/90" onClick={handleEditSubmit} disabled={isSubmitting}>
              {isSubmitting && <span className="animate-spin mr-2">⏳</span>}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détails de l&apos;étudiant</DialogTitle>
          </DialogHeader>
          {detailEtudiant && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10 text-lg font-bold text-success-text">
                  {getInitials(detailEtudiant.name)}
                </div>
                <div>
                  <h3 className="text-lg font-display font-semibold tracking-tight">{detailEtudiant.name}</h3>
                  <p className="text-sm text-muted-foreground">{detailEtudiant.email}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Matricule</p>
                  <p className="font-mono tabular-nums">{detailEtudiant.matricule || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Filière</p>
                  <p>{detailEtudiant.filiere?.nom || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Niveau</p>
                  <p>{detailEtudiant.niveau || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Statut</p>
                  <Badge className={detailEtudiant.actif ? 'bg-success/10 text-success-text border-success/30' : 'bg-warning/10 text-warning border-warning/30'}>
                    {detailEtudiant.actif ? 'Actif' : 'Archivé'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Établissement</p>
                  <p>{detailEtudiant.etablissement?.nom || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dernière connexion</p>
                  <p>{detailEtudiant.derniereConnexion ? formatDateTimeFR(detailEtudiant.derniereConnexion) : 'Jamais'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date de création</p>
                  <p>{formatDateFR(detailEtudiant.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mot de passe</p>
                  <p>{detailEtudiant.mustChangePwd ? 'À changer' : 'Défini'}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Import Dialog ─── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer des étudiants</DialogTitle>
            <DialogDescription>
              Importez une liste d&apos;étudiants depuis un fichier CSV (colonnes: name, email).
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Fichier CSV</Label>
                <div className="flex items-center gap-3">
                  <Input type="file" accept=".csv" onChange={handleFileSelect} />
                </div>
                {importParsedData.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {importParsedData.length} étudiant(s) trouvé(s) dans le fichier
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Filière (appliquée à tous les importés)</Label>
                <Select value={importFiliereId} onValueChange={setImportFiliereId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une filière" />
                  </SelectTrigger>
                  <SelectContent>
                    {filieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom}{f.code ? ` (${f.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-success/10 p-4">
                <p className="font-medium text-success-text">
                  {importResult.imported} étudiant(s) importé(s) avec succès
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-destructive">{importResult.errors.length} erreur(s) :</p>
                    <ul className="mt-1 text-xs text-destructive space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>Ligne {err.row} ({err.email}): {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {importResult.users.length > 0 && (
                <Button variant="outline" onClick={handleDownloadPasswords}>
                  <Download className="h-4 w-4 mr-1" />
                  Télécharger les mots de passe
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            {!importResult ? (
              <Button
                className="bg-success hover:bg-success/90"
                onClick={handleImportSubmit}
                disabled={isImporting || importParsedData.length === 0}
              >
                {isImporting ? <><span className="animate-spin mr-2">⏳</span>Import en cours...</> : 'Importer'}
              </Button>
            ) : (
              <Button onClick={() => setImportDialogOpen(false)}>Fermer</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Student Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Supprimer définitivement l&apos;étudiant
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Êtes-vous sûr de vouloir supprimer définitivement <strong>{deleteTarget?.name}</strong> ?
                </p>
                {/* ETUDIANTS-FIX-E10 : preview des dépendances (sessions/réponses/soumissions) */}
                {deleteDepsQuery.isLoading ? (
                  <div className="rounded-lg border border-muted bg-muted/30 p-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Chargement des dépendances…</p>
                  </div>
                ) : deleteDepsQuery.error ? (
                  <div className="rounded-lg border border-muted bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground">(dépendances indisponibles)</p>
                  </div>
                ) : deleteDepsQuery.data && (deleteDepsQuery.data.sessions > 0 || deleteDepsQuery.data.reponses > 0 || deleteDepsQuery.data.soumissions > 0) ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="text-sm font-semibold text-warning flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Données associées à cet étudiant
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-warning">
                      {deleteDepsQuery.data.sessions > 0 && (
                        <li>• <strong>{deleteDepsQuery.data.sessions}</strong> session(s) d&apos;examen</li>
                      )}
                      {deleteDepsQuery.data.reponses > 0 && (
                        <li>• <strong>{deleteDepsQuery.data.reponses}</strong> réponse(s) à des questions</li>
                      )}
                      {deleteDepsQuery.data.soumissions > 0 && (
                        <li>• <strong>{deleteDepsQuery.data.soumissions}</strong> soumission(s) de devoir</li>
                      )}
                    </ul>
                    <p className="mt-2 text-xs text-warning/80">
                      Toutes ces données seront <strong>définitivement supprimées</strong> en cascade avec l&apos;étudiant.
                    </p>
                  </div>
                ) : deleteDepsQuery.data ? (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                    <p className="text-sm text-success-text flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Aucune donnée associée — suppression sans impact.
                    </p>
                  </div>
                ) : null}
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-semibold text-destructive">
                    ⚠️ Action irréversible
                  </p>
                  <p className="mt-1 text-sm text-destructive">
                    L&apos;étudiant sera définitivement supprimé de la base de données <strong>avec tout son historique</strong> (sessions, réponses, soumissions). Cette action est irréversible.
                  </p>
                </div>
                <div className="rounded-lg border border-info/30 bg-info/10 p-3">
                  <p className="text-sm text-info">
                    💡 <strong>Alternative :</strong> Pour archiver le compte sans supprimer les données, utilisez le bouton <em>« Archiver »</em>. L&apos;étudiant restera visible dans la liste mais marqué comme inactif, et pourra être réactivé à tout moment.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteStudent}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Matricule Change Confirmation Dialog ─── */}
      <AlertDialog open={matriculeChangeDialog} onOpenChange={setMatriculeChangeDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Confirmer le changement de matricule
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Vous êtes sur le point de modifier le matricule de connexion de cet étudiant.
                  Cette action a des conséquences importantes :
                </p>
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ancien matricule :</span>
                      <span className="font-mono tabular-nums font-semibold">{matriculeChangeInfo?.oldMatricule || '(aucun)'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nouveau matricule :</span>
                      <span className="font-mono tabular-nums font-semibold text-warning">{matriculeChangeInfo?.newMatricule || '(supprimé)'}</span>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-warning mt-0.5">⚠️</span>
                    <span>L&apos;étudiant ne pourra <strong>plus se connecter</strong> avec l&apos;ancien matricule</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-text mt-0.5">✅</span>
                    <span>Le <strong>mot de passe reste inchangé</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-text mt-0.5">✅</span>
                    <span>Toutes les <strong>données sont conservées</strong> (notes, sessions, soumissions)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-info mt-0.5">📬</span>
                    <span>Une <strong>notification sera envoyée</strong> à l&apos;étudiant avec son nouveau matricule</span>
                  </li>
                </ul>
                <p className="text-sm font-medium">
                  Vérifiez que l&apos;étudiant est informé de ce changement avant de confirmer.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setMatriculeChangeDialog(false); setMatriculeChangeInfo(null); }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning hover:bg-warning/90 text-white"
              onClick={() => { setMatriculeChangeDialog(false); doEditSubmit(); }}
            >
              Confirmer le changement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Action Confirmation ─── */}
      <AlertDialog open={!!bulkActionDialog} onOpenChange={(open) => { if (!open) setBulkActionDialog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {bulkActionDialog === 'delete' && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {bulkActionDialog === 'activate' && <Power className="h-5 w-5 text-success-text" />}
              {bulkActionDialog === 'deactivate' && <PowerOff className="h-5 w-5 text-warning" />}
              Confirmation d&apos;action groupée
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkActionDialog === 'delete'
                ? `Êtes-vous sûr de vouloir supprimer définitivement ${selectedIds.size} étudiant(s) ? Cette action est irréversible et supprimera tout l'historique associé (sessions, réponses, soumissions).`
                : `Êtes-vous sûr de vouloir ${bulkActionDialog === 'activate' ? 'réactiver' : 'archiver'} ${selectedIds.size} étudiant(s) ?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={bulkActionDialog === 'delete' ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90'}
              onClick={handleBulkAction}
              disabled={isBulkProcessing}
            >
              {isBulkProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Remove Filiere Confirmation ─── */}
      <AlertDialog open={!!removeFiliereTarget} onOpenChange={(open) => !open && setRemoveFiliereTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer la filière</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous retirer {removeFiliereTarget?.name} de sa filière ? L&apos;étudiant restera dans l&apos;établissement mais ne sera plus assigné à une filière.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFromFiliere}>Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel Invitation Confirmation ─── */}
      <AlertDialog open={!!cancelInvitationTarget} onOpenChange={(open) => !open && setCancelInvitationTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler l&apos;invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous annuler l&apos;invitation envoyée à {cancelInvitationTarget?.email} ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInvitation}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════
          SECT-REG-LINK-B2C-MVP-1 : Modal "Générer un lien d'inscription"
          ═══════════════════════════════════════════════════════════════════
          GlassModal DS, 2 écrans : (1) formulaire de génération + liste des
          liens existants, (2) écran de succès avec URL copiable + partage
          WhatsApp. La liste ne contient PAS le token (sécurité backend) —
          seules les stats + bouton "Révoquer" sont affichées.
          ═══════════════════════════════════════════════════════════════════ */}
      <GlassModal
        open={showLinkDialog}
        onClose={handleCloseLinkDialog}
        title={
          showStats
            ? 'Statistiques des liens'
            : createdLink
              ? 'Lien créé !'
              : 'Générer un lien d\'inscription'
        }
        description={
          showStats
            ? 'Aperçu de l\'utilisation de vos liens d\'inscription.'
            : createdLink
              ? undefined
              : 'Partagez ce lien aux étudiants. Ils s\'inscriront eux-mêmes, la base de données se remplit automatiquement.'
        }
        size="lg"
      >
        {showStats ? (
          /* ─── Écran statistiques (SECT-REG-LINK-PHASE3-FRONTEND-1) ─── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold font-display">Statistiques des liens</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowStats(false)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Retour
              </Button>
            </div>

            {statsQuery.isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <PulseSkeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
                <PulseSkeleton className="h-40 w-full" />
              </div>
            ) : statsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Impossible de charger les statistiques. Veuillez réessayer.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => statsQuery.refetch()}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Réessayer
                </Button>
              </div>
            ) : statsQuery.data ? (
              <>
                {/* KPIs grid — 2 cols mobile, 4 cols desktop */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    label="Liens actifs"
                    value={statsQuery.data.active}
                    accent="success"
                    icon={<Link2 className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Inscriptions"
                    value={statsQuery.data.totalUses}
                    accent="info"
                    icon={<Users className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Expirent bientôt"
                    value={statsQuery.data.expiringSoon}
                    accent="warning"
                    icon={<Clock className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Taux succès"
                    value={`${Math.round(
                      (statsQuery.data.successCount /
                        Math.max(
                          1,
                          statsQuery.data.successCount +
                            statsQuery.data.failureCount,
                        )) *
                        100,
                    )}%`}
                    accent="info"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                </div>

                {/* Top links */}
                {statsQuery.data.topLinks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold font-display">
                      Top liens par inscriptions
                    </h4>
                    <div className="space-y-1">
                      {statsQuery.data.topLinks.slice(0, 5).map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                        >
                          <span className="text-sm truncate pr-2">
                            {link.label || 'Sans libellé'}
                          </span>
                          <DSBadge variant="info" size="sm">
                            {link.useCount}
                            {link.maxUses ? `/${link.maxUses}` : ''}
                          </DSBadge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failure breakdown */}
                {Object.keys(statsQuery.data.failureBreakdown).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold font-display">
                      Échecs par cause
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(statsQuery.data.failureBreakdown).map(
                        ([code, count]) => (
                          <div
                            key={code}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                          >
                            <span className="text-sm font-mono">{code}</span>
                            <DSBadge variant="danger" size="sm">{count}</DSBadge>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Daily creations trend — simple bar chart */}
                {statsQuery.data.dailyCreations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold font-display">
                      Créations (30 derniers jours)
                    </h4>
                    <div className="flex items-end gap-1 h-20">
                      {statsQuery.data.dailyCreations
                        .slice()
                        .reverse()
                        .map((d) => {
                          const max = Math.max(
                            ...statsQuery.data!.dailyCreations.map(
                              (x) => x.count,
                            ),
                            1,
                          )
                          const h = Math.max(2, (d.count / max) * 100)
                          return (
                            <div
                              key={d.day}
                              className="flex-1 bg-info/70 hover:bg-info rounded-sm transition-colors"
                              style={{ height: `${h}%` }}
                              title={`${d.day}: ${d.count}`}
                            />
                          )
                        })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : createdLink ? (
          /* ─── Écran de succès (après création) ─── */
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center py-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 mb-3">
                <CheckCircle2 className="h-7 w-7 text-success-text" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Voici votre lien d&apos;inscription. Copiez-le et partagez-le aux étudiants concernés.
              </p>
            </div>

            {/* URL copiable */}
            <div className="space-y-2">
              <Label htmlFor="created-link-url">Lien d&apos;inscription</Label>
              <div className="flex gap-2">
                <Input
                  id="created-link-url"
                  readOnly
                  value={createdLink.url}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyToClipboard(createdLink.url, 'Lien')}
                  aria-label="Copier le lien"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Métadadonnées du lien créé */}
            <div className="flex flex-wrap gap-1.5">
              <DSBadge variant="info" size="sm">
                <Clock className="h-3 w-3 mr-1" />
                Expire le {formatDateFR(createdLink.expiresAt)}
              </DSBadge>
              {createdLink.maxUses != null ? (
                <DSBadge variant="warning" size="sm">
                  {createdLink.maxUses} places
                </DSBadge>
              ) : (
                <DSBadge variant="success" size="sm">Illimité</DSBadge>
              )}
              {createdLink.label && (
                <DSBadge variant="primary" size="sm">{createdLink.label}</DSBadge>
              )}
              {createdLink.emailDomainRestriction && (
                <DSBadge variant="info" size="sm">
                  <AtSign className="h-3 w-3 mr-1" />
                  @{createdLink.emailDomainRestriction}
                </DSBadge>
              )}
              {createdLink.customWelcomeMessage && (
                <DSBadge variant="info" size="sm">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Message personnalisé
                </DSBadge>
              )}
            </div>

            {/* SECT-REG-LINK-PHASE3-FRONTEND-1 : QR code pour projection
                en amphi / partage WhatsApp / affichage en salle. */}
            {createdLink.url && (
              <div className="flex flex-col items-center gap-2 py-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Scannez pour vous inscrire
                </p>
                <div className="p-3 bg-white rounded-lg border">
                  <QRCodeSVG
                    value={createdLink.url}
                    size={160}
                    level="M"
                    marginSize={0}
                    aria-label="QR code d inscription"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center max-w-xs">
                  Idéal pour projection en amphi ou affichage en salle.
                </p>
              </div>
            )}

            {/* Message personnalisé (preview si défini) */}
            {createdLink.customWelcomeMessage && (
              <div className="rounded-md bg-info/10 border border-info/20 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-info">
                  <MessageSquare className="h-3 w-3" />
                  Message de bienvenue
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {createdLink.customWelcomeMessage}
                </p>
              </div>
            )}

            {/* Actions partage */}
            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent('Inscrivez-vous sur SECT : ' + createdLink.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button type="button" variant="outline" size="sm">
                  <MessageCircle className="h-4 w-4 mr-1.5" />
                  Partager via WhatsApp
                </Button>
              </a>
              <Button type="button" variant="ghost" size="sm" onClick={handleCloseLinkDialog}>
                Fermer
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatedLink(null)
                  setLinkLabel('')
                  setLinkFiliereId('')
                  setLinkNiveau('')
                  setLinkMaxUses('')
                  setLinkEmailDomain('')
                  setLinkCustomMessage('')
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Créer un autre lien
              </Button>
            </div>
          </div>
        ) : (
          /* ─── Écran formulaire + liste ─── */
          <div className="space-y-5">
            {/* Formulaire de génération */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="link-label">Libellé (optionnel)</Label>
                <Input
                  id="link-label"
                  placeholder="ex: Promo L1 2026"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                />
              </div>

              {canSelectFiliere && (
                <div className="space-y-2">
                  <Label htmlFor="link-filiere">Filière (optionnel)</Label>
                  <Select value={linkFiliereId || '__none__'} onValueChange={setLinkFiliereId}>
                    <SelectTrigger id="link-filiere">
                      <SelectValue placeholder="Toutes les filières" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Toutes les filières</SelectItem>
                      {filieres.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nom}{f.code ? ` (${f.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="link-niveau">Niveau (optionnel)</Label>
                  <Select value={linkNiveau || '__none__'} onValueChange={setLinkNiveau}>
                    <SelectTrigger id="link-niveau">
                      <SelectValue placeholder="Tous niveaux" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tous niveaux</SelectItem>
                      {niveauOptions.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link-max-uses">Max inscriptions (optionnel)</Label>
                  <Input
                    id="link-max-uses"
                    type="number"
                    min={1}
                    placeholder="Vide = illimité"
                    value={linkMaxUses}
                    onChange={(e) => setLinkMaxUses(e.target.value)}
                  />
                </div>
              </div>

              {/* SECT-REG-LINK-PHASE2-FRONTEND-1 : restriction de domaine email (B2B). */}
              {/* Masqué pour ENSEIGNANT (B2C) — un prof B2C n'a pas de domaine propre. */}
              {canSelectFiliere && (
                <div className="space-y-2">
                  <Label htmlFor="link-email-domain" className="flex items-center gap-1.5">
                    <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                    Domaine email autorisé (optionnel)
                  </Label>
                  <Input
                    id="link-email-domain"
                    type="text"
                    placeholder="ex: univ-ci.edu"
                    value={linkEmailDomain}
                    onChange={(e) => setLinkEmailDomain(e.target.value)}
                    aria-describedby="link-email-domain-hint"
                  />
                  <p id="link-email-domain-hint" className="text-xs text-muted-foreground">
                    Seuls les emails se terminant par @ce-domaine pourront s&apos;inscrire. Laissez vide pour autoriser tous les domaines.
                  </p>
                </div>
              )}

              {/* SECT-REG-LINK-PHASE3-FRONTEND-1 : message de bienvenue personnalisé.
                  Visible pour TOUS les rôles (B2B + B2C) — optionnel, max 500 chars. */}
              <div className="space-y-2">
                <Label htmlFor="link-custom-message" className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Message de bienvenue (optionnel)
                </Label>
                <Textarea
                  id="link-custom-message"
                  placeholder="Ex : Bienvenue en L1 Info ! Pensez à apporter votre laptop le premier jour."
                  value={linkCustomMessage}
                  onChange={(e) => setLinkCustomMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="resize-none"
                  aria-describedby="link-custom-message-hint"
                />
                <p id="link-custom-message-hint" className="text-xs text-muted-foreground">
                  {linkCustomMessage.length}/500 — affiché dans l&apos;email de bienvenue des étudiants.
                </p>
              </div>

              <div className="rounded-lg border border-info/20 bg-info/5 p-3 flex items-start gap-2">
                <Clock className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
                <p className="text-xs text-info-foreground">
                  Le lien expire dans 30 jours. Vous pouvez le révoquer à tout moment.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleCreateLink}
                disabled={isCreatingLink}
                className="w-full bg-success hover:bg-success/90 text-success-foreground"
              >
                {isCreatingLink ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Générer le lien
                  </>
                )}
              </Button>
            </div>

            <Separator />

            {/* Liste des liens existants */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold font-display">Liens existants</h4>
                <div className="flex items-center gap-2">
                  {/* SECT-REG-LINK-PHASE3-FRONTEND-1 : toggle vers la vue stats (lazy fetch). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowStats(true)}
                  >
                    <BarChart3 className="h-3.5 w-3.5 mr-1" />
                    Statistiques
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {signupLinks.length} lien(s)
                  </span>
                </div>
              </div>

              {isLoadingSignupLinks ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <PulseSkeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : signupLinks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Link2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun lien créé pour le moment.</p>
                </div>
              ) : (
                /* SECT-REG-LINK-PHASE3-FRONTEND-1 : liens regroupés par filière
                   (clé '__none__' pour les liens B2C sans filière). */
                <div className="max-h-60 overflow-y-auto space-y-3 scrollbar-thin">
                  {Object.entries(groupedLinks).map(([filiereKey, links]) => (
                    <div key={filiereKey} className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {filiereKey === '__none__'
                          ? 'Sans filière'
                          : (filieres.find((f) => f.id === filiereKey)?.nom ?? 'Filière inconnue')}
                      </div>
                      {links.map((link) => {
                        const expired = isExpired(link.expiresAt)
                        const placesRestantes =
                          link.maxUses != null ? Math.max(0, link.maxUses - link.useCount) : null
                        return (
                          <div
                            key={link.id}
                            className={`rounded-lg border p-3 space-y-2 ${
                              expired || !link.actif
                                ? 'border-destructive/30 bg-destructive/5 opacity-75'
                                : 'border-border'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {link.label || <span className="text-muted-foreground italic">Sans libellé</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Créé le {formatDateFR(link.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {!link.actif && (
                                  <DSBadge variant="danger" size="sm">Révoqué</DSBadge>
                                )}
                                {link.actif && expired && (
                                  <DSBadge variant="warning" size="sm">Expiré</DSBadge>
                                )}
                                {link.actif && !expired && (
                                  <DSBadge variant="success" size="sm">Actif</DSBadge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              {link.filiereNom && (
                                <DSBadge variant="primary" size="sm">{link.filiereNom}</DSBadge>
                              )}
                              {link.niveau && (
                                <DSBadge variant="info" size="sm">{link.niveau}</DSBadge>
                              )}
                              {link.emailDomainRestriction && (
                                <DSBadge variant="info" size="sm">
                                  <AtSign className="h-3 w-3 mr-0.5" />
                                  @{link.emailDomainRestriction}
                                </DSBadge>
                              )}
                              {link.customWelcomeMessage && (
                                <DSBadge variant="info" size="sm">
                                  <MessageSquare className="h-3 w-3 mr-0.5" />
                                  Message perso
                                </DSBadge>
                              )}
                              <span className="text-muted-foreground">
                                <Users className="h-3 w-3 inline mr-0.5" />
                                {link.useCount}
                                {link.maxUses != null ? ` / ${link.maxUses}` : ' inscriptions'}
                                {placesRestantes != null && placesRestantes === 0 && ' (complet)'}
                              </span>
                              <span className="text-muted-foreground">
                                <Clock className="h-3 w-3 inline mr-0.5" />
                                {getExpiryCountdown(link.expiresAt)}
                              </span>
                            </div>
                            {link.actif && !expired && (
                              <div className="flex justify-end pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 px-2"
                                  onClick={() => setRevokeLinkTarget(link)}
                                  aria-label={`Révoquer le lien ${link.label || 'sans libellé'}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Révoquer
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </GlassModal>

      {/* ─── Revoke Signup Link Confirmation ─── */}
      <AlertDialog
        open={!!revokeLinkTarget}
        onOpenChange={(open) => !open && setRevokeLinkTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Révoquer le lien d&apos;inscription
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous révoquer le lien{' '}
              <span className="font-medium">{revokeLinkTarget?.label || 'sans libellé'}</span> ? Les
              étudiants qui ont déjà commencé leur inscription peuvent la terminer, mais aucun nouvel
              étudiant ne pourra utiliser ce lien. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevokingLink}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRevokeLink}
              disabled={isRevokingLink}
            >
              {isRevokingLink && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Révoquer le lien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SECT-REG-LINK-PHASE3-FRONTEND-1 : StatCard helper pour la vue statistiques.
// Petit carte KPI compacte avec icône accentuée + valeur + libellé.
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: number | string
  accent: 'success' | 'warning' | 'info' | 'danger'
  icon: React.ReactNode
}) {
  const accentClass = {
    success: 'text-success-text bg-success/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
    danger: 'text-destructive bg-destructive/10',
  }[accent]
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className={`inline-flex p-1.5 rounded-md ${accentClass} mb-2`}>
        {icon}
      </div>
      <div className="text-2xl font-bold font-mono tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
