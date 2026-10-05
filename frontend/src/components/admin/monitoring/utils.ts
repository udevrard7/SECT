// utils.ts — Helpers d'affichage du module /monitoring (SECT-MONITORING-UI-1).

import type { AlertingRule, Comparator, MonitoringEvent, Severity } from './types'

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

/** Uptime lisible du process backend (onglet Système — ADR-0011). */
export function formatUptimeLong(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} j ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

export function getTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'À l\u2019instant'
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'À l\u2019instant'
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours} h`
  return `Il y a ${diffDays} j`
}

/** Symbole lisible d'un comparateur de règle (ADR-0012). */
export function comparatorLabel(comparator: Comparator): string {
  switch (comparator) {
    case 'SUP':
      return '>'
    case 'SUP_EGAL':
      return '≥'
    case 'INF':
      return '<'
    case 'INF_EGAL':
      return '≤'
  }
}

/**
 * Parse le champ `details` d'un événement.
 * Le backend stocke une STRING (colonne TEXT) : JSON stringifié la plupart du
 * temps (escalade → {escalatedFrom, originalSeverite} ; résolution → fusion
 * {…, resolutionNotes} ; worker → payload libre). Retourne null si absent ou
 * non parsable (le rendu affichera alors la string brute si non vide).
 */
export function parseEventDetails(event: MonitoringEvent): Record<string, unknown> | null {
  if (!event.details) return null
  const raw = event.details.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/** Valeur lisible d'une entrée de details (JSON scalaires → texte). */
export function detailValueToString(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Clés techniques à ne PAS afficher en liste générique (rendues dédiée). */
export const DETAIL_SPECIAL_KEYS = new Set(['resolutionNotes', 'escalatedFrom', 'originalSeverite'])

/**
 * Remplissage de la barre de progression d'une règle — sémantique
 * comparator-aware (ADR-0012) :
 *   - SUP/SUP_EGAL : 100 % = au seuil (rouge si franchi, ambre ≥ 80 %) ;
 *   - INF/INF_EGAL : la barre représente la marge restante (rouge si franchi,
 *     ambre si ≤ 10 % de marge sous le seuil).
 */
export function ruleGauge(rule: AlertingRule): { fillPct: number; tone: 'danger' | 'warning' | 'ok' } {
  const { comparator, threshold, currentValue, violated } = rule
  if (threshold <= 0) {
    return { fillPct: violated ? 100 : 100, tone: violated ? 'danger' : 'ok' }
  }
  if (comparator === 'SUP' || comparator === 'SUP_EGAL') {
    const fillPct = Math.min(100, (currentValue / threshold) * 100)
    if (violated) return { fillPct: 100, tone: 'danger' }
    if (fillPct >= 80) return { fillPct, tone: 'warning' }
    return { fillPct, tone: 'ok' }
  }
  // INF / INF_EGAL : marge restante = valeur / seuil.
  const marginPct = Math.min(100, (currentValue / threshold) * 100)
  if (violated) return { fillPct: 100, tone: 'danger' }
  if (marginPct <= 10) return { fillPct: 100 - marginPct, tone: 'warning' }
  return { fillPct: 100 - marginPct, tone: 'ok' }
}

/** Score → accent DS unifié (KPI, ProgressRing). */
export function scoreAccent(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

/** Severities affichées dans la file « Alertes actives ». */
export const ALERT_SEVERITIES: Severity[] = ['CRITICAL', 'ERROR', 'WARNING']
