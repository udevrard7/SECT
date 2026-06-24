/**
 * Design System — Barrel export.
 *
 * Import centralisé pour tous les composants du Design System SECT.
 *
 * Usage :
 *   import { AppShell, StatCard, EntityCard, ProgressRing } from '@/components/ds'
 *
 * Tokens & utilitaires CSS : voir src/app/globals.css (section DESIGN SYSTEM).
 *   - Couleurs sémantiques : bg-primary, text-success, border-warning…
 *   - Tiers gamification : bg-bronze, text-gold, ds-glow-platinum…
 *   - Glassmorphism : classe .ds-glass
 *   - Hover lift : classe .ds-lift
 *   - Fonts : font-sans (Inter), font-mono (JetBrains Mono), font-display
 *   - Radius : rounded-sm/md/lg/xl/full (6/10/16/24px)
 */

export { AppShell, type NavItem, type NavSection, type AppShellProps } from './app-shell'
export { StatCard, type StatCardProps, type StatTrend } from './stat-card'
export { EntityCard, type EntityCardProps } from './entity-card'
export { UserStats, type UserStatsData, type UserStatsProps, type GamificationTier } from './user-stats'
export { GlassModal, type GlassModalProps } from './glass-modal'
export { ProgressRing, type ProgressRingProps } from './progress-ring'
export { RewardToast, type RewardToastProps } from './reward-toast'
export { PulseSkeleton, type PulseSkeletonProps, StatCardSkeletonGrid } from './pulse-skeleton'
export { BadgeCard, type BadgeCardProps, type BadgeData } from './badge-card'
export {
  RewardCenter,
  type RewardCenterProps,
  type Reward,
  type UserProgress,
} from './reward-center'
export {
  AcademicCalendar,
  type AcademicCalendarProps,
  type CalendarEvent,
} from './academic-calendar'
export { DesignSystemShowcase } from './showcase'
export {
  GradeTable,
  type GradeEntry,
  type GradeTableProps,
} from './grade-table'
export {
  AIAssistant,
  type AIAssistantMessage,
  type AIAssistantProps,
} from './ai-assistant'
export {
  ProgressBar,
  type ProgressBarAccent,
  type ProgressBarProps,
} from './progress-bar'
export {
  WeeklyGoals,
  type WeeklyGoal,
  type WeeklyGoalsProps,
} from './weekly-goals'
