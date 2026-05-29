'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { LandingPage } from '@/components/landing/landing-page'
import { LoginForm } from '@/components/auth/login-form'
import { AppLayout } from '@/components/layout/app-layout'
import { Loader2 } from 'lucide-react'

type ViewState = 'landing' | 'login'

export default function Home() {
  const { isAuthenticated } = useAuthStore()
  const [view, setView] = useState<ViewState>('landing')
  const [initializing, setInitializing] = useState(true)

  // Seed the database in background (non-blocking)
  useEffect(() => {
    fetch('/api/seed', { method: 'POST' })
      .catch(() => {})
      .finally(() => setInitializing(false))
  }, [])

  // Show loading while initializing the database
  if (initializing) {
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

  // Show app directly if authenticated (derived state, no useEffect needed)
  if (isAuthenticated) {
    return <AppLayout />
  }

  // Show login form
  if (view === 'login') {
    return <LoginForm onBack={() => setView('landing')} />
  }

  // Show landing page by default
  return (
    <LandingPage
      onLogin={() => setView('login')}
      onDemo={() => setView('login')}
    />
  )
}
