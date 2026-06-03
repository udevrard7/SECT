import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserRole } from './auth-store'

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
  | 'banque-questions'
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
  | 'profil'

interface NavigationState {
  currentPage: PageId
  currentPageParams: Record<string, string>
  sidebarOpen: boolean
  _hasHydrated: boolean
  setCurrentPage: (page: PageId, params?: Record<string, string>) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setHasHydrated: (state: boolean) => void
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      currentPage: 'dashboard' as PageId,
      currentPageParams: {},
      sidebarOpen: true,
      _hasHydrated: false,

      setCurrentPage: (page, params = {}) => set({ currentPage: page, currentPageParams: params }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'sect-navigation',
      partialize: (state) => ({
        currentPage: state.currentPage,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (!error && state) {
            state.setHasHydrated(true)
          }
        }
      },
    }
  )
)

// ─── Navigation items with category structure ───
export interface NavItem {
  id: PageId
  label: string
  icon: string // lucide icon name
  badge?: string | number // optional badge (e.g. unread count)
}

export interface NavCategory {
  id: string
  label: string
  icon: string // category icon
  items: NavItem[]
  defaultOpen?: boolean
}

// ─── Profile page labels (accessible from header, not sidebar) ───
export const PROFILE_PAGE: Record<string, string> = {
  label: 'Mon profil',
  description: 'Gérer vos informations personnelles et préférences',
}

// ─── ADMIN categories ───
const ADMIN_CATEGORIES: NavCategory[] = [
  {
    id: 'admin-overview',
    label: 'Vue d\'ensemble',
    icon: 'LayoutDashboard',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
      { id: 'utilisateurs', label: 'Utilisateurs', icon: 'Users' },
    ],
  },
  {
    id: 'admin-etablissements',
    label: 'Établissements',
    icon: 'Building2',
    defaultOpen: true,
    items: [
      { id: 'etablissements', label: 'Gestion des établissements', icon: 'Building2' },
      { id: 'acces-etablissements', label: 'Accès & autorisations', icon: 'KeyRound' },
    ],
  },
  {
    id: 'admin-abonnements',
    label: 'Abonnements & Facturation',
    icon: 'CreditCard',
    defaultOpen: true,
    items: [
      { id: 'abonnements', label: 'Plans & abonnements', icon: 'CreditCard' },
      { id: 'facturation', label: 'Facturation & Revenus', icon: 'Receipt' },
      { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    ],
  },
  {
    id: 'admin-securite',
    label: 'Sécurité & Contrôle',
    icon: 'Shield',
    defaultOpen: false,
    items: [
      { id: 'monitoring', label: 'Monitoring plateforme', icon: 'Activity' },
      { id: 'securite', label: 'Paramètres de sécurité', icon: 'Shield' },
      { id: 'logs', label: 'Journaux d\'audit', icon: 'FileText' },
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
    ],
  },
]

// ─── RESPONSABLE categories ───
const RESPONSABLE_CATEGORIES: NavCategory[] = [
  {
    id: 'resp-overview',
    label: 'Vue d\'ensemble',
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
      { id: 'alertes', label: 'Alertes', icon: 'Bell' },
    ],
  },
]

// ─── ENSEIGNANT categories ───
const ENSEIGNANT_CATEGORIES: NavCategory[] = [
  {
    id: 'ens-overview',
    label: 'Vue d\'ensemble',
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
      { id: 'banque-questions', label: 'Banque de questions', icon: 'Library' },
    ],
  },
  {
    id: 'ens-evaluations',
    label: 'Évaluations',
    icon: 'ClipboardList',
    defaultOpen: true,
    items: [
      { id: 'epreuves', label: 'Épreuves', icon: 'ClipboardList' },
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
    label: 'Vue d\'ensemble',
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
      { id: 'passation', label: 'Passer une épreuve', icon: 'ClipboardCheck' },
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

// ─── Legacy flat list (kept for backward compat) ───
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ADMIN: ADMIN_CATEGORIES.flatMap((c) => c.items),
  RESPONSABLE: RESPONSABLE_CATEGORIES.flatMap((c) => c.items),
  ENSEIGNANT: ENSEIGNANT_CATEGORIES.flatMap((c) => c.items),
  ETUDIANT: ETUDIANT_CATEGORIES.flatMap((c) => c.items),
}
