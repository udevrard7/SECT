'use client'

/**
 * Onglet Planning — sessions de révision + spaced repetition.
 *
 * Deux zones :
 *  1. Items à réviser aujourd'hui (SRS dus) — GET /api/exam-prep/review
 *     Bouton « Marquer comme révisé » → POST /api/exam-prep/review
 *  2. Sessions planifiées — GET /api/exam-prep/planning
 *     Formulaire de création → POST /api/exam-prep/planning
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Clock, Calendar, Plus, CheckCircle2, Loader2, Zap, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

interface Chapter { id: string; titre: string; ordre: number; sujets: string[] }

interface DueItem {
  id: string
  chapterId: string
  chapterTitle: string
  chapterOrder: number
  documentId: string | null
  documentName: string
  masteryLevel: number
  interval: number
  nextReviewAt: string
}

interface SrsStats {
  totalItems: number
  masteredItems: number
  dueCount: number
  avgMastery: number
}

interface Session {
  id: string
  titre: string | null
  dateDebut: string
  dureeMin: number
  statut: string
  chapterIds: string[]
  document: { id: string; nomFichier: string } | null
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

export function ExamPrepPlanningTab({ documentId, chapters }: Props) {
  const [dueItems, setDueItems] = useState<DueItem[]>([])
  const [srsStats, setSrsStats] = useState<SrsStats | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('14:00')
  const [formDuration, setFormDuration] = useState(30)
  const [formTitle, setFormTitle] = useState('')
  const [formChapterIds, setFormChapterIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reviewRes, planRes] = await Promise.all([
        fetch(`/api/exam-prep/review?documentId=${documentId}`),
        fetch(`/api/exam-prep/planning?documentId=${documentId}`),
      ])
      if (reviewRes.ok) {
        const data = await reviewRes.json()
        setDueItems(data.due ?? [])
        setSrsStats(data.stats ?? null)
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setSessions(data.sessions ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { load() }, [load])

  const handleMarkReviewed = async (item: DueItem) => {
    setMarking(item.id)
    try {
      const res = await fetch('/api/exam-prep/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: item.chapterId, quality: 4 }),
      })
      if (!res.ok) throw new Error()
      toast.success('Chapitre révisé', {
        description: 'Prochaine révision planifiée par spaced repetition.',
      })
      load()
    } catch {
      toast.error('Échec de la mise à jour')
    } finally {
      setMarking(null)
    }
  }

  const handleCreate = async () => {
    if (!formDate) {
      toast.error('Sélectionnez une date')
      return
    }
    setCreating(true)
    try {
      const dateDebut = new Date(`${formDate}T${formTime}:00`)
      const res = await fetch('/api/exam-prep/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          chapterIds: formChapterIds,
          titre: formTitle || undefined,
          dateDebut: dateDebut.toISOString(),
          dureeMin: formDuration,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Session planifiée')
      setShowForm(false)
      setFormDate('')
      setFormTitle('')
      setFormChapterIds([])
      load()
    } catch {
      toast.error('Échec de la création')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PulseSkeleton className="h-32 w-full" variant="card" />
        <PulseSkeleton className="h-48 w-full" variant="card" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Stats SRS */}
      {srsStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'À réviser', value: srsStats.dueCount, icon: Zap, color: 'text-warning' },
            { label: 'Maîtrisés', value: srsStats.masteredItems, icon: CheckCircle2, color: 'text-success-text' },
            { label: 'Total', value: srsStats.totalItems, icon: TrendingUp, color: 'text-info' },
            { label: 'Maîtrise moy.', value: `${Math.round(srsStats.avgMastery * 100)}%`, icon: TrendingUp, color: 'text-primary-text' },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-l-4 border-l-primary/60">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2.5">
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                    <div>
                      <p className="font-mono text-lg font-bold tabular-nums leading-none">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Items dus */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Zap className="h-4 w-4 text-warning" />
            À réviser aujourd'hui
          </CardTitle>
          <CardDescription>Chapitres dus selon le spaced repetition (SM-2)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {dueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              🎉 Aucune révision due aujourd'hui. Vous êtes à jour !
            </p>
          ) : (
            dueItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <span className="font-mono text-xs font-bold text-warning">{item.chapterOrder + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.chapterTitle}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {Math.round(item.masteryLevel * 100)}% maîtrise
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">intervalle {item.interval}j</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleMarkReviewed(item)}
                  disabled={marking === item.id}
                  className="gap-1.5 shrink-0 ds-press"
                >
                  {marking === item.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Révisé</span>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Sessions planifiées */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Calendar className="h-4 w-4 text-primary-text" />
                Sessions planifiées
              </CardTitle>
              <CardDescription className="mt-1">Vos créneaux de révision pour ce document</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Planifier</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Form */}
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg border border-border bg-muted/30 p-3 space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Heure</label>
                  <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Titre (optionnel)</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Révision chapitre 2" className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Durée (min)</label>
                <div className="flex gap-1.5">
                  {[15, 30, 60, 90].map((d) => (
                    <button key={d} onClick={() => setFormDuration(d)} className={`flex-1 h-8 rounded-md text-xs font-medium ${formDuration === d ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{d}</button>
                  ))}
                </div>
              </div>
              {chapters.length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Chapitres ciblés</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {chapters.map((ch) => {
                      const sel = formChapterIds.includes(ch.id)
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setFormChapterIds(sel ? formChapterIds.filter((x) => x !== ch.id) : [...formChapterIds, ch.id])}
                          className={`text-[10px] px-2 py-1 rounded-md border ${sel ? 'bg-primary/15 text-primary-text border-primary/40' : 'border-border hover:bg-muted'}`}
                        >Ch.{ch.ordre + 1}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              <Button onClick={handleCreate} disabled={creating} size="sm" className="w-full gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Créer la session
              </Button>
            </motion.div>
          )}

          {/* Liste */}
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucune session planifiée. Cliquez sur « Planifier ».
            </p>
          ) : (
            sessions.map((s) => {
              const date = new Date(s.dateDebut)
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                    <span className="font-mono text-xs font-bold text-primary-text leading-none">{date.getDate()}</span>
                    <span className="text-[8px] text-muted-foreground uppercase">{date.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.titre || 'Session de révision'}</p>
                    <p className="text-xs text-muted-foreground">
                      {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {s.dureeMin}min
                      {s.chapterIds.length > 0 && ` · ${s.chapterIds.length} chap.`}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{s.statut}</Badge>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
