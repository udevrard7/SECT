/**
 * ─── Moteur de Badges Dynamiques ───
 *
 * Ce module centralise toutes les définitions de badges et la logique
 * de calcul de progression. Il est conçu pour être évolutif :
 *
 * - Ajouter un badge = ajouter une entrée dans BADGE_DEFINITIONS
 * - La progression est calculée dynamiquement à partir des données réelles
 * - Les niveaux (Bronze → Diamant) offrent une progression continue
 * - Chaque rôle a ses propres badges pertinents
 */

import { db, withRetry } from '@/lib/db'

// ─── Types ───

export type NiveauBadge = 'BRONZE' | 'ARGENT' | 'OR' | 'DIAMANT'
export type CategorieBadge = 'EVALUATION' | 'CORRECTION' | 'IA' | 'ENGAGEMENT' | 'EXCELLENCE' | 'PEDAGOGIE' | 'GESTION'
export type RoleCible = 'ADMIN' | 'RESPONSABLE' | 'ENSEIGNANT' | 'ETUDIANT'

export interface NiveauDefinition {
  niveau: NiveauBadge
  seuil: number           // Valeur à atteindre pour ce niveau
  label: string           // Description du palier (ex: "Terminer 1 épreuve")
}

export interface BadgeDefinitionConfig {
  cle: string
  titre: string
  description: string
  icone: string           // Nom de l'icône Lucide
  categorie: CategorieBadge
  rolesCibles: RoleCible[]
  niveaux: NiveauDefinition[]
  ordre: number
}

export interface BadgeWithProgress {
  cle: string
  titre: string
  description: string
  icone: string
  categorie: CategorieBadge
  niveauActuel: NiveauBadge
  niveaux: NiveauDefinition[]
  valeurActuelle: number
  valeurPalier: number
  valeurProchain: number | null
  debloque: boolean
  progression: number     // 0-100% de progression vers le prochain niveau
  dateObtention: string | null
  isNewlyUnlocked: boolean
}

// ─── Définitions de tous les badges ───

