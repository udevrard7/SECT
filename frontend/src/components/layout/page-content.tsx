'use client'

import { Suspense } from 'react'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { usePageCache } from '@/components/layout/page-cache-provider'

// ─── Dashboard imports ───
import { AdminDashboard } from '@/components/dashboard/admin-dashboard'
import { ResponsableDashboard } from '@/components/dashboard/responsable-dashboard'
import { EnseignantDashboard } from '@/components/dashboard/enseignant-dashboard'
import { EtudiantDashboard } from '@/components/dashboard/etudiant-dashboard'

// ─── Page component imports ───
import { DocumentsPage } from '@/components/documents/documents-page'
import { GenerationIAPage } from '@/components/epreuves/generation-ia-page'
import { QuestionsIAPage } from '@/components/questions/questions-ia-page'
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
// BUGFIX (KEEPALIVE-PAGES-1) : cache keep-alive des pages via PageCacheProvider
// (au niveau Providers, qui ne se remonte jamais). Les pages déjà visitées
// restent montées en display:none et retrouvent leur state intact au retour
// → 0 refetch, 0 flash de skeleton, navigation instantanée.
export function PageContent({ pageId }: { pageId: PageId }) {
  const { user } = useAuthStore()
  const { cache, touch } = usePageCache()

  // Dashboard : pas de cache (dépend du rôle)
  if (pageId === 'dashboard') {
    if (!user) return null
    const DashboardComponent = DASHBOARD_COMPONENTS[user.role]
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <DashboardComponent />
      </Suspense>
    )
  }

  // Legacy redirects (pas de cache)
  const legacy = LEGACY_REDIRECTS[pageId]
  if (legacy) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <legacy.component {...legacy.props} />
      </Suspense>
    )
  }

  // Page enregistrée : cache keep-alive
  const PageComponent = PAGE_COMPONENTS[pageId]
  if (PageComponent && user) {
    // Si pas en cache, l'ajouter (crée l'élément React une seule fois).
    // touch déclenche un re-render, mais on rend aussi el directement pour
    // ce cycle (pas de flash).
    if (!cache.has(pageId)) {
      touch(pageId, () => (
        <Suspense fallback={<PageLoadingFallback />}>
          <PageComponent />
        </Suspense>
      ))
    } else {
      // Page déjà en cache : juste update lastUsed (LRU)
      touch(pageId)
    }

    // Élément à rendre pour ce cycle : soit depuis le cache, soit fraîchement créé
    const el = cache.get(pageId)?.el ?? (
      <Suspense fallback={<PageLoadingFallback />}>
        <PageComponent />
      </Suspense>
    )

    // Render toutes les pages cachées, masquer les non-courantes (display:none)
    return (
      <>
        {Array.from(cache.entries()).map(([k, v]) => (
          <div
            key={k}
            style={k === pageId ? undefined : { display: 'none' }}
            aria-hidden={k !== pageId}
          >
            {v.el}
          </div>
        ))}
        {/* Si la page courante n'est pas encore dans le cache (1er render
            avant que touch soit appliqué), la rendre directement */}
        {!cache.has(pageId) && el}
      </>
    )
  }

  if (!user) return null

  // Placeholder
  return <PlaceholderPage pageId={pageId} />
}

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  )
}
