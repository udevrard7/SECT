'use client'

/**
 * Onglet Planning — sessions de révision + spaced repetition.
 *
 * EXAM-PREP-REFACTOR-1 :
 *  - Alignement strict backend :
 *    • GET /api/exam-prep/review?documentId=X → { reviewItems: ReviewItem[] }
 *      ReviewItem = { id, userId, chapterId, questionId?, interval, easeFactor,
 *                     nextReviewAt, lastReviewAt?, repetitions, createdAt, updatedAt }
 *      (pas de `due` ni `stats` côté backend — on filtre et calcule client-side)
 *    • POST /api/exam-prep/review body { chapterId, quality } → { message }
 *    • GET /api/exam-prep/planning?documentId=X → { sessions: StudySession[] }
 *      StudySession = { id, userId, documentId?, chapitreId?, type, dateDebut,
 *                       dateFin?, statut, notes?, createdAt, updatedAt }
 *    • POST /api/exam-prep/planning body { documentId?, chapitreId?, type,
 *                                          dateDebut, dateFin?, notes? } → 201 { session }
 *    • DELETE /api/exam-prep/planning/{id} → 200 { message }
 *      (le backend n'expose PAS de PATCH pour updater le statut — on supprime
 *      simplement la session au lieu de "marquer comme terminée/annulée")
 *  - DS "Savane EdTech" : StatCard (KPIs SRS), PulseSkeleton, cards cohérentes.
 *  - Le masteryLevel est dérivé client-side (repetitions + interval).
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, Calendar, Plus, CheckCircle2, Loader2, Zap, TrendingUp,
  Trash2, BookOpen, AlertCircle, RefreshCw, BookMarked, PencilLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard, PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

interface Chapter { id: string; titre: string; ordre: number; sujets: string[] }

// ─── Types backend ───

interface ReviewItem {
  id: string
  userId: string
  chapterId: string
  questionId?: string | null
  interval: number       // jours
  easeFactor: number     // SM-2
  nextReviewAt: string
  lastReviewAt?: string | null
  repetitions: number
  createdAt: string
  updatedAt: string
}

interface StudySession {
  id: string
  userId: string
  documentId?: string | null
  chapitreId?: string | null
  type: string          // "lecture", "exercices", "revision"
  dateDebut: string
  dateFin?: string | null
  statut: string        // "PLANIFIEE", "EN_COURS", "TERMINEE"
  notes?: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

// Types de session (alignés sur le backend)
const SESSION_TYPES = [
  { value: 'lecture', label: 'Lecture', icon: BookOpen },
  { value: 'exercices', label: 'Exercices', icon: PencilLine },
  { value: 'revision', label: 'Révision', icon: Zap },
] as const

const STATUT_LABELS: Record<string, string> = {
  PLANIFIEE: 'Planifiée',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
}

const STATUT_COLORS: Record<string, string> = {
  PLANIFIEE: 'bg-primary/10 text-primary-text border-primary/30',
  EN_COURS: 'bg-warning/10 text-warning border-warning/30',
  TERMINEE: 'bg-success/10 text-success-text border-success/30',
}

// Calcule un masteryLevel dérivé (0..1) à partir des métriques SM-2.
// 5+ répétitions et 21+ jours d'intervalle = maîtrise maximale.
function computeMastery(item: ReviewItem): number {
  const repScore = Math.min(1, item.repetitions / 5) * 0.6
  const intScore = Math.min(1, item.interval / 21) * 0.4
  return Math.min(1, repScore + intScore)
}

function isDue(item: ReviewItem): boolean {
  return new Date(item.nextReviewAt) <= new Date()
}

function formatDuration(debut: string, fin?: string | null): string {
  if (!fin) return ''
  const ms = new Date(fin).getTime() - new Date(debut).getTime()
  if (ms <= 0) return ''
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`
}

export function ExamPrepPlanningTab({ documentId, chapters }: Props) {
  const queryClient = useQueryClient()

  // ─── Review items (SRS) ───
  // Un seul appel sans `due=true` : on récupère tous les items et on filtre
  // client-side pour les "dus aujourd'hui" + on calcule les stats.
  const reviewQuery = useQuery<{ reviewItems: ReviewItem[] }>({
    queryKey: ['exam-prep-review', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/review?documentId=${documentId}`)
      if (!res.ok) throw new Error('Échec du chargement SRS')
      const data = await res.json()
      return { reviewItems: data.reviewItems ?? [] }
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  // ─── Sessions planifiées ───
  const sessionsQuery = useQuery<{ sessions: StudySession[] }>({
    queryKey: ['exam-prep-planning', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/planning?documentId=${documentId}`)
      if (!res.ok) throw new Error('Échec du chargement des sessions')
      const data = await res.json()
      return { sessions: data.sessions ?? [] }
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const reviewItems = reviewQuery.data?.reviewItems ?? []
  const sessions = sessionsQuery.data?.sessions ?? []
  const loading = reviewQuery.isLoading || sessionsQuery.isLoading
  const error = reviewQuery.error || sessionsQuery.error

  const dueItems = reviewItems.filter(isDue)
  const masteredItems = reviewItems.filter((i) => computeMastery(i) >= 0.7)
  const avgMastery = reviewItems.length > 0
    ? reviewItems.reduce((s, i) => s + computeMastery(i), 0) / reviewItems.length
    : 0

  // ─── Mutation : marquer comme révisé ───
  const markMutation = useMutation({
    mutationFn: async (chapterId: string) => {
      const res = await fetch('/api/exam-prep/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, quality: 4 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la mise à jour')
      }
    },
    onSuccess: () => {
      toast.success('Chapitre révisé', {
        description: 'Prochaine révision planifiée par spaced repetition.',
      })
      queryClient.invalidateQueries({ queryKey: ['exam-prep-review', documentId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Mutation : supprimer une session ───
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/exam-prep/planning/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la suppression')
      }
    },
    onSuccess: () => {
      toast.success('Session supprimée')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-planning', documentId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Calendar}
          title="Planification"
          desc="Sessions de révision + spaced repetition (SM-2)."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
        <PulseSkeleton variant="card" className="h-48" />
        <PulseSkeleton variant="card" className="h-48" />
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Calendar}
          title="Planification"
          desc="Sessions de révision + spaced repetition (SM-2)."
        />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="mt-3 text-sm font-medium">Échec du chargement</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['exam-prep-review', documentId] })
                queryClient.invalidateQueries({ queryKey: ['exam-prep-planning', documentId] })
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Calendar}
        title="Planification"
        desc="Sessions de révision + spaced repetition (SM-2)."
      />

      {/* Stats SRS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="À réviser"
          value={dueItems.length}
          icon={Zap}
          accent={dueItems.length > 0 ? 'warning' : 'success'}
          index={0}
        />
        <StatCard
          label="Maîtrisés"
          value={masteredItems.length}
          icon={CheckCircle2}
          accent="success"
          index={1}
        />
        <StatCard
          label="Items suivis"
          value={reviewItems.length}
          icon={TrendingUp}
          accent="info"
          index={2}
        />
        <StatCard
          label="Maîtrise moy."
          value={`${Math.round(avgMastery * 100)}%`}
          icon={TrendingUp}
          accent="primary"
          index={3}
        />
      </div>

      {/* Items dus */}
      <Card className="ds-kente-top">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            <h3 className="font-display text-base font-semibold">À réviser aujourd&apos;hui</h3>
          </div>
          <p className="text-xs text-muted-foreground">Chapitres dus selon le spaced repetition (SM-2)</p>
          {dueItems.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 text-success-text mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">
                Aucune révision due aujourd&apos;hui. Vous êtes à jour !
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {dueItems.map((item) => {
                const chapter = chapters.find((c) => c.id === item.chapterId)
                const mastery = computeMastery(item)
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                      <span className="font-mono text-xs font-bold text-warning">
                        {chapter ? chapter.ordre + 1 : '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {chapter?.titre ?? 'Chapitre inconnu'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {Math.round(mastery * 100)}% maîtrise
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          intervalle {item.interval}j · {item.repetitions} rép.
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markMutation.mutate(item.chapterId)}
                      disabled={markMutation.isPending}
                      className="gap-1.5 shrink-0 ds-press"
                    >
                      {markMutation.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Révisé</span>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions planifiées */}
      <SessionsList
        sessions={sessions}
        chapters={chapters}
        documentId={documentId}
        onDelete={(id) => deleteSessionMutation.mutate(id)}
        deleting={deleteSessionMutation.isPending}
      />
    </div>
  )
}

// ─── Liste des sessions + formulaire ───

function SessionsList({
  sessions, chapters, documentId, onDelete, deleting,
}: {
  sessions: StudySession[]
  chapters: Chapter[]
  documentId: string
  onDelete: (id: string) => void
  deleting: boolean
}) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  // Form state (aligné sur CreateStudySessionInput backend)
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('14:00')
  const [formDuration, setFormDuration] = useState(30)
  const [formType, setFormType] = useState<string>('revision')
  const [formChapitreId, setFormChapitreId] = useState<string>('')
  const [formNotes, setFormNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!formDate) {
      toast.error('Sélectionnez une date')
      return
    }
    setCreating(true)
    try {
      const dateDebut = new Date(`${formDate}T${formTime}:00`)
      const dateFin = new Date(dateDebut.getTime() + formDuration * 60_000)
      const res = await fetch('/api/exam-prep/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          chapitreId: formChapitreId || undefined,
          type: formType,
          dateDebut: dateDebut.toISOString(),
          dateFin: dateFin.toISOString(),
          notes: formNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la création')
      }
      toast.success('Session planifiée', {
        description: 'Un rappel vous sera envoyé avant la session.',
      })
      setShowForm(false)
      setFormDate('')
      setFormNotes('')
      setFormChapitreId('')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-planning', documentId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary-text" />
            <h3 className="font-display text-base font-semibold">Sessions planifiées</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Planifier</span>
          </Button>
        </div>

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                {/* Type */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Type de session</label>
                  <div className="flex gap-1.5 mt-1">
                    {SESSION_TYPES.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.value}
                          onClick={() => setFormType(t.value)}
                          className={`flex-1 flex flex-col items-center gap-1 h-14 rounded-md text-[10px] font-medium transition-all ds-press ${
                            formType === t.value
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Date + heure */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Heure</label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {/* Durée */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Durée</label>
                  <div className="flex gap-1.5 mt-1">
                    {[15, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => setFormDuration(d)}
                        className={`flex-1 h-9 rounded-md text-xs font-medium transition-all ds-press ${
                          formDuration === d ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
                        }`}
                      >
                        {d < 60 ? `${d}min` : `${d / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chapitre */}
                {chapters.length > 0 && (
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Chapitre ciblé (optionnel)</label>
                    <select
                      value={formChapitreId}
                      onChange={(e) => setFormChapitreId(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Document complet</option>
                      {chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>Ch.{ch.ordre + 1} : {ch.titre}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Notes (optionnel)</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Objectifs, points à revoir…"
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <Button onClick={handleCreate} disabled={creating} size="sm" className="w-full gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer la session
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Liste */}
        {sessions.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground mt-2">
              Aucune session planifiée. Cliquez sur « Planifier ».
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {sessions
                .slice()
                .sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime())
                .map((s) => {
                  const date = new Date(s.dateDebut)
                  const duration = formatDuration(s.dateDebut, s.dateFin)
                  const typeMeta = SESSION_TYPES.find((t) => t.value === s.type)
                  const TypeIcon = typeMeta?.icon ?? BookOpen
                  const chapter = s.chapitreId ? chapters.find((c) => c.id === s.chapitreId) : null
                  return (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors"
                    >
                      {/* Date */}
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                        <span className="font-mono text-xs font-bold text-primary-text leading-none">{date.getDate()}</span>
                        <span className="text-[8px] text-muted-foreground uppercase">{date.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="h-3 w-3 text-primary-text shrink-0" />
                          <p className="text-sm font-medium truncate">
                            {typeMeta?.label ?? s.type}
                            {chapter ? ` · Ch.${chapter.ordre + 1}` : ''}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {duration && ` · ${duration}`}
                        </p>
                        {s.notes && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic line-clamp-1">{s.notes}</p>
                        )}
                      </div>

                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${STATUT_COLORS[s.statut] ?? 'bg-muted text-muted-foreground'}`}
                      >
                        {STATUT_LABELS[s.statut] ?? s.statut}
                      </Badge>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(s.id)}
                        disabled={deleting}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        aria-label="Supprimer la session"
                        title="Supprimer"
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </motion.div>
                  )
                })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof Calendar
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
