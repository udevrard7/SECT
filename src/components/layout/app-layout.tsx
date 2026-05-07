'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AppSidebar } from '@/components/layout/sidebar'
import { AppHeader } from '@/components/layout/header'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { useNavigationStore, type PageId } from '@/stores/navigation-store'

// ─── Dashboard imports ───
import { AdminDashboard } from '@/components/dashboard/admin-dashboard'
import { ResponsableDashboard } from '@/components/dashboard/responsable-dashboard'
import { EnseignantDashboard } from '@/components/dashboard/enseignant-dashboard'
import { EtudiantDashboard } from '@/components/dashboard/etudiant-dashboard'

// ─── Page component imports ───
import { DocumentsPage } from '@/components/documents/documents-page'
import { BanqueQuestionsPage } from '@/components/questions/banque-questions-page'
import { QuestionsIAPage } from '@/components/questions/questions-ia-page'
import { EpreuvesPage } from '@/components/epreuves/epreuves-page'
import { MesEpreuvesPage } from '@/components/passation/mes-epreuves-page'
import { PassationPage } from '@/components/passation/passation-page'
import { ResultatsPage } from '@/components/epreuves/resultats-page'
import { MesResultatsPage } from '@/components/passation/mes-resultats-page'
import { CorrectionPage } from '@/components/correction/correction-page'
import { UtilisateursPage } from '@/components/utilisateurs/utilisateurs-page'
import { EtablissementsPage } from '@/components/etablissements/etablissements-page'
import { ConfigurationPage } from '@/components/configuration/configuration-page'
import { LogsPage } from '@/components/logs/logs-page'
import { AlertesPage } from '@/components/alertes/alertes-page'
import { RapportsPage } from '@/components/rapports/rapports-page'
import { EvaluationsPage } from '@/components/evaluations/evaluations-page'
import { FilieresPage } from '@/components/filieres/filieres-page'
import { EtudiantsPage } from '@/components/responsable/etudiants-page'
import { EnseignantsPage } from '@/components/responsable/enseignants-page'

// ─── Dashboard component mapping per role ───
const DASHBOARD_COMPONENTS: Record<UserRole, React.ComponentType> = {
  ADMIN: AdminDashboard,
  RESPONSABLE: ResponsableDashboard,
  ENSEIGNANT: EnseignantDashboard,
  ETUDIANT: EtudiantDashboard,
}

// ─── Page labels for placeholder cards ───
const PAGE_LABELS: Record<PageId, string> = {
  dashboard: 'Tableau de bord',
  utilisateurs: 'Gestion des utilisateurs',
  etablissements: 'Gestion des établissements',
  configuration: 'Configuration du système',
  logs: 'Journaux d\'audit',
  filieres: 'Gestion des filières',
  etudiants: 'Gestion des étudiants',
  enseignants: 'Gestion des enseignants',
  evaluations: 'Gestion des évaluations',
  rapports: 'Rapports et statistiques',
  alertes: 'Alertes et notifications',
  documents: 'Gestion des documents',
  'questions-ia': 'Génération de questions IA',
  'banque-questions': 'Banque de questions',
  epreuves: 'Gestion des épreuves',
  correction: 'Correction des copies',
  resultats: 'Résultats et analyses',
  'mes-epreuves': 'Mes épreuves',
  'mes-resultats': 'Mes résultats',
  passation: 'Passation d\'épreuve',
}

