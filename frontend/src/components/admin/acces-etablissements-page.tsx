'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  ShieldCheck,
  Clock,
  Building2,
  Plus,
  Send,
  Eye,
  RotateCcw,
  X,
  Ban,
  Loader2,
  Lock,
  MapPin,
  Users,
  GraduationCap,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  FileText,
  LifeBuoy,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PulseSkeleton } from '@/components/ds'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

interface AccessRecord {
  id: string
  adminId: string
  etablissementId: string
  motif: string
  statut: 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE' | 'EXPIRE'
  dateDebut: string | null
  dateFin: string | null
  commentaire: string | null
  approuvePar: string | null
  createdAt: string
  // BUGFIX (ADMIN-AUDIT-4) : admin + etablissement optionnels (l'API peut
  // ne pas inclure les relations). Optional chaining + fallback partout.
  admin?: { id: string; name: string; email: string }
  etablissement?: { id: string; nom: string; ville: string | null; actif: boolean }
}

interface AuthorizedEtablissement {
  id: string
  nom: string
  type: string | null
  ville: string | null
  pays: string | null
  email: string | null
  telephone: string | null
  actif: boolean
  // BUGFIX (ADMIN-AUDIT-4b) : access optionnel (l'API peut ne pas l'inclure).
  // Optional chaining partout pour éviter le crash etab.access.dateFin.
  access?: {
    id: string
    motif: string
    dateDebut: string | null
    dateFin: string | null
    commentaire: string | null
    createdAt: string
  }
}

interface EtablissementOption {
  id: string
  nom: string
  ville: string | null
  type: string | null
  actif: boolean
  _count: { filieres: number; users: number }
}

// ─── Utility functions ───

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'EN_ATTENTE':
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30">
          <Clock className="h-3 w-3 mr-1" />
          En attente
        </Badge>
      )
    case 'APPROUVE':
      return (
        <Badge className="bg-success/10 text-success-text border-success/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approuvé
        </Badge>
      )
    case 'REFUSE':
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/30">
          <X className="h-3 w-3 mr-1" />
          Refusé
        </Badge>
      )
    case 'EXPIRE':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expiré
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getMotifLabel(motif: string) {
  switch (motif) {
    case 'Audit':
      return 'Audit'
    case 'Support technique':
      return 'Support technique'
    case 'Inspection':
      return 'Inspection'
    case 'Urgence':
      return 'Urgence'
    default:
      return motif
  }
}

// ─── Main Component ───

