'use client'

import { type ReactNode } from 'react'
import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { ProgressRing } from './progress-ring'

export interface GradeEntry {
  id: string
  /** Matière (ex: "Mathématiques") */
  subject: string
  /** Titre de l'examen (ex: "Examen final — S1") */
  examTitle: string
  /** Score obtenu */
  score: number
  /** Score maximum possible */
  maxScore: number
  /** ISO date string */
  date: string
  /** Coefficient (poids de l'examen) — défaut 1 */
  coefficient?: number
  /** Commentaire enseignant (optionnel) */
  comment?: string
}

export interface GradeTableProps {
  /** Liste des notes à afficher */
  grades: GradeEntry[]
  /** Afficher la ligne footer avec la moyenne pondérée — défaut true */
  showAverage?: boolean
  /** Callback au clic sur une ligne / carte */
  onRowClick?: (grade: GradeEntry) => void
  /** Classe additionnelle sur le conteneur */
  className?: string
}

/** Niveau de réussite basé sur le ratio score/maxScore. */
type ScoreLevel = 'success' | 'warning' | 'danger'

function getLevel(ratio: number): ScoreLevel {
  if (ratio >= 0.8) return 'success'
  if (ratio >= 0.5) return 'warning'
  return 'danger'
}

/** Map statique niveau → classes badge (Tailwind v4 purge-safe). */
const LEVEL_BADGE: Record<ScoreLevel, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
}

const LEVEL_RING_ACCENT: Record<ScoreLevel, 'success' | 'warning' | 'danger'> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
}

const STAGGER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
}

