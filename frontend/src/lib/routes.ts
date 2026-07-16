import type { UserRole } from '@/stores/auth-store'

// ─── Page ID type (kept for backward compat during migration) ───
export type PageId =
  | 'dashboard'
  | 'utilisateurs'
  | 'etablissements'
  | 'configuration'
  | 'logs'
  | 'filieres'
  | 'niveaux'
  | 'unites-enseignement'
  | 'programme-academique'
  | 'affectations'
  | 'etudiants'
  | 'enseignants'
  | 'evaluations'
  | 'rapports'
  | 'alertes'
  | 'documents'
  | 'questions-ia'
  | 'banque-epreuves'
  | 'epreuves'
  | 'devoirs'
  | 'correction'
  | 'resultats'
  | 'corbeille'
  | 'mes-epreuves'
  | 'mes-devoirs'
  | 'mes-resultats'
  | 'passation'
  | 'abonnements'
  | 'securite'
  | 'acces-etablissements'
  | 'monitoring'
  | 'notifications'
  | 'facturation'
  | 'ai-providers'
  | 'surveillance'
  | 'mes-certificats'
  | 'exam-prep'
  | 'aide-etudiants'
  | 'mes-etudiants'
  | 'profil'
  | 'parametres'

// ─── Route mapping: PageId → URL path ───
export const PAGE_ROUTES: Record<PageId, string> = {
  dashboard: '/dashboard',
  utilisateurs: '/utilisateurs',
  etablissements: '/etablissements',
  configuration: '/configuration',
  logs: '/logs',
  filieres: '/filieres',
  niveaux: '/programme-academique',
  'unites-enseignement': '/programme-academique',
  'programme-academique': '/programme-academique',
  affectations: '/affectations',
  etudiants: '/etudiants',
  enseignants: '/enseignants',
  evaluations: '/evaluations',
  rapports: '/rapports',
  alertes: '/alertes',
  documents: '/documents',
  'questions-ia': '/questions-ia',
  'banque-epreuves': '/epreuves',
  epreuves: '/epreuves',
  devoirs: '/devoirs',
  correction: '/correction',
  resultats: '/resultats',
  corbeille: '/corbeille',
  'mes-epreuves': '/mes-epreuves',
  'mes-devoirs': '/mes-devoirs',
  'mes-resultats': '/mes-resultats',
  passation: '/passation',
  abonnements: '/abonnements',
  securite: '/securite',
  'acces-etablissements': '/acces-etablissements',
  monitoring: '/monitoring',
  notifications: '/notifications',
  facturation: '/facturation',
  'ai-providers': '/ai-providers',
  surveillance: '/surveillance',
  'mes-certificats': '/mes-certificats',
  'exam-prep': '/exam-prep',
  'aide-etudiants': '/aide-etudiants',
  'mes-etudiants': '/mes-etudiants',
  profil: '/profil',
  parametres: '/parametres',
}

// ─── Reverse mapping: URL path → PageId ───
//
// ⚠️ COLLISIONS CONNUES : plusieurs PageId mappent vers la même route car ce
// sont des alias historiques ou des vues équivalentes d'une même page :
//   - /programme-academique  ← niveaux | unites-enseignement | programme-academique
//   - /epreuves              ← banque-epreuves | epreuves
// Object.fromEntries ne conserve que le DERNIER PageId rencontré dans l'ordre
// d'insertion de PAGE_ROUTES, ce qui correspond par chance au PageId canonique
// (celui affiché dans la sidebar). Ce comportement est FRAGILE : toute
// réorganisation de PAGE_ROUTES pourrait le casser.
//
// → Pour résoudre le PageId d'une page affichée de manière fiable, utiliser
//   `getPageContext(pathname, role)` qui part des catégories de navigation du
//   rôle (qui ne contiennent que les PageId canoniques).
// → ROUTE_TO_PAGE reste utilisé par `getPageIdFromSlug` au niveau du routeur,
//   où un match direct est acceptable car les alias sont équivalents.
export const ROUTE_TO_PAGE: Record<string, PageId> = Object.fromEntries(
  Object.entries(PAGE_ROUTES).map(([pageId, route]) => [route, pageId as PageId])
) as Record<string, PageId>

