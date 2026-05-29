import { create } from 'zustand'
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
  | 'mes-epreuves'
  | 'mes-resultats'
  | 'passation'
  | 'abonnements'
  | 'securite'
  | 'acces-etablissements'

interface NavigationState {
  currentPage: PageId
  currentPageParams: Record<string, string>
  sidebarOpen: boolean
  setCurrentPage: (page: PageId, params?: Record<string, string>) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  currentPage: 'dashboard',
  currentPageParams: {},
  sidebarOpen: true,

  setCurrentPage: (page, params = {}) => set({ currentPage: page, currentPageParams: params }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))

// ─── Navigation items per role ───
export interface NavItem {
  id: PageId
  label: string
  icon: string // lucide icon name
}

export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    { id: 'etablissements', label: 'Établissements', icon: 'Building2' },
    { id: 'acces-etablissements', label: 'Accès établissements', icon: 'KeyRound' },
    { id: 'abonnements', label: 'Abonnements', icon: 'CreditCard' },
    { id: 'securite', label: 'Sécurité', icon: 'Shield' },
    { id: 'logs', label: 'Journaux d\'audit', icon: 'FileText' },
    { id: 'configuration', label: 'Configuration', icon: 'Settings' },
  ],
  RESPONSABLE: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    { id: 'filieres', label: 'Filières & Niveaux', icon: 'GraduationCap' },
    { id: 'niveaux', label: 'Niveaux d\'étude', icon: 'Layers' },
    { id: 'unites-enseignement', label: 'Unités d\'enseignement', icon: 'BookMarked' },
    { id: 'affectations', label: 'Affectations', icon: 'UserCheck' },
    { id: 'etudiants', label: 'Étudiants', icon: 'Users' },
    { id: 'enseignants', label: 'Enseignants', icon: 'BookOpen' },
    { id: 'evaluations', label: 'Évaluations', icon: 'ClipboardCheck' },
    { id: 'rapports', label: 'Rapports', icon: 'BarChart3' },
    { id: 'alertes', label: 'Alertes', icon: 'Bell' },
  ],
  ENSEIGNANT: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    { id: 'documents', label: 'Documents', icon: 'FileUp' },
    { id: 'questions-ia', label: 'Questions IA', icon: 'Sparkles' },
    { id: 'banque-questions', label: 'Banque de questions', icon: 'Library' },
    { id: 'epreuves', label: 'Épreuves', icon: 'ClipboardList' },
    { id: 'devoirs', label: 'Devoirs', icon: 'BookOpen' },
    { id: 'correction', label: 'Correction', icon: 'PenTool' },
    { id: 'resultats', label: 'Résultats', icon: 'TrendingUp' },
  ],
  ETUDIANT: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
    { id: 'mes-epreuves', label: 'Mes épreuves', icon: 'FileCheck' },
    { id: 'mes-resultats', label: 'Mes résultats', icon: 'Award' },
  ],
}
