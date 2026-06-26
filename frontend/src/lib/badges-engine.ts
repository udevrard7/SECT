/**
 * badges-engine.ts — Stub (logique déplacée vers le backend Go).
 * Types conservés pour la compatibilité des composants frontend.
 */

export interface BadgeWithProgress {
  id: string
  categorie: string
  nom: string
  description: string
  icone: string
  niveau: NiveauBadge
  progression: number
  debloque: boolean
  dateObtention?: string
}

export type NiveauBadge = 'BRONZE' | 'ARGENT' | 'OR' | 'PLATINE'

export const NIVEAU_CONFIG: Record<NiveauBadge, { color: string; label: string }> = {
  BRONZE: { color: '#CD7F32', label: 'Bronze' },
  ARGENT: { color: '#C0C0C0', label: 'Argent' },
  OR: { color: '#FFD700', label: 'Or' },
  PLATINE: { color: '#E5E4E2', label: 'Platine' },
}

export const CATEGORIE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {}
