'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  GraduationCap,
  Trophy,
  Clock,
  Play,
  Eye,
  Award,
  Star,
  Check,
  Zap,
  Target,
  RefreshCw,
  AlertTriangle,
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

// --- Animation Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
    },
  },
}

// --- Types ---
interface EpreuveAVenir {
  id: string
  titre: string
  date: string
  dateFin: string
  duree: number
  enseignant: string
  nbQuestions: number
  totalPoints: number
}

interface ResultatRecent {
  id: string
  epreuveId: string
  titre: string
  enseignant: string
  date: string
  score: number
  statut: 'SOUMISE' | 'CORRIGEE' | 'RETOURNEE'
  resultat: { scoreFinal: number; totalPossible: number } | null
}

interface EvolutionScore {
  titre: string
  score: number
  date: string
}

interface PerformanceType {
  type: 'QCU' | 'QCM' | 'QRC' | 'TRS'
  moyenne: number
  nbReponses: number
}

interface SessionEnCours {
  id: string
  epreuveId: string
  epreuveTitre: string
  dateDebut: string
}

interface BadgeDeReussite {
  id: string;
  titre: string;
  description: string;
  icon: React.ReactNode;
  unlocked: boolean;
  dateObtention?: string;
}

interface StatsData {
  nbEpreuvesAVenir: number
  nbEpreuvesTerminees: number
  moyenne: number
  meilleureNote: number
  epreuvesAVenir: EpreuveAVenir[]
  resultatsRecents: ResultatRecent[]
  evolutionScores: EvolutionScore[]
  performanceParType: PerformanceType[]
  sessionEnCours: SessionEnCours | null
  badges: Omit<BadgeDeReussite, 'icon'>[];
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

// --- Skeleton for Loading State ---
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
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

// --- Error State Component ---
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
  const [objective, setObjective] = useState('Obtenir 15/20 au prochain partiel');
  const [isEditing, setIsEditing] = useState(false);

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
              className="flex-grow bg-transparent border-b border-emerald-500 focus:outline-none"
            />
            <Button size="sm" onClick={() => setIsEditing(false)}><Check className="h-4 w-4"/></Button>
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

// --- Timeline for Upcoming Exams ---
function EpreuvesTimeline({ epreuves }: { epreuves: EpreuveAVenir[] }) {
  const router = useRouter()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          Épreuves à venir
        </CardTitle>
        <CardDescription>Votre planning d'examens</CardDescription>
      </CardHeader>
      <CardContent>
        {epreuves.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune épreuve planifiée.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-0 top-0 h-full w-0.5 bg-border -translate-x-1/2 ml-3"></div>
            {epreuves.map((exam) => (
              <motion.div key={exam.id} variants={itemVariants} className="mb-8">
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-emerald-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                   <CalendarDays className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="font-semibold">{exam.titre}</p>
                <p className="text-sm text-muted-foreground">Du {formatDateFR(exam.date)}</p>
                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Limite : {formatDateFR(exam.dateFin)}
                </p>
                <Button size="sm" className="mt-2" onClick={() => router.push(`/passation?epreuveId=${exam.id}`)}>
                  <Play className="mr-2 h-4 w-4" /> Commencer
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Badges Carousel ---
function BadgesCarousel({ userBadges }: { userBadges: Omit<BadgeDeReussite, 'icon'>[] }) {
    const allBadges: Omit<BadgeDeReussite, 'unlocked'>[] = [
        { id: 'first_test', titre: 'Le Baptême du Feu', description: 'Terminer votre première épreuve.', icon: <Award /> },
        { id: 'good_score', titre: 'Bien Joué !', description: 'Obtenir une note supérieure à 12/20.', icon: <Star /> },
        { id: 'high_score', titre: 'Major de Promo', description: 'Obtenir une note supérieure à 18/20.', icon: <Trophy /> },
        { id: 'fast_answer', titre: 'Éclair de Génie', description: 'Terminer une épreuve très rapidement.', icon: <Zap /> },
    ];

    const unlockedBadges = useMemo(() => allBadges.map(b => {
        const userBadge = userBadges.find(ub => ub.id === b.id);
        return { ...b, unlocked: !!userBadge, dateObtention: userBadge?.dateObtention };
    }), [userBadges]);

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
            {badge.unlocked && <p className="text-[10px] text-muted-foreground">{formatDateFR(badge.dateObtention!)}</p>}
          </motion.div>
        ))}
      </CardContent>
    </Card>
  )
}

// --- Empty Dashboard (no data yet) ---
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
            <GraduationCap className="h-10 w-10 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Bienvenue sur SECT !</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Vous n&apos;avez pas encore d&apos;épreuves ou de résultats. Consultez vos épreuves pour commencer.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => router.push('/mes-epreuves')}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Voir mes épreuves
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ───
export function EtudiantDashboard() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Étudiant'

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchStats = async () => {
    if (!user?.id) return
    setLoading(true)
    setError(false)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const res = await fetch(`/api/stats/etudiant?userId=${user.id}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error('Erreur API')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(true)
      // Only show toast on first load, not on retry
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
  }, [user?.id])

  // Loading state
  if (loading && !data) {
    return <DashboardSkeleton />
  }

  // Error state with no cached data
  if (error && !data) {
    return <DashboardError onRetry={fetchStats} />
  }

  // No data at all
  if (!data) {
    return <EmptyDashboard name={name} />
  }

  // Check if student has no activity at all
  const hasNoActivity = data.nbEpreuvesTerminees === 0 && data.epreuvesAVenir.length === 0 && data.resultatsRecents.length === 0

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
                <CalendarDays className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.nbEpreuvesAVenir}</p>
                <p className="text-xs text-muted-foreground">Épreuve{data.nbEpreuvesAVenir !== 1 ? 's' : ''} à venir</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                <Trophy className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.moyenne.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Moyenne</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.meilleureNote.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Meilleure note</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                <Award className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.badges.length}</p>
                <p className="text-xs text-muted-foreground">Badge{data.badges.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* In-progress session alert */}
        {data.sessionEnCours && (
          <motion.div variants={itemVariants}>
            <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">Épreuve en cours</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400">{data.sessionEnCours.epreuveTitre}</p>
                  </div>
                </div>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => router.push(`/passation?epreuveId=${data.sessionEnCours!.epreuveId}`)}
                >
                  <Play className="mr-2 h-4 w-4" /> Reprendre
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

                 {/* Results & Evolution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div variants={itemVariants}>
                        <Card>
                            <CardHeader>
                               <CardTitle className="flex items-center gap-2">
                                   Évolution des scores
                               </CardTitle>
                            </CardHeader>
                            <CardContent className="h-72">
                              {data.evolutionScores.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.evolutionScores}>
                                        <defs>
                                          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                                          </linearGradient>
                                        </defs>
                                        <XAxis dataKey="titre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2.5} fill="url(#scoreGradient)" />
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
                                   Performance par type
                               </CardTitle>
                            </CardHeader>
                            <CardContent className="h-72">
                              {data.performanceParType.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.performanceParType}>
                                         <XAxis dataKey="type" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                                         <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                         <Tooltip />
                                         <Bar dataKey="moyenne" radius={[6, 6, 0, 0]}>
                                              {data.performanceParType.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={getScoreColor(entry.moyenne * 2)} />
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
            </div>

            {/* Sidebar (1/3) */}
            <div className="lg:col-span-1 space-y-6">
                <motion.div variants={itemVariants}>
                    <EpreuvesTimeline epreuves={data.epreuvesAVenir} />
                </motion.div>
                <motion.div variants={itemVariants}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Résultats Récents</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {data.resultatsRecents.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Aucun résultat pour le moment.</p>
                            ) : (
                                <div className="space-y-4">
                                {data.resultatsRecents.map(result => {
                                    const scoreFinal = result.resultat?.scoreFinal ?? result.score ?? 0
                                    const totalPossible = result.resultat?.totalPossible ?? 20
                                    const scorePercent = totalPossible > 0 ? Math.round((scoreFinal / totalPossible) * 100) : 0
                                    return (
                                    <div key={result.id} className="flex items-center">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs" style={{backgroundColor: `${getScoreColor(scoreFinal, totalPossible)}20`, color: getScoreColor(scoreFinal, totalPossible)}}>
                                            {scorePercent}%
                                        </div>
                                        <div className="ml-4 flex-grow">
                                            <p className="font-semibold truncate">{result.titre}</p>
                                            <p className="text-sm text-muted-foreground">{formatDateFR(result.date)}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => router.push('/mes-resultats')}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )})}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    </motion.div>
  )
}
