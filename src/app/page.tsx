'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { LoginForm } from '@/components/auth/login-form'
import { AppLayout } from '@/components/layout/app-layout'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [initializing, setInitializing] = useState(true)

  // Seed the database on first load
  useEffect(() => {
    const seedDB = async () => {
      try {
        await fetch('/api/seed', { method: 'POST' })
      } catch {
        // Ignore errors - might already be seeded
      } finally {
        setInitializing(false)
      }
    }
    seedDB()
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

  // Show login or app based on auth state
  if (!isAuthenticated) {
    return <LoginForm />
  }

  return <AppLayout />
}
