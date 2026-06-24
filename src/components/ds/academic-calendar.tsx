'use client'

import { useState, useMemo, useCallback, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  /** Identifiant unique de l'événement */
  id: string
  /** Date de l'événement (le jour est utilisé, l'heure ignorée) */
  date: Date
  /** Titre court (tooltip / ARIA) */
  title: string
  /** Type d'événement académique */
  type: 'exam' | 'deadline' | 'course' | 'holiday'
  /** Couleur personnalisée (override la couleur par type) — toute valeur CSS valide */
  color?: string
}

export interface AcademicCalendarProps {
  /** Liste des événements à afficher */
  events: CalendarEvent[]
  /** Mois affiché (défaut : mois courant). Si modifié, le composant se resynchronise. */
  month?: Date
  /** Callback au clic sur un jour */
  onDateClick?: (date: Date) => void
  /** ClassName supplémentaire sur le conteneur */
  className?: string
}

/* ── Constantes ── */

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const
const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const

/** Couleur du point par type d'événement (maps statiques — Tailwind v4 ne génère pas les classes dynamiques) */
const TYPE_DOT_BG: Record<CalendarEvent['type'], string> = {
  exam: 'bg-destructive',
  deadline: 'bg-warning',
  course: 'bg-primary',
  holiday: 'bg-success',
}

const TYPE_LABEL: Record<CalendarEvent['type'], string> = {
  exam: 'Examen',
  deadline: 'Échéance',
  course: 'Cours',
  holiday: 'Férié',
}

