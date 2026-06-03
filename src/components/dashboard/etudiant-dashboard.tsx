'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Trophy,
  Clock,
  Play,
  Eye,
  Timer,
  BookOpen,
  TrendingUp,
  BarChart3,
  Star,
  Plus,
  Check,
  Award,
  Zap,
  Target,
} from 'lucide-react'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { useNavigationStore } from '@/stores/navigation-store'
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
import { toast } from 'sonner'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
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
      type: 'spring',
      stiffness: 100,
    },
  },
}

// --- Types (from previous version) ---
interface EpreuveAVenir {
  id: string
  titre: string
  date: string
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
  statut: 'SOUMISE' | 'CORRIGEE'
  resultat: { scoreFinal: number } | null
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

// --- New Types for Gamification ---
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
  // New data for gamification
  badges: Omit<BadgeDeReussite, 'icon'>[];
}


// --- Helper Functions (from previous version) ---
function getScoreColor(score: number): string {
  if (score >= 10) return '#10b981'
  if (score >= 8) return '#f59e0b'
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
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}

// --- New Modern Components ---

// 1. Objective Card
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

// 2. Timeline for Upcoming Exams
function EpreuvesTimeline({ epreuves }: { epreuves: EpreuveAVenir[] }) {
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
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
            {epreuves.map((exam, index) => (
              <motion.div key={exam.id} variants={itemVariants} className="mb-8">
                <div className="absolute left-0 top-1 h-6 w-6 bg-background rounded-full border-2 border-emerald-500 flex items-center justify-center -translate-x-1/2 ml-0.5">
                   <CalendarDays className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="font-semibold">{exam.titre}</p>
                <p className="text-sm text-muted-foreground">{formatDateFR(exam.date)}</p>
                <Button size="sm" className="mt-2" onClick={() => setCurrentPage('passation', { epreuveId: exam.id })}>
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

// 3. Badges Carousel
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

// ─── Main Component ───
export function EtudiantDashboard() {
  const user = useAuthStore((s) => s.user)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const name = user?.name ?? 'Étudiant'

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function fetchStats() {
      setLoading(true)
      try {
        const res = await fetch(`/api/stats/etudiant?userId=${user.id}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Erreur API')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) toast.error('Impossible de charger vos statistiques.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading || !data) {
    return <DashboardSkeleton />
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
                        {/* You can reuse the charts from the previous version here */}
                        <Card>
                            <CardHeader>
                               <CardTitle className="flex items-center gap-2">
                                   <TrendingUp className="h-5 w-5 text-emerald-600" />
                                   Évolution des scores
                               </CardTitle>
                            </CardHeader>
                            <CardContent className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.evolutionScores}>
                                        {/* Chart content from previous version */}
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
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                         <Card>
                            <CardHeader>
                               <CardTitle className="flex items-center gap-2">
                                   <BarChart3 className="h-5 w-5 text-teal-600" />
                                   Performance
                               </CardTitle>
                            </CardHeader>
                            <CardContent className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.performanceParType}>
                                         {/* Chart content from previous version */}
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
                                {data.resultatsRecents.map(result => (
                                    <div key={result.id} className="flex items-center">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold" style={{backgroundColor: `${getScoreColor(result.resultat?.scoreFinal ?? 0)}20`, color: getScoreColor(result.resultat?.scoreFinal ?? 0)}}>
                                            {result.resultat?.scoreFinal ?? '-'}
                                        </div>
                                        <div className="ml-4 flex-grow">
                                            <p className="font-semibold truncate">{result.titre}</p>
                                            <p className="text-sm text-muted-foreground">{formatDateFR(result.date)}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => setCurrentPage('mes-resultats')}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
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
