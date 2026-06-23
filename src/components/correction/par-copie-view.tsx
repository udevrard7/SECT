'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { RefObject } from 'react'
import {
  PenTool,
  Check,
  AlertTriangle,
  Loader2,
  User,
  Award,
  Zap,
  FileText,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { CodingCorrection } from '@/components/coding/coding-correction'
import {
  type CodingLanguage,
  parseCodingAnswer,
} from '@/lib/coding-types'
import type { CorrectionSession, RubricCriterion } from '@/types/correction'
import {
  isAutoGradedType,
  isSemiAutoGradedType,
  getScoreColor,
  parseAnswerContent,
} from '@/lib/correction-utils'
import { ScoreCircle } from '@/components/correction/score-circle'
import { QuestionHeader } from '@/components/correction/question-header'
import { AiSuggestionPanel } from '@/components/correction/ai-suggestion-panel'
import { GradingForm } from '@/components/correction/grading-form'

/**
 * Vue "par copie" de la correction : un étudiant à la fois, navigation entre
 * ses questions. Contient la barre d'info étudiant, l'en-tête de question,
 * la zone scrollable (énoncé, réponse attendue, réponse étudiant, commentaire
 * existant, suggestion IA, avis auto/semi-auto, formulaire de notation) et la
 * navigation sticky en bas + barre de finalisation.
 *
 * Extrait de correction-page.tsx (phase 3, commit 3).
 * JSX strictement identique à l'original `renderParCopieContent()`.
 * La logique métier (state, handlers, useMemo, refs) reste dans
 * correction-page.tsx et est passée via props typées.
 */
export function ParCopieView({
  selectedSession,
  selectedSessionId,
  questions,
  currentQuestion,
  currentQuestionIndex,
  currentReponse,
  totalQuestions,
  manualCorrectedCount,
  noteFinale,
  commentaire,
  selectedCriteria,
  currentRubricCriteria,
  computedScore,
  showAiSuggestion,
  aiSuggestionOpen,
  expectedAnswerOpen,
  isAiLoading,
  isSaving,
  isApplyingAi,
  isFinalizing,
  mainContentRef,
  setNoteFinale,
  setCommentaire,
  setAiSuggestionOpen,
  setExpectedAnswerOpen,
  handleToggleCriterion,
  handleAiGrade,
  handleSave,
  handleApplyAi,
  handleDismissAi,
  handleFinalize,
  goToQuestion,
}: {
  selectedSession: CorrectionSession | null
  selectedSessionId: string | null
  questions: CorrectionSession['epreuve']['questions']
  currentQuestion: CorrectionSession['epreuve']['questions'][number] | null
  currentQuestionIndex: number
  currentReponse: CorrectionSession['reponses'][number] | null
  totalQuestions: number
  manualCorrectedCount: number
  noteFinale: string
  commentaire: string
  selectedCriteria: Set<string>
  currentRubricCriteria: RubricCriterion[]
  computedScore: number
  showAiSuggestion: boolean
  aiSuggestionOpen: boolean
  expectedAnswerOpen: boolean
  isAiLoading: boolean
  isSaving: boolean
  isApplyingAi: boolean
  isFinalizing: boolean
  mainContentRef: RefObject<HTMLDivElement | null>
  setNoteFinale: (value: string) => void
  setCommentaire: (value: string) => void
  setAiSuggestionOpen: (open: boolean) => void
  setExpectedAnswerOpen: (open: boolean) => void
  handleToggleCriterion: (id: string) => void
  handleAiGrade: () => void
  handleSave: (sessionId?: string, questionId?: string, score?: number, comment?: string) => Promise<void>
  handleApplyAi: () => void
  handleDismissAi: () => void
  handleFinalize: () => void
  goToQuestion: (index: number) => void
}) {
  if (!selectedSession) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted">
            <PenTool className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Sélectionnez une copie</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Choisissez un étudiant dans le panneau latéral pour commencer la correction.
          </p>
        </div>
      </div>
    )
  }

  if (selectedSession.statut === 'RETOURNEE') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="text-center max-w-sm">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
            <Check className="h-8 w-8 text-teal-500 dark:text-teal-400" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Copie rendue</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            La copie de {selectedSession.etudiant.name} a été corrigée et rendue.
          </p>
          <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm">
              Score final :{' '}
              <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>
                {selectedSession.score?.toFixed(1) ?? '—'} pts
              </span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (totalQuestions === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Check className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Toutes les questions sont corrigées</h3>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => handleFinalize()}
            disabled={isFinalizing}
          >
            {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
            Finaliser et rendre
          </Button>
        </div>
      </div>
    )
  }

  const q = currentQuestion?.question
  if (!q || !currentQuestion) return null

  const answerContent = parseAnswerContent(currentReponse?.contenu)
  const expectedAnswer = typeof q.reponseCorrecte === 'string'
    ? q.reponseCorrecte
    : Array.isArray(q.reponseCorrecte)
      ? q.reponseCorrecte.join(', ')
      : ''

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Student info bar */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{selectedSession.etudiant.name}</p>
            <p className="text-[10px] text-muted-foreground">{selectedSession.etudiant.email}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-6 hidden sm:block" />
        <Badge
          variant="outline"
          className={
            selectedSession.statut === 'CORRIGEE'
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800 text-[10px] h-5'
              : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 text-[10px] h-5'
          }
        >
          {selectedSession.statut === 'CORRIGEE' ? 'Corrigée' : 'En correction'}
        </Badge>
        <div className="flex items-center gap-1.5 text-xs">
          <Award className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className={`font-bold ${getScoreColor(selectedSession.score ?? 0, selectedSession.autoGradedTotal > 0 ? selectedSession.autoGradedTotal : 20)}`}>
              {selectedSession.score !== null ? selectedSession.score.toFixed(1) : '—'}
            </span>
            <span className="text-muted-foreground"> pts</span>
          </span>
        </div>
        {selectedSession.autoGradedTotal > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3 text-sky-500" />
            Auto: {selectedSession.autoGradedScore.toFixed(1)}/{selectedSession.autoGradedTotal.toFixed(1)}
          </div>
        )}
        {selectedSession.alertes > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 gap-0.5">
            <AlertTriangle className="h-3 w-3" />
            {selectedSession.alertes}
          </Badge>
        )}
        {/* Progress */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{manualCorrectedCount}/{totalQuestions}</span>
          <Progress value={totalQuestions > 0 ? (manualCorrectedCount / totalQuestions) * 100 : 0} className="w-16 h-1.5" />
        </div>
      </div>

      {/* Question header */}
      <QuestionHeader
        currentQuestion={currentQuestion}
        currentQuestionIndex={currentQuestionIndex}
      />

      {/* Scrollable content */}
      <ScrollArea className="flex-1 min-h-0" ref={mainContentRef}>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`content-${currentQuestionIndex}-${selectedSessionId}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {/* Énoncé */}
              <div className="rounded-lg bg-muted/50 border border-border p-3">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.enonce}</p>
              </div>

              {/* Réponse attendue (collapsible) */}
              {expectedAnswer && (
                <Collapsible open={expectedAnswerOpen} onOpenChange={setExpectedAnswerOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 transition-colors">
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Réponse attendue
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 ml-auto text-emerald-600 dark:text-emerald-400 transition-transform ${expectedAnswerOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-b-lg border border-t-0 border-emerald-200 bg-emerald-50/30 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/10">
                      <p className="text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                        {expectedAnswer}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Réponse de l'étudiant */}
              {q.type === 'CODE' ? (
                <CodingCorrection
                  questionId={currentQuestion.questionId}
                  enonce={q.enonce}
                  langage={(q.langage || 'python') as CodingLanguage}
                  fonctionSignature={q.fonctionSignature || ''}
                  testsPublics={q.testsPublics || []}
                  testsPrives={q.testsPrives || []}
                  bareme={currentQuestion.bareme}
                  reponseCorrecte={typeof q.reponseCorrecte === 'string' ? q.reponseCorrecte : ''}
                  studentAnswer={parseCodingAnswer(currentReponse?.contenu || null)}
                  scoreAuto={currentReponse?.score ?? undefined}
                  noteIA={currentReponse?.noteIA ?? undefined}
                  justificationIA={currentReponse?.justificationIA ?? undefined}
                  scoreFinal={currentReponse?.score ?? undefined}
                  commentaireEnseignant={currentReponse?.commentaire ?? undefined}
                  onSaveScore={async (_questionId, score, comment) => {
                    await handleSave(selectedSessionId ?? undefined, _questionId, score, comment)
                  }}
                />
              ) : (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">
                        Réponse de l&apos;étudiant
                      </span>
                    </div>
                    {currentReponse?.score !== null && currentReponse?.score !== undefined && (
                      <ScoreCircle score={currentReponse.score} total={currentQuestion.bareme} size="sm" />
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {answerContent}
                  </p>
                </div>
              )}

              {/* Existing commentaire */}
              {currentReponse?.commentaire && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5 dark:border-teal-800 dark:bg-teal-950/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                    <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                      Commentaire existant
                    </span>
                  </div>
                  <p className="text-xs text-teal-900 dark:text-teal-100 whitespace-pre-wrap">
                    {currentReponse.commentaire}
                  </p>
                </div>
              )}

              {/* AI Suggestion (collapsible) */}
              {showAiSuggestion && currentReponse?.noteIA !== null && currentReponse?.noteIA !== undefined && !isAutoGradedType(q.type) && (
                <AiSuggestionPanel
                  variant="collapsible"
                  noteIA={currentReponse.noteIA}
                  bareme={currentQuestion.bareme}
                  justificationIA={currentReponse.justificationIA}
                  onApply={handleApplyAi}
                  isApplying={isApplyingAi}
                  isOpen={aiSuggestionOpen}
                  onOpenChange={setAiSuggestionOpen}
                  onDismiss={handleDismissAi}
                />
              )}

              {/* Auto-graded notice */}
              {isAutoGradedType(q.type) && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800">
                  <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Question auto-corrigée</p>
                    <p className="text-[10px] text-sky-600 dark:text-sky-300">
                      Score automatique : {currentReponse?.score ?? '—'} / {currentQuestion.bareme}
                    </p>
                  </div>
                </div>
              )}

              {/* Semi-auto (CODE) notice — CodingCorrection handles the grading UI */}
              {isSemiAutoGradedType(q.type) && currentReponse?.score !== null && currentReponse?.score !== undefined && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800">
                  <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">Question auto+corrigée</p>
                    <p className="text-[10px] text-violet-600 dark:text-violet-300">
                      Score auto-calculé : {currentReponse.score} / {currentQuestion.bareme} — Vous pouvez modifier la note ci-dessus
                    </p>
                  </div>
                </div>
              )}

              {/* Grading section — only for non-auto, non-CODE questions */}
              {!isAutoGradedType(q.type) && !isSemiAutoGradedType(q.type) && (
                <GradingForm
                  variant="par-copie"
                  bareme={currentQuestion.bareme}
                  rubricCriteria={currentRubricCriteria}
                  selectedCriteria={selectedCriteria}
                  onToggleCriterion={handleToggleCriterion}
                  noteFinale={noteFinale}
                  onNoteChange={setNoteFinale}
                  commentaire={commentaire}
                  onCommentChange={setCommentaire}
                  computedScore={computedScore}
                  onSave={() => handleSave()}
                  isSaving={isSaving}
                  onAiGrade={() => handleAiGrade()}
                  isAiLoading={isAiLoading}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Sticky bottom navigation */}
      <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goToQuestion(currentQuestionIndex - 1)}
          disabled={currentQuestionIndex === 0}
          className="h-7 text-xs gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Préc.
        </Button>

        {/* Question dots */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-[60%] px-2">
          {questions.map((q, idx) => {
            const rep = selectedSession?.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
            const isCurrent = idx === currentQuestionIndex
            const isCorrected = rep?.score !== null && rep?.score !== undefined

            let dotClass = 'bg-muted text-muted-foreground border-border'
            if (isCurrent) {
              dotClass = 'bg-emerald-600 text-white border-emerald-600'
            } else if (!isCorrected) {
              dotClass = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
            } else {
              dotClass = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
            }

            return (
              <button
                key={q.id}
                onClick={() => goToQuestion(idx)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors ${dotClass}`}
                title={`Question ${idx + 1}`}
              >
                {idx + 1}
              </button>
            )
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => goToQuestion(currentQuestionIndex + 1)}
          disabled={currentQuestionIndex >= totalQuestions - 1}
          className="h-7 text-xs gap-1"
        >
          Suiv.
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Finalize bar */}
      {selectedSession.allCorrected && selectedSession.statut !== 'RETOURNEE' && (
        <div className="border-t border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            Toutes les questions sont corrigées
          </span>
          <Button
            size="sm"
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={() => handleFinalize()}
            disabled={isFinalizing}
          >
            {isFinalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Finaliser et rendre
          </Button>
        </div>
      )}
    </div>
  )
}
