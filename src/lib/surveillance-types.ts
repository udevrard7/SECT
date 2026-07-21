/**
 * Surveillance & Alertes — Types partagés (frontend ↔ backend)
 *
 * Centralise les types pour éviter la duplication entre les composants
 * client et les routes API.
 */

// ─── Événements de proctoring ───

export type ProctoringEventType =
  | 'FULLSCREEN_EXIT'
  | 'TAB_SWITCH'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'DEVTOOLS_ATTEMPT'
  | 'PRINTSCREEN_ATTEMPT'
  | 'PRINT_ATTEMPT'
  | 'ALT_TAB'
  | 'INACTIVITY'
  | 'SCREEN_CAPTURE'
  | 'AUTO_SUBMIT'
  | 'MANUAL_SUBMIT'
  | 'FORCE_SUBMIT'
  | (string & {}) // accepte d'autres types futurs

export interface LogEvent {
  type: ProctoringEventType
  timestamp: string
  details?: string
  penalite?: number
  imageLength?: number
  thumbnail?: string
}

// ─── Sévérité & niveau de risque ───

export type SeverityLevel = 'high' | 'medium' | 'low' | 'info'

// ─── Session de surveillance ───

export interface SurveillanceSession {
  id: string
  statut: string
  dateDebut: string | null
  dateFin: string | null
  score: number | null
  penalite: number
  alertes: number
  etudiant: { id: string; name: string; email: string }
  epreuve: {
    id: string
    titre: string
    statut: string
    dateDebut: string
    dateFin: string
    proctoringActif: boolean
  }
  logEvents: LogEvent[]
  fraudEvents: LogEvent[]
  screenshotEvents: LogEvent[]
  submissionEvents: LogEvent[]
  totalPenalite: number
  /** Score de risque 0-100 calculé côté backend */
  riskScore?: number
  /** Niveau de risque dérivé du riskScore */
  riskLevel?: 'safe' | 'moderate' | 'high' | 'critical'
  /** Indique si la session a déjà été signalée (alerte FRAUDE créée) */
  flagged?: boolean
}

export interface EpreuveOption {
  id: string
  titre: string
  statut: string
  dateDebut: string
  dateFin: string
  proctoringActif: boolean
  totalAlerts: number
  sessionsWithAlerts: number
  totalSessions: number
}

export interface SurveillanceResponse {
  sessions: SurveillanceSession[]
  epreuves: EpreuveOption[]
}

// ─── Statistiques (GET /api/surveillance/stats) ───

export interface SurveillanceStats {
  /** KPIs globaux */
  kpis: {
    totalSessions: number
    activeSessions: number
    sessionsWithAlerts: number
    totalAlerts: number
    totalPenalite: number
    flaggedSessions: number
    screenshots: number
  }
  /** Répartition des événements de fraude par type */
  fraudByType: Array<{ type: string; count: number; label: string }>
  /** Évolution temporelle (7 derniers jours) */
  timeline: Array<{ date: string; alerts: number; sessions: number }>
  /** Top 5 étudiants par nombre d'alertes */
  topStudents: Array<{
    id: string
    name: string
    email: string
    alertes: number
    penalite: number
  }>
}

// ─── Filtres de requête ───

export interface SurveillanceFilters {
  epreuveId?: string
  severity?: SeverityLevel | ''
  type?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

// ─── Action de signalement ───

export interface FlagSessionBody {
  reason?: string
}

export interface FlagSessionResponse {
  alerte: {
    id: string
    titre: string
    severity: string
    type: string
  }
  message: string
}

// ─── Helpers de mapping (réutilisables frontend) ───

export const EVENT_LABELS: Record<string, string> = {
  FULLSCREEN_EXIT: 'Sortie plein écran',
  TAB_SWITCH: "Changement d'onglet",
  COPY_ATTEMPT: 'Tentative de copie',
  PASTE_ATTEMPT: 'Tentative de collage',
  DEVTOOLS_ATTEMPT: 'Outils de développement',
  PRINTSCREEN_ATTEMPT: "Capture d'écran",
  PRINT_ATTEMPT: "Tentative d'impression",
  ALT_TAB: 'Alt+Tab détecté',
  INACTIVITY: 'Inactivité détectée',
  SCREEN_CAPTURE: 'Capture périodique',
  AUTO_SUBMIT: 'Soumission automatique',
  MANUAL_SUBMIT: 'Soumission manuelle',
  FORCE_SUBMIT: 'Soumission forcée',
}

export function getEventTypeLabel(type: string): string {
  return EVENT_LABELS[type] || type
}

export function getSeverityLevel(type: string): SeverityLevel {
  const high = ['FULLSCREEN_EXIT', 'TAB_SWITCH', 'DEVTOOLS_ATTEMPT']
  const medium = [
    'COPY_ATTEMPT',
    'PASTE_ATTEMPT',
    'PRINTSCREEN_ATTEMPT',
    'PRINT_ATTEMPT',
    'ALT_TAB',
  ]
  const low = ['INACTIVITY']
  if (high.includes(type)) return 'high'
  if (medium.includes(type)) return 'medium'
  if (low.includes(type)) return 'low'
  return 'info'
}

/**
 * Calcule un score de risque 0-100 à partir des événements.
 * Formule : min(100, alertes*8 + pénalité*2 + bonus par événements critiques)
 */
export function computeRiskScore(
  alertes: number,
  penalite: number,
  fraudEvents: LogEvent[]
): number {
  const criticalCount = fraudEvents.filter((e) =>
    ['FULLSCREEN_EXIT', 'TAB_SWITCH', 'DEVTOOLS_ATTEMPT'].includes(e.type)
  ).length
  const score = Math.min(100, alertes * 8 + penalite * 2 + criticalCount * 5)
  return Math.round(score)
}

export function riskLevelFromScore(
  score: number
): 'safe' | 'moderate' | 'high' | 'critical' {
  if (score >= 70) return 'critical'
  if (score >= 40) return 'high'
  if (score >= 15) return 'moderate'
  return 'safe'
}
