'use client'

import { useState, useEffect, useCallback } from 'react'
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
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Mail,
  Zap,
  Send,
  Copy,
  Clock,
  RefreshCw,
  XCircle,
  ShieldAlert,
  KeyRound,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

interface EtudiantItem {
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

  // ─── Data state ───
  const [etudiants, setEtudiants] = useState<EtudiantItem[]>([])
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalFromApi, setTotalFromApi] = useState(0)
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

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

  // ─── Get filiere IDs managed by this responsable ───
  const filiereIds = filieres.map((f) => f.id)

  // ─── Fetch filieres for this responsable ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
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
  }, [user?.id])

  // ─── Fetch students ───
  const fetchEtudiants = useCallback(async () => {
    setIsLoading(true)
    try {
      const allEtudiants: EtudiantItem[] = []
      let totalCount = 0

      if (filiereIds.length > 0) {
        const params = new URLSearchParams()
        params.set('role', 'ETUDIANT')
        params.set('limit', '200')
        if (search) params.set('search', search)
        if (filiereFilter && filiereFilter !== 'all') params.set('filiereId', filiereFilter)
        if (statusFilter && statusFilter !== 'all') params.set('actif', statusFilter === 'actif' ? 'true' : 'false')

        const res = await fetch(`/api/users?${params.toString()}`, { headers: getAuthHeaders() })
        if (res.ok) {
          const data = await res.json()
          const users = (data.users ?? []) as EtudiantItem[]
          totalCount = data.total ?? 0
          const filtered = filiereFilter === 'all'
            ? users.filter((u: EtudiantItem) => u.filiereId && filiereIds.includes(u.filiereId))
            : users
          allEtudiants.push(...filtered)
        }
      }

      setEtudiants(allEtudiants)
      setTotalFromApi(totalCount)
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [filiereIds, search, filiereFilter, statusFilter])

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
        // Only show ETUDIANT invitations
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
    if (filiereIds.length > 0) {
      fetchEtudiants()
    } else {
      setIsLoading(false)
    }
  }, [search, filiereFilter, statusFilter, filiereIds])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  // ─── Stats ───
  const totalEtudiants = etudiants.length
  const activeEtudiants = etudiants.filter((e) => e.actif).length
  const withFiliere = etudiants.filter((e) => e.filiereId).length
  const pendingInvitations = invitations.filter((inv) => !isExpired(inv.expiresAt)).length
  const expiredInvitations = invitations.filter((inv) => isExpired(inv.expiresAt)).length

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
      if (user?.etablissementId) body.etablissementId = user.etablissementId
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
      if (user?.etablissementId) body.etablissementId = user.etablissementId
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
        filiereId: editFiliereId || null,
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
      if (user?.etablissementId) body.etablissementId = user.etablissementId

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

  // ─── Reset import state ───
  const handleOpenImport = () => {
    setImportFile(null)
    setImportParsedData([])
    setImportFiliereId('')
    setIsImporting(false)
    setImportResult(null)
    setImportDialogOpen(true)
  }

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
            Gérez les étudiants de vos filières et importez-les en masse
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
      {!isLoading && etudiants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <GraduationCap className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun étudiant trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || filiereFilter !== 'all' || statusFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres. Essayez de modifier vos critères.'
              : filieres.length === 0
                ? 'Vous n\'avez aucune filière assignée. Les étudiants seront visibles une fois vos filières configurées.'
                : 'Commencez par ajouter des étudiants ou importez-les depuis un fichier CSV.'}
          </p>
          {!search && filiereFilter === 'all' && statusFilter === 'all' && filieres.length > 0 && (
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

      {/* ─── Student card grid ─── */}
      {!isLoading && etudiants.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {etudiants.map((etudiant) => (
            <Card key={etudiant.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-6">
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

                {/* Badges */}
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
                  {etudiant.actif ? (
                    <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 text-xs">Actif</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
                  )}
                </div>

                {/* Date */}
                <div className="text-xs text-muted-foreground">
                  Créé le {formatDateFR(etudiant.createdAt)}
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(etudiant)}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(etudiant)}
                  >
                    {etudiant.actif ? (
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
                  {etudiant.filiereId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                      onClick={() => setRemoveFiliereTarget(etudiant)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Retirer filière
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                    onClick={() => handleViewDetail(etudiant)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Invitation Tracking Section ─── */}
      {!isLoading && invitations.length > 0 && (
        <Card className="border-sky-200 dark:border-sky-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                Invitations en cours
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
                    <TableHead>Créée le</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{formatDateTimeFR(invitation.createdAt)}</TableCell>
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
                              <XCircle className="h-3 w-3" />
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

      {/* ─── Add Student Dialog (Dual Registration) ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
              Ajouter un étudiant
            </DialogTitle>
            <DialogDescription>
              Choisissez le mode d&apos;inscription pour le nouvel étudiant.
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="flex rounded-lg border p-1 bg-muted/50">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                registrationMode === 'invitation'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              onClick={() => {
                setRegistrationMode('invitation')
                setInvitationTokenResult(null)
              }}
            >
              <Mail className="h-4 w-4" />
              📧 Invitation par email
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                registrationMode === 'direct'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              onClick={() => setRegistrationMode('direct')}
            >
              <Zap className="h-4 w-4" />
              ⚡ Création directe
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* ─── Invitation Mode ─── */}
            {registrationMode === 'invitation' && !invitationTokenResult && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="inv-email">Email *</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="Ex: jean.dupont@universite.fr"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inv-name">Nom</Label>
                  <Input
                    id="inv-name"
                    placeholder="Optionnel — l'étudiant pourra le définir lui-même"
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    L&apos;étudiant pourra le définir lui-même lors de l&apos;inscription.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inv-filiere">Filière</Label>
                  <Select value={invFiliereId} onValueChange={setInvFiliereId}>
                    <SelectTrigger id="inv-filiere">
                      <SelectValue placeholder="Sélectionner une filière (optionnel)" />
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
                  <Label>Établissement</Label>
                  <Input
                    value={user?.etablissement?.nom ?? user?.etablissementId ?? '—'}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Renseigné automatiquement depuis votre profil.
                  </p>
                </div>
              </>
            )}

            {/* ─── Invitation Success ─── */}
            {registrationMode === 'invitation' && invitationTokenResult && (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                        Invitation envoyée avec succès
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                        Un email d&apos;invitation a été envoyé à <strong>{invitationTokenResult.email}</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    Lien d&apos;invitation (pour test)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={`/auth/invitation?token=${invitationTokenResult.token}`}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyToClipboard(
                        `${window.location.origin}/auth/invitation?token=${invitationTokenResult.token}`,
                        'Lien d\'invitation'
                      )}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    En production, ce lien serait envoyé par email. Pour les tests, vous pouvez le copier.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setInvitationTokenResult(null)
                    setInvEmail('')
                    setInvName('')
                    setInvFiliereId('')
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Envoyer une autre invitation
                </Button>
              </div>
            )}

            {/* ─── Direct Creation Mode ─── */}
            {registrationMode === 'direct' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="direct-name">Nom complet *</Label>
                  <Input
                    id="direct-name"
                    placeholder="Ex: Jean Dupont"
                    value={directName}
                    onChange={(e) => setDirectName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-email">Email *</Label>
                  <Input
                    id="direct-email"
                    type="email"
                    placeholder="Ex: jean.dupont@universite.fr"
                    value={directEmail}
                    onChange={(e) => setDirectEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direct-filiere">Filière</Label>
                  <Select value={directFiliereId} onValueChange={setDirectFiliereId}>
                    <SelectTrigger id="direct-filiere">
                      <SelectValue placeholder="Sélectionner une filière (optionnel)" />
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
                  <Label htmlFor="direct-matricule">Matricule</Label>
                  <Input
                    id="direct-matricule"
                    placeholder="Ex: 2024-001 (optionnel)"
                    value={directMatricule}
                    onChange={(e) => setDirectMatricule(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Établissement</Label>
                  <Input
                    value={user?.etablissement?.nom ?? user?.etablissementId ?? '—'}
                    disabled
                    className="bg-muted"
                  />
                </div>

                {/* Info banner */}
                <div className="rounded-lg border border-teal-300 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/30">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-teal-700 dark:text-teal-300">
                      Un mot de passe temporaire sera généré automatiquement. L&apos;étudiant devra le changer à sa première connexion.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annuler
            </Button>
            {registrationMode === 'invitation' && !invitationTokenResult && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleInvitationSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Envoyer l&apos;invitation
              </Button>
            )}
            {registrationMode === 'direct' && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleDirectSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Créer le compte
              </Button>
            )}
            {registrationMode === 'invitation' && invitationTokenResult && (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(false)}>
                Fermer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Direct Creation Result Dialog ─── */}
      <Dialog open={directResultDialogOpen} onOpenChange={(open) => { if (!open) setDirectResultDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Compte étudiant créé
            </DialogTitle>
            <DialogDescription>
              Transmettez les identifiants à l&apos;étudiant de manière sécurisée.
            </DialogDescription>
          </DialogHeader>

          {directResult && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nom</Label>
                  <p className="text-sm font-medium">{directResult.name}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono">{directResult.email}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleCopyToClipboard(directResult.email, 'Email')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mot de passe temporaire</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                      {directResult.temporaryPassword}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleCopyToClipboard(directResult.temporaryPassword, 'Mot de passe')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Security warning */}
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Avertissement de sécurité
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      L&apos;étudiant devra changer ce mot de passe lors de sa première connexion.
                      Ne partagez ces identifiants que par un canal sécurisé.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDirectResultDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Import CSV Dialog ─── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) setImportDialogOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-amber-600" />
              Importer des étudiants via CSV
            </DialogTitle>
            <DialogDescription>
              Importez une liste d&apos;étudiants depuis un fichier CSV. Format attendu : name, email (avec en-tête).
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* File upload */}
            {!importResult && (
              <>
                <div className="space-y-2">
                  <Label>Fichier CSV</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-6 py-4 text-sm text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:border-emerald-700">
                      <FileUp className="h-5 w-5" />
                      {importFile ? importFile.name : 'Choisir un fichier CSV'}
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </label>
                    <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                      <Download className="h-3.5 w-3.5" />
                      Template
                    </Button>
                  </div>
                </div>

                {/* Filiere selector for all imports */}
                <div className="space-y-2">
                  <Label>Filière pour tous les imports</Label>
                  <Select value={importFiliereId} onValueChange={setImportFiliereId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une filière" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune filière</SelectItem>
                      {filieres.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nom}{f.code ? ` (${f.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview table */}
                {importParsedData.length > 0 && (
                  <div className="space-y-2">
                    <Label>
                      Aperçu des données ({importParsedData.length} étudiant{importParsedData.length > 1 ? 's' : ''} détecté{importParsedData.length > 1 ? 's' : ''})
                    </Label>
                    <div className="rounded-lg border max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Nom</TableHead>
                            <TableHead>Email</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importParsedData.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                              <TableCell className="text-sm">{row.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{row.email}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {importFile && importParsedData.length === 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Aucune donnée valide</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          Le fichier CSV ne contient aucune ligne valide. Vérifiez que le format est : name, email (avec en-tête sur la première ligne).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Import result */}
            {importResult && (
              <div className="space-y-4">
                {/* Success summary */}
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                        {importResult.imported} étudiant{importResult.imported > 1 ? 's' : ''} importé{importResult.imported > 1 ? 's' : ''} avec succès
                      </p>
                      {importResult.errors.length > 0 && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                          {importResult.errors.length} erreur{importResult.errors.length > 1 ? 's' : ''} lors de l&apos;import.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Errors list */}
                {importResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-amber-700 dark:text-amber-400">Erreurs d&apos;import</Label>
                    <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Ligne</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Erreur</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importResult.errors.map((err, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs text-muted-foreground">{err.row}</TableCell>
                              <TableCell className="text-sm">{err.email || '—'}</TableCell>
                              <TableCell className="text-sm text-amber-700 dark:text-amber-400">{err.error}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Generated passwords download */}
                {importResult.users.length > 0 && (
                  <div className="space-y-2">
                    <Label>Mots de passe générés</Label>
                    <div className="rounded-lg border max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nom</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Mot de passe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importResult.users.map((u, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm font-medium">{u.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                              <TableCell className="text-sm font-mono">{u.password}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      onClick={handleDownloadPasswords}
                    >
                      <Download className="h-4 w-4" />
                      Télécharger les mots de passe (CSV)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            {importResult ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setImportDialogOpen(false)}
              >
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Importer {importParsedData.length > 0 ? `(${importParsedData.length})` : ''}
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Student Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditDialogOpen(false); setEditingEtudiant(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-emerald-600" />
              Modifier l&apos;étudiant
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de {editingEtudiant?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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

            <div className="space-y-2">
              <Label htmlFor="edit-filiere">Filière</Label>
              <Select value={editFiliereId || 'none'} onValueChange={(v) => setEditFiliereId(v === 'none' ? '' : v)}>
                <SelectTrigger id="edit-filiere">
                  <SelectValue placeholder="Sélectionner une filière" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune filière</SelectItem>
                  {filieres.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nom}{f.code ? ` (${f.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded border border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40">
                {editActif && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <Label
                className="cursor-pointer"
                onClick={() => setEditActif(!editActif)}
              >
                Étudiant actif
              </Label>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingEtudiant(null) }}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleEditSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove from Filiere Confirmation ─── */}
      <AlertDialog open={!!removeFiliereTarget} onOpenChange={(open) => { if (!open) setRemoveFiliereTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer de la filière</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer <strong>{removeFiliereTarget?.name}</strong> de la filière <strong>{removeFiliereTarget?.filiere?.nom}</strong> ?
              L&apos;étudiant ne sera pas supprimé, il sera simplement sans filière.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleRemoveFromFiliere}
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
              Êtes-vous sûr de vouloir annuler l&apos;invitation pour <strong>{cancelInvitationTarget?.email}</strong> ?
              Cette action est irréversible.
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

      {/* ─── Detail View Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!open) { setDetailDialogOpen(false); setDetailEtudiant(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
              Détails de l&apos;étudiant
            </DialogTitle>
            <DialogDescription>
              Informations complètes de l&apos;étudiant
            </DialogDescription>
          </DialogHeader>

          {detailEtudiant && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6">
                {/* Avatar + name */}
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    {getInitials(detailEtudiant.name)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{detailEtudiant.name}</h3>
                    <p className="text-sm text-muted-foreground">{detailEtudiant.email}</p>
                  </div>
                </div>

                <Separator />

                {/* Info grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Statut :</span>
                    {detailEtudiant.actif ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Actif</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">Inactif</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Filière :</span>
                    {detailEtudiant.filiere ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                        {detailEtudiant.filiere.nom}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800">
                        Sans filière
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Établissement :</span>
                    <span className="font-medium">{detailEtudiant.etablissement?.nom ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Créé le :</span>
                    <span>{formatDateFR(detailEtudiant.createdAt)}</span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Fermer
            </Button>
            {detailEtudiant && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setDetailDialogOpen(false)
                  handleOpenEdit(detailEtudiant)
                }}
              >
                <Edit3 className="h-4 w-4" />
                Modifier
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
