'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  CalendarDays,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  CreditCard,
  Building2,
  Trash2,
  Info,
  Download,
  ArrowUpDown,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { PulseSkeleton } from '@/components/ds'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'

// ─── Types ───

interface LigneFacture {
  description: string
  montant: number
}

interface FactureItem {
  id: string
  numero: string
  abonnementId: string
  etablissementId: string
  montantHt: number
  tva: number
  montantTtc: number
  statut: string
  dateEmission: string
  dateEcheance: string
  datePaiement: string | null
  modePaiement: string | null
  referencePaiement: string | null
  lignes: LigneFacture[]
  notes: string | null
  createdAt: string
  updatedAt: string
  abonnement: {
    id: string
    statut: string
    plan: {
      id: string
      nom: string
      type: string
      prixMensuel: number
      prixAnnuel: number | null
    }
  }
  etablissement: {
    id: string
    nom: string
    ville: string | null
    email: string | null
    type?: string | null
    pays?: string | null
    telephone?: string | null
    adresse?: string | null
  }
}

interface AbonnementOption {
  id: string
  etablissementId: string
  statut: string
  plan: {
    id: string
    nom: string
    type: string
    prixMensuel: number
  }
  etablissement: {
    id: string
    nom: string
    ville: string | null
  }
  dateFin: string | null
}

interface EtablissementOption {
  id: string
  nom: string
  ville: string | null
  actif: boolean
}

