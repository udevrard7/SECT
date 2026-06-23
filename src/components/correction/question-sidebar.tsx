'use client'

import { FileCheck } from 'lucide-react'
import type { CorrectionSession } from '@/types/correction'
import { getQuestionTypeLabel, isAutoGradedType } from '@/lib/correction-utils'

/**
 * Sidebar des questions pour le mode par-question : liste les questions de
 * l'épreuve (issues de la première session) avec indicateur de progression
 * (corrigées / total) et code couleur auto/manuelle.
 *
 * Extrait de correction-page.tsx (phase 3, commit 1).
 * JSX strictement identique à l'original `renderQuestionSidebar()` (L824-873).
 */
export function QuestionSidebar({
  horizontalQuestions,
  horizontalQuestionIndex,
  sessions,
  onSelectQuestion,
  isLoadingSessions,
}: {
  horizontalQuestions: CorrectionSession['epreuve']['questions']
  horizontalQuestionIndex: number
  sessions: CorrectionSession[]
  onSelectQuestion: (index: number) => void
  isLoadingSessions: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="space-y-0.5 px-1">
        {horizontalQuestions.map((q, idx) => {
          const isCurrent = idx === horizontalQuestionIndex
          const graded = sessions.filter((s) => {
            const rep = s.reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
            return rep?.score !== null && rep?.score !== undefined
          }).length
          const total = sessions.length
          const isComplete = graded === total
          const isAutoGraded = isAutoGradedType(q.question.type)

          return (
            <button
              key={q.id}
              onClick={() => onSelectQuestion(idx)}
              className={`w-full text-left rounded-md px-2.5 py-2 transition-all flex items-center gap-2.5 ${
                isCurrent
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-300 dark:ring-emerald-700'
                  : 'hover:bg-muted/60'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                isAutoGraded ? 'bg-sky-500' : isComplete ? 'bg-emerald-500' : graded > 0 ? 'bg-amber-500' : 'bg-muted-foreground/40'
              }`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
                  Q{idx + 1} — {getQuestionTypeLabel(q.question.type)}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {graded}/{total}
              </span>
            </button>
          )
        })}
      </div>
      {horizontalQuestions.length === 0 && !isLoadingSessions && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <FileCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Aucune question</p>
        </div>
      )}
    </div>
  )
}
