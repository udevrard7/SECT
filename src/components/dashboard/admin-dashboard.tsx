'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Building2,
  CreditCard,
  TrendingUp,
  BarChart3,
  Lock,
  HeartPulse,
  Eye,
  Shield,
  CheckCircle2,
  Users,
  BookOpen,
  KeyRound,
  Loader2,
  ExternalLink,
  Plus,
  Zap,
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  admin: { id: string; name: string; email: string }
  etablissement: { id: string; nom: string; ville: string | null; actif: boolean }
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
}

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  accentColor: string
  subtitle?: string
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
  ESSAI: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  ACTIF: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  SUSPENDU: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  EXPIRE: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  RESILIE: 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300',
}

// ─── StatCard ───

function StatCard({ title, value, icon, accentColor, subtitle }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">{title}</CardDescription>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accentColor}18` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
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
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessRecords, setAccessRecords] = useState<AccessRecord[]>([])
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [selectedEtablissement, setSelectedEtablissement] = useState<EtablissementOverview | null>(null)
  const [requestMotif, setRequestMotif] = useState('')
  const [requestDateDebut, setRequestDateDebut] = useState('')
  const [requestDateFin, setRequestDateFin] = useState('')
  const [requestCommentaire, setRequestCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Fetch admin stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const url = user?.id
          ? `/api/stats/admin?adminId=${user.id}`
          : '/api/stats/admin'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Erreur réseau')
        const data: AdminStats = await res.json()
        setStats(data)
      } catch {
        toast.error('Impossible de charger les statistiques')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [user?.id])

  // Fetch access records
  const fetchAccessRecords = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/etablissement-access?adminId=${user.id}`)
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      setAccessRecords(data.accessRecords || [])
    } catch {
      toast.error('Impossible de charger les autorisations')
    }
  }, [user?.id])

  useEffect(() => {
    fetchAccessRecords()
  }, [fetchAccessRecords])

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
      fetchAccessRecords()
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

  // Conversion rate: ACTIF / total
  const totalAbonnements = (stats?.nbAbonnementsActifs ?? 0) + (stats?.nbAbonnementsEssai ?? 0) + (stats?.nbAbonnementsExpires ?? 0)
  const tauxConversion = totalAbonnements > 0
    ? (((stats?.nbAbonnementsActifs ?? 0) / totalAbonnements) * 100).toFixed(1)
    : '0.0'

  // Security score (based on proctoring + identity verification coverage)
  const totalEtablissements = stats?.nbEtablissements ?? 1
  const securityRatio = ((stats?.nbEtablissementsProteges ?? 0) / totalEtablissements) * 100
  const avgSecurityScore = Math.min(100, Math.round(securityRatio * 0.6 + (stats?.nbVerificationIdentite ?? 0) / totalEtablissements * 100 * 0.4))

  // Navigation helper
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Bonjour, {user?.name ?? 'Administrateur'}
          </h1>
          <Badge
            className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Propriétaire SaaS
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
        <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          🔒 Accès aux données des établissements soumis à autorisation explicite
        </p>
      </div>

      {/* ─── 2. KPI Row (6 cards) ─── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-muted" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Revenus mensuels"
            value={`${(stats?.revenuMensuel ?? 0).toLocaleString('fr-FR')} FCFA`}
            icon={<TrendingUp className="h-5 w-5" />}
            accentColor="#10b981"
            subtitle={`${(stats?.revenuAnnuel ?? 0).toLocaleString('fr-FR')} FCFA / an`}
          />
          <StatCard
            title="Établissements actifs"
            value={stats?.nbEtablissements ?? 0}
            icon={<Building2 className="h-5 w-5" />}
            accentColor="#f59e0b"
          />
          <StatCard
            title="Abonnements actifs"
            value={stats?.nbAbonnementsActifs ?? 0}
            icon={<CreditCard className="h-5 w-5" />}
            accentColor="#14b8a6"
            subtitle={`${stats?.nbAbonnementsEssai ?? 0} en essai`}
          />
          <StatCard
            title="Taux de conversion"
            value={`${tauxConversion}%`}
            icon={<BarChart3 className="h-5 w-5" />}
            accentColor="#059669"
            subtitle="ACTIF / Total"
          />
          <StatCard
            title="Santé plateforme"
            value={`${avgSecurityScore}%`}
            icon={<HeartPulse className="h-5 w-5" />}
            accentColor="#0d9488"
            subtitle="Score de sécurité"
          />
          <StatCard
            title="Autorisations actives"
            value={stats?.nbAutorisationsActives ?? 0}
            icon={<KeyRound className="h-5 w-5" />}
            accentColor="#dc2626"
            subtitle={`${stats?.nbAutorisationsEnAttente ?? 0} en attente`}
          />
        </div>
      )}

      {/* ─── 3. Revenue Chart + Plan Distribution (2-column) ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Tendance des revenus
            </CardTitle>
            <CardDescription>Évolution mensuelle des revenus de la plateforme</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : revenueTrendData.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-muted-foreground">
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
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-teal-600" />
              Répartition par plan
            </CardTitle>
            <CardDescription>Distribution des abonnements selon le plan choisi</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Skeleton className="h-48 w-48 rounded-full" />
              </div>
            ) : planData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
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

      {/* ─── 4. Établissements Overview (Card-based) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
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
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="mb-3 h-4 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !stats?.etablissementsOverview || stats.etablissementsOverview.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
              <Building2 className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">Aucun établissement enregistré</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {stats.etablissementsOverview.map((etab) => (
                  <Card
                    key={etab.id}
                    className="relative overflow-hidden transition-shadow hover:shadow-md"
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
                          <Shield className="h-4 w-4 shrink-0 text-emerald-600" />
                        )}
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {etab.abonnementStatut && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUT_BG[etab.abonnementStatut] || ''}`}>
                            {STATUT_LABELS[etab.abonnementStatut] || etab.abonnementStatut}
                          </Badge>
                        )}
                        {etab.planNom && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                            {etab.planNom}
                          </Badge>
                        )}
                      </div>

                      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {etab.nbUsers}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {etab.nbFilieres} filières
                        </span>
                      </div>

                      {/* Responsable */}
                      {etab.responsable && (
                        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span className="font-medium text-foreground">{etab.responsable.name}</span>
                            {!etab.responsable.actif && (
                              <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
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
                            variant="outline"
                            className="h-7 text-xs"
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

      {/* ─── 5. Quick Actions ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-600" />
            Actions rapides
          </CardTitle>
          <CardDescription>Accès directs aux fonctionnalités clés</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => router.push('/abonnements')}
            >
              <Plus className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium">Nouvelle souscription</span>
              <span className="text-xs text-muted-foreground">Créer un établissement avec abonnement</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => router.push('/utilisateurs')}
            >
              <Users className="h-5 w-5 text-teal-600" />
              <span className="text-sm font-medium">Voir les responsables</span>
              <span className="text-xs text-muted-foreground">Gérer les comptes responsables</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => router.push('/acces-etablissements')}
            >
              <KeyRound className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium">Accès & autorisations</span>
              <span className="text-xs text-muted-foreground">Gérer les autorisations d&apos;accès</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── 6. Platform Health Card ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-500" />
            Santé de la plateforme
          </CardTitle>
          <CardDescription>Indicateurs de sécurité et d&apos;activité globale</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Left column - metrics */}
              <div className="space-y-4">
                {/* Active establishments vs total */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                      <Building2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <span className="text-sm">Établissements actifs</span>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {stats?.nbAbonnementsActifs ?? 0} / {stats?.nbEtablissements ?? 0}
                  </Badge>
                </div>
                <Separator />

                {/* Proctoring enabled */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/30">
                      <Shield className="h-4 w-4 text-rose-600" />
                    </div>
                    <span className="text-sm">Proctoring activé</span>
                  </div>
                  <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                    {stats?.nbEtablissementsProteges ?? 0}
                  </Badge>
                </div>
                <Separator />

                {/* Identity verification */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-900/30">
                      <Eye className="h-4 w-4 text-teal-600" />
                    </div>
                    <span className="text-sm">Vérification d&apos;identité</span>
                  </div>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                    {stats?.nbVerificationIdentite ?? 0}
                  </Badge>
                </div>
                <Separator />

                {/* Average security score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                      <Lock className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-sm">Score de sécurité moyen</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      avgSecurityScore >= 70
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : avgSecurityScore >= 40
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }
                  >
                    {avgSecurityScore}%
                  </Badge>
                </div>
                <Separator />

                {/* Trial accounts */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                      <CheckCircle2 className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-sm">En période d&apos;essai</span>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {stats?.nbAbonnementsEssai ?? 0}
                  </Badge>
                </div>
              </div>

              {/* Right column - visual score */}
              <div className="flex flex-col items-center justify-center rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-6 dark:from-emerald-950/30 dark:to-teal-950/30">
                <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Santé plateforme
                </p>
                <div className="flex items-end gap-1">
                  <span
                    className="text-5xl font-bold leading-none"
                    style={{ color: '#10b981' }}
                  >
                    {avgSecurityScore}
                  </span>
                  <span className="mb-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                    %
                  </span>
                </div>
                <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                  Score de sécurité global
                </p>
              </div>
            </div>
          )}
        </CardContent>
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
                  <SelectItem value="audit">Audit</SelectItem>
                  <SelectItem value="support">Support technique</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="urgent">Intervention urgente</SelectItem>
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
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
