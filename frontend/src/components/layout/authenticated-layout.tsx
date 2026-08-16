'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/sidebar'
import { AppHeader } from '@/components/layout/header'
import { SwitchAccountDialog } from '@/components/layout/switch-account-dialog'
import { PageContent } from '@/components/layout/page-content'
import { ForceChangePasswordPage } from '@/components/auth/force-change-password-page'
import { MessagerieBubble } from '@/components/messagerie'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useSidebarModeStore } from '@/stores/sidebar-store'
import { getPageIdFromSlug, PAGE_ALLOWED_ROLES, getEffectiveRole } from '@/lib/routes'
import { useSessionKeepAlive } from '@/hooks/use-session-keepalive'
import { useBackendHealth } from '@/hooks/use-backend-health'
import { Loader2 } from 'lucide-react'

export function AuthenticatedLayout({ slug }: { slug: string[] }) {
  // BUGFIX (ADMIN-AUDIT-1) : `setUser` était utilisé dans le onSuccess de
  // ForceChangePasswordPage (ligne ~62) mais n'était JAMAIS déstructuré du
  // store → ReferenceError silencieuse dans le callback onSuccess →
  // l'utilisateur restait bloqué sur l'écran "Mot de passe modifié !" jusqu'à
  // un rechargement manuel de la page.
  const { user, isAuthenticated, isLoading, hasCheckedSession, mustChangePassword, clearMustChangePassword, refreshSession, setUser } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const sidebarMode = useSidebarModeStore((s) => s.mode)

  // BUGFIX (KEEPALIVE-1) : refresh proactif de la session toutes les 10 min
  // + au refocus de l'onglet. Empêche la déconnexion involontaire pendant
  // l'inactivité (access token 15 min expiré sans refresh) et rend la session
  // résiliente aux erreurs réseau transitoires (cold start Render).
  useSessionKeepAlive()

  // SECT-RESILIENCE-1 : détection de panne backend + mode maintenance.
  // Si le backend Render est down (5 échecs /api/health consécutifs) ou si
  // l'admin a activé maintenanceMode, redirige vers /maintenance pour éviter
  // la page blanche / les loaders infinis.
  useBackendHealth()

  // Hydrater la session au montage si pas déjà authentifié
  useEffect(() => {
    if (!isAuthenticated && !hasCheckedSession) {
      refreshSession()
    }
  }, [isAuthenticated, hasCheckedSession, refreshSession])

  // BUGFIX (REDIRECT-FIX-1) : ne rediriger vers /login QUE si la session a
  // été vérifiée au moins une fois (hasCheckedSession) ET que l'utilisateur
  // n'est pas authentifié. Avant ce fix, la redirection se déclenchait avec
  // l'état initial (isLoading: false, isAuthenticated: false) avant que
  // refreshSession n'ait terminé → flash /login puis retour dashboard.
  useEffect(() => {
    if (hasCheckedSession && !isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [hasCheckedSession, isLoading, isAuthenticated, router])

  // Show loading while session is being checked
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, return null (redirect happening)
  if (!isAuthenticated || !user) {
    return null
  }

  // If user must change password, show forced password change page
  if (mustChangePassword && user) {
    return (
      <ForceChangePasswordPage
        userId={user.id}
        user={user}
        onSuccess={(updatedUser: AuthUser) => {
          if (updatedUser?.id) {
            setUser(updatedUser)
          }
          clearMustChangePassword()
        }}
      />
    )
  }

  // Determine current page from URL slug
  const pageId = getPageIdFromSlug(slug)
  if (!pageId) {
    // Unknown route - redirect to dashboard
    router.push('/dashboard')
    return null
  }

  // OPTION-A : /utilisateurs est 100% redondant avec /etudiants + /enseignants
  // pour le RESPONSABLE (mêmes endpoints /api/users, mêmes actions, mais en moins
  // complet : pas d'export CSV, ni bulk actions, ni recherche avancée). La page
  // reste accessible à l'ADMIN (gestion des responsables d'établissements).
  // Un RESPONSABLE qui tape /utilisateurs directement (bookmark/URL manuelle)
  // est redirigé vers /etudiants plutôt que /dashboard (plus utile).
  if (pageId === 'utilisateurs' && user.role === 'RESPONSABLE') {
    router.replace('/etudiants')
    return null
  }

  // RAPPORTS-FIX-R5 : garde de rôle — redirige vers /dashboard si le rôle
  // de l'utilisateur n'est pas autorisé à voir cette page. Avant : un
  // ENSEIGNANT/ETUDIANT qui tapait /rapports voyait la page se charger puis
  // afficher "Aucune donnée disponible" (API 403 interprétée comme état vide).
  //
  // ACCESS-ASSISTANCE-FIX : utiliser getEffectiveRole pour qu'un ADMIN en mode
  // assistance (user.etablissementId non null) soit traité comme RESPONSABLE.
  // Avant, user.role=ADMIN donnait accès à /acces-etablissements, /monitoring,
  // /logs, /configuration, /notifications même en mode assistance — ce qui est
  // incohérent (l'ADMIN est censé assister un établissement, pas gérer la
  // plateforme). Désormais, ces pages ADMIN-only sont bloquées en mode
  // assistance (l'ADMIN est redirigé vers /dashboard).
  const effectiveRole = getEffectiveRole(user.role, user.etablissementId)
  const allowedRoles = PAGE_ALLOWED_ROLES[pageId]
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    router.push('/dashboard')
    return null
  }

  return (
    <SidebarProvider defaultOpen={sidebarMode === 'expanded'}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <PageContent pageId={pageId} />
        </main>
      </SidebarInset>
      {/* Dialog « Changer de compte » — singleton contrôlé par store, ouvert
          depuis le header (bouton Switch) ou la carte utilisateur de la sidebar. */}
      <SwitchAccountDialog />
      {/* Bulle flottante Messagerie (chat temps réel + IA hybride).
          Unique bulle flottante de l'application (l'Assistant IA flottant a
          été retiré au profit de l'IA intégrée dans la messagerie via les
          conversations IA privées et la mention @assistant dans les salons).
          Ouvre un panneau style Messenger avec liste des conversations +
          zone de chat. Backend : /api/messagerie/* (SSE pour le temps réel).
          MESSAGERIE-ADMIN-BLOCK : le propriétaire PaaS (ADMIN) n'a pas accès
          à la messagerie (réservée aux contextes académiques). */}
      {user.role !== 'ADMIN' && <MessagerieBubble />}
    </SidebarProvider>
  )
}
