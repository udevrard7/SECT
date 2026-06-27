'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useAuthStore, type UserRole } from '@/stores/auth-store'

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
// BUGFIX (KEEPALIVE-PAGES-1) : avant ce cache, chaque navigation entre pages
// démontait le composant actif et remontait le nouveau. Le composant remonté
// perdait son state (liste, filtres, position scroll) et refetchait
// systématiquement (useEffect au montage) → flash de skeleton + requêtes
// API redondantes → mauvaise UX ("boucle d'actualisation").
//
// Solution : cache keep-alive des pages déjà visitées. Les composants restent
// montés en arrière-plan (display:none) et retrouvent leur state intact quand
// on revient. Le cache est limité à MAX_CACHED_PAGES pour éviter une fuite
// mémoire. Les pages non visitées sont rendered lazily au 1er accès.
//
// Bénéfice : navigation instantanée entre pages déjà visitées, 0 refetch, 0
// flash de skeleton. Les données restent fraîches car les pages qui ont un
// polling (documents, surveillance) continuent de poller en arrière-plan.
const MAX_CACHED_PAGES = 8

export function PageContent({ pageId }: { pageId: PageId }) {
  const { user } = useAuthStore()
  // Cache des pages déjà montées (key = pageId). On garde l'ordre LRU pour
  // évicter la plus ancienne quand on dépasse MAX_CACHED_PAGES.
  const cacheRef = useRef<Map<PageId, { el: React.ReactElement; lastUsed: number }>>(new Map())
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!user) return
    const cache = cacheRef.current
    // Marquer la page courante comme utilisée (LRU)
    if (cache.has(pageId)) {
      cache.get(pageId)!.lastUsed = Date.now()
    }
    // Évicter la plus ancienne si dépassement
    if (cache.size > MAX_CACHED_PAGES) {
      let oldestKey: PageId | null = null
      let oldestTime = Infinity
      for (const [k, v] of cache) {
        if (k !== pageId && v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed
          oldestKey = k
        }
      }
      if (oldestKey) cache.delete(oldestKey)
    }
    forceUpdate((n) => n + 1)
  }, [pageId, user])

  if (!user) return null

  const cache = cacheRef.current

  // Dashboard : pas de cache (dépend du rôle, peut changer)
  if (pageId === 'dashboard') {
    const DashboardComponent = DASHBOARD_COMPONENTS[user.role]
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <DashboardComponent />
      </Suspense>
    )
  }

  // Legacy redirects
  const legacy = LEGACY_REDIRECTS[pageId]
  if (legacy) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <legacy.component {...legacy.props} />
      </Suspense>
    )
  }

  // Page enregistrée : rendre + mettre en cache
  const PageComponent = PAGE_COMPONENTS[pageId]
  if (PageComponent) {
    // Si pas encore en cache, l'ajouter
    if (!cache.has(pageId)) {
      cache.set(pageId, {
        el: (
          <Suspense fallback={<PageLoadingFallback />}>
            <PageComponent />
          </Suspense>
        ),
        lastUsed: Date.now(),
      })
    } else {
      cache.get(pageId)!.lastUsed = Date.now()
    }

    // Render toutes les pages cachées, masquer les non-courantes (display:none)
    // pour préserver leur state + leurs intervals/polling.
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
      </>
    )
  }

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