export const BADGE_DEFINITIONS: BadgeDefinitionConfig[] = [
  // ═══════════════════════════════════════════
  // 🎓 BADGES ÉTUDIANT
  // ═══════════════════════════════════════════

  {
    cle: 'bapteme_du_feu',
    titre: 'Baptême du Feu',
    description: 'Terminer des épreuves pour la première fois',
    icone: 'Flame',
    categorie: 'EVALUATION',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Terminer 1 épreuve' },
      { niveau: 'ARGENT', seuil: 5, label: 'Terminer 5 épreuves' },
      { niveau: 'OR', seuil: 15, label: 'Terminer 15 épreuves' },
      { niveau: 'DIAMANT', seuil: 30, label: 'Terminer 30 épreuves' },
    ],
    ordre: 1,
  },
  {
    cle: 'bien_joue',
    titre: 'Bien Joué !',
    description: 'Obtenir des bonnes notes aux épreuves',
    icone: 'ThumbsUp',
    categorie: 'EXCELLENCE',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: '1 note ≥ 12/20' },
      { niveau: 'ARGENT', seuil: 5, label: '5 notes ≥ 12/20' },
      { niveau: 'OR', seuil: 15, label: '15 notes ≥ 12/20' },
      { niveau: 'DIAMANT', seuil: 30, label: '30 notes ≥ 12/20' },
    ],
    ordre: 2,
  },
  {
    cle: 'major_de_promo',
    titre: 'Major de Promo',
    description: 'Obtenir des notes exceptionnelles',
    icone: 'Trophy',
    categorie: 'EXCELLENCE',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: '1 note ≥ 16/20' },
      { niveau: 'ARGENT', seuil: 3, label: '3 notes ≥ 16/20' },
      { niveau: 'OR', seuil: 7, label: '7 notes ≥ 16/20' },
      { niveau: 'DIAMANT', seuil: 15, label: '15 notes ≥ 16/20' },
    ],
    ordre: 3,
  },
  {
    cle: 'eclair_de_genie',
    titre: 'Éclair de Génie',
    description: 'Terminer des épreuves très rapidement',
    icone: 'Zap',
    categorie: 'EVALUATION',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: '1 épreuve en < 50% du temps' },
      { niveau: 'ARGENT', seuil: 5, label: '5 épreuves en < 50% du temps' },
      { niveau: 'OR', seuil: 15, label: '15 épreuves rapides' },
      { niveau: 'DIAMANT', seuil: 30, label: '30 épreuves rapides' },
    ],
    ordre: 4,
  },
  {
    cle: 'persévérant',
    titre: 'Persévérant',
    description: 'Se connecter régulièrement sur la plateforme',
    icone: 'CalendarCheck',
    categorie: 'ENGAGEMENT',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 7, label: 'Se connecter 7 jours' },
      { niveau: 'ARGENT', seuil: 30, label: 'Se connecter 30 jours' },
      { niveau: 'OR', seuil: 100, label: 'Se connecter 100 jours' },
      { niveau: 'DIAMANT', seuil: 365, label: 'Se connecter 365 jours' },
    ],
    ordre: 5,
  },
  {
    cle: 'zero_faute',
    titre: 'Zéro Faute',
    description: 'Obtenir un score parfait à une épreuve',
    icone: 'CheckCircle2',
    categorie: 'EXCELLENCE',
    rolesCibles: ['ETUDIANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: '1 score parfait (20/20)' },
      { niveau: 'ARGENT', seuil: 3, label: '3 scores parfaits' },
      { niveau: 'OR', seuil: 7, label: '7 scores parfaits' },
      { niveau: 'DIAMANT', seuil: 15, label: '15 scores parfaits' },
    ],
    ordre: 6,
  },

  // ═══════════════════════════════════════════
  // 👨‍🏫 BADGES ENSEIGNANT
  // ═══════════════════════════════════════════

  {
    cle: 'premiere_epreuve',
    titre: 'Première Épreuve',
    description: 'Créer des épreuves pour vos étudiants',
    icone: 'FileText',
    categorie: 'EVALUATION',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Créer 1 épreuve' },
      { niveau: 'ARGENT', seuil: 10, label: 'Créer 10 épreuves' },
      { niveau: 'OR', seuil: 25, label: 'Créer 25 épreuves' },
      { niveau: 'DIAMANT', seuil: 50, label: 'Créer 50 épreuves' },
    ],
    ordre: 10,
  },
  {
    cle: 'maitre_corrigeur',
    titre: 'Maître Corrigeur',
    description: 'Corriger des copies avec rigueur',
    icone: 'PenTool',
    categorie: 'CORRECTION',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Corriger 1 copie' },
      { niveau: 'ARGENT', seuil: 10, label: 'Corriger 10 copies' },
      { niveau: 'OR', seuil: 50, label: 'Corriger 50 copies' },
      { niveau: 'DIAMANT', seuil: 200, label: 'Corriger 200 copies' },
    ],
    ordre: 11,
  },
  {
    cle: 'createur_ia',
    titre: 'Créateur IA',
    description: 'Générer des épreuves avec l\'intelligence artificielle',
    icone: 'Sparkles',
    categorie: 'IA',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Générer 1 épreuve IA' },
      { niveau: 'ARGENT', seuil: 5, label: 'Générer 5 épreuves IA' },
      { niveau: 'OR', seuil: 15, label: 'Générer 15 épreuves IA' },
      { niveau: 'DIAMANT', seuil: 30, label: 'Générer 30 épreuves IA' },
    ],
    ordre: 12,
  },
  {
    cle: 'excellence_pedagogique',
    titre: 'Excellence Pédagogique',
    description: 'Vos étudiants obtiennent d\'excellents résultats',
    icone: 'GraduationCap',
    categorie: 'PEDAGOGIE',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 10, label: 'Moyenne ≥ 10/20 sur 5+ copies' },
      { niveau: 'ARGENT', seuil: 12, label: 'Moyenne ≥ 12/20 sur 15+ copies' },
      { niveau: 'OR', seuil: 14, label: 'Moyenne ≥ 14/20 sur 30+ copies' },
      { niveau: 'DIAMANT', seuil: 16, label: 'Moyenne ≥ 16/20 sur 50+ copies' },
    ],
    ordre: 13,
  },
  {
    cle: 'banquier_questions',
    titre: 'Banquier de Questions',
    description: 'Alimenter la banque de questions',
    icone: 'Library',
    categorie: 'PEDAGOGIE',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 10, label: 'Créer 10 questions' },
      { niveau: 'ARGENT', seuil: 50, label: 'Créer 50 questions' },
      { niveau: 'OR', seuil: 150, label: 'Créer 150 questions' },
      { niveau: 'DIAMANT', seuil: 500, label: 'Créer 500 questions' },
    ],
    ordre: 14,
  },
  {
    cle: 'correcteur_rapide',
    titre: 'Correcteur Éclair',
    description: 'Corriger les copies rapidement après soumission',
    icone: 'Clock',
    categorie: 'CORRECTION',
    rolesCibles: ['ENSEIGNANT'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 5, label: '5 copies corrigées sous 24h' },
      { niveau: 'ARGENT', seuil: 20, label: '20 copies corrigées sous 24h' },
      { niveau: 'OR', seuil: 50, label: '50 copies corrigées sous 24h' },
      { niveau: 'DIAMANT', seuil: 100, label: '100 copies corrigées sous 24h' },
    ],
    ordre: 15,
  },

  // ═══════════════════════════════════════════
  // 🏢 BADGES RESPONSABLE
  // ═══════════════════════════════════════════

  {
    cle: 'batisseur',
    titre: 'Bâtisseur',
    description: 'Superviser des évaluations dans votre établissement',
    icone: 'ClipboardCheck',
    categorie: 'EVALUATION',
    rolesCibles: ['RESPONSABLE'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Superviser 1 évaluation' },
      { niveau: 'ARGENT', seuil: 10, label: 'Superviser 10 évaluations' },
      { niveau: 'OR', seuil: 30, label: 'Superviser 30 évaluations' },
      { niveau: 'DIAMANT', seuil: 100, label: 'Superviser 100 évaluations' },
    ],
    ordre: 20,
  },
  {
    cle: 'pilier_academique',
    titre: 'Pilier Académique',
    description: 'Développer le nombre d\'étudiants dans votre établissement',
    icone: 'Users',
    categorie: 'GESTION',
    rolesCibles: ['RESPONSABLE'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 10, label: '10 étudiants inscrits' },
      { niveau: 'ARGENT', seuil: 50, label: '50 étudiants inscrits' },
      { niveau: 'OR', seuil: 150, label: '150 étudiants inscrits' },
      { niveau: 'DIAMANT', seuil: 500, label: '500 étudiants inscrits' },
    ],
    ordre: 21,
  },
  {
    cle: 'visionnaire',
    titre: 'Visionnaire',
    description: 'Atteindre un taux de réussite élevé dans votre établissement',
    icone: 'Eye',
    categorie: 'EXCELLENCE',
    rolesCibles: ['RESPONSABLE'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 60, label: 'Taux de réussite ≥ 60%' },
      { niveau: 'ARGENT', seuil: 70, label: 'Taux de réussite ≥ 70%' },
      { niveau: 'OR', seuil: 80, label: 'Taux de réussite ≥ 80%' },
      { niveau: 'DIAMANT', seuil: 90, label: 'Taux de réussite ≥ 90%' },
    ],
    ordre: 22,
  },
  {
    cle: 'architecte_filiaire',
    titre: 'Architecte Filière',
    description: 'Structurer les programmes académiques',
    icone: 'Network',
    categorie: 'PEDAGOGIE',
    rolesCibles: ['RESPONSABLE'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Créer 1 filière' },
      { niveau: 'ARGENT', seuil: 3, label: 'Créer 3 filières' },
      { niveau: 'OR', seuil: 5, label: 'Créer 5 filières' },
      { niveau: 'DIAMANT', seuil: 10, label: 'Créer 10 filières' },
    ],
    ordre: 23,
  },

  // ═══════════════════════════════════════════
  // 🛡️ BADGES ADMIN
  // ═══════════════════════════════════════════

  {
    cle: 'gardien_plateforme',
    titre: 'Gardien de la Plateforme',
    description: 'Gérer les établissements sur SECT',
    icone: 'Shield',
    categorie: 'GESTION',
    rolesCibles: ['ADMIN'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Gérer 1 établissement' },
      { niveau: 'ARGENT', seuil: 5, label: 'Gérer 5 établissements' },
      { niveau: 'OR', seuil: 15, label: 'Gérer 15 établissements' },
      { niveau: 'DIAMANT', seuil: 50, label: 'Gérer 50 établissements' },
    ],
    ordre: 30,
  },
  {
    cle: 'strategiste',
    titre: 'Stratège',
    description: 'Maintenir un taux de réussite global élevé',
    icone: 'Target',
    categorie: 'EXCELLENCE',
    rolesCibles: ['ADMIN'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 50, label: 'Taux réussite global ≥ 50%' },
      { niveau: 'ARGENT', seuil: 65, label: 'Taux réussite global ≥ 65%' },
      { niveau: 'OR', seuil: 75, label: 'Taux réussite global ≥ 75%' },
      { niveau: 'DIAMANT', seuil: 85, label: 'Taux réussite global ≥ 85%' },
    ],
    ordre: 31,
  },
  {
    cle: 'pilote_ia',
    titre: 'Pilote IA',
    description: 'Configurer les providers IA pour la plateforme',
    icone: 'Cpu',
    categorie: 'IA',
    rolesCibles: ['ADMIN'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 1, label: 'Configurer 1 provider IA' },
      { niveau: 'ARGENT', seuil: 2, label: 'Configurer 2 providers IA' },
      { niveau: 'OR', seuil: 3, label: 'Configurer 3 providers IA' },
      { niveau: 'DIAMANT', seuil: 5, label: 'Configurer 5 providers IA' },
    ],
    ordre: 32,
  },
  {
    cle: 'sensei',
    titre: 'Senseï',
    description: 'Accompagner les enseignants sur la plateforme',
    icone: 'HeartHandshake',
    categorie: 'ENGAGEMENT',
    rolesCibles: ['ADMIN'],
    niveaux: [
      { niveau: 'BRONZE', seuil: 5, label: '5 enseignants actifs' },
      { niveau: 'ARGENT', seuil: 20, label: '20 enseignants actifs' },
      { niveau: 'OR', seuil: 50, label: '50 enseignants actifs' },
      { niveau: 'DIAMANT', seuil: 100, label: '100 enseignants actifs' },
    ],
    ordre: 33,
  },
]

