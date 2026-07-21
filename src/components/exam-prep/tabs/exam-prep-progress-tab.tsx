'use client'

/**
 * Onglet Progression — tableau de bord spécifique au document.
 *
 * EXAM-PREP-REFACTOR-1 :
 *  - Alignement strict backend (ExamPrepDashboard) :
 *    GET /api/exam-prep/dashboard?documentId=X →
 *    {
 *      scoreMoyen: float,            // 0..1
 *      totalAttempts: int,
 *      tauxReussite: float,          // 0..100 (%)
 *      tempsRevision: int,           // secondes (somme des dureeSec)
 *      sessionsAVenir: int,          // COUNT (pas un array)
 *      itemsSrs: { total, dusAujourdhui, masterises, avgMastery },
 *      lacunesParChapitre: [{ chapterId, titre, avgScore, attempts }]
 *    }
 *  - DS "Savane EdTech" : StatCard (KPIs avec scoreOn20 coloring), ProgressRing
 *    pour la maîtrise moyenne, PulseSkeleton pendant le chargement, cards cohérentes.
 *  - `ordre` et `lacune` sont calculés côté client (backend ne les fournit pas).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  TrendingUp, Target, Clock, Award, AlertTriangle, CheckCircle2,
  Zap, Calendar, AlertCircle, RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard, ProgressRing, PulseSkeleton } from '@/components/ds'
import { Button } from '@/components/ui/button'

interface Chapter { id: string; titre: string; ordre: number; sujets: string[] }

interface DashboardSrsStats {
  total: number
  dusAujourdhui: number
  masterises: number
  avgMastery: number
}

interface ChapterLacune {
  chapterId: string
  titre: string
  avgScore: number   // 0..1
  attempts: number
}

interface Dashboard {
  scoreMoyen: number        // 0..1
  totalAttempts: number
  tauxReussite: number      // 0..100
  tempsRevision: number     // secondes
  sessionsAVenir: number    // count
  itemsSrs: DashboardSrsStats
  lacunesParChapitre: ChapterLacune[]
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

function formatTempsRevision(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`
}

export function ExamPrepProgressTab({ documentId, chapters }: Props) {
  const queryClient = useQueryClient()

  const dashboardQuery = useQuery<Dashboard>({
    queryKey: ['exam-prep-dashboard', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/dashboard?documentId=${documentId}`)
      if (!res.ok) throw new Error('Échec du chargement du dashboard')
      const data = await res.json()
      return data as Dashboard
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const data = dashboardQuery.data
  const loading = dashboardQuery.isLoading
  const error = dashboardQuery.error

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={TrendingUp}
          title="Progression"
          desc="Tableau de bord de votre apprentissage sur ce document."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
        <PulseSkeleton variant="card" className="h-64" />
      </div>
    )
  }

  // ─── Error ───
  if (error || !data) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={TrendingUp}
          title="Progression"
          desc="Tableau de bord de votre apprentissage sur ce document."
        />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="mt-3 text-sm font-medium">Données de progression indisponibles</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['exam-prep-dashboard', documentId] })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasAttempts = data.totalAttempts > 0
  const scoreOn20 = hasAttempts ? data.scoreMoyen * 20 : 0
  // Enrichir les lacunes avec `ordre` (depuis chapters) et `lacune` (avgScore < 0.5)
  const lacunesEnriched = data.lacunesParChapitre.map((lac) => {
    const chapter = chapters.find((c) => c.id === lac.chapterId)
    return {
      ...lac,
      ordre: chapter?.ordre ?? 0,
      lacune: lac.avgScore < 0.5,
    }
  }).sort((a, b) => a.ordre - b.ordre)

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={TrendingUp}
        title="Progression"
        desc="Tableau de bord de votre apprentissage sur ce document."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Score moyen"
          value={hasAttempts ? `${scoreOn20.toFixed(1)}` : '—'}
          suffix={hasAttempts ? '/20' : undefined}
          icon={Target}
          accent="success"
          scoreOn20={hasAttempts ? scoreOn20 : undefined}
          index={0}
        />
        <StatCard
          label="Taux réussite"
          value={hasAttempts ? `${Math.round(data.tauxReussite)}%` : '—'}
          icon={Award}
          accent="primary"
          index={1}
        />
        <StatCard
          label="Questions répondues"
          value={data.totalAttempts}
          icon={TrendingUp}
          accent="info"
          index={2}
        />
        <StatCard
          label="Temps révision"
          value={formatTempsRevision(data.tempsRevision)}
          icon={Clock}
          accent="warning"
          index={3}
        />
      </div>

      {/* Lacunes par chapitre */}
      <Card className="ds-kente-top">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="font-display text-base font-semibold">Lacunes détectées par chapitre</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Chapitres avec score moyen &lt; 50% — à réviser en priorité
          </p>
          {lacunesEnriched.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 text-success-text mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">
                Aucune tentative enregistrée. Faites votre première session d&apos;entraînement
                pour détecter vos lacunes.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lacunesEnriched.map((lac, i) => (
                <motion.div
                  key={lac.chapterId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                    lac.lacune ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success-text'
                  }`}>
                    {lac.ordre + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lac.titre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${lac.lacune ? 'bg-destructive' : 'bg-success'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(lac.avgScore * 100)}%` }}
                          transition={{ duration: 0.6, delay: i * 0.03 + 0.1 }}
                        />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
                        {Math.round(lac.avgScore * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {lac.lacune && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                        Lacune
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">{lac.attempts} tentative(s)</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SRS + Sessions à venir */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* SRS */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" />
              <h3 className="font-display text-base font-semibold">Spaced repetition</h3>
            </div>
            {data.itemsSrs.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun item en suivi SRS. Créez des flashcards ou répondez à des
                questions d&apos;entraînement pour alimenter le SRS.
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <ProgressRing
                  value={data.itemsSrs.avgMastery * 100}
                  size={72}
                  strokeWidth={6}
                  accent="primary"
                  sublabel="Maîtrise"
                />
                <div className="flex-1 space-y-2">
                  <Row label="Items suivis" value={data.itemsSrs.total} />
                  <Row label="À réviser aujourd&apos;hui" value={data.itemsSrs.dusAujourdhui} highlight={data.itemsSrs.dusAujourdhui > 0} />
                  <Row label="Maîtrisés" value={data.itemsSrs.masterises} icon={CheckCircle2} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sessions à venir */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary-text" />
              <h3 className="font-display text-base font-semibold">Sessions à venir</h3>
            </div>
            {data.sessionsAVenir === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune session planifiée. Allez dans l&apos;onglet
                <span className="font-medium text-primary-text mx-1">Planification</span>
                pour en créer une.
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <ProgressRing
                  value={Math.min(100, data.sessionsAVenir * 20)}
                  size={72}
                  strokeWidth={6}
                  accent="info"
                  label={`${data.sessionsAVenir}`}
                  showPercent={false}
                  sublabel="Session(s)"
                />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    Vous avez <span className="font-semibold text-foreground">{data.sessionsAVenir}</span> session(s)
                    de révision planifiée(s) pour ce document.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Consultez l&apos;onglet Planification pour les détails.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Ligne clé/valeur réutilisable ───

function Row({
  label, value, icon: Icon, highlight,
}: {
  label: string
  value: string | number
  icon?: typeof CheckCircle2
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-success-text" />}
        {label}
      </span>
      <span className={`font-mono font-semibold tabular-nums ${highlight ? 'text-warning' : ''}`}>{value}</span>
    </div>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof TrendingUp
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary-text" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  )
}
