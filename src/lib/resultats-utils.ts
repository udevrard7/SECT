// ─────────────────────────────────────────────────────────────
// Utilitaires partagés pour les Résultats & Analyses
// Tous les calculs respectent noteTotal (échelle dynamique)
// ─────────────────────────────────────────────────────────────

import type { ScoreBin, QuestionSuccess, SessionResult, QuestionDetail } from '@/types/resultats'

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

// ─── Couleurs (basées sur l'échelle /20 normalisée) ───

/**
 * Retourne la classe de couleur texte selon le score normalisé /20.
 * Vert ≥ 10, ambre ≥ 8, rouge < 8.
 */
export function getScoreColor(scoreOn20: number): string {
  if (scoreOn20 >= 10) return 'text-emerald-700 dark:text-emerald-400'
  if (scoreOn20 >= 8) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

export function getScoreBg(scoreOn20: number): string {
  if (scoreOn20 >= 10) return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
  if (scoreOn20 >= 8) return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
  return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
}

export function getBarColor(scoreOn20: number): string {
  if (scoreOn20 >= 10) return '#10b981'
  if (scoreOn20 >= 8) return '#f59e0b'
  return '#ef4444'
}

export function getSuccessRateColor(rate: number): string {
  if (rate >= 70) return '#10b981'
  if (rate >= 40) return '#f59e0b'
  return '#ef4444'
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

// ─── Taux de réussite par question ───

export function buildQuestionSuccess(sessions: SessionResult[]): QuestionSuccess[] {
  if (sessions.length === 0) return []

  const questionMap = new Map<number, { total: number; correct: number; enonce: string; type: string }>()

  sessions.forEach((s) => {
    const details = s.resultat?.detailParQuestion
    if (!details || !Array.isArray(details)) return
    details.forEach((q: QuestionDetail) => {
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