// ─── Contexte d'affichage d'une page (fil d'Ariane + titre) ───
export interface PageContext {
  pageId: PageId
  pageTitle: string
  /**
   * Libellé de la catégorie parente dans la sidebar, ou `null` si non
   * applicable (dashboard, profil, ou route inconnue/non autorisée).
   * Sert au fil d'Ariane du header : "Catégorie › Titre de la page".
   */
  parentCategory: string | null
}

/**
 * ASSISTANCE-MODE-FRONTEND : rôle "effectif" pour la résolution de navigation.
 *
 * Un ADMIN en mode assistance (etablissementId non vide) voit la navigation
 * RESPONSABLE dans la sidebar (pages Etablissement, Filières, Étudiants,
 * Évaluations, Rapports, Paramètres…). On conserve user.role === 'ADMIN'
 * pour les checks d'accès backend (l'ADMIN garde ses privilèges), mais on
 * utilise le rôle effectif pour sélectionner les catégories de navigation.
 *
 * @returns 'RESPONSABLE' si ADMIN en assistance mode, sinon le rôle d'origine.
 */
export function getEffectiveRole(
  role: UserRole,
  etablissementId?: string | null,
): UserRole {
  if (role === 'ADMIN' && etablissementId) return 'RESPONSABLE'
  return role
}

/**
 * Résout le contexte d'affichage d'une page (PageId canonique, titre, catégorie
 * parente) à partir du pathname et du rôle utilisateur.
 *
 * Centralise la logique de fil d'Ariane/titre précédemment dupliquée entre
 * `AppHeader` et `AppSidebar`, et évite les collisions de `ROUTE_TO_PAGE` en
 * partant des catégories de navigation du rôle (`NAV_CATEGORIES[role]`), qui
 * ne contiennent que les PageId canoniques réellement affichés dans la
 * sidebar.
 *
 * ASSISTANCE-MODE-FRONTEND : `etablissementId` optionnel — quand l'ADMIN est
 * en mode assistance, on résout le contexte avec le rôle effectif
 * (RESPONSABLE) pour rester cohérent avec la sidebar.
 *
 * Ordre de résolution :
 *  1. Recherche dans les items de navigation du rôle (match sur PAGE_ROUTES).
 *  2. Page de profil (accessible depuis le header, absente de la sidebar).
 *  3. Fallback dashboard (route inconnue ou non autorisée pour le rôle).
 *
 * @example
 *   const { pageId, pageTitle, parentCategory } = getPageContext(pathname, user.role)
 *   // Assistance mode :
 *   const ctx = getPageContext(pathname, user.role, user.etablissementId)
 */
export function getPageContext(
  pathname: string,
  role: UserRole,
  etablissementId?: string | null,
): PageContext {
  const effectiveRole = getEffectiveRole(role, etablissementId)
  const categories = NAV_CATEGORIES[effectiveRole] ?? []

  // 1. Recherche dans les items de navigation du rôle (PageId canoniques)
  for (const category of categories) {
    for (const item of category.items) {
      if (PAGE_ROUTES[item.id] === pathname) {
        return {
          pageId: item.id,
          pageTitle: item.label,
          // Le dashboard est la seule page de sa catégorie "Vue d'ensemble" :
          // pas de fil d'Ariane parent pour éviter "Vue d'ensemble › Tableau de bord".
          parentCategory: item.id === 'dashboard' ? null : category.label,
        }
      }
    }
  }

  // 2. Page de profil (accessible depuis le header dropdown, absente de la sidebar)
  if (pathname === PAGE_ROUTES.profil) {
    return {
      pageId: 'profil',
      pageTitle: PROFILE_PAGE.label,
      parentCategory: null,
    }
  }

  // 3. Fallback : dashboard (route inconnue ou non autorisée pour le rôle)
  return {
    pageId: 'dashboard',
    pageTitle: PAGE_LABELS.dashboard,
    parentCategory: null,
  }
}

/**
 * Page de paramètres dédiée au rôle, ou `null` si le rôle n'en a pas.
 *
 * - ADMIN → `configuration` (configuration du système PaaS/SaaS)
 * - RESPONSABLE → `parametres` (paramètres de l'établissement)
 * - ENSEIGNANT / ÉTUDIANT → `null` (pas de page dédiée ; l'entrée
 *   « Paramètres » est masquée du menu utilisateur)
 */
