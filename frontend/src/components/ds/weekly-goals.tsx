'use client'

import { motion } from 'framer-motion'
import { Target, CheckCircle2, Flame, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from './progress-bar'

/**
 * Objectif hebdomadaire pédagogique.
 */
export interface WeeklyGoal {
  id: string
  /** Libellé de l'objectif (ex: "Compléter 3 examens") */
  label: string
  /** Progression 0-100 */
  progress: number
  /** Icône optionnelle (défaut : Target) */
  icon?: LucideIcon
  /** Accent visuel */
  accent?: 'primary' | 'secondary' | 'success' | 'warning' | 'tech' | 'xp'
  /** Complété (progress >= 100) */
  completed?: boolean
}

export interface WeeklyGoalsProps {
  /** Liste des objectifs de la semaine (3-5 recommandé) */
  goals: WeeklyGoal[]
  /** Streak (jours consécutifs) — affiché dans le header */
  streak?: number
  /** Titre optionnel (défaut: "Objectifs de la semaine") */
  title?: string
  /** Index pour stagger (si dans une grille) */
  index?: number
}

/**
 * WeeklyGoals — Carte des objectifs hebdomadaires (gamification).
 *
 * Affiche une carte "Objectifs de la semaine" avec :
 *   - Header : titre + streak (flamme pulsante si > 0)
 *   - Liste des objectifs avec barres de progression animées
 *   - Chaque objectif : icône + label + barre + pourcentage
 *   - Objectif complété : icône check verte + barre success
 *   - Footer : "X/Y objectifs complétés cette semaine"
 *
 * Design :
 *   - Card-based, radius-lg, shadow-sm, border
 *   - font-display sur le titre, font-mono tabular-nums sur les pourcentages
 *   - Animation Framer Motion : stagger des objectifs à l'entrée
 *   - Streak : flamme pulsante si > 0 (motivation)
 *
 * Usage typique : dashboard étudiant/enseignant.
 *
 * Exigence brief : "Objectifs hebdomadaires" — composant manquant identifié
 * lors de l'audit UX (T11), désormais implémenté.
 */
export function WeeklyGoals({
  goals,
  streak = 0,
  title = 'Objectifs de la semaine',
  index = 0,
}: WeeklyGoalsProps) {
  const completedCount = goals.filter((g) => g.completed || g.progress >= 100).length
  const totalCount = goals.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
      className="p-5 rounded-lg border border-border bg-card shadow-sm ds-kente-top"
    >
      {/* ── Header : titre + streak ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Target className="h-4 w-4 text-primary-text" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight leading-tight">
              {title}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {completedCount}/{totalCount} complétés
            </p>
          </div>
        </div>
        {/* Streak (flamme pulsante si > 0) */}
        {streak > 0 && (
          <motion.div
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Flame className="h-3.5 w-3.5 text-warning" />
            <span className="font-mono text-xs font-semibold tabular-nums text-warning">
              {streak}j
            </span>
          </motion.div>
        )}
      </div>

      {/* ── Liste des objectifs ── */}
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06, delayChildren: index * 0.05 + 0.1 } },
        }}
      >
        {goals.map((goal) => {
          const Icon = goal.icon ?? Target
          const isCompleted = goal.completed || goal.progress >= 100
          const accent = isCompleted ? 'success' : (goal.accent ?? 'primary')
          return (
            <motion.div
              key={goal.id}
              variants={{
                hidden: { opacity: 0, x: -8 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
              }}
            >
              <div className="flex items-center gap-2.5">
                {/* Icône : check si complété, sinon l'icône de l'objectif */}
                <div
                  className={cn(
                    'shrink-0 h-7 w-7 rounded-md flex items-center justify-center',
                    isCompleted ? 'bg-success/10' : 'bg-muted'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-success-text" />
                  ) : (
                    <Icon className={cn(
                      'h-3.5 w-3.5',
                      accent === 'primary' && 'text-primary-text',
                      accent === 'secondary' && 'text-secondary',
                      accent === 'success' && 'text-success-text',
                      accent === 'warning' && 'text-warning',
                      accent === 'tech' && 'text-tech',
                      accent === 'xp' && 'text-xp-text',
                    )} />
                  )}
                </div>

                {/* Label + barre */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      'text-xs font-medium truncate',
                      isCompleted && 'text-muted-foreground line-through'
                    )}>
                      {goal.label}
                    </span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground ml-2 shrink-0">
                      {Math.round(goal.progress)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={goal.progress}
                    accent={accent}
                    size="sm"
                    showGlow={isCompleted}
                  />
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* ── Footer : résumé ── */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {completedCount === totalCount
            ? '🎉 Tous les objectifs complétés !'
            : `${totalCount - completedCount} objectif${totalCount - completedCount > 1 ? 's' : ''} restant${totalCount - completedCount > 1 ? 's' : ''}`}
        </p>
        <span className="font-mono text-xs font-semibold tabular-nums text-primary-text">
          {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%
        </span>
      </div>
    </motion.div>
  )
}
