'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Sparkles,
  ClipboardPen,
  Clock,
  Users,
  Plus,
  BarChart3,
  TrendingUp,
  Inbox,
  CheckCircle,
  ChevronRight,
  MessageSquareWarning
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
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
  submittedAt: string; 
}

interface RecentEpreuve {
  id: string
  titre: string
  statut: string
  nbParticipants: number
  moyenne?: number;
  date: string;
}

interface PerformanceData {
    titre: string;
    moyenne: number;
    tauxReussite: number;
}

interface StatsData {
  nbDocuments: number
  nbQuestionsTotal: number
  nbEpreuves: number
  nbCorrectionsEnAttente: number
  pendingCorrections: PendingCorrection[]
  recentEpreuves: RecentEpreuve[]
  performanceParEpreuve: PerformanceData[];
}

// --- Date & Formatting Helpers ---

const timeAgo = (dateStr: string) => {
    try {
        return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: fr });
    } catch (e) {
        return dateStr;
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-1 space-y-6">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-56 w-full" />
            </div>
            {/* Right Column */}
            <div className="lg:col-span-1 space-y-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    </div>
  )
}


// --- NEW & MODERNIZED COMPONENTS ---

// 1. Quick Actions Card
function QuickActions() {
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const actions = [
    { title: 'Nouvelle Épreuve', icon: ClipboardPen, color: 'text-emerald-600', page: 'epreuves' },
    { title: 'Générer par IA', icon: Sparkles, color: 'text-teal-500', page: 'questions-ia' },
    { title: 'Mes Documents', icon: FileText, color: 'text-sky-500', page: 'documents' },
  ];

  return (
    <Card className="bg-gradient-to-b from-background to-muted/20">
      <CardHeader>
        <CardTitle>Accès Rapide</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {actions.map(action => (
            <Button key={action.page} variant="ghost" className="justify-start h-12" onClick={() => setCurrentPage(action.page as any)}>
                <action.icon className={`h-5 w-5 mr-3 ${action.color}`} />
                <span className="font-semibold">{action.title}</span>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
            </Button>
        ))}
      </CardContent>
    </Card>
  )
}

// 2. Activity Feed
function ActivityFeed({ corrections }: { corrections: PendingCorrection[] }) {
    const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)

    if (corrections.length === 0) {
        return (
            <Card className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/20 border-dashed">
                <CheckCircle className="h-12 w-12 text-emerald-500 mb-3" />
                <h3 className="font-semibold">Boîte de réception vide</h3>
                <p className="text-sm text-muted-foreground">Aucune nouvelle soumission à corriger.</p>
            </Card>
        )
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Inbox className="h-5 w-5" />
                    Flux d'Activité
                </CardTitle>
                <CardDescription>Les dernières soumissions de vos étudiants.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto">
                 <div className="flow-root">
                    <ul className="-mb-8">
                        {corrections.map((item, index) => (
                            <li key={item.sessionId + index}>
                                <div className="relative pb-8">
                                    {index !== corrections.length - 1 ? (
                                        <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border" aria-hidden="true"></span>
                                    ) : null}
                                    <div className="relative flex space-x-3">
                                        <div>
                                            <span className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center ring-8 ring-background">
                                                <MessageSquareWarning className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                            <div>
                                                <p className="text-sm text-muted-foreground">
                                                    Correction pour <span className="font-medium text-foreground">{item.etudiantNom}</span> sur l'épreuve <span className="font-medium text-foreground">{item.epreuveTitre}</span>
                                                </p>
                                            </div>
                                            <div className="text-right text-xs whitespace-nowrap text-muted-foreground">
                                                <time dateTime={item.submittedAt}>{timeAgo(item.submittedAt)}</time>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
                <Button className="w-full mt-4" onClick={() => setCurrentPage('correction')}><ClipboardPen className="mr-2 h-4 w-4"/> Voir toutes les corrections</Button>
            </CardContent>
        </Card>
    )
}

// 3. Performance Overview Chart
function PerformanceChart({ data }: { data: PerformanceData[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Performance des Épreuves</CardTitle>
                <CardDescription>Moyenne et taux de réussite des dernières épreuves.</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="titre" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis yAxisId="left" orientation="left" stroke="#10b981" tick={{ fontSize: 10 }} domain={[0, 20]} />
                        <YAxis yAxisId="right" orientation="right" stroke="#14b8a6" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                        <Tooltip />
                        <Bar yAxisId="left" dataKey="moyenne" name="Moyenne" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                        <Bar yAxisId="right" dataKey="tauxReussite" name="Réussite" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}


// ─── Main Component ───
export function EnseignantDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Enseignant'
  const userId = user?.id

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/stats/enseignant?userId=${userId}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Erreur API')
        const json = await res.json()
        setData(json)
      } catch (err) { toast.error('Impossible de charger le tableau de bord.') }
      finally { setLoading(false) }
    }
    fetchData()
  }, [userId])

  if (loading || !data) {
    return <DashboardSkeleton />
  }

  return (
    <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
    >
        <motion.div variants={itemVariants} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 mb-6">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                Centre de Commandement
            </h1>
            <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
                Enseignant
            </Badge>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* --- Left Column (1/4) --- */}
            <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
                <QuickActions />
                <Card>
                    <CardHeader>
                        <CardTitle>Statistiques Clés</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Documents</span><span className="font-bold text-2xl">{data.nbDocuments}</span></div>
                        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Questions</span><span className="font-bold text-2xl">{data.nbQuestionsTotal}</span></div>
                        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Épreuves</span><span className="font-bold text-2xl">{data.nbEpreuves}</span></div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* --- Main Column (2/4) --- */}
            <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
                <ActivityFeed corrections={data.pendingCorrections} />
                <PerformanceChart data={data.performanceParEpreuve} />
            </motion.div>

            {/* --- Right Column (1/4) --- */}
            <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                            <Clock className="h-5 w-5" />
                            Corrections en attente
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="font-bold text-5xl text-amber-600 dark:text-amber-400">{data.nbCorrectionsEnAttente}</p>
                        <p className="text-sm text-amber-800 dark:text-amber-200">réponses à évaluer</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Épreuves Récentes</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {data.recentEpreuves.slice(0, 5).map(epreuve => (
                            <div key={epreuve.id} className="flex items-center justify-between">
                                <div className="min-w-0">
                                    <p className="font-semibold truncate">{epreuve.titre}</p>
                                    <p className="text-xs text-muted-foreground">{epreuve.nbParticipants} participants · Moy: {epreuve.moyenne ? epreuve.moyenne.toFixed(1) : '-'}/20</p>
                                </div>
                                <Badge variant="outline">{epreuve.statut}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    </motion.div>
  )
}
