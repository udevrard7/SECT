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
      classes: 'bg-info/10 text-info border-info/20',
    }
  }
  if (isSemiAutoGradedType(type)) {
    return {
      label: 'Auto+',
      classes: 'bg-secondary/10 text-secondary border-secondary/20',
    }
  }
  return {
    label: 'Manuel',
    classes: 'bg-warning/10 text-warning border-warning/20',
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
    case 'FACILE': return 'bg-success'
    case 'MOYEN': return 'bg-warning'
    case 'DIFFICILE': return 'bg-warning'
    case 'EXPERT': return 'bg-destructive'
    default: return 'bg-muted-foreground'
  }
}

// ─── Score color helpers (ratio-based, voir note de divergence) ───

export function getScoreColor(score: number, total: number): string {
  if (total === 0) return 'text-muted-foreground'
  const pct = score / total
  if (pct >= 0.5) return 'text-success-text'
  if (pct >= 0.4) return 'text-warning'
  return 'text-destructive'
}

export function getScoreCircleColor(score: number, total: number): string {
  if (total === 0) return 'bg-muted text-muted-foreground border-border'
  const pct = score / total
  if (pct >= 0.5) return 'bg-success/10 text-success-text border-success/20'
  if (pct >= 0.4) return 'bg-warning/10 text-warning border-warning/20'
  return 'bg-destructive/10 text-destructive border-destructive/20'
}

// ─── Student status ───

export function getStudentStatusDot(session: CorrectionSession): { color: string; label: string } {
  if (session.statut === 'RETOURNEE') return { color: 'bg-tech', label: 'Rendue' }
  if (session.allCorrected) return { color: 'bg-success', label: 'Corrigée' }
  if (session.needsCorrectionCount > 0) return { color: 'bg-warning', label: 'À corriger' }
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