// ─── Couleurs et labels par niveau ───

export const NIVEAU_CONFIG: Record<NiveauBadge, { label: string; color: string; bgColor: string; borderColor: string; glowColor: string }> = {
  BRONZE: {
    label: 'Bronze',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    borderColor: 'border-amber-400',
    glowColor: 'shadow-amber-400/30',
  },
  ARGENT: {
    label: 'Argent',
    color: 'text-slate-600 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-800/50',
    borderColor: 'border-slate-400',
    glowColor: 'shadow-slate-400/30',
  },
  OR: {
    label: 'Or',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/50',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-400/30',
  },
  DIAMANT: {
    label: 'Diamant',
    color: 'text-cyan-600 dark:text-cyan-300',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/50',
    borderColor: 'border-cyan-400',
    glowColor: 'shadow-cyan-400/40',
  },
}

export const CATEGORIE_CONFIG: Record<CategorieBadge, { label: string; color: string }> = {
  EVALUATION: { label: 'Évaluation', color: 'text-blue-600' },
  CORRECTION: { label: 'Correction', color: 'text-green-600' },
  IA: { label: 'Intelligence Artificielle', color: 'text-purple-600' },
  ENGAGEMENT: { label: 'Engagement', color: 'text-orange-600' },
  EXCELLENCE: { label: 'Excellence', color: 'text-amber-600' },
  PEDAGOGIE: { label: 'Pédagogie', color: 'text-rose-600' },
  GESTION: { label: 'Gestion', color: 'text-teal-600' },
}

