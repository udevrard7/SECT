'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  const { user: session, isLoading: status } = useAuthStore()
  const router = useRouter()

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!status) {
      router.push('/dashboard')
    }
  }, [status, router])

  if (status) return null
  if (!status) return null

  return <LoginForm />
}