// ─── Utility functions ───

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA'
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateLong(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// SECT-FACTURATION-AUDIT-E2E [B4] : formatage d'axe Y pour les graphiques de revenus.
// Évite les ticks micro ridicules ("0,001k") quand les valeurs sont faibles ou nulles.
function formatChartTick(v: number) {
  if (v === 0) return '0'
  if (Math.abs(v) < 1000) return Math.round(v).toLocaleString('fr-FR')
  return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k`
}

// SECT-FACTURATION-IMPROVEMENTS : tri des colonnes du tableau Factures.
type SortKey = 'numero' | 'etablissement' | 'montantHt' | 'montantTtc' | 'dateEmission' | 'dateEcheance'
type SortDir = 'asc' | 'desc'

const STATUT_LABELS: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  PAYEE: 'Payée',
  EN_RETARD: 'En retard',
  ANNULEE: 'Annulée',
}

function compareFactures(a: FactureItem, b: FactureItem, key: SortKey, dir: SortDir): number {
  let cmp = 0
  switch (key) {
    case 'numero':
      cmp = a.numero.localeCompare(b.numero, 'fr-FR', { numeric: true })
      break
    case 'etablissement':
      cmp = a.etablissement.nom.localeCompare(b.etablissement.nom, 'fr-FR')
      break
    case 'montantHt':
      cmp = a.montantHt - b.montantHt
      break
    case 'montantTtc':
      cmp = a.montantTtc - b.montantTtc
      break
    case 'dateEmission':
      cmp = new Date(a.dateEmission).getTime() - new Date(b.dateEmission).getTime()
      break
    case 'dateEcheance':
      cmp = new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime()
      break
  }
  return dir === 'asc' ? cmp : -cmp
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
    case 'PAYEE':
      return (
        <Badge className="bg-success/10 text-success-text border-success/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Payée
        </Badge>
      )
    case 'EN_RETARD':
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          En retard
        </Badge>
      )
    case 'ANNULEE':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          <XCircle className="h-3 w-3 mr-1" />
          Annulée
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getStatutLabel(statut: string) {
  switch (statut) {
    case 'EN_ATTENTE': return 'En attente'
    case 'PAYEE': return 'Payée'
    case 'EN_RETARD': return 'En retard'
    case 'ANNULEE': return 'Annulée'
    default: return statut
  }
}

// ─── Chart colors ───

const CHART_COLORS = {
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  red: '#ef4444',
  gray: '#6b7280',
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280']

// ─── Main Component ───

export function FacturationPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Les 3 ressources sont indépendantes → 3 useQuery séparés.
  const facturesQuery = useQuery<{ factures: FactureItem[] }>({
    queryKey: ['factures'],
    queryFn: async () => {
      const res = await fetch('/api/factures?limit=200')
      if (!res.ok) throw new Error('Failed to fetch factures')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const abonnementsQuery = useQuery<{ abonnements: AbonnementOption[] }>({
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

  const factures = facturesQuery.data?.factures ?? []
  const abonnements = useMemo(
    () =>
      (abonnementsQuery.data?.abonnements ?? []).map((a) => ({
        id: a.id,
        etablissementId: a.etablissementId,
        statut: a.statut,
        plan: a.plan,
        etablissement: a.etablissement,
        dateFin: a.dateFin,
      })),
    [abonnementsQuery.data],
  )
  const etablissements = useMemo(
    () =>
      (etablissementsQuery.data?.etablissements ?? []).map((e) => ({
        id: e.id,
        nom: e.nom,
        ville: e.ville,
        actif: e.actif,
      })),
    [etablissementsQuery.data],
  )
  const isLoading =
    facturesQuery.isLoading || abonnementsQuery.isLoading || etablissementsQuery.isLoading

  // Helper pour invalider le cache après mutation (create/pay/cancel).
  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['factures'] }),
      queryClient.invalidateQueries({ queryKey: ['abonnements'] }),
      queryClient.invalidateQueries({ queryKey: ['etablissements'] }),
    ])
  }

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  // SECT-FACTURATION-IMPROVEMENTS : filtre par établissement + tri + pagination.
  const [etablissementFilter, setEtablissementFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('dateEmission')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Selected facture ───
  const [selectedFacture, setSelectedFacture] = useState<FactureItem | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FactureItem | null>(null)
  const [payTarget, setPayTarget] = useState<FactureItem | null>(null)

  // ─── Create form state ───
  const [formAbonnementId, setFormAbonnementId] = useState('')
  const [formDateEcheance, setFormDateEcheance] = useState('')
  const [formLignes, setFormLignes] = useState<LigneFacture[]>([{ description: '', montant: 0 }])
  const [formNotes, setFormNotes] = useState('')

  // ─── Pay form state ───
  const [formModePaiement, setFormModePaiement] = useState('')
  const [formReferencePaiement, setFormReferencePaiement] = useState('')

  // ─── KPI Stats ───
  const stats = useMemo(() => {
    const totalRevenus = factures
      .filter((f) => f.statut === 'PAYEE')
      .reduce((sum, f) => sum + f.montantTtc, 0)
    const enAttente = factures.filter((f) => f.statut === 'EN_ATTENTE')
    const enAttenteCount = enAttente.length
    const enAttenteMontant = enAttente.reduce((sum, f) => sum + f.montantTtc, 0)
    const payeesCount = factures.filter((f) => f.statut === 'PAYEE').length
    const enRetard = factures.filter((f) => f.statut === 'EN_RETARD')
    const enRetardCount = enRetard.length
    const enRetardMontant = enRetard.reduce((sum, f) => sum + f.montantTtc, 0)
    // SECT-FACTURATION-AUDIT-E2E [B2] : exclure les factures ANNULEE du montant moyen
    // (les annulées ne sont pas des transactions réelles ; les inclure à 0 FCFA faussait la moyenne).
    const facturesValides = factures.filter((f) => f.statut !== 'ANNULEE')
    const montantMoyen = facturesValides.length > 0
      ? facturesValides.reduce((sum, f) => sum + f.montantTtc, 0) / facturesValides.length
      : 0
    return { totalRevenus, enAttenteCount, enAttenteMontant, payeesCount, enRetardCount, enRetardMontant, montantMoyen }
  }, [factures])

  // ─── Filtered factures ───
  const filteredFactures = useMemo(() => {
    return factures.filter((f) => {
      const matchStatut = statutFilter === 'all' || f.statut === statutFilter
      const matchEtablissement = etablissementFilter === 'all' || f.etablissementId === etablissementFilter
      const matchSearch =
        !search ||
        f.numero.toLowerCase().includes(search.toLowerCase()) ||
        f.etablissement.nom.toLowerCase().includes(search.toLowerCase()) ||
        f.abonnement.plan.nom.toLowerCase().includes(search.toLowerCase())
      return matchStatut && matchEtablissement && matchSearch
    })
  }, [factures, search, statutFilter, etablissementFilter])

  // SECT-FACTURATION-IMPROVEMENTS : liste triée + slice paginée.
  const sortedFactures = useMemo(() => {
    return [...filteredFactures].sort((a, b) => compareFactures(a, b, sortBy, sortDir))
  }, [filteredFactures, sortBy, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedFactures.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedFactures = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return sortedFactures.slice(start, start + PAGE_SIZE)
  }, [sortedFactures, safeCurrentPage])

  // Reset page à 1 quand les filtres changent.
  const handleFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setCurrentPage(1)
  }

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  // SECT-FACTURATION-IMPROVEMENTS : Export CSV des factures filtrées (tri appliqué, pagination ignorée).
  const handleExportCSV = () => {
    const headers = [
      'Numero',
      'Etablissement',
      'Ville',
      'Plan',
      'Montant HT',
      'TVA (%)',
      'Montant TTC',
      'Statut',
      'Date emission',
      'Date echeance',
      'Date paiement',
      'Mode paiement',
      'Reference paiement',
      'Notes',
    ]
    const escapeCSV = (val: string | number | null | undefined) => {
      const s = String(val ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const rows = sortedFactures.map((f) => [
      f.numero,
      f.etablissement.nom,
      f.etablissement.ville ?? '',
      f.abonnement.plan.nom,
      f.montantHt,
      f.tva,
      f.montantTtc,
      STATUT_LABELS[f.statut] ?? f.statut,
      formatDate(f.dateEmission),
      formatDate(f.dateEcheance),
      formatDate(f.datePaiement),
      f.modePaiement ?? '',
      f.referencePaiement ?? '',
      f.notes ?? '',
    ].map(escapeCSV).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    // BOM UTF-8 pour qu'Excel ouvre correctement les accents.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `factures-sect-${today}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Export CSV généré', {
      description: `${sortedFactures.length} facture(s) exportée(s).`,
    })
  }

  // ─── Analytics data ───
  const monthlyRevenueData = useMemo(() => {
    const months: Record<string, { month: string; ht: number; ttc: number }> = {}
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

    factures.forEach((f) => {
      const date = new Date(f.dateEmission)
      const key = `${date.getFullYear()}-${date.getMonth()}`
      if (!months[key]) {
        months[key] = {
          month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
          ht: 0,
          ttc: 0,
        }
      }
      if (f.statut === 'PAYEE') {
        months[key].ht += f.montantHt
        months[key].ttc += f.montantTtc
      }
    })

    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  }, [factures])

  const revenueByEtablissement = useMemo(() => {
    const etabs: Record<string, { name: string; revenue: number }> = {}
    factures
      .filter((f) => f.statut === 'PAYEE')
      .forEach((f) => {
        if (!etabs[f.etablissementId]) {
          etabs[f.etablissementId] = {
            name: f.etablissement.nom.length > 20
              ? f.etablissement.nom.substring(0, 20) + '…'
              : f.etablissement.nom,
            revenue: 0,
          }
        }
        etabs[f.etablissementId].revenue += f.montantTtc
      })
    return Object.values(etabs).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  }, [factures])

  const paymentStatusData = useMemo(() => {
    const counts = {
      PAYEE: factures.filter((f) => f.statut === 'PAYEE').length,
      EN_ATTENTE: factures.filter((f) => f.statut === 'EN_ATTENTE').length,
      EN_RETARD: factures.filter((f) => f.statut === 'EN_RETARD').length,
      ANNULEE: factures.filter((f) => f.statut === 'ANNULEE').length,
    }
    return [
      { name: 'Payées', value: counts.PAYEE, color: PIE_COLORS[0] },
      { name: 'En attente', value: counts.EN_ATTENTE, color: PIE_COLORS[1] },
      { name: 'En retard', value: counts.EN_RETARD, color: PIE_COLORS[2] },
      { name: 'Annulées', value: counts.ANNULEE, color: PIE_COLORS[3] },
    ].filter((d) => d.value > 0)
  }, [factures])

  const revenueTrendData = useMemo(() => {
    const months: Record<string, { month: string; cumulatif: number }> = {}
    let cumul = 0
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

    factures
      .filter((f) => f.statut === 'PAYEE')
      .sort((a, b) => new Date(a.dateEmission).getTime() - new Date(b.dateEmission).getTime())
      .forEach((f) => {
        const date = new Date(f.dateEmission)
        const key = `${date.getFullYear()}-${date.getMonth()}`
        if (!months[key]) {
          months[key] = {
            month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
            cumulatif: 0,
          }
        }
        cumul += f.montantTtc
        months[key].cumulatif = cumul
      })

    return Object.values(months)
  }, [factures])

  // ─── MRR / ARR / Churn ───
  const mrr = useMemo(() => {
    return abonnements
      .filter((a) => a.statut === 'ACTIF')
      .reduce((sum, a) => sum + a.plan.prixMensuel, 0)
  }, [abonnements])

  const arr = mrr * 12

  const churnRate = useMemo(() => {
    const total = abonnements.length
    const resilie = abonnements.filter((a) => a.statut === 'RESILIE').length
    if (total === 0) return 0
    return Math.round((resilie / total) * 100)
  }, [abonnements])

  // ─── Prévisions data ───
  const forecastData = useMemo(() => {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    const now = new Date()
    const forecast: { month: string; projected: number; confidence: string; color: string }[] = []

    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const monthLabel = `${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()}`

      // Calculate projected revenue based on active subscriptions
      let projected = 0
      abonnements.forEach((a) => {
        if (a.statut === 'ACTIF') {
          // Check if subscription would still be active in this future month
          if (a.dateFin) {
            const endDate = new Date(a.dateFin)
            if (endDate >= futureDate) {
              projected += a.plan.prixMensuel
            }
          } else {
            projected += a.plan.prixMensuel
          }
        }
      })

      const confidence = i <= 2 ? 'Élevée' : i <= 4 ? 'Moyenne' : 'Faible'
      const color = i <= 2 ? CHART_COLORS.emerald : i <= 4 ? CHART_COLORS.teal : CHART_COLORS.cyan

      forecast.push({ month: monthLabel, projected, confidence, color })
    }

    return forecast
  }, [abonnements])

  const projectedRenewals = useMemo(() => {
    const now = new Date()
    const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())

    return abonnements
      .filter((a) => {
        if (!a.dateFin || a.statut !== 'ACTIF') return false
        const endDate = new Date(a.dateFin)
        return endDate >= now && endDate <= threeMonthsFromNow
      })
      .sort((a, b) => new Date(a.dateFin!).getTime() - new Date(b.dateFin!).getTime())
      .map((a) => ({
        id: a.id,
        etablissement: a.etablissement.nom,
        plan: a.plan.nom,
        dateFin: a.dateFin!,
        montant: a.plan.prixMensuel,
      }))
  }, [abonnements])

  const riskAlerts = useMemo(() => {
    const alerts: { type: 'warning' | 'danger'; icon: typeof AlertTriangle; title: string; description: string }[] = []

    // Overdue invoices
    const overdueInvoices = factures.filter((f) => f.statut === 'EN_RETARD')
    if (overdueInvoices.length > 0) {
      const totalOverdue = overdueInvoices.reduce((sum, f) => sum + f.montantTtc, 0)
      alerts.push({
        type: 'danger',
        icon: AlertTriangle,
        title: `${overdueInvoices.length} facture${overdueInvoices.length > 1 ? 's' : ''} en retard`,
        description: `Montant total impayé : ${formatCurrency(totalOverdue)}`,
      })
    }

    // Subscriptions expiring within 30 days
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiringSubs = abonnements.filter((a) => {
      if (!a.dateFin || a.statut !== 'ACTIF') return false
      return new Date(a.dateFin) <= thirtyDaysFromNow
    })
    if (expiringSubs.length > 0) {
      alerts.push({
        type: 'warning',
        icon: Clock,
        title: `${expiringSubs.length} abonnement${expiringSubs.length > 1 ? 's' : ''} expire${expiringSubs.length > 1 ? 'nt' : ''} sous 30 jours`,
        description: 'Pensez à contacter les établissements pour le renouvellement.',
      })
    }

    // High churn
    if (churnRate > 15) {
      alerts.push({
        type: 'danger',
        icon: TrendingDown,
        title: `Taux de résiliation élevé : ${churnRate}%`,
        description: 'Le taux de résiliation dépasse le seuil de 15%.',
      })
    }

    // Unpaid invoices waiting
    const pendingInvoices = factures.filter((f) => f.statut === 'EN_ATTENTE')
    if (pendingInvoices.length > 5) {
      alerts.push({
        type: 'warning',
        icon: Clock,
        title: `${pendingInvoices.length} factures en attente de paiement`,
        description: 'Plus de 5 factures sont en attente. Envisagez des relances.',
      })
    }

    return alerts
  }, [factures, abonnements, churnRate])

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setFormAbonnementId('')
    setFormDateEcheance('')
    setFormLignes([{ description: '', montant: 0 }])
    setFormNotes('')
    setCreateDialogOpen(true)
  }

  // ─── Add line item ───
  const handleAddLigne = () => {
    setFormLignes([...formLignes, { description: '', montant: 0 }])
  }

  // ─── Remove line item ───
  const handleRemoveLigne = (index: number) => {
    if (formLignes.length <= 1) return
    setFormLignes(formLignes.filter((_, i) => i !== index))
  }

  // ─── Update line item ───
  const handleUpdateLigne = (index: number, field: keyof LigneFacture, value: string | number) => {
    const updated = [...formLignes]
    updated[index] = { ...updated[index], [field]: value }
    setFormLignes(updated)
  }

  // ─── Calculate form totals ───
  const formTotalHt = useMemo(() => {
    return formLignes.reduce((sum, l) => sum + (parseFloat(String(l.montant)) || 0), 0)
  }, [formLignes])

  const formTva = 20
  const formTotalTtc = formTotalHt * (1 + formTva / 100)

  // ─── When abonnement changes in form, auto-fill lignes ───
  const handleFormAbonnementChange = (abonnementId: string) => {
    setFormAbonnementId(abonnementId)
    const abo = abonnements.find((a) => a.id === abonnementId)
    if (abo) {
      setFormLignes([{
        description: `Abonnement ${abo.plan.nom} - ${abo.etablissement.nom}`,
        montant: abo.plan.prixMensuel,
      }])
    }
  }

  // ─── Submit create facture ───
  const handleSubmitCreate = async () => {
    if (!formAbonnementId || !formDateEcheance) {
      toast.error('Champs manquants', {
        description: 'L\'abonnement et la date d\'échéance sont obligatoires.',
      })
      return
    }

    const validLignes = formLignes.filter((l) => l.description.trim() && l.montant > 0)
    if (validLignes.length === 0) {
      toast.error('Lignes manquantes', {
        description: 'Ajoutez au moins une ligne de facturation.',
      })
      return
    }

    const abo = abonnements.find((a) => a.id === formAbonnementId)
    if (!abo) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abonnementId: formAbonnementId,
          etablissementId: abo.etablissementId,
          montantHt: formTotalHt,
          tva: formTva,
          montantTtc: formTotalTtc,
          dateEcheance: formDateEcheance,
          lignes: validLignes,
          notes: formNotes || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      toast.success('Facture créée', {
        description: 'La nouvelle facture a été ajoutée avec succès.',
      })
      setCreateDialogOpen(false)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── View facture detail ───
  const handleViewDetail = async (facture: FactureItem) => {
    try {
      const res = await fetch(`/api/factures/${facture.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedFacture(data.facture)
      } else {
        setSelectedFacture(facture)
      }
    } catch {
      setSelectedFacture(facture)
    }
    setDetailDialogOpen(true)
  }

  // ─── Open mark as paid dialog ───
  // SECT-FACTURATION-IMPROVEMENTS : avertir si paiement anticipé (dateEcheance dans le futur).
  const handleOpenPay = (facture: FactureItem) => {
    const echeance = new Date(facture.dateEcheance)
    const now = new Date()
    const daysEarly = Math.ceil((echeance.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysEarly > 0) {
      toast.warning('Paiement anticipé', {
        description: `Cette facture arrive à échéance dans ${daysEarly} jour(s) (${formatDate(facture.dateEcheance)}).`,
      })
    }
    setPayTarget(facture)
    setFormModePaiement('')
    setFormReferencePaiement('')
    setPayDialogOpen(true)
  }

  // ─── Mark as paid ───
  const handleSubmitPay = async () => {
    if (!payTarget) return
    if (!formModePaiement) {
      toast.error('Mode de paiement requis', {
        description: 'Veuillez sélectionner un mode de paiement.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/factures/${payTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'PAYEE',
          modePaiement: formModePaiement,
          referencePaiement: formReferencePaiement || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }

      toast.success('Facture payée', {
        description: `La facture ${payTarget.numero} a été marquée comme payée.`,
      })
      setPayDialogOpen(false)
      setPayTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de marquer la facture comme payée.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Cancel facture ───
  const handleCancelFacture = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/factures/${cancelTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success('Facture annulée', {
        description: `La facture ${cancelTarget.numero} a été annulée.`,
      })
      setCancelDialogOpen(false)
      setCancelTarget(null)
      await refreshData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'annuler la facture.',
      })
    }
  }

  // ─── Custom tooltip for charts ───
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <Receipt className="h-7 w-7 text-success-text" />
            Facturation & Revenus
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les factures, suivez les revenus et analysez les prévisions
          </p>
        </div>
        <Button className="bg-success hover:bg-success/90" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle facture
        </Button>
      </div>

      {/* ─── KPI Stats Cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Revenus totaux */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <DollarSign className="h-5 w-5 text-success-text" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Revenus totaux</p>
              <p className="text-lg font-bold truncate font-mono tabular-nums">{formatCurrency(stats.totalRevenus)}</p>
            </div>
          </CardContent>
        </Card>

        {/* En attente */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold font-mono tabular-nums">{stats.enAttenteCount}</p>
              <p className="text-xs text-muted-foreground truncate">{formatCurrency(stats.enAttenteMontant)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Payées */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Factures payées</p>
              <p className="text-lg font-bold font-mono tabular-nums">{stats.payeesCount}</p>
            </div>
          </CardContent>
        </Card>

        {/* En retard */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">En retard</p>
              <p className="text-lg font-bold font-mono tabular-nums">{stats.enRetardCount}</p>
              <p className="text-xs text-muted-foreground truncate">{formatCurrency(stats.enRetardMontant)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Montant moyen */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10">
              <BarChart3 className="h-5 w-5 text-info" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Montant moyen</p>
              <p className="text-lg font-bold truncate font-mono tabular-nums">{formatCurrency(stats.montantMoyen)}</p>
              <p className="text-[10px] text-muted-foreground/70 truncate">Factures non annulées</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main content with Tabs ─── */}
      <Tabs defaultValue="factures" className="space-y-4">
        <TabsList>
          <TabsTrigger value="factures" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Factures
          </TabsTrigger>
          <TabsTrigger value="analytique" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Analytique
          </TabsTrigger>
          <TabsTrigger value="previsions" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Prévisions
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 1: FACTURES                                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="factures">
          {/* Toolbar — SECT-FACTURATION-IMPROVEMENTS : + filtre établissement + export CSV */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par numéro, établissement ou plan..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9"
              />
            </div>
            <Select value={etablissementFilter} onValueChange={handleFilterChange(setEtablissementFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Établissement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les établissements</SelectItem>
                {etablissements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statutFilter} onValueChange={handleFilterChange(setStatutFilter)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                <SelectItem value="PAYEE">Payée</SelectItem>
                <SelectItem value="EN_RETARD">En retard</SelectItem>
                <SelectItem value="ANNULEE">Annulée</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={sortedFactures.length === 0}
              title="Exporter les factures filtrées en CSV"
              className="shrink-0"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-14 w-full animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredFactures.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <Receipt className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-semibold font-display tracking-tight">Aucune facture trouvée</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                {search || statutFilter !== 'all'
                  ? 'Aucun résultat ne correspond à vos filtres.'
                  : 'Commencez par créer votre première facture.'}
              </p>
              {!search && statutFilter === 'all' && (
                <Button className="mt-6 bg-success hover:bg-success/90" onClick={handleOpenCreate}>
                  <Plus className="h-4 w-4" />
                  Créer une facture
                </Button>
              )}
            </div>
          )}

          {/* Factures Table — desktop (≥640px) */}
          {!isLoading && filteredFactures.length > 0 && (
            <div className="hidden sm:block rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('numero')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Numéro
                          {sortBy === 'numero' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('etablissement')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Établissement
                          {sortBy === 'etablissement' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="text-right font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('montantHt')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                        >
                          Montant HT
                          {sortBy === 'montantHt' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="text-right font-display">TVA</TableHead>
                      <TableHead className="text-right font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('montantTtc')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                        >
                          Montant TTC
                          {sortBy === 'montantTtc' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="font-display">Statut</TableHead>
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('dateEmission')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Émission
                          {sortBy === 'dateEmission' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('dateEcheance')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Échéance
                          {sortBy === 'dateEcheance' ? (
                            sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="text-right font-display">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFactures.map((facture) => {
                      const isOverdue = facture.statut === 'EN_ATTENTE' && new Date(facture.dateEcheance) < new Date()
                      return (
                        <TableRow key={facture.id} className="group">
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handleViewDetail(facture)}
                              className="font-mono tabular-nums text-sm font-medium text-success-text hover:underline cursor-pointer"
                              title="Voir les détails"
                            >
                              {facture.numero}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success-text">
                                {facture.etablissement.nom.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate max-w-[150px]">{facture.etablissement.nom}</p>
                                {facture.etablissement.ville && (
                                  <p className="text-xs text-muted-foreground">{facture.etablissement.ville}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono tabular-nums">{formatCurrency(facture.montantHt)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground font-mono tabular-nums">{facture.tva}%</TableCell>
                          <TableCell className="text-right font-medium text-sm font-mono tabular-nums">{formatCurrency(facture.montantTtc)}</TableCell>
                          <TableCell>
                            {isOverdue && facture.statut === 'EN_ATTENTE' ? (
                              <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                En retard
                              </Badge>
                            ) : (
                              getStatutBadge(facture.statut)
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(facture.dateEmission)}</TableCell>
                          <TableCell className="text-sm">
                            <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                              {formatDate(facture.dateEcheance)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                                onClick={() => handleViewDetail(facture)}
                                title="Voir les détails"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(facture.statut === 'EN_ATTENTE' || facture.statut === 'EN_RETARD') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-success-text hover:text-success-text hover:bg-success/10"
                                  onClick={() => handleOpenPay(facture)}
                                  title="Marquer comme payée"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              )}
                              {facture.statut !== 'ANNULEE' && facture.statut !== 'PAYEE' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setCancelTarget(facture)
                                    setCancelDialogOpen(true)
                                  }}
                                  title="Annuler la facture"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Factures Cards — mobile (<640px) — SECT-FACTURATION-AUDIT-E2E [B3] */}
          {!isLoading && filteredFactures.length > 0 && (
            <div className="sm:hidden space-y-3">
              {paginatedFactures.map((facture) => {
                const isOverdue = facture.statut === 'EN_ATTENTE' && new Date(facture.dateEcheance) < new Date()
                return (
                  <Card key={facture.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      {/* En-tête : numéro + statut */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono tabular-nums text-sm font-semibold text-success-text">{facture.numero}</p>
                          <div className="mt-1 flex items-center gap-2 min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-[10px] font-bold text-success-text">
                              {facture.etablissement.nom.charAt(0).toUpperCase()}
                            </div>
                            <p className="text-sm font-medium truncate">{facture.etablissement.nom}</p>
                          </div>
                          {facture.etablissement.ville && (
                            <p className="mt-0.5 pl-8 text-xs text-muted-foreground truncate">{facture.etablissement.ville}</p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {isOverdue && facture.statut === 'EN_ATTENTE' ? (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              En retard
                            </Badge>
                          ) : (
                            getStatutBadge(facture.statut)
                          )}
                        </div>
                      </div>

                      {/* Montants */}
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-center">
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">HT</p>
                          <p className="text-xs font-medium font-mono tabular-nums">{formatCurrency(facture.montantHt)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">TVA</p>
                          <p className="text-xs font-medium font-mono tabular-nums">{facture.tva}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">TTC</p>
                          <p className="text-sm font-bold font-mono tabular-nums text-success-text">{formatCurrency(facture.montantTtc)}</p>
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-muted-foreground">Émission : </span>
                          <span className="font-medium">{formatDate(facture.dateEmission)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Échéance : </span>
                          <span className={`font-medium ${isOverdue ? 'text-destructive' : ''}`}>
                            {formatDate(facture.dateEcheance)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-1 border-t pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-success-text border-success/30 hover:bg-success/10"
                          onClick={() => handleViewDetail(facture)}
                        >
                          <Eye className="h-4 w-4" />
                          Détails
                        </Button>
                        {(facture.statut === 'EN_ATTENTE' || facture.statut === 'EN_RETARD') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-success-text border-success/30 hover:bg-success/10"
                            onClick={() => handleOpenPay(facture)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Payer
                          </Button>
                        )}
                        {facture.statut !== 'ANNULEE' && facture.statut !== 'PAYEE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => {
                              setCancelTarget(facture)
                              setCancelDialogOpen(true)
                            }}
                            title="Annuler la facture"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Pagination — SECT-FACTURATION-IMPROVEMENTS */}
          {!isLoading && filteredFactures.length > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground order-2 sm:order-1">
                Affichage de {(safeCurrentPage - 1) * PAGE_SIZE + 1} à{' '}
                {Math.min(safeCurrentPage * PAGE_SIZE, sortedFactures.length)} sur{' '}
                {sortedFactures.length} facture(s)
              </p>
              <div className="flex items-center gap-1 order-1 sm:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="h-8 gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Précédent</span>
                </Button>
                <span className="text-sm font-medium px-2 font-mono tabular-nums">
                  {safeCurrentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="h-8 gap-1"
                >
                  <span className="hidden sm:inline">Suivant</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 2: ANALYTIQUE                                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="analytique">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <Card className="border-success/30 bg-gradient-to-br from-success to-white dark:to-background">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">MRR</p>
                    <p className="text-2xl font-bold text-success-text font-mono tabular-nums">{formatCurrency(mrr)}</p>
                    <p className="text-xs text-muted-foreground">Monthly Recurring Revenue</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <TrendingUp className="h-6 w-6 text-success-text" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-gradient-to-br from-success to-white dark:to-background">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">ARR</p>
                    <p className="text-2xl font-bold text-success-text font-mono tabular-nums">{formatCurrency(arr)}</p>
                    <p className="text-xs text-muted-foreground">Annual Recurring Revenue</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <DollarSign className="h-6 w-6 text-success-text" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-${churnRate > 15 ? 'red' : 'cyan'}-200 dark:border-${churnRate > 15 ? 'red' : 'cyan'}-800 bg-gradient-to-br ${churnRate > 15 ? 'from-destructive to-white' : 'from-info to-white'} dark:to-background`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taux de résiliation</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-2xl font-bold ${churnRate > 15 ? 'text-destructive' : 'text-info'} font-mono tabular-nums`}>{churnRate}%</p>
                      {churnRate > 15 ? (
                        <ArrowDownRight className="h-5 w-5 text-destructive" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5 text-success-text" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Churn rate</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${churnRate > 15 ? 'bg-destructive/10' : 'bg-info/10'}`}>
                    {churnRate > 15 ? (
                      <TrendingDown className="h-6 w-6 text-destructive" />
                    ) : (
                      <TrendingUp className="h-6 w-6 text-info" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 1: Revenue by month */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <BarChart3 className="h-4 w-4 text-success-text" />
                  Revenus par mois
                </CardTitle>
                <CardDescription>Revenus HT et TTC des factures payées</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : monthlyRevenueData.length === 0 || monthlyRevenueData.every((d) => d.ht === 0 && d.ttc === 0) ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Aucune facture payée pour cette période</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyRevenueData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={formatChartTick} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="ht" name="HT" fill={CHART_COLORS.emerald} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ttc" name="TTC" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <PieChartIcon className="h-4 w-4 text-success-text" />
                  Répartition par statut
                </CardTitle>
                <CardDescription>Distribution des factures selon leur statut</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : paymentStatusData.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <PieChartIcon className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Aucune donnée disponible</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {paymentStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value} facture${value > 1 ? 's' : ''}`, 'Nombre']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2: Revenue by establishment & Revenue trend */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <Building2 className="h-4 w-4 text-success-text" />
                  Revenus par établissement
                </CardTitle>
                <CardDescription>Top 8 établissements par revenu (factures payées)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : revenueByEtablissement.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Aucun revenu enregistré</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueByEtablissement} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={formatChartTick} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="revenue" name="Revenu" fill={CHART_COLORS.emerald} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <TrendingUp className="h-4 w-4 text-success-text" />
                  Tendance des revenus cumulés
                </CardTitle>
                <CardDescription>Évolution du chiffre d'affaires cumulé</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : revenueTrendData.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Aucune donnée de tendance</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={formatChartTick} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="cumulatif"
                        name="CA cumulé"
                        stroke={CHART_COLORS.emerald}
                        strokeWidth={3}
                        dot={{ fill: CHART_COLORS.emerald, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 3: PRÉVISIONS                                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="previsions">
          {/* Forecast Chart */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 font-display">
                <TrendingUp className="h-4 w-4 text-success-text" />
                Prévisions de revenus — 6 prochains mois
              </CardTitle>
              <CardDescription>
                Basé sur les abonnements actifs actuels et leurs dates de fin
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[350px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : forecastData.every((d) => d.projected === 0) ? (
                <div className="h-[350px] flex flex-col items-center justify-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-2 opacity-30" />
                  <p className="text-sm">Aucun revenu projeté à 6 mois</p>
                  <p className="text-xs mt-1">Abonnement actif sans prix mensuel ou aucun renouvellement à venir.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={forecastData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={formatChartTick} />
                    <Tooltip
                      formatter={(value: number, _name: string, props: { payload?: { confidence?: string } }) => [
                        `${formatCurrency(value)} (Confiance: ${props.payload?.confidence ?? 'N/A'})`,
                        'Revenu projeté',
                      ] as [string, string]}
                    />
                    <Bar dataKey="projected" name="Revenu projeté" radius={[6, 6, 0, 0]}>
                      {forecastData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
            <CardFooter className="flex items-center gap-6 text-sm text-muted-foreground border-t pt-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.emerald }} />
                Confiance élevée (1-2 mois)
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.teal }} />
                Confiance moyenne (3-4 mois)
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.cyan }} />
                Confiance faible (5-6 mois)
              </div>
            </CardFooter>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Projected Renewals Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <CalendarDays className="h-4 w-4 text-success-text" />
                  Renouvellements prévus
                </CardTitle>
                <CardDescription>Abonnements arrivant à échéance dans les 3 prochains mois</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <PulseSkeleton key={i} className="h-14 w-full animate-pulse" />
                    ))}
                  </div>
                ) : projectedRenewals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Aucun renouvellement prévu dans les 3 prochains mois</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {projectedRenewals.map((renewal) => {
                        const daysUntilEnd = Math.ceil(
                          (new Date(renewal.dateFin).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                        )
                        const isUrgent = daysUntilEnd <= 14
                        return (
                          <div
                            key={renewal.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              isUrgent
                                ? 'border-destructive/30 bg-destructive/10'
                                : 'border-border bg-background'
                            }`}
                          >
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                              isUrgent
                                ? 'bg-destructive/10'
                                : 'bg-success/10'
                            }`}>
                              <CalendarDays className={`h-4 w-4 ${
                                isUrgent
                                  ? 'text-destructive'
                                  : 'text-success-text'
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{renewal.etablissement}</p>
                              <p className="text-xs text-muted-foreground">
                                {renewal.plan} — Échéance : {formatDateLong(renewal.dateFin)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium">{formatCurrency(renewal.montant)}</p>
                              <p className={`text-xs ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {daysUntilEnd <= 0 ? 'Expiré' : `J-${daysUntilEnd}`}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Risk Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 font-display">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Alertes & Risques
                </CardTitle>
                <CardDescription>Points d'attention nécessitant une action</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <PulseSkeleton key={i} className="h-14 w-full animate-pulse" />
                    ))}
                  </div>
                ) : riskAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mb-2 text-success-text" />
                    <p className="text-sm font-medium">Tout va bien !</p>
                    <p className="text-xs">Aucune alerte ou risque détecté pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {riskAlerts.map((alert, index) => {
                      const AlertIcon = alert.icon
                      return (
                        <div
                          key={index}
                          className={`flex items-start gap-3 p-4 rounded-lg border ${
                            alert.type === 'danger'
                              ? 'border-destructive/30 bg-destructive/10'
                              : 'border-warning/30 bg-warning/10'
                          }`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            alert.type === 'danger'
                              ? 'bg-destructive/10'
                              : 'bg-warning/10'
                          }`}>
                            <AlertIcon className={`h-4 w-4 ${
                              alert.type === 'danger'
                                ? 'text-destructive'
                                : 'text-warning'
                            }`} />
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${
                              alert.type === 'danger'
                                ? 'text-destructive'
                                : 'text-warning'
                            }`}>
                              {alert.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary forecast table */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 font-display">
                <Info className="h-4 w-4 text-info" />
                Résumé des prévisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                  <p className="text-xs text-muted-foreground">MRR actuel</p>
                  <p className="text-xl font-bold text-success-text font-mono tabular-nums">{formatCurrency(mrr)}</p>
                </div>
                <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                  <p className="text-xs text-muted-foreground">ARR projeté</p>
                  <p className="text-xl font-bold text-success-text font-mono tabular-nums">{formatCurrency(arr)}</p>
                </div>
                <div className="p-4 rounded-lg bg-info/10 border border-info/30">
                  <p className="text-xs text-muted-foreground">Abonnements actifs</p>
                  <p className="text-xl font-bold text-info font-mono tabular-nums">{abonnements.filter((a) => a.statut === 'ACTIF').length}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-muted-foreground">Renouvellements à venir</p>
                  <p className="text-xl font-bold text-warning font-mono tabular-nums">{projectedRenewals.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ─── Create Invoice Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) setCreateDialogOpen(false) }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-success-text" />
              Nouvelle facture
            </DialogTitle>
            <DialogDescription>
              Créez une facture en sélectionnant un abonnement et en ajoutant des lignes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Abonnement */}
            <div className="space-y-2">
              <Label htmlFor="facture-abonnement">Abonnement *</Label>
              <Select value={formAbonnementId} onValueChange={handleFormAbonnementChange}>
                <SelectTrigger id="facture-abonnement">
                  <SelectValue placeholder="Sélectionner un abonnement" />
                </SelectTrigger>
                <SelectContent>
                  {abonnements
                    .filter((a) => a.statut === 'ACTIF' || a.statut === 'ESSAI')
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.etablissement.nom} — {a.plan.nom} ({formatCurrency(a.plan.prixMensuel)}/mois)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date d'échéance */}
            <div className="space-y-2">
              <Label htmlFor="facture-echeance">Date d&apos;échéance *</Label>
              <Input
                id="facture-echeance"
                type="date"
                value={formDateEcheance}
                onChange={(e) => setFormDateEcheance(e.target.value)}
              />
            </div>

            {/* Lignes facture */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Lignes de facturation</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-success/30 text-success-text hover:bg-success/10"
                  onClick={handleAddLigne}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter une ligne
                </Button>
              </div>

              {formLignes.map((ligne, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input
                      placeholder="Description"
                      value={ligne.description}
                      onChange={(e) => handleUpdateLigne(index, 'description', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="Montant"
                      value={ligne.montant || ''}
                      onChange={(e) => handleUpdateLigne(index, 'montant', parseFloat(e.target.value) || 0)}
                      className="text-sm"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  {formLignes.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveLigne(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              {/* Totals */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total HT</span>
                  <span className="font-medium">{formatCurrency(formTotalHt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TVA ({formTva}%)</span>
                  <span className="font-medium">{formatCurrency(formTotalHt * formTva / 100)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold">Total TTC</span>
                  <span className="font-bold text-success-text font-mono tabular-nums">{formatCurrency(formTotalTtc)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="facture-notes">Notes (optionnel)</Label>
              <Textarea
                id="facture-notes"
                placeholder="Notes internes sur cette facture..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-success hover:bg-success/90"
              onClick={handleSubmitCreate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Créer la facture
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Invoice Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!open) setDetailDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-success-text" />
              Détail de la facture
            </DialogTitle>
            <DialogDescription>
              {selectedFacture ? `Facture ${selectedFacture.numero}` : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedFacture && (
            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Numéro</p>
                  <p className="font-mono tabular-nums font-medium text-success-text">{selectedFacture.numero}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Statut</p>
                  {getStatutBadge(selectedFacture.statut)}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Établissement</p>
                  <p className="text-sm font-medium">{selectedFacture.etablissement.nom}</p>
                  {selectedFacture.etablissement.ville && (
                    <p className="text-xs text-muted-foreground">{selectedFacture.etablissement.ville}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Abonnement</p>
                  <p className="text-sm font-medium">{selectedFacture.abonnement.plan.nom}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(selectedFacture.abonnement.plan.prixMensuel)}/mois</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Date d&apos;émission</p>
                  <p className="text-sm">{formatDateLong(selectedFacture.dateEmission)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Date d&apos;échéance</p>
                  <p className={`text-sm ${selectedFacture.statut !== 'PAYEE' && new Date(selectedFacture.dateEcheance) < new Date() ? 'text-destructive font-medium' : ''}`}>
                    {formatDateLong(selectedFacture.dateEcheance)}
                  </p>
                </div>
                {selectedFacture.datePaiement && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Date de paiement</p>
                    <p className="text-sm">{formatDateLong(selectedFacture.datePaiement)}</p>
                  </div>
                )}
                {selectedFacture.modePaiement && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mode de paiement</p>
                    <p className="text-sm">{selectedFacture.modePaiement}</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Lignes facture */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Lignes de facturation</h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-display">Description</TableHead>
                        <TableHead className="text-right font-display">Montant HT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedFacture.lignes && selectedFacture.lignes.length > 0 ? (
                        selectedFacture.lignes.map((ligne, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-sm">{ligne.description}</TableCell>
                            <TableCell className="text-right text-sm font-mono tabular-nums">{formatCurrency(ligne.montant)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground text-sm py-4">
                            Aucune ligne détaillée
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals breakdown */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total HT</span>
                  <span className="font-medium">{formatCurrency(selectedFacture.montantHt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TVA ({selectedFacture.tva}%)</span>
                  <span className="font-medium">{formatCurrency(selectedFacture.montantHt * selectedFacture.tva / 100)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Total TTC</span>
                  <span className="font-bold text-success-text font-mono tabular-nums">{formatCurrency(selectedFacture.montantTtc)}</span>
                </div>
              </div>

              {/* Reference de paiement */}
              {selectedFacture.referencePaiement && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Référence de paiement</p>
                  <p className="text-sm font-mono tabular-nums bg-muted/50 p-2 rounded">{selectedFacture.referencePaiement}</p>
                </div>
              )}

              {/* Notes */}
              {selectedFacture.notes && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm bg-muted/50 p-2 rounded whitespace-pre-wrap">{selectedFacture.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Fermer
            </Button>
            {selectedFacture && (selectedFacture.statut === 'EN_ATTENTE' || selectedFacture.statut === 'EN_RETARD') && (
              <Button
                className="bg-success hover:bg-success/90"
                onClick={() => {
                  setDetailDialogOpen(false)
                  handleOpenPay(selectedFacture)
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Marquer payée
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Mark as Paid Dialog ─── */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) setPayDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success-text" />
              Marquer comme payée
            </DialogTitle>
            <DialogDescription>
              {payTarget
                ? `Facture ${payTarget.numero} — ${formatCurrency(payTarget.montantTtc)}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-mode">Mode de paiement *</Label>
              <Select value={formModePaiement} onValueChange={setFormModePaiement}>
                <SelectTrigger id="pay-mode">
                  <SelectValue placeholder="Sélectionner le mode de paiement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARTE_BANCAIRE">Carte bancaire</SelectItem>
                  <SelectItem value="VIREMENT">Virement bancaire</SelectItem>
                  <SelectItem value="PRELEVEMENT">Prélèvement automatique</SelectItem>
                  <SelectItem value="CHEQUE">Chèque</SelectItem>
                  <SelectItem value="ESPECES">Espèces</SelectItem>
                  <SelectItem value="EN_LIGNE">Paiement en ligne</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-reference">Référence de paiement (optionnel)</Label>
              <Input
                id="pay-reference"
                placeholder="Ex: VIR-2024-001, CB-XXXX-1234..."
                value={formReferencePaiement}
                onChange={(e) => setFormReferencePaiement(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-success hover:bg-success/90"
              onClick={handleSubmitPay}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmer le paiement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Facture Confirmation Dialog ─── */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => { if (!open) setCancelDialogOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Annuler la facture
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `Êtes-vous sûr de vouloir annuler la facture ${cancelTarget.numero} (${formatCurrency(cancelTarget.montantTtc)}) ? Cette action est irréversible.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder la facture</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelFacture}
              className="bg-destructive hover:bg-destructive/90"
            >
              Oui, annuler la facture
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
