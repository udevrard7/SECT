'use client'

/**
 * Onglet Entraînement — génération de questions + correction + SRS.
 *
 * EXAM-PREP-REFACTOR-1 :
 *  - Alignement strict avec le backend :
 *    • POST /practice/generate → 200 PRET (cache hit, questions sans reponseCorrecte)
 *      OU 202 EN_COURS (poll /question-bank pour récupérer les questions + reponseCorrecte)
 *    • POST /practice/{id}/submit body { questionId, documentId, chapterId?, score, correct, dureeSec? }
 *      → { attempt: { id, score, correct } } (la correction est calculée côté client
 *      quand la question fournit reponseCorrecte ; sinon on enregistre une tentative
 *      "neutre" sans verdict binaire).
 *  - DS "Savane EdTech" : StatCard pour les KPIs de série, EntityCard-like pour la
 *    question courante, ProgressRing pour la progression de la série, skeleton PulseSkeleton.
 *
 * - Config : nombre, type (QCU/QCM/QRC/TRS/MIXTE), difficulté, chapitre ciblé
 * - Affichage des questions une par une (navigation Prev/Next)
 * - Feedback : verdict (correct/incorrect), score, explication, réponse attendue
 * - Store Zustand usePracticeSessionStore pour persister la session entre onglets
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award, Loader2, Sparkles, CheckCircle2, XCircle, Send,
  RotateCw, ChevronRight, ChevronLeft, Target, Zap, BookOpen, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard, ProgressRing, PulseSkeleton } from '@/components/ds'
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
  /** Disponible seulement pour les questions issues de /question-bank (polling). */
  reponseCorrecte?: string | null
  explication?: string | null
}

