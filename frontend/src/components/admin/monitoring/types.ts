// types.ts — Types du module /monitoring (SECT-MONITORING-UI-1).
//
// CONTRAT EXACT avec le backend Go (ADR-0011 + ADR-0012) — chaque type reflète
// la structure JSON réelle renvoyée par les handlers :
//   - monitoringEventsReal       (stub_handlers_real2.go)   → MonitoringEvent
//   - monitoringOverview         (monitoring_overview_handlers.go) → OverviewData
//   - monitoringHealthCheck      (monitoring_mutation_handlers.go) → HealthReport
//   - monitoringRulesList/Create/Update/Delete (monitoring_rules_handlers.go) → AlertingRule
//   - monitoringEndpointsStats   (monitoring_rules_handlers.go)   → EndpointStat
//
// ⚠️ Alignements corrigés dans cette refonte :
//   - `details` est une STRING JSON (colonne TEXT côté backend) — pas un objet.
//     Elle contient notamment `resolutionNotes` (fusionnée à la résolution)
//     et `{escalatedFrom, originalSeverite}` (escalade manuelle).
//   - Les KPIs de l'en-tête proviennent d'OVERVIEW (source unique alignée avec
//     la carte « Santé plateforme » du dashboard admin), plus de `stats`.

import {
  Globe,
  Database,
  Shield,
  ClipboardCheck,
  CreditCard,
  Server,
  Info,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  type LucideIcon,
} from 'lucide-react'

// ─── Événements (GET /api/monitoring) ───

export type EventType = 'API' | 'DATABASE' | 'AUTH' | 'EVALUATION' | 'PAYMENT' | 'SYSTEM'
export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
export type EventStatut = 'ACTIF' | 'RESOLU' | 'IGNORE'

export interface MonitoringEvent {
  id: string
  type: EventType
  severite: Severity
  message: string
  /** JSON stringifié (colonne TEXT backend) — parser via parseEventDetails. */
  details?: string | null
  source?: string | null
  duree?: number | null
  statut: EventStatut
  resoluLe?: string | null
  resoluPar?: string | null
  createdAt: string
  updatedAt: string
}

export interface MonitoringStats {
  activeCount: number
  criticalCount: number
  errorCount: number
  warningCount: number
  resolvedToday: number
  resolved24h: number
}

export interface EventsPage {
  events: MonitoringEvent[]
  total: number
  page: number
  pageSize: number
  stats: MonitoringStats
}

// ─── Overview (GET /api/monitoring/overview — ADR-0011) ───

export type Verdict = 'BONNE_SANTE' | 'ATTENTION' | 'URGENT'

export interface ScoreComponent {
  label: string
  detail: string
  penalty: number
}

export interface OverviewScore {
  score: number
  verdict: Verdict
  breakdown: ScoreComponent[]
}

export interface OverviewKpis {
  activeEvents: number
  criticalEvents: number
  errorEvents: number
  warningEvents: number
  resolvedToday: number
  resolved24h: number
  autorisationsEnAttente: number
  autorisationsActives: number
  etablissementsProteges: number
  verificationIdentite: number
}

export interface OverviewRuntime {
  uptimeSeconds: number
  goVersion: string
  goroutines: number
  numCPU: number
  memAllocMB: number
  memSysMB: number
  numGC: number
  gcPauseTotalMs: number
}

export interface OverviewDb {
  down: boolean
  latencyMs: number
  activeConns: number
}

export interface OverviewStorage {
  configured: boolean
  reachable: boolean
  bucket: string
}

export type WorkerKind = 'periodique' | 'file'

export interface OverviewWorker {
  name: string
  label: string
  kind: WorkerKind
  intervalLabel: string
  runs: number
  errors: number
  /** RFC3339, '' si jamais exécuté. */
  lastRunAt: string
  lastDurationMs: number
  lastError: string
  startedAt: string
}

export interface TrendPoint {
  date: string
  critical: number
  error: number
  warning: number
  info: number
}

