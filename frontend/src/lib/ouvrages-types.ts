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

// ════════════════════════════════════════════════════════════════════
// SECT-BIBLIO-P2 (ADR-0007 §P2) — lecture mesurée (miroir Go :
// backend/internal/domain/ouvrage_lecture.go + transport/http/
// ouvrage_lecture_handlers.go).
// ════════════════════════════════════════════════════════════════════

/** Progression de lecture d'un utilisateur sur un ouvrage (une ligne par couple). */
export interface OuvrageLecture {
  id: string
  ouvrageId: string
  userId: string
  /** Marque-page — reprise #page=N à l'ouverture du lecteur. */
  dernierePage: number
  /** JSON string {"12": 3} (page → vues) ou null. */
  pagesVues?: string | null
  /** Cumul de temps de lecture en secondes (visibilité-gated côté client). */
  tempsTotalSec: number
  derniereLectureAt: string
  createdAt: string
  updatedAt: string
}

/**
 * Payload PUT /api/ouvrages/{id}/lecture — tous champs optionnels :
 * `tempsDeltaSec` = incrément depuis le dernier flush (heartbeat 30 s) ;
 * `pagesVues` = delta de vues par page (fusionné côté serveur) ;
 * `dernierePage` = marque-page DÉCLARATIF (absent = ne pas toucher —
 * un heartbeat de temps seul ne déplace pas la reprise).
 */
export interface RecordLecturePayload {
  tempsDeltaSec?: number
  pagesVues?: Record<string, number>
  dernierePage?: number
}

/** Ligne d'agrégat d'activité par ouvrage (fonction SECURITY DEFINER 000124). */
export interface OuvrageActivite {
  ouvrageId: string
  titre: string
  /** CategorieOuvrage castée ::text côté SQL (leçon ENUM-SWEEP). */
  categorie: string
  nbLecteurs: number
  pagesVuesTotal: number
  tempsTotalSec: number
  /** ISO date ou null (ouvrage sans lecture). */
  derniereActivite?: string | null
}

/** Réponse GET /api/etablissements/{id}/bibliotheque-activite. */
export interface BibliothequeActiviteResult {
  etablissementId: string
  activite: OuvrageActivite[]
}

/** Temps de lecture affichable (min/h) — util partagé panneau activité. */
export function tempsAffichable(secondes: number): string {
  if (secondes >= 3600) {
    const h = Math.floor(secondes / 3600)
    const m = Math.round((secondes % 3600) / 60)
    return m > 0 ? `${h} h ${m} min` : `${h} h`
  }
  if (secondes >= 60) return `${Math.round(secondes / 60)} min`
  return `${secondes} s`
}

// ════════════════════════════════════════════════════════════════════
// SECT-BIBLIO-P3 (ADR-0007 §P3) — le paquet enseignant
// Miroir des DTO backend (domain/ouvrage_section.go + alignement.go).
// ════════════════════════════════════════════════════════════════════

/** OuvrageSection — entrée du TOC curaté par l'ADMIN (000126). */
export interface OuvrageSection {
  id: string
  ouvrageId: string
  titre: string
  pageDebut?: number | null
  pageFin?: number | null
  ordre: number
  createdAt: string
}

/** AlignementOuvrage — une déclaration support ↔ ouvrage (± section). */
export interface AlignementOuvrage {
  id: string
  documentId: string
  ouvrageId: string
  ouvrageSectionId?: string | null
  declareParId: string
  note?: string | null
  createdAt: string
  updatedAt: string
  ouvrage?: Ouvrage | null
  section?: OuvrageSection | null
}

/** OuvrageSuggestion — une proposition (l'IA propose, l'enseignant décide). */
export interface OuvrageSuggestion {
  ouvrage: Ouvrage
  score: number
  themesCommuns: string[]
  dejaAligne: boolean
}

/** Réponse GET /api/ouvrages/{id}/sections. */
export interface OuvrageSectionsResult {
  sections: OuvrageSection[]
}

/** Réponse GET /api/documents/{id}/alignements. */
export interface AlignementsResult {
  alignements: AlignementOuvrage[]
}

/** Réponse GET /api/documents/{id}/alignements/suggestions. */
export interface SuggestionsResult {
  suggestions: OuvrageSuggestion[]
  message?: string
}

/** ConformiteEpreuve — % questions conformes d'une épreuve (audit P3). */
export interface ConformiteEpreuve {
  epreuveId: string
  titre: string
  nbQuestions: number
  nbQuestionsConformes: number
  tauxConformite: number
}