export function AccesEtablissementsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Les 3 ressources sont indépendantes → 3 useQuery séparés.
  const accessQuery = useQuery<{ accessRecords: AccessRecord[] }>({
    queryKey: ['etablissement-access', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/etablissement-access?adminId=${user!.id}`)
      if (!res.ok) throw new Error('Failed to fetch access records')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const authorizedQuery = useQuery<{ etablissements: AuthorizedEtablissement[] }>({
    queryKey: ['authorized-etablissements', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/etablissement-access/authorized-etablissements?adminId=${user!.id}`)
      if (!res.ok) throw new Error('Failed to fetch authorized etablissements')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etablissementsQuery = useQuery<{ etablissements: EtablissementOption[] }>({
    queryKey: ['etablissements'],
    queryFn: async () => {
      const res = await fetch('/api/etablissements')
      if (!res.ok) throw new Error('Failed to fetch etablissements')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ACCES-ETABLISSEMENTS-FIX : demandes à approuver (RESPONSABLE uniquement).
  // Fetch sans adminId → le backend filtre par etablissementId du responsable.
  const isResponsable = user?.role === 'RESPONSABLE'
  const pendingQuery = useQuery<{ accessRecords: AccessRecord[] }>({
    queryKey: ['etablissement-access-pending', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/etablissement-access?statut=EN_ATTENTE')
      if (!res.ok) throw new Error('Failed to fetch pending requests')
      return res.json()
    },
    enabled: isResponsable,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  const pendingRecords = pendingQuery.data?.accessRecords ?? []

  const accessRecords = accessQuery.data?.accessRecords ?? []
  const authorizedEtablissements = authorizedQuery.data?.etablissements ?? []
  const etablissements = useMemo(
    () =>
      (etablissementsQuery.data?.etablissements ?? []).map((e: EtablissementOption) => ({
        id: e.id,
        nom: e.nom,
        ville: e.ville,
        type: e.type,
        actif: e.actif,
        _count: e._count ?? { filieres: 0, users: 0 },
      })),
    [etablissementsQuery.data],
  )
  const isLoading =
    accessQuery.isLoading || authorizedQuery.isLoading || etablissementsQuery.isLoading

  // BUGFIX B-9 : toasts one-shot sur erreur de fetch. Les useEffect ne se
  // redéclenchent que sur transition false→true de isError (tableau de dep
  // à un seul booléen), donc pas de spam de toasts au re-render.
  useEffect(() => {
    if (accessQuery.isError)
      toast.error('Erreur', { description: 'Impossible de charger vos demandes d\'accès.' })
  }, [accessQuery.isError])
  useEffect(() => {
    if (authorizedQuery.isError)
      toast.error('Erreur', { description: 'Impossible de charger vos établissements autorisés.' })
  }, [authorizedQuery.isError])
  useEffect(() => {
    if (etablissementsQuery.isError)
      toast.error('Erreur', { description: 'Impossible de charger la liste des établissements.' })
  }, [etablissementsQuery.isError])

  // Helper pour invalider le cache après mutation (create/delete).
  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['etablissement-access', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['authorized-etablissements', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['etablissements'] }),
      queryClient.invalidateQueries({ queryKey: ['etablissement-access-pending', user?.id] }),
    ])
  }

  // ACCES-ETABLISSEMENTS-FIX : approbation/refus d'une demande (RESPONSABLE).
  // PATCH /api/etablissement-access/{id} avec statut APPROUVE ou REFUSE.
  const [processingId, setProcessingId] = useState<string | null>(null)
  const handleApproveRequest = async (record: AccessRecord, statut: 'APPROUVE' | 'REFUSE') => {
    setProcessingId(record.id)
    try {
      const res = await fetch(`/api/etablissement-access/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors du traitement')
      }
      toast.success(statut === 'APPROUVE' ? 'Demande approuvée' : 'Demande refusée', {
        description: statut === 'APPROUVE'
          ? "L'admin a maintenant accès à votre établissement."
          : 'La demande a été refusée.',
      })
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setProcessingId(null)
    }
  }

  // ─── Dialog state ───
  const [cancelTarget, setCancelTarget] = useState<AccessRecord | null>(null)
  // ACCESS-WORKFLOW-UI : cible pour la révocation d'un accès APPROUVE par l'ADMIN.
  // Le bouton "Révoquer" apparaît à côté de "Voir l'établissement" pour les
  // enregistrements APPROUVE. La mutation PATCH envoie {statut: REFUSE,
  // commentaire: "Accès révoqué par l'admin"} → le backend Update() accepte ce
  // statut (validStatuts contient AccessRefuse) sans vérifier l'ownership côté
  // ADMIN (le usecase ne fait le check EtablissementID que pour RESPONSABLE).
  const [revokeTarget, setRevokeTarget] = useState<AccessRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // BUGFIX B-7 : protection anti double-clic sur les boutons "Annuler" et
  // "Révoquer" des AlertDialogs. Désactive l'AlertDialogAction pendant la
  // mutation pour éviter les requêtes dupliquées (et donc les 404/409 sur le
  // DELETE/PATCH d'un ID déjà traité).
  const [cancelling, setCancelling] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [activeTab, setActiveTab] = useState('mes-autorisations')
  // ASSISTANCE-MODE-FRONTEND : ID de l'établissement dont l'activation du mode
  // assistance est en cours. Désactive le bouton correspondant (Loader2) et
  // empêche les double-clics. Vide = aucune activation en cours.
  const [assistanceLoadingId, setAssistanceLoadingId] = useState<string | null>(null)

  // ─── Form state ───
  const [formEtablissementId, setFormEtablissementId] = useState('')
  const [formMotif, setFormMotif] = useState('')
  const [formDateDebut, setFormDateDebut] = useState('')
  const [formDateFin, setFormDateFin] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')

  // ─── Stats ───
  const approuveCount = accessRecords.filter((r) => r.statut === 'APPROUVE').length
  const enAttenteCount = accessRecords.filter((r) => r.statut === 'EN_ATTENTE').length
  const expireCount = accessRecords.filter((r) => r.statut === 'EXPIRE').length
  const activeEtablissementsCount = etablissements.filter((e) => e.actif).length

  // ─── Available establishments for the form ───
  // Only show establishments where admin doesn't already have APPROUVE or EN_ATTENTE access
  const unavailableEtabIds = new Set(
    accessRecords
      .filter((r) => r.statut === 'APPROUVE' || r.statut === 'EN_ATTENTE')
      .map((r) => r.etablissementId)
  )
  const availableEtablissements = etablissements.filter(
    (e) => e.actif && !unavailableEtabIds.has(e.id)
  )

  // ─── Cancel access request ───
  const handleCancelRequest = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/etablissement-access/${cancelTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'annulation')
      }
      toast.success('Demande annulée', {
        description: `La demande d'accès à ${cancelTarget.etablissement?.nom ?? 'cet établissement'} a été annulée.`,
      })
      setCancelTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'annuler la demande.',
      })
    } finally {
      setCancelling(false)
    }
  }

  // ─── Revoke access (ACCESS-WORKFLOW-UI) ───
  // Permet à l'ADMIN de révoquer un accès qu'il avait précédemment obtenu.
  // Le backend Update() accepte statut=REFUSE pour un accès APPROUVE et
  // enregistre le commentaire. L'auto-révocation est aussi gérée côté backend
  // via admin_has_etablissement_access() qui vérifie dateFin >= now().
  // Côté frontend on propose une révocation manuelle anticipative.
  const handleRevokeAccess = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await fetch(`/api/etablissement-access/${revokeTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'REFUSE',
          commentaire: 'Accès révoqué par l\'admin',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la révocation')
      }
      toast.success('Accès révoqué', {
        description: `L'accès à ${revokeTarget.etablissement?.nom ?? 'cet établissement'} a été révoqué.`,
      })
      setRevokeTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de révoquer l\'accès.',
      })
    } finally {
      setRevoking(false)
    }
  }

  // ─── Assistance mode (ASSISTANCE-MODE-FRONTEND) ───
  // Active le "mode assistance" pour un établissement APPROUVE : le backend
  // /api/auth/assistance-mode émet de nouveaux tokens JWT avec
  // etablissementId positionné, et renvoie le user mis à jour. On stocke les
  // nouveaux tokens via le shim Next.js (cookies httpOnly), on met à jour
  // l'auth store (l'ADMIN "devient" RESPONSABLE pour la nav), puis on
  // redirige vers /dashboard (vue responsable).
  const handleAssistanceMode = async (record: AccessRecord) => {
    if (!record.etablissementId) return
    setAssistanceLoadingId(record.etablissementId)
    try {
      const res = await fetch('/api/go-auth/assistance-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etablissementId: record.etablissementId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Impossible d\'activer le mode assistance')
      }
      // Normalisation du user (champs optionnels → null pour éviter les
      // "undefined" dans la sidebar / header).
      useAuthStore.setState({
        user: {
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          role: data.user.role,
          etablissementId: data.user.etablissementId ?? null,
          filiereId: data.user.filiereId ?? null,
          etablissement: data.user.etablissement ?? null,
          filiere: data.user.filiere ?? null,
          image: data.user.image ?? null,
          actif: data.user.actif,
          matricule: data.user.matricule ?? null,
          mustChangePwd: data.user.mustChangePwd,
          derniereConnexion: data.user.derniereConnexion ?? null,
        },
      })
      toast.success('Mode assistance activé', {
        description: `Vous accédez maintenant aux données de ${record.etablissement?.nom ?? 'cet établissement'}.`,
      })
      router.push('/dashboard')
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setAssistanceLoadingId(null)
    }
  }

  // ─── Submit access request ───
  const handleSubmitRequest = async () => {
    if (!formEtablissementId || !formMotif || !user?.id) {
      toast.error('Champs manquants', {
        description: 'L\'établissement et le motif sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      // ACCES-ETABLISSEMENTS-FIX : convertir les dates "YYYY-MM-DD" (input type=date)
      // en RFC3339 "YYYY-MM-DDT00:00:00Z" car le backend Go décode *time.Time qui
      // attend le format RFC3339. Sans conversion, json.Decoder échoue → 400 "JSON invalide".
      const toRFC3339 = (d: string): string | null => {
        if (!d) return null
        return `${d}T00:00:00Z`
      }
      const res = await fetch('/api/etablissement-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user.id,
          etablissementId: formEtablissementId,
          motif: formMotif,
          dateDebut: toRFC3339(formDateDebut),
          dateFin: toRFC3339(formDateFin),
          commentaire: formCommentaire || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // ACCES-ETABLISSEMENTS-FIX : si 409 (demande déjà existante), afficher un
        // message spécifique avec CTA vers l'onglet Mes autorisations pour annuler.
        if (res.status === 409) {
          toast.error('Demande déjà existante', {
            description: 'Vous avez déjà une demande en attente ou approuvée pour cet établissement. Annulez-la d\'abord dans l\'onglet « Mes autorisations ».',
            action: {
              label: 'Voir mes demandes',
              onClick: () => setActiveTab('mes-autorisations'),
            },
          })
          setIsSubmitting(false)
          return
        }
        throw new Error(err.error || 'Erreur lors de la création')
      }
      toast.success('Demande envoyée', {
        description: 'Votre demande d\'accès a été soumise avec succès.',
      })
      // Reset form
      setFormEtablissementId('')
      setFormMotif('')
      setFormDateDebut('')
      setFormDateFin('')
      setFormCommentaire('')
      setActiveTab('mes-autorisations')
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Renew / Relancer (create new request for expired/refused) ───
  const handleRenew = (record: AccessRecord) => {
    // Pre-fill the form with the same etablissement and motif
    setFormEtablissementId(record.etablissementId)
    setFormMotif(record.motif)
    setFormDateDebut('')
    setFormDateFin('')
    setFormCommentaire('')
    setActiveTab('demander-acces')
    toast.info('Renouvellement', {
      description: `Formulaire pré-rempli pour ${record.etablissement?.nom ?? 'cet établissement'}.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
          <KeyRound className="h-7 w-7 text-success-text" />
          Accès aux Établissements
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez vos autorisations d&apos;accès aux données des établissements
        </p>
      </div>

      {/* ─── Notice box ─── */}
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="text-sm text-warning">
            <p className="font-medium">Confidentialité des données</p>
            <p className="mt-1 text-warning">
              En tant que propriétaire de la plateforme, vous ne pouvez pas accéder aux données
              d&apos;un établissement sans autorisation explicite. Ce mécanisme garantit la
              confidentialité des données de chaque établissement client.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <ShieldCheck className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Autorisations actives</p>
              <p className="text-xl font-bold font-mono tabular-nums">{approuveCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-xl font-bold font-mono tabular-nums">{enAttenteCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <AlertCircle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expirées</p>
              <p className="text-xl font-bold font-mono tabular-nums">{expireCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Building2 className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Établissements disponibles</p>
              <p className="text-xl font-bold font-mono tabular-nums">{activeEtablissementsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main content with Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="mes-autorisations" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Mes autorisations
          </TabsTrigger>
          <TabsTrigger value="demander-acces" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Demander un accès
          </TabsTrigger>
          <TabsTrigger value="etablissements-autorises" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Établissements autorisés
          </TabsTrigger>
          {isResponsable && (
            <TabsTrigger value="demandes-a-approuver" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Demandes à approuver
              {pendingRecords.length > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-warning/15 text-warning">
                  {pendingRecords.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Tab 1: Mes autorisations ─── */}
        <TabsContent value="mes-autorisations">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : accessRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <KeyRound className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucune autorisation</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez encore demandé accès à aucun établissement.
              </p>
              <Button
                className="mt-6 bg-success hover:bg-success/90"
                onClick={() => setActiveTab('demander-acces')}
              >
                <Plus className="h-4 w-4" />
                Demander un accès
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-display">Établissement</TableHead>
                      <TableHead className="font-display">Motif</TableHead>
                      <TableHead className="font-display">Statut</TableHead>
                      <TableHead className="font-display">Date début</TableHead>
                      <TableHead className="font-display">Date fin</TableHead>
                      <TableHead className="text-right font-display">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessRecords.map((record) => (
                      <TableRow key={record.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                              {record.etablissement?.nom?.charAt(0).toUpperCase() ?? '?'}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{record.etablissement?.nom ?? 'Établissement inconnu'}</p>
                              {record.etablissement?.ville && (
                                <p className="text-xs text-muted-foreground">
                                  {record.etablissement?.ville}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getMotifLabel(record.motif)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getStatutBadge(record.statut)}
                            {/* ACCESS-WORKFLOW-UI : badge "Expiré" quand dateFin < now(). */}
                            {/* Le backend admin_has_etablissement_access() auto-révoque */}
                            {/* silencieusement, mais le cache frontend peut encore */}
                            {/* montrer APPROUVE → on l'indique visuellement à l'ADMIN. */}
                            {record.statut === 'APPROUVE' && record.dateFin &&
                              new Date(record.dateFin) < new Date() && (
                                <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Expiré
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(record.dateDebut)}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.dateFin)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {record.statut === 'EN_ATTENTE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setCancelTarget(record)}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Annuler
                            </Button>
                          )}
                          {record.statut === 'APPROUVE' && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-success-text hover:text-success-text hover:bg-success/10"
                                onClick={() => router.push('/etablissements')}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Voir l&apos;établissement
                              </Button>
                              {/* ASSISTANCE-MODE-FRONTEND : bascule en mode assistance. */}
                              {/* L'ADMIN "devient" RESPONSABLE pour cet établissement */}
                              {/* le temps de la session (tokens JWT régénérés côté backend). */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-warning hover:text-warning hover:bg-warning/10"
                                disabled={assistanceLoadingId === record.etablissementId}
                                onClick={() => handleAssistanceMode(record)}
                                title="Basculer en mode assistance pour cet établissement"
                              >
                                {assistanceLoadingId === record.etablissementId ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <LifeBuoy className="h-4 w-4 mr-1" />
                                )}
                                Mode assistance
                              </Button>
                              {/* ACCESS-WORKFLOW-UI : révocation manuelle par l'ADMIN. */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setRevokeTarget(record)}
                              >
                                <Ban className="h-4 w-4 mr-1" />
                                Révoquer
                              </Button>
                            </div>
                          )}
                          {record.statut === 'EXPIRE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-warning hover:text-warning hover:bg-warning/10"
                              onClick={() => handleRenew(record)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Renouveler
                            </Button>
                          )}
                          {record.statut === 'REFUSE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-warning hover:text-warning hover:bg-warning/10"
                              onClick={() => handleRenew(record)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Relancer
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 2: Demander un accès ─── */}
        <TabsContent value="demander-acces">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <Send className="h-5 w-5 text-success-text" />
                Demander un accès
              </CardTitle>
              <CardDescription>
                Remplissez le formulaire pour demander l&apos;accès aux données d&apos;un
                établissement. Votre demande sera examinée par le responsable de
                l&apos;établissement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableEtablissements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                    <Building2 className="h-8 w-8 text-warning" />
                  </div>
                  <h3 className="mt-4 font-semibold font-display tracking-tight">Aucun établissement disponible</h3>
                  <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                    {enAttenteCount > 0
                      ? `Vous avez ${enAttenteCount} demande(s) d'accès en attente. Annulez une demande pour pouvoir en faire une nouvelle.`
                      : 'Vous avez déjà demandé ou obtenu l\'accès à tous les établissements actifs.'}
                  </p>
                  {enAttenteCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 gap-2"
                      onClick={() => setActiveTab('mes-autorisations')}
                    >
                      <Clock className="h-4 w-4" />
                      Voir mes demandes en attente
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Établissement */}
                  <div className="space-y-2">
                    <Label htmlFor="access-etab">Établissement *</Label>
                    <Select
                      value={formEtablissementId}
                      onValueChange={setFormEtablissementId}
                    >
                      <SelectTrigger id="access-etab">
                        <SelectValue placeholder="Sélectionner un établissement" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEtablissements.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nom}
                            {e.ville ? ` — ${e.ville}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Motif */}
                  <div className="space-y-2">
                    <Label htmlFor="access-motif">Motif *</Label>
                    <Select value={formMotif} onValueChange={setFormMotif}>
                      <SelectTrigger id="access-motif">
                        <SelectValue placeholder="Sélectionner un motif" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Audit">Audit</SelectItem>
                        <SelectItem value="Support technique">Support technique</SelectItem>
                        <SelectItem value="Inspection">Inspection</SelectItem>
                        <SelectItem value="Urgence">Urgence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date range */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="access-date-debut">Date début (optionnel)</Label>
                      <Input
                        id="access-date-debut"
                        type="date"
                        value={formDateDebut}
                        onChange={(e) => setFormDateDebut(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access-date-fin">Date fin (optionnel)</Label>
                      <Input
                        id="access-date-fin"
                        type="date"
                        value={formDateFin}
                        onChange={(e) => setFormDateFin(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Commentaire */}
                  <div className="space-y-2">
                    <Label htmlFor="access-commentaire">Commentaire (optionnel)</Label>
                    <Textarea
                      id="access-commentaire"
                      placeholder="Précisez les raisons de votre demande..."
                      value={formCommentaire}
                      onChange={(e) => setFormCommentaire(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Separator />

                  {/* Submit */}
                  <div className="flex justify-end">
                    <Button
                      className="bg-success hover:bg-success/90"
                      onClick={handleSubmitRequest}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Envoyer la demande
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Établissements autorisés ─── */}
        <TabsContent value="etablissements-autorises">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="h-5 w-32 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-4 w-full rounded bg-muted" />
                    <div className="h-4 w-20 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : authorizedEtablissements.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <ShieldCheck className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucun accès autorisé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore d&apos;autorisation d&apos;accès approuvée.
              </p>
              <Button
                className="mt-6 bg-success hover:bg-success/90"
                onClick={() => setActiveTab('demander-acces')}
              >
                <Plus className="h-4 w-4" />
                Demander un accès
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {authorizedEtablissements.map((etab) => {
                // Find matching etablissement data for counts
                const etabData = etablissements.find((e) => e.id === etab.id)
                const nbUsers = etabData?._count?.users ?? 0
                const nbFilieres = etabData?._count?.filieres ?? 0

                return (
                  <Card
                    key={etab.id}
                    className="transition-shadow hover:shadow-md border-t-4 border-t-success"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-sm font-bold text-success-text">
                            {etab.nom.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <CardTitle className="text-base font-display">{etab.nom}</CardTitle>
                            {etab.ville && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {etab.ville}
                              </p>
                            )}
                          </div>
                        </div>
                        {etab.type && (
                          <Badge variant="outline" className="text-xs">
                            {etab.type}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {nbUsers} utilisateur{nbUsers > 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          {nbFilieres} filière{nbFilieres > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Subscription info */}
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge
                          className="bg-success/10 text-success-text border-success/30 text-xs"
                        >
                          Abonné
                        </Badge>
                      </div>

                      {/* Access expiration */}
                      {etab.access?.dateFin && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            Accès jusqu&apos;au {formatDate(etab.access.dateFin)}
                          </span>
                        </div>
                      )}

                      {/* Data visibility badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          className="bg-success/10 text-success-text border-success/30 text-[10px]"
                        >
                          <FileText className="h-2.5 w-2.5 mr-1" />
                          Données utilisateurs
                        </Badge>
                        <Badge
                          className="bg-warning/10 text-warning border-warning/30 text-[10px]"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                          Évaluations
                        </Badge>
                        <Badge
                          className="bg-success/10 text-success-text border-success/30 text-[10px]"
                        >
                          <BarChart3Icon className="h-2.5 w-2.5 mr-1" />
                          Résultats
                        </Badge>
                      </div>

                      {/* Access button — ASSISTANCE-MODE-FRONTEND : déclenche le */}
                      {/* mode assistance pour cet établissement (anciennement */}
                      {/* placeholder "à venir"). L'ADMIN bascule en vue RESPONSABLE. */}
                      <Button
                        className="w-full bg-success hover:bg-success/90 mt-2"
                        size="sm"
                        disabled={assistanceLoadingId === etab.id}
                        onClick={() =>
                          handleAssistanceMode({
                            id: etab.access?.id ?? etab.id,
                            adminId: user?.id ?? '',
                            etablissementId: etab.id,
                            motif: etab.access?.motif ?? 'Assistance',
                            statut: 'APPROUVE',
                            dateDebut: etab.access?.dateDebut ?? null,
                            dateFin: etab.access?.dateFin ?? null,
                            commentaire: etab.access?.commentaire ?? null,
                            approuvePar: null,
                            createdAt: etab.access?.createdAt ?? new Date().toISOString(),
                            etablissement: { id: etab.id, nom: etab.nom, ville: etab.ville, actif: etab.actif },
                          })
                        }
                      >
                        {assistanceLoadingId === etab.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <LifeBuoy className="h-4 w-4 mr-1" />
                        )}
                        Accéder aux données
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: Demandes à approuver (RESPONSABLE uniquement) ─── */}
        {isResponsable && (
          <TabsContent value="demandes-a-approuver">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                  <Clock className="h-5 w-5 text-warning" />
                  Demandes d'accès en attente
                </CardTitle>
                <CardDescription>
                  Demandes d'accès admin sur votre établissement à approuver ou refuser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                      <CheckCircle2 className="h-7 w-7 text-success-text" />
                    </div>
                    <p className="mt-3 text-sm font-medium">Aucune demande en attente</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Les nouvelles demandes d'accès admin apparaîtront ici.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRecords.map((record) => {
                      const etab = etablissements.find((e) => e.id === record.etablissementId)
                      return (
                        <div
                          key={record.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/60 p-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-sm">
                                {etab?.nom ?? 'Établissement'}
                              </p>
                              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                                {record.motif}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Demande de {record.admin?.name ?? 'un administrateur'}
                              {record.commentaire && (
                                <span className="block mt-1 italic">« {record.commentaire} »</span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Soumise le {new Date(record.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              className="bg-success hover:bg-success/90 gap-1.5"
                              disabled={processingId === record.id}
                              onClick={() => handleApproveRequest(record, 'APPROUVE')}
                            >
                              {processingId === record.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                              disabled={processingId === record.id}
                              onClick={() => handleApproveRequest(record, 'REFUSE')}
                            >
                              <X className="h-3.5 w-3.5" />
                              Refuser
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ─── Cancel Confirmation Dialog ─── */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la demande</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler votre demande d&apos;accès à{' '}
              <strong>{cancelTarget?.etablissement?.nom ?? 'cet établissement'}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder la demande</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancelRequest}
              disabled={cancelling}
            >
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Revoke Confirmation Dialog (ACCESS-WORKFLOW-UI) ─── */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer l&apos;accès</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir révoquer votre accès à{' '}
              <strong>{revokeTarget?.etablissement?.nom ?? 'cet établissement'}</strong> ? Cette action
              est irréversible et vous perdrez immédiatement l&apos;accès aux données de
              l&apos;établissement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRevokeAccess}
              disabled={revoking}
            >
              Oui, révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Small icon helper to avoid naming conflict ───
function BarChart3Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}