// ─── Fonctions de calcul de progression ───

interface BadgeMetrics {
  // Étudiant
  nbEpreuvesTerminees?: number
  nbNotesSup12?: number
  nbNotesSup16?: number
  nbEpreuvesRapides?: number
  nbScoresParfaits?: number
  nbJoursConnexion?: number

  // Enseignant
  nbEpreuvesCreees?: number
  nbCopiesCorrigees?: number
  nbEpreuvesIA?: number
  moyenneEtudiants?: number
  nbCopiesPourMoyenne?: number
  nbQuestionsCreees?: number
  nbCorrectionsRapides?: number

  // Responsable
  nbEvaluations?: number
  nbEtudiants?: number
  tauxReussite?: number
  nbFilieres?: number

  // Admin
  nbEtablissements?: number
  tauxReussiteGlobal?: number
  nbProvidersIA?: number
  nbEnseignantsActifs?: number
}

/**
 * Calcule la valeur métrique pour un badge donné à partir des métriques fournies.
 */
function getMetricValue(cle: string, metrics: BadgeMetrics): number {
  switch (cle) {
    // Étudiant
    case 'bapteme_du_feu': return metrics.nbEpreuvesTerminees ?? 0
    case 'bien_joue': return metrics.nbNotesSup12 ?? 0
    case 'major_de_promo': return metrics.nbNotesSup16 ?? 0
    case 'eclair_de_genie': return metrics.nbEpreuvesRapides ?? 0
    case 'persévérant': return metrics.nbJoursConnexion ?? 0
    case 'zero_faute': return metrics.nbScoresParfaits ?? 0

    // Enseignant
    case 'premiere_epreuve': return metrics.nbEpreuvesCreees ?? 0
    case 'maitre_corrigeur': return metrics.nbCopiesCorrigees ?? 0
    case 'createur_ia': return metrics.nbEpreuvesIA ?? 0
    case 'excellence_pedagogique':
      // Pour ce badge, la métrique est la moyenne (seuil = note minimale)
      // mais on ne valide que si on a assez de copies
      if ((metrics.nbCopiesPourMoyenne ?? 0) < 5) return 0
      return metrics.moyenneEtudiants ?? 0
    case 'banquier_questions': return metrics.nbQuestionsCreees ?? 0
    case 'correcteur_rapide': return metrics.nbCorrectionsRapides ?? 0

    // Responsable
    case 'batisseur': return metrics.nbEvaluations ?? 0
    case 'pilier_academique': return metrics.nbEtudiants ?? 0
    case 'visionnaire': return metrics.tauxReussite ?? 0
    case 'architecte_filiaire': return metrics.nbFilieres ?? 0

    // Admin
    case 'gardien_plateforme': return metrics.nbEtablissements ?? 0
    case 'strategiste': return metrics.tauxReussiteGlobal ?? 0
    case 'pilote_ia': return metrics.nbProvidersIA ?? 0
    case 'sensei': return metrics.nbEnseignantsActifs ?? 0

    default: return 0
  }
}

