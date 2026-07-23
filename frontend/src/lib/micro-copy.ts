/**
 * Micro-copy contextuelle — Adaptation au contexte ivoirien / ouest-africain.
 *
 * Messages d'encouragement, empty states, et toasts avec une touche
 * locale qui rend l'expérience plus chaleureuse et familière pour
 * les utilisateurs de Côte d'Ivoire et d'Afrique de l'Ouest.
 *
 * Usage : importer et utiliser dans les composants.
 *   import { MICRO_COPY } from '@/lib/micro-copy'
 *   <p>{MICRO_COPY.EMPTY_EPREUVES}</p>
 */

export const MICRO_COPY = {
  // ── Empty states ──
  EMPTY_EPREUVES: 'Aucune épreuve pour le moment. Créez votre première évaluation pour vos étudiants !',
  EMPTY_QUESTIONS: 'La banque de questions est vide. Commencez par générer des questions avec l\'IA ou créez-les manuellement.',
  EMPTY_RESULTATS: 'Les résultats apparaîtront ici dès que les étudiants auront commencé à passer leurs examens.',
  EMPTY_ETUDIANTS: 'Aucun étudiant inscrit. Ajoutez vos étudiants ou importez-les via un fichier CSV.',
  EMPTY_ENSEIGNANTS: 'Aucun enseignant assigné. Invitez vos collègues à rejoindre la plateforme.',
  EMPTY_DEVOIRS: 'Aucun devoir en cours. Les devoirs apparaîtront ici dès qu\'ils seront créés par vos enseignants.',
  EMPTY_DOCUMENTS: 'Aucun document. Importez vos supports de cours (PDF, DOCX) pour générer des questions automatiquement.',
  EMPTY_BADGES: 'Aucun badge débloqué pour l\'instant. Continuez vos efforts, les récompenses viendront !',
  EMPTY_CERTIFICATS: 'Aucun certificat. Complétez vos examens avec succès pour obtenir vos certificats.',
  EMPTY_CORBEILLE: 'La corbeille est vide. Les éléments supprimés apparaîtront ici pendant 30 jours.',
  EMPTY_ALERTES: 'Aucune alerte. Tout est sous contrôle ! 🌿',
  EMPTY_NOTIFICATIONS: 'Aucune notification. Vous êtes à jour !',

  // ── Messages d'encouragement (toasts) ──
  ENCOURAGEMENT_EXAMEN: 'Bon courage pour votre examen ! Prenez votre temps, vous êtes prêt(e). 💪',
  ENCOURAGEMENT_CORRECTION: 'Excellente progression ! Vos étudiants apprécieront la rapidité de correction.',
  ENCOURAGEMENT_BADGE: 'Félicitations ! Vous avez relevé un nouveau défi. Continuez ainsi ! 🏆',
  ENCOURAGEMENT_STREAK: 'Bravo ! Vous êtes régulier(ère) comme le lever du soleil. Ne lâchez rien ! ☀️',

  // ── Messages de chargement ──
  LOADING: 'Chargement en cours… Patientez un instant.',
  LOADING_IA: 'L\'IA prépare votre contenu… Cela peut prendre quelques secondes.',
  LOADING_CORRECTION: 'Correction en cours… L\'IA analyse les copies.',

  // ── Messages de succès ──
  SUCCESS_SAVE: 'Enregistré avec succès ! ✅',
  SUCCESS_SUBMIT: 'Examen soumis ! Votre copie sera corrigée prochainement.',
  SUCCESS_CORRECTION: 'Correction terminée ! Les notes sont disponibles.',
  SUCCESS_BADGE: 'Nouveau badge débloqué ! Consultez votre profil. 🎉',

  // ── Messages d'erreur ──
  ERROR_NETWORK: 'Problème de connexion. Vérifiez votre réseau et réessayez.',
  ERROR_AUTH: 'Session expirée. Reconnectez-vous pour continuer.',
  ERROR_PERMISSION: 'Vous n\'avez pas la permission d\'effectuer cette action.',

  // ── Salutations contextuelles ──
  GREETING_MORNING: 'Bonjour',
  GREETING_AFTERNOON: 'Bon après-midi',
  GREETING_EVENING: 'Bonsoir',
  GREETING_LATE_NIGHT: 'Encore debout ? Respect ! 🌙',

  // ── Tooltips ──
  TOOLTIP_XP: 'Vos points d\'expérience. Plus vous participez, plus vous gagnez en croissance !',
  TOOLTIP_STREAK: 'Votre série de jours consécutifs. Revenez chaque jour pour la maintenir !',
  TOOLTIP_LEVEL: 'Votre niveau actuel. Atteignez le prochain palier pour débloquer de nouveaux badges.',

  // ── Labels de gamification ──
  TIER_BRONZE_LABEL: 'Tier Bronze — Les débutants courageux',
  TIER_SILVER_LABEL: 'Tier Argent — Les apprenants constants',
  TIER_GOLD_LABEL: 'Tier Or — Les excellents étudiants',
  TIER_PLATINUM_LABEL: 'Tier Platine — Les légendes de SECT',
} as const

/**
 * Retourne une salutation contextuelle selon l'heure (heure d'Abidjan).
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return MICRO_COPY.GREETING_MORNING
  if (hour >= 12 && hour < 18) return MICRO_COPY.GREETING_AFTERNOON
  if (hour >= 18 && hour < 23) return MICRO_COPY.GREETING_EVENING
  return MICRO_COPY.GREETING_LATE_NIGHT
}
