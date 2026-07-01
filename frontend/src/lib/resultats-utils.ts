// ─────────────────────────────────────────────────────────────
// Utilitaires partagés pour les Résultats & Analyses
// Tous les calculs respectent noteTotal (échelle dynamique)
// ─────────────────────────────────────────────────────────────

import type { ScoreBin, QuestionSuccess, SessionResult, QuestionDetail, RawQuestionDetail } from '@/types/resultats'

// ─── Formatage des dates ───

const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

const MONTHS_FR_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function formatDateFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS_FR_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateShortFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateTimeFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDateFR(d)} à ${hh}:${mm}`
}

export function formatMonthFR(yyyymm: string): string {
  // "2024-03" -> "mars 2024"
  const [year, month] = yyyymm.split('-')
  const idx = Number(month) - 1
  if (idx < 0 || idx > 11) return yyyymm
  return `${MONTHS_FR_LONG[idx]} ${year}`
}

export function formatMonthShortFR(yyyymm: string): string {
  const [year, month] = yyyymm.split('-')
  const idx = Number(month) - 1
  if (idx < 0 || idx > 11) return yyyymm
  return `${MONTHS_FR[idx]} ${year.slice(2)}`
}

// ─── Calculs statistiques ───

/** Médiane vraie (moyenne des 2 éléments centraux si n pair) */
export function calculateMedian(sortedValues: number[]): number {
  const n = sortedValues.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 !== 0 ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2
}

/** Normalise un score vers une échelle /20 selon noteTotal */
export function normalizeTo20(score: number, noteTotal: number = 20): number {
  if (noteTotal <= 0) return 0
  return (score / noteTotal) * 20
}

/** Pourcentage (0-100) selon noteTotal */
export function scoreToPercentage(score: number, noteTotal: number = 20): number {
  if (noteTotal <= 0) return 0
  return Math.round((score / noteTotal) * 100)
}

/** Seuil de réussite = noteTotal / 2 (10/20, 50/100, ...) */
export function passThreshold(noteTotal: number = 20): number {
  return noteTotal / 2
}

// ─── Couleurs (échelle alignée sur StatCard : ≥16 or, ≥10 succès, <10 danger) ───
// Toutes les fonctions de couleur utilisent EXCLUSIVEMENT des tokens sémantiques
// du Design System Savane EdTech (jamais de hex brut), pour un support natif
// du dark mode et une cohérence visuelle parfaite.

/**
 * Retourne la classe de couleur texte selon le score normalisé /20.
 * Or ≥ 16, vert (success) ≥ 10, rouge (destructive) < 10.
 */
export function getScoreColor(scoreOn20: number): string {
  if (scoreOn20 >= 16) return 'text-gold'
  if (scoreOn20 >= 10) return 'text-success-text'
  return 'text-destructive'
}

/** Retourne les classes fond/texte/bordure selon le score normalisé /20. */
export function getScoreBg(scoreOn20: number): string {
  if (scoreOn20 >= 16) return 'bg-gold/15 text-gold border-gold/30'
  if (scoreOn20 >= 10) return 'bg-success/15 text-success-text border-success/30'
  return 'bg-destructive/15 text-destructive border-destructive/30'
}

/**
 * Retourne une chaîne `var(--token)` pour fond inline (HTML) ou stroke SVG.
 * Or ≥ 16, vert (primary) ≥ 10, rouge (destructive) < 10.
 *
 * NOTE : pour Recharts (Cell fill / Area stroke), préférez `useChartColors()`
 * qui résout la valeur réelle (computed style) car les attributs de présentation
 * SVG ne supportent pas `var(--token)`.
 */
export function getBarColor(scoreOn20: number): string {
  if (scoreOn20 >= 16) return 'var(--gold)'
  if (scoreOn20 >= 10) return 'var(--primary)'
  return 'var(--destructive)'
}

/**
 * Retourne une chaîne `var(--token)` pour le taux de réussite (0-100).
 * Vert (primary) ≥ 70, ambre (warning) ≥ 40, rouge (destructive) < 40.
 */
export function getSuccessRateColor(rate: number): string {
  if (rate >= 70) return 'var(--primary)'
  if (rate >= 40) return 'var(--warning)'
  return 'var(--destructive)'
}

// ─── Styles des types de questions (DS Badge variants) ───

/** Variants de Badge DS disponibles (synchronisés avec @/components/ds/badge). */
export type QuestionTypeBadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'gold'
  | 'bronze'
  | 'silver'

/**
 * Map des types de questions vers les variants DS Badge.
 * Palette africaine : QCU=info (bleu nuit), QCM=warning (soleil),
 * QRC=success (vert lime), TRS=secondary (terre cuite), CODE=danger,
 * REFLEXION=gold (or).
 */
export const QUESTION_TYPE_STYLES: Record<string, QuestionTypeBadgeVariant> = {
  QCU: 'info',
  QCM: 'warning',
  QRC: 'success',
  TRS: 'secondary',
  CODE: 'danger',
  REFLEXION: 'gold',
}

/** Renvoie le variant DS Badge pour un type de question (défaut: secondary). */
export function getQuestionTypeBadgeVariant(type: string): QuestionTypeBadgeVariant {
  return QUESTION_TYPE_STYLES[type] ?? 'secondary'
}

// ─── Distribution des notes ───

/**
 * Construit l'histogramme de distribution des notes.
 * Les bins sont proportionnels à noteTotal (7 tranches sur l'échelle /20).
 */
export function buildDistribution(
  sessions: SessionResult[],
  noteTotal: number = 20
): ScoreBin[] {
  // 7 tranches normalisées sur l'échelle /20
  const binFractions = [
    { label: '0-4', min: 0, max: 4 },
    { label: '4-8', min: 4, max: 8 },
    { label: '8-10', min: 8, max: 10 },
    { label: '10-12', min: 10, max: 12 },
    { label: '12-14', min: 12, max: 14 },
    { label: '14-16', min: 14, max: 16 },
    { label: '16-20', min: 16, max: 20.01 },
  ]

  const bins: ScoreBin[] = binFractions.map((b) => ({
    name: b.label,
    count: 0,
    midpoint: (b.min + b.max) / 2,
    min: b.min,
    max: b.max,
  }))

  sessions.forEach((s) => {
    if (s.score === null) return
    const normalized = normalizeTo20(s.score, noteTotal)
    for (const bin of bins) {
      if (normalized >= bin.min && normalized < bin.max) {
        bin.count++
        break
      }
    }
  })

  return bins
}

// ─── Normalisation du detailParQuestion (schéma DB → frontend) ───

/**
 * Normalise un tableau de détails par question depuis le format BRUT DB
 * (schéma A : {questionId, type, bareme, score, repondu, noteIA}) vers le
 * format frontend unifié (schéma B : {index, type, enonce, pointsMax,
 * pointsObtenus, correct, reponseEtudiant, reponseAttendue, commentaire}).
 *
 * Gère aussi le cas où detailParQuestion est déjà au format frontend (schéma B)
 * — détecté via la présence du champ `pointsMax`.
 *
 * Un `enonceMap` optionnel (Map<questionId, enonce>) permet d'enrichir
 * l'énoncé depuis Epreuve.contenu.questions lorsque le backend le fournit.
 *
 * @example
 * ```ts
 * const raw = session.resultat?.detailParQuestion
 * const details = normalizeQuestionDetails(raw, enonceMap)
 * // → QuestionDetail[] prêt à afficher dans SessionDetailDialog
 * ```
 */
export function normalizeQuestionDetails(
  raw: RawQuestionDetail[] | null | undefined,
  enonceMap?: Map<string, string>
): QuestionDetail[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return []

  return raw.map((q, idx) => {
    // Cas 1 : déjà au format frontend (schéma B avec pointsMax)
    if (typeof q.pointsMax === 'number') {
      const questionId = q.questionId ?? ''
      return {
        index: typeof q.index === 'number' ? q.index : idx + 1,
        type: String(q.type || ''),
        enonce: q.enonce || enonceMap?.get(questionId) || `Question ${idx + 1}`,
        pointsMax: q.pointsMax,
        pointsObtenus: typeof q.pointsObtenus === 'number' ? q.pointsObtenus : null,
        correct: typeof q.correct === 'boolean' ? q.correct : null,
        reponseEtudiant: q.reponseEtudiant ?? null,
        reponseAttendue: q.reponseAttendue ?? null,
        commentaire: q.commentaire ?? null,
        noteIA: q.noteIA ?? null,
      }
    }

    // Cas 2 : format DB brut (schéma A avec bareme/score)
    const bareme = typeof q.bareme === 'number' ? q.bareme : 1
    const score = typeof q.score === 'number' ? q.score : null
    const isGraded = score !== null
    const questionId = q.questionId ?? ''
    // Heuristique "correct" : score >= 50% du barème (cohérent avec mon-resultat-dialog)
    const correct = isGraded ? (score as number) >= bareme * 0.5 : null

    return {
      index: idx + 1,
      type: String(q.type || ''),
      enonce: q.enonce || enonceMap?.get(questionId) || `Question ${idx + 1}`,
      pointsMax: bareme,
      pointsObtenus: score,
      correct,
      reponseEtudiant: q.reponseEtudiant ?? null,
      reponseAttendue: q.reponseAttendue ?? null,
      commentaire: q.commentaire ?? null,
      noteIA: q.noteIA ?? null,
    }
  })
}

// ─── Taux de réussite par question ───

export function buildQuestionSuccess(sessions: SessionResult[]): QuestionSuccess[] {
  if (sessions.length === 0) return []

  const questionMap = new Map<number, { total: number; correct: number; enonce: string; type: string }>()

  sessions.forEach((s) => {
    // BUGFIX (DETAIL-NORM-1) : normaliser le format BRUT DB (schéma A) avant
    // d'itérer. Avant, on castait directement en QuestionDetail, ce qui donnait
    // q.index = undefined (Map key NaN) et q.correct = undefined → chart vide.
    const details = normalizeQuestionDetails(s.resultat?.detailParQuestion)
    if (details.length === 0) return
    details.forEach((q) => {
      const idx = q.index
      if (!questionMap.has(idx)) {
        questionMap.set(idx, {
          total: 0,
          correct: 0,
          enonce: q.enonce || `Question ${idx + 1}`,
          type: q.type,
        })
      }
      const entry = questionMap.get(idx)!
      entry.total++
      if (q.correct === true) entry.correct++
    })
  })

  return Array.from(questionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([idx, data]) => ({
      name: `Q${idx + 1}`,
      index: idx,
      taux: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      type: data.type,
      enonce: data.enonce,
    }))
}

// ─── Performance par type de question (pour le radar chart) ───

/**
 * Calcule la moyenne /20 par type de question à partir des sessions.
 *
 * Gère les DEUX schémas de `detailParQuestion` (voir backend Task 1-a §3.4) :
 *   - Schéma A (grading flow) : { bareme, score }
 *   - Schéma B (initial IA)   : { pointsMax, pointsObtenus }
 *
 * La moyenne est normalisée sur /20 pour permettre la comparaison croisée.
 */
export function buildPerformanceByType(
  sessions: SessionResult[]
): Array<{ subject: string; value: number; fullMark: number }> {
  if (sessions.length === 0) return []

  // Accumule (sommeNormalisé20, count) par type
  const map = new Map<string, { sum: number; count: number }>()

  sessions.forEach((s) => {
    const details = s.resultat?.detailParQuestion
    if (!details || !Array.isArray(details)) return
    details.forEach((q) => {
      const type = q.type
      if (!type) return

      // Détermine points obtenus et points max selon le schéma
      const pointsMax =
        (q as { pointsMax?: number }).pointsMax ??
        (q as { bareme?: number }).bareme ??
        0
      const pointsObtenus =
        (q as { pointsObtenus?: number | null }).pointsObtenus ??
        (q as { score?: number | null }).score ??
        null

      if (pointsMax <= 0 || pointsObtenus === null || pointsObtenus === undefined) return

      const normalized20 = (pointsObtenus / pointsMax) * 20
      const entry = map.get(type) ?? { sum: 0, count: 0 }
      entry.sum += normalized20
      entry.count += 1
      map.set(type, entry)
    })
  })

  return Array.from(map.entries())
    .map(([type, { sum, count }]) => ({
      subject: type,
      value: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      fullMark: 20,
    }))
    .sort((a, b) => b.value - a.value)
}

// ─── Export CSV (côté client, pour la vue filtrée) ───

export function sessionsToCSV(
  sessions: SessionResult[],
  noteTotal: number = 20,
  examTitle: string = 'epreuve'
): void {
  const headers = ['Rang', 'Nom', 'Email', 'Filière', 'Statut', 'Score', `/${noteTotal}`, 'Pourcentage', 'Alertes', 'Date soumission']
  const rows = sessions.map((s, i) => {
    const score = s.score ?? 0
    const pct = scoreToPercentage(score, noteTotal)
    return [
      String(i + 1),
      s.etudiant.name,
      s.etudiant.email,
      s.etudiant.filiere ?? '',
      s.statut,
      score.toFixed(2),
      String(noteTotal),
      `${pct}%`,
      String(s.alertes ?? 0),
      s.dateFin ? formatDateFR(s.dateFin) : '',
    ]
  })

  const escapeCSV = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }

  const csv = [headers.map(escapeCSV).join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `resultats_${examTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Export JSON (côté client) ───

export function sessionsToJSON(
  sessions: SessionResult[],
  stats: Record<string, unknown> | null,
  examTitle: string = 'epreuve'
): void {
  const payload = {
    exporteLe: new Date().toISOString(),
    epreuve: examTitle,
    stats,
    etudiants: sessions.map((s) => ({
      nom: s.etudiant.name,
      email: s.etudiant.email,
      filiere: s.etudiant.filiere,
      statut: s.statut,
      score: s.score,
      alertes: s.alertes,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      resultat: s.resultat
        ? {
            scoreFinal: s.resultat.scoreFinal,
            dateCorrection: s.resultat.dateCorrection,
            detailParQuestion: s.resultat.detailParQuestion,
          }
        : null,
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `resultats_${examTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Délai relatif (ex: "il y a 3 jours") ───

export function timeAgoFR(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "à l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  if (months < 12) return `il y a ${months} mois`
  return `il y a ${Math.floor(months / 12)} an${months >= 24 ? 's' : ''}`
}
