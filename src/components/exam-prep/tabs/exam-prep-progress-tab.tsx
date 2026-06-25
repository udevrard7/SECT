'use client'

/**
 * Onglet Progression — tableau de bord spécifique au document.
 *
 * GET /api/exam-prep/dashboard?documentId
 * Affiche : score moyen, taux réussite, temps révision, lacunes par
 * chapitre, sessions à venir, items SRS, évolution mensuelle.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Target, Clock, Award, AlertTriangle, CheckCircle2,
  Zap, Calendar, Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'

interface Chapter { id: string; titre: string; ordre: number; sujets: string[] }

interface Dashboard {
  scoreMoyen: number
  totalAttempts: number
  tauxReussite: number
  tempsRevisionSec: number
  lacunesParChapitre: Array<{
    chapterId: string
    titre: string
    ordre: number
    avgScore: number
    attempts: number
    lacune: boolean
  }>
  sessionsAVenir: Array<{
    id: string
    titre: string | null
    dateDebut: string
    dureeMin: number
  }>
  itemsSrs: { total: number; dusAujourdHui: number; masterises: number; avgMastery: number }
  evolution: Array<{ mois: string; moyenne: number; count: number }>
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

export function ExamPrepProgressTab({ documentId }: Props) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/dashboard?documentId=${documentId}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <PulseSkeleton key={i} variant="card" className="h-24" />)}
        </div>
        <PulseSkeleton variant="card" className="h-64" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Données de progression indisponibles</p>
        </CardContent>
      </Card>
    )
  }

  const tempsMin = Math.round((data.tempsRevisionSec ?? 0) / 60)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Score moyen', value: data.totalAttempts > 0 ? `${Math.round(data.scoreMoyen * 100)}%` : '—',
            icon: Target, accent: 'success' as const, border: 'border-l-success',
          },
          {
            label: 'Taux réussite', value: data.totalAttempts > 0 ? `${data.tauxReussite}%` : '—',
            icon: Award, accent: 'primary' as const, border: 'border-l-primary',
          },
          {
            label: 'Tentatives', value: String(data.totalAttempts),
            icon: TrendingUp, accent: 'info' as const, border: 'border-l-info',
          },
          {
            label: 'Temps révision', value: tempsMin > 0 ? `${tempsMin}min` : '—',
            icon: Clock, accent: 'warning' as const, border: 'border-l-warning',
          },
        ].map((kpi, i) => {
          const KIcon = kpi.icon
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={`border-l-4 ${kpi.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-${kpi.accent}/10`}>
                      <KIcon className={`h-4 w-4 text-${kpi.accent === 'success' ? 'success-text' : kpi.accent}`} />
                    </div>
                    <div>
                      <p className="font-mono text-xl font-bold tabular-nums leading-none">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Lacunes par chapitre */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Lacunes détectées par chapitre
          </CardTitle>
          <CardDescription>Chapitres avec score moyen &lt; 50% — à réviser en priorité</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.lacunesParChapitre.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucune tentative enregistrée. Faites votre première session d'entraînement pour détecter vos lacunes.
            </p>
          ) : (
            data.lacunesParChapitre.map((lac, i) => (
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
                      <div
                        className={`h-full rounded-full ${lac.lacune ? 'bg-destructive' : 'bg-success'}`}
                        style={{ width: `${Math.round(lac.avgScore * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{Math.round(lac.avgScore * 100)}%</span>
                  </div>
                </div>
                {lac.lacune && (
                  <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30 shrink-0">
                    Lacune
                  </Badge>
                )}
              </motion.div>
            ))
          )}
        </CardContent>
      </Card>

      {/* SRS + Sessions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* SRS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Zap className="h-4 w-4 text-warning" />
              Spaced repetition
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.itemsSrs.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun item en suivi SRS.</p>
            ) : (
              <>
                <Row label="Items suivis" value={data.itemsSrs.total} />
                <Row label="À réviser aujourd'hui" value={data.itemsSrs.dusAujourdHui} highlight={data.itemsSrs.dusAujourdHui > 0} />
                <Row label="Masterisés" value={data.itemsSrs.masterises} icon={CheckCircle2} />
                <Row label="Maîtrise moyenne" value={`${Math.round(data.itemsSrs.avgMastery * 100)}%`} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Sessions à venir */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Calendar className="h-4 w-4 text-primary-text" />
              Sessions à venir
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sessionsAVenir.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune session planifiée.</p>
            ) : (
              data.sessionsAVenir.map((s) => {
                const date = new Date(s.dateDebut)
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                      <span className="font-mono text-xs font-bold text-primary-text leading-none">{date.getDate()}</span>
                      <span className="text-[8px] text-muted-foreground uppercase">{date.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.titre || 'Session'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {s.dureeMin}min
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Évolution */}
      {data.evolution.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <TrendingUp className="h-4 w-4 text-success-text" />
              Évolution mensuelle
            </CardTitle>
            <CardDescription>Score moyen de vos tentatives sur 6 mois</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {data.evolution.map((e) => (
                <div key={e.mois} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/60 to-primary transition-all"
                      style={{ height: `${Math.max(4, Math.round(e.moyenne * 100))}%` }}
                      title={`${e.mois} : ${Math.round(e.moyenne * 100)}% (${e.count} tentatives)`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{e.mois.slice(5)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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

// petite icône locale pour éviter un import manquant
function AlertCircle(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
