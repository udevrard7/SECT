'use client'

import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { getEffectiveRole } from '@/lib/routes'
import { QueryErrorBoundary } from '@/components/layout/query-error-boundary'

// ─── Dashboard imports ───
import { AdminDashboard } from '@/components/dashboard/admin-dashboard'
import { ResponsableDashboard } from '@/components/dashboard/responsable-dashboard'
import { EnseignantDashboard } from '@/components/dashboard/enseignant-dashboard'
import { EtudiantDashboard } from '@/components/dashboard/etudiant-dashboard'

// ─── Page component imports ───
import { DocumentsPage } from '@/components/documents/documents-page'
import { GenerationIAPage } from '@/components/epreuves/generation-ia-page'
import { EpreuvesPage } from '@/components/epreuves/epreuves-page'
import { DevoirsPage } from '@/components/devoirs/devoirs-page'
import { MesEpreuvesPage } from '@/components/passation/mes-epreuves-page'
import { MesDevoirsPage } from '@/components/passation/mes-devoirs-page'
import { PassationPage } from '@/components/passation/passation-page'
import { ResultatsPage } from '@/components/resultats/resultats-page'
import { MesResultatsPage } from '@/components/passation/mes-resultats-page'
import { MesCertificatsPage } from '@/components/passation/mes-certificats-page'
import { ExamPrepPage } from '@/components/exam-prep/exam-prep-page'
import { AideEtudiantsPage } from '@/components/enseignant/aide-etudiants-page'
import { MesEtudiantsPage } from '@/components/enseignant/mes-etudiants-page'
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
import { ProgrammeAcademiquePage } from '@/components/responsable/programme-academique-page'
import { AffectationsPage } from '@/components/responsable/affectations-page'
import { AbonnementsPage } from '@/components/admin/abonnements-page'
import { SecuritePage } from '@/components/admin/securite-page'
import { AccesEtablissementsPage } from '@/components/admin/acces-etablissements-page'
import { MonitoringPage } from '@/components/admin/monitoring-page'
import { NotificationsAdminPage } from '@/components/admin/notifications-admin-page'
import { FacturationPage } from '@/components/admin/facturation-page'
import { ProfilPage } from '@/components/profil/profil-page'
import { AIProvidersPage } from '@/components/admin/ai-providers-page'
import { CorbeillePage } from '@/components/corbeille/corbeille-page'
import { SurveillancePage } from '@/components/surveillance/surveillance-page'
import { ResponsableParametresPage } from '@/components/responsable/responsable-parametres-page'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { PageId } from '@/lib/routes'
import { PAGE_LABELS, PAGE_DESCRIPTIONS } from '@/lib/routes'

// ─── Dashboard component mapping per role ───
const DASHBOARD_COMPONENTS: Record<UserRole, React.ComponentType> = {
  ADMIN: AdminDashboard,
  RESPONSABLE: ResponsableDashboard,
  ENSEIGNANT: EnseignantDashboard,
  ETUDIANT: EtudiantDashboard,
}

// ─── Page component registry ───
const PAGE_COMPONENTS: Partial<Record<PageId, React.ComponentType<any>>> = {
  documents: DocumentsPage,
  'questions-ia': GenerationIAPage,
  epreuves: EpreuvesPage,
  devoirs: DevoirsPage,
  'mes-epreuves': MesEpreuvesPage,
  'mes-devoirs': MesDevoirsPage,
  passation: PassationPage,
  correction: CorrectionPage,
  resultats: ResultatsPage,
  'mes-resultats': MesResultatsPage,
  'mes-certificats': MesCertificatsPage,
  'exam-prep': ExamPrepPage,
  'aide-etudiants': AideEtudiantsPage,
  'mes-etudiants': MesEtudiantsPage,
  utilisateurs: UtilisateursPage,
  etablissements: EtablissementsPage,
  configuration: ConfigurationPage,
  logs: LogsPage,
  alertes: AlertesPage,
  rapports: RapportsPage,
  evaluations: EvaluationsPage,
  filieres: FilieresPage,
  etudiants: EtudiantsPage,
  enseignants: EnseignantsPage,
  'programme-academique': ProgrammeAcademiquePage,
  affectations: AffectationsPage,
  abonnements: AbonnementsPage,
  securite: SecuritePage,
  'acces-etablissements': AccesEtablissementsPage,
  monitoring: MonitoringPage,
  notifications: NotificationsAdminPage,
  facturation: FacturationPage,
  'ai-providers': AIProvidersPage,
  profil: ProfilPage,
  corbeille: CorbeillePage,
  surveillance: SurveillancePage,
  parametres: ResponsableParametresPage,
}

// ─── Legacy redirect mappings ───
const LEGACY_REDIRECTS: Partial<Record<PageId, { component: React.ComponentType<any>; props?: any }>> = {
  'banque-epreuves': { component: EpreuvesPage },
  niveaux: { component: ProgrammeAcademiquePage, props: { defaultView: 'overview' } },
  'unites-enseignement': { component: ProgrammeAcademiquePage, props: { defaultView: 'detail' } },
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
//
// BUGFIX (FLICKER-FIX-1) : Suppression du <Suspense fallback={<spinner />}>
// punitif. Quand TanStack Query refetch au focus ou au remontage, le Suspense
// démontait le HTML existant pour afficher un spinner global → flash/clignotement.
// Les pages gèrent déjà leur propre loading via useQuery (isLoading local),
// donc le Suspense global était non seulement inutile mais nuisible.
// Maintenant : la page garde son état visuel (cache TanStack) pendant le
// refetch en arrière-plan. 0 flash, 0 démontage.
export function PageContent({ pageId }: { pageId: PageId }) {
  const { user } = useAuthStore()

  if (!user) return null

  // Dashboard: render role-specific component.
  // ACCESS-ASSISTANCE-FIX : utiliser getEffectiveRole pour qu'un ADMIN en mode
  // assistance (user.etablissementId non null) voie le ResponsableDashboard au
  // lieu du AdminDashboard. Avant, user.role=ADMIN était utilisé tel quel →
  // l'ADMIN en mode assistance voyait le dashboard global (stats plateforme)
  // au lieu du dashboard de l'établissement autorisé.
  if (pageId === 'dashboard') {
    const effectiveRole = getEffectiveRole(user.role, user.etablissementId)
    const DashboardComponent = DASHBOARD_COMPONENTS[effectiveRole]
    return (
      <QueryErrorBoundary>
        <DashboardComponent />
      </QueryErrorBoundary>
    )
  }

  // Check legacy redirects first
  const legacy = LEGACY_REDIRECTS[pageId]
  if (legacy) {
    return (
      <QueryErrorBoundary>
        <legacy.component {...legacy.props} />
      </QueryErrorBoundary>
    )
  }

  // Check main page component registry
  const PageComponent = PAGE_COMPONENTS[pageId]
  if (PageComponent) {
    return (
      <QueryErrorBoundary>
        <PageComponent />
      </QueryErrorBoundary>
    )
  }

  // All other pages: placeholder
  return <PlaceholderPage pageId={pageId} />
}
