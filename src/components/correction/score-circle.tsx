'use client'

import { getScoreCircleColor } from '@/lib/correction-utils'

/**
 * Cercle de score coloré (ratio-based) utilisé dans la page Correction.
 * Extrait de correction-page.tsx (phase 1 modularisation — voir worklog T2).
 */
export function ScoreCircle({
  score,
  total,
  size = 'md',
}: {
  score: number | null
  total: number
  size?: 'sm' | 'md' | 'lg'
}) {
  const displayScore = score ?? 0
  const sizeClasses =
    size === 'sm'
      ? 'h-7 w-7 text-[11px]'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-9 w-9 text-xs'
  const colorClasses =
    score !== null
      ? getScoreCircleColor(displayScore, total)
      : 'bg-muted text-muted-foreground border-border'

  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 font-bold shrink-0 ${sizeClasses} ${colorClasses}`}
    >
      {score !== null ? displayScore : '—'}
    </div>
  )
}
