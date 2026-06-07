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
  profil: '/profil',
  parametres: '/parametres',
}

// ─── Reverse mapping: URL path → PageId ───
export const ROUTE_TO_PAGE: Record<string, PageId> = Object.fromEntries(
  Object.entries(PAGE_ROUTES).map(([pageId, route]) => [route, pageId as PageId])
) as Record<string, PageId>

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
    ],
  },
]

export const NAV_CATEGORIES: Record<UserRole, NavCategory[]> = {
  ADMIN: ADMIN_CATEGORIES,
  RESPONSABLE: RESPONSABLE_CATEGORIES,
  ENSEIGNANT: ENSEIGNANT_CATEGORIES,
  ETUDIANT: ETUDIANT_CATEGORIES,
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
