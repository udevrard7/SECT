'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  ClipboardPen,
  Clock,
  Plus,
  BarChart3,
  TrendingUp,
  Inbox,
  CheckCircle,
  MessageSquareWarning,
  CalendarDays,
  Award,
  Star,
  Zap,
  Target,
  Check,
  RefreshCw,
  AlertTriangle,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
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
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

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

// ─── Types (from API) ───

interface PendingCorrection {
  sessionId: string
  etudiantNom: string
  etudiantEmail: string
  epreuveTitre: string
  questionType: 'QRC' | 'TRS'
  questionPreview: string
  submittedAt: string
}

interface RecentEpreuve {
  id: string
  titre: string
  statut: string
  nbParticipants: number
  moyenne?: number
  date: string
}

interface PerformanceData {
  titre: string
  moyenne: number
  tauxReussite: number
}

interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

interface EpreuveAVenir {
  id: string
  titre: string
  date: string
  dateFin: string
  duree: number
  statut: string
  nbParticipants: number
}

interface BadgeData {
  id: string
  titre: string
  description: string
  unlocked: boolean
  dateObtention?: string
}

interface StatsData {
  nbDocuments: number
  nbQuestionsTotal: number
  nbEpreuves: number
  nbEpreuvesActives: number
  nbCorrectionsEnAttente: number
  pendingCorrections: PendingCorrection[]
  recentEpreuves: RecentEpreuve[]
  performanceParEpreuve: PerformanceData[]
  evolutionMoyennes: EvolutionMoyenne[]
  epreuvesAVenir: EpreuveAVenir[]
  badges: BadgeData[]
}

// --- Helper Functions ---

