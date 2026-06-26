/**
 * Devoirs & Soumissions — Types partagés (frontend ↔ backend)
 */

export type StatutDevoir = 'BROUILLON' | 'PUBLIE' | 'FERME' | 'ARCHIVE'
export type StatutSoumission = 'BROUILLON' | 'SOUMIS' | 'CORRIGE' | 'RETOURNE'
export type TypeSeance = 'CM' | 'TD' | 'TP'

export interface CritereGrille {
  nom: string
  description: string
  poids: number
}

export interface UniteEnseignement {
  id: string
  code: string
  nom: string
  niveau?: string
  filiere?: { id: string; nom: string; code?: string }
}

export interface Soumission {
  id: string
  devoirId: string
  etudiantId: string
  contenuTexte: string | null
  fichiersSoumis: unknown
  commentaireEtudiant: string | null
  statut: StatutSoumission | string
  renduAt: string | null
  note: number | null
  commentaireEnseignant: string | null
  noteIA: number | null
  justificationIA: string | null
  rapportPlagiat: unknown
  historiqueVersions: unknown
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string; matricule?: string }
}

export interface Devoir {
  id: string
  titre: string
  description: string | null
  consignes: string | null
  uniteEnseignementId: string
  enseignantId: string
  typeSeance: TypeSeance | string
  datePublication: string | null
  dateLimite: string
  noteMax: number
  renduFichiers: unknown
  soumissionGroupe: boolean
  nbMaxFichiers: number
  tailleMaxFichier: number
  statut: StatutDevoir
  anneeUniversitaire: string
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string }
  UniteEnseignement: { id: string; code: string; nom: string; niveau?: string }
  GrilleEvaluation: { id: string; criteres: unknown } | null
  soumissionCount?: number
  Soumission?: Soumission[]
  /** Pour les étudiants : leur soumission jointe */
  soumission?: Partial<Soumission> | null
}

export interface DevoirStats {
  kpis: {
    total: number
    brouillons: number
    publies: number
    fermes: number
    archives: number
    totalSoumissions: number
    soumissionsEnAttente: number
    soumissionsCorrigees: number
    enRetard: number
  }
  /** Répartition par type de séance */
  byType: Array<{ type: string; count: number; label: string }>
  /** Soumissions par statut */
  soumissionsByStatut: Array<{ statut: string; count: number; label: string }>
  /** Timeline 7 derniers jours (soumissions reçues) */
  timeline: Array<{ date: string; soumissions: number }>
  /** Moyenne des notes attribuées */
  moyenneNotes: number | null
}

export const STATUT_DEVOIR_LABELS: Record<StatutDevoir, string> = {
  BROUILLON: 'Brouillon',
  PUBLIE: 'Publié',
  FERME: 'Fermé',
  ARCHIVE: 'Archivé',
}

export const STATUT_SOUMISSION_LABELS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  SOUMIS: 'Soumis',
  CORRIGE: 'Corrigé',
  RETOURNE: 'Rendu',
}

export const TYPE_SEANCE_LABELS: Record<TypeSeance, string> = {
  CM: 'Cours magistral',
  TD: 'Travail dirigé',
  TP: 'Travaux pratiques',
}
