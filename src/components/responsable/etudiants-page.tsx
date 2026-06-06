'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const etablissementId = user?.etablissementId || user?.etablissement?.id || ''

  // ─── Data state ───
  const [etudiants, setEtudiants] = useState<EtudiantItem[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalFromApi, setTotalFromApi] = useState(0)
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [niveauFilter, setNiveauFilter] = useState('all')

  // ─── Pagination ───
  const [page, setPage] = useState(1)
  const pageSize = 20

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
  const [directResult, setDirectResult] = useState<{ email: string; temporaryPassword: string; name: string } | null>(null)

  // ─── Edit form state ───
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editFiliereId, setEditFiliereId] = useState('')
  const [editActif, setEditActif] = useState(true)

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

  // ─── Fetch filieres for this responsable ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (etablissementId) params.set('etablissementId', etablissementId)
      const res = await fetch(`/api/filieres?${params.toString()}`, { headers: getAuthHeaders() })
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
  }, [etablissementId])

  // ─── Fetch students ───
  // FIX: Now uses etablissementId to filter server-side instead of fragile client-side filiereIds filtering
  const fetchEtudiants = useCallback(async () => {
    setIsLoading(true)
    try {
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

      const res = await fetch(`/api/users?${params.toString()}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        // API now returns only students from the RESPONSABLE's establishment
        // No more fragile client-side filiereIds filtering needed
        const users = (data.users ?? []) as EtudiantItem[]
        const totalCount = data.total ?? 0

        // Client-side niveau filter (niveau not supported as API param yet)
        const filtered = niveauFilter !== 'all'
          ? users.filter((u: EtudiantItem) => u.niveau === niveauFilter)
          : users

        setEtudiants(filtered)
        setTotalFromApi(totalCount)
      } else {
        setEtudiants([])
        setTotalFromApi(0)
      }
    } catch {
      setEtudiants([])
      setTotalFromApi(0)
    } finally {
      setIsLoading(false)
    }
  }, [etablissementId, searchDebounced, filiereFilter, statusFilter, niveauFilter, page])

  // ─── Fetch pending invitations ───
  const fetchInvitations = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingInvitations(true)
    try {
      const params = new URLSearchParams()
      params.set('createdById', user.id)
      params.set('used', 'false')
      params.set('limit', '50')

      const res = await fetch(`/api/invitations?${params.toString()}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const etuInvitations = (data.invitations ?? []).filter(
          (inv: InvitationItem) => inv.role === 'ETUDIANT'
        )
        setInvitations(etuInvitations)
      }
    } catch {
      // Silent
    } finally {
      setIsLoadingInvitations(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchFilieres()
  }, [fetchFilieres])

  useEffect(() => {
    fetchEtudiants()
  }, [fetchEtudiants])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filiereFilter, statusFilter, niveauFilter, searchDebounced])

  // ─── Stats ───
  const totalEtudiants = totalFromApi
  const activeEtudiants = etudiants.filter((e) => e.actif).length
  const withFiliere = etudiants.filter((e) => e.filiereId).length
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
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'invitation')
      }

      const data = await res.json()
      setInvitationTokenResult({ token: data.token, email: invEmail })
      toast.success('Invitation envoyée', { description: `Invitation envoyée à ${invEmail}` })
      await fetchInvitations()
      await fetchEtudiants()
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
      if (directFiliereId) body.filiereId = directFiliereId
      if (etablissementId) body.etablissementId = etablissementId
      if (directMatricule) body.matricule = directMatricule

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
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
      await fetchEtudiants()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
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
          ...getAuthHeaders(),
        },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors du renvoi')
      }
      toast.success('Invitation renvoyée', { description: `Nouvelle invitation envoyée à ${invitation.email}` })
      await fetchInvitations()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Impossible de renvoyer l\'invitation.' })
    }
  }

  // ─── Cancel invitation ───
  const handleCancelInvitation = async () => {
    if (!cancelInvitationTarget) return
    try {
      const res = await fetch(`/api/invitations/${cancelInvitationTarget.id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
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
      await fetchInvitations()
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
    setEditActif(etudiant.actif)
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleEditSubmit = async () => {
    if (!editingEtudiant) return
    if (!editName || !editEmail) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: editName,
        email: editEmail,
        filiereId: editFiliereId && editFiliereId !== '__none__' ? editFiliereId : null,
        actif: editActif,
      }

      const res = await fetch(`/api/users/${editingEtudiant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la modification')
      }

      toast.success('Étudiant modifié', { description: `${editName} a été mis à jour.` })
      setEditDialogOpen(false)
      setEditingEtudiant(null)
      await fetchEtudiants()
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
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ actif: !etudiant.actif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(etudiant.actif ? 'Étudiant désactivé' : 'Étudiant activé', {
        description: `${etudiant.name} est maintenant ${etudiant.actif ? 'inactif' : 'actif'}.`,
      })
      await fetchEtudiants()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Remove from filiere ───
  const handleRemoveFromFiliere = async () => {
    if (!removeFiliereTarget) return
    try {
      const res = await fetch(`/api/users/${removeFiliereTarget.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ filiereId: null }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Filière retirée', {
        description: `${removeFiliereTarget.name} a été retiré de sa filière.`,
      })
      setRemoveFiliereTarget(null)
      await fetchEtudiants()
    } catch {
      toast.error('Erreur', { description: 'Impossible de retirer la filière.' })
    }
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
          ...getAuthHeaders(),
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
          description: `${data.imported} étudiant${data.imported > 1 ? 's' : ''} importé${data.imported > 1 ? 's' : ''}.`,
        })
      }

      await fetchEtudiants()
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
      `${e.matricule || ''},${e.name},${e.email},${e.filiere?.nom || ''},${e.niveau || ''},${e.actif ? 'Actif' : 'Inactif'},${formatDateFR(e.createdAt)}`
    )
    const csv = [header, ...rows].join('\n')
    downloadCSV(csv, `etudiants-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('Export réussi', { description: `${etudiants.length} étudiant(s) exporté(s).` })
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

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-emerald-600" />
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
          <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950" onClick={handleOpenImport}>
            <Upload className="h-4 w-4" />
            Importer CSV
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4" />
            Ajouter un étudiant
          </Button>
        </div>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total étudiants</p>
              <p className="text-xl font-bold">{totalEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <GraduationCap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold">{activeEtudiants}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec filière</p>
              <p className="text-xl font-bold">{withFiliere}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
              <Mail className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invitations en attente</p>
              <p className="text-xl font-bold">{pendingInvitations}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invitations expirées</p>
              <p className="text-xl font-bold">{expiredInvitations}</p>
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
            <SelectTrigger className="w-[200px]">
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
            <SelectTrigger className="w-[130px]">
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
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && etudiants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <GraduationCap className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun étudiant trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || filiereFilter !== 'all' || statusFilter !== 'all' || niveauFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : 'Commencez par ajouter des étudiants ou importez-les depuis un fichier CSV.'}
          </p>
          {!search && filiereFilter === 'all' && statusFilter === 'all' && niveauFilter === 'all' && (
            <div className="mt-6 flex gap-3">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4" />
                Ajouter un étudiant
              </Button>
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950" onClick={handleOpenImport}>
                <Upload className="h-4 w-4" />
                Importer CSV
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Card view ─── */}
      {!isLoading && etudiants.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {etudiants.map((etudiant) => (
            <Card key={etudiant.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-3 p-5">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {getInitials(etudiant.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold leading-tight truncate">{etudiant.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{etudiant.email}</p>
                  </div>
                </div>

                {/* Info row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {etudiant.filiere ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">
                      <GraduationCap className="h-3 w-3 mr-0.5" />
                      {etudiant.filiere.nom}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800">
                      Sans filière
                    </Badge>
                  )}
                  {etudiant.niveau && (
                    <Badge variant="outline" className="text-xs">
                      {etudiant.niveau}
                    </Badge>
                  )}
                  {etudiant.actif ? (
                    <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 text-xs">Actif</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
                  )}
                </div>

                {/* Matricule + date */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {etudiant.matricule ? (
                    <span className="font-mono">{etudiant.matricule}</span>
                  ) : (
                    <span>—</span>
                  )}
                  <span>{formatDateFR(etudiant.createdAt)}</span>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleOpenEdit(etudiant)}
                  >
                    <Edit3 className="h-3 w-3" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleToggleActive(etudiant)}
                  >
                    {etudiant.actif ? (
                      <><PowerOff className="h-3 w-3" />Désactiver</>
                    ) : (
                      <><Power className="h-3 w-3" />Activer</>
                    )}
                  </Button>
                  {etudiant.filiereId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                      onClick={() => setRemoveFiliereTarget(etudiant)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewDetail(etudiant)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
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
                  <TableHead className="w-[40px]">+</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Matricule</TableHead>
                  <TableHead>Filière</TableHead>
                  <TableHead className="hidden lg:table-cell">Niveau</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {etudiants.map((etudiant) => (
                  <TableRow key={etudiant.id} className={!etudiant.actif ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {getInitials(etudiant.name)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{etudiant.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{etudiant.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="font-mono text-xs">{etudiant.matricule || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {etudiant.filiere ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">
                          {etudiant.filiere.nom}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {etudiant.niveau ? (
                        <Badge variant="outline" className="text-xs">{etudiant.niveau}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {etudiant.actif ? (
                        <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 text-xs">Actif</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(etudiant)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleToggleActive(etudiant)}>
                          {etudiant.actif ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetail(etudiant)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
        <Card className="border-sky-200 dark:border-sky-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                Invitations en cours ({invitations.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-sky-600 hover:text-sky-700"
                onClick={fetchInvitations}
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
                    <TableHead>Email</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Filière</TableHead>
                    <TableHead>Expire dans</TableHead>
                    <TableHead className="hidden sm:table-cell">Créée le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => {
                    const expired = isExpired(invitation.expiresAt)
                    return (
                      <TableRow key={invitation.id} className={expired ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                        <TableCell className="text-sm font-medium">{invitation.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{invitation.name || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {invitation.Filiere ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">
                              {invitation.Filiere.nom}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 text-xs">
                              <XCircle className="h-3 w-3 mr-0.5" />
                              Expirée
                            </Badge>
                          ) : (
                            <Badge className="bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800 text-xs">
                              <Clock className="h-3 w-3 mr-0.5" />
                              {getExpiryCountdown(invitation.expiresAt)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{formatDateTimeFR(invitation.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {expired && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950 h-7 text-xs"
                                onClick={() => handleRenvoyerInvitation(invitation)}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Renvoyer
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 h-7 text-xs"
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
              className={registrationMode === 'invitation' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              onClick={() => setRegistrationMode('invitation')}
            >
              <Mail className="h-4 w-4 mr-1" />
              Invitation
            </Button>
            <Button
              variant={registrationMode === 'direct' ? 'default' : 'outline'}
              size="sm"
              className={registrationMode === 'direct' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
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
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
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
                <Select value={directFiliereId} onValueChange={setDirectFiliereId}>
                  <SelectTrigger id="direct-filiere">
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
              <div className="space-y-2">
                <Label htmlFor="direct-matricule">Matricule (auto-généré si vide)</Label>
                <Input id="direct-matricule" placeholder="Laissez vide pour auto-génération" value={directMatricule} onChange={(e) => setDirectMatricule(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            {!invitationTokenResult && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
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
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{directResult.name}</p>
                <p className="text-sm text-muted-foreground">{directResult.email}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Mot de passe temporaire :</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-white dark:bg-gray-900 p-2 rounded border font-mono">
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
            <div className="flex items-center gap-3">
              <Label>Statut</Label>
              <Button
                variant={editActif ? 'default' : 'outline'}
                size="sm"
                className={editActif ? 'bg-teal-600 hover:bg-teal-700' : ''}
                onClick={() => setEditActif(!editActif)}
              >
                {editActif ? 'Actif' : 'Inactif'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditSubmit} disabled={isSubmitting}>
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
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {getInitials(detailEtudiant.name)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{detailEtudiant.name}</h3>
                  <p className="text-sm text-muted-foreground">{detailEtudiant.email}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Matricule</p>
                  <p className="font-mono">{detailEtudiant.matricule || '—'}</p>
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
                  <Badge className={detailEtudiant.actif ? 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}>
                    {detailEtudiant.actif ? 'Actif' : 'Inactif'}
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
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <p className="font-medium text-emerald-800 dark:text-emerald-200">
                  {importResult.imported} étudiant(s) importé(s) avec succès
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-red-600">{importResult.errors.length} erreur(s) :</p>
                    <ul className="mt-1 text-xs text-red-500 space-y-1">
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
                className="bg-emerald-600 hover:bg-emerald-700"
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
    </div>
  )
}
