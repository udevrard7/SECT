'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LandingPage } from '@/components/landing/landing-page'
import { DesignSystemShowcase } from '@/components/ds'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { data: session, status } = useSession()
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
    if (status === 'authenticated' && !isDsPreview) {
      router.push('/dashboard')
    }
  }, [status, router, isDsPreview])

  // Preview Design System : court-circuite tout le reste
  if (isDsPreview) {
    return <DesignSystemShowcase />
  }

  // Show loading while initializing the database
  if (initializing || status === 'loading') {
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
  if (status === 'authenticated') {
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
