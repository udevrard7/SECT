'use client'

/**
 * Onglet Entraînement — génération de questions + correction + SRS.
 *
 * - Config : nombre, type, difficulté, chapitre ciblé (optionnel)
 * - POST /api/exam-prep/practice pour générer
 * - Affichage des questions une par une (formulaire de réponse)
 * - POST /api/exam-prep/practice/[id]/submit pour corriger
 * - Feedback : score, correct, explication, réponse attendue, SRS
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award, Loader2, Sparkles, CheckCircle2, XCircle, Send,
  RotateCw, ChevronRight, Target, Zap, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { usePracticeSessionStore } from '@/stores/practice-session-store'

interface Chapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

interface PracticeQuestion {
  id: string
  type: string
  enonce: string
  propositions: Array<{ texte: string }> | null
  difficulte: string
  themes: string[]
}

interface SubmitResult {
  attempt: { id: string; score: number; correct: boolean; feedback: string }
  explication: string | null
  reponseCorrecte: string | null
  srs: { nextReviewAt: string; masteryLevel: number; interval: number } | null
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

type QType = 'MIXTE' | 'QCU' | 'QCM' | 'QRC' | 'TRS'
type QDiff = 'MIXTE' | 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT'

const DIFF_COLORS: Record<string, string> = {
  FACILE: 'bg-success/15 text-success-text border-success/30',
  MOYEN: 'bg-info/15 text-info border-info/30',
  DIFFICILE: 'bg-warning/15 text-warning border-warning/30',
  EXPERT: 'bg-destructive/15 text-destructive border-destructive/30',
}

export function ExamPrepPracticeTab({ documentId, chapters }: Props) {
  const [count, setCount] = useState(5)
  const [type, setType] = useState<QType>('MIXTE')
  const [diff, setDiff] = useState<QDiff>('MIXTE')
  const [chapterId, setChapterId] = useState<string>('')

  // ─── Session persistée (survit au changement d'onglet) ───
  // Le store conserve la série liée à un documentId. Si l'étudiant change
  // d'onglet puis revient, la série est restaurée (questions + index +
  // résultats). On ne garde qu'une série active à la fois.
  const sessionDocumentId = usePracticeSessionStore((s) => s.documentId)
  const sessionQuestions = usePracticeSessionStore((s) => s.questions)
  const sessionCurrentIndex = usePracticeSessionStore((s) => s.currentIndex)
  const sessionResults = usePracticeSessionStore((s) => s.results)
  const sessionGenerating = usePracticeSessionStore((s) => s.generating)
  const setSession = usePracticeSessionStore((s) => s.setSession)
  const setSessionQuestions = usePracticeSessionStore((s) => s.setQuestions)
  const setSessionCurrentIndex = usePracticeSessionStore((s) => s.setCurrentIndex)
  const setSessionResult = usePracticeSessionStore((s) => s.setResult)
  const setSessionGenerating = usePracticeSessionStore((s) => s.setGenerating)
  const clearSession = usePracticeSessionStore((s) => s.clearSession)

  // Restaure la session si elle correspond à ce document, sinon aucune série
  const hasActiveSession = sessionDocumentId === documentId && sessionQuestions.length > 0
  const questions = hasActiveSession ? sessionQuestions : []
  const currentIdx = hasActiveSession ? sessionCurrentIndex : 0
  const generating = sessionGenerating && sessionDocumentId === documentId

  // State local (liés à la question courante, réinitialisés à chaque navigation)
  const [answer, setAnswer] = useState<string>('')
  const [selectedProps, setSelectedProps] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ─── Timer pour mesurer le temps de réponse (dureeSec) ───
  // Démarre à chaque nouvelle question (changement d'index ou génération).
  // Le temps écoulé est envoyé au submit pour alimenter le KPI « Temps de
  // révision » du tableau de bord Progression.
  const questionStartTime = useRef<number>(Date.now())
  useEffect(() => {
    questionStartTime.current = Date.now()
  }, [currentIdx, questions.length])

  // Récupère le résultat stocké pour la question courante (restauration après changement d'onglet)
  const currentQuestion = questions[currentIdx]
  const result = currentQuestion ? (sessionResults[currentQuestion.id] as SubmitResult | undefined) ?? null : null

  // Restaure answer/selectedProps si on revient sur une question déjà répondue
  // (les inputs sont remis à zéro à la navigation, mais si l'utilisateur
  // revient sur une question sans résultat, on garde vide).

  const handleGenerate = async () => {
    // Démarre une nouvelle session dans le store
    setSession(documentId, { count, type, difficulte: diff, chapterId })
    setSessionGenerating(true)
    setAnswer('')
    setSelectedProps([])
    try {
      const res = await fetch('/api/exam-prep/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          chapterId: chapterId || undefined,
          count,
          type,
          difficulte: diff,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json()
      setSessionQuestions(data.questions ?? [])
      if (data.questions?.length === 0) {
        toast.error('Aucune question générée. Réessayez.')
      } else {
        toast.success(`${data.questions.length} question(s) générée(s)`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la génération')
    } finally {
      setSessionGenerating(false)
    }
  }

  const handleSubmit = async () => {
    const q = questions[currentIdx]
    if (!q) return

    let reponse: string
    if (q.propositions) {
      if (selectedProps.length === 0) {
        toast.error('Sélectionnez une réponse')
        return
      }
      reponse = JSON.stringify(selectedProps)
    } else {
      if (!answer.trim()) {
        toast.error('Saisissez votre réponse')
        return
      }
      reponse = answer.trim()
    }

    setSubmitting(true)
    // Calcule le temps de réponse en secondes
    const dureeSec = Math.round((Date.now() - questionStartTime.current) / 1000)
    try {
      const res = await fetch(`/api/exam-prep/practice/${q.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reponse,
          chapterId: chapterId || undefined,
          dureeSec,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json() as SubmitResult
      setSessionResult(q.id, { ...data, questionId: q.id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la correction')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setSessionCurrentIndex(currentIdx + 1)
      setAnswer('')
      setSelectedProps([])
    } else {
      // Fin de la série
      clearSession()
      toast.success('Série terminée ! Continuez avec une nouvelle génération.')
    }
  }

  // ─── Écran de configuration (pas de questions en cours) ───
  if (questions.length === 0) {
    return (
      <div className="space-y-5">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary-text" />
              <h3 className="font-display text-base font-semibold tracking-tight">
                Configurer votre session d'entraînement
              </h3>
            </div>

            {/* Chapitre ciblé */}
            {chapters.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Chapitre ciblé (optionnel)</label>
                <select
                  value={chapterId}
                  onChange={(e) => setChapterId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">📄 Document complet</option>
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>Chapitre {ch.ordre + 1} : {ch.titre}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Nombre */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre de questions</label>
              <div className="flex gap-1.5">
                {[3, 5, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all ds-press ${
                      count === n ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >{n}</button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type de questions</label>
              <div className="flex flex-wrap gap-1.5">
                {(['MIXTE', 'QCU', 'QCM', 'QRC', 'TRS'] as QType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press ${
                      type === t ? 'bg-primary/15 text-primary-text' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >{t === 'MIXTE' ? 'Mixte' : t}</button>
                ))}
              </div>
            </div>

            {/* Difficulté */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Difficulté</label>
              <div className="flex flex-wrap gap-1.5">
                {(['MIXTE', 'FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'] as QDiff[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiff(d)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press ${
                      diff === d ? 'bg-primary/15 text-primary-text' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >{d === 'MIXTE' ? 'Mixte' : d.charAt(0) + d.slice(1).toLowerCase()}</button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full gap-2 ds-press"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Génération en cours…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer {count} question{count > 1 ? 's' : ''}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Question en cours ───
  const q = questions[currentIdx]
  const isChoice = q.propositions !== null

  return (
    <div className="space-y-4">
      {/* Progression de la série */}
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary" className="gap-1.5">
          Question {currentIdx + 1} / {questions.length}
        </Badge>
        {q.difficulte && (
          <Badge variant="outline" className={DIFF_COLORS[q.difficulte] ?? ''}>
            {q.difficulte}
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => { clearSession(); setAnswer(''); setSelectedProps([]) }} className="ml-auto gap-1.5 text-xs">
          <RotateCw className="h-3.5 w-3.5" /> Nouvelle série
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="ds-kente-top">
            <CardContent className="p-5 space-y-4">
              {/* Thèmes */}
              {q.themes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {q.themes.map((t, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] bg-muted">{t}</Badge>
                  ))}
                </div>
              )}

              {/* Énoncé */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  {q.type} · Énoncé
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enonce}</p>
              </div>

              {/* Réponse */}
              {!result && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Votre réponse</p>
                  {isChoice ? (
                    <div className="space-y-2">
                      {q.propositions!.map((p, i) => {
                        const selected = selectedProps.includes(p.texte)
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (q.type === 'QCU') {
                                setSelectedProps([p.texte])
                              } else {
                                setSelectedProps(selected
                                  ? selectedProps.filter((s) => s !== p.texte)
                                  : [...selectedProps, p.texte])
                              }
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ds-press ${
                              selected
                                ? 'border-primary bg-primary/10 text-primary-text'
                                : 'border-border hover:border-primary/40 hover:bg-accent/40'
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                              }`}>
                                {selected && <CheckCircle2 className="h-3 w-3" />}
                              </span>
                              {p.texte}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Saisissez votre réponse…"
                      rows={4}
                      disabled={submitting}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 disabled:opacity-50 resize-none"
                    />
                  )}
                  <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2 ds-press">
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Correction IA…</>
                    ) : (
                      <><Send className="h-4 w-4" /> Valider ma réponse</>
                    )}
                  </Button>
                </div>
              )}

              {/* Résultat */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Verdict */}
                  <div className={`flex items-center gap-3 rounded-lg p-3 ${
                    result.attempt.correct ? 'bg-success/10' : 'bg-destructive/10'
                  }`}>
                    {result.attempt.correct
                      ? <CheckCircle2 className="h-6 w-6 text-success-text shrink-0" />
                      : <XCircle className="h-6 w-6 text-destructive shrink-0" />}
                    <div className="flex-1">
                      <p className={`font-semibold ${result.attempt.correct ? 'text-success-text' : 'text-destructive'}`}>
                        {result.attempt.correct ? 'Correct !' : 'Incorrect'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score : {Math.round(result.attempt.score * 100)}%
                      </p>
                    </div>
                    {result.srs && (
                      <Badge variant="outline" className="gap-1 bg-primary/10 text-primary-text border-primary/30">
                        <Zap className="h-3 w-3" />
                        {Math.round(result.srs.masteryLevel * 100)}% maîtrise
                      </Badge>
                    )}
                  </div>

                  {/* Feedback IA */}
                  {result.attempt.feedback && (
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Feedback</p>
                      <p className="text-sm">{result.attempt.feedback}</p>
                    </div>
                  )}

                  {/* Explication pédagogique */}
                  {result.explication && (
                    <div className="rounded-lg bg-info/5 border-l-4 border-l-info p-3">
                      <p className="text-xs font-medium text-info uppercase tracking-wider mb-1 flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> Explication
                      </p>
                      <p className="text-sm">{result.explication}</p>
                    </div>
                  )}

                  {/* Réponse attendue */}
                  {result.reponseCorrecte && !result.attempt.correct && (
                    <div className="rounded-lg bg-success/5 border-l-4 border-l-success p-3">
                      <p className="text-xs font-medium text-success-text uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Award className="h-3 w-3" /> Réponse attendue
                      </p>
                      <p className="text-sm">{result.reponseCorrecte}</p>
                    </div>
                  )}

                  <Button onClick={handleNext} className="w-full gap-2 ds-press">
                    {currentIdx < questions.length - 1 ? (
                      <>Question suivante <ChevronRight className="h-4 w-4" /></>
                    ) : (
                      <><RotateCw className="h-4 w-4" /> Terminer la série</>
                    )}
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
