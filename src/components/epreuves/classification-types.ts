// ─── Classification Types ───
// Shared types for the epreuves classification system

export interface ClassificationTreeNode {
  id: string
  nom: string
  code: string | null
  count: number
  niveaux: Array<{
    niveau: string
    count: number
    unites: Array<{
      id: string
      code: string
      nom: string
      count: number
    }>
  }>
}

export interface ClassificationTree {
  filieres: ClassificationTreeNode[]
  nonClassees: number
}

export interface ClassificationStats {
  byFiliere: Array<{
    filiereId: string
    filiereNom: string
    filiereCode: string | null
    count: number
  }>
  byNiveau: Array<{
    niveau: string
    count: number
  }>
  bySessionExamen: Array<{
    sessionExamen: string
    count: number
  }>
  byAnneeAcademique: Array<{
    anneeAcademiqueId: string
    libelle: string
    count: number
  }>
  byUniteEnseignement: Array<{
    ueId: string
    ueCode: string
    ueNom: string
    count: number
  }>
  byStatut: Array<{
    statut: string
    count: number
  }>
  total: number
  nonClassees: number
}

export type GroupByField =
  | 'filiere'
  | 'niveau'
  | 'ue'
  | 'sessionExamen'
  | 'anneeAcademique'

export interface SelectedPath {
  filiereId?: string
  niveau?: string
  uniteId?: string
}

// ─── Shared Constants ───

export const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1 — Licence 1',
  L2: 'L2 — Licence 2',
  L3: 'L3 — Licence 3',
  M1: 'M1 — Master 1',
  M2: 'M2 — Master 2',
  DOCTORAT: 'Doctorat',
}

export const SESSION_EXAMEN_LABELS: Record<string, string> = {
  NORMALE: 'Normale',
  RATTRAPAGE: 'Rattrapage',
  SPECIALE: 'Spéciale',
  EXCEPTIONNELLE: 'Exceptionnelle',
  DIFFERE: 'Différé',
}

export const SESSION_EXAMEN_COLORS: Record<string, string> = {
  NORMALE:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  RATTRAPAGE:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  SPECIALE:
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
  EXCEPTIONNELLE:
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
  DIFFERE:
    'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
}

export const NIVEAU_COLORS: Record<string, string> = {
  L1: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  L2: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800',
  L3: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  M1: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  M2: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
  DOCTORAT:
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
}
