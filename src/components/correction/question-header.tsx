'use client'

import { PenTool, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CorrectionSession } from '@/types/correction'
import {
  getCorrectionBadge,
  getDifficulteDotColor,
  getDifficulteLabel,
  getQuestionTypeLabel,
  isAutoGradedType,
} from '@/lib/correction-utils'

/**
 * En-tête compact de la question courante (mode par-copie) : numéro, type,
 * barème, difficulté et badge de mode de correction (Auto / Auto+ / Manuel).
 *
 * Extrait de correction-page.tsx (phase 3, commit 1).
 * JSX strictement identique à l'original `renderQuestionHeader()` (L876-906).
 */
export function QuestionHeader({
  currentQuestion,
  currentQuestionIndex,
}: {
  currentQuestion: CorrectionSession['epreuve']['questions'][number] | null
  currentQuestionIndex: number
}) {
  if (!currentQuestion) return null
  // E2E-CORRECTION-FIX : fallback currentQuestion si .question undefined
  const q = currentQuestion.question ?? (currentQuestion as unknown as {
    type: string
    difficulte?: string
  })
  const correctionBadge = getCorrectionBadge(q.type)

  return (
    <div className="border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-foreground">Q{currentQuestionIndex + 1}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{getQuestionTypeLabel(q.type)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-xs font-semibold text-success-text font-mono tabular-nums">{currentQuestion.bareme}pts</span>
        <span className="text-muted-foreground">·</span>
        <span className="flex items-center gap-1 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${getDifficulteDotColor(q.difficulte)}`} />
          {getDifficulteLabel(q.difficulte)}
        </span>
        <Badge variant="outline" className={`text-[10px] h-5 ml-auto ${correctionBadge.classes}`}>
          {isAutoGradedType(q.type) ? <Zap className="h-2.5 w-2.5 mr-0.5" /> : <PenTool className="h-2.5 w-2.5 mr-0.5" />}
          {correctionBadge.label}
        </Badge>
      </div>
    </div>
  )
}
