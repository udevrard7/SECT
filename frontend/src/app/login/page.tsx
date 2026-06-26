'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, user, router])

  // Si déjà authentifié, ne pas afficher le formulaire
  if (isAuthenticated) return null

  // Sinon, afficher le formulaire de connexion
  return <LoginForm />
}