// ─── Page descriptions for placeholder cards ───
const PAGE_DESCRIPTIONS: Record<PageId, string> = {
  dashboard: 'Vue d\'ensemble de votre espace',
  utilisateurs: 'Créer, modifier et gérer les comptes utilisateurs',
  etablissements: 'Administrer les établissements partenaires',
  configuration: 'Paramétrer le fonctionnement de la plateforme',
  logs: 'Consulter les journaux d\'activité du système',
  filieres: 'Organiser les filières et formations',
  etudiants: 'Gérer les étudiants et leurs inscriptions',
  enseignants: 'Gérer les enseignants et leurs affectations',
  evaluations: 'Planifier et suivre les évaluations',
  rapports: 'Consulter les rapports et statistiques détaillés',
  alertes: 'Voir les alertes et notifications importantes',
  documents: 'Importer et gérer vos documents pédagogiques',
  'questions-ia': 'Générer des questions automatiquement avec l\'IA',
  'banque-questions': 'Parcourir et gérer la banque de questions',
  epreuves: 'Créer et organiser les épreuves d\'évaluation',
  correction: 'Corriger les copies et attribuer les notes',
  resultats: 'Consulter les résultats et les analyses',
  'mes-epreuves': 'Voir les épreuves programmées et passées',
  'mes-resultats': 'Consulter vos notes et résultats',
  passation: 'Passer une épreuve en ligne',
}

// ─── Placeholder page component ───
function PlaceholderPage({ pageId }: { pageId: PageId }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{PAGE_LABELS[pageId]}</CardTitle>
          <CardDescription>{PAGE_DESCRIPTIONS[pageId]}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Cette section est en cours de développement.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main content router ───
function PageContent() {
  const { currentPage } = useNavigationStore()
  const { user } = useAuthStore()

  if (!user) return null

  // Dashboard: render role-specific component
  if (currentPage === 'dashboard') {
    const DashboardComponent = DASHBOARD_COMPONENTS[user.role]
    return <DashboardComponent />
  }

  // Documents page
  if (currentPage === 'documents') {
    return <DocumentsPage />
  }

  // Questions IA page
  if (currentPage === 'questions-ia') {
    return <QuestionsIAPage />
  }

  // Banque de questions page
  if (currentPage === 'banque-questions') {
    return <BanqueQuestionsPage />
  }

  // Épreuves page (teacher)
  if (currentPage === 'epreuves') {
    return <EpreuvesPage />
  }

  // Mes épreuves page (student)
  if (currentPage === 'mes-epreuves') {
    return <MesEpreuvesPage />
  }

  // Passation page (full-screen exam)
  if (currentPage === 'passation') {
    return <PassationPage />
  }

  // Correction page (teacher)
  if (currentPage === 'correction') {
    return <CorrectionPage />
  }

  // Résultats & Analyses page (teacher)
  if (currentPage === 'resultats') {
    return <ResultatsPage />
  }

  // Mes résultats page (student)
  if (currentPage === 'mes-resultats') {
    return <MesResultatsPage />
  }

  // Admin: Utilisateurs page
  if (currentPage === 'utilisateurs') {
    return <UtilisateursPage />
  }

  // Admin: Etablissements page
  if (currentPage === 'etablissements') {
    return <EtablissementsPage />
  }

  // Admin: Configuration page
  if (currentPage === 'configuration') {
    return <ConfigurationPage />
  }

  // Admin: Logs page
  if (currentPage === 'logs') {
    return <LogsPage />
  }

  // Responsable: Alertes page
  if (currentPage === 'alertes') {
    return <AlertesPage />
  }

  // Responsable: Rapports page
  if (currentPage === 'rapports') {
    return <RapportsPage />
  }

  // Responsable: Evaluations page
  if (currentPage === 'evaluations') {
    return <EvaluationsPage />
  }

  // Responsable: Filieres page
  if (currentPage === 'filieres') {
    return <FilieresPage />
  }

  // Responsable: Etudiants page
  if (currentPage === 'etudiants') {
    return <EtudiantsPage />
  }

  // Responsable: Enseignants page
  if (currentPage === 'enseignants') {
    return <EnseignantsPage />
  }

  // All other pages: placeholder
  return <PlaceholderPage pageId={currentPage} />
}

// ─── App layout ───
export function AppLayout() {
  const { isAuthenticated } = useAuthStore()

  // If not authenticated, show nothing (page.tsx handles login)
  if (!isAuthenticated) return null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <PageContent />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
