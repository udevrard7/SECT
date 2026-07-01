/**
 * Design System  Barrel export.
 *
 * Import centralis pour tous les composants du Design System SECT.
 *
 * Usage :
 *   import { AppShell, StatCard, EntityCard, ProgressRing, Badge } from '@/components/ds'
 *
 * Tokens & utilitaires CSS : voir src/app/globals.css (section DESIGN SYSTEM).
 *   - Couleurs smantiques : bg-primary, text-success-text, border-warning
 *   - Tiers gamification : bg-bronze, text-gold, ds-glow-platinum
 *   - Glassmorphism : SUPPRIM (remplac par fonds opaques bg-card pour lisibilit)
 *   - Hover lift : classe .ds-lift
 *   - Fonts : font-sans (Inter), font-mono (JetBrains Mono), font-display
 *   - Radius : rounded-sm/md/lg/xl/full (6/10/16/24px)
 *   - Motifs Kente : .ds-kente-pattern, .ds-kente-top, .ds-kente-watermark
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
export { ThemeToggle } from './theme-toggle'
// [32mNouveaux composants pour la refonte Résultats & Analyses[0m
export { Badge, type BadgeProps, BadgeStatus } from './badge'
