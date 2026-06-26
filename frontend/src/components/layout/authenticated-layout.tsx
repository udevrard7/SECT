'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/sidebar'
import { AppHeader } from '@/components/layout/header'
import { SwitchAccountDialog } from '@/components/layout/switch-account-dialog'
import { PageContent } from '@/components/layout/page-content'
import { ForceChangePasswordPage } from '@/components/auth/force-change-password-page'
import { AIAssistant } from '@/components/ds'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useSidebarModeStore } from '@/stores/sidebar-store'
import { getPageIdFromSlug, PAGE_LABELS } from '@/lib/routes'
import { Loader2 } from 'lucide-react'

export function AuthenticatedLayout({ slug }: { slug: string[] }) {
  const { user, isAuthenticated, isLoading, mustChangePassword, clearMustChangePassword, refreshSession } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const sidebarMode = useSidebarModeStore((s) => s.mode)

  // Hydrater la session au montage si pas déjà authentifié
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      refreshSession()
    }
  }, [isAuthenticated, isLoading, refreshSession])

  // Redirect to login if not authenticated (after session check)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

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

  // Contexte pour l'assistant IA (page courante + rôle)
  const aiContext = {
    page: PAGE_LABELS[pageId] ?? pageId,
    role: user.role,
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
      {/* Assistant IA pédagogique global — bouton flottant cyan (bg-tech)
          visible sur toutes les pages authentifiées. Utilise le système de
          failover IA (Mistral → Groq → OpenRouter) via /api/ai-assistant. */}
      <AIAssistant
        title="Assistant pédagogique"
        suggestions={[
          'Explique-moi un concept du cours',
          'Comment préparer mon examen ?',
          'Analyse mes derniers résultats',
        ]}
        onSend={async (message) => {
          const res = await fetch('/api/ai-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, context: aiContext }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.error ?? `Erreur ${res.status}`)
          }
          const data = await res.json()
          return data.response as string
        }}
      />
      {/* Dialog « Changer de compte » — singleton contrôlé par store, ouvert
          depuis le header (bouton Switch) ou la carte utilisateur de la sidebar. */}
      <SwitchAccountDialog />
    </SidebarProvider>
  )
}
