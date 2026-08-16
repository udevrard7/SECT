// ─────────────────────────────────────────────────────────────
// ScoreDisplay — affichage unifié du score (noteTotal-aware)
// Gère les scénarios A (100% auto) / B (mixte) / en attente
// Déduplique la logique entre cartes et dialog.
// ─────────────────────────────────────────────────────────────

'use client'

import { Trophy, Clock, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  getScoreColor,
  getScoreBg,
  getBarColor,
  scoreToPercentage,
  normalizeTo20,
} from '@/lib/resultats-utils'
import type { StudentSession } from '@/types/resultats'

interface ScoreDisplayProps {
  session: StudentSession
  variant?: 'card' | 'compact' | 'hero'
  showStatus?: boolean
}

const MANUAL_TYPES = ['QRC', 'TRS', 'REFLEXION']
const AUTO_TYPES = ['QCU', 'QCM']

export function ScoreDisplay({
  session,
  variant = 'card',
  showStatus = true,
}: ScoreDisplayProps) {
  const score = session.resultat?.scoreFinal ?? session.score ?? 0
  const noteTotal = session.epreuve.noteTotal ?? session.resultat?.totalPossible ?? 20
  const percentage = scoreToPercentage(score, noteTotal)
  const scoreOn20 = normalizeTo20(score, noteTotal)
  const isCorrected = session.statut === 'CORRIGEE'
  const isReturned = session.statut === 'RETOURNEE'

  // Détection Scénario A (100% auto) vs B (mixte)
  const hasManualQuestions = session.epreuve.questions?.some((eq) =>
    MANUAL_TYPES.includes(eq.question.type)
  )
  const isScenarioB = !!hasManualQuestions

  const autoGradableTotal =
    session.epreuve.questions
      ?.filter((eq) => AUTO_TYPES.includes(eq.question.type))
      .reduce((sum, eq) => sum + eq.bareme, 0) ?? 0
  const manualQuestionCount =
    session.epreuve.questions?.filter((eq) =>
      MANUAL_TYPES.includes(eq.question.type)
    ).length ?? 0

  // Affichage du score final si corrigé/rendu, sinon partiel si Scénario B
  const canSeeFinalScore = isReturned || isCorrected
  const canSeePartialScore =
    isScenarioB && !isCorrected && !isReturned && autoGradableTotal > 0

  const barColor = getBarColor(scoreOn20)
  const scoreColor = getScoreColor(scoreOn20)
  const scoreBg = getScoreBg(scoreOn20)

  // ─── Variant hero (dialog header) ───
  if (variant === 'hero') {
    return (
      <div className="flex items-center gap-4 rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
        {/* Score circulaire SVG */}
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/40" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={barColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(percentage / 100) * 213.6} 213.6`}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className={`text-lg font-bold ${scoreColor}`}>{percentage}%</span>
          </div>
        </div>
        <div className="flex-1">
          {canSeeFinalScore ? (
            <>
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${scoreColor}`}>
                  {score.toFixed(1)}
                  <span className="text-base font-normal text-muted-foreground">/{noteTotal}</span>
                </span>
                <Badge variant="outline" className={scoreBg}>
                  {scoreOn20.toFixed(1)}/20 équivalent
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Note finale · scale /{noteTotal}
              </p>
            </>
          ) : canSeePartialScore ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${scoreColor}`}>
                  {score.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">/{autoGradableTotal}</span>
                </span>
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-xs">
                  Provisoire
                </Badge>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                En attente de correction manuelle ({manualQuestionCount} question{manualQuestionCount > 1 ? 's' : ''})
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-700 dark:text-amber-400">
                En attente de correction
              </span>
            </div>
          )}
          {showStatus && (
            <div className="mt-2 flex items-center gap-2">
              {isReturned ? (
                <Badge className="bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Rendu
                </Badge>
              ) : isCorrected ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Corrigé
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
                  <Clock className="h-3 w-3" /> En attente
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Variant compact (KPI / liste courte) ───
  if (variant === 'compact') {
    if (!canSeeFinalScore && !canSeePartialScore) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <Clock className="h-3 w-3" /> En attente
        </span>
      )
    }
    return (
      <span className={`text-sm font-bold ${scoreColor}`}>
        {score.toFixed(1)}
        <span className="text-xs font-normal text-muted-foreground">
          /{canSeePartialScore ? autoGradableTotal : noteTotal}
        </span>
      </span>
    )
  }

  // ─── Variant card (défaut, carte de liste) ───
  return (
    <div className="space-y-2">
      {canSeeFinalScore ? (
        <>
          <div className="flex items-center gap-3">
            <span className={`text-3xl font-bold ${scoreColor}`}>
              {score.toFixed(1)}
              <span className="text-lg text-muted-foreground">/{noteTotal}</span>
            </span>
            <Badge variant="outline" className={`font-bold px-3 py-1 ${scoreBg}`}>
              {percentage}%
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${percentage}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
        </>
      ) : canSeePartialScore ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {score.toFixed(1)}
              <span className="text-sm text-muted-foreground">/{autoGradableTotal}</span>
            </span>
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-xs">
              Provisoire
            </Badge>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
            <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              En attente de la correction manuelle de l&apos;enseignant pour {manualQuestionCount} question{manualQuestionCount > 1 ? 's' : ''} ouverte{manualQuestionCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-400">
            En attente de correction
          </span>
        </div>
      )}
    </div>
  )
}