export function getSettingsPageId(role: UserRole): PageId | null {
  switch (role) {
    case 'ADMIN':
      return 'configuration'
    case 'RESPONSABLE':
      return 'parametres'
    default:
      return null
  }
}

// ─── Page labels ───
export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: 'Tableau de bord',
  utilisateurs: 'Gestion des utilisateurs',
  etablissements: 'Gestion des établissements',
  configuration: 'Configuration du système',
  logs: "Journaux d'audit",
  filieres: 'Gestion des filières',
  niveaux: "Niveaux d'étude",
  'unites-enseignement': "Unités d'enseignement",
  'programme-academique': 'Programme académique',
  affectations: 'Affectations',
  etudiants: 'Gestion des étudiants',
  enseignants: 'Gestion des enseignants',
  evaluations: 'Gestion des évaluations',
  rapports: 'Rapports et statistiques',
  alertes: 'Alertes et notifications',
  documents: 'Gestion des documents',
  'questions-ia': 'Génération de questions IA',
  'banque-epreuves': 'Épreuves (Modèles)',
  epreuves: 'Épreuves (Modèles & Sessions)',
  devoirs: 'Gestion des devoirs',
  correction: 'Correction des copies',
  resultats: 'Résultats et analyses',
  corbeille: 'Corbeille',
  'mes-epreuves': 'Mes épreuves',
  'mes-devoirs': 'Mes devoirs',
  'mes-resultats': 'Mes résultats',
  passation: "Passation d'épreuve",
  abonnements: 'Gestion des abonnements',
  securite: 'Sécurité des évaluations',
  'acces-etablissements': 'Accès aux établissements',
  monitoring: 'Monitoring plateforme',
  facturation: 'Facturation & Revenus',
  notifications: 'Centre de notifications',
  'ai-providers': 'Fournisseurs IA',
  surveillance: 'Surveillance & Alertes',
  'mes-certificats': 'Mes certificats',
  'exam-prep': 'Préparation examens',
  'aide-etudiants': 'Aide des étudiants',
  'mes-etudiants': 'Mes classes',
  profil: 'Mon profil',
  parametres: 'Paramètres établissement',
}

// ─── Page descriptions ───
export const PAGE_DESCRIPTIONS: Record<PageId, string> = {
  dashboard: "Vue d'ensemble de votre espace",
  utilisateurs: 'Créer, modifier et gérer les comptes utilisateurs',
  etablissements: 'Administrer les établissements partenaires',
  configuration: 'Paramétrer le fonctionnement de la plateforme',
  logs: "Consulter les journaux d'activité du système",
  filieres: 'Organiser les filières et formations',
  niveaux: 'Gérer les niveaux L1 à M2 et doctorat',
  'unites-enseignement': 'Gérer les matières et unités d\'enseignement',
  'programme-academique': "Vue d'ensemble et gestion des unités d'enseignement par niveau",
  affectations: 'Affecter les enseignants aux classes et unités d\'enseignement',
  etudiants: "Gérer les étudiants et leurs inscriptions",
  enseignants: "Gérer les enseignants et leurs affectations",
  evaluations: 'Planifier et suivre les évaluations',
  rapports: 'Consulter les rapports et statistiques détaillés',
  alertes: 'Voir les alertes et notifications importantes',
  documents: 'Importer et gérer vos documents pédagogiques',
  'questions-ia': 'Générer des questions automatiquement avec l\'IA',
  'banque-epreuves': 'Parcourir les modèles d\'épreuves et planifier des sessions',
  epreuves: 'Gérer vos modèles d\'épreuves et planifier des sessions d\'évaluation',
  devoirs: 'Gérer les devoirs et les soumissions',
  correction: 'Corriger les copies et attribuer les notes',
  resultats: 'Consulter les résultats et les analyses',
  corbeille: 'Restaurez ou supprimez définitivement vos éléments',
  'mes-epreuves': 'Voir les épreuves programmées et passées',
  'mes-devoirs': 'Consultez et soumettez vos devoirs',
  'mes-resultats': 'Consulter vos notes et résultats',
  passation: 'Passer une épreuve en ligne',
  abonnements: 'Gérer les abonnements et plans tarifaires',
  securite: "Configurer la sécurité et l'anti-fraude",
  'acces-etablissements': "Gérer vos autorisations d'accès aux établissements",
  monitoring: 'Surveiller la santé et les performances de la plateforme',
  facturation: 'Gérer les factures, revenus et prévisions',
  notifications: 'Gérer les notifications et les diffusions de la plateforme',
  'ai-providers': "Configurer et gérer les fournisseurs d'intelligence artificielle",
  surveillance: 'Consultez les alertes anti-fraude et captures d\'écran',
  'mes-certificats': 'Consulter et télécharger vos certificats',
  'exam-prep': "Transformez vos supports de cours en moteur de préparation actif : Q&A IA, entraînement, planning et aide de l'enseignant",
  'aide-etudiants': "Répondez aux questions de vos étudiants sur les documents de cours",
  'mes-etudiants': "Consultez les étudiants de vos classes et téléchargez leurs relevés de notes détaillés",
  profil: 'Gérer vos informations personnelles et préférences',
  parametres: 'Configurer les paramètres de votre établissement',
}