/**
 * Calcule la progression et le niveau pour un badge donné.
 */
export function computeBadgeProgress(
  definition: BadgeDefinitionConfig,
  metrics: BadgeMetrics
): Omit<BadgeWithProgress, 'isNewlyUnlocked'> {
  const valeurActuelle = getMetricValue(definition.cle, metrics)
  const niveaux = definition.niveaux

  // Trouver le niveau actuel et les paliers
  let niveauActuel: NiveauBadge = 'BRONZE'
  let valeurPalier = niveaux[0].seuil
  let valeurProchain: number | null = niveaux.length > 1 ? niveaux[1].seuil : null
  let debloque = false
  let dateObtention: string | null = null

  // Vérifier chaque niveau du plus haut au plus bas
  for (let i = niveaux.length - 1; i >= 0; i--) {
    if (valeurActuelle >= niveaux[i].seuil) {
      niveauActuel = niveaux[i].niveau
      valeurPalier = niveaux[i].seuil
      valeurProchain = i < niveaux.length - 1 ? niveaux[i + 1].seuil : null
      debloque = true
      break
    }
  }

  // Si pas encore débloquent, le palier est le premier niveau
  if (!debloque) {
    niveauActuel = 'BRONZE'
    valeurPalier = niveaux[0].seuil
    valeurProchain = niveaux.length > 1 ? niveaux[1].seuil : null
  }

  // Calculer la progression (0-100) vers le prochain niveau
  let progression = 0
  if (valeurProchain !== null && valeurProchain > valeurPalier) {
    const range = valeurProchain - valeurPalier
    const current = Math.max(0, valeurActuelle - valeurPalier)
    progression = Math.min(100, Math.round((current / range) * 100))
  } else if (debloque && valeurProchain === null) {
    // Niveau maximum atteint
    progression = 100
  } else if (!debloque && valeurPalier > 0) {
    // Pas encore débloquent, progression vers le premier niveau
    progression = Math.min(100, Math.round((valeurActuelle / valeurPalier) * 100))
  }

  return {
    cle: definition.cle,
    titre: definition.titre,
    description: definition.description,
    icone: definition.icone,
    categorie: definition.categorie,
    niveauActuel,
    niveaux,
    valeurActuelle,
    valeurPalier,
    valeurProchain,
    debloque,
    progression,
    dateObtention,
  }
}

// ─── Collecteurs de métriques par rôle ───

/**
 * Collecte les métriques pour un étudiant
 */
