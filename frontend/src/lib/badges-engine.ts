/**
 * badges-engine.ts — Types pour la gamification.
 *
 * BUGFIX (BADGES-FIX-1) : le type BadgeWithProgress a été mis à jour pour
 * matcher le format réel retourné par le backend (LEFT JOIN BadgeDefinition +
 * BadgeProgression) et consommé par badges-carousel.tsx. L'ancien type stub
 * (nom/niveau/progression) ne correspondait pas aux champs réellement utilisés
 * par le composant (titre/niveauActuel/valeurActuelle/niveaux[]).
 */

export type NiveauBadge = 'BRONZE' | 'ARGENT' | 'OR' | 'DIAMANT'

export interface NiveauSeuil {
  niveau: NiveauBadge
  seuil: number
  reward?: string
}

export interface BadgeWithProgress {
  id: string
  cle: string
  titre: string
  description: string
  icone: string
  categorie: string
  roleCible: string
  // Progression de l'utilisateur (null si pas encore de progression)
  niveauActuel: NiveauBadge | null
  valeurActuelle: number
  valeurPalier: number
  valeurProchain: number | null
  debloque: boolean
  dateObtention?: string | null
  // Niveaux/paliers du badge (définis dans BadgeDefinition.niveaux)
  niveaux: NiveauSeuil[]
  // Progression 0-100 pour la barre de progression
  progression: number
  // Flag pour animation "nouvellement débloqué"
  isNewlyUnlocked?: boolean
}

// Config des niveaux (couleurs pour l'affichage). Étendue avec bgColor et
// glowColor utilisés par badges-carousel.tsx.
export const NIVEAU_CONFIG: Record<NiveauBadge, { color: string; label: string; bgColor: string; glowColor: string }> = {
  BRONZE: { color: 'text-amber-700', label: 'Bronze', bgColor: 'bg-amber-100 dark:bg-amber-950', glowColor: 'shadow-amber-400/30' },
  ARGENT: { color: 'text-slate-500', label: 'Argent', bgColor: 'bg-slate-100 dark:bg-slate-800', glowColor: 'shadow-slate-400/30' },
  OR: { color: 'text-yellow-600', label: 'Or', bgColor: 'bg-yellow-100 dark:bg-yellow-950', glowColor: 'shadow-yellow-400/40' },
  DIAMANT: { color: 'text-cyan-600', label: 'Diamant', bgColor: 'bg-cyan-100 dark:bg-cyan-950', glowColor: 'shadow-cyan-400/40' },
}

export const CATEGORIE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  EVALUATION: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', icon: 'FileText', label: 'Évaluation' },
  CORRECTION: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', icon: 'PenTool', label: 'Correction' },
  IA: { color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300', icon: 'Sparkles', label: 'IA' },
  PEDAGOGIE: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', icon: 'GraduationCap', label: 'Pédagogie' },
  PARTICIPATION: { color: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300', icon: 'Users', label: 'Participation' },
  EXCELLENCE: { color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', icon: 'Trophy', label: 'Excellence' },
}