// ─── Navigation items with category structure ───
export interface NavItem {
  id: PageId
  label: string
  icon: string
  badge?: string | number
}

export interface NavCategory {
  id: string
  label: string
  icon: string
  items: NavItem[]
  defaultOpen?: boolean
  /**
   * SECT-B2C-SELF-SERVICE : si true, cette catégorie n'est affichée QUE pour
   * les enseignants B2C (établissement de type PERSONNEL). Les enseignants B2B
   * (établissement normal géré par un RESPONSABLE) ne la voient pas.
   * La sidebar vérifie user.etablissement?.type === 'PERSONNEL'.
   */
  b2cOnly?: boolean
}

// ─── ADMIN categories ───
const ADMIN_CATEGORIES: NavCategory[] = [
  {
    id: 'admin-overview',
    label: "Vue d'ensemble",
    icon: 'LayoutDashboard',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    ],
  },
  {
    id: 'admin-clients',
    label: 'Gestion Clients',
    icon: 'Building2',
    defaultOpen: true,
    items: [
      { id: 'etablissements', label: 'Établissements (consultation)', icon: 'Building2' },
      { id: 'utilisateurs', label: 'Responsables', icon: 'UserCheck' },
    ],
  },
  {
    id: 'admin-abonnements',
    label: 'Abonnements & Facturation',
    icon: 'CreditCard',
    defaultOpen: true,
    items: [
      { id: 'abonnements', label: 'Souscriptions & Plans', icon: 'CreditCard' },
      { id: 'facturation', label: 'Facturation & Revenus', icon: 'Receipt' },
    ],
  },
  {
    id: 'admin-autorisations',
    label: 'Autorisations & Sécurité',
    icon: 'Shield',
    defaultOpen: false,
    items: [
      { id: 'securite', label: 'Sécurité anti-fraude', icon: 'Shield' },
      { id: 'acces-etablissements', label: 'Accès & autorisations', icon: 'KeyRound' },
      { id: 'monitoring', label: 'Monitoring plateforme', icon: 'Activity' },
      { id: 'logs', label: "Journaux d'audit", icon: 'FileText' },
    ],
  },
  {
    id: 'admin-systeme',
    label: 'Système',
    icon: 'Settings',
    defaultOpen: false,
    items: [
      { id: 'ai-providers', label: 'Fournisseurs IA', icon: 'Sparkles' },
      { id: 'configuration', label: 'Configuration', icon: 'Settings' },
      { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    ],
  },
]

