'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import {
  Building2,
  CreditCard,
  TrendingUp,
  BarChart3,
  Sparkles,
  LayoutDashboard,
  HeartPulse,
  Shield,
  Users,
  BookOpen,
  KeyRound,
  Loader2,
  ExternalLink,
  Activity,
  ArrowRight,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatCard, ProgressRing, PulseSkeleton } from '@/components/ds'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { BadgesCarousel, BadgeUnlockNotification } from '@/components/shared/badges-carousel'
import type { BadgeWithProgress } from '@/lib/badges-engine'

// ─── Types ───

interface EtablissementResponsable {
  id: string
  name: string
  email: string
  actif: boolean
}

interface EtablissementOverview {
  id: string
  nom: string
  ville: string | null
  type: string | null
  actif: boolean
  abonnementStatut: string | null
  planNom: string | null
  nbUsers: number
  nbFilieres: number
  proctoringActif: boolean
  adminHasAccess: boolean
  responsable: EtablissementResponsable | null
}

interface AccessRecord {
  id: string
  adminId: string
  etablissementId: string
  motif: string
  statut: string
  dateDebut: string | null
  dateFin: string | null
  approuvePar: string | null
  commentaire: string | null
  createdAt: string
  admin?: { id: string; name: string; email: string }
  etablissement?: { id: string; nom: string; ville: string | null; actif: boolean }
}

interface AdminStats {
  nbEtablissements: number
  nbAbonnementsActifs: number
  nbAbonnementsEssai: number
  nbAbonnementsExpires: number
  revenuMensuel: number
  revenuAnnuel: number
  repartitionPlans: Array<{ plan: string; count: number }>
  etablissementsParStatut: Array<{ statut: string; count: number }>
  nbEtablissementsProteges: number
  nbVerificationIdentite: number
  nbAutorisationsActives: number
  nbAutorisationsEnAttente: number
  etablissementsOverview: EtablissementOverview[]

  // SECT-DASHBOARD-ENRICH : données monitoring
  monitoringActiveEvents: number
  monitoringCriticalEvents: number
  monitoringErrorEvents: number
  monitoringResolvedToday: number

  // SECT-DASHBOARD-ENRICH : données paiement
  nbFactures: number
  nbFacturesPayees: number
  nbFacturesEnAttente: number
  revenuTotalFactures: number
}

// ─── Constants ───

const PLAN_COLORS: Record<string, string> = {
  GRATUIT: '#6b7280',
  ESSENTIEL: '#10b981',
  PROFESSIONNEL: '#14b8a6',
  ENTREPRISE: '#f59e0b',
}

const STATUT_LABELS: Record<string, string> = {
  ESSAI: 'Essai',
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
  EXPIRE: 'Expiré',
  RESILIE: 'Résilié',
}

const STATUT_BG: Record<string, string> = {
  ESSAI: 'bg-warning/15 text-warning',
  ACTIF: 'bg-success/15 text-success-text',
  SUSPENDU: 'bg-destructive/15 text-destructive',
  EXPIRE: 'bg-muted text-muted-foreground',
  RESILIE: 'bg-destructive/25 text-destructive',
}

// ─── Custom Pie Label ───

function renderPieLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  name,
  value,
}: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
  name: string
  value: number
}) {
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 28
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  if (percent < 0.03) return null

  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs fill-muted-foreground"
    >
      {name} ({value}, {`${(percent * 100).toFixed(0)}%`})
    </text>
  )
}

// ─── Revenue Tooltip ───

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-xs" style={{ color: entry.color }}>
          Revenus : {entry.value.toLocaleString('fr-FR')} FCFA
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───