/* ── Helpers ── */

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Construit la matrice 6×7 (42 cellules) d'un mois, en commençant par lundi */
function buildMonthMatrix(viewDate: Date): Date[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  // getDay(): 0=Dim, 1=Lun, …, 6=Sam. On veut lundi=0 → décalage.
  const firstOfMonth = new Date(year, month, 1)
  const offset = (firstOfMonth.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return cells
}

/**
 * AcademicCalendar — Widget calendrier mensuel des événements académiques.
 *
 * Affichage :
 *   - En-tête : titre du mois (font-display) + navigation prev/next
 *   - Grille 7 colonnes, en-têtes de jours (Lun–Dim)
 *   - Jour courant surligné : `bg-primary text-primary-foreground`
 *   - Points colorés sous chaque date (couleur par type d'événement)
 *   - Jours hors-mois atténués
 *
 * Responsive :
 *   - Mobile-first : grille compacte, min touch target 44px (hauteur)
 *   - Desktop : élargit via `gap-2` et `text-sm`
 *
 * Animations Framer Motion :
 *   - Changement de mois via AnimatePresence (slide horizontal selon direction)
 *
 * Accessibilité :
 *   - role="application" + aria-label sur le conteneur
 *   - role="grid" / role="gridcell" + roving tabindex
 *   - Navigation clavier : ← ↑ → ↓ (déplace le focus), Entrée/Espace (clic),
 *     PageUp/PageDown (mois précédent/suivant)
 *   - aria-current="date" sur aujourd'hui
 *
 * @example
 * <AcademicCalendar
 *   events={[
 *     { id: '1', date: new Date(2024, 2, 15), title: 'Examen final', type: 'exam' },
 *     { id: '2', date: new Date(2024, 2, 20), title: 'Rendu projet', type: 'deadline' },
 *   ]}
 *   onDateClick={(d) => console.log(d)}
 * />
 */
export function AcademicCalendar({
  events,
  month,
  onDateClick,
  className,
}: AcademicCalendarProps) {
  const today = useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = useState<Date>(() => month ?? today)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [focusedDate, setFocusedDate] = useState<Date>(() => month ?? today)
  const [prevMonthProp, setPrevMonthProp] = useState<Date | undefined>(month)
  const gridRef = useRef<HTMLDivElement>(null)

  // Re-synchronise la vue si la prop `month` change depuis l'extérieur.
  // Pattern React recommandé : "storing information from previous renders"
  // (pas d'effet — évite les cascading renders signalés par react-hooks/set-state-in-effect).
  if (month && prevMonthProp !== month && !isSameMonth(month, viewDate)) {
    setPrevMonthProp(month)
    setDirection(month > viewDate ? 1 : -1)
    setViewDate(new Date(month.getFullYear(), month.getMonth(), 1))
    setFocusedDate(month)
  }

  // Index des événements par jour (clé YYYY-M-D → events[])
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = dayKey(e.date)
      let arr = map.get(key)
      if (!arr) {
        arr = []
        map.set(key, arr)
      }
      arr.push(e)
    }
    return map
  }, [events])

  const cells = useMemo(() => buildMonthMatrix(viewDate), [viewDate])

  const goToPrevMonth = useCallback(() => {
    setDirection(-1)
    setViewDate((d) => {
      const next = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      setFocusedDate(next)
      return next
    })
  }, [])

  const goToNextMonth = useCallback(() => {
    setDirection(1)
    setViewDate((d) => {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      setFocusedDate(next)
      return next
    })
  }, [])

  const monthLabel = `${MONTH_LABELS[viewDate.getMonth()]} ${viewDate.getFullYear()}`

  // Navigation clavier (roving tabindex pattern)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      let next: Date | null = null
      switch (e.key) {
        case 'ArrowLeft':
          next = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), focusedDate.getDate() - 1)
          break
        case 'ArrowRight':
          next = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), focusedDate.getDate() + 1)
          break
        case 'ArrowUp':
          next = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), focusedDate.getDate() - 7)
          break
        case 'ArrowDown':
          next = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), focusedDate.getDate() + 7)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          onDateClick?.(focusedDate)
          return
        case 'PageUp':
          e.preventDefault()
          goToPrevMonth()
          return
        case 'PageDown':
          e.preventDefault()
          goToNextMonth()
          return
        case 'Home':
          e.preventDefault()
          setFocusedDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1))
          return
        case 'End':
          e.preventDefault()
          setFocusedDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0))
          return
        default:
          return
      }
      if (next) {
        e.preventDefault()
        setFocusedDate(next)
        if (!isSameMonth(next, viewDate)) {
          setDirection(next > viewDate ? 1 : -1)
          setViewDate(new Date(next.getFullYear(), next.getMonth(), 1))
        }
      }
    },
    [focusedDate, viewDate, onDateClick, goToPrevMonth, goToNextMonth]
  )

  // Variants pour la grille (slide horizontal selon la direction + stagger des cellules)
  // `custom` prop permet de passer `direction` aux fonctions de variant.
  const gridVariants = {
    hidden: (dir: number) => ({ opacity: 0, x: dir * 24 }),
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.22, ease: 'easeOut' as const, staggerChildren: 0.008 },
    },
    exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: { duration: 0.18, ease: 'easeOut' as const } }),
  }
  const cellVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
  }

  return (
    <div
      role="application"
      aria-label={`Calendrier académique — ${monthLabel}`}
      className={cn(
        'p-4 rounded-lg border border-border bg-card shadow-sm',
        className
      )}
    >
      {/* ── Header : navigation + titre du mois ── */}
      <header className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Mois précédent"
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <h3 className="font-display text-base sm:text-lg font-semibold tracking-tight">
          {monthLabel}
        </h3>

        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Mois suivant"
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* ── En-têtes des jours ── */}
      <div className="grid grid-cols-7 gap-1 mb-1" role="row">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground text-center font-semibold py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Grille des jours (avec slide horizontal au changement de mois) ── */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}
            custom={direction}
            variants={gridVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="grid grid-cols-7 gap-1"
          >
            {cells.map((date) => {
              const inMonth = isSameMonth(date, viewDate)
              const isToday = isSameDay(date, today)
              const dayEvents = eventsByDay.get(dayKey(date)) ?? []
              const isFocused = isSameDay(date, focusedDate)
              const visibleDots = dayEvents.slice(0, 3)
              const extraCount = dayEvents.length - visibleDots.length

              const ariaLabelParts: string[] = [
                `${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
              ]
              if (isToday) ariaLabelParts.push("aujourd'hui")
              if (dayEvents.length > 0) {
                ariaLabelParts.push(
                  `${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''}: ${dayEvents
                    .map((ev) => `${ev.title} (${TYPE_LABEL[ev.type]})`)
                    .join(', ')}`
                )
              }

              return (
                <motion.div
                  key={dayKey(date)}
                  variants={cellVariants}
                  role="gridcell"
                  tabIndex={isFocused ? 0 : -1}
                  aria-selected={isFocused}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={ariaLabelParts.join(', ')}
                  onClick={onDateClick ? () => onDateClick(date) : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center',
                    'min-h-[44px] rounded-md text-xs sm:text-sm',
                    'font-mono tabular-nums transition-colors',
                    'focus:outline-none',
                    isToday
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground/40',
                    !isToday && 'hover:bg-accent',
                    isFocused && !isToday && 'ring-2 ring-ring ring-offset-1 ring-offset-card',
                    onDateClick && 'cursor-pointer'
                  )}
                >
                  <span className="leading-none">{date.getDate()}</span>

                  {/* Points d'événements */}
                  {dayEvents.length > 0 && (
                    <div
                      className="absolute bottom-1 flex items-center gap-0.5"
                      aria-hidden="true"
                    >
                      {visibleDots.map((ev, i) => (
                        <span
                          key={`${ev.id}-${i}`}
                          className={cn(
                            'h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full',
                            !ev.color && TYPE_DOT_BG[ev.type]
                          )}
                          style={
                            ev.color ? { backgroundColor: ev.color } : undefined
                          }
                        />
                      ))}
                      {extraCount > 0 && (
                        <span className="text-[8px] leading-none text-muted-foreground ml-0.5 font-sans">
                          +{extraCount}
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Légende des types ── */}
      <div
        className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1.5"
        aria-label="Légende des types d'événements"
      >
        {(Object.keys(TYPE_DOT_BG) as CalendarEvent['type'][]).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span className={cn('h-2 w-2 rounded-full', TYPE_DOT_BG[t])} aria-hidden="true" />
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>
    </div>
  )
}