// ─── RESPONSABLE categories ───
const RESPONSABLE_CATEGORIES: NavCategory[] = [
  {
    id: 'resp-overview',
    label: "Vue d'ensemble",
    icon: 'LayoutDashboard',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    ],
  },
  {
    id: 'resp-academique',
    label: 'Organisation Académique',
    icon: 'GraduationCap',
    defaultOpen: true,
    items: [
      { id: 'filieres', label: 'Filières', icon: 'GraduationCap' },
      { id: 'programme-academique', label: 'Programme académique', icon: 'BookMarked' },
      { id: 'affectations', label: 'Affectations', icon: 'UserCheck' },
    ],
  },
  {
    id: 'resp-personnes',
    label: 'Gestion des Personnes',
    icon: 'Users',
    defaultOpen: true,
    items: [
      // OPTION-A : lien sidebar /utilisateurs supprimé pour le RESPONSABLE.
      // Rationale : /utilisateurs est 100% redondant avec /etudiants + /enseignants
      // pour le RESPONSABLE (mêmes endpoints /api/users, mêmes actions CRUD, mais
      // /etudiants et /enseignants sont des supersets avec export CSV, bulk actions,
      // recherche avancée, affectations filières, relevés de notes, etc.).
      // La page /utilisateurs reste accessible à l'ADMIN (section admin-clients,
      // label "Responsables") pour gérer les propriétaires d'établissements.
      // Un RESPONSABLE qui tape /utilisateurs directement est redirigé vers /etudiants
      // (voir proxy.ts).
      { id: 'etudiants', label: 'Étudiants', icon: 'Users' },
      { id: 'enseignants', label: 'Enseignants', icon: 'BookOpen' },
    ],
  },
  {
    id: 'resp-evaluations',
    label: 'Évaluations & Suivi',
    icon: 'ClipboardCheck',
    defaultOpen: true,
    items: [
      { id: 'evaluations', label: 'Évaluations', icon: 'ClipboardCheck' },
      { id: 'rapports', label: 'Rapports & Statistiques', icon: 'BarChart3' },
    ],
  },
  {
    id: 'resp-parametres',
    label: 'Paramètres',
    icon: 'Settings',
    defaultOpen: false,
    items: [
      { id: 'parametres', label: 'Paramètres établissement', icon: 'Settings' },
    ],
  },
]

// ─── ENSEIGNANT categories ───
const ENSEIGNANT_CATEGORIES: NavCategory[] = [
  {
    id: 'ens-overview',
    label: "Vue d'ensemble",
    icon: 'LayoutDashboard',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    ],
  },
  {
    id: 'ens-ressources',
    label: 'Ressources Pédagogiques',
    icon: 'FileUp',
    defaultOpen: true,
    items: [
      { id: 'documents', label: 'Documents', icon: 'FileUp' },
      { id: 'questions-ia', label: 'Génération IA', icon: 'Sparkles' },
    ],
  },
  {
    id: 'ens-evaluations',
    label: 'Évaluations',
    icon: 'ClipboardList',
    defaultOpen: true,
    items: [
      { id: 'epreuves', label: 'Épreuves', icon: 'Library' },
      { id: 'devoirs', label: 'Devoirs', icon: 'BookOpen' },
    ],
  },
  {
    id: 'ens-correction',
    label: 'Correction & Résultats',
    icon: 'PenTool',
    defaultOpen: true,
    items: [
      { id: 'correction', label: 'Correction', icon: 'PenTool' },
      { id: 'resultats', label: 'Résultats & Analyses', icon: 'TrendingUp' },
    ],
  },
  {
    id: 'ens-aide',
    label: 'Accompagnement',
    icon: 'HelpCircle',
    defaultOpen: true,
    items: [
      { id: 'mes-etudiants', label: 'Mes classes', icon: 'Users' },
      { id: 'aide-etudiants', label: 'Aide des étudiants', icon: 'HelpCircle' },
    ],
  },
  {
    // SECT-B2C-SELF-SERVICE : catégorie exclusive aux profs B2C (étab PERSONNEL).
    // Permet au prof freelance de gérer ses filières, UE et étudiants sans
    // RESPONSABLE. Les profs B2B ne voient pas cette catégorie (b2cOnly: true).
    id: 'ens-gestion-b2c',
    label: 'Gestion pédagogique',
    icon: 'Settings2',
    defaultOpen: true,
    b2cOnly: true,
    items: [
      { id: 'filieres', label: 'Mes filières', icon: 'FolderTree' },
      { id: 'unites-enseignement', label: 'Mes unités', icon: 'BookOpen' },
      { id: 'etudiants', label: 'Gestion des étudiants', icon: 'Users' },
    ],
  },
  {
    id: 'ens-surveillance',
    label: 'Surveillance',
    icon: 'Shield',
    defaultOpen: true,
    items: [
      { id: 'surveillance', label: 'Surveillance & Alertes', icon: 'Shield' },
    ],
  },
  {
    id: 'ens-outils',
    label: 'Outils',
    icon: 'Wrench',
    defaultOpen: false,
    items: [
      { id: 'corbeille', label: 'Corbeille', icon: 'Trash2' },
    ],
  },
]