function getScoreColor(score: number, maxScore: number = 20): string {
  const halfMax = maxScore / 2
  if (score >= halfMax) return '#10b981'
  if (score >= halfMax * 0.8) return '#f59e0b'
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

const timeAgo = (dateStr: string) => {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: fr })
  } catch (e) {
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

// --- Skeleton for Loading State ---

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
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
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
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
        Une erreur est survenue lors du chargement de vos données. Veuillez réessayer.
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
  const [objective, setObjective] = useState('Corriger toutes les copies cette semaine')
  const [isEditing, setIsEditing] = useState(false)

  return (
    <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-200 dark:border-emerald-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
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
              className="flex-grow bg-transparent border-b border-emerald-500 focus:outline-none text-lg font-semibold"
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

// --- Badges Carousel ---
function BadgesCarousel({ userBadges }: { userBadges: BadgeData[] }) {
  const allBadges: { id: string; titre: string; description: string; icon: React.ReactNode }[] = [
    { id: 'first_epreuve', titre: 'Première Épreuve', description: 'Créer votre première épreuve.', icon: <Award /> },
    { id: 'master_corrector', titre: 'Maître Corrigeur', description: 'Corriger 10 copies ou plus.', icon: <Star /> },
    { id: 'ai_creator', titre: 'Créateur IA', description: 'Générer une épreuve avec l\'IA.', icon: <Zap /> },
    { id: 'excellence', titre: 'Excellence', description: 'Moyenne étudiante ≥ 14/20.', icon: <TrendingUp /> },
  ]

  const unlockedBadges = useMemo(() => allBadges.map(b => {
    const userBadge = userBadges.find(ub => ub.id === b.id)
    return { ...b, unlocked: userBadge?.unlocked ?? false, dateObtention: userBadge?.dateObtention }
  }), [userBadges])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-500" />
          Mes Succès
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-4 overflow-x-auto pb-4">
        {unlockedBadges.map(badge => (
          <motion.div
            key={badge.id}
            variants={itemVariants}
            className={`flex flex-col items-center justify-center text-center p-4 rounded-lg w-32 shrink-0 border-2 ${badge.unlocked ? 'border-amber-400 bg-amber-50 dark:bg-amber-950' : 'border-dashed bg-muted/50'}`}
          >
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${badge.unlocked ? 'bg-amber-100 dark:bg-amber-900' : 'bg-muted'}`}>
              {badge.unlocked
                ? <span className="text-amber-500">{badge.icon}</span>
                : <span className="text-muted-foreground">{badge.icon}</span>
              }
            </div>
            <p className={`mt-2 text-xs font-semibold ${badge.unlocked ? '' : 'text-muted-foreground'}`}>{badge.titre}</p>
            {badge.unlocked && badge.dateObtention && (
              <p className="text-[10px] text-muted-foreground">{formatDateFR(badge.dateObtention)}</p>
            )}
          </motion.div>
        ))}
      </CardContent>
    </Card>
  )
}

// --- Upcoming Exams Timeline ---
function EpreuvesTimeline({ epreuves }: { epreuves: EpreuveAVenir[] }) {
  const router = useRouter()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          Épreuves à venir
        </CardTitle>
        <CardDescription>Votre planning d&apos;examens</CardDescription>
      </CardHeader>
      <CardContent>
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune épreuve planifiée.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
            {epreuves.map((exam) => (
              <motion.div key={exam.id} variants={itemVariants} className="mb-8 last:mb-0">
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-emerald-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                  <CalendarDays className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="font-semibold">{exam.titre}</p>
                <p className="text-sm text-muted-foreground">Du {formatDateFR(exam.date)}</p>
                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Limite : {formatDateFR(exam.dateFin)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{exam.statut}</Badge>
                  <span className="text-xs text-muted-foreground">{exam.nbParticipants} participant{exam.nbParticipants !== 1 ? 's' : ''}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Recent Epreuves with Score Circles ---
function RecentEpreuves({ epreuves }: { epreuves: RecentEpreuve[] }) {
  const router = useRouter()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Épreuves Récentes</CardTitle>
      </CardHeader>
      <CardContent>
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucune épreuve pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {epreuves.map(epreuve => {
              const scoreColor = getScoreColor(epreuve.moyenne ?? 0)
              const avgDisplay = epreuve.moyenne ? epreuve.moyenne.toFixed(1) : '-'
              return (
                <div key={epreuve.id} className="flex items-center">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs"
                    style={{
                      backgroundColor: `${scoreColor}20`,
                      color: scoreColor,
                    }}
                  >
                    {avgDisplay}
                  </div>
                  <div className="ml-4 flex-grow">
                    <p className="font-semibold truncate">{epreuve.titre}</p>
                    <p className="text-sm text-muted-foreground">
                      {epreuve.nbParticipants} participant{epreuve.nbParticipants !== 1 ? 's' : ''} · {formatDateFR(epreuve.date)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{epreuve.statut}</Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Empty Dashboard ---
function EmptyDashboard({ name }: { name: string }) {
  const router = useRouter()

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
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <ClipboardPen className="h-10 w-10 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore créé d&apos;épreuves. Commencez par créer votre première évaluation.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => router.push('/epreuves')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Créer une épreuve
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ───
export function EnseignantDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Enseignant'
  const userId = user?.id

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchStats = async () => {
    if (!userId) return
    setLoading(true)
    setError(false)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`/api/stats/enseignant?userId=${userId}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error('Erreur API')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(true)
      if (data === null) {
        toast.error('Impossible de charger vos statistiques.', {
          action: { label: 'Réessayer', onClick: () => fetchStats() },
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [userId])

  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (error && !data) {
    return <DashboardError onRetry={fetchStats} />
  }

  if (!data) {
    return <EmptyDashboard name={name} />
  }

  const hasNoActivity = data.nbEpreuves === 0 && data.pendingCorrections.length === 0

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
          Bonjour, {name} ! Bienvenue sur votre espace.
        </motion.h1>
      </AnimatePresence>

      {/* Quick stats bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbDocuments}</p>
              <p className="text-xs text-muted-foreground">Document{data.nbDocuments !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <BookOpen className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbQuestionsTotal}</p>
              <p className="text-xs text-muted-foreground">Question{data.nbQuestionsTotal !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <CalendarDays className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbEpreuvesActives}</p>
              <p className="text-xs text-muted-foreground">Épreuve{data.nbEpreuvesActives !== 1 ? 's' : ''} active{data.nbEpreuvesActives !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/40">
              <ClipboardPen className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.nbCorrectionsEnAttente}</p>
              <p className="text-xs text-muted-foreground">Correction{data.nbCorrectionsEnAttente !== 1 ? 's' : ''} en attente</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Pending corrections alert */}
      {data.nbCorrectionsEnAttente > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                  <MessageSquareWarning className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {data.nbCorrectionsEnAttente} correction{data.nbCorrectionsEnAttente !== 1 ? 's' : ''} en attente
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Des étudiants ont soumis des réponses à évaluer
                  </p>
                </div>
              </div>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => window.location.href = '/correction'}
              >
                <ClipboardPen className="mr-2 h-4 w-4" /> Corriger
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
            <BadgesCarousel userBadges={data.badges || []} />
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    Évolution des moyennes
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {data.evolutionMoyennes.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.evolutionMoyennes.map(e => ({ ...e, mois: formatMonth(e.mois) }))}>
                        <defs>
                          <linearGradient id="enseignantScoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="moyenne" stroke="#10b981" strokeWidth={2.5} fill="url(#enseignantScoreGradient)" />
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
                    <BarChart3 className="h-5 w-5 text-teal-600" />
                    Performance par épreuve
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {data.performanceParEpreuve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.performanceParEpreuve}>
                        <XAxis dataKey="titre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="moyenne" radius={[6, 6, 0, 0]}>
                          {data.performanceParEpreuve.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getScoreColor(entry.moyenne)} />
                          ))}
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

          {/* Activity Feed */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5" />
                  Flux d&apos;Activité
                </CardTitle>
                <CardDescription>Les dernières soumissions de vos étudiants.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[300px] overflow-y-auto">
                {data.pendingCorrections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <CheckCircle className="h-10 w-10 text-emerald-500 mb-2" />
                    <p className="font-semibold">Boîte de réception vide</p>
                    <p className="text-sm text-muted-foreground">Aucune nouvelle soumission à corriger.</p>
                  </div>
                ) : (
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
                    {data.pendingCorrections.map((item, index) => (
                      <motion.div key={item.sessionId + index} variants={itemVariants} className="mb-6 last:mb-0">
                        <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-amber-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                          <MessageSquareWarning className="h-3 w-3 text-amber-500" />
                        </div>
                        <p className="text-sm">
                          Correction pour <span className="font-medium">{item.etudiantNom}</span> sur{' '}
                          <span className="font-medium">{item.epreuveTitre}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <time dateTime={item.submittedAt}>{timeAgo(item.submittedAt)}</time>
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <motion.div variants={itemVariants}>
            <EpreuvesTimeline epreuves={data.epreuvesAVenir} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <RecentEpreuves epreuves={data.recentEpreuves} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
