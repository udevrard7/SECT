// ════════════════════════════════════════════════════════════════════
// ouvrages-types.ts — miroir TypeScript des types Go de la bibliothèque
// numérique (backend/internal/domain/ouvrage.go + transport/http/
// ouvrage_handlers.go, ADR-0007 P1).
// Toute modification ici doit être reflétée côté Go.
// ════════════════════════════════════════════════════════════════════

export type CategorieOuvrage =
  | 'REFERENTIEL_OFFICIEL'
  | 'OUVRAGE_REFERENCE'
  | 'RECHERCHE_ACADEMIQUE'
  | 'PRATIQUE_PROFESSIONNELLE'

export const CATEGORIES_OUVRAGE: {
  value: CategorieOuvrage
  label: string
  description: string
}[] = [
  {
    value: 'REFERENTIEL_OFFICIEL',
    label: 'Référentiel officiel',
    description: 'Programmes et standards officiels — normatif pur',
  },
  {
    value: 'OUVRAGE_REFERENCE',
    label: 'Ouvrage de référence',
    description: 'Manuels et traités — référence normative',
  },
  {
    value: 'RECHERCHE_ACADEMIQUE',
    label: 'Recherche académique',
    description: 'Articles et thèses — preuve',
  },
  {
    value: 'PRATIQUE_PROFESSIONNELLE',
    label: 'Pratique professionnelle',
    description: 'Cas métiers et guides — contexte',
  },
]

export function categorieLabel(c: CategorieOuvrage): string {
  return CATEGORIES_OUVRAGE.find((x) => x.value === c)?.label ?? c
}

export const NIVEAUX_ETUDE: string[] = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']

export interface OuvrageFiliereRef {
  id: string
  code: string
  nom: string
}

export interface Ouvrage {
  id: string
  etablissementId: string
  titre: string
  /** JSON string (array d'auteurs) ou null */
  auteurs?: string | null
  categorie: CategorieOuvrage
  editeur?: string | null
  edition?: string | null
  anneePublication?: number | null
  isbn?: string | null
  langue?: string | null
  /** NULL = « toutes filières » (recommandation, pas un cache) */
  filiereId?: string | null
  /** enum NiveauEtude en DB — NULL = « tous niveaux » */
  niveau?: string | null
  /** JSON string (array de thèmes) ou null */
  themes?: string | null
  description?: string | null
  licenceOrigine: string
  dateExpirationDroits?: string | null
  nomFichier: string
  cheminStockage?: string | null
  tailleFichier: number
  typeMime: string
  telechargementAutorise: boolean
  createdById: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  /** Dérivé côté backend — badge UI ADMIN (lecteurs : jamais reçu) */
  droitsExpires?: boolean
  filiere?: OuvrageFiliereRef | null
}

export interface OuvrageListResult {
  ouvrages: Ouvrage[]
  total: number
  page: number
  limit: number
}

export interface OuvrageAuditInfo {
  ouvrageId: string
  titre: string
  categorie: CategorieOuvrage
  expiresIn: number
}

/** Taille affichable (Ko/Mo) — util partagé. */
export function tailleAffichable(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`
  return `${octets} o`
}

/** Auteurs : la colonne est un JSON array (TEXT) — parser défensivement. */
export function parseAuteurs(json?: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
