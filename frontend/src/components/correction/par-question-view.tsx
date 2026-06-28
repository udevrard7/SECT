'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  AlertTriangle,
  Loader2,
  User,
  Zap,
  FileText,
  LayoutGrid,
  Wand2,
  Save,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  parseCodingAnswer,
} from '@/lib/coding-types'
import type { CorrectionSession, RubricCriterion } from '@/types/correction'
import {
  getQuestionTypeLabel,
  getCorrectionBadge,
  getStudentStatusDot,
  isAutoGradedType,
  isSemiAutoGradedType,
  generateRubricCriteria,
  parseAnswerContent,
  isCodingAnswer,
} from '@/lib/correction-utils'
import { ScoreCircle } from '@/components/correction/score-circle'
import { AiSuggestionPanel } from '@/components/correction/ai-suggestion-panel'
import { GradingForm } from '@/components/correction/grading-form'
import type { useAiGrade } from '@/hooks/use-correction'

/**
 * Vue "par question" de la correction : une question à la fois, toutes les
 * copies étudiantes en colonnes scrollables. Contient l'en-tête de question
 * (non scrollable), la zone scrollable avec réponse attendue + cartes étudiant
 * (chacune avec réponse, suggestion IA, avis auto/semi-auto, formulaire de
 * notation), la navigation sticky en bas, et le bouton batch IA pour la
 * question courante.
 *
 * Extrait de correction-page.tsx (phase 3, commit 3).
 * JSX strictement identique à l'original `renderParQuestionContent()`.
 * La logique métier (state, handlers, useMemo) reste dans correction-page.tsx
 * et est passée via props typées.
 *
 * Note : la logique du bouton "Évaluer toutes les copies avec l'IA (cette
 * question)" est préservée à l'identique — elle itère sur les sessions,
 * appelle aiGradeMutation.mutateAsync pour celles sans score, et affiche
 * un toast de synthèse. La mutation est passée en prop (instance unique
 * partagée avec le reste de la page).
 */
