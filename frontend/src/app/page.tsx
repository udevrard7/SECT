'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { LandingPage } from '@/components/landing/landing-page'
import { DesignSystemShowcase } from '@/components/ds'
import { Loader2 } from 'lucide-react'

/**
 * Home — Page racine publique (landing + login + redirect si auth).
 *
 * Wrapper qui enveloppe le contenu dans un <Suspense> car le sous-composant
 * HomeContent utilise useSearchParams() (mode preview DS). Next.js exige
 * un Suspense boundary autour de useSearchParams pour permettre le
 * prerendering statique de la page.
 *
 * Le fallback (Loader2) s'affiche pendant la résolution des search params
 * (quasi instantané côté client).
 */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Chargement…
            </p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}

/**
 * HomeContent — Contenu réel de la page (utilise useSearchParams).
 *
 * Doit rester dans un Suspense boundary (cf. Home) car useSearchParams()
 * force le rendu côté client. Sans Suspense, Next.js refuse de prerender
 * la page et le build échoue (CSR bailout).
 */
function HomeContent() {
  const { user: session, isLoading: status } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initializing, setInitializing] = useState(true)

  // ── Preview mode : ?preview=ds affiche la showcase du Design System ──
  // Non-destructif : la landing/login reste par défaut. Permet de
  // visualiser les 14 composants DS sans casser l'expérience utilisateur.
  const isDsPreview = searchParams.get('preview') === 'ds'

  // Seed the database in background (non-blocking)
  useEffect(() => {
    fetch('/api/seed', { method: 'POST' })
      .catch(() => {})
      .finally(() => setInitializing(false))
  }, [])

  // Redirect to dashboard if authenticated (sauf en mode preview DS)
  useEffect(() => {
    if (!status && !isDsPreview) {
      router.push('/dashboard')
    }
  }, [status, router, isDsPreview])

  // Preview Design System : court-circuite tout le reste
  if (isDsPreview) {
    return <DesignSystemShowcase />
  }

  // Show loading while initializing the database
  if (initializing || status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Initialisation de la plateforme...
          </p>
        </div>
      </div>
    )
  }

  // If authenticated, redirecting (show nothing while redirect happens)
  if (!status) {
    return null
  }

  // Show landing page for unauthenticated users
  return (
    <LandingPage
      onLogin={() => router.push('/login')}
      onDemo={() => router.push('/login')}
    />
  )
}