export function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [selectedEtablissement, setSelectedEtablissement] = useState<EtablissementOverview | null>(null)
  const [requestMotif, setRequestMotif] = useState('')
  const [requestDateDebut, setRequestDateDebut] = useState('')
  const [requestDateFin, setRequestDateFin] = useState('')
  const [requestCommentaire, setRequestCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newlyUnlocked, setNewlyUnlocked] = useState<BadgeWithProgress | null>(null)

  // Fetch admin stats (structured AdminStats contract from backend statsAdmin)
  const statsQuery = useQuery({
    queryKey: ['admin-stats', user?.id],
    queryFn: async () => {
      const url = user?.id
        ? `/api/stats/admin?adminId=${user.id}`
        : '/api/stats/admin'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Erreur réseau')
      return (await res.json()) as AdminStats
    },
    staleTime: 30 * 1000, // 30 secondes
    refetchInterval: 30 * 1000, // auto-refresh toutes les 30s
    enabled: !!user?.id,
  })

  // Fetch access records (admin's EtablissementAccess demands)
  const accessQuery = useQuery({
    queryKey: ['etablissement-access', user?.id],
    queryFn: async () => {
      // Guard: 'enabled: !!user?.id' garantit user non-null à l'exécution,
      // mais le closure callback n'hérite pas du narrowing TypeScript.
      if (!user?.id) return [] as AccessRecord[]
      const res = await fetch(`/api/etablissement-access?adminId=${user.id}`)
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      return (data.accessRecords || []) as AccessRecord[]
    },
    staleTime: 30 * 1000, // 30 secondes
    refetchInterval: 30 * 1000, // auto-refresh toutes les 30s
    enabled: !!user?.id,
  })

  // Fetch + recalculate badges (non-critical: silent fail)
  const badgesQuery = useQuery({
    queryKey: ['admin-badges', user?.id],
    queryFn: async () => {
      // First recalculate badges server-side
      await fetch('/api/badges', { method: 'POST' })
      // Then get current badges
      const res = await fetch('/api/badges')
      if (!res.ok) {
        return { badges: [] as BadgeWithProgress[], newlyUnlocked: [] as BadgeWithProgress[] }
      }
      const data = await res.json()
      return {
        badges: (data.badges || []) as BadgeWithProgress[],
        newlyUnlocked: (data.newlyUnlocked || []) as BadgeWithProgress[],
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!user?.id,
    // Silent fail — badges are non-critical
    retry: false,
  })

  const stats = statsQuery.data ?? null
  const accessRecords = accessQuery.data ?? []
  const badges = badgesQuery.data?.badges ?? []
  const loading = statsQuery.isLoading

  // Composite platform health score [0-100] — fusion unique des dimensions
  // sécurité + activité (anciennement Score de sécurité = Score de santé plateforme).
  const platformHealthScore = useMemo(() => {
    if (!stats) return 0
    let score = 100
    // -5 par événement critique actif
    score -= (stats.monitoringCriticalEvents ?? 0) * 5
    // -2 par événement erreur actif
    score -= (stats.monitoringErrorEvents ?? 0) * 2
    // -10 si aucun établissement avec proctoring activé
    if ((stats.nbEtablissementsProteges ?? 0) === 0) score -= 10
    // -10 si aucune vérification d'identité
    if ((stats.nbVerificationIdentite ?? 0) === 0) score -= 10
    // -1 par autorisation en attente (backlog admin)
    score -= (stats.nbAutorisationsEnAttente ?? 0) * 1
    return Math.max(0, Math.min(100, score))
  }, [stats])

  // Toast on stats fetch error (one-shot per error transition)
  useEffect(() => {
    if (statsQuery.isError) toast.error('Impossible de charger les statistiques')
  }, [statsQuery.isError])

  // Toast on access fetch error (one-shot per error transition)
  useEffect(() => {
    if (accessQuery.isError) toast.error('Impossible de charger les autorisations')
  }, [accessQuery.isError])

  // Show notification when badges engine unlocks new badges
  useEffect(() => {
    const newly = badgesQuery.data?.newlyUnlocked
    if (newly && newly.length > 0) {
      setNewlyUnlocked(newly[0])
    }
  }, [badgesQuery.data?.newlyUnlocked])

  // Request access handler
  const handleRequestAccess = async () => {
    if (!selectedEtablissement || !user?.id) return
    if (!requestMotif.trim()) {
      toast.error('Le motif est obligatoire')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/etablissement-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user.id,
          etablissementId: selectedEtablissement.id,
          motif: requestMotif,
          dateDebut: requestDateDebut || null,
          dateFin: requestDateFin || null,
          commentaire: requestCommentaire || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la demande')
      }
      toast.success(`Demande d'accès envoyée pour ${selectedEtablissement.nom}`)
      setAccessDialogOpen(false)
      setRequestMotif('')
      setRequestDateDebut('')
      setRequestDateFin('')
      setRequestCommentaire('')
      setSelectedEtablissement(null)
      // Invalidate queries → TanStack refetches in background
      queryClient.invalidateQueries({ queryKey: ['etablissement-access', user.id] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats', user.id] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la demande')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Prepare chart data ───
  const planData = (stats?.repartitionPlans ?? []).map((p) => ({
    name: p.plan,
    value: p.count,
    color: PLAN_COLORS[p.plan.toUpperCase()] || '#0d9488',
  }))

  const totalPlan = planData.reduce((acc, p) => acc + p.value, 0)

  // Revenue trend data — simulate based on monthly revenue
  const revenueTrendData = (() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin']
    const base = stats?.revenuMensuel ?? 0
    if (base === 0) return []
    return months.map((m, i) => ({
      mois: m,
      revenus: Math.round(base * (0.5 + i * 0.1)),
    }))
  })()

  // Navigation helper
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* ═══ Header Savane canonique (pattern filières) ═══ */}
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div className="ds-kente-pattern border-b border-border bg-card">
          <div className="ds-kente-strip" aria-hidden="true" />
          <div className="px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <LayoutDashboard className="h-6 w-6" />
                  </span>
                  Tableau de bord
                  <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Vue d&apos;ensemble de la santé et de l&apos;activité de votre plateforme
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
                    queryClient.invalidateQueries({ queryKey: ['etablissement-access'] })
                    queryClient.invalidateQueries({ queryKey: ['admin-badges'] })
                  }}
                  disabled={loading}
                  aria-label="Rafraîchir les données du tableau de bord"
                >
                  <Activity className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">Rafraîchir</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Layout asymétrique : 5 KPIs (gauche, 2/3) + Score santé (droite, 1/3) ═══ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne gauche : 5 KPI cards épurées avec StatCard DS */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard
            label="Établissements actifs"
            value={stats?.nbEtablissements ?? 0}
            icon={Building2}
            accent="primary"
            loading={loading}
            index={0}
            hint={`${stats?.nbAbonnementsActifs ?? 0} abonnements actifs`}
          />
          <StatCard
            label="Revenus (FCFA)"
            value={(stats?.revenuTotalFactures ?? 0).toLocaleString('fr-FR')}
            icon={BarChart3}
            accent="success"
            loading={loading}
            index={1}
            hint={`${stats?.nbFacturesPayees ?? 0} factures payées`}
          />
          <StatCard
            label="Abonnements essai"
            value={stats?.nbAbonnementsEssai ?? 0}
            icon={CreditCard}
            accent="warning"
            loading={loading}
            index={2}
            hint="Conversions à relancer"
          />
          <StatCard
            label="Événements actifs"
            value={stats?.monitoringActiveEvents ?? 0}
            icon={Activity}
            accent="danger"
            loading={loading}
            index={3}
            hint={`${stats?.monitoringCriticalEvents ?? 0} critiques, ${stats?.monitoringErrorEvents ?? 0} erreurs`}
          />
          <StatCard
            label="Autorisations en attente"
            value={stats?.nbAutorisationsEnAttente ?? 0}
            icon={KeyRound}
            accent="secondary"
            loading={loading}
            index={4}
            hint={`${stats?.nbAutorisationsActives ?? 0} actives`}
          />
        </div>

        {/* Colonne droite : Santé plateforme (score unique fusionné) */}
        <Card className="lg:col-span-1 ds-kente-top flex flex-col">
          <CardHeader>
            <CardTitle className="font-display tracking-tight flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-success-text" />
              Santé plateforme
            </CardTitle>
            <CardDescription>Score de sécurité global</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center py-6">
            {loading ? (
              <PulseSkeleton className="h-40 w-40" variant="circle" />
            ) : (
              <>
                <ProgressRing
                  value={platformHealthScore}
                  size={180}
                  strokeWidth={14}
                  accent={
                    platformHealthScore >= 80
                      ? 'success'
                      : platformHealthScore >= 50
                        ? 'warning'
                        : 'danger'
                  }
                  showPercent
                  sublabel={`${stats?.monitoringActiveEvents ?? 0} événements actifs`}
                />
                <div className="mt-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {platformHealthScore >= 80
                      ? '✓ Plateforme en bonne santé'
                      : platformHealthScore >= 50
                        ? '⚠ Attention requise'
                        : '⚠ Action urgente requise'}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Section : Succès & badges ═══ */}
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
          Succès & badges
        </h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <BadgesCarousel badges={badges} />

      {/* ═══ Section : Activité commerciale ═══ */}
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
          Activité commerciale
        </h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display tracking-tight">
              <TrendingUp className="h-5 w-5 text-success-text" />
              Tendance des revenus
            </CardTitle>
            <CardDescription>Évolution mensuelle des revenus de la plateforme</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <PulseSkeleton className="h-56 w-full" />
              </div>
            ) : revenueTrendData.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground ds-kente-watermark rounded-lg">
                <TrendingUp className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucune donnée de revenu disponible</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v: number) => `${(v / 1000).toLocaleString('fr-FR')}k FCFA`}
                  />
                  <RechartsTooltip content={<RevenueTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenus"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    name="Revenus"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              📊 Données de revenus au niveau plateforme
            </p>
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display tracking-tight">
              <CreditCard className="h-5 w-5 text-primary-text" />
              Répartition par plan
            </CardTitle>
            <CardDescription>Distribution des abonnements selon le plan choisi</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <PulseSkeleton className="h-48 w-48" variant="circle" />
              </div>
            ) : planData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground ds-kente-watermark rounded-lg">
                <CreditCard className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">Aucun abonnement enregistré</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={planData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {planData.map((entry, index) => (
                      <Cell key={`plan-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `${value} (${totalPlan > 0 ? ((value / totalPlan) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              📊 Données au niveau plateforme
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Section : Établissements ═══ */}
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
          Établissements
        </h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display tracking-tight">
            <Building2 className="h-5 w-5 text-warning" />
            Établissements
          </CardTitle>
          <CardDescription>Vue d&apos;ensemble des établissements de la plateforme</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <PulseSkeleton className="mb-2 h-5 w-3/4" />
                    <PulseSkeleton className="mb-3 h-4 w-1/2" />
                    <div className="flex gap-2">
                      <PulseSkeleton className="h-6 w-16" />
                      <PulseSkeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !stats?.etablissementsOverview || stats.etablissementsOverview.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground ds-kente-watermark rounded-lg">
              <Building2 className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">Aucun établissement enregistré</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {stats.etablissementsOverview.map((etab) => (
                  <Card
                    key={etab.id}
                    className="relative overflow-hidden transition-shadow hover:shadow-md ds-lift"
                  >
                    <div
                      className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                      style={{
                        backgroundColor: etab.actif ? '#10b981' : '#6b7280',
                      }}
                    />
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{etab.nom}</h3>
                          <p className="text-xs text-muted-foreground">
                            {etab.ville || 'Ville non renseignée'}{etab.type ? ` · ${etab.type}` : ''}
                          </p>
                        </div>
                        {etab.proctoringActif && (
                          <Shield className="h-4 w-4 shrink-0 text-success-text" />
                        )}
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {etab.abonnementStatut && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUT_BG[etab.abonnementStatut] || ''}`}>
                            {STATUT_LABELS[etab.abonnementStatut] || etab.abonnementStatut}
                          </Badge>
                        )}
                        {etab.planNom && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary-text">
                            {etab.planNom}
                          </Badge>
                        )}
                      </div>

                      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span className="font-mono tabular-nums tracking-tight">{etab.nbUsers}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          <span className="font-mono tabular-nums tracking-tight">{etab.nbFilieres}</span> filières
                        </span>
                      </div>

                      {/* Responsable */}
                      {etab.responsable && (
                        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span className="font-medium text-foreground">{etab.responsable.name}</span>
                            {!etab.responsable.actif && (
                              <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-destructive/10 text-destructive">
                                Inactif
                              </Badge>
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {etab.adminHasAccess ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              router.push('/etablissements')
                            }}
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            Voir détails
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs ds-shimmer"
                            disabled={accessRecords.some(
                              r => r.etablissementId === etab.id && r.statut === 'EN_ATTENTE'
                            )}
                            onClick={() => {
                              setSelectedEtablissement(etab)
                              setAccessDialogOpen(true)
                            }}
                          >
                            <KeyRound className="mr-1 h-3 w-3" />
                            {accessRecords.some(
                              r => r.etablissementId === etab.id && r.statut === 'EN_ATTENTE'
                            )
                              ? 'Demande envoyée'
                              : 'Demander accès'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ═══ Section : Monitoring temps réel (compact) ═══ */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Monitoring en temps réel
          </h3>
          <Button variant="ghost" size="sm" onClick={() => router.push('/monitoring')}>
            Voir tout <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-primary">{stats?.monitoringActiveEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Événements actifs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-destructive">{stats?.monitoringCriticalEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Critiques</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-warning">{stats?.monitoringErrorEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Erreurs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-success">{stats?.monitoringResolvedToday ?? 0}</p>
            <p className="text-xs text-muted-foreground">Résolus aujourd&apos;hui</p>
          </div>
        </div>
      </Card>

      {/* ─── Access Request Dialog ─── */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Demander l&apos;accès</DialogTitle>
            <DialogDescription>
              Demandez l&apos;autorisation d&apos;accéder aux données de{' '}
              <span className="font-semibold">{selectedEtablissement?.nom}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="motif">Motif *</Label>
              <Select value={requestMotif} onValueChange={setRequestMotif}>
                <SelectTrigger id="motif">
                  <SelectValue placeholder="Sélectionnez un motif" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Audit">Audit</SelectItem>
                  <SelectItem value="Support technique">Support technique</SelectItem>
                  <SelectItem value="Inspection">Inspection</SelectItem>
                  <SelectItem value="Urgence">Intervention urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dateDebut">Date début</Label>
                <Input
                  id="dateDebut"
                  type="date"
                  value={requestDateDebut}
                  onChange={(e) => setRequestDateDebut(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateFin">Date fin</Label>
                <Input
                  id="dateFin"
                  type="date"
                  value={requestDateFin}
                  onChange={(e) => setRequestDateFin(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="commentaire">Commentaire</Label>
              <Textarea
                id="commentaire"
                placeholder="Précisez la raison de votre demande..."
                value={requestCommentaire}
                onChange={(e) => setRequestCommentaire(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAccessDialogOpen(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              onClick={handleRequestAccess}
              disabled={submitting || !requestMotif}
              className="ds-shimmer"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Badge unlock notification */}
      <AnimatePresence>
        {newlyUnlocked && (
          <BadgeUnlockNotification
            badge={newlyUnlocked}
            onClose={() => setNewlyUnlocked(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