export async function collectEtudiantMetrics(userId: string): Promise<BadgeMetrics> {
  const sessions = await withRetry(() =>
    db.sessionPassation.findMany({
      where: {
        etudiantId: userId,
        statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] },
        score: { not: null },
      },
      include: {
        epreuve: { select: { duree: true, noteTotal: true } },
        resultat: { select: { totalPossible: true, detailParQuestion: true } },
      },
    })
  )

  const nbEpreuvesTerminees = sessions.length

  let nbNotesSup12 = 0
  let nbNotesSup16 = 0
  let nbScoresParfaits = 0
  let nbEpreuvesRapides = 0

  for (const s of sessions) {
    const totalPossible = s.resultat?.totalPossible || s.epreuve.noteTotal || 20
    const normalizedScore = totalPossible > 0 ? ((s.score || 0) / totalPossible) * 20 : 0

    if (normalizedScore >= 12) nbNotesSup12++
    if (normalizedScore >= 16) nbNotesSup16++
    if (normalizedScore >= 19.5) nbScoresParfaits++

    // Vérifier la rapidité
    if (s.dateDebut && s.dateFin && s.epreuve.duree) {
      const timeTaken = (s.dateFin.getTime() - s.dateDebut.getTime()) / (1000 * 60)
      if (timeTaken < s.epreuve.duree / 2) nbEpreuvesRapides++
    }
  }

  // Jours de connexion (approximation basée sur derniereConnexion)
  const user = await withRetry(() =>
    db.user.findUnique({
      where: { id: userId },
      select: { derniereConnexion: true, createdAt: true },
    })
  )
  const nbJoursConnexion = user?.derniereConnexion
    ? Math.max(1, Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  return {
    nbEpreuvesTerminees,
    nbNotesSup12,
    nbNotesSup16,
    nbEpreuvesRapides,
    nbScoresParfaits,
    nbJoursConnexion,
  }
}

/**
 * Collecte les métriques pour un enseignant
 */
export async function collectEnseignantMetrics(userId: string): Promise<BadgeMetrics> {
  const [nbEpreuvesCreees, nbQuestionsCreees, nbEpreuvesIA] = await Promise.all([
    withRetry(() => db.epreuve.count({ where: { enseignantId: userId, deletedAt: null } })),
    withRetry(() => db.question.count({ where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }], deletedAt: null } })),
    withRetry(() => db.epreuve.count({ where: { enseignantId: userId, generationMode: 'IA_ASSISTEE', deletedAt: null } })),
  ])

  // Copies corrigées
  const nbCopiesCorrigees = await withRetry(() =>
    db.sessionPassation.count({
      where: {
        epreuve: { enseignantId: userId },
        statut: { in: ['CORRIGEE', 'RETOURNEE'] },
      },
    })
  )

  // Moyenne étudiants
  const scoredSessions = await withRetry(() =>
    db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId, deletedAt: null },
        score: { not: null },
      },
      select: { score: true, epreuve: { select: { noteTotal: true } } },
    })
  )
  const nbCopiesPourMoyenne = scoredSessions.length
  const moyenneEtudiants = nbCopiesPourMoyenne > 0
    ? scoredSessions.reduce((sum, s) => {
        const noteTotal = s.epreuve?.noteTotal || 20
        return sum + (s.score! / noteTotal) * 20
      }, 0) / nbCopiesPourMoyenne
    : 0

  // Corrections rapides (< 24h)
  const correctedSessions = await withRetry(() =>
    db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId },
        statut: { in: ['CORRIGEE', 'RETOURNEE'] },
        dateFin: { not: null },
      },
      select: { dateFin: true, updatedAt: true },
    })
  )
  const nbCorrectionsRapides = correctedSessions.filter(s => {
    if (!s.dateFin) return false
    const diffHours = (s.updatedAt.getTime() - s.dateFin.getTime()) / (1000 * 60 * 60)
    return diffHours <= 24
  }).length

  return {
    nbEpreuvesCreees,
    nbCopiesCorrigees,
    nbEpreuvesIA,
    moyenneEtudiants: Math.round(moyenneEtudiants * 10) / 10,
    nbCopiesPourMoyenne,
    nbQuestionsCreees,
    nbCorrectionsRapides,
  }
}

/**
 * Collecte les métriques pour un responsable
 */
export async function collectResponsableMetrics(userId: string, etablissementId: string | null): Promise<BadgeMetrics> {
  if (!etablissementId) return {}

  const [nbEvaluations, nbEtudiants, nbFilieres, sessionsData] = await Promise.all([
    withRetry(() => db.epreuve.count({ where: { enseignant: { etablissementId }, deletedAt: null } })),
    withRetry(() => db.user.count({ where: { etablissementId, role: 'ETUDIANT', actif: true } })),
    withRetry(() => db.filiere.count({ where: { etablissementId } })),
    withRetry(() =>
      db.sessionPassation.findMany({
        where: {
          epreuve: { enseignant: { etablissementId }, deletedAt: null },
          score: { not: null },
        },
        select: { score: true, epreuve: { select: { noteTotal: true } } },
      })
    ),
  ])

  const tauxReussite = sessionsData.length > 0
    ? (sessionsData.filter(s => {
        const noteTotal = s.epreuve?.noteTotal || 20
        return ((s.score! / noteTotal) * 20) >= 10
      }).length / sessionsData.length) * 100
    : 0

  return {
    nbEvaluations,
    nbEtudiants,
    tauxReussite: Math.round(tauxReussite * 10) / 10,
    nbFilieres,
  }
}

