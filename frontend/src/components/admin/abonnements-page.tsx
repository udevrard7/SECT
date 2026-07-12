'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  Edit3,
  Eye,
  Ban,
  PauseCircle,
  Trash2,
  CheckCircle2,
  Users,
  TrendingUp,
  DollarSign,
  RotateCcw,
  Loader2,
  Sparkles,
  Shield,
  FileText,
  Brain,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Mail,
  Zap,
  AlertTriangle,
  Copy,
  Building2,
  MapPin,
  Phone,
  Globe,
  IdCard,
  Info,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Lock,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { PulseSkeleton } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ─── Types ───

interface PlanItem {
  id: string
  nom: string
  type: string
  prixMensuel: number
  prixAnnuel: number | null
  nbEtablissementsMax: number
  nbFilieresMax: number
  nbEnseignantsMax: number
  nbEtudiantsMax: number
  nbQuestionsMax: number
  nbEvaluationsMois: number
  iaGeneration: boolean
  iaCorrection: boolean
  proctoring: boolean
  exportPDF: boolean
  support: string
  description: string | null
  actif: boolean
  createdAt: string
  // SECT-ABONNEMENTS-B2B-B2C : nouveaux champs pour la restructuration.
  branche?: string | null // 'B2C' | 'B2B' | null (legacy)
  prixParEtudiant?: boolean // modèle capitation (B2B)
  quotaIAGeneration?: number | null // null = illimité
  quotaIACorrection?: number | null // null = illimité
  classeesMax?: number | null // B2C : nb classes, null = illimité
  popular?: boolean // badge "Populaire"
  _count?: { abonnements: number }
}

interface AbonnementItem {
  id: string
  etablissementId: string
  planId: string
  statut: string
  dateDebut: string
  dateFin: string | null
  periodeEssaiJours: number
  modePaiement: string | null
  referencePaiement: string | null
  montantPaye: number
  renouvellementAuto: boolean
  notes: string | null
  createdAt: string
  plan?: {
    id: string
    nom: string
    type: string
    prixMensuel: number
    prixAnnuel: number | null
  }
  etablissement?: {
    id: string
    nom: string
    ville: string | null
    actif: boolean
  }
}

interface EtablissementOption {
  id: string
  nom: string
  ville: string | null
  actif: boolean
}

interface ResponsableInfo {
  id: string
  name: string
  email: string
  actif: boolean
}

interface SouscriptionCredentials {
  etablissementNom: string
  responsableNom: string
  responsableEmail: string
  temporaryPassword: string
  planNom: string
  periode: string
  montant: number
  dateDebut: string
  dateFin: string
  // Invitation mode fields
  responsableMode?: 'direct' | 'invitation'
  invitationToken?: string
  invitationExpiresAt?: string
}