export interface OverviewData {
  score: OverviewScore
  kpis: OverviewKpis
  runtime: OverviewRuntime
  db: OverviewDb
  storage: OverviewStorage
  ai: { providersActifs: number }
  maintenance: { active: boolean; message: string }
  workers: OverviewWorker[]
  trend: TrendPoint[]
  generatedAt: string
}

// ─── Healthcheck services (GET /api/monitoring/health) ───

export type ServiceStatusValue = 'OPERATIONNEL' | 'DEGRADE' | 'INDISPONIBLE'

export interface ServiceStatus {
  name: string
  status: ServiceStatusValue
  /** ADR-0011 : toujours vide — pas de SLA mesuré (honnêteté). */
  uptime: string
  latency: number
  lastCheck: string
  lastError: string
  activeConns: number
}

export interface HealthReport {
  services: ServiceStatus[]
  overall: ServiceStatusValue
  healthyCount: number
  totalCount: number
  checkedAt: string
}

// ─── Règles d'alerte persistées (GET/POST/PUT/DELETE /api/monitoring/rules — ADR-0012) ───

export type Comparator = 'SUP' | 'SUP_EGAL' | 'INF' | 'INF_EGAL'

export interface AlertingRule {
  id: string
  code: string
  label: string
  description: string | null
  metric: string
  metricLabel: string
  unit: string
  comparator: Comparator
  threshold: number
  severite: Severity
  enabled: boolean
  cooldownMinutes: number
  notifyInApp: boolean
  notifySlack: boolean
  notifyEmail: boolean
  isSystem: boolean
  breachedSince: string | null
  lastNotifiedAt: string | null
  /** Statut live évalué backend à chaque GET. */
  currentValue: number
  violated: boolean
  createdAt: string
  updatedAt: string
}

export interface MetricDef {
  key: string
  label: string
  unit: string
  description: string
}

export interface ComparatorDef {
  key: Comparator
  label: string
}

export interface RulesData {
  rules: AlertingRule[]
  channels: { slackConfigured: boolean; emailTo: string; emailReady: boolean }
  metrics: MetricDef[]
  comparators: ComparatorDef[]
}

// ─── Percentiles par endpoint (GET /api/monitoring/endpoints?window= — ADR-0012 §3) ───

export type EndpointsWindow = '1h' | '24h' | '7d'

export interface EndpointStat {
  method: string
  route: string
  total: number
  errors: number
  errorRate: number
  p50Ms: number
  p95Ms: number
  avgMs: number
  maxMs: number
}

export interface EndpointsData {
  window: string
  windowHours: number
  endpoints: EndpointStat[]
  generatedAt: string
}

// ═══ Constantes d'affichage ═══

export const TYPE_ICONS: Record<EventType, LucideIcon> = {
  API: Globe,
  DATABASE: Database,
  AUTH: Shield,
  EVALUATION: ClipboardCheck,
  PAYMENT: CreditCard,
  SYSTEM: Server,
}

export const TYPE_LABELS: Record<EventType, string> = {
  API: 'API',
  DATABASE: 'Base de données',
  AUTH: 'Authentification',
  EVALUATION: 'Évaluation',
  PAYMENT: 'Paiement',
  SYSTEM: 'Système',
}

export interface SeverityStyle {
  label: string
  color: string
  bg: string
  border: string
  darkBg: string
  darkColor: string
  darkBorder: string
  icon: LucideIcon
}

export const SEVERITY_CONFIG: Record<Severity, SeverityStyle> = {
  INFO: {
    label: 'Info',
    color: 'text-info',
    bg: 'bg-info/10',
    border: 'border-info/30',
    darkBg: 'dark:bg-info/40',
    darkColor: 'dark:text-info/80',
    darkBorder: 'dark:border-info/70',
    icon: Info,
  },
  WARNING: {
    label: 'Avertissement',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    darkBg: 'dark:bg-warning/40',
    darkColor: 'dark:text-warning/80',
    darkBorder: 'dark:border-warning/70',
    icon: AlertTriangle,
  },
  ERROR: {
    label: 'Erreur',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    darkBg: 'dark:bg-destructive/40',
    darkColor: 'dark:text-destructive/80',
    darkBorder: 'dark:border-destructive/70',
    icon: XCircle,
  },
  CRITICAL: {
    label: 'Critique',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    border: 'border-secondary/30',
    darkBg: 'dark:bg-secondary/40',
    darkColor: 'dark:text-secondary/80',
    darkBorder: 'dark:border-secondary/70',
    icon: AlertOctagon,
  },
}

