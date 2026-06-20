'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
  ClipboardCheck,
  Users,
  BookOpen,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Award,
  Star,
  Target,
  Check,
  RefreshCw,
  Clock,
  Shield,
  Trophy,
  Eye,
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
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { BadgesCarousel, BadgeUnlockNotification } from '@/components/shared/badges-carousel'
import type { BadgeWithProgress } from '@/lib/badges-engine'

// --- Animation Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 100 },
  },
}

// ─── Types (matching API response) ───

interface RepartitionNote {
  label: string
  count: number
}

interface ResultatParMatiere {
  titre: string
  enseignant: string
  moyenne: number
  tauxReussite: number
  nbParticipants: number
}

interface EtudiantParFiliere {
  filiere: string
  count: number
}

interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

interface TopEnseignant {
  nom: string
  nbEpreuves: number
  moyenne: number
  tauxReussite: number
}

interface AlerteStat {
  type: string
  titre: string
  description: string
  severity: string
}

interface TopEtudiant {
  id: string
  nom: string
  email: string
  moyenne: number
  filiere: string
}

interface StatsData {
  nbEtudiants: number
  nbEnseignants: number
  nbEvaluations: number
  tauxReussiteGlobal: number
  moyenneGenerale: number
  repartitionNotes: RepartitionNote[]
  resultatsParMatiere: ResultatParMatiere[]
  etudiantsParFiliere: EtudiantParFiliere[]
  evolutionMoyennes: EvolutionMoyenne[]
  topEnseignants: TopEnseignant[]
  alertes: AlerteStat[]
  topEtudiants: TopEtudiant[]
  etudiantsEnDifficulte: TopEtudiant[]
  badges: BadgeWithProgress[]
}

// --- Helper Functions ---

function getScoreColor(score: number, maxScore: number = 20): string {
  const halfMax = maxScore / 2
  if (score >= halfMax) return '#10b981'
  if (score >= halfMax * 0.8) return '#f59e0b'
  return '#ef4444'
}

function getTauxColor(taux: number): string {
  if (taux >= 70) return '#10b981'
  if (taux >= 50) return '#f59e0b'
  return '#ef4444'
}

function formatDateFR(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatMonth(mois: string): string {
  try {
    const [year, month] = mois.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  } catch {
    return mois
  }
}

function getSeverityIcon(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical':
    case 'critique':
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
    case 'warning':
    case 'avertissement':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
    default:
      return <Clock className="h-3.5 w-3.5 text-blue-500" />
  }
}

function getSeverityBorder(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
    case 'critique':
      return 'border-red-500'
    case 'warning':
    case 'avertissement':
      return 'border-amber-500'
    default:
      return 'border-blue-500'
  }
}

// --- Skeleton for Loading State ---

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}

// --- Error State ---
function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
      </div>
      <h3 className="text-lg font-semibold text-center">Impossible de charger le tableau de bord</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Une erreur est survenue lors du chargement des statistiques. Veuillez réessayer.
      </p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Réessayer
      </Button>
    </div>
  )
}