/**
 * Collecte les métriques pour un admin
 */
export async function collectAdminMetrics(): Promise<BadgeMetrics> {
  const [nbEtablissements, nbProvidersIA, nbEnseignantsActifs, sessionsData] = await Promise.all([
    withRetry(() => db.etablissement.count({ where: { actif: true } })),
    withRetry(() => db.aIProviderConfig.count({ where: { isActive: true } })),
    withRetry(() => db.user.count({ where: { role: 'ENSEIGNANT', actif: true } })),
    withRetry(() =>
      db.sessionPassation.findMany({
        where: { score: { not: null } },
        select: { score: true, epreuve: { select: { noteTotal: true } } },
        take: 1000,
      })
    ),
  ])

  const tauxReussiteGlobal = sessionsData.length > 0
    ? (sessionsData.filter(s => {
        const noteTotal = s.epreuve?.noteTotal || 20
        return ((s.score! / noteTotal) * 20) >= 10
      }).length / sessionsData.length) * 100
    : 0

  return {
    nbEtablissements,
    tauxReussiteGlobal: Math.round(tauxReussiteGlobal * 10) / 10,
    nbProvidersIA,
    nbEnseignantsActifs,
  }
}

// ─── Fonction principale : calculer tous les badges d'un utilisateur ───

/**
 * Calcule tous les badges pour un utilisateur donné avec leur progression.
 * Persiste les progressions en base et détecte les nouveaux déblocages.
 */
export async function computeAllBadges(
  userId: string,
  role: string,
  etablissementId: string | null = null
): Promise<BadgeWithProgress[]> {
  // 1. Collecter les métriques
  let metrics: BadgeMetrics
  switch (role) {
    case 'ETUDIANT':
      metrics = await collectEtudiantMetrics(userId)
      break
    case 'ENSEIGNANT':
      metrics = await collectEnseignantMetrics(userId)
      break
    case 'RESPONSABLE':
      metrics = await collectResponsableMetrics(userId, etablissementId)
      break
    case 'ADMIN':
      metrics = await collectAdminMetrics()
      break
    default:
      metrics = {}
  }

  // 2. Filtrer les badges pertinents pour ce rôle
  const relevantBadges = BADGE_DEFINITIONS.filter(b => b.rolesCibles.includes(role as RoleCible))

  // 3. Calculer la progression pour chaque badge
  const badgesWithProgress: BadgeWithProgress[] = relevantBadges.map(def => {
    const progress = computeBadgeProgress(def, metrics)

    // Vérifier si c'est un nouveau déblocage en comparant avec la DB
    return {
      ...progress,
      isNewlyUnlocked: false, // Sera mis à jour après comparaison DB
    }
  })

  // 4. Synchroniser avec la base de données
  try {
    // Récupérer les progressions existantes
    const existingProgressions = await withRetry(() =>
      db.badgeProgression.findMany({
        where: { userId },
        include: { badgeDefinition: true },
      })
    )

    // S'assurer que toutes les définitions de badges existent en base
    for (const def of relevantBadges) {
      const existing = existingProgressions.find(p => p.badgeDefinition.cle === def.cle)
      const computed = badgesWithProgress.find(b => b.cle === def.cle)!

      if (!existing) {
        // Créer la définition en base si elle n'existe pas
        let badgeDef = await withRetry(() =>
          db.badgeDefinition.findUnique({ where: { cle: def.cle } })
        )
        if (!badgeDef) {
          badgeDef = await withRetry(() =>
            db.badgeDefinition.create({
              data: {
                cle: def.cle,
                titre: def.titre,
                description: def.description,
                icone: def.icone,
                categorie: def.categorie,
                roleCible: def.rolesCibles.length === 1 ? def.rolesCibles[0] : null,
                niveaux: def.niveaux.map(n => n.niveau),
                ordre: def.ordre,
              },
            })
          )
        }

        // Créer la progression
        const wasLocked = !computed.debloque
        await withRetry(() =>
          db.badgeProgression.create({
            data: {
              userId,
              badgeDefinitionId: badgeDef!.id,
              niveauActuel: computed.niveauActuel,
              valeurActuelle: computed.valeurActuelle,
              valeurPalier: computed.valeurPalier,
              valeurProchain: computed.valeurProchain,
              debloque: computed.debloque,
              dateObtention: computed.debloque ? new Date() : null,
            },
          })
        )

        // Marquer comme nouvellement débloquent si applicable
        if (computed.debloque && wasLocked) {
          computed.isNewlyUnlocked = true
        }
      } else {
        // Mettre à jour la progression existante
        const wasUnlocked = existing.debloque
        const currentNiveau = existing.niveauActuel
        const hasNewLevel = computed.debloque && computed.niveauActuel !== currentNiveau
        const hasNewUnlock = computed.debloque && !wasUnlocked

        if (
          existing.valeurActuelle !== computed.valeurActuelle ||
          existing.niveauActuel !== computed.niveauActuel ||
          existing.debloque !== computed.debloque
        ) {
          await withRetry(() =>
            db.badgeProgression.update({
              where: { id: existing.id },
              data: {
                niveauActuel: computed.niveauActuel,
                valeurActuelle: computed.valeurActuelle,
                valeurPalier: computed.valeurPalier,
                valeurProchain: computed.valeurProchain,
                debloque: computed.debloque,
                dateObtention: hasNewLevel || hasNewUnlock ? new Date() : existing.dateObtention,
              },
            })
          )
        }

        // Marquer comme nouvellement débloquent si nouveau niveau ou nouveau déblocage
        if (hasNewLevel || hasNewUnlock) {
          computed.isNewlyUnlocked = true
          computed.dateObtention = new Date().toISOString()
        } else {
          computed.dateObtention = existing.dateObtention?.toISOString() ?? null
        }
      }
    }
  } catch (error) {
    console.error('[Badge Engine] Error syncing badge progressions:', error)
    // Ne pas bloquer l'affichage si la synchronisation échoue
  }

  return badgesWithProgress
}