// ─── ETUDIANT categories ───
const ETUDIANT_CATEGORIES: NavCategory[] = [
  {
    id: 'etu-overview',
    label: "Vue d'ensemble",
    icon: 'LayoutDashboard',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    ],
  },
  {
    id: 'etu-evaluations',
    label: 'Mes Évaluations',
    icon: 'FileCheck',
    defaultOpen: true,
    items: [
      { id: 'mes-epreuves', label: 'Mes épreuves', icon: 'FileCheck' },
      { id: 'mes-devoirs', label: 'Mes devoirs', icon: 'BookOpen' },
    ],
  },
  {
    id: 'etu-resultats',
    label: 'Mes Résultats',
    icon: 'Award',
    defaultOpen: true,
    items: [
      { id: 'mes-resultats', label: 'Notes & résultats', icon: 'Award' },
      { id: 'mes-certificats', label: 'Mes certificats', icon: 'ScrollText' },
      { id: 'exam-prep', label: 'Préparation examens', icon: 'GraduationCap' },
    ],
  },
]

export const NAV_CATEGORIES: Record<UserRole, NavCategory[]> = {
  ADMIN: ADMIN_CATEGORIES,
  RESPONSABLE: RESPONSABLE_CATEGORIES,
  ENSEIGNANT: ENSEIGNANT_CATEGORIES,
  ETUDIANT: ETUDIANT_CATEGORIES,
}

// RAPPORTS-FIX-R5 : rôles autorisés par page. Si une page n'est pas listée,
// elle est accessible à tous les rôles authentifiés (comportement par défaut).
// Les pages restreintes redirigent vers /dashboard si le rôle n'est pas autorisé.
// Cohérent avec les checks backend (ex: /api/stats/responsable = RESPONSABLE+ADMIN).
export const PAGE_ALLOWED_ROLES: Partial<Record<PageId, UserRole[]>> = {
  rapports: ['RESPONSABLE', 'ADMIN'],
  // ABONNEMENTS-FIX-A5 : pages SaaS réservées ADMIN.
  abonnements: ['ADMIN'],
  facturation: ['ADMIN'],
  // ACCES-ETABLISSEMENTS-FIX-AE2 : page réservée ADMIN (gestion des autorisations).
  // Le responsable approuve les demandes via /parametres onglet 'acces-admin'
  // (responsable-parametres-page.tsx) — pas de doublon ici.
  securite: ['ADMIN'],
  'acces-etablissements': ['ADMIN'],
  // MONITORING-FIX-M7 : pages supervision réservées ADMIN.
  monitoring: ['ADMIN'],
  logs: ['ADMIN'],
  // CONFIG-FRONTEND-EXTEND : page Configuration système réservée ADMIN.
  configuration: ['ADMIN'],
  // NOTIFICATIONS-FIX-N7 : centre de notifications admin réservé ADMIN.
  notifications: ['ADMIN'],
  // QUESTIONS-IA-FIX : Génération IA réservée ENSEIGNANT + ADMIN (+ RESPONSABLE).
  // Avant ce fix, la page n'était pas listée → accessible à tous les rôles
  // authentifiés (dont ETUDIANT) via URL directe. L'étudiant voyait le wizard
  // complet et ne découvrait le 403 qu'au clic "Générer".
  'questions-ia': ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'],
}

// Profile page labels (accessible from header, not sidebar)
export const PROFILE_PAGE: Record<string, string> = {
  label: 'Mon profil',
  description: 'Gérer vos informations personnelles et préférences',
}

// Legacy flat list (kept for backward compat)
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ADMIN: ADMIN_CATEGORIES.flatMap((c) => c.items),
  RESPONSABLE: RESPONSABLE_CATEGORIES.flatMap((c) => c.items),
  ENSEIGNANT: ENSEIGNANT_CATEGORIES.flatMap((c) => c.items),
  ETUDIANT: ETUDIANT_CATEGORIES.flatMap((c) => c.items),
}

/**
 * Get the PageId from a URL path slug array.
 * Returns null if the slug doesn't match any known page.
 */
export function getPageIdFromSlug(slug: string[]): PageId | null {
  const path = '/' + slug.join('/')
  // Direct match
  if (ROUTE_TO_PAGE[path]) return ROUTE_TO_PAGE[path]
  // Handle legacy redirects
  if (path === '/banque-questions') return 'epreuves'
  return null
}

/**
 * Get the default route for a given role (used after login).
 */
export function getDefaultRoute(role: UserRole): string {
  return '/dashboard'
}