export function ParQuestionView({
  sessions,
  horizontalQuestions,
  horizontalCurrentQuestion,
  horizontalQuestionIndex,
  setHorizontalQuestionIndex,
  horizontalGradedCount,
  horizontalScores,
  setHorizontalScores,
  horizontalComments,
  setHorizontalComments,
  horizontalCriteria,
  expectedAnswerOpen,
  setExpectedAnswerOpen,
  isAiLoading,
  isBatchAiLoading,
  savingSessionId,
  setIsBatchAiLoading,
  handleHorizontalToggleCriterion,
  handleHorizontalSave,
  handleAiGrade,
  getReponseForSession,
  aiGradeMutation,
}: {
  sessions: CorrectionSession[]
  horizontalQuestions: CorrectionSession['epreuve']['questions']
  horizontalCurrentQuestion: CorrectionSession['epreuve']['questions'][number] | null
  horizontalQuestionIndex: number
  setHorizontalQuestionIndex: (index: number) => void
  horizontalGradedCount: number
  horizontalScores: Record<string, string>
  setHorizontalScores: React.Dispatch<React.SetStateAction<Record<string, string>>>
  horizontalComments: Record<string, string>
  setHorizontalComments: React.Dispatch<React.SetStateAction<Record<string, string>>>
  horizontalCriteria: Record<string, Set<string>>
  expectedAnswerOpen: boolean
  setExpectedAnswerOpen: (open: boolean) => void
  isAiLoading: boolean
  isBatchAiLoading: boolean
  savingSessionId: string | null
  setIsBatchAiLoading: (loading: boolean) => void
  handleHorizontalToggleCriterion: (sessionId: string, criterionId: string, criteria: RubricCriterion[]) => void
  handleHorizontalSave: (sessionId: string) => Promise<void>
  handleAiGrade: (sessionId?: string, questionId?: string) => Promise<void>
  getReponseForSession: (session: CorrectionSession, questionId: string) => CorrectionSession['reponses'][number] | null
  aiGradeMutation: ReturnType<typeof useAiGrade>
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-base font-semibold font-display">Correction par question</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Sélectionnez une épreuve pour corriger toutes les copies question par question.
          </p>
        </div>
      </div>
    )
  }

  if (!horizontalCurrentQuestion) return null

  const hq = horizontalCurrentQuestion.question
  const totalSessions = sessions.length
  const progressPct = totalSessions > 0 ? (horizontalGradedCount / totalSessions) * 100 : 0
  const expectedAnswer = typeof hq.reponseCorrecte === 'string'
    ? hq.reponseCorrecte
    : Array.isArray(hq.reponseCorrecte)
      ? hq.reponseCorrecte.join(', ')
      : ''

  const handleBatchAiForQuestion = async () => {
    setIsBatchAiLoading(true)
    let graded = 0
    for (const session of sessions) {
      const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
      if (rep?.score === null || rep?.score === undefined) {
        try {
          await aiGradeMutation.mutateAsync({
            sessionId: session.id,
            questionId: horizontalCurrentQuestion.questionId,
          })
          graded++
        } catch {
          // Continue
        }
      }
    }
    setIsBatchAiLoading(false)
    toast.success('Évaluation IA terminée', {
      description: `${graded} copies évaluées par l'IA pour cette question.`,
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Question info header (non-scrollable) */}
      <div className="border-b border-border bg-card px-4 py-2 space-y-1.5 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold">Q{horizontalQuestionIndex + 1}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{getQuestionTypeLabel(hq.type)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs font-semibold text-success-text font-mono tabular-nums">{horizontalCurrentQuestion.bareme}pts</span>
          <Badge variant="outline" className={`text-[10px] h-5 ${getCorrectionBadge(hq.type).classes}`}>
            {getCorrectionBadge(hq.type).label}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{horizontalGradedCount}/{totalSessions}</span>
            <Progress value={progressPct} className="w-16 h-1.5" />
          </div>
        </div>
        <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-2">{hq.enonce}</p>
      </div>

      {/* Student answer cards (scrollable) */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={`hq-${horizontalQuestionIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {/* Expected answer panel (collapsible, at top of scroll area) */}
              {expectedAnswer && (
                <Collapsible open={expectedAnswerOpen} onOpenChange={setExpectedAnswerOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left rounded-lg border border-success/20 bg-success/10 px-3 py-2 hover:bg-success/10 transition-colors">
                    <Check className="h-3.5 w-3.5 text-success-text" />
                    <span className="text-xs font-semibold text-success-text">
                      Réponse attendue
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 ml-auto text-success-text transition-transform ${expectedAnswerOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-b-lg border border-t-0 border-success/20 bg-success/10 px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap text-success-text">
                        {expectedAnswer}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Student answer cards */}
              {sessions.map((session) => {
                const rep = getReponseForSession(session, horizontalCurrentQuestion.questionId)
                const criteria = generateRubricCriteria(hq.type, horizontalCurrentQuestion.bareme)
                const activeCriteria = horizontalCriteria[session.id] ?? new Set()
                const answerContent = parseAnswerContent(rep?.contenu)

                let criteriaScore = 0
                activeCriteria.forEach((id) => {
                  const c = criteria.find((cr) => cr.id === id)
                  if (c) criteriaScore += c.points
                })
                criteriaScore = Math.min(criteriaScore, horizontalCurrentQuestion.bareme)

                // P3-CORRECTION (K10) : key par sessionId::questionId pour éviter la fuite
                const hKey = `${session.id}::${horizontalCurrentQuestion?.questionId ?? ''}`
                const scoreValue = horizontalScores[hKey] ?? (rep?.score !== null && rep?.score !== undefined ? String(rep.score) : '')
                const commentValue = horizontalComments[hKey] ?? (rep?.commentaire ?? '')
                const isSavingRow = savingSessionId === session.id
                const statusDot = getStudentStatusDot(session)

                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
                  >
                    {/* Card header: Student name + Score circle + Status + Alerts */}
                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot.color}`} title={statusDot.label} />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 shrink-0">
                          <User className="h-3.5 w-3.5 text-success-text" />
                        </div>
                        <p className="text-sm font-semibold truncate">{(session.etudiant?.name ?? session.etudiantNom ?? '—')}</p>
                      </div>
                      <ScoreCircle
                        score={rep?.score ?? null}
                        total={horizontalCurrentQuestion.bareme}
                        size="sm"
                      />
                      {session.alertes > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-5 gap-0.5 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          {session.alertes}
                        </Badge>
                      )}
                    </div>

                    {/* Answer section: Full answer text, NO truncation */}
                    <div className="px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-foreground">Réponse</span>
                      </div>
                      {hq.type === 'CODE' && isCodingAnswer(rep?.contenu) ? (
                        <div className="space-y-2">
                          {(() => {
                            const codingAns = parseCodingAnswer(rep?.contenu || null)
                            if (!codingAns) return <span className="text-sm text-muted-foreground">Aucun code</span>
                            const passedTests = codingAns.testResultsPublics?.filter?.(t => t.passed)?.length ?? '?'
                            const totalTests = codingAns.testResultsPublics?.length ?? '?'
                            return (
                              <>
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-[10px] h-5 border-secondary/30 text-secondary">
                                    {(hq.langage || codingAns.language || 'python').toUpperCase()}
                                  </Badge>
                                  <span className="text-muted-foreground">{codingAns.code.split('\n').length} lignes</span>
                                  <span className="text-muted-foreground">Tests: {passedTests}/{totalTests}</span>
                                </div>
                                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-900 rounded-md p-3 overflow-x-auto whitespace-pre-wrap border border-slate-200 dark:border-slate-800">
                                  {codingAns.code}
                                </pre>
                              </>
                            )
                          })()}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {answerContent}
                        </p>
                      )}
                    </div>

                    {/* AI Suggestion (if available) */}
                    {rep?.noteIA !== null && rep?.noteIA !== undefined && !isAutoGradedType(hq.type) && (
                      <AiSuggestionPanel
                        variant="flat"
                        noteIA={rep.noteIA}
                        bareme={horizontalCurrentQuestion.bareme}
                        justificationIA={rep.justificationIA}
                        onApply={() => {
                          setHorizontalScores((prev) => ({ ...prev, [session.id]: String(rep.noteIA) }))
                          if (rep.justificationIA) {
                            setHorizontalComments((prev) => ({ ...prev, [session.id]: rep.justificationIA ?? '' }))
                          }
                          handleHorizontalSave(session.id)
                        }}
                        onCopyNote={() => {
                          setHorizontalScores((prev) => ({ ...prev, [session.id]: String(rep.noteIA) }))
                          if (rep.justificationIA) {
                            setHorizontalComments((prev) => ({ ...prev, [session.id]: rep.justificationIA ?? '' }))
                          }
                        }}
                      />
                    )}

                    {/* Auto-graded notice */}
                    {isAutoGradedType(hq.type) && (
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-info/10 border border-info/20">
                          <Zap className="h-4 w-4 text-info shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-info">Auto-corrigée</p>
                            <p className="text-[10px] text-info font-mono tabular-nums">
                              Score automatique : {rep?.score ?? '—'} / {horizontalCurrentQuestion.bareme}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Semi-auto (CODE) notice */}
                    {isSemiAutoGradedType(hq.type) && (
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/10 border border-secondary/20">
                          <Zap className="h-4 w-4 text-secondary shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-secondary">Auto+corrigée</p>
                            <p className="text-[10px] text-secondary font-mono tabular-nums">
                              Score auto-calculé : {rep?.score ?? '—'} / {horizontalCurrentQuestion.bareme} — Vous pouvez modifier la note ci-dessous
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Grading section — for manual questions */}
                    {!isAutoGradedType(hq.type) && !isSemiAutoGradedType(hq.type) && (
                      <GradingForm
                        variant="par-question"
                        bareme={horizontalCurrentQuestion.bareme}
                        rubricCriteria={criteria}
                        selectedCriteria={activeCriteria}
                        onToggleCriterion={(criterionId) => handleHorizontalToggleCriterion(session.id, criterionId, criteria)}
                        noteFinale={scoreValue}
                        onNoteChange={(value) => setHorizontalScores((prev) => ({ ...prev, [session.id]: value }))}
                        commentaire={commentValue}
                        onCommentChange={(value) => setHorizontalComments((prev) => ({ ...prev, [session.id]: value }))}
                        computedScore={criteriaScore}
                        onSave={() => handleHorizontalSave(session.id)}
                        isSaving={isSavingRow}
                        onAiGrade={() => handleAiGrade(session.id, horizontalCurrentQuestion.questionId)}
                        isAiLoading={isAiLoading}
                      />
                    )}

                    {/* Semi-auto grading section (CODE) — override option */}
                    {isSemiAutoGradedType(hq.type) && (
                      <div className="rounded-b-xl border-t border-border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <Label className="text-sm font-bold whitespace-nowrap">Note</Label>
                          <ScoreCircle
                            score={scoreValue !== '' ? parseFloat(scoreValue) || 0 : (rep?.score ?? 0)}
                            total={horizontalCurrentQuestion.bareme}
                            size="md"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={horizontalCurrentQuestion.bareme}
                            step={0.5}
                            value={scoreValue}
                            onChange={(e) => setHorizontalScores((prev) => ({ ...prev, [session.id]: e.target.value }))}
                            placeholder={rep?.score != null ? String(rep.score) : '0'}
                            className="w-24 h-9 text-base font-bold font-mono tabular-nums"
                          />
                          <span className="text-base font-semibold text-muted-foreground font-mono tabular-nums">/ {horizontalCurrentQuestion.bareme}</span>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Commentaire
                          </Label>
                          <Textarea
                            value={commentValue}
                            onChange={(e) => setHorizontalComments((prev) => ({ ...prev, [session.id]: e.target.value }))}
                            placeholder="Ajoutez votre commentaire..."
                            rows={2}
                            className="resize-none text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleHorizontalSave(session.id)}
                            disabled={isSavingRow}
                            className="h-9 text-xs bg-success hover:bg-success/90 px-4"
                          >
                            {isSavingRow ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                            Sauvegarder
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Sticky bottom navigation */}
      <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHorizontalQuestionIndex(Math.max(0, horizontalQuestionIndex - 1))}
          disabled={horizontalQuestionIndex === 0}
          className="h-7 text-xs gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Préc.
        </Button>

        <div className="flex items-center gap-1 overflow-x-auto max-w-[60%] px-2">
          {horizontalQuestions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setHorizontalQuestionIndex(idx)}
              className={`h-6 w-6 shrink-0 rounded border text-[10px] font-bold font-mono tabular-nums transition-colors ${
                idx === horizontalQuestionIndex
                  ? 'bg-success text-white border-success'
                  : 'bg-muted text-muted-foreground border-border hover:bg-success/15'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHorizontalQuestionIndex(Math.min(horizontalQuestions.length - 1, horizontalQuestionIndex + 1))}
          disabled={horizontalQuestionIndex >= horizontalQuestions.length - 1}
          className="h-7 text-xs gap-1"
        >
          Suiv.
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Batch AI for this question */}
      {!isAutoGradedType(hq.type) && (
        <div className="border-t border-border px-4 py-2 shrink-0">
          <Button
            variant="outline"
            className="w-full h-8 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
            onClick={handleBatchAiForQuestion}
            disabled={isBatchAiLoading}
          >
            {isBatchAiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 mr-1" />
            )}
            Évaluer toutes les copies avec l&apos;IA (cette question)
          </Button>
        </div>
      )}
    </div>
  )
}
