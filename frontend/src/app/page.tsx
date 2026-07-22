'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { LandingPage } from '@/components/landing/landing-page'
import { Loader2 } from 'lucide-react'

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

function HomeContent() {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  // Redirect to dashboard if authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, user, router])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Chargement…
          </p>
        </div>
      </div>
    )
  }

  // If authenticated, show nothing (redirecting)
  if (isAuthenticated) {
    return null
  }

  // Show landing page for unauthenticated users
  return (
    <LandingPage
      onLogin={() => router.push('/login')}
      onDemo={() => {
        const demoSection = document.getElementById('demo')
        if (demoSection) {
          demoSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }}
      onSignUp={() => router.push('/souscrire-b2c')}
    />
  )
}
