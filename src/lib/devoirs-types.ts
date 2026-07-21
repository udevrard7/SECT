/**
 * Devoirs & Soumissions — Types partagés (frontend ↔ backend).
 *
 * Alignés EXACTEMENT sur les DTOs backend (cf. backend/internal/transport/devoir_handlers.go).
 * Toute modification ici doit être refletée côté Go.
 */

export type StatutDevoir = 'BROUILLON' | 'PUBLIE' | 'FERME' | 'ARCHIVE'
export type StatutSoumission = 'BROUILLON' | 'SOUMIS' | 'CORRIGE' | 'RETOURNE'
export type TypeSeance = 'CM' | 'TD' | 'TP'

/**
 * Statut du worker IA pour une soumission.
 * - EN_ATTENTE : soumission reçue, pas encore d'évaluation IA demandée
 * - EN_COURS   : worker async en train de traiter (POST /ai-grade renvoyé 202)
 * - TERMINE    : noteIA + justificationIA disponibles
 * - ERREUR     : erreurIA contient le message d'erreur
 */
export type StatutIA = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'ERREUR'

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
  filiere?: { id: string; nom: string; code?: string } | null
}

/**
 * Soumission — réplique exacte du DTO backend `soumissionDTO`.
 * - fichiersSoumis : JSON string des clés R2 (sérialisée par le backend).
 */
export interface Soumission {
  id: string
  devoirId: string
  etudiantId: string
  contenuTexte: string | null
  /** JSON string des clés R2 (sérialisée backend). Parser côté client si besoin. */
  fichiersSoumis: string | null
  commentaireEtudiant: string | null
  statut: StatutSoumission
  renduAt: string | null
  note: number | null
  commentaireEnseignant: string | null
  noteIA: number | null
  justificationIA: string | null
  /** NOUVEAU P4 — statut du worker IA. */
  statutIA: StatutIA
  /** NOUVEAU P4 — message d'erreur si statutIA === 'ERREUR'. */
  erreurIA: string | null
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string; matricule?: string | null }
}

/**
 * Devoir — réplique du DTO backend `devoirDTO` / `devoirDetailDTO`.
 *
 * - GET /api/devoirs?enseignantId=X      → liste (sans Soumission[])
 * - GET /api/devoirs/{id}                 → détail AVEC Soumission[] complète
 * - GET /api/devoirs?etudiantId=X         → liste avec `soumission` (la sienne) jointe
 */
export interface Devoir {
  id: string
  titre: string
  description: string | null
  consignes: string | null
  uniteEnseignementId: string
  enseignantId: string
  typeSeance: TypeSeance
  datePublication: string | null
  dateLimite: string
  noteMax: number
  /** Type MIME autorisé pour les fichiers (ex: "application/pdf,image/png"). */
  renduFichiers: string | null
  soumissionGroupe: boolean
  nbMaxFichiers: number
  /** En OCTETS côté backend (convertir en Mo pour l'affichage). */
  tailleMaxFichier: number
  statut: StatutDevoir
  anneeUniversitaire: string
  createdAt: string
  updatedAt: string
  User: { id: string; name: string; email: string }
  UniteEnseignement: { id: string; code: string; nom: string; niveau?: string }
  /** criteres = JSON string (sérialisée backend). */
  GrilleEvaluation: { id: string; criteres: string } | null
  /** Count des soumissions au statut SOUMIS (visible enseignant). */
  soumissionCount: number
  /** Présent uniquement dans GET /api/devoirs/{id} (détail enseignant). */
  Soumission?: Soumission[]
  /** Présent uniquement dans GET /api/devoirs?etudiantId=X (la soumission de l'étudiant). */
  soumission?: Partial<Soumission> | null
}

export interface GrilleEvaluation {
  id: string
  devoirId: string
  criteres: string
  createdAt?: string
  updatedAt?: string
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
  /** Répartition par type de séance. */
  byType: Array<{ type: string; count: number; label: string }>
  /** Soumissions par statut. */
  soumissionsByStatut: Array<{ statut: string; count: number; label: string }>
  /** Timeline 7 derniers jours (soumissions reçues). */
  timeline: Array<{ date: string; soumissions: number }>
  /** Moyenne des notes attribuées (sur 20), null si aucune note. */
  moyenneNotes: number | null
}

// ─── Libellés & helpers UI ───

export const STATUT_DEVOIR_LABELS: Record<StatutDevoir, string> = {
  BROUILLON: 'Brouillon',
  PUBLIE: 'Publié',
  FERME: 'Fermé',
  ARCHIVE: 'Archivé',
}

export const STATUT_SOUMISSION_LABELS: Record<StatutSoumission, string> = {
  BROUILLON: 'Brouillon',
  SOUMIS: 'Soumis',
  CORRIGE: 'Corrigé',
  RETOURNE: 'Rendu',
}

export const STATUT_IA_LABELS: Record<StatutIA, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  ERREUR: 'Erreur',
}

export const TYPE_SEANCE_LABELS: Record<TypeSeance, string> = {
  CM: 'Cours magistral',
  TD: 'Travail dirigé',
  TP: 'Travaux pratiques',
}
