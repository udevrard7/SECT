'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/sidebar'
import { AppHeader } from '@/components/layout/header'
import { PageContent } from '@/components/layout/page-content'
import { ForceChangePasswordPage } from '@/components/auth/force-change-password-page'
import { AIAssistant } from '@/components/ds'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useSidebarModeStore } from '@/stores/sidebar-store'
import { getPageIdFromSlug, PAGE_LABELS } from '@/lib/routes'
import { Loader2 } from 'lucide-react'

export function AuthenticatedLayout({ slug }: { slug: string[] }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { user, mustChangePassword, clearMustChangePassword, syncFromSession, setUser } = useAuthStore()
  // Mode de sidebar persisté — sert à initialiser `defaultOpen` du provider
  // pour éviter un flash au rechargement (le cookie shadcn n'est pas relu à
  // l'init). Hook appelé avant les early returns pour respecter les Rules of
  // Hooks.
  const sidebarMode = useSidebarModeStore((s) => s.mode)

  // Sync session data to auth store
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      if (!user || user.id !== session.user.id) {
        syncFromSession(session)
      }
    } else if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [session, status, router, syncFromSession, user])

  // Show loading while session is being checked
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, redirect to login
  if (status === 'unauthenticated' || !user) {
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
    </SidebarProvider>
  )
}