// ─── Utility functions ───

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'ESSAI':
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30">
          Essai
        </Badge>
      )
    case 'ACTIF':
      return (
        <Badge className="bg-success/10 text-success-text border-success/30">
          Actif
        </Badge>
      )
    case 'SUSPENDU':
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30">
          Suspendu
        </Badge>
      )
    case 'EXPIRE':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          Expiré
        </Badge>
      )
    case 'RESILIE':
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/30">
          Résilié
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getPlanColor(type: string) {
  switch (type) {
    case 'GRATUIT':
      return {
        bg: 'bg-gray-50 dark:bg-gray-900/20',
        border: 'border-gray-200 dark:border-gray-800',
        header: 'bg-gray-100 dark:bg-gray-800/50',
        accent: 'text-gray-700 dark:text-gray-300',
        badge: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300',
        icon: 'text-gray-500 dark:text-gray-400',
        ring: 'ring-gray-300 dark:ring-gray-700',
      }
    case 'ESSENTIEL':
      return {
        bg: 'bg-success/10',
        border: 'border-success/30',
        header: 'bg-success/10',
        accent: 'text-success-text',
        badge: 'bg-success/10 text-success-text border-success/30',
        icon: 'text-success-text',
        ring: 'ring-success',
      }
    case 'PROFESSIONNEL':
      return {
        bg: 'bg-success/10',
        border: 'border-success/30',
        header: 'bg-success/10',
        accent: 'text-success-text',
        badge: 'bg-success/10 text-success-text border-success/30',
        icon: 'text-success-text',
        ring: 'ring-success',
      }
    case 'ENTREPRISE':
      return {
        bg: 'bg-info/10',
        border: 'border-info/30',
        header: 'bg-info/10',
        accent: 'text-info',
        badge: 'bg-info/10 text-info border-info/30',
        icon: 'text-info',
        ring: 'ring-info',
      }
    default:
      return {
        bg: 'bg-gray-50 dark:bg-gray-900/20',
        border: 'border-gray-200 dark:border-gray-800',
        header: 'bg-gray-100 dark:bg-gray-800/50',
        accent: 'text-gray-700 dark:text-gray-300',
        badge: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300',
        icon: 'text-gray-500 dark:text-gray-400',
        ring: 'ring-gray-300 dark:ring-gray-700',
      }
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA'
}

function getAbonnementDates(periode: 'mensuel' | 'annuel'): { debut: string; fin: string } {
  const today = new Date()
  const debut = today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const finDate = new Date(today)
  if (periode === 'annuel') {
    finDate.setFullYear(finDate.getFullYear() + 1)
  } else {
    finDate.setMonth(finDate.getMonth() + 1)
  }
  const fin = finDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return { debut, fin }
}

// ─── Main Component ───

export function AbonnementsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Les 4 ressources sont indépendantes → 4 useQuery séparés.
  const plansQuery = useQuery<{ plans: PlanItem[] }>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans')
      if (!res.ok) throw new Error('Failed to fetch plans')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const abonnementsQuery = useQuery<{ abonnements: AbonnementItem[] }>({
    queryKey: ['abonnements'],
    queryFn: async () => {
      const res = await fetch('/api/abonnements')
      if (!res.ok) throw new Error('Failed to fetch abonnements')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etablissementsQuery = useQuery<{
    etablissements: Array<{ id: string; nom: string; ville: string | null; actif: boolean }>
  }>({
    queryKey: ['etablissements'],
    queryFn: async () => {
      const res = await fetch('/api/etablissements')
      if (!res.ok) throw new Error('Failed to fetch etablissements')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const responsablesQuery = useQuery<{
    users: Array<{
      id: string
      name: string
      email: string
      actif: boolean
      etablissementId: string | null
    }>
  }>({
    queryKey: ['users-responsables'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=RESPONSABLE&limit=100')
      if (!res.ok) throw new Error('Failed to fetch responsables')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const plans = plansQuery.data?.plans ?? []
  const abonnements = abonnementsQuery.data?.abonnements ?? []
  const etablissements = (etablissementsQuery.data?.etablissements ?? []).map((e) => ({
    id: e.id,
    nom: e.nom,
    ville: e.ville,
    actif: e.actif,
  }))
  const responsablesMap = useMemo(() => {
    const respMap: Record<string, ResponsableInfo> = {}
    for (const u of responsablesQuery.data?.users ?? []) {
      if (u.etablissementId) {
        respMap[u.etablissementId] = { id: u.id, name: u.name, email: u.email, actif: u.actif }
      }
    }
    return respMap
  }, [responsablesQuery.data])
  const isLoading =
    plansQuery.isLoading ||
    abonnementsQuery.isLoading ||
    etablissementsQuery.isLoading ||
    responsablesQuery.isLoading

  // Helper pour invalider le cache après mutation (create/update/delete).
  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plans'] }),
      queryClient.invalidateQueries({ queryKey: ['abonnements'] }),
      queryClient.invalidateQueries({ queryKey: ['etablissements'] }),
      queryClient.invalidateQueries({ queryKey: ['users-responsables'] }),
    ])
  }

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')

  // ─── Dialog state ───
  const [aboDialogOpen, setAboDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [editingAbo, setEditingAbo] = useState<AbonnementItem | null>(null)
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AbonnementItem | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<AbonnementItem | null>(null)
  // SECT-ABONNEMENT-SOFT-DELETE : suppression définitive (soft delete) des abonnements résiliés.
  const [deleteTarget, setDeleteTarget] = useState<AbonnementItem | null>(null)
  const [detailAbo, setDetailAbo] = useState<AbonnementItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // ─── Abonnement form state ───
  const [formAboEtabId, setFormAboEtabId] = useState('')
  const [formAboPlanId, setFormAboPlanId] = useState('')
  const [formAboDateDebut, setFormAboDateDebut] = useState('')
  const [formAboStatut, setFormAboStatut] = useState('ESSAI')
  const [formAboModePaiement, setFormAboModePaiement] = useState('')
  const [formAboMontant, setFormAboMontant] = useState('')
  const [formAboRenouvellement, setFormAboRenouvellement] = useState(true)
  const [formAboNotes, setFormAboNotes] = useState('')

  // ─── Plan form state ───
  const [formPlanNom, setFormPlanNom] = useState('')
  const [formPlanType, setFormPlanType] = useState('ESSENTIEL')
  const [formPlanPrixMensuel, setFormPlanPrixMensuel] = useState('')
  const [formPlanPrixAnnuel, setFormPlanPrixAnnuel] = useState('')
  const [formPlanNbEtabMax, setFormPlanNbEtabMax] = useState('1')
  const [formPlanNbFilieresMax, setFormPlanNbFilieresMax] = useState('5')
  const [formPlanNbEnseignantsMax, setFormPlanNbEnseignantsMax] = useState('10')
  const [formPlanNbEtudiantsMax, setFormPlanNbEtudiantsMax] = useState('100')
  const [formPlanNbQuestionsMax, setFormPlanNbQuestionsMax] = useState('500')
  const [formPlanNbEvaluationsMois, setFormPlanNbEvaluationsMois] = useState('10')
  const [formPlanIaGeneration, setFormPlanIaGeneration] = useState(true)
  const [formPlanIaCorrection, setFormPlanIaCorrection] = useState(false)
  const [formPlanProctoring, setFormPlanProctoring] = useState(false)
  const [formPlanExportPDF, setFormPlanExportPDF] = useState(true)
  const [formPlanSupport, setFormPlanSupport] = useState('email')
  const [formPlanDescription, setFormPlanDescription] = useState('')

  // ─── Responsable state (for existing abonnement dialog) ───
  const [selectedEtabResponsable, setSelectedEtabResponsable] = useState<ResponsableInfo | null>(null)
  const [checkingResponsable, setCheckingResponsable] = useState(false)
  const [responsableMode, setResponsableMode] = useState<'invitation' | 'direct'>('invitation')
  const [formRespName, setFormRespName] = useState('')
  const [formRespEmail, setFormRespEmail] = useState('')
  const [formRespInvitEmail, setFormRespInvitEmail] = useState('')
  const [isCreatingResp, setIsCreatingResp] = useState(false)
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null)
  const [respCreated, setRespCreated] = useState(false)

  // ─── Souscription wizard state ───
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [wizardSubmitting, setWizardSubmitting] = useState(false)
  const [wizardCredentials, setWizardCredentials] = useState<SouscriptionCredentials | null>(null)
  const [wizardCopiedField, setWizardCopiedField] = useState<string | null>(null)
  const [matriculeOpen, setMatriculeOpen] = useState(false)

  // Wizard form - Step 1: Plan
  const [wizPlanId, setWizPlanId] = useState('')
  const [wizPeriodeFacturation, setWizPeriodeFacturation] = useState<'mensuel' | 'annuel'>('annuel')
  // SECT-ABONNEMENTS-B2B-B2C : nb d'étudiants estimé pour le modèle capitation (B2B).
  const [wizNbEtudiants, setWizNbEtudiants] = useState<number>(50)

  // Wizard form - Step 2: Établissement
  const [wizNom, setWizNom] = useState('')
  const [wizType, setWizType] = useState('')
  const [wizVille, setWizVille] = useState('')
  const [wizPays, setWizPays] = useState("Côte d'Ivoire")
  const [wizTelephone, setWizTelephone] = useState('')
  const [wizEmail, setWizEmail] = useState('')
  const [wizSiteWeb, setWizSiteWeb] = useState('')
  const [wizAdresse, setWizAdresse] = useState('')
  const [wizFormatMatricule, setWizFormatMatricule] = useState('')
  const [wizExempleMatricule, setWizExempleMatricule] = useState('')
  const [wizRegexMatricule, setWizRegexMatricule] = useState('')

  // Wizard form - Step 3: Responsable
  const [wizRespNom, setWizRespNom] = useState('')
  const [wizRespEmail, setWizRespEmail] = useState('')
  const [wizRespTelephone, setWizRespTelephone] = useState('')
  const [wizRespMode, setWizRespMode] = useState<'direct' | 'invitation'>('direct')

  // ─── Check responsable when selected etablissement changes ───
  useEffect(() => {
    if (!formAboEtabId) {
      setSelectedEtabResponsable(null)
      return
    }
    const existing = responsablesMap[formAboEtabId]
    if (existing) {
      setSelectedEtabResponsable(existing)
    } else {
      setSelectedEtabResponsable(null)
      setCheckingResponsable(true)
      fetch(`/api/users?role=RESPONSABLE&etablissementId=${formAboEtabId}`)
        .then((res) => res.json())
        .then((data) => {
          const users = data.users ?? []
          if (users.length > 0) {
            const u = users[0]
            setSelectedEtabResponsable({ id: u.id, name: u.name, email: u.email, actif: u.actif })
          } else {
            setSelectedEtabResponsable(null)
          }
        })
        .catch(() => {
          setSelectedEtabResponsable(null)
        })
        .finally(() => setCheckingResponsable(false))
    }
  }, [formAboEtabId, responsablesMap])

  // ─── Stats ───
  const activeAboCount = abonnements.filter((a) => a.statut === 'ACTIF').length
  const trialAboCount = abonnements.filter((a) => a.statut === 'ESSAI').length
  // ABONNEMENTS-FIX-A10 : revenu mensuel basé sur plan.prixMensuel (récurrent)
  // au lieu de montantPaye (paiement ponctuel, peut être 0 pour un plan gratuit
  // ou un montant annuel). Reflète le revenu mensuel réel de l'activité SaaS.
  const monthlyRevenue = abonnements
    .filter((a) => a.statut === 'ACTIF')
    .reduce((sum, a) => sum + (a.plan?.prixMensuel ?? 0), 0)
  const retentionRate =
    abonnements.length > 0
      ? Math.round(
          (abonnements.filter((a) => a.statut !== 'RESILIE').length / abonnements.length) * 100
        )
      : 100

  // ─── Filtered abonnements ───
  const filteredAbonnements = abonnements.filter((a) => {
    const matchStatut = statutFilter === 'all' || a.statut === statutFilter
    // BUGFIX (STUBS-FIX-1) : optional chaining sur etablissement/plan
    // (l'API peut ne pas inclure ces relations si le JOIN échoue)
    const matchSearch =
      !search ||
      (a.etablissement?.nom ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.plan?.nom ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatut && matchSearch
  })

  // ─── Open souscription wizard ───
  const handleOpenWizard = () => {
    setWizardStep(1)
    setWizardCredentials(null)
    setWizardCopiedField(null)
    setMatriculeOpen(false)
    // Reset step 1
    setWizPlanId('')
    setWizPeriodeFacturation('mensuel')
    // Reset step 2
    setWizNom('')
    setWizType('')
    setWizVille('')
    setWizPays("Côte d'Ivoire")
    setWizTelephone('')
    setWizEmail('')
    setWizSiteWeb('')
    setWizAdresse('')
    setWizFormatMatricule('')
    setWizExempleMatricule('')
    setWizRegexMatricule('')
    // Reset step 3
    setWizRespNom('')
    setWizRespEmail('')
    setWizRespTelephone('')
    setWizRespMode('direct')
    setWizardOpen(true)
  }

  // ─── Wizard step validation ───
  const wizSelectedPlan = plans.find((p) => p.id === wizPlanId)
  // SECT-ABONNEMENTS-B2B-B2C : calcul du prix selon le modèle (capitation vs fixe).
  // Capitation B2B : max(nbEtudiants, 50) × prixAnnuel (900 FCFA/étudiant/an).
  // Fixe : prixAnnuel (annuel) ou prixMensuel (mensuel).
  const isCapitation = wizSelectedPlan?.prixParEtudiant === true
  const wizPlanPrice = wizSelectedPlan
    ? isCapitation
      ? Math.max(wizNbEtudiants, 50) * (wizSelectedPlan.prixAnnuel ?? 900)
      : wizPeriodeFacturation === 'annuel'
        ? (wizSelectedPlan.prixAnnuel ?? wizSelectedPlan.prixMensuel * 12)
        : wizSelectedPlan.prixMensuel
    : 0
  const wizAbonnementDates = getAbonnementDates(isCapitation ? 'annuel' : wizPeriodeFacturation)

  const canGoStep2 = !!wizPlanId
  const canGoStep3 = !!wizNom.trim()
  const canSubmit = wizRespMode === 'direct'
    ? !!wizRespNom.trim() && !!wizRespEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizRespEmail)
    : !!wizRespEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizRespEmail)

  // ─── Submit souscription ───
  const handleSouscriptionSubmit = async () => {
    setWizardSubmitting(true)
    try {
      const body = {
        nom: wizNom,
        type: wizType || null,
        ville: wizVille || null,
        pays: wizPays || "Côte d'Ivoire",
        telephone: wizTelephone || null,
        email: wizEmail || null,
        siteWeb: wizSiteWeb || null,
        adresse: wizAdresse || null,
        formatMatricule: wizFormatMatricule || null,
        exempleMatricule: wizExempleMatricule || null,
        regexMatricule: wizRegexMatricule || null,
        responsableNom: wizRespMode === 'direct' ? wizRespNom : '',
        responsableEmail: wizRespEmail,
        responsableTelephone: wizRespTelephone || null,
        responsableMode: wizRespMode,
        planId: wizPlanId,
        periodeFacturation: wizPeriodeFacturation,
        // SECT-ABONNEMENTS-B2B-B2C : nb étudiants estimé pour capitation B2B.
        nbEtudiantsEstime: isCapitation ? Math.max(wizNbEtudiants, 50) : undefined,
      }

      const res = await fetch('/api/etablissements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }
      const data = await res.json()

      if (wizRespMode === 'direct' && data.responsable?.temporaryPassword) {
        setWizardCredentials({
          etablissementNom: wizNom,
          responsableNom: wizRespNom,
          responsableEmail: wizRespEmail,
          temporaryPassword: data.responsable.temporaryPassword,
          planNom: wizSelectedPlan?.nom ?? data.abonnement?.planNom ?? '',
          periode: isCapitation ? 'Annuel (capitation)' : (wizPeriodeFacturation === 'annuel' ? 'Annuel' : 'Mensuel'),
          montant: wizPlanPrice,
          dateDebut: wizAbonnementDates.debut,
          dateFin: wizAbonnementDates.fin,
          responsableMode: 'direct',
        })
      } else if (wizRespMode === 'invitation' && data.invitation) {
        setWizardCredentials({
          etablissementNom: wizNom,
          responsableNom: '',
          responsableEmail: wizRespEmail,
          temporaryPassword: '',
          planNom: wizSelectedPlan?.nom ?? data.abonnement?.planNom ?? '',
          periode: isCapitation ? 'Annuel (capitation)' : (wizPeriodeFacturation === 'annuel' ? 'Annuel' : 'Mensuel'),
          montant: wizPlanPrice,
          dateDebut: wizAbonnementDates.debut,
          dateFin: wizAbonnementDates.fin,
          responsableMode: 'invitation',
          invitationToken: data.invitation.token,
          invitationExpiresAt: data.invitation.expiresAt,
        })
      }

      setWizardStep(4)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setWizardSubmitting(false)
    }
  }

  const handleWizardCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setWizardCopiedField(field)
      toast.success('Copié dans le presse-papiers')
      setTimeout(() => setWizardCopiedField(null), 2000)
    }).catch(() => {
      // Fallback: ignore
    })
  }

  // ─── Open create abonnement dialog (for existing etablissements) ───
  const handleOpenCreateAbo = () => {
    setEditingAbo(null)
    setFormAboEtabId('')
    setFormAboPlanId('')
    setFormAboDateDebut(new Date().toISOString().split('T')[0])
    setFormAboStatut('ESSAI')
    setFormAboModePaiement('')
    setFormAboMontant('')
    setFormAboRenouvellement(true)
    setFormAboNotes('')
    setSelectedEtabResponsable(null)
    setResponsableMode('invitation')
    setFormRespName('')
    setFormRespEmail('')
    setFormRespInvitEmail('')
    setCreatedTempPassword(null)
    setRespCreated(false)
    setAboDialogOpen(true)
  }

  // ─── Open edit abonnement dialog ───
  const handleOpenEditAbo = (abo: AbonnementItem) => {
    setEditingAbo(abo)
    setFormAboEtabId(abo.etablissementId)
    setFormAboPlanId(abo.planId)
    setFormAboDateDebut(abo.dateDebut ? new Date(abo.dateDebut).toISOString().split('T')[0] : '')
    setFormAboStatut(abo.statut)
    setFormAboModePaiement(abo.modePaiement ?? '')
    setFormAboMontant(abo.montantPaye ? String(abo.montantPaye) : '')
    setFormAboRenouvellement(abo.renouvellementAuto)
    setFormAboNotes(abo.notes ?? '')
    setSelectedEtabResponsable(responsablesMap[abo.etablissementId] ?? null)
    setResponsableMode('invitation')
    setFormRespName('')
    setFormRespEmail('')
    setFormRespInvitEmail('')
    setCreatedTempPassword(null)
    setRespCreated(false)
    setAboDialogOpen(true)
  }

  // ─── Submit abonnement ───
  const handleSubmitAbo = async () => {
    if (!formAboEtabId || !formAboPlanId || !formAboDateDebut) {
      toast.error('Champs manquants', {
        description: 'Établissement, plan et date de début sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingAbo) {
        const res = await fetch(`/api/abonnements/${editingAbo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: formAboPlanId,
            statut: formAboStatut,
            dateDebut: formAboDateDebut,
            modePaiement: formAboModePaiement || null,
            montantPaye: formAboMontant ? parseFloat(formAboMontant) : 0,
            renouvellementAuto: formAboRenouvellement,
            notes: formAboNotes || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la modification')
        }
        toast.success('Abonnement modifié', {
          description: `L'abonnement de ${editingAbo.etablissement?.nom ?? "—"} a été mis à jour.`,
        })
      } else {
        const res = await fetch('/api/abonnements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            etablissementId: formAboEtabId,
            planId: formAboPlanId,
            dateDebut: formAboDateDebut,
            statut: formAboStatut,
            modePaiement: formAboModePaiement || null,
            montantPaye: formAboMontant ? parseFloat(formAboMontant) : 0,
            renouvellementAuto: formAboRenouvellement,
            notes: formAboNotes || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Abonnement créé', {
          description: 'Le nouvel abonnement a été ajouté avec succès.',
        })
      }

      setAboDialogOpen(false)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Suspend abonnement ───
  const handleSuspendAbo = async () => {
    if (!suspendTarget) return
    try {
      const res = await fetch(`/api/abonnements/${suspendTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'SUSPENDU' }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Abonnement suspendu', {
        description: `L'abonnement de ${suspendTarget.etablissement?.nom ?? "—"} a été suspendu.`,
      })
      setSuspendTarget(null)
      await refreshData()
    } catch {
      toast.error('Erreur', { description: 'Impossible de suspendre l\'abonnement.' })
    }
  }

  // ─── Cancel (resilier) abonnement ───
  const handleCancelAbo = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/abonnements/${cancelTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Abonnement résilié', {
        description: `L'abonnement de ${cancelTarget.etablissement?.nom ?? "—"} a été résilié.`,
      })
      setCancelTarget(null)
      await refreshData()
    } catch {
      toast.error('Erreur', { description: 'Impossible de résilier l\'abonnement.' })
    }
  }

  // ─── Soft delete abonnement (SECT-ABONNEMENT-SOFT-DELETE) ───
  // Supprime définitivement (soft delete) un abonnement RÉSILIÉ. L'abonnement
  // disparaît des listes mais reste en DB pour l'audit/facturation.
  const handleDeleteAbo = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/abonnements/${deleteTarget.id}/hard`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur')
      }
      toast.success('Abonnement supprimé', {
        description: `L'abonnement de ${deleteTarget.etablissement?.nom ?? "—"} a été supprimé définitivement.`,
      })
      setDeleteTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Suppression impossible', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    }
  }

  // ─── Open create plan dialog ───
  const handleOpenCreatePlan = () => {
    setEditingPlan(null)
    setFormPlanNom('')
    setFormPlanType('ESSENTIEL')
    setFormPlanPrixMensuel('')
    setFormPlanPrixAnnuel('')
    setFormPlanNbEtabMax('1')
    setFormPlanNbFilieresMax('5')
    setFormPlanNbEnseignantsMax('10')
    setFormPlanNbEtudiantsMax('100')
    setFormPlanNbQuestionsMax('500')
    setFormPlanNbEvaluationsMois('10')
    setFormPlanIaGeneration(true)
    setFormPlanIaCorrection(false)
    setFormPlanProctoring(false)
    setFormPlanExportPDF(true)
    setFormPlanSupport('email')
    setFormPlanDescription('')
    setPlanDialogOpen(true)
  }

  // ─── Open edit plan dialog ───
  const handleOpenEditPlan = (plan: PlanItem) => {
    setEditingPlan(plan)
    setFormPlanNom(plan.nom)
    setFormPlanType(plan.type)
    setFormPlanPrixMensuel(String(plan.prixMensuel))
    setFormPlanPrixAnnuel(plan.prixAnnuel != null ? String(plan.prixAnnuel) : '')
    setFormPlanNbEtabMax(String(plan.nbEtablissementsMax))
    setFormPlanNbFilieresMax(String(plan.nbFilieresMax))
    setFormPlanNbEnseignantsMax(String(plan.nbEnseignantsMax))
    setFormPlanNbEtudiantsMax(String(plan.nbEtudiantsMax))
    setFormPlanNbQuestionsMax(String(plan.nbQuestionsMax))
    setFormPlanNbEvaluationsMois(String(plan.nbEvaluationsMois))
    setFormPlanIaGeneration(plan.iaGeneration)
    setFormPlanIaCorrection(plan.iaCorrection)
    setFormPlanProctoring(plan.proctoring)
    setFormPlanExportPDF(plan.exportPDF)
    setFormPlanSupport(plan.support)
    setFormPlanDescription(plan.description ?? '')
    setPlanDialogOpen(true)
  }

  // ─── Submit plan ───
  const handleSubmitPlan = async () => {
    if (!formPlanNom || !formPlanType || formPlanPrixMensuel === '') {
      toast.error('Champs manquants', {
        description: 'Le nom, le type et le prix mensuel sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        nom: formPlanNom,
        type: formPlanType,
        prixMensuel: formPlanPrixMensuel,
        prixAnnuel: formPlanPrixAnnuel || null,
        nbEtablissementsMax: parseInt(formPlanNbEtabMax) || 1,
        nbFilieresMax: parseInt(formPlanNbFilieresMax) || 5,
        nbEnseignantsMax: parseInt(formPlanNbEnseignantsMax) || 10,
        nbEtudiantsMax: parseInt(formPlanNbEtudiantsMax) || 100,
        nbQuestionsMax: parseInt(formPlanNbQuestionsMax) || 500,
        nbEvaluationsMois: parseInt(formPlanNbEvaluationsMois) || 10,
        iaGeneration: formPlanIaGeneration,
        iaCorrection: formPlanIaCorrection,
        proctoring: formPlanProctoring,
        exportPDF: formPlanExportPDF,
        support: formPlanSupport,
        description: formPlanDescription || null,
      }

      let res: Response
      if (editingPlan) {
        res = await fetch(`/api/plans/${editingPlan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'opération')
      }
      toast.success(
        editingPlan ? 'Plan modifié' : 'Plan créé',
        { description: editingPlan ? `Le plan ${formPlanNom} a été mis à jour.` : `Le plan ${formPlanNom} a été ajouté.` }
      )
      setPlanDialogOpen(false)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── View abonnement detail ───
  const handleViewDetail = (abo: AbonnementItem) => {
    setDetailAbo(abo)
    setDetailOpen(true)
  }

  // ─── Send invitation for responsable ───
  const handleSendInvitation = async () => {
    if (!formRespInvitEmail || !formAboEtabId) {
      toast.error('Champs manquants', { description: 'L\'email est obligatoire.' })
      return
    }
    setIsCreatingResp(true)
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formRespInvitEmail,
          role: 'RESPONSABLE',
          etablissementId: formAboEtabId,
          createdById: user?.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'invitation')
      }
      toast.success('Invitation envoyée', {
        description: `Une invitation a été envoyée à ${formRespInvitEmail}.`,
      })
      setRespCreated(true)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsCreatingResp(false)
    }
  }

  // ─── Direct creation of responsable ───
  const handleDirectCreateResponsable = async () => {
    if (!formRespName || !formRespEmail || !formAboEtabId) {
      toast.error('Champs manquants', { description: 'Le nom et l\'email sont obligatoires.' })
      return
    }
    setIsCreatingResp(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formRespName,
          email: formRespEmail,
          role: 'RESPONSABLE',
          etablissementId: formAboEtabId,
          mode: 'direct',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }
      const data = await res.json()
      setCreatedTempPassword(data.temporaryPassword ?? null)
      setRespCreated(true)
      setSelectedEtabResponsable({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        actif: true,
      })
      queryClient.invalidateQueries({ queryKey: ['users-responsables'] })
      toast.success('Responsable créé', {
        description: `${formRespName} a été ajouté comme responsable.`,
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsCreatingResp(false)
    }
  }

  // ─── Plan feature list helper ───
  // SECT-ABONNEMENTS-B2B-B2C : affichage adaptatif selon la branche (B2C/B2B).
  // B2C : met en avant classes + étudiants + quotas IA (épreuves/mois).
  // B2B capitation : met en avant le modèle par étudiant + illimités.
  // Legacy (anciens plans) : affichage historique (volume de ressources).
  const getPlanFeatures = (plan: PlanItem) => {
    const isB2C = plan.branche === 'B2C'
    const isB2B = plan.branche === 'B2B'
    const isCapitation = plan.prixParEtudiant === true

    // Helper pour afficher un quota IA (null = illimité, sinon nb/mois)
    const iaLabel = (quota: number | null | undefined, baseLabel: string) => {
      if (quota === null || quota === undefined) return `${baseLabel} illimitée`
      return `${baseLabel} (${quota}/mois)`
    }

    if (isB2C) {
      // B2C : focus sur l'enseignant solo
      const features = [
        { label: '1 enseignant', included: true },
        { label: plan.classeesMax ? `${plan.classeesMax} classes` : 'Classes illimitées', included: true },
        { label: `${plan.nbEtudiantsMax} étudiants`, included: true },
        { label: iaLabel(plan.quotaIAGeneration, 'Génération IA'), included: plan.iaGeneration },
        { label: iaLabel(plan.quotaIACorrection, 'Correction IA'), included: plan.iaCorrection },
        { label: 'Export PDF', included: plan.exportPDF },
        { label: 'Proctoring', included: plan.proctoring },
      ]
      return features
    }

    if (isB2B && isCapitation) {
      // B2B capitation : tout illimité, facturation par étudiant
      const features = [
        { label: 'Enseignants illimités', included: true },
        { label: 'Filières illimitées', included: true },
        { label: 'Étudiants illimités', included: true },
        { label: 'Génération IA illimitée', included: plan.iaGeneration },
        { label: 'Correction IA illimitée', included: plan.iaCorrection },
        { label: 'Proctoring inclus', included: plan.proctoring },
        { label: 'Export PDF', included: plan.exportPDF },
        { label: 'Support téléphone dédié', included: plan.support === 'telephone' },
      ]
      return features
    }

    // Legacy (anciens plans) — affichage historique
    const features = [
      { label: `${plan.nbEtablissementsMax} établissement${plan.nbEtablissementsMax > 1 ? 's' : ''}`, included: true },
      { label: `${plan.nbFilieresMax} filière${plan.nbFilieresMax > 1 ? 's' : ''}`, included: true },
      { label: `${plan.nbEnseignantsMax} enseignant${plan.nbEnseignantsMax > 1 ? 's' : ''}`, included: true },
      { label: `${plan.nbEtudiantsMax} étudiant${plan.nbEtudiantsMax > 1 ? 's' : ''}`, included: true },
      { label: `${plan.nbQuestionsMax} questions`, included: true },
      { label: `${plan.nbEvaluationsMois} éval./mois`, included: true },
      { label: 'Génération IA', included: plan.iaGeneration },
      { label: 'Correction IA', included: plan.iaCorrection },
      { label: 'Proctoring', included: plan.proctoring },
      { label: 'Export PDF', included: plan.exportPDF },
    ]
    return features
  }

  // SECT-ABONNEMENTS-B2B-B2C : affichage du prix selon le modèle (fixe vs capitation).
  const getPlanPriceDisplay = (plan: PlanItem) => {
    if (plan.prixParEtudiant === true) {
      // Modèle capitation : 900 FCFA/étudiant/an
      return {
        main: formatCurrency(plan.prixAnnuel ?? 900),
        suffix: '/étudiant/an',
        sub: 'Plancher 50 étudiants (45 000 FCFA/an)',
        badge: 'Capitation',
      }
    }
    if (plan.prixMensuel === 0) {
      return { main: 'Gratuit', suffix: '', sub: '', badge: plan.branche === 'B2C' ? 'Freemium' : '' }
    }
    return {
      main: formatCurrency(plan.prixMensuel),
      suffix: '/mois',
      sub: plan.prixAnnuel ? `${formatCurrency(plan.prixAnnuel)}/an` : '',
      badge: '',
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <CreditCard className="h-7 w-7 text-success-text" />
            Gestion des Abonnements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les souscriptions, plans tarifaires et abonnements
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-success/30 text-success-text hover:bg-success/10"
            onClick={handleOpenCreatePlan}
          >
            <Plus className="h-4 w-4" />
            Nouveau plan
          </Button>
          <Button
            variant="outline"
            onClick={handleOpenCreateAbo}
          >
            <Plus className="h-4 w-4" />
            Ajouter abonnement
          </Button>
          <Button className="bg-success hover:bg-success/90" onClick={handleOpenWizard}>
            <Sparkles className="h-4 w-4" />
            Nouvelle souscription
          </Button>
        </div>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Abonnements actifs</p>
              <p className="text-xl font-bold font-mono tabular-nums">{activeAboCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Users className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En essai</p>
              <p className="text-xl font-bold font-mono tabular-nums">{trialAboCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <DollarSign className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenus mensuels</p>
              <p className="text-xl font-bold font-mono tabular-nums">{formatCurrency(monthlyRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <TrendingUp className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux de rétention</p>
              <p className="text-xl font-bold font-mono tabular-nums">{retentionRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main content with Tabs ─── */}
      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Plans tarifaires
          </TabsTrigger>
          <TabsTrigger value="abonnements" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Abonnements
          </TabsTrigger>
        </TabsList>

        {/* ─── Plans Section ─── */}
        <TabsContent value="plans">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="h-5 w-24 rounded bg-muted" />
                    <div className="h-8 w-20 rounded bg-muted" />
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <div key={j} className="h-3 w-full rounded bg-muted" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <CreditCard className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucun plan défini</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Commencez par créer vos plans tarifaires.
              </p>
              <Button className="mt-6 bg-success hover:bg-success/90" onClick={handleOpenCreatePlan}>
                <Plus className="h-4 w-4" />
                Créer un plan
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECT-ABONNEMENTS-B2B-B2C : séparation B2C / B2B / Legacy */}
              {[
                { key: 'B2C', label: 'B2C — Enseignants Freelance & Indépendants', plans: plans.filter(p => p.branche === 'B2C') },
                { key: 'B2B', label: 'B2B — Institutions (modèle capitation)', plans: plans.filter(p => p.branche === 'B2B') },
                { key: 'legacy', label: 'Anciens plans (désactivés)', plans: plans.filter(p => !p.branche) },
              ].filter(section => section.plans.length > 0).map(section => (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</h3>
                    <Badge variant="secondary" className="text-xs">{section.plans.length}</Badge>
                    {section.key === 'B2B' && (
                      <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">Capitation</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {section.plans.map((plan) => {
                      const colors = getPlanColor(plan.type)
                      const features = getPlanFeatures(plan)
                      const priceDisplay = getPlanPriceDisplay(plan)
                      const isPopular = plan.popular === true
                      const isInactive = !plan.actif
                      return (
                        <Card
                          key={plan.id}
                          className={`relative transition-shadow hover:shadow-md ${colors.border} ${colors.bg} ${isPopular ? 'ring-2 ring-success shadow-lg' : ''} ${isInactive ? 'opacity-60' : ''}`}
                        >
                          {/* Badge en haut : Popular / Capitation / type */}
                          <div className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
                            {isPopular && (
                              <Badge className="bg-success text-success-foreground text-xs font-semibold shadow-md">
                                ⭐ Populaire
                              </Badge>
                            )}
                            {!isPopular && (
                              <Badge className={`${colors.badge} text-xs font-semibold`}>
                                {plan.type}
                              </Badge>
                            )}
                          </div>

                          <CardHeader className={`pb-2 pt-6 ${colors.header} rounded-t-lg`}>
                            <CardTitle className={`text-lg font-bold ${colors.accent} flex items-center gap-2`}>
                              {plan.nom}
                              {plan.prixParEtudiant && (
                                <Badge variant="outline" className="text-xs border-warning/40 text-warning">Capitation</Badge>
                              )}
                            </CardTitle>
                            <div className="mt-1">
                              <span className="text-3xl font-bold font-mono tabular-nums">{priceDisplay.main}</span>
                              {priceDisplay.suffix && (
                                <span className="text-sm text-muted-foreground">{priceDisplay.suffix}</span>
                              )}
                            </div>
                            {priceDisplay.sub && (
                              <p className="text-xs text-muted-foreground mt-0.5">{priceDisplay.sub}</p>
                            )}
                            {plan.description && (
                              <p className="text-xs text-muted-foreground italic mt-1">{plan.description}</p>
                            )}
                          </CardHeader>

                          <CardContent className="p-4">
                            <ul className="space-y-2 text-sm">
                              {features.map((f, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  {f.included ? (
                                    <Check className="h-4 w-4 text-success-text mt-0.5 shrink-0" />
                                  ) : (
                                    <X className="h-4 w-4 text-gray-400 dark:text-gray-600 mt-0.5 shrink-0" />
                                  )}
                                  <span className={f.included ? '' : 'text-muted-foreground line-through'}>
                                    {f.label}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-3 flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Support :</span>
                              <Badge variant="secondary" className="text-xs">
                                {plan.support === 'telephone' ? 'Téléphone' : plan.support === 'chat' ? 'Chat' : 'Email'}
                              </Badge>
                            </div>

                            <div className="mt-2 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {plan._count?.abonnements ?? 0} abonné{(plan._count?.abonnements ?? 0) > 1 ? 's' : ''}
                              </span>
                              {!plan.actif && (
                                <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground ml-auto">
                                  Inactif
                                </Badge>
                              )}
                            </div>
                          </CardContent>

                          <CardFooter className="p-4 pt-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`w-full ${colors.badge} border-current hover:opacity-80`}
                              onClick={() => handleOpenEditPlan(plan)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Modifier
                            </Button>
                          </CardFooter>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Abonnements Section ─── */}
        <TabsContent value="abonnements">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par établissement ou plan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="ESSAI">Essai</SelectItem>
                <SelectItem value="ACTIF">Actif</SelectItem>
                <SelectItem value="SUSPENDU">Suspendu</SelectItem>
                <SelectItem value="EXPIRE">Expiré</SelectItem>
                <SelectItem value="RESILIE">Résilié</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {!isLoading && filteredAbonnements.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <CreditCard className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucun abonnement trouvé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                {search || statutFilter !== 'all'
                  ? 'Aucun résultat ne correspond à vos filtres.'
                  : 'Commencez par créer votre premier abonnement.'}
              </p>
              {!search && statutFilter === 'all' && (
                <Button className="mt-6 bg-success hover:bg-success/90" onClick={handleOpenWizard}>
                  <Sparkles className="h-4 w-4" />
                  Nouvelle souscription
                </Button>
              )}
            </div>
          )}

          {!isLoading && filteredAbonnements.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-display">Établissement</TableHead>
                      <TableHead className="font-display">Plan</TableHead>
                      <TableHead className="font-display">Responsable</TableHead>
                      <TableHead className="font-display">Statut</TableHead>
                      <TableHead className="font-display">Date début</TableHead>
                      <TableHead className="font-display">Date fin</TableHead>
                      <TableHead className="text-right font-display">Montant</TableHead>
                      <TableHead className="text-right font-display">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAbonnements.map((abo) => (
                      <TableRow key={abo.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                              {abo.etablissement?.nom?.charAt(0).toUpperCase() ?? "?"}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{abo.etablissement?.nom ?? "—"}</p>
                              {abo.etablissement?.ville && (
                                <p className="text-xs text-muted-foreground">{abo.etablissement?.ville}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPlanColor(abo.plan?.type ?? "—").badge}>
                            {abo.plan?.nom ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {responsablesMap[abo.etablissementId] ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-[10px] font-bold text-success-text">
                                {responsablesMap[abo.etablissementId].name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm">{responsablesMap[abo.etablissementId].name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-warning italic">Non assigné</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatutBadge(abo.statut)}</TableCell>
                        <TableCell className="text-sm">{formatDate(abo.dateDebut)}</TableCell>
                        <TableCell className="text-sm">{formatDate(abo.dateFin)}</TableCell>
                        <TableCell className="text-right font-medium text-sm font-mono tabular-nums">
                          {formatCurrency(abo.montantPaye)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                              onClick={() => handleViewDetail(abo)}
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                              onClick={() => handleOpenEditAbo(abo)}
                              title="Modifier"
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            {abo.statut === 'ACTIF' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-warning hover:text-warning hover:bg-warning/10"
                                onClick={() => setSuspendTarget(abo)}
                                title="Suspendre"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {abo.statut !== 'RESILIE' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setCancelTarget(abo)}
                                title="Résilier"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                            {abo.statut === 'RESILIE' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteTarget(abo)}
                                title="Supprimer définitivement"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ─── SOUSCRIPTION WIZARD DIALOG ─── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={wizardOpen} onOpenChange={(open) => { if (!open) setWizardOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-success-text" />
              Nouvelle souscription
            </DialogTitle>
            <DialogDescription>
              Créez un nouvel établissement avec son abonnement et son responsable en quelques étapes.
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 px-1">
            {[
              { step: 1, label: 'Plan' },
              { step: 2, label: 'Établissement' },
              { step: 3, label: 'Responsable' },
              { step: 4, label: 'Confirmation' },
            ].map((s, idx) => (
              <div key={s.step} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-1.5 ${wizardStep >= s.step ? 'text-success-text' : 'text-muted-foreground'}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    wizardStep > s.step
                      ? 'bg-success text-white'
                      : wizardStep === s.step
                        ? 'bg-success/10 text-success-text border-2 border-success/70'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {wizardStep > s.step ? <Check className="h-4 w-4" /> : s.step}
                  </div>
                  <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
                </div>
                {idx < 3 && <div className={`flex-1 h-0.5 ${wizardStep > s.step ? 'bg-success' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {/* ─── Step 1: Plan Selection ─── */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold font-display tracking-tight flex items-center gap-2 text-success-text">
                    <CreditCard className="h-4 w-4" />
                    Sélectionnez un plan institutionnel
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Modèle capitation : 900 FCFA / étudiant / an (plancher 50 étudiants).
                    Pour un enseignant freelance, utilisez <a href="/souscrire-b2c" className="text-success-text underline">/souscrire-b2c</a>.
                  </p>
                </div>

                {plans.filter((p) => p.actif && p.branche === 'B2B').length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun plan B2B actif. Créez d&apos;abord un plan institutionnel.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {plans.filter((p) => p.actif && p.branche === 'B2B').map((plan) => {
                      const colors = getPlanColor(plan.type)
                      const isSelected = wizPlanId === plan.id
                      const priceDisplay = getPlanPriceDisplay(plan)
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setWizPlanId(plan.id)}
                          className={`relative text-left rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                            isSelected
                              ? `border-success ${colors.bg} ring-2 ${colors.ring}`
                              : `border-muted ${colors.bg} hover:border-success/30`
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle2 className="h-5 w-5 text-success-text" />
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            {plan.popular && (
                              <Badge className="bg-success text-success-foreground text-[10px]">⭐ Populaire</Badge>
                            )}
                            {plan.prixParEtudiant && (
                              <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">Capitation</Badge>
                            )}
                          </div>
                          <p className="font-bold text-sm font-mono tabular-nums">{plan.nom}</p>
                          <div className="mt-1">
                            <span className="text-lg font-bold font-mono tabular-nums">{priceDisplay.main}</span>
                            {priceDisplay.suffix && <span className="text-xs text-muted-foreground">{priceDisplay.suffix}</span>}
                          </div>
                          {priceDisplay.sub && (
                            <p className="text-xs text-warning font-medium">{priceDisplay.sub}</p>
                          )}
                          <ul className="mt-2 space-y-0.5">
                            {getPlanFeatures(plan).slice(0, 5).map((f, i) => (
                              <li key={i} className="flex items-center gap-1 text-[11px]">
                                {f.included ? <Check className="h-3 w-3 text-success-text shrink-0" /> : <X className="h-3 w-3 text-gray-400 shrink-0" />}
                                <span className={f.included ? '' : 'line-through text-muted-foreground'}>{f.label}</span>
                              </li>
                            ))}
                          </ul>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* SECT-ABONNEMENTS-B2B-B2C : nb étudiants estimé (capitation B2B) */}
                {wizPlanId && isCapitation && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Nombre d&apos;étudiants estimé
                    </Label>
                    <Input
                      type="number"
                      min={50}
                      value={wizNbEtudiants}
                      onChange={(e) => setWizNbEtudiants(Math.max(50, parseInt(e.target.value) || 50))}
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Plancher facturé : 50 étudiants (45 000 FCFA/an). Si vous déclarez plus, le montant est ajusté proportionnellement.
                    </p>
                  </div>
                )}

                {/* Période de facturation — masquée pour capitation (annuel par défaut) */}
                {wizPlanId && !isCapitation && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Période de facturation</Label>
                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                          wizPeriodeFacturation === 'mensuel'
                            ? 'bg-success text-white'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        onClick={() => setWizPeriodeFacturation('mensuel')}
                      >
                        <Calendar className="h-4 w-4" />
                        Mensuel
                      </button>
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                          wizPeriodeFacturation === 'annuel'
                            ? 'bg-success text-white'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        onClick={() => setWizPeriodeFacturation('annuel')}
                      >
                        <Calendar className="h-4 w-4" />
                        Annuel
                      </button>
                    </div>
                  </div>
                )}

                {/* Price summary */}
                {wizSelectedPlan && (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Plan :</span>
                      <span className="text-sm font-semibold">{wizSelectedPlan.nom}</span>
                    </div>
                    {isCapitation ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Étudiants facturés :</span>
                          <span className="text-sm font-medium">{Math.max(wizNbEtudiants, 50)} (plancher 50)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Tarif :</span>
                          <span className="text-sm font-medium">{formatCurrency(wizSelectedPlan.prixAnnuel ?? 900)} / étudiant / an</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Période :</span>
                          <span className="text-sm font-medium">Annuel (1 an)</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Période :</span>
                        <span className="text-sm font-medium">{wizPeriodeFacturation === 'annuel' ? 'Annuel' : 'Mensuel'}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Montant total :</span>
                      <span className="text-sm font-bold text-success-text font-mono tabular-nums">{formatCurrency(wizPlanPrice)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Step 2: Établissement Info ─── */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold font-display tracking-tight flex items-center gap-2 text-success-text">
                    <Building2 className="h-4 w-4" />
                    Informations de l&apos;établissement
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Renseignez les informations du nouvel établissement.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-nom">Nom de l&apos;établissement *</Label>
                  <Input id="wiz-nom" placeholder="Ex: Université de Paris" value={wizNom} onChange={(e) => setWizNom(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wiz-type">Type</Label>
                    <Select value={wizType} onValueChange={setWizType}>
                      <SelectTrigger id="wiz-type"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Université">Université</SelectItem>
                        <SelectItem value="École d&apos;ingénieurs">École d&apos;ingénieurs</SelectItem>
                        <SelectItem value="Institut">Institut</SelectItem>
                        <SelectItem value="École de commerce">École de commerce</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wiz-ville">Ville</Label>
                    <Input id="wiz-ville" placeholder="Abidjan" value={wizVille} onChange={(e) => setWizVille(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wiz-pays">Pays</Label>
                    <Input id="wiz-pays" placeholder="Côte d'Ivoire" value={wizPays} onChange={(e) => setWizPays(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wiz-telephone">Téléphone</Label>
                    <Input id="wiz-telephone" placeholder="+225 07 12 34 56 78" value={wizTelephone} onChange={(e) => setWizTelephone(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-email">Email</Label>
                  <Input id="wiz-email" type="email" placeholder="contact@etablissement.fr" value={wizEmail} onChange={(e) => setWizEmail(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-siteweb">Site web</Label>
                  <Input id="wiz-siteweb" placeholder="https://www.etablissement.fr" value={wizSiteWeb} onChange={(e) => setWizSiteWeb(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-adresse">Adresse</Label>
                  <Textarea id="wiz-adresse" placeholder="Adresse complète..." value={wizAdresse} onChange={(e) => setWizAdresse(e.target.value)} rows={2} />
                </div>

                {/* Matricule - collapsible */}
                <div className="rounded-lg border">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setMatriculeOpen(!matriculeOpen)}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <IdCard className="h-4 w-4 text-success-text" />
                      Configuration des matricules (optionnel)
                    </div>
                    {matriculeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {matriculeOpen && (
                    <div className="border-t p-3 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="wiz-format-matricule" className="text-xs">Format du matricule</Label>
                        <Input id="wiz-format-matricule" placeholder="Ex: {YYYY}/{FIL}-{NIV}/{NNN}" value={wizFormatMatricule} onChange={(e) => setWizFormatMatricule(e.target.value)} className="text-sm font-mono tabular-nums" />
                        <p className="text-xs text-muted-foreground">
                          Variables : {'{YYYY}'} (année), {'{YY}'} (année courte), {'{FIL}'} (code filière), {'{NIV}'} (niveau), {'{CODE}'} (code étab.), {'{NNN}'} (numéro)
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="wiz-exemple-matricule" className="text-xs">Exemple</Label>
                          <Input id="wiz-exemple-matricule" placeholder="Ex: 2026/INFO-L3/001" value={wizExempleMatricule} onChange={(e) => setWizExempleMatricule(e.target.value)} className="text-sm font-mono tabular-nums" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wiz-regex-matricule" className="text-xs">Regex de validation</Label>
                          <Input id="wiz-regex-matricule" placeholder="Ex: ^\\d{4}/.+\\/.+$" value={wizRegexMatricule} onChange={(e) => setWizRegexMatricule(e.target.value)} className="text-sm font-mono tabular-nums" />
                        </div>
                      </div>
                      {!wizFormatMatricule && (
                        <p className="text-xs text-warning flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Sans format défini, un matricule aléatoire (ETU-XXXXXX) sera généré.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Step 3: Responsable Info ─── */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold font-display tracking-tight flex items-center gap-2 text-success-text">
                    <UserPlus className="h-4 w-4" />
                    Responsable de l&apos;établissement
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Choisissez comment créer le compte responsable.
                  </p>
                </div>

                {/* Info banner */}
                <div className={`rounded-lg border p-3 flex items-start gap-2 ${
                  wizRespMode === 'direct'
                    ? 'border-warning/30 bg-warning/10'
                    : 'border-success/30 bg-success/10'
                }`}>
                  <Info className={`h-4 w-4 shrink-0 mt-0.5 ${
                    wizRespMode === 'direct'
                      ? 'text-warning'
                      : 'text-success-text'
                  }`} />
                  <p className={`text-xs ${
                    wizRespMode === 'direct'
                      ? 'text-warning'
                      : 'text-success-text'
                  }`}>
                    {wizRespMode === 'direct'
                      ? 'Un mot de passe temporaire sera généré automatiquement. Le responsable devra le changer à sa première connexion.'
                      : 'Un lien d\'invitation valide 48h sera généré. Le responsable créera son compte en cliquant sur ce lien.'}
                  </p>
                </div>

                {/* Toggle section */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWizRespMode('direct')}
                    className={`relative text-left rounded-lg border-2 p-3 transition-all hover:shadow-sm ${
                      wizRespMode === 'direct'
                        ? 'border-success bg-success/10 ring-2 ring-success'
                        : 'border-muted bg-muted/30 hover:border-success/30'
                    }`}
                  >
                    {wizRespMode === 'direct' && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-4 w-4 text-success-text" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lock className="h-4 w-4 text-success-text" />
                      <span className="text-sm font-semibold">Création directe</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Un mot de passe temporaire sera généré. Le responsable le changera à sa première connexion.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWizRespMode('invitation')}
                    className={`relative text-left rounded-lg border-2 p-3 transition-all hover:shadow-sm ${
                      wizRespMode === 'invitation'
                        ? 'border-success bg-success/10 ring-2 ring-success'
                        : 'border-muted bg-muted/30 hover:border-success/30'
                    }`}
                  >
                    {wizRespMode === 'invitation' && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-4 w-4 text-success-text" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Mail className="h-4 w-4 text-success-text" />
                      <span className="text-sm font-semibold">Invitation par lien</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Un lien d&apos;invitation sera envoyé par email. Le responsable créera son propre compte.
                    </p>
                  </button>
                </div>

                {/* Conditional form fields */}
                {wizRespMode === 'direct' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="wiz-resp-nom">Nom du responsable *</Label>
                      <Input id="wiz-resp-nom" placeholder="Ex: Jean Dupont" value={wizRespNom} onChange={(e) => setWizRespNom(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="wiz-resp-email">Email du responsable *</Label>
                      <Input id="wiz-resp-email" type="email" placeholder="responsable@etablissement.fr" value={wizRespEmail} onChange={(e) => setWizRespEmail(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="wiz-resp-telephone">Téléphone (optionnel)</Label>
                      <Input id="wiz-resp-telephone" placeholder="+225 07 12 34 56 78" value={wizRespTelephone} onChange={(e) => setWizRespTelephone(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="wiz-resp-email-invitation">Email du responsable *</Label>
                    <Input id="wiz-resp-email-invitation" type="email" placeholder="responsable@etablissement.fr" value={wizRespEmail} onChange={(e) => setWizRespEmail(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Le responsable recevra un lien pour créer son compte et définir son mot de passe.
                    </p>
                  </div>
                )}

                {/* Summary */}
                <Separator />
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Résumé de la souscription</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <span className="text-muted-foreground">Établissement :</span>
                    <span className="font-medium">{wizNom}</span>
                    <span className="text-muted-foreground">Plan :</span>
                    <span className="font-medium">{wizSelectedPlan?.nom ?? '—'}</span>
                    <span className="text-muted-foreground">Période :</span>
                    <span className="font-medium">{wizPeriodeFacturation === 'annuel' ? 'Annuel' : 'Mensuel'}</span>
                    <span className="text-muted-foreground">Montant :</span>
                    <span className="font-bold text-success-text font-mono tabular-nums">{formatCurrency(wizPlanPrice)}</span>
                    <span className="text-muted-foreground">Mode :</span>
                    <span className="font-medium">{wizRespMode === 'direct' ? 'Création directe' : 'Invitation par lien'}</span>
                    {wizRespMode === 'direct' && (
                      <>
                        <span className="text-muted-foreground">Responsable :</span>
                        <span className="font-medium">{wizRespNom || '—'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 4: Confirmation ─── */}
            {wizardStep === 4 && wizardCredentials && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-4">
                  <CheckCircle2 className="h-6 w-6 text-success-text shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-success-text">Souscription créée avec succès !</p>
                    <p className="text-xs text-success-text">
                      L&apos;établissement et l&apos;abonnement ont été créés
                      {wizardCredentials.responsableMode === 'direct' ? ', ainsi que le compte responsable' : ', et l\'invitation a été envoyée'}.
                    </p>
                  </div>
                </div>

                {/* Établissement */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-success-text" />
                    Établissement
                  </h4>
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-semibold">{wizardCredentials.etablissementNom}</p>
                  </div>
                </div>

                {/* Responsable & Credentials / Invitation */}
                {wizardCredentials.responsableMode === 'direct' ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Lock className="h-4 w-4 text-success-text" />
                      Identifiants de connexion
                    </h4>
                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Nom :</span>
                        <span className="text-sm font-medium">{wizardCredentials.responsableNom}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Email :</span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono tabular-nums bg-white dark:bg-gray-900 rounded px-2 py-0.5 border">
                            {wizardCredentials.responsableEmail}
                          </code>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleWizardCopy(wizardCredentials.responsableEmail, 'email')}>
                            {wizardCopiedField === 'email' ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Mot de passe :</span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono tabular-nums bg-white dark:bg-gray-900 rounded px-2 py-0.5 border">
                            {wizardCredentials.temporaryPassword}
                          </code>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleWizardCopy(wizardCredentials.temporaryPassword, 'password')}>
                            {wizardCopiedField === 'password' ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                      <p className="text-xs text-warning flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        Ce mot de passe est temporaire. Le responsable devra le modifier lors de sa première connexion.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4 text-success-text" />
                      Invitation envoyée
                    </h4>
                    <div className="rounded-lg border border-success/30 bg-success/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Email :</span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono tabular-nums bg-white dark:bg-gray-900 rounded px-2 py-0.5 border">
                            {wizardCredentials.responsableEmail}
                          </code>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleWizardCopy(wizardCredentials.responsableEmail, 'inv-email')}>
                            {wizardCopiedField === 'inv-email' ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">Lien d&apos;invitation :</span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono tabular-nums bg-white dark:bg-gray-900 rounded px-2 py-1 border break-all flex-1">
                            {typeof window !== 'undefined' && wizardCredentials.invitationToken
                              ? `${window.location.origin}/?token=${wizardCredentials.invitationToken}`
                              : ''}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 shrink-0"
                            onClick={() => {
                              if (wizardCredentials.invitationToken) {
                                handleWizardCopy(
                                  `${window.location.origin}/?token=${wizardCredentials.invitationToken}`,
                                  'inv-link'
                                )
                              }
                            }}
                          >
                            {wizardCopiedField === 'inv-link' ? <CheckCircle2 className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Expire le :</span>
                        <span className="text-xs font-medium">
                          {wizardCredentials.invitationExpiresAt
                            ? new Date(wizardCredentials.invitationExpiresAt).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                      <p className="text-xs text-success-text flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        Ce lien d&apos;invitation est valide 48 heures. Le responsable créera son propre mot de passe en l&apos;utilisant.
                      </p>
                    </div>
                  </div>
                )}

                {/* Abonnement */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-success-text" />
                    Abonnement
                  </h4>
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Plan :</span>
                      <span className="text-sm font-medium">{wizardCredentials.planNom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Période :</span>
                      <span className="text-sm font-medium">{wizardCredentials.periode}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Montant :</span>
                      <span className="text-sm font-bold text-success-text font-mono tabular-nums">{formatCurrency(wizardCredentials.montant)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Début :</span>
                      <span className="text-xs font-medium">{wizardCredentials.dateDebut}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Fin :</span>
                      <span className="text-xs font-medium">{wizardCredentials.dateFin}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            {wizardStep === 1 && (
              <>
                <Button variant="outline" onClick={() => setWizardOpen(false)}>Annuler</Button>
                <Button className="bg-success hover:bg-success/90" disabled={!canGoStep2} onClick={() => setWizardStep(2)}>
                  Suivant
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {wizardStep === 2 && (
              <>
                <Button variant="outline" onClick={() => setWizardStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <Button className="bg-success hover:bg-success/90" disabled={!canGoStep3} onClick={() => setWizardStep(3)}>
                  Suivant
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {wizardStep === 3 && (
              <>
                <Button variant="outline" onClick={() => setWizardStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <Button className="bg-success hover:bg-success/90" disabled={!canSubmit || wizardSubmitting} onClick={handleSouscriptionSubmit}>
                  {wizardSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Sparkles className="h-4 w-4 mr-1" />
                  Créer la souscription
                </Button>
              </>
            )}
            {wizardStep === 4 && (
              <Button className="bg-success hover:bg-success/90" onClick={() => setWizardOpen(false)}>
                Terminer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create/Edit Abonnement Dialog (for existing etablissements) ─── */}
      <Dialog
        open={aboDialogOpen}
        onOpenChange={(open) => {
          if (!open) setAboDialogOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-success-text" />
              {editingAbo ? 'Modifier l\'abonnement' : 'Ajouter un abonnement'}
            </DialogTitle>
            <DialogDescription>
              {editingAbo
                ? 'Modifiez les informations de l\'abonnement.'
                : 'Ajoutez un abonnement à un établissement existant.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="abo-etab">Établissement *</Label>
              <Select value={formAboEtabId} onValueChange={setFormAboEtabId} disabled={!!editingAbo}>
                <SelectTrigger id="abo-etab">
                  <SelectValue placeholder="Sélectionner un établissement" />
                </SelectTrigger>
                <SelectContent>
                  {etablissements.filter((e) => e.actif).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nom}{e.ville ? ` — ${e.ville}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="abo-plan">Plan *</Label>
              <Select value={formAboPlanId} onValueChange={setFormAboPlanId}>
                <SelectTrigger id="abo-plan">
                  <SelectValue placeholder="Sélectionner un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.actif).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nom} — {p.prixMensuel === 0 ? 'Gratuit' : `${formatCurrency(p.prixMensuel)}/mois`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="abo-datedebut">Date de début *</Label>
                <Input id="abo-datedebut" type="date" value={formAboDateDebut} onChange={(e) => setFormAboDateDebut(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abo-statut">Statut</Label>
                <Select value={formAboStatut} onValueChange={setFormAboStatut}>
                  <SelectTrigger id="abo-statut"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ESSAI">Essai</SelectItem>
                    <SelectItem value="ACTIF">Actif</SelectItem>
                    <SelectItem value="SUSPENDU">Suspendu</SelectItem>
                    <SelectItem value="EXPIRE">Expiré</SelectItem>
                    <SelectItem value="RESILIE">Résilié</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="abo-paiement">Mode de paiement</Label>
                <Select value={formAboModePaiement} onValueChange={setFormAboModePaiement}>
                  <SelectTrigger id="abo-paiement"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carte">Carte bancaire</SelectItem>
                    <SelectItem value="virement">Virement</SelectItem>
                    <SelectItem value="cheque">Chèque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="abo-montant">Montant payé (€)</Label>
                <Input id="abo-montant" type="number" step="0.01" placeholder="0.00" value={formAboMontant} onChange={(e) => setFormAboMontant(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="abo-renouvellement" checked={formAboRenouvellement} onCheckedChange={setFormAboRenouvellement} />
              <Label htmlFor="abo-renouvellement" className="cursor-pointer">Renouvellement automatique</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="abo-notes">Notes</Label>
              <Textarea id="abo-notes" placeholder="Notes internes sur cet abonnement..." value={formAboNotes} onChange={(e) => setFormAboNotes(e.target.value)} rows={3} />
            </div>

            {/* ─── Responsable de l'établissement ─── */}
            {!editingAbo && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-success-text" />
                  <h4 className="text-sm font-semibold">Responsable de l&apos;établissement</h4>
                </div>

                {!formAboEtabId ? (
                  <p className="text-xs text-muted-foreground italic">
                    Sélectionnez d&apos;abord un établissement pour gérer le responsable.
                  </p>
                ) : checkingResponsable ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Vérification du responsable...
                  </div>
                ) : selectedEtabResponsable ? (
                  <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                      {selectedEtabResponsable.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{selectedEtabResponsable.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{selectedEtabResponsable.email}</p>
                    </div>
                    <Badge className="bg-success/10 text-success-text border-success/30 shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Déjà assigné
                    </Badge>
                  </div>
                ) : respCreated ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
                      <CheckCircle2 className="h-4 w-4 text-success-text shrink-0" />
                      <span className="text-sm">
                        {responsableMode === 'invitation' ? 'Invitation envoyée avec succès' : 'Responsable créé avec succès'}
                      </span>
                    </div>
                    {createdTempPassword && (
                      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
                        <p className="text-xs font-medium text-warning">
                          Mot de passe temporaire (à communiquer au responsable) :
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-white dark:bg-gray-900 px-2 py-1 text-sm font-mono tabular-nums border">
                            {createdTempPassword}
                          </code>
                          <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
                            navigator.clipboard.writeText(createdTempPassword)
                            toast.success('Copié dans le presse-papiers')
                          }}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      <p className="text-xs text-warning">
                        Il est recommandé d&apos;assigner un responsable à chaque établissement. Vous pouvez aussi créer l&apos;abonnement sans responsable.
                      </p>
                    </div>

                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                          responsableMode === 'invitation'
                            ? 'bg-success text-white'
                            : 'bg-white dark:bg-gray-900 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        onClick={() => setResponsableMode('invitation')}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Invitation
                      </button>
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                          responsableMode === 'direct'
                            ? 'bg-success text-white'
                            : 'bg-white dark:bg-gray-900 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        onClick={() => setResponsableMode('direct')}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Création directe
                      </button>
                    </div>

                    {responsableMode === 'invitation' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="resp-invit-email" className="text-xs">Email du responsable</Label>
                          <div className="flex gap-2">
                            <Input id="resp-invit-email" type="email" placeholder="responsable@etablissement.fr" value={formRespInvitEmail} onChange={(e) => setFormRespInvitEmail(e.target.value)} className="flex-1" />
                            <Button type="button" className="bg-success hover:bg-success/90 shrink-0" onClick={handleSendInvitation} disabled={isCreatingResp || !formRespInvitEmail}>
                              {isCreatingResp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              Envoyer
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Le responsable recevra un lien pour créer son compte et définir son mot de passe.
                          </p>
                        </div>
                      </div>
                    )}

                    {responsableMode === 'direct' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="resp-name" className="text-xs">Nom complet</Label>
                          <Input id="resp-name" placeholder="Jean Dupont" value={formRespName} onChange={(e) => setFormRespName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="resp-email" className="text-xs">Email</Label>
                          <Input id="resp-email" type="email" placeholder="jean.dupont@etablissement.fr" value={formRespEmail} onChange={(e) => setFormRespEmail(e.target.value)} />
                        </div>
                        <Button type="button" className="w-full bg-success hover:bg-success/90" onClick={handleDirectCreateResponsable} disabled={isCreatingResp || !formRespName || !formRespEmail}>
                          {isCreatingResp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                          Créer le responsable
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Un mot de passe temporaire sera généré automatiquement. Le responsable devra le changer à sa première connexion.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAboDialogOpen(false)}>Annuler</Button>
            <Button className="bg-success hover:bg-success/90" onClick={handleSubmitAbo} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAbo ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create/Edit Plan Dialog ─── */}
      <Dialog open={planDialogOpen} onOpenChange={(open) => { if (!open) setPlanDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-success-text" />
              {editingPlan ? 'Modifier le plan' : 'Nouveau plan'}
            </DialogTitle>
            <DialogDescription>
              {editingPlan ? 'Modifiez les caractéristiques et limites du plan.' : 'Définissez un nouveau plan tarifaire avec ses limites et fonctionnalités.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informations générales</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-nom">Nom du plan *</Label>
                  <Input id="plan-nom" placeholder="Ex: Essentiel" value={formPlanNom} onChange={(e) => setFormPlanNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-type">Type *</Label>
                  <Select value={formPlanType} onValueChange={setFormPlanType}>
                    <SelectTrigger id="plan-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GRATUIT">Gratuit</SelectItem>
                      <SelectItem value="ESSENTIEL">Essentiel</SelectItem>
                      <SelectItem value="PROFESSIONNEL">Professionnel</SelectItem>
                      <SelectItem value="ENTREPRISE">Entreprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-prix-mensuel">Prix mensuel (€) *</Label>
                  <Input id="plan-prix-mensuel" type="number" step="0.01" placeholder="0.00" value={formPlanPrixMensuel} onChange={(e) => setFormPlanPrixMensuel(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-prix-annuel">Prix annuel (€)</Label>
                  <Input id="plan-prix-annuel" type="number" step="0.01" placeholder="Optionnel" value={formPlanPrixAnnuel} onChange={(e) => setFormPlanPrixAnnuel(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-description">Description</Label>
                <Textarea id="plan-description" placeholder="Description du plan..." value={formPlanDescription} onChange={(e) => setFormPlanDescription(e.target.value)} rows={2} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Limites & quotas</h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-etab-max">Établissements max</Label>
                  <Input id="plan-etab-max" type="number" value={formPlanNbEtabMax} onChange={(e) => setFormPlanNbEtabMax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-filieres-max">Filières max</Label>
                  <Input id="plan-filieres-max" type="number" value={formPlanNbFilieresMax} onChange={(e) => setFormPlanNbFilieresMax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-enseignants-max">Enseignants max</Label>
                  <Input id="plan-enseignants-max" type="number" value={formPlanNbEnseignantsMax} onChange={(e) => setFormPlanNbEnseignantsMax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-etudiants-max">Étudiants max</Label>
                  <Input id="plan-etudiants-max" type="number" value={formPlanNbEtudiantsMax} onChange={(e) => setFormPlanNbEtudiantsMax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-questions-max">Questions max</Label>
                  <Input id="plan-questions-max" type="number" value={formPlanNbQuestionsMax} onChange={(e) => setFormPlanNbQuestionsMax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-eval-mois">Éval./mois</Label>
                  <Input id="plan-eval-mois" type="number" value={formPlanNbEvaluationsMois} onChange={(e) => setFormPlanNbEvaluationsMois(e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fonctionnalités</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-success-text" />
                    <Label htmlFor="plan-ia-gen" className="cursor-pointer">Génération IA</Label>
                  </div>
                  <Switch id="plan-ia-gen" checked={formPlanIaGeneration} onCheckedChange={setFormPlanIaGeneration} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-success-text" />
                    <Label htmlFor="plan-ia-correction" className="cursor-pointer">Correction IA</Label>
                  </div>
                  <Switch id="plan-ia-correction" checked={formPlanIaCorrection} onCheckedChange={setFormPlanIaCorrection} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-warning" />
                    <Label htmlFor="plan-proctoring" className="cursor-pointer">Proctoring</Label>
                  </div>
                  <Switch id="plan-proctoring" checked={formPlanProctoring} onCheckedChange={setFormPlanProctoring} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-info" />
                    <Label htmlFor="plan-export-pdf" className="cursor-pointer">Export PDF</Label>
                  </div>
                  <Switch id="plan-export-pdf" checked={formPlanExportPDF} onCheckedChange={setFormPlanExportPDF} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="plan-support">Type de support</Label>
              <Select value={formPlanSupport} onValueChange={setFormPlanSupport}>
                <SelectTrigger id="plan-support"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="telephone">Téléphone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Annuler</Button>
            <Button className="bg-success hover:bg-success/90" onClick={handleSubmitPlan} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingPlan ? 'Enregistrer' : 'Créer le plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Suspend Confirmation Dialog ─── */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(open) => { if (!open) setSuspendTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-warning" />
              Suspendre l&apos;abonnement
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir suspendre l&apos;abonnement de{' '}
              <strong>{suspendTarget?.etablissement?.nom}</strong> ?
              L&apos;établissement perdra temporairement l&apos;accès à ses fonctionnalités.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-warning hover:bg-warning/90" onClick={handleSuspendAbo}>Suspendre</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel (Résilier) Confirmation Dialog ─── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Résilier l&apos;abonnement
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir résilier l&apos;abonnement de{' '}
              <strong>{cancelTarget?.etablissement?.nom}</strong> ? Cette action est irréversible.
              Le renouvellement automatique sera désactivé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleCancelAbo}>Résilier</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── SECT-ABONNEMENT-SOFT-DELETE : Suppression définitive (soft delete) ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Supprimer l&apos;abonnement
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement l&apos;abonnement de{' '}
              <strong>{deleteTarget?.etablissement?.nom}</strong> ?
              <br />
              <span className="text-xs text-muted-foreground mt-2 block">
                Cet abonnement est déjà résilié. La suppression le masquera des listes
                mais les données seront conservées en base pour l&apos;audit et la facturation.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteAbo}>Supprimer définitivement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Abonnement Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setDetailAbo(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-success-text" />
              Détails de l&apos;abonnement
            </DialogTitle>
            <DialogDescription>
              Informations complètes sur l&apos;abonnement
            </DialogDescription>
          </DialogHeader>

          {detailAbo && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Établissement</h4>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-sm font-bold text-success-text">
                      {detailAbo.etablissement?.nom?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="font-medium">{detailAbo.etablissement?.nom ?? "—"}</p>
                      {detailAbo.etablissement?.ville && <p className="text-xs text-muted-foreground">{detailAbo.etablissement?.ville}</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Plan</h4>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge className={getPlanColor(detailAbo.plan?.type ?? "—").badge}>{detailAbo.plan?.nom ?? "—"}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {detailAbo.plan?.prixMensuel ?? 0 === 0 ? 'Gratuit' : `${formatCurrency(detailAbo.plan?.prixMensuel ?? 0)}/mois`}
                      </span>
                    </div>
                    {getStatutBadge(detailAbo.statut)}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Responsable</h4>
                  {responsablesMap[detailAbo.etablissementId] ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                        {responsablesMap[detailAbo.etablissementId].name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{responsablesMap[detailAbo.etablissementId].name}</p>
                        <p className="text-xs text-muted-foreground truncate">{responsablesMap[detailAbo.etablissementId].email}</p>
                      </div>
                      <Badge className="bg-success/10 text-success-text border-success/30 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Assigné
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                      <span className="text-sm text-warning">Aucun responsable assigné</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Détails</h4>
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Date début</span>
                      <span className="font-medium">{formatDate(detailAbo.dateDebut)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Date fin</span>
                      <span className="font-medium">{formatDate(detailAbo.dateFin)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Période essai</span>
                      <span className="font-medium">{detailAbo.periodeEssaiJours} jours</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Montant payé</span>
                      <span className="font-bold text-success-text font-mono tabular-nums">{formatCurrency(detailAbo.montantPaye)}</span>
                    </div>
                    {detailAbo.modePaiement && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Mode de paiement</span>
                        <span className="font-medium">{detailAbo.modePaiement === 'carte' ? 'Carte bancaire' : detailAbo.modePaiement === 'virement' ? 'Virement' : 'Chèque'}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Renouvellement auto</span>
                      <span className="font-medium">{detailAbo.renouvellementAuto ? 'Oui' : 'Non'}</span>
                    </div>
                    {detailAbo.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">Notes :</p>
                        <p className="text-sm">{detailAbo.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