/** Calcule la moyenne pondérée sur 20. */
function computeWeightedAverage(grades: GradeEntry[]): number {
  if (grades.length === 0) return 0
  let weightedSum = 0
  let totalWeight = 0
  for (const g of grades) {
    const coef = g.coefficient ?? 1
    if (g.maxScore <= 0) continue
    const scoreOn20 = (g.score / g.maxScore) * 20
    weightedSum += scoreOn20 * coef
    totalWeight += coef
  }
  if (totalWeight === 0) return 0
  return weightedSum / totalWeight
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * GradeTable — Tableau des notes premium pour étudiants/enseignants.
 *
 * Affiche les notes avec :
 *   - Desktop : table responsive (shadcn Table) avec colonnes Subject,
 *     Exam, Score (badge coloré), Coefficient, Date, Comment
 *   - Mobile : cartes (chaque note devient une carte)
 *   - Footer : moyenne pondérée /20 avec ProgressRing
 *
 * Design :
 *   - Score sous forme de badge coloré selon le ratio :
 *       ≥ 80% → success (vert), ≥ 50% → warning (ambre), < 50% → danger (rouge)
 *   - Score en `font-mono tabular-nums` pour alignement parfait
 *   - Header `font-display`
 *   - Hover `ds-lift` sur lignes / cartes interactives
 *   - Animation Framer Motion en stagger sur les lignes
 *
 * Accessibilité :
 *   - `<th scope="col">` sur toutes les colonnes
 *   - aria-label sur chaque ligne décrivant matière + score
 *   - role="table" implicite via <table>
 *
 * Performance :
 *   - Respecte prefers-reduced-motion (CSS global)
 *   - Aucune re-render inutile (props immutables recommandées)
 *
 * Usage typique : page "Mes notes", "Bulletins", "Suivi des évaluations".
 */
export function GradeTable({
  grades,
  showAverage = true,
  onRowClick,
  className,
}: GradeTableProps) {
  const average = computeWeightedAverage(grades)
  const averageRingAccent =
    average >= 10 ? 'success' : average >= 5 ? 'warning' : 'danger'

  return (
    <div className={cn('w-full', className)}>
      {/* ── Desktop : table ── */}
      <motion.div
        variants={STAGGER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="hidden md:block"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground"
              >
                Matière
              </TableHead>
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground"
              >
                Examen
              </TableHead>
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground text-right"
              >
                Note
              </TableHead>
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground text-center"
              >
                Coef.
              </TableHead>
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground"
              >
                Date
              </TableHead>
              <TableHead
                scope="col"
                className="font-display text-xs uppercase tracking-wider text-muted-foreground"
              >
                Commentaire
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.map((grade) => {
              const ratio = grade.maxScore > 0 ? grade.score / grade.maxScore : 0
              const level = getLevel(ratio)
              const interactive = !!onRowClick

              return (
                <motion.tr
                  key={grade.id}
                  variants={ROW_VARIANTS}
                  onClick={interactive ? () => onRowClick(grade) : undefined}
                  aria-label={`${grade.subject} — ${grade.examTitle} : ${grade.score}/${grade.maxScore}`}
                  className={cn(
                    'border-b transition-colors',
                    interactive &&
                      'ds-lift cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    !interactive && 'hover:bg-muted/30'
                  )}
                  tabIndex={interactive ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!interactive) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(grade)
                    }
                  }}
                >
                  <TableCell className="font-medium">{grade.subject}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {grade.examTitle}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md font-mono tabular-nums font-semibold text-sm',
                        LEVEL_BADGE[level]
                      )}
                    >
                      {grade.score}
                      <span className="opacity-60 mx-0.5">/</span>
                      {grade.maxScore}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums text-muted-foreground">
                    ×{grade.coefficient ?? 1}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(grade.date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[280px] truncate">
                    {grade.comment || <span className="opacity-40">—</span>}
                  </TableCell>
                </motion.tr>
              )
            })}
          </TableBody>
          {showAverage && grades.length > 0 ? (
            <TableFooter>
              <TableRow className="hover:bg-transparent border-t-2 border-border/60">
                <TableCell
                  colSpan={2}
                  className="font-display font-semibold text-sm uppercase tracking-wider"
                >
                  Moyenne pondérée
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-2">
                    <ProgressRing
                      value={(average / 20) * 100}
                      size={42}
                      strokeWidth={5}
                      accent={averageRingAccent}
                      label={`${average.toFixed(1)}`}
                      showPercent={false}
                      index={0}
                    />
                    <span className="font-mono font-semibold tabular-nums text-sm">
                      <span className="text-muted-foreground">/20</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell colSpan={3} className="text-sm text-muted-foreground">
                  Calculée sur {grades.length} évaluation
                  {grades.length > 1 ? 's' : ''} (coefficients appliqués)
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </motion.div>

      {/* ── Mobile : cartes ── */}
      <motion.div
        variants={STAGGER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 md:hidden"
      >
        {grades.map((grade) => {
          const ratio = grade.maxScore > 0 ? grade.score / grade.maxScore : 0
          const level = getLevel(ratio)
          const interactive = !!onRowClick

          return (
            <motion.div
              key={grade.id}
              variants={ROW_VARIANTS}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={`${grade.subject} — ${grade.examTitle} : ${grade.score}/${grade.maxScore}`}
              onClick={interactive ? () => onRowClick(grade) : undefined}
              onKeyDown={(e) => {
                if (!interactive) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onRowClick(grade)
                }
              }}
              className={cn(
                'rounded-lg border border-border bg-card p-4 shadow-sm',
                interactive &&
                  'ds-lift cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-sm leading-tight truncate">
                    {grade.subject}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {grade.examTitle}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center px-2 py-0.5 rounded-md font-mono tabular-nums font-semibold text-sm',
                    LEVEL_BADGE[level]
                  )}
                >
                  {grade.score}
                  <span className="opacity-60 mx-0.5">/</span>
                  {grade.maxScore}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Coef. ×{grade.coefficient ?? 1} · {formatDate(grade.date)}
                </span>
              </div>
              {grade.comment ? (
                <p className="mt-2 text-xs text-muted-foreground border-t border-border/40 pt-2 line-clamp-2">
                  {grade.comment}
                </p>
              ) : null}
            </motion.div>
          )
        })}

        {showAverage && grades.length > 0 ? (
          <MobileAverageCard
            average={average}
            count={grades.length}
            accent={LEVEL_RING_ACCENT[
              average >= 10 ? 'success' : average >= 5 ? 'warning' : 'danger'
            ]}
          />
        ) : null}
      </motion.div>

      {grades.length === 0 ? (
        <EmptyState />
      ) : null}
    </div>
  )
}

/** Carte moyenne pondérée pour le mobile. */
function MobileAverageCard({
  average,
  count,
  accent,
}: {
  average: number
  count: number
  accent: 'success' | 'warning' | 'danger'
}): ReactNode {
  return (
    <motion.div
      variants={ROW_VARIANTS}
      className="rounded-lg border-2 border-border/60 bg-muted/30 p-4 flex items-center gap-4"
    >
      <ProgressRing
        value={(average / 20) * 100}
        size={56}
        strokeWidth={6}
        accent={accent}
        label={`${average.toFixed(1)}`}
        showPercent={false}
        index={0}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold text-sm uppercase tracking-wider">
          Moyenne pondérée
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sur {count} évaluation{count > 1 ? 's' : ''} ·{' '}
          <span className="font-mono tabular-nums">
            {average.toFixed(2)}/20
          </span>
        </p>
      </div>
    </motion.div>
  )
}

function EmptyState(): ReactNode {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <p className="font-display text-sm font-semibold text-muted-foreground">
        Aucune note à afficher
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Les évaluations apparaîtront ici dès qu'elles seront corrigées.
      </p>
    </div>
  )
}