// --- Objective Card ---
function ObjectiveCard() {
  const [objective, setObjective] = useState('Améliorer le taux de réussite de 5%')
  const [isEditing, setIsEditing] = useState(false)

  return (
    <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border-amber-200 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <Target className="h-5 w-5" />
          Mon Objectif
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="flex-grow bg-transparent border-b border-amber-500 focus:outline-none text-lg font-semibold"
            />
            <Button size="sm" onClick={() => setIsEditing(false)}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-semibold">{objective}</p>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>Modifier</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}



// --- Alertes Timeline ---
function AlertesTimeline({ alertes }: { alertes: AlerteStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Alertes Récentes
        </CardTitle>
        <CardDescription>Points d&apos;attention nécessitant votre intervention</CardDescription>
      </CardHeader>
      <CardContent>
        {alertes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6">
            <Shield className="h-10 w-10 text-emerald-500 mb-2" />
            <p className="font-semibold">Tout est au vert</p>
            <p className="text-sm text-muted-foreground">Aucune alerte active pour le moment.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
            {alertes.slice(0, 5).map((alerte, index) => (
              <motion.div key={index} variants={itemVariants} className="mb-6 last:mb-0">
                <div className={`absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 ${getSeverityBorder(alerte.severity)} flex items-center justify-center -translate-x-1/2 ml-0.5`}>
                  {getSeverityIcon(alerte.severity)}
                </div>
                <p className="font-semibold text-sm">{alerte.titre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{alerte.description}</p>
                <Badge variant="outline" className="text-[10px] mt-1">{alerte.type}</Badge>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Top Enseignants ---
function TopEnseignantsSection({ enseignants }: { enseignants: TopEnseignant[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top Enseignants
        </CardTitle>
      </CardHeader>
      <CardContent>
        {enseignants.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucune donnée disponible.</p>
        ) : (
          <div className="space-y-4">
            {enseignants.slice(0, 5).map((ens, index) => {
              const tauxColor = getTauxColor(ens.tauxReussite)
              return (
                <div key={index} className="flex items-center">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs"
                    style={{
                      backgroundColor: `${tauxColor}20`,
                      color: tauxColor,
                    }}
                  >
                    {ens.tauxReussite}%
                  </div>
                  <div className="ml-4 flex-grow">
                    <p className="font-semibold truncate">{ens.nom}</p>
                    <p className="text-sm text-muted-foreground">
                      {ens.nbEpreuves} épreuve{ens.nbEpreuves !== 1 ? 's' : ''} · Moy: {ens.moyenne.toFixed(1)}/20
                    </p>
                  </div>
                  {index === 0 && <Award className="h-5 w-5 text-amber-500" />}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Étudiants en Difficulté ---
function EtudiantsDifficulteSection({ etudiants }: { etudiants: TopEtudiant[] }) {
  if (etudiants.length === 0) return null

  return (
    <Card className="border-rose-200 dark:border-rose-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" />
          Étudiants en Difficulté
        </CardTitle>
        <CardDescription>Moyenne inférieure à 10/20</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {etudiants.slice(0, 5).map((etu, index) => {
            const scoreColor = getScoreColor(etu.moyenne)
            return (
              <div key={index} className="flex items-center">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-[10px]"
                  style={{
                    backgroundColor: `${scoreColor}20`,
                    color: scoreColor,
                  }}
                >
                  {etu.moyenne.toFixed(1)}
                </div>
                <div className="ml-3 flex-grow">
                  <p className="font-medium text-sm truncate">{etu.nom}</p>
                  <p className="text-xs text-muted-foreground">{etu.filiere}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Empty Dashboard ---
function EmptyDashboard({ name }: { name: string }) {
  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.h1 variants={itemVariants} className="text-2xl font-bold tracking-tight md:text-3xl">
        Bonjour, {name} ! Bienvenue sur votre espace.
      </motion.h1>
      <ObjectiveCard />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
            <GraduationCap className="h-10 w-10 text-amber-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Votre tableau de bord stratégique sera disponible dès que des données seront enregistrées.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ───
export function ResponsableDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Responsable'

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<BadgeWithProgress | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`/api/stats/responsable`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error('Erreur réseau')
      const json: StatsData = await res.json()

      // Fetch badges separately
      try {
        const badgesRes = await fetch('/api/badges')
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json()
          json.badges = badgesData.badges || []
        } else {
          json.badges = []
        }
      } catch {
        json.badges = []
      }

      setData(json)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(true)
      if (data === null) {
        toast.error('Impossible de charger les statistiques du tableau de bord.', {
          action: { label: 'Réessayer', onClick: () => fetchStats() },
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Trigger badge recalculation on dashboard load
  useEffect(() => {
    const refreshBadges = async () => {
      try {
        const res = await fetch('/api/badges', { method: 'POST' })
        if (res.ok) {
          const badgesData = await res.json()
          if (badgesData.badges) {
            setData(prev => prev ? { ...prev, badges: badgesData.badges } : prev)
          }
          // Show notification for newly unlocked badges
          if (badgesData.newlyUnlocked && badgesData.newlyUnlocked.length > 0) {
            setNewlyUnlockedBadge(badgesData.newlyUnlocked[0])
          }
        }
      } catch (err) {
        console.error('Badge refresh error:', err)
      }
    }
    refreshBadges()
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (error && !data) {
    return <DashboardError onRetry={fetchStats} />
  }

  if (!data) {
    return <EmptyDashboard name={name} />
  }

  const hasNoActivity = data.nbEtudiants === 0 && data.nbEvaluations === 0

  if (hasNoActivity) {
    return <EmptyDashboard name={name} />
  }

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence>
        <motion.h1 variants={itemVariants} className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {name} ! Vue stratégique de votre établissement.
        </motion.h1>
      </AnimatePresence>

      {/* Quick stats bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <GraduationCap className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbEtudiants}</p>
              <p className="text-xs text-muted-foreground">Étudiant{data.nbEtudiants !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbEnseignants}</p>
              <p className="text-xs text-muted-foreground">Enseignant{data.nbEnseignants !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbEvaluations}</p>
              <p className="text-xs text-muted-foreground">Évaluation{data.nbEvaluations !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
              <TrendingUp className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.tauxReussiteGlobal}%</p>
              <p className="text-xs text-muted-foreground">Taux réussite</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <BarChart3 className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.moyenneGenerale.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Moyenne /20</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Alertes banner */}
      {data.alertes.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {data.alertes.length} alerte{data.alertes.length !== 1 ? 's' : ''} active{data.alertes.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Des points d&apos;attention nécessitent votre intervention
                  </p>
                </div>
              </div>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => window.location.href = '/alertes'}
              >
                <AlertTriangle className="mr-2 h-4 w-4" /> Voir les alertes
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
        {/* Main column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div variants={itemVariants}>
            <ObjectiveCard />
          </motion.div>

          <motion.div variants={itemVariants}>
            <BadgesCarousel badges={data.badges || []} />
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                    Évolution des moyennes
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {data.evolutionMoyennes.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.evolutionMoyennes.map(e => ({ ...e, mois: formatMonth(e.mois) }))}>
                        <defs>
                          <linearGradient id="responsableScoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="moyenne" stroke="#f59e0b" strokeWidth={2.5} fill="url(#responsableScoreGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Pas encore de données
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-amber-600" />
                    Répartition des notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {data.repartitionNotes.some(r => r.count > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.repartitionNotes}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {data.repartitionNotes.map((entry, index) => {
                            // Color by bucket: green for high scores, amber for medium, red for low
                            const bucketCenter = parseFloat(entry.label.split('-')[0])
                            let fill = '#ef4444' // red
                            if (bucketCenter >= 12) fill = '#10b981' // green
                            else if (bucketCenter >= 8) fill = '#f59e0b' // amber
                            return <Cell key={`cell-${index}`} fill={fill} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Pas encore de données
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Resultats par matière */}
          {data.resultatsParMatiere.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-amber-600" />
                    Résultats par matière
                  </CardTitle>
                  <CardDescription>Classement par moyenne décroissante</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.resultatsParMatiere.slice(0, 6).map((matiere, index) => {
                      const scoreColor = getScoreColor(matiere.moyenne)
                      return (
                        <div key={index} className="flex items-center">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs"
                            style={{
                              backgroundColor: `${scoreColor}20`,
                              color: scoreColor,
                            }}
                          >
                            {matiere.moyenne.toFixed(1)}
                          </div>
                          <div className="ml-4 flex-grow">
                            <p className="font-semibold truncate">{matiere.titre}</p>
                            <p className="text-sm text-muted-foreground">
                              {matiere.enseignant} · {matiere.nbParticipants} participant{matiere.nbParticipants !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              style={{
                                borderColor: `${getTauxColor(matiere.tauxReussite)}`,
                                color: getTauxColor(matiere.tauxReussite),
                              }}
                            >
                              {matiere.tauxReussite}% réussite
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <motion.div variants={itemVariants}>
            <AlertesTimeline alertes={data.alertes} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <TopEnseignantsSection enseignants={data.topEnseignants} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <EtudiantsDifficulteSection etudiants={data.etudiantsEnDifficulte} />
          </motion.div>

          {/* Filières breakdown */}
          {data.etudiantsParFiliere.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-amber-600" />
                    Étudiants par filière
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.etudiantsParFiliere.map((f, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{f.filiere}</span>
                        <Badge variant="secondary" className="text-xs">{f.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Top étudiants */}
          {data.topEtudiants.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    Top Étudiants
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.topEtudiants.slice(0, 5).map((etu, index) => {
                      const scoreColor = getScoreColor(etu.moyenne)
                      return (
                        <div key={index} className="flex items-center">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-[10px]"
                            style={{
                              backgroundColor: `${scoreColor}20`,
                              color: scoreColor,
                            }}
                          >
                            {etu.moyenne.toFixed(1)}
                          </div>
                          <div className="ml-3 flex-grow">
                            <p className="font-medium text-sm truncate">{etu.nom}</p>
                            <p className="text-xs text-muted-foreground">{etu.filiere}</p>
                          </div>
                          {index === 0 && <Trophy className="h-4 w-4 text-amber-500" />}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      {/* Badge unlock notification */}
      <AnimatePresence>
        {newlyUnlockedBadge && (
          <BadgeUnlockNotification
            badge={newlyUnlockedBadge}
            onClose={() => setNewlyUnlockedBadge(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