export interface StatutStyle {
  label: string
  color: string
  bg: string
  border: string
  darkBg: string
  darkColor: string
  darkBorder: string
}

export const STATUS_CONFIG: Record<EventStatut, StatutStyle> = {
  ACTIF: {
    label: 'Actif',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    darkBg: 'dark:bg-warning/40',
    darkColor: 'dark:text-warning/80',
    darkBorder: 'dark:border-warning/70',
  },
  RESOLU: {
    label: 'Résolu',
    color: 'text-success-text',
    bg: 'bg-success/10',
    border: 'border-success/30',
    darkBg: 'dark:bg-success/40',
    darkColor: 'dark:text-success-text/80',
    darkBorder: 'dark:border-success/70',
  },
  IGNORE: {
    label: 'Ignoré',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    darkBg: 'dark:bg-muted/80',
    darkColor: 'dark:text-muted-foreground',
    darkBorder: 'dark:border-border',
  },
}

export interface ServiceStatusStyle {
  label: string
  dotColor: string
  bgColor: string
  borderColor: string
  darkBgColor: string
  darkBorderColor: string
  textColor: string
  darkTextColor: string
}

export const SERVICE_STATUS_CONFIG: Record<ServiceStatusValue, ServiceStatusStyle> = {
  OPERATIONNEL: {
    label: 'Opérationnel',
    dotColor: 'bg-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    darkBgColor: 'dark:bg-success/20',
    darkBorderColor: 'dark:border-success/70',
    textColor: 'text-success-text',
    darkTextColor: 'dark:text-success-text/80',
  },
  DEGRADE: {
    label: 'Dégradé',
    dotColor: 'bg-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    darkBgColor: 'dark:bg-warning/20',
    darkBorderColor: 'dark:border-warning/70',
    textColor: 'text-warning',
    darkTextColor: 'dark:text-warning/80',
  },
  INDISPONIBLE: {
    label: 'Indisponible',
    dotColor: 'bg-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    darkBgColor: 'dark:bg-destructive/20',
    darkBorderColor: 'dark:border-destructive/70',
    textColor: 'text-destructive',
    darkTextColor: 'dark:text-destructive/80',
  },
}

/**
 * Mapping EXACT nom backend (healthcheck.go) → type d'événement.
 * Les noms sont les libellés français posés par les checks réels —
 * plus aucun heuristique `name.includes(...)` fragile.
 */
export const SERVICE_TYPE_BY_NAME: Record<string, EventType> = {
  'Base de données': 'DATABASE',
  'API Gateway': 'API',
  Auth: 'AUTH',
  Évaluation: 'EVALUATION',
  Paiement: 'PAYMENT',
  'Proctoring IA': 'SYSTEM',
}

export interface VerdictStyle {
  label: string
  chip: string
  dot: string
}

export const VERDICT_CONFIG: Record<Verdict, VerdictStyle> = {
  BONNE_SANTE: {
    label: 'Bonne santé',
    chip: 'bg-success/10 text-success-text border-success/40 dark:bg-success/20 dark:text-success-text/80 dark:border-success/70',
    dot: 'bg-success',
  },
  ATTENTION: {
    label: 'Attention requise',
    chip: 'bg-warning/10 text-warning border-warning/40 dark:bg-warning/20 dark:text-warning/80 dark:border-warning/70',
    dot: 'bg-warning',
  },
  URGENT: {
    label: 'Urgence',
    chip: 'bg-destructive/10 text-destructive border-destructive/40 dark:bg-destructive/20 dark:text-destructive/80 dark:border-destructive/70',
    dot: 'bg-destructive',
  },
}

/** Ordre de priorité d'affichage des sévérités (tri des alertes actives). */
export const SEVERITY_PRIORITY: Record<Severity, number> = {
  CRITICAL: 0,
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
}