/** ConformiteSupport — ligne d'audit de direction par support. */
export interface ConformiteSupport {
  documentId: string
  nomFichier: string
  enseignant: string
  ueCode?: string | null
  nbChapitres: number
  nbQuestions: number
  nbQuestionsAlignees: number
  nbAlignements: number
  nbAlignementsReferentiel: number
  tauxCouverture: number
  dernierAlignementAt?: string | null
  epreuves: ConformiteEpreuve[]
}

/** Réponse GET /api/etablissements/{id}/conformite-referentiels. */
export interface ConformiteResult {
  etablissementId: string
  supports: ConformiteSupport[]
}

/** BibliographieReference — une référence générée depuis un alignement. */
export interface BibliographieReference {
  alignementId: string
  note?: string | null
  ouvrage: Ouvrage
  section?: OuvrageSection | null
  creeLe: string
}

/** Réponse GET /api/documents/{id}/bibliographie. */
export interface BibliographieResult {
  documentId: string
  nomFichier: string
  references: BibliographieReference[]
}

/** Format APA-like d'une référence bibliographique (export + fiche). */
export function formatReferenceBibliographique(
  o: Ouvrage,
  section?: OuvrageSection | null,
): string {
  const auteurs = parseAuteurs(o.auteurs)
  const parts: string[] = []
  if (auteurs.length > 0) parts.push(auteurs.join(', '))
  if (o.anneePublication) parts.push(`(${o.anneePublication})`)
  parts.push(`${o.titre}.`)
  if (section) {
    const pages =
      section.pageDebut != null && section.pageFin != null
        ? `, pp. ${section.pageDebut}-${section.pageFin}`
        : section.pageDebut != null
          ? `, p. ${section.pageDebut}`
          : ''
    parts.push(`${section.titre}${pages}.`)
  }
  const editeurParts = [o.editeur, o.edition].filter(Boolean)
  if (editeurParts.length > 0) parts.push(`${editeurParts.join(', ')}.`)
  if (o.isbn) parts.push(`ISBN ${o.isbn}.`)
  return parts.join(' ')
}

// ════════════════════════════════════════════════════════════════════
// SECT-BIBLIO-P4 (ADR-0008) : dimension sociale — annotations,
// propositions (file G1), veilles. Miroirs des DTO Go
// (backend/internal/domain/ouvrage_social.go).
// ════════════════════════════════════════════════════════════════════

export type VisibiliteAnnotation = 'PRIVEE' | 'FILIERE' | 'ETABLISSEMENT'

export function visibiliteAnnotationLabel(v: VisibiliteAnnotation): string {
  switch (v) {
    case 'FILIERE':
      return 'Ma filière'
    case 'ETABLISSEMENT':
      return 'Tout l’établissement'
    default:
      return 'Privée (moi)'
  }
}

/** OuvrageAnnotation — une annotation de page (GET/POST
 * /api/ouvrages/{id}/annotations). */
export interface OuvrageAnnotation {
  id: string
  ouvrageId: string
  userId: string
  userNom: string
  filiereId?: string | null
  page: number
  contenu: string
  visibilite: VisibiliteAnnotation
  createdAt: string
  updatedAt: string
}

export type StatutProposition = 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE'

/** OuvrageProposition — une demande d'ajout (file G1 RESPONSABLE→ADMIN). */
export interface OuvrageProposition {
  id: string
  etablissementId: string
  proposantId: string
  proposantNom: string
  titre: string
  auteurs?: string | null
  categorie: CategorieOuvrage
  editeur?: string | null
  anneePublication?: number | null
  isbn?: string | null
  langue?: string | null
  filiereId?: string | null
  niveau?: string | null
  themes?: string | null
  description?: string | null
  licenceOrigine: string
  statut: StatutProposition
  motifRefus?: string | null
  trancheParId?: string | null
  trancheAt?: string | null
  ouvrageId?: string | null
  ouvrageTitre?: string | null
  createdAt: string
  updatedAt: string
}

/** Réponse GET /api/ouvrages/propositions (pagination normalisée). */
export interface PropositionListResult {
  propositions: OuvrageProposition[]
  total: number
  page: number
  limit: number
}

/** Payload POST /api/ouvrages/propositions (RESPONSABLE). */
export interface CreatePropositionPayload {
  titre: string
  categorie: CategorieOuvrage
  licenceOrigine: string
  auteurs?: string
  editeur?: string
  anneePublication?: number
  isbn?: string
  langue?: string
  filiereId?: string
  niveau?: string
  themes?: string
  description?: string
}

/** OuvrageVeille — une recherche sauvegardée (alerte nouveautés). */
export interface OuvrageVeille {
  id: string
  userId: string
  etablissementId: string
  terme: string
  categorie?: CategorieOuvrage | null
  createdAt: string
  updatedAt: string
}
