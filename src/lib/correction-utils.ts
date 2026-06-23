/**
 * Helpers purs pour la page Correction.
 *
 * Extraits de src/components/correction/correction-page.tsx (phase 1 de
 * modularisation — voir worklog T2).
 *
 * NOTE DE DIVERGENCE : `getScoreColor` ici est **ratio-based** (prend
 * `score` et `total`, calcule le pourcentage) avec seuils ≥0.5 / ≥0.4.
 * Cela diffère de `src/lib/resultats-utils.ts:getScoreColor` qui est
 * **scoreOn20-based** (prend un score déjà normalisé sur 20, seuils ≥10 / ≥8).
 * Les deux coexistent intentionnellement : la correction gère des barèmes
 * variables par question, le ratio est donc plus naturel.
 */

import type { CorrectionSession, RubricCriterion } from '@/types/correction'

// ─── JSON safe parse ───

export function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// ─── Question type helpers ───

export function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'QRC': return 'Rép. courte'
    case 'TRS': return 'Travail struct.'
    case 'REFLEXION': return 'Réflexion'
    case 'QCM': return 'QCM'
    case 'QCU': return 'QCU'
    case 'CODE': return 'Code'
    default: return type
  }
}

export function isAutoGradedType(type: string): boolean {
  return type === 'QCM' || type === 'QCU'
}

export function isSemiAutoGradedType(type: string): boolean {
  return type === 'CODE'
}

export function getCorrectionBadge(type: string): { label: string; classes: string } {
  if (isAutoGradedType(type)) {
    return {
      label: 'Auto',
      classes: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
    }
  }
  if (isSemiAutoGradedType(type)) {
    return {
      label: 'Auto+',
      classes: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
    }
  }
  return {
    label: 'Manuel',
    classes: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  }
}

// ─── Difficulty helpers ───

export function getDifficulteLabel(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'Facile'
    case 'MOYEN': return 'Moyen'
    case 'DIFFICILE': return 'Difficile'
    case 'EXPERT': return 'Expert'
    default: return diff
  }
}

export function getDifficulteDotColor(diff: string): string {
  switch (diff) {
    case 'FACILE': return 'bg-emerald-500'
    case 'MOYEN': return 'bg-amber-500'
    case 'DIFFICILE': return 'bg-orange-500'
    case 'EXPERT': return 'bg-rose-500'
    default: return 'bg-muted-foreground'
  }
}

// ─── Score color helpers (ratio-based, voir note de divergence) ───

export function getScoreColor(score: number, total: number): string {
  if (total === 0) return 'text-muted-foreground'
  const pct = score / total
  if (pct >= 0.5) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 0.4) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function getScoreCircleColor(score: number, total: number): string {
  if (total === 0) return 'bg-muted text-muted-foreground border-border'
  const pct = score / total
  if (pct >= 0.5) return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
  if (pct >= 0.4) return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
  return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
}

// ─── Student status ───

export function getStudentStatusDot(session: CorrectionSession): { color: string; label: string } {
  if (session.statut === 'RETOURNEE') return { color: 'bg-teal-500', label: 'Rendue' }
  if (session.allCorrected) return { color: 'bg-emerald-500', label: 'Corrigée' }
  if (session.needsCorrectionCount > 0) return { color: 'bg-amber-500', label: 'À corriger' }
  return { color: 'bg-muted-foreground', label: 'En attente' }
}

// ─── Rubric Criteria Generation ───

export function generateRubricCriteria(type: string, bareme: number): RubricCriterion[] {
  const n = bareme
  switch (type) {
    case 'QRC':
      return [
        { id: 'qrc-complete', label: `Réponse complète (+${Math.round(n * 0.6 * 10) / 10})`, points: Math.round(n * 0.6 * 10) / 10 },
        { id: 'qrc-partielle', label: `Réponse partielle (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'qrc-motcle', label: `Mot-clé présent (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
        { id: 'qrc-hors', label: 'Hors sujet (0)', points: 0 },
      ]
    case 'REFLEXION':
      return [
        { id: 'ref-analyse', label: `Analyse approfondie (+${Math.round(n * 0.4 * 10) / 10})`, points: Math.round(n * 0.4 * 10) / 10 },
        { id: 'ref-arguments', label: `Arguments pertinents (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'ref-exemples', label: `Exemples concrets (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'ref-conclusion', label: `Conclusion pertinente (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
      ]
    case 'TRS':
      return [
        { id: 'trs-structure', label: `Structure correcte (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'trs-contenu', label: `Contenu pertinent (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'trs-exemples', label: `Exemples/appuis (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'trs-redaction', label: `Rédaction soignée (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
      ]
    case 'CODE':
      return [
        { id: 'code-logique', label: `Logique correcte (+${Math.round(n * 0.4 * 10) / 10})`, points: Math.round(n * 0.4 * 10) / 10 },
        { id: 'code-syntaxe', label: `Syntaxe correcte (+${Math.round(n * 0.2 * 10) / 10})`, points: Math.round(n * 0.2 * 10) / 10 },
        { id: 'code-tests', label: `Tests passés (+${Math.round(n * 0.3 * 10) / 10})`, points: Math.round(n * 0.3 * 10) / 10 },
        { id: 'code-style', label: `Bon style de code (+${Math.round(n * 0.1 * 10) / 10})`, points: Math.round(n * 0.1 * 10) / 10 },
      ]
    default:
      return [
        { id: 'def-complete', label: `Réponse complète (+${n})`, points: n },
        { id: 'def-zero', label: 'Hors sujet (0)', points: 0 },
      ]
  }
}

// ─── Parse student answer content ───

export function parseAnswerContent(raw: string | null | undefined): string {
  if (!raw) return 'Aucune réponse fournie'
  try {
    const obj = JSON.parse(raw)
    // Handle CodingAnswer objects: { code, language, testResultsPublics, ... }
    if (typeof obj === 'object' && obj !== null && typeof obj.code === 'string') {
      const lines = obj.code.split('\n').length
      const lang = obj.language || 'unknown'
      const passedTests = obj.testResultsPublics?.filter?.((t: any) => t.passed)?.length ?? '?'
      const totalTests = obj.testResultsPublics?.length ?? '?'
      return `[${lang}] Code soumis (${lines} lignes, ${passedTests}/${totalTests} tests publics réussis)\n\n${obj.code}`
    }
    if (Array.isArray(obj)) return obj.join(', ')
    if (typeof obj === 'string') return obj
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)
    return JSON.stringify(obj, null, 2)
  } catch {
    return raw
  }
}

/** Check if the raw answer content is a coding answer (JSON with .code) */
export function isCodingAnswer(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    const obj = JSON.parse(raw)
    return typeof obj === 'object' && obj !== null && typeof obj.code === 'string'
  } catch {
    return false
  }
}