interface SubmitResult {
  attempt: { id: string; score: number; correct: boolean }
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

const TYPE_LABELS: Record<string, string> = {
  QCU: 'QCU',
  QCM: 'QCM',
  QRC: 'Réponse courte',
  TRS: 'Vrai/Faux',
  REFLEXION: 'Réflexion',
  CODE: 'Code',
}

export function ExamPrepPracticeTab({ documentId, chapters }: Props) {
  const [count, setCount] = useState(5)
  const [type, setType] = useState<QType>('MIXTE')
  const [diff, setDiff] = useState<QDiff>('MIXTE')
  const [chapterId, setChapterId] = useState<string>('')

  // ─── Session persistée (survit au changement d'onglet) ───
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

  const hasActiveSession = sessionDocumentId === documentId && sessionQuestions.length > 0
  const questions = hasActiveSession ? sessionQuestions : []
  const currentIdx = hasActiveSession ? sessionCurrentIndex : 0
  const generating = sessionGenerating && sessionDocumentId === documentId

  // State local (liés à la question courante, réinitialisés à chaque navigation)
  const [answer, setAnswer] = useState<string>('')
  const [selectedProps, setSelectedProps] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ─── Timer pour mesurer le temps de réponse (dureeSec) ───
  const questionStartTime = useRef<number>(Date.now())
  useEffect(() => {
    questionStartTime.current = Date.now()
  }, [currentIdx, questions.length])

  const currentQuestion = questions[currentIdx]
  const result = currentQuestion ? (sessionResults[currentQuestion.id] ?? null) : null

  // ─── Map question API → PracticeQuestion ───
  // Normalise propositions (string[] | [{text}] | [{texte}] | JSON string) et themes.
  // Conserve reponseCorrecte et explication quand présents (banque de questions).
  const mapApiQuestion = (q: any): PracticeQuestion => {
    let propositions: PracticeQuestion['propositions'] = null
    if (q.propositions) {
      if (Array.isArray(q.propositions)) {
        const mapped: Array<{ texte: string }> = q.propositions
          .map((p: any) => {
            if (typeof p === 'string') return { texte: p }
            if (p && typeof p === 'object') {
              if (typeof p.texte === 'string') return { texte: p.texte }
              if (typeof p.text === 'string') return { texte: p.text }
            }
            return null
          })
          .filter((p: any): p is { texte: string } => p !== null)
        propositions = mapped.length > 0 ? mapped : null
      } else if (typeof q.propositions === 'string') {
        try {
          const parsed = JSON.parse(q.propositions)
          if (Array.isArray(parsed)) {
            const mapped2: Array<{ texte: string }> = parsed
              .map((p: any) => (typeof p === 'string' ? { texte: p } : (p?.texte ?? p?.text ?? null)))
              .filter((p: any): p is { texte: string } => p !== null)
            propositions = mapped2.length > 0 ? mapped2 : null
          }
        } catch {
          propositions = null
        }
      }
    }
    let themes: string[] = []
    if (Array.isArray(q.themes)) {
      themes = q.themes.filter((t: any): t is string => typeof t === 'string')
    } else if (typeof q.themes === 'string' && q.themes) {
      try { themes = JSON.parse(q.themes) } catch { themes = [] }
    }
    // reponseCorrecte peut être string, JSON array (QCM), ou null
    let reponseCorrecte: string | null = null
    if (typeof q.reponseCorrecte === 'string' && q.reponseCorrecte) {
      reponseCorrecte = q.reponseCorrecte
    } else if (q.reponseCorrecte && typeof q.reponseCorrecte === 'object') {
      try { reponseCorrecte = JSON.stringify(q.reponseCorrecte) } catch { reponseCorrecte = null }
    }
    let explication: string | null = null
    if (typeof q.explication === 'string') {
      explication = q.explication
    }
    return {
      id: q.id,
      type: q.type,
      enonce: q.enonce,
      propositions,
      difficulte: q.difficulte,
      themes,
      reponseCorrecte,
      explication,
    }
  }

  // ─── Poll /question-bank (cache miss 202) ───
  const pollQuestionBank = async (
    docId: string,
    requestedCount: number,
    timeoutMs: number,
    intervalMs: number,
  ): Promise<any[]> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`/api/exam-prep/question-bank?documentId=${docId}&limit=${requestedCount}`)
        if (res.ok) {
          const data = await res.json()
          const qs = Array.isArray(data.questions) ? data.questions : []
          if (qs.length >= requestedCount) return qs.slice(0, requestedCount)
        }
      } catch {
        // ignore — on réessaie au prochain intervalle
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    try {
      const res = await fetch(`/api/exam-prep/question-bank?documentId=${docId}&limit=${requestedCount}`)
      if (res.ok) {
        const data = await res.json()
        return Array.isArray(data.questions) ? data.questions.slice(0, requestedCount) : []
      }
    } catch {
      // ignore
    }
    return []
  }

  const handleGenerate = async () => {
    setSession(documentId, { count, type, difficulte: diff, chapterId })
    setSessionGenerating(true)
    setAnswer('')
    setSelectedProps([])
    try {
      const res = await fetch('/api/exam-prep/practice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          config: {
            nombreQuestions: count,
            typesQuestions: type === 'MIXTE' ? {} : { [type.toLowerCase()]: count },
            difficulte: diff,
            chapterId: chapterId || undefined,
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json()

      if (res.status === 200 && data.status === 'PRET' && Array.isArray(data.questions)) {
        // Cache hit — questions disponibles immédiatement (sans reponseCorrecte).
        const mapped = data.questions.map(mapApiQuestion)
        setSessionQuestions(mapped)
        if (mapped.length === 0) {
          toast.error('Aucune question en cache. Réessayez.')
        } else {
          toast.success(`${mapped.length} question(s) récupérée(s) de la banque`)
        }
        return
      }

      // 202 EN_COURS — poll /question-bank jusqu'à récupérer les questions validées.
      toast.info('Génération en cours… Vos questions arrivent dans un instant.')
      const polled = await pollQuestionBank(documentId, count, 60_000, 2_000)
      const mapped = polled.map(mapApiQuestion)
      setSessionQuestions(mapped)
      if (mapped.length === 0) {
        toast.error('La génération prend plus de temps que prévu. Réessayez.')
      } else {
        toast.success(`${mapped.length} question(s) générée(s)`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la génération')
    } finally {
      setSessionGenerating(false)
    }
  }

  // ─── Correction côté client ───
  // Compare la réponse de l'étudiant à `reponseCorrecte` (quand disponible).
  // Pour QCU/QCM : compare les ensembles de propositions sélectionnées.
  // Pour QRC/TRS : comparaison textuelle normalisée (lowercase, trim, sans ponctuation).
  const gradeAnswer = (q: PracticeQuestion, userAnswer: string): { score: number; correct: boolean } => {
    if (!q.reponseCorrecte) {
      // Pas de réponse modèle → on ne peut pas corriger automatiquement.
      // On enregistre une tentative "neutre" (score 0, correct false) pour le suivi SRS.
      return { score: 0, correct: false }
    }
    if (q.propositions) {
      // QCU/QCM : reponseCorrecte peut être une string unique ou un JSON array.
      let expected: string[] = []
      try {
        const parsed = JSON.parse(q.reponseCorrecte)
        if (Array.isArray(parsed)) {
          expected = parsed.map((s: any) => String(s).trim())
        } else {
          expected = [String(parsed).trim()]
        }
      } catch {
        expected = [q.reponseCorrecte.trim()]
      }
      const userArr: string[] = (() => {
        try {
          const parsed = JSON.parse(userAnswer)
          return Array.isArray(parsed) ? parsed.map((s: any) => String(s).trim()) : [String(parsed).trim()]
        } catch {
          return [userAnswer.trim()]
        }
      })()
      const expectedSet = new Set(expected)
      const userSet = new Set(userArr)
      const correct = expectedSet.size === userSet.size && [...expectedSet].every((v) => userSet.has(v))
      // Score partiel pour QCM : intersection / union
      const intersection = [...expectedSet].filter((v) => userSet.has(v)).length
      const union = new Set([...expectedSet, ...userSet]).size
      const score = union === 0 ? 0 : intersection / union
      return { score: correct ? 1 : score, correct }
    }
    // QRC/TRS : comparaison textuelle
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,;:!?'"]/g, '').replace(/\s+/g, ' ')
    const correct = normalize(userAnswer) === normalize(q.reponseCorrecte)
    return { score: correct ? 1 : 0, correct }
  }

  const handleSubmit = async () => {
    const q = questions[currentIdx]
    if (!q) return

    let userAnswer: string
    if (q.propositions) {
      if (selectedProps.length === 0) {
        toast.error('Sélectionnez une réponse')
        return
      }
      userAnswer = JSON.stringify(selectedProps)
    } else {
      if (!answer.trim()) {
        toast.error('Saisissez votre réponse')
        return
      }
      userAnswer = answer.trim()
    }

    setSubmitting(true)
    const dureeSec = Math.round((Date.now() - questionStartTime.current) / 1000)
    const { score, correct } = gradeAnswer(q, userAnswer)

    try {
      // EXAM-PREP-REFACTOR-1 : body aligné sur SubmitPracticeInput backend.
      // { questionId, documentId?, chapterId?, score (0..1), correct, dureeSec? }
      const res = await fetch(`/api/exam-prep/practice/${q.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: q.id,
          documentId,
          chapterId: chapterId || undefined,
          score,
          correct,
          dureeSec,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json() as SubmitResult
      // EXAM-PREP-REFACTOR-1 : le backend ne renvoie que `attempt`. On enrichit
      // côté client avec reponseCorrecte/explication (depuis la question) pour
      // l'affichage du feedback pédagogique.
      setSessionResult(q.id, {
        questionId: q.id,
        attempt: {
          id: data.attempt.id,
          score: data.attempt.score,
          correct: data.attempt.correct,
        },
        explication: q.explication ?? null,
        reponseCorrecte: q.reponseCorrecte ?? null,
        srs: null,
      })
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
      clearSession()
      toast.success('Série terminée ! Continuez avec une nouvelle génération.')
    }
  }

  const handlePrev = () => {
    if (currentIdx > 0) {
      setSessionCurrentIndex(currentIdx - 1)
      setAnswer('')
      setSelectedProps([])
    }
  }

  // ─── KPIs de la série (StatCards) ───
  const answered = questions.filter((q) => sessionResults[q.id]).length
  const correctCount = questions.filter((q) => sessionResults[q.id]?.attempt?.correct).length
  const avgScore = answered > 0
    ? Math.round((questions.reduce((sum, q) => sum + (sessionResults[q.id]?.attempt?.score ?? 0), 0) / answered) * 100)
    : 0

  // ─── Écran de configuration ───
  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Target}
          title="Configurer votre session d'entraînement"
          desc="Choisissez le nombre, le type et la difficulté des questions. L'IA génère un set personnalisé à partir de votre document."
        />
        <Card className="border-l-4 border-l-primary ds-kente-top">
          <CardContent className="p-5 space-y-4">
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
  const hasModelAnswer = !!q.reponseCorrecte

  return (
    <div className="space-y-6">
      {/* KPIs de série */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Question"
          value={`${currentIdx + 1}/${questions.length}`}
          icon={Target}
          accent="primary"
          index={0}
        />
        <StatCard
          label="Répondues"
          value={answered}
          icon={CheckCircle2}
          accent="info"
          index={1}
        />
        <StatCard
          label="Correctes"
          value={correctCount}
          icon={Award}
          accent="success"
          scoreOn20={answered > 0 ? (correctCount / answered) * 20 : undefined}
          index={2}
        />
        <StatCard
          label="Score moyen"
          value={answered > 0 ? `${avgScore}%` : '—'}
          icon={Zap}
          accent="warning"
          index={3}
        />
      </div>

      {/* Progression de la série */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProgressRing
            value={(currentIdx / questions.length) * 100}
            size={48}
            strokeWidth={5}
            accent="primary"
            label={`${currentIdx + 1}`}
            showPercent={false}
          />
          <div>
            <p className="text-sm font-medium">Progression de la série</p>
            <p className="text-xs text-muted-foreground">{answered} réponse(s) enregistrée(s)</p>
          </div>
        </div>
        {q.difficulte && (
          <Badge variant="outline" className={DIFF_COLORS[q.difficulte] ?? ''}>
            {q.difficulte}
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => { clearSession(); setAnswer(''); setSelectedProps([]) }} className="ml-auto gap-1.5 text-xs shrink-0">
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
              {/* Thèmes + type */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary-text">
                  {TYPE_LABELS[q.type] ?? q.type}
                </Badge>
                {q.themes.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] bg-muted/50">{t}</Badge>
                ))}
              </div>

              {/* Énoncé */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Énoncé
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
                              if (q.type === 'QCU' || q.type === 'TRS') {
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
                  {!hasModelAnswer && (
                    <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Pas de correction automatique pour cette question — votre réponse sera enregistrée.
                    </p>
                  )}
                  <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2 ds-press">
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</>
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
                  {/* Verdict (seulement si on a un modèle de réponse) */}
                  {hasModelAnswer ? (
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
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg bg-info/10 p-3">
                      <CheckCircle2 className="h-6 w-6 text-info shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-info">Réponse enregistrée</p>
                        <p className="text-xs text-muted-foreground">
                          Aucun modèle de correction pour cette question — votre tentative est sauvegardée pour le suivi SRS.
                        </p>
                      </div>
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
                      <p className="text-sm whitespace-pre-wrap">{result.reponseCorrecte}</p>
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePrev}
                      disabled={currentIdx === 0}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Précédent</span>
                    </Button>
                    <Button onClick={handleNext} className="flex-1 gap-2 ds-press">
                      {currentIdx < questions.length - 1 ? (
                        <>Question suivante <ChevronRight className="h-4 w-4" /></>
                      ) : (
                        <><RotateCw className="h-4 w-4" /> Terminer la série</>
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof Target
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary-text" />
      </div>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  )
}