/**
 * Récupère les badges d'un utilisateur directement depuis la base
 * (sans recalcul complet - plus rapide pour l'affichage).
 */
export async function getUserBadgesFromDB(userId: string, role: string): Promise<BadgeWithProgress[]> {
  const relevantDefinitions = BADGE_DEFINITIONS.filter(b => b.rolesCibles.includes(role as RoleCible))

  const progressions = await withRetry(() =>
    db.badgeProgression.findMany({
      where: {
        userId,
        badgeDefinition: { cle: { in: relevantDefinitions.map(d => d.cle) } },
      },
      include: { badgeDefinition: true },
    })
  )

  return relevantDefinitions.map(def => {
    const progression = progressions.find(p => p.badgeDefinition.cle === def.cle)
    const niveaux = def.niveaux

    if (!progression) {
      // Pas encore de progression enregistrée → afficher comme non commencé
      return {
        cle: def.cle,
        titre: def.titre,
        description: def.description,
        icone: def.icone,
        categorie: def.categorie,
        niveauActuel: 'BRONZE' as NiveauBadge,
        niveaux,
        valeurActuelle: 0,
        valeurPalier: niveaux[0].seuil,
        valeurProchain: niveaux.length > 1 ? niveaux[1].seuil : null,
        debloque: false,
        progression: 0,
        dateObtention: null,
        isNewlyUnlocked: false,
      }
    }

    // Calculer la progression locale
    const valeurActuelle = progression.valeurActuelle
    let progressPct = 0
    if (progression.valeurProchain !== null && progression.valeurProchain > progression.valeurPalier) {
      const range = progression.valeurProchain - progression.valeurPalier
      const current = Math.max(0, valeurActuelle - progression.valeurPalier)
      progressPct = Math.min(100, Math.round((current / range) * 100))
    } else if (progression.debloque && progression.valeurProchain === null) {
      progressPct = 100
    } else if (progression.valeurPalier > 0) {
      progressPct = Math.min(100, Math.round((valeurActuelle / progression.valeurPalier) * 100))
    }

    return {
      cle: def.cle,
      titre: def.titre,
      description: def.description,
      icone: def.icone,
      categorie: def.categorie,
      niveauActuel: progression.niveauActuel,
      niveaux,
      valeurActuelle: progression.valeurActuelle,
      valeurPalier: progression.valeurPalier,
      valeurProchain: progression.valeurProchain,
      debloque: progression.debloque,
      progression: progressPct,
      dateObtention: progression.dateObtention?.toISOString() ?? null,
      isNewlyUnlocked: false,
    }
  })
}
